import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { queryAt, queryNode, queryFree, suggest, suggestMany } from '../src/query.js';
import { formatAt, formatNode, formatFree, formatSuggest, formatSuggestMany } from '../src/query-format.js';
import { applyOps, checkCircuit, formatIssue } from '../src/index.js';

const example = (name) => JSON.parse(readFileSync(new URL(`../examples/${name}`, import.meta.url), 'utf8'));
const led = example('led-resistor.json');

test('at: who is in a hole and what else is in its group', () => {
  const r = queryAt(led, 'H9');
  assert.equal(r.hole, 'h9');
  assert.equal(r.node, '9:f-j');
  assert.deepEqual(r.occupant, { part: 'R1', pin: '2' });
  assert.deepEqual(r.group.free, ['j9', 'i9', 'g9']);
  assert.equal(queryAt(led, 'z99').exists, false);
});

test('node: by name or by any of its holes, with the rail label', () => {
  const byName = queryNode(led, 'T-');
  assert.equal(byName.label, 'GND');
  assert.equal(byName.holes.length, 50);
  assert.deepEqual(byName.used, [{ hole: 'T-10', part: 'W1', pin: '2' }]);
  assert.deepEqual(queryNode(led, 'j10').used.map((u) => u.part).sort(), ['D1', 'W1']);
});

test('free: nearest free holes first, optionally only in empty groups', () => {
  const r = queryFree(led, { near: 'f10', limit: 3 });
  assert.equal(r.total, 830 - 6);
  assert.ok(r.holes[0].distance <= r.holes[2].distance);
  assert.ok(queryFree(led, { near: 'f10', emptyNodes: true }).holes.every((h) => h.emptyNode));
});

test('suggest: placements connect the asked groups and add no errors or warnings', () => {
  const r = suggest(led, { type: 'resistor', value: '1k' }, { between: ['10:f-j', 'T-'] });
  assert.equal(r.id, 'R2');
  assert.ok(r.placements.length > 0);
  for (const p of r.placements) {
    assert.deepEqual(p.nodes, ['10:f-j', 'T-']);
    const { circuit } = applyOps(led, p.ops);
    const issues = checkCircuit(circuit).issues.filter((i) => i.severity !== 'info');
    assert.deepEqual(issues, [], JSON.stringify(p.pins));
  }
  for (let i = 1; i < r.placements.length; i++) assert.ok(r.placements[i - 1].score <= r.placements[i].score);
});

test('suggest: three-lead parts face the front and need free neighbouring strips', () => {
  const ok = suggest(led, { type: 'mosfet', part: 'IRLZ44N' }, { connect: { D: 'h20' } });
  assert.deepEqual(ok.placements[0].pins.map((h) => h.slice(1)), ['19', '20', '21'], 'pin 1 on the left: print towards the front view');
  const blocked = suggest(led, { type: 'mosfet', part: 'IRLZ44N' }, { connect: { D: '10:f-j' }, via: false });
  assert.equal(blocked.placements.length, 0, 'strip 9 is in use, so G has nowhere to go');
  assert.equal(blocked.hint.code, 'NO_PLACEMENT');
  // With the detour (default) it goes in free strips, joined to strip 10 by a jumper.
  const detour = suggest(led, { type: 'mosfet', part: 'IRLZ44N' }, { connect: { D: '10:f-j' } });
  assert.equal(detour.placements[0].notes[0].code, 'VIA_WIRE');
  assert.equal(detour.placements[0].ops.length, 2);
  const rail = suggest(led, { type: 'mosfet', part: 'IRLZ44N' }, { connect: { S: 'T-' } });
  assert.equal(rail.hint.code, 'NO_PLACEMENT_RAIL');
});

test('suggest: bad requests come back as readable errors', () => {
  assert.equal(suggest(led, { type: 'warp-core' }).error.code, 'UNKNOWN_TYPE');
  assert.equal(suggest(led, { type: 'resistor', value: '1k' }, { connect: { gate: 'h20' } }).error.code, 'UNKNOWN_PIN');
  assert.equal(suggest(led, { type: 'resistor', value: '1k' }, { between: ['h20', 'zz'] }).error.code, 'UNKNOWN_HOLE');
});

