// The double board: two breadboards side by side, inner rails taken off, so a development board can
// straddle the joint with a free strip under each header (src/board/board.js, doubleBoard).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createBoard, boardLayout, boardSides, channelPairs, BOARDS, parseHole, railName } from '../src/board/board.js';
import { devboardHoles } from '../src/parts/packages/devboard.js';
import { buildCircuit } from '../src/circuit/build.js';
import { autoLayout } from '../src/layout.js';
import { expandRecipe } from '../src/recipes/index.js';
import { renderCircuit, checkCircuit } from '../src/index.js';
import { MODULES } from '../src/parts/modules.js';
import { drawBoard } from '../src/board/draw-board.js';

const spec = (name) => JSON.parse(readFileSync(new URL(`../examples/layout/${name}.json`, import.meta.url), 'utf8'));

test('double board: rows k–t behind a–j, four strips, rails U and B, every rail continuous', () => {
  const board = createBoard('double');
  const rows = board.spec.rows.map((r) => r.id).sort().join('');
  assert.equal(rows, 'abcdefghijklmnopqrst');
  assert.equal(board.holes.size, 20 * 30 + 4 * 25, '20 rows of 30 columns, four rails of 25 holes');
  assert.equal(createBoard('bb830x2').holes.size, 20 * 63 + 4 * 50);
  assert.deepEqual(board.spec.rails.map((r) => r.id), ['U-', 'U+', 'B-', 'B+']);
  assert.equal(board.find('k12').node, '12:k-o');
  assert.equal(board.find('o12').node, '12:k-o');
  assert.equal(board.find('p12').node, '12:p-t');
  assert.notEqual(board.find('j12').node, board.find('k12').node, 'the joint is not a strip');
  assert.notEqual(board.find('o12').node, board.find('p12').node, 'the back board has its own channel');
  assert.equal(board.find('U-5').node, 'U-');
  assert.equal(board.find('u+5').id, 'U+5');
  assert.equal(board.find('U-2').node, board.find('U-30').node);
  assert.equal(board.find('T+3'), undefined, 'the T rails are the ones taken off');
  assert.equal(board.find('v3'), undefined);
  // From back to front: U- U+ t…p | o…k · joint · j…f | e…a B- B+, on one 0.1" lattice.
  const y = (id) => board.find(id).pos.y;
  const P = board.pitch;
  assert.ok(y('U-3') > y('U+3') && y('U+3') > y('t3') && y('p3') > y('o3') && y('k3') > y('j3') && y('a3') > y('B-3'));
  assert.ok(Math.abs(y('k3') - y('j3') - 2 * P) < 1e-9, 'one empty pitch between rows j and k (junction 1)');
  assert.ok(Math.abs(y('p3') - y('o3') - 3 * P) < 1e-9, 'the back board keeps its channel');
  for (const r of board.spec.rows) assert.ok(Number.isInteger(r.y));
  assert.equal(board.spec.junction.gap, 1);
  assert.equal(BOARDS.double.size.width.toFixed(2), (54.6 + 13 * 2.54).toFixed(2), 'two boards without the rail strips between them');
});

test('double board: layout text, sides, channels and hole names', () => {
  const board = createBoard('double');
  const layout = boardLayout(board);
  assert.equal(layout.junction, 'j–k');
  assert.deepEqual(layout.strips.map((s) => [s.rows, s.rails]), [['a–e', ['B-', 'B+']], ['f–j', []], ['k–o', []], ['p–t', ['U-', 'U+']]]);
  const sides = boardSides(board.spec);
  assert.deepEqual(sides.order, ['B', 'T', 'K', 'U']);
  assert.deepEqual(sides.outward.U, ['t', 's', 'r', 'q', 'p'], 'from the U rails inwards');
  assert.deepEqual(sides.outward.K, ['k', 'l', 'm', 'n', 'o'], 'from the joint inwards');
  assert.ok(sides.behind.has('U') && !sides.behind.has('B'));
  assert.deepEqual(channelPairs(board.spec), [{ back: 'f', front: 'e' }, { back: 'p', front: 'o' }]);
  assert.deepEqual(boardSides(createBoard('bb830').spec).order, ['B', 'T']);
  assert.deepEqual(parseHole('K12'), { row: 'k', col: 12 });
  assert.deepEqual(parseHole('u-5'), { row: 'U-', col: 5 });
  assert.equal(parseHole('12k'), null);
  assert.equal(railName(' u+ '), 'U+');
});

// Rows of a pin's strip outside the PCB of a board placed with pin 1 there (its box seen from above).
function freeRows(rowSpacing, pin1) {
  const circuit = { version: 1, board: 'double', parts: [{ id: 'U1', type: 'module', part: 'ESP32-DEVKIT', pin1, rowSpacing }] };
  const built = buildCircuit(circuit);
  assert.deepEqual(built.issues.filter((i) => i.severity === 'error'), []);
  const u1 = built.parts[0];
  const ys = u1.built.body.flatMap((prim) => prim.faces.flatMap((f) => f.pts.map((q) => q.y)));
  const [y0, y1] = [Math.min(...ys), Math.max(...ys)];
  const half = MODULES['ESP32-DEVKIT'].pins.length / 2;
  return [u1.holes[0], u1.holes[half]].map((h) => {
    const rows = [...built.board.holes.values()].filter((o) => o.node === h.node && (o.pos.y < y0 - 0.55 || o.pos.y > y1 + 0.55)).map((o) => o.row);
    return { node: h.node, rows: [...new Set(rows)] };
  });
}

