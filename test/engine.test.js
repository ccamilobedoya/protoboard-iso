// The engine on its own (src/sim/engine.js): a program written by hand, without a board, and a
// speed check. The page will step circuits like this one many times per frame.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createEngine } from '../src/sim/engine.js';
import { compile } from '../src/sim/index.js';
import { paceOf } from '../src/sim/pace.js';
import { resistor as resistorDevice } from '../src/sim/devices/resistor.js';
import { DIODES, VT, WIRE_RESISTANCE } from '../src/sim/models.js';
import { expandRecipe } from '../src/recipes/index.js';
import { autoLayout } from '../src/layout.js';

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

test('engine: a 40-section RC/diode ladder steps fast enough for a page', (t) => {
  // Coverage (c8) instruments every line and runs several times slower: speed means nothing then.
  if (process.env.NODE_V8_COVERAGE) return t.skip('not measured under coverage');
  const steps = 2000;
  const t0 = performance.now(); // real clock: this test measures speed
  const r = createEngine(ladder()).transient({ stop: steps * 1e-5, step: 1e-5, points: 10 });
  const perSecond = steps / ((performance.now() - t0) / 1000); // real clock: speed
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

// ── Bridge rectifiers, stepped as the page steps them ─────────────────────────────────
// The page's pace and step (sim/pace.js), its start, and engine.advance(h) for every step, for
// `stop` simulated seconds. Counts the Newton attempts (step() calls), so a stepper that keeps
// splitting its steps shows here. Returns C1's voltage at every step.
function stepLikeThePage(circuit, stop) {
  const program = JSON.parse(JSON.stringify(compile(circuit).program));
  const engine = createEngine(program);
  const { h } = paceOf(engine.timeConstants(), engine.periods(), engine.hasProgram());
  assert.ok(engine.start(circuit.page?.start === 'zero' ? 'zero' : 'dc', h));
  let attempts = 0;
  const step = engine.step;
  engine.step = (dt) => {
    attempts++;
    return step(dt);
  };
  const series = [];
  while (engine.time < stop - h / 2) {
    assert.ok(engine.advance(h), `stalled at t = ${engine.time} s`);
    series.push([engine.time, engine.read().parts.C1.voltage]);
  }
  return { program, h, attempts, nominal: Math.round(stop / h), series };
}

// Volts across a Shockley junction with series resistance carrying i amperes (the kit's model).
const junctionVolts = (i, { is, n, rs }) => n * VT * Math.log1p(i / is) + i * rs;
// The root of an increasing f in [lo, hi], by bisection.
function bisect(f, lo, hi) {
  for (let k = 0; k < 60; k++) {
    const mid = (lo + hi) / 2;
    if (f(mid) > 0) hi = mid;
    else lo = mid;
  }
  return (lo + hi) / 2;
}

test('engine: a bridge rectifier fed by a sine steps through every zero crossing (recipe bridge-rectifier)', () => {
  // While all four diodes block, the capacitor's side floats: only GMIN and nanoampere leakages
  // hold it, and Newton's update there was round-off that never settled (the page froze at 9.85 ms).
  const stop = 0.4;
  const circuit = autoLayout(expandRecipe('bridge-rectifier').spec).circuit;
  const run = stepLikeThePage(circuit, stop);
  assert.ok(run.attempts <= run.nominal * 1.05, `${run.attempts} Newton attempts for ${run.nominal} steps`);

  // Reference, solved apart: one state (C1's voltage) integrated in 2 µs steps (forward Euler). The bridge
  // conducts through two of its diodes, the generator's output resistance and the two AC jumpers
  // while |vs| is above the capacitor; the load is R1 and the LED in series. Leakage and the
  // jumpers on the DC side (a few mΩ at milliamperes) are left out.
  const params = Object.fromEntries(run.program.devices.map((d) => [d.id, d.params]));
  const gen = run.program.supplies[0];
  const { amplitude, frequency } = gen.generator;
  const rCharge = gen.internalResistance + 2 * WIRE_RESISTANCE;
  const bridge = params.BR1.model;
  const led = params.D1.model;
  const R1 = params.R1.resistance;
  const C = params.C1.capacitance;
  const charge = (vs, vc) => (Math.abs(vs) <= vc ? 0 : bisect((i) => i * rCharge + 2 * junctionVolts(i, bridge) + vc - Math.abs(vs), 0, Math.abs(vs) / rCharge));
  const load = (vc) => (vc <= 0 ? 0 : bisect((i) => i * R1 + junctionVolts(i, led) - vc, 0, vc / R1));
  const reference = [];
  const dt = 2e-6;
  let vc = 0;
  for (let k = 1; k <= Math.round(stop / dt); k++) {
    const t = k * dt;
    vc += ((charge(amplitude * Math.sin(2 * Math.PI * frequency * t), vc) - load(vc)) * dt) / C;
    if (t > stop - 2 / frequency) reference.push([t, vc]);
  }

  // The last two periods: peak, ripple, and a full wave (one valley per half period).
  const last = (series) => series.filter(([t]) => t > stop - 2 / frequency + 1e-9).map(([, v]) => v);
  const sim = last(run.series);
  const ref = reference.map(([, v]) => v);
  const peak = (vs) => Math.max(...vs);
  const ripple = (vs) => peak(vs) - Math.min(...vs);
  // Backward Euler at the page's 200 µs step against the reference: about 0.05 % apart (9.004 V
  // and 9.009 V peak, 109.7 mV and 109.7 mV ripple); within 0.5 % and 3 %.
  assert.ok(Math.abs(peak(sim) - peak(ref)) < 0.005 * peak(ref), `peak ${peak(sim)} V, reference ${peak(ref)} V`);
  assert.ok(Math.abs(ripple(sim) - ripple(ref)) < 0.03 * ripple(ref), `ripple ${ripple(sim)} V, reference ${ripple(ref)} V`);
  // The textbook full-wave estimate, ΔV ≈ I / (2·f·C) with I the load current at the mean
  // voltage, assumes C1 discharges for a whole half period: an upper bound. Through the
  // generator's 50 Ω the recharge takes a good part of it (here 110 mV against 154 mV).
  const mean = sim.reduce((a, b) => a + b, 0) / sim.length;
  const textbook = load(mean) / (2 * frequency * C);
  assert.ok(ripple(sim) < textbook && ripple(sim) > 0.5 * textbook, `ripple ${ripple(sim)} V, I/(2fC) ${textbook} V`);
  // And below the ideal peak, Vpeak − 2·Vf (Vf at the load current): the 50 Ω output drops the rest.
  assert.ok(peak(sim) < amplitude - 2 * junctionVolts(load(mean), bridge));
  // Full wave: C1 recharges every half period, 4 valleys in two periods (a half-wave would show 2).
  const valleys = sim.filter((v, k) => k > 0 && k < sim.length - 1 && v < sim[k - 1] && v <= sim[k + 1]).length;
  assert.equal(valleys, 4);
});

test('engine: examples/rectifier.json (a bridge on a 12 V bench supply) steps 100 ms at its page step', () => {
  // A DC supply: no zero crossing and no ripple. C1 holds 12 V less two diode drops at the load
  // current and the four jumpers in that current's path, solved apart below.
  const circuit = JSON.parse(readFileSync(new URL('../examples/rectifier.json', import.meta.url), 'utf8'));
  const stop = 0.1;
  const run = stepLikeThePage(circuit, stop);
  assert.ok(run.attempts <= run.nominal * 1.05, `${run.attempts} Newton attempts for ${run.nominal} steps`);
  const params = Object.fromEntries(run.program.devices.map((d) => [d.id, d.params]));
  const V = run.program.supplies[0].voltage;
  const led = params.D1.model;
  const loadAt = (vc) => vc / params.R1.resistance + bisect((i) => i * params.R2.resistance + junctionVolts(i, led) - vc, 0, vc / params.R2.resistance);
  const vc = bisect((v) => v - (V - 2 * junctionVolts(loadAt(v), params.BR1.model) - 4 * WIRE_RESISTANCE * loadAt(v)), 0, V);
  const volts = run.series.map(([, v]) => v);
  assert.ok(Math.max(...volts) - Math.min(...volts) < 1e-6, 'flat: no ripple from a DC supply');
  assert.ok(Math.abs(volts.at(-1) - vc) < 0.01, `C1 ${volts.at(-1)} V, reference ${vc} V`);
});

test('engine: advance(h) splits a step Newton cannot take and keeps h for the next one', () => {
  const engine = createEngine(ladder(3));
  assert.ok(engine.start('zero', 1e-5));
  const step = engine.step;
  const tried = [];
  let failures = 1;
  engine.step = (dt) => {
    tried.push(dt);
    if (failures-- > 0) return false;
    return step(dt);
  };
  assert.ok(engine.advance(1e-5));
  assert.ok(Math.abs(engine.time - 1e-5) < 1e-18, 'the whole h, in two halves');
  assert.ok(engine.advance(1e-5));
  assert.deepEqual(tried, [1e-5, 5e-6, 5e-6, 1e-5]);
  // A step that fails every time: four halvings, then false, and nothing advanced.
  engine.step = (dt) => (tried.push(dt), false);
  tried.length = 0;
  const before = engine.time;
  assert.equal(engine.advance(1e-5), false);
  assert.deepEqual(tried, [1e-5, 5e-6, 2.5e-6, 1.25e-6, 6.25e-7]);
  assert.equal(engine.time, before);
});

// A device with memory of its own: the resistor's device, lent a clock (`ticks`, the seconds its
// element has been accepted for) and, when `declare`, the `state` that carries it over a rebuild. A
// control on another part rebuilds the system; the clock of this one must survive only when declared.
function withClock(declare, body) {
  const { elements, read, state } = resistorDevice;
  resistorDevice.elements = (p, h) => {
    const out = elements(p, h);
    out.main.ticks = 0;
    out.main.accept = function accept(_x, ctx = {}) {
      this.ticks += ctx.h ?? 0;
    };
    return out;
  };
  resistorDevice.read = (entry, h) => ({ ...read(entry, h), ticks: entry.main.ticks });
  if (declare) resistorDevice.state = ['ticks'];
  try {
    return body();
  } finally {
    Object.assign(resistorDevice, { elements, read });
    if (state === undefined) delete resistorDevice.state;
    else resistorDevice.state = state;
  }
}
const clocked = () => {
  const program = ladder(0);
  program.nodes = ['n0', 'n1'];
  program.devices = ['R1', 'R2'].map((id, i) => ({ id, type: 'resistor', kind: 'R', pins: [{ name: '1', node: i ? 'n1' : 'n0' }, { name: '2', node: i ? 'g' : 'n1' }], params: { resistance: 1000, nominal: 1000, maxPower: 0.25 } }));
  return program;
};

test('engine: a device lists `state` and its elements keep those keys across engine.set', () => {
  const run = (declare) =>
    withClock(declare, () => {
      const engine = createEngine(clocked());
      assert.ok(engine.start('dc', 0.1));
      for (let k = 0; k < 10; k++) assert.ok(engine.step(0.1));
      assert.ok(Math.abs(engine.read().parts.R1.ticks - 0.9) < 1e-9, 'the last step is accepted at the start of the next');
      // An unrelated control (R2's resistance) rebuilds the whole system.
      assert.ok(engine.set('R2', 'resistance', 2200));
      for (let k = 0; k < 10; k++) assert.ok(engine.step(0.1));
      return engine.read().parts.R1.ticks;
    });
  assert.ok(Math.abs(run(true) - 1.9) < 1e-9, 'carried: the 1 s before the control (its last step accepted by the rebuild) and 0.9 s after');
  assert.ok(Math.abs(run(false) - 0.9) < 1e-9, 'not declared: the new element starts from zero');
});

test('engine: an element asks for a shorter step (maxStep) and for real time (span)', () => {
  const engine = createEngine(clocked());
  assert.ok(engine.start('dc', 0.1));
  assert.equal(engine.stepHint(), null);
  assert.deepEqual(engine.stimuli(), []);
  const { elements } = resistorDevice;
  resistorDevice.elements = (p, h) => {
    const out = elements(p, h);
    out.main.maxStep = () => 0.01;
    out.main.span = () => 2.5;
    return out;
  };
  try {
    const timed = createEngine(clocked());
    assert.ok(timed.start('dc', 0.1));
    assert.equal(timed.stepHint(), 0.01);
    assert.deepEqual(timed.stimuli(), [2.5, 2.5]);
    assert.equal(paceOf([], [], false, timed.stimuli()).h, 0.0125, 'real time, a two-hundredth of the span');
  } finally {
    resistorDevice.elements = elements;
  }
});