test('text output fills every placeholder in both languages', () => {
  const s = suggest(led, { type: 'led', color: 'green' }, { near: 'h30', limit: 2 });
  for (const lang of ['en', 'es']) {
    const text = [
      formatAt(queryAt(led, 'h9'), lang),
      formatNode(queryNode(led, 'T-'), lang),
      formatFree(queryFree(led, { near: 'h9', limit: 3 }), lang),
      formatSuggest(s, lang, { formatIssue, target: 'x.json' }),
    ].join('\n');
    assert.doesNotMatch(text, /\{\w+\}/);
  }
});

test('a group can be named by a pin already placed', () => {
  assert.equal(queryNode(led, 'R1.2').node, '9:f-j');
  assert.equal(queryNode(led, 'D1.ANODE').node, '9:f-j');
  assert.equal(queryNode(led, 'R9.1').exists, false);
});

test('suggest: the nearest body per placement; a profile leaves out what review would block', () => {
  const spread = { ...led, clearance: 3 };
  const plain = suggest(spread, { type: 'resistor', value: '1k' }, { between: ['D1.cathode', 'T-'] });
  assert.ok(plain.placements.every((p) => p.nearest && p.nearest.gap >= 0));
  const lesson = suggest(spread, { type: 'resistor', value: '1k' }, { between: ['D1.cathode', 'T-'], profile: 'lesson' });
  assert.equal(lesson.profile, 'lesson');
  for (const p of lesson.placements) assert.ok(!p.notes.some((n) => n.code === 'TOO_CLOSE'), JSON.stringify(p.notes));
  assert.ok(lesson.placements.every((p) => p.nearest.gap >= 3));
  assert.equal(suggest(led, { type: 'resistor' }, { profile: 'strict' }).error.code, 'UNKNOWN_PROFILE');
});

test('suggest measures more candidates while the first ones all fail', () => {
  // Every short jumper from strip 10 (f–j) to B+ crosses the bridge standing in row f.
  const r = suggest(example('rectifier.json'), { type: 'wire', color: 'red' }, { between: ['10:f-j', 'B+'], limit: 1 });
  assert.equal(r.placements.length, 1, JSON.stringify(r.hint));
  assert.ok(r.considered > 12);
});

test('suggestMany places parts in order, later ones naming earlier pins, as one batch', () => {
  const r = suggestMany(led, [
    { part: { type: 'led', color: 'green' }, between: ['20:f-j', '21:f-j'] },
    { part: { type: 'resistor', value: '330' }, between: ['D2.cathode', 'T-'] },
    { part: { type: 'flux-capacitor' } },
  ]);
  assert.deepEqual(r.placed.map((p) => p.id), ['D2', 'R2']);
  assert.equal(r.failed[0].problem.code, 'UNKNOWN_TYPE');
  assert.equal(r.ops.length, 2);
  const { circuit, errors } = applyOps(led, r.ops);
  assert.deepEqual(errors, []);
  assert.ok(!checkCircuit(circuit).issues.some((i) => i.severity !== 'info'));
  assert.match(formatSuggestMany(r, 'es', { formatIssue }), /2 colocados, 1 no/);
});

test('a hole that is not on the board names the nearest ones; free with an unknown centre is an error', () => {
  const half = { version: 1, board: 'bb400', parts: [] };
  const r = suggest(half, { type: 'resistor', value: '1k' }, { between: ['B-7', 'a10'] });
  assert.equal(r.error.code, 'UNKNOWN_HOLE');
  assert.equal(r.error.params.nearest, 'B-6, B-8');
  assert.match(formatIssue(r.error, 'es'), /B-6, B-8/);
  assert.deepEqual(queryAt(half, 'B-7').nearest, ['B-6', 'B-8']);
  const free = queryFree(half, { near: 'B-38' });
  assert.equal(free.exists, false);
  assert.match(formatFree(free, 'en'), /B-30/);
});

test('board layout: columns, the rails beside each strip, and the rail columns with gaps', async () => {
  const { boardLayout, createBoard } = await import('../src/board/board.js');
  const { formatBoardLayout } = await import('../src/board/layout-text.js');
  const layout = boardLayout(createBoard('bb400'));
  assert.equal(layout.columns, 30);
  assert.equal(layout.railColumns, '2–6, 8–12, 14–18, 20–24, 26–30');
  assert.deepEqual(layout.strips.map((s) => [s.rows, s.rails.sort()]), [['a–e', ['B+', 'B-']], ['f–j', ['T+', 'T-']]]);
  assert.doesNotMatch(formatBoardLayout(layout, 'es'), /\{\w+\}/);
});

