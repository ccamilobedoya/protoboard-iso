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

test('engine: stepping by hand gives exactly what transient() gives', () => {
  const whole = createEngine(ladder(3)).transient({ stop: 2e-3, step: 1e-5, points: 200 });
  const engine = createEngine(ladder(3));
  assert.ok(engine.start('zero', 1e-5));
  for (let k = 0; k < 200; k++) assert.ok(engine.step(1e-5));
  const now = engine.read();
  assert.ok(Math.abs(engine.time - 2e-3) < 1e-12);
  assert.equal(now.nodes.n3, whole.nodes.n3.at(-1));
  assert.equal(now.parts.C2.current, whole.parts.C2.current.at(-1), 'a capacitor still shows its current between steps');
  // From DC nothing moves: the capacitors start charged.
  const steady = createEngine(ladder(3));
  steady.start('dc', 1e-5);
  for (let k = 0; k < 50; k++) steady.step(1e-5);
  assert.ok(Math.abs(steady.read().parts.C2.current) < 1e-9);
});

test('engine: time constants from the resistance each capacitor sees (textbook RC)', () => {
  const [tau] = createEngine(ladder(1)).timeConstants();
  assert.ok(Math.abs(tau - 1e-3) < 1e-9, `τ = ${tau}`);
});

test('engine: stresses, a resistor over its rated power (P = V²/R solved apart)', () => {
  // Two 10 Ω resistors in series on 5 V: 2.5 V across each, P = 2.5² / 10 = 0.625 W on a ¼ W part.
  const program = ladder(1);
  program.devices[0].params.resistance = 10;
  program.devices[1] = { id: 'R1', type: 'resistor', kind: 'R', pins: program.devices[1].pins, params: { resistance: 10, maxPower: 0.25 } };
  const engine = createEngine(program);
  const [power] = engine.stresses(engine.dc()).R0;
  assert.equal(power.quantity, 'power');
  assert.ok(Math.abs(power.ratio - 2.5 ** 2 / 10 / 0.25) < 1e-6, `ratio ${power.ratio}`);
});
