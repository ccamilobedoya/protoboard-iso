// The engine on its own (src/sim/engine.js): a program written by hand, without a board, and a
// speed check. The page will step circuits like this one many times per frame.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createEngine } from '../src/sim/engine.js';
import { DIODES } from '../src/sim/models.js';

// An RC ladder of 40 sections from a 5 V supply, a 1N4148 to ground every five sections.
function ladder(n = 40) {
  const devices = [];
  for (let i = 0; i < n; i++) {
    devices.push({ id: `R${i}`, type: 'resistor', kind: 'R', pins: [{ name: '1', node: `n${i}` }, { name: '2', node: `n${i + 1}` }], params: { resistance: 1000, maxPower: 0.25 } });
    devices.push({ id: `C${i}`, type: 'capacitor', kind: 'C', pins: [{ name: '1', node: `n${i + 1}` }, { name: '2', node: 'g' }], params: { capacitance: 1e-6, polarised: false, maxVoltage: 50 } });
    if (i % 5 === 4) devices.push({ id: `D${i}`, type: 'diode', kind: 'D', pins: [{ name: 'A', node: `n${i + 1}` }, { name: 'K', node: 'g' }], params: { model: DIODES['1N4148'] } });
  }
  const nodes = Array.from({ length: n + 1 }, (_, i) => `n${i}`);
  return { v: 1, ground: 'g', nodes, members: {}, supplies: [{ id: 'V1', kind: 'bench', voltage: 5, internalResistance: 0, p: 'n0', n: 'g', currentLimit: null }], devices, issues: [] };
}

test('engine: a program written by hand solves (one RC section, textbook charge)', () => {
  const program = ladder(1);
  const r = createEngine(program).transient({ stop: 1e-3, step: 1e-6, points: 10 });
  assert.ok(r.ok);
  // V(t) = 5 · (1 − e^(−t/RC)), RC = 1 ms; backward Euler with 1000 steps per τ is within 0.1 %.
  const v = r.nodes.n1.at(-1);
  assert.ok(Math.abs(v - 5 * (1 - Math.exp(-1))) < 0.005, `V(τ) = ${v}`);
});

test('engine: a 40-section RC/diode ladder steps fast enough for a page', () => {
  const steps = 2000;
  const t0 = performance.now();
  const r = createEngine(ladder()).transient({ stop: steps * 1e-5, step: 1e-5, points: 10 });
  const perSecond = steps / ((performance.now() - t0) / 1000);
  assert.ok(r.ok);
  // About 12 000 steps/s on the maintainer's desktop; a phone is a few times slower. Fail well
  // before a page would stutter.
  assert.ok(perSecond > 2000, `${Math.round(perSecond)} steps/s`);
});