test('suggest keeps room: a group named in reserve keeps that many usable holes, and says why when it cannot', () => {
  const r = suggest(led, { type: 'resistor', value: '1k' }, { connect: { 1: '10:f-j' }, reserve: { '10:f-j': 5 } });
  assert.equal(r.placements.length, 0);
  assert.equal(r.hint.code, 'NO_PLACEMENT');
  assert.equal(r.hint.reasons[0].code, 'NO_ROOM_LEFT');
  assert.match(formatSuggest(r, 'es', { formatIssue }), /Por qué se descartaron/);
  // Without the reservation the same part fits.
  assert.ok(suggest(led, { type: 'resistor', value: '1k' }, { connect: { 1: '10:f-j' } }).placements.length > 0);
});

test('suggest places a switch beside the board: one hole per contact, pins by name', () => {
  const r = suggest(led, { type: 'switch', id: 'S1' }, { connect: { 1: '10:f-j' } });
  assert.ok(r.placements.length > 0);
  const pins = r.placements[0].ops[0].part.pins;
  assert.deepEqual(Object.keys(pins), ['1', '2']);
  assert.equal(r.placements[0].nodes[0], '10:f-j');
  assert.equal(checkCircuit(applyOps(led, r.placements[0].ops).circuit).issues.filter((i) => i.severity === 'error').length, 0);
});

test('suggestMany: a part that hangs from one that failed says so', () => {
  const r = suggestMany(led, [
    { part: { id: 'R9', type: 'resistor', value: '1k' }, between: ['zz1', 'T-'] },
    { part: { id: 'D9', type: 'led', color: 'red' }, between: ['R9.2', 'T-'] },
  ]);
  assert.equal(r.failed[1].problem.code, 'DEPENDS_ON_FAILED');
  assert.equal(r.failed[1].problem.params.other, 'R9');
});

test('between with null leaves that lead to a free strip', () => {
  const r = suggest(led, { type: 'resistor', value: '1k' }, { between: ['10:f-j', null] });
  assert.ok(r.placements.length > 0);
  assert.equal(r.placements[0].nodes[0], '10:f-j');
});

test('set refuses fields the part type does not have, and explains the field/value mix-up', () => {
  const wrong = applyOps(led, [{ op: 'set', part: 'D1', field: 'description', value: { es: 'x' } }]);
  assert.equal(wrong.errors[0].code, 'OP_SET_FORM');
  assert.match(formatIssue(wrong.errors[0], 'es'), /"description"/);
  assert.equal(applyOps(led, [{ op: 'set', part: 'D1', colour: 'red' }]).errors[0].code, 'OP_UNKNOWN_FIELD');
  assert.equal(applyOps(led, [{ op: 'set', part: 'D1', description: { es: 'x', en: 'y' } }]).errors.length, 0);
});

test('elastic board: as long as the circuit needs, the cross-section and the holes it has never move', async () => {
  const { createBoard } = await import('../src/board/board.js');
  const { buildCircuit } = await import('../src/circuit/build.js');
  const base = createBoard('auto');
  assert.equal(base.spec.columns, 30);
  const long = createBoard('auto', { columns: 44 });
  assert.equal(long.spec.columns, 48);
  for (const h of ['a1', 'j30', 'B-26', 'T+29']) assert.deepEqual(long.find(h).pos, base.find(h).pos);
  assert.equal(long.find('T-2').node, long.find('T-48').node, 'each rail is one group');
  assert.equal(long.spec.size.width, base.spec.size.width);
  // A part past column 30 grows the board; suggest sees room past the last column.
  const circuit = { version: 1, board: 'auto', parts: [{ id: 'R1', type: 'resistor', value: '1k', pins: ['a40', 'a44'] }] };
  assert.equal(buildCircuit(circuit).board.spec.columns, 48);
  assert.equal(checkCircuit(circuit).issues.filter((i) => i.severity === 'error').length, 0);
  const r = suggest(circuit, { type: 'resistor', value: '1k' }, { near: 'a52' });
  assert.ok(r.placements.length > 0);
});
