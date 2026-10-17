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
