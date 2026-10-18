import { test } from 'node:test';
import assert from 'node:assert/strict';
import { autoLayout, checkNets, formatLayout } from '../src/layout.js';
import { formatIssue, t } from '../src/index.js';

// A 5 V regulator with its capacitors and a pilot LED, from a 9 V battery's strip.
const spec = {
  board: 'auto',
  parts: [
    { id: 'U1', type: 'regulator', part: '7805' },
    { id: 'C1', type: 'capacitor', kind: 'ceramic', value: '100n' },
    { id: 'R1', type: 'resistor', value: '1k' },
    { id: 'D1', type: 'led', color: 'red' },
  ],
  nets: [
    ['U1.IN', 'T+'],
    { pins: ['U1.OUT', 'C1.1', 'R1.1'], color: 'orange' },
    ['R1.2', 'D1.anode'],
    ['U1.GND', 'C1.2', 'D1.cathode', 'T-'],
  ],
  supplies: [{ id: 'V1', kind: 'bench', voltage: 9, positive: 'T+', negative: 'T-' }],
};

test('layout: every part placed, every net connected, nothing shorted, in one call', () => {
  const r = autoLayout(spec);
  assert.equal(r.placed.length, 4);
  assert.deepEqual(r.problems, []);
  assert.ok(r.check.ok, JSON.stringify(r.check));
  assert.equal(r.review.verdict, 'approved', r.review.blocking.map((b) => formatIssue(b, 'en')).join('\n'));
  // Left to right in the order given.
  const col = (id) => Math.min(...Object.values(r.placed.find((p) => p.id === id).pins).map((h) => Number(h.replace(/\D/g, ''))));
  assert.ok(col('U1') < col('R1') && col('R1') <= col('D1'));
  assert.doesNotMatch(formatLayout(r, 'es', { t, formatIssue }), /\{\w+\}/);
});

test('checkNets: nets that share a rail are one net; a missing pin and a short are reported', () => {
  const r = autoLayout(spec);
  const asked = (pins) => pins.map((p, index) => ({ index, pins: p }));
  assert.ok(checkNets(r.circuit, asked([['U1.GND', 'T-'], ['D1.cathode', 'T-']])).ok, 'both on T-: one net');
  const apart = checkNets(r.circuit, asked([['T+', 'T-']]));
  assert.equal(apart.missing.length, 1, 'the two rails are not joined in this circuit');
  const short = checkNets(r.circuit, asked([['U1.OUT'], ['C1.1']]));
  assert.equal(short.shorted.length, 1, 'two nets asked apart are one in the circuit');
  const wrong = checkNets(r.circuit, asked([['U1.OUT', 'R1.2']]));
  assert.equal(wrong.missing.length, 1);
});

test('parts by name: part numbers, modules and aliases resolve without a type; unknown ones suggest', async () => {
  const { resolvePart, pinsOf } = await import('../src/parts/resolve.js');
  assert.deepEqual(resolvePart({ id: 'U1', part: 'L7805CV' }).part, { id: 'U1', type: 'regulator', part: '7805' });
  assert.deepEqual(resolvePart({ id: 'S1', part: 'KCD1', on: true }).part, { id: 'S1', type: 'switch', style: 'rocker', on: true });
  assert.equal(resolvePart({ id: 'R1', type: 'resistencia', value: '1k' }).part.type, 'resistor');
  assert.equal(resolvePart({ id: 'D1', part: 'LED', color: 'red' }).part.type, 'led');
  assert.equal(resolvePart({ id: 'A1', part: 'Arduino UNO' }).error?.code ?? resolvePart({ id: 'A1', part: 'UNO' }).part.type, 'module');
  const unknown = resolvePart({ id: 'D2', part: '1N4148W' });
  assert.equal(unknown.error.code, 'UNKNOWN_PART_NAME');
  assert.match(unknown.error.params.suggestions, /1N4148/);
  assert.deepEqual(pinsOf({ type: 'switch' }), ['1', '2']);
});

test('validateSpec finds everything wrong in one pass, and layout places nothing then', () => {
  const bad = {
    parts: [{ id: 'U1', part: '7805' }, { id: 'U1', part: '7805' }, { id: 'X', part: 'warp-core' }, { id: 'D1', part: 'LED' }],
    nets: [['U1.VIN', 'T+'], ['Q7.B', 'T-'], ['nonsense'], ['D1.anode', 'T+']],
  };
  const r = autoLayout(bad);
  assert.ok(r.invalid && r.checked);
  const codes = r.problems.map((p) => p.code).sort();
  for (const code of ['DUPLICATE_ID', 'UNKNOWN_PART_NAME', 'NET_UNKNOWN_PIN', 'NET_UNKNOWN_PART', 'NET_BAD_REF']) assert.ok(codes.includes(code), code);
  assert.match(formatLayout(r, 'es', { t, formatIssue }), /Sus patas: IN, GND, OUT/);
  // check only: a good spec comes back resolved, nothing placed.
  const ok = autoLayout({ parts: [{ id: 'U1', part: '7805' }], nets: [['U1.IN', 'T+'], ['U1.GND', 'T-'], ['U1.OUT']] }, { checkOnly: true });
  assert.equal(ok.invalid, false);
  assert.equal(ok.parts[0].type, 'regulator');
  assert.equal(ok.circuit, undefined);
});