test('double board: a DevKit 9, 10 or 11 holes wide across the joint keeps a free row on each header', () => {
  const board = createBoard('double');
  assert.deepEqual(devboardHoles(board, 'j5', { count: 30, rowSpacing: 9 }).slice(14, 16), ['j19', 'p19'], 'pin 1 in row j: the other row is p, on the back board');
  for (const [spacing, pin1] of [[9, 'j5'], [10, 'j5'], [10, 'i5'], [11, 'h5']]) {
    const [front, back] = freeRows(spacing, pin1);
    assert.match(front.node, /:f-j$/, `${spacing}: front header on the front board`);
    assert.match(back.node, /:p-t$/, `${spacing}: back header on the back board`);
    assert.ok(front.rows.length >= 1 && back.rows.length >= 1, `${spacing} holes from ${pin1}: free rows ${front.rows} / ${back.rows}`);
  }
  // On one board the same DevKit covers a whole strip of one header.
  const single = buildCircuit({ version: 1, board: 'bb830', parts: [{ id: 'U1', type: 'module', part: 'ESP32-DEVKIT', pin1: 'c5' }] });
  assert.equal(single.parts[0].holes[15].row, 'j');
});

test('double board: a DIP straddles a channel of either board, never the joint', () => {
  const r = checkCircuit({ version: 1, board: 'double', parts: [{ id: 'U1', type: 'ic', part: 'NE555', pin1: 'o5' }, { id: 'U2', type: 'ic', part: 'NE555', pin1: 'e5' }] });
  assert.deepEqual(r.issues.filter((i) => i.severity !== 'info').map((i) => i.code), []);
  const bad = checkCircuit({ version: 1, board: 'double', parts: [{ id: 'U1', type: 'ic', part: 'NE555', pin1: 'j5' }] });
  assert.ok(bad.issues.some((i) => i.severity === 'error'), 'pin 1 by the joint: no other row');
});

test('double board: drawn as two blocks, front and back view', () => {
  assert.equal(drawBoard(createBoard('double')).length, 2);
  assert.equal(drawBoard(createBoard('bb830')).length, 1);
  const circuit = { version: 1, board: 'double', parts: [{ id: 'U1', type: 'module', part: 'ESP32-DEVKIT', pin1: 'j5' }] };
  for (const view of ['front', 'back']) {
    const { svg } = renderCircuit(circuit, { view });
    assert.match(svg, /<svg/);
    assert.ok(svg.includes('>k<') && svg.includes('>t<'), `${view}: the back board's rows are printed`);
  }
});

test('layout: a DevKit with nets on both headers goes on the double board by itself', () => {
  const r = autoLayout(spec('esp32-both-headers'));
  assert.equal(r.status, 'done');
  assert.equal(r.circuit.board, 'double');
  assert.ok(r.notes.some((n) => n.code === 'LAYOUT_DOUBLE_BOARD'), 'the note says why');
  assert.ok(r.circuit.spec.nets.every((n) => !(Array.isArray(n) ? n : n.pins).some((p) => /^T[+-]$/.test(p))));
  // Parts of the back header's nets stay on the back board: D4 (row p) drives R1 and D1 there.
  const r1 = r.circuit.parts.find((p) => p.id === 'R1');
  assert.ok(r1.pins.every((h) => /^[p-t]\d+$/.test(h)), `R1 at ${r1.pins}`);
  // T+ in such a spec is the back pair of the double board, U+.
  const raw = spec('esp32-both-headers');
  const moved = autoLayout({ ...raw, nets: [...raw.nets, ['U1.VIN', 'T+']], supplies: [{ id: 'V1', voltage: 5, positive: 'T+', negative: 'B-' }], netLabels: { 'T+': '5 V' } });
  assert.equal(moved.circuit.board, 'double');
  assert.ok(moved.notes.some((n) => n.code === 'LAYOUT_DOUBLE_RAILS' && n.params.rails === 'T+ → U+'));
  assert.ok(moved.circuit.spec.nets.some((n) => n.includes('U+')));
  assert.deepEqual(moved.circuit.netLabels, { 'U+': '5 V' });
});

test('layout: the double board on request, T rails renamed or refused', () => {
  const asked = { board: 'double', parts: [{ id: 'R1', type: 'resistor', value: '1k' }], nets: [['R1.1', 'U+'], ['R1.2', 'B-']] };
  assert.equal(autoLayout(asked).status, 'done');
  const wrong = autoLayout({ ...asked, nets: [['R1.1', 'T+'], ['R1.2', 'B-']] });
  assert.equal(wrong.status, 'fix_spec');
  assert.deepEqual(wrong.problems.map((p) => p.code), ['NET_UNKNOWN_RAIL']);
  assert.equal(autoLayout({ ...asked, board: 'auto', nets: [['R1.1', 'U+']] }).status, 'fix_spec', 'U+ is not on one board');
  // A recipe (one board is enough) never moves.
  const recipe = autoLayout(expandRecipe('555-astable').spec);
  assert.equal(recipe.circuit.board, 'auto');
  assert.ok(!recipe.notes.some((n) => n.code === 'LAYOUT_DOUBLE_BOARD'));
});
