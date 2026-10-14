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
  assert.deepEqual(dipHoles(board, 'e10', 8), ['e10', 'e11', 'e12', 'e13', 'f13', 'f12', 'f11', 'f10']);
  assert.deepEqual(dipHoles(board, 'f13', 8), ['f13', 'f12', 'f11', 'f10', 'e10', 'e11', 'e12', 'e13']);
  assert.equal(dipHoles(board, 'h10', 8), null, 'pin 1 must be next to the channel');
  assert.equal(dipHoles(board, 'e60', 16), null, 'no room for 8 pins per row');
});

test('a chip placed by pin 1 connects each pin to its own strip', () => {
  const { issues, netlist } = checkCircuit({ parts: [{ id: 'U1', type: 'ic', part: 'NE555', pin1: 'e10' }] });
  assert.ok(!codes(issues).some((c) => c !== 'FLOATING_PIN'));
  assert.deepEqual(netlist.nodes['10:a-e'], [{ part: 'U1', pin: 'GND', hole: 'e10' }]);
  assert.deepEqual(netlist.nodes['10:f-j'], [{ part: 'U1', pin: 'VCC', hole: 'f10' }]);
  assert.deepEqual(codes(checkCircuit({ parts: [{ id: 'U1', type: 'ic', part: 'NE555', pin1: 'i10' }] }).issues), ['BAD_PIN1']);
  const listed = { parts: [{ id: 'U1', type: 'ic', part: 'NE555', pins: ['e10', 'e11', 'e12', 'e14', 'f13', 'f12', 'f11', 'f10'] }] };
  assert.ok(codes(checkCircuit(listed).issues).includes('DIP_SHAPE'));
});

test('a button across the channel is fine; turned 90° it is always closed', () => {
  const across = { parts: [{ id: 'S1', type: 'button', pins: ['f10', 'e10', 'f12', 'e12'] }] };
  assert.ok(!codes(checkCircuit(across).issues).includes('SWITCH_BYPASSED'));
  const turned = { parts: [{ id: 'S1', type: 'button', pins: ['j30', 'j33', 'h30', 'h33'] }] };
  assert.ok(codes(checkCircuit(turned).issues).includes('SWITCH_BYPASSED'));
  const bent = { parts: [{ id: 'S1', type: 'button', pins: ['f10', 'e10', 'f12', 'e13'] }] };
  assert.ok(codes(checkCircuit(bent).issues).includes('BUTTON_SHAPE'));
});

test('a button leg is not floating when its inner partner is connected', () => {
  const c = {
    netLabels: { 'T+': '+5 V' },
    parts: [
      { id: 'S1', type: 'button', pins: ['f10', 'e10', 'f12', 'e12'] },
      { id: 'W1', type: 'wire', pins: ['T+9', 'j10'] },
    ],
  };
  const floating = checkCircuit(c).issues.filter((i) => i.code === 'FLOATING_PIN').map((i) => i.params.pin);
  assert.ok(!floating.includes('2'), 'pin 2 is joined inside to pin 1, which has the wire');
  assert.ok(floating.includes('3') && floating.includes('4'));
});

test('potentiometer: value, wiper position, three leads in a row', () => {
  const ok = checkCircuit({ parts: [{ id: 'RV1', type: 'potentiometer', value: '10k', pins: ['h19', 'h20', 'h21'] }] });
  assert.ok(!codes(ok.issues).some((c) => c !== 'FLOATING_PIN'));
  assert.ok(codes(checkCircuit({ parts: [{ id: 'RV1', type: 'potentiometer', position: 2, pins: ['h19', 'h20', 'h21'] }] }).issues).includes('BAD_VALUE'));
  assert.match(renderCircuit({ parts: [{ id: 'RV1', type: 'potentiometer', value: '4k7', pins: ['h19', 'h20', 'h21'] }] }, { lang: 'es' }).svg, /RV1 · 4,7 kΩ/);
});

test('suggest places buttons across the channel and chips reading from the front', () => {
  const empty = { parts: [] };
  const s = suggest(empty, { type: 'button' }, { near: 'e20' });
  assert.equal(s.id, 'S1');
  const [p1, p2] = s.placements[0].pins;
  assert.equal(p1.slice(1), p2.slice(1), 'pins 1 and 2 in the same column, across the channel');
  const u = suggest(empty, { type: 'ic', part: 'LM358' }, { near: 'e30' });
  assert.equal(u.id, 'U1');
  assert.equal(u.placements[0].pins[0][0], 'e', 'pin 1 in the front row');
});

test('move works with pin1 and undoes back to pins', () => {
  const c = { parts: [{ id: 'U1', type: 'ic', part: 'NE555', pin1: 'e10' }] };
  const { circuit, inverse } = applyOps(c, [{ op: 'move', part: 'U1', pin1: 'e20' }]);
  assert.equal(circuit.parts[0].pin1, 'e20');
  assert.deepEqual(applyOps(circuit, inverse).circuit, c);
  assert.deepEqual(codes(applyOps(c, [{ op: 'set', part: 'U1', pin1: 'e30' }]).errors), ['OP_BAD']);
});

test('the controls example is approved and renders from both sides', () => {
  const c = example('controls-and-ics.json');
  assert.equal(review(c).verdict, 'approved');
  for (const view of ['front', 'back']) assert.doesNotMatch(renderCircuit(c, { view, annotate: 'all' }).svg, /NaN|undefined/);
});
