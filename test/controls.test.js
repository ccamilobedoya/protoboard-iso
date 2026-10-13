import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { checkCircuit, renderCircuit, applyOps, review } from '../src/index.js';
import { suggest } from '../src/query.js';
import { createBoard } from '../src/board/board.js';
import { dipHoles } from '../src/parts/packages/dip.js';

const example = (name) => JSON.parse(readFileSync(new URL(`../examples/${name}`, import.meta.url), 'utf8'));
const codes = (issues) => issues.map((i) => i.code);

test('DIP pins follow the chip: pin 1 front row reads from the front, back row turns it round', () => {
  const board = createBoard();
  assert.deepEqual(dipHoles(board, 'f10', 8), ['f10', 'f11', 'f12', 'f13', 'e13', 'e12', 'e11', 'e10']);
  assert.deepEqual(dipHoles(board, 'e13', 8), ['e13', 'e12', 'e11', 'e10', 'f10', 'f11', 'f12', 'f13']);
  assert.equal(dipHoles(board, 'c10', 8), null, 'pin 1 must be next to the channel');
  assert.equal(dipHoles(board, 'f60', 16), null, 'no room for 8 pins per row');
});

test('a chip placed by pin 1 connects each pin to its own strip', () => {
  const { issues, netlist } = checkCircuit({ parts: [{ id: 'U1', type: 'ic', part: 'NE555', pin1: 'f10' }] });
  assert.ok(!codes(issues).some((c) => c !== 'FLOATING_PIN'));
  assert.deepEqual(netlist.nodes['10:f-j'], [{ part: 'U1', pin: 'GND', hole: 'f10' }]);
  assert.deepEqual(netlist.nodes['10:a-e'], [{ part: 'U1', pin: 'VCC', hole: 'e10' }]);
  assert.deepEqual(codes(checkCircuit({ parts: [{ id: 'U1', type: 'ic', part: 'NE555', pin1: 'b10' }] }).issues), ['BAD_PIN1']);
  const listed = { parts: [{ id: 'U1', type: 'ic', part: 'NE555', pins: ['f10', 'f11', 'f12', 'f14', 'e13', 'e12', 'e11', 'e10'] }] };
  assert.ok(codes(checkCircuit(listed).issues).includes('DIP_SHAPE'));
});

test('a button across the channel is fine; turned 90° it is always closed', () => {
  const across = { parts: [{ id: 'S1', type: 'button', pins: ['e10', 'f10', 'e12', 'f12'] }] };
  assert.ok(!codes(checkCircuit(across).issues).includes('SWITCH_BYPASSED'));
  const turned = { parts: [{ id: 'S1', type: 'button', pins: ['a30', 'a33', 'c30', 'c33'] }] };
  assert.ok(codes(checkCircuit(turned).issues).includes('SWITCH_BYPASSED'));
  const bent = { parts: [{ id: 'S1', type: 'button', pins: ['e10', 'f10', 'e12', 'f13'] }] };
  assert.ok(codes(checkCircuit(bent).issues).includes('BUTTON_SHAPE'));
});

test('a button leg is not floating when its inner partner is connected', () => {
  const c = {
    netLabels: { 'T+': '+5 V' },
    parts: [
      { id: 'S1', type: 'button', pins: ['e10', 'f10', 'e12', 'f12'] },
      { id: 'W1', type: 'wire', pins: ['T+9', 'a10'] },
    ],
  };
  const floating = checkCircuit(c).issues.filter((i) => i.code === 'FLOATING_PIN').map((i) => i.params.pin);
  assert.ok(!floating.includes('2'), 'pin 2 is joined inside to pin 1, which has the wire');
  assert.ok(floating.includes('3') && floating.includes('4'));
});

test('potentiometer: value, wiper position, three leads in a row', () => {
  const ok = checkCircuit({ parts: [{ id: 'RV1', type: 'potentiometer', value: '10k', pins: ['c19', 'c20', 'c21'] }] });
  assert.ok(!codes(ok.issues).some((c) => c !== 'FLOATING_PIN'));
  assert.ok(codes(checkCircuit({ parts: [{ id: 'RV1', type: 'potentiometer', position: 2, pins: ['c19', 'c20', 'c21'] }] }).issues).includes('BAD_VALUE'));
  assert.match(renderCircuit({ parts: [{ id: 'RV1', type: 'potentiometer', value: '4k7', pins: ['c19', 'c20', 'c21'] }] }, { lang: 'es' }).svg, /RV1 · 4,7 kΩ/);
});

test('suggest places buttons across the channel and chips reading from the front', () => {
  const empty = { parts: [] };
  const s = suggest(empty, { type: 'button' }, { near: 'f20' });
  assert.equal(s.id, 'S1');
  const [p1, p2] = s.placements[0].pins;
  assert.equal(p1.slice(1), p2.slice(1), 'pins 1 and 2 in the same column, across the channel');
  const u = suggest(empty, { type: 'ic', part: 'LM358' }, { near: 'f30' });
  assert.equal(u.id, 'U1');
  assert.equal(u.placements[0].pins[0][0], 'f', 'pin 1 in the front row');
});

test('move works with pin1 and undoes back to pins', () => {
  const c = { parts: [{ id: 'U1', type: 'ic', part: 'NE555', pin1: 'f10' }] };
  const { circuit, inverse } = applyOps(c, [{ op: 'move', part: 'U1', pin1: 'f20' }]);
  assert.equal(circuit.parts[0].pin1, 'f20');
  assert.deepEqual(applyOps(circuit, inverse).circuit, c);
  assert.deepEqual(codes(applyOps(c, [{ op: 'set', part: 'U1', pin1: 'f30' }]).errors), ['OP_BAD']);
});

test('the controls example is approved and renders from both sides', () => {
  const c = example('controls-and-ics.json');
  assert.equal(review(c).verdict, 'approved');
  for (const view of ['front', 'back']) assert.doesNotMatch(renderCircuit(c, { view, annotate: 'all' }).svg, /NaN|undefined/);
});
