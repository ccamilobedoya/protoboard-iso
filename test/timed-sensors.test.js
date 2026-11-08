// Timed sensors (docs/en/timed-sensors.md): the PIR module's and the touch module's state machines
// against the sheets' times, what the engine carries across a slider, their limits and stresses, the
// part up close and the recipes. Each time in seconds is the one the sheet gives, within a step.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { autoLayout } from '../src/layout.js';
import { expandRecipe, RECIPES } from '../src/recipes/index.js';
import { compile, createEngine, simulate } from '../src/sim/index.js';
import { paceOf } from '../src/sim/pace.js';
import { pirAdvance, WARMUP, IDLE, HIGH, BLOCK, OFF } from '../src/sim/devices/pir.js';
import { touchAdvance, SETTLING, HELD, RUN } from '../src/sim/devices/touch.js';
import { checkCircuit, inspectCircuit, renderCircuit, buildCircuit, formatIssue } from '../src/index.js';
import { createCamera } from '../src/core/camera.js';
import { pinoutOf } from '../src/pinout.js';
import { symbolOf, insideOf } from '../src/parts/symbols.js';
import { resolvePart } from '../src/parts/resolve.js';
import { linesFor } from '../src/sim/lines.js';

const H = 0.01;
const near = (a, b, tolerance, what) => assert.ok(Math.abs(a - b) <= tolerance, `${what}: ${a} against ${b}`);

// A PIR from 5 V with a load from OUT to ground, the environment's motion given.
function pirEngine(part = {}, load = '10k', volts = 5) {
  const spec = {
    parts: [{ id: 'U1', type: 'pir-sensor', ...part }, ...(load ? [{ id: 'R1', type: 'resistor', value: load }] : []), { id: 'R2', type: 'resistor', value: '1k' }],
    nets: [['T+', 'U1.VCC', 'R2.1'], ...(load ? [['U1.OUT', 'R1.1'], ['R1.2', 'U1.GND', 'T-']] : [['U1.GND', 'T-']]), ['R2.2', 'T-']],
    supplies: [{ id: 'V1', kind: 'bench', voltage: volts, positive: 'T+', negative: 'T-' }],
    environment: { motion: false },
  };
  const r = autoLayout(spec);
  assert.equal(r.status, 'done', JSON.stringify(r.problems));
  return createEngine(compile(r.circuit).program);
}

// The same for a touch module, 100 kΩ on SIG.
function touchEngine(part = {}, volts = 3.3) {
  const spec = {
    parts: [{ id: 'U1', type: 'touch-sensor', ...part }, { id: 'R1', type: 'resistor', value: '100k' }],
    nets: [['T+', 'U1.VCC'], ['U1.SIG', 'R1.1'], ['R1.2', 'U1.GND', 'T-']],
    supplies: [{ id: 'V1', kind: 'bench', voltage: volts, positive: 'T+', negative: 'T-' }],
    environment: { touch: false },
  };
  const r = autoLayout(spec);
  assert.equal(r.status, 'done', JSON.stringify(r.problems));
  return createEngine(compile(r.circuit).program);
}

// Runs `events` ([time, fn(engine)]) and samples ([time]) in order; returns what `read` gives at each.
function run(engine, events, samples, read) {
  assert.ok(engine.start('dc', H));
  const out = {};
  const all = [...events.map(([t, f]) => ({ t, f })), ...samples.map((t) => ({ t, sample: true }))].sort((a, b) => a.t - b.t);
  for (const e of all) {
    while (engine.time < e.t - 1e-9) assert.ok(engine.advance(H), `a step failed at ${engine.time}`);
    if (e.f) e.f(engine);
    if (e.sample) out[e.t] = read(engine.read().parts.U1);
  }
  return out;
}
const motion = (v) => (e) => assert.ok(e.set('environment', 'motion', v));
const touch = (v) => (e) => assert.ok(e.set('environment', 'touch', v));
const out = (p) => p.vout;

// ── the PIR's machine, on its own ───────────────────────────────────────────────────────────

test('pir machine: warm-up, idle, high for Tx, blocked for 2.5 s, idle again', () => {
  const p = { warmup: 30, delay: 5, mode: 'H', motion: false };
  let s = pirAdvance({ phase: WARMUP, clock: 0 }, 29.99, true, p);
  assert.equal(s.phase, WARMUP);
  s = pirAdvance(s, 0.02, true, p);
  assert.equal(s.phase, IDLE, 'warm-up over');
  s = pirAdvance(s, 1, true, { ...p, mode: 'L', motion: true });
  assert.deepEqual([s.phase, Math.round(s.clock * 100) / 100], [HIGH, 1], 'motion starts it at once and the time of the step counts');
  s = pirAdvance(s, 4, true, { ...p, motion: false });
  assert.equal(s.phase, BLOCK, 'Tx over');
  s = pirAdvance(s, 2.5, true, p);
  assert.equal(s.phase, IDLE);
  assert.equal(pirAdvance(s, 1, false, p).phase, OFF, 'no supply: off, and the warm-up begins again');
  assert.equal(pirAdvance({ phase: OFF, clock: 0 }, 0, true, p).phase, WARMUP);
  assert.equal(pirAdvance({ phase: OFF, clock: 0 }, 0, true, { ...p, warmup: 0 }).phase, IDLE, 'warm-up 0 skips it');
});

test('pir machine: mode H retriggers, mode L ignores motion and pulses Tx on, 2.5 s off', () => {
  const p = { warmup: 0, delay: 5, motion: true };
  const h = { phase: HIGH, clock: 4 };
  assert.deepEqual(pirAdvance(h, 1, true, { ...p, mode: 'H' }), { phase: HIGH, clock: 0 }, 'H: motion holds the clock at zero');
  assert.equal(pirAdvance(h, 1, true, { ...p, mode: 'L' }).phase, BLOCK, 'L: motion does not delay the fall');
  // L with motion held: high 5, low 2.5, high again: 7.5 s round.
  let s = { phase: IDLE, clock: 0 };
  const seen = [];
  for (let t = 0; t < 16; t += 0.5) {
    s = pirAdvance(s, 0.5, true, { ...p, mode: 'L' });
    seen.push(s.phase === HIGH ? 1 : 0);
  }
  // Each step is read at its end: high at 0.5 … 4.5 s, low from 5 s (Tx over) to 7 s, high again at 7.5 s.
  assert.equal(seen.slice(0, 15).join(''), '111111111000001', 'high 5 s, then low 2.5 s, then high again');
});

// ── the PIR in a circuit (the sheet's checks 33 to 39) ──────────────────────────────────────

test('pir: default warm-up of 30 s, motion at 10 s waits for it (check 33)', () => {
  const r = run(pirEngine(), [[10, motion(true)]], [5, 10.5, 29.8, 30.2, 31], out);
  for (const t of [5, 10.5, 29.8]) near(r[t], 0, 0.05, `OUT at ${t}`);
  near(r[30.2], 3.14, 0.1, 'OUT at 30.2 (3.3 V behind 500 Ω into 10 kΩ)');
  near(r[31], 3.14, 0.1, 'OUT at 31');
});

test('pir: H mode, motion from 1 to 1.5 s: OUT high from the motion to Tx after its end (check 34); blocked 2.5 s after (3.1)', () => {
  const r = run(pirEngine({ warmup: 0 }), [[1, motion(true)], [1.5, motion(false)], [7, motion(true)]], [0.5, 1.5, 2, 5.5, 6.4, 6.6, 7.5, 9.4], out);
  near(r[0.5], 0, 0.05, 'rest');
  for (const t of [1.5, 2, 5.5, 6.4]) near(r[t], 3.14, 0.1, `high at ${t}`);
  near(r[6.6], 0, 0.05, 'low by 6.5');
  near(r[7.5], 0, 0.05, 'motion at 7 s is inside the 2.5 s of rest (6.5 to 9)');
  near(r[9.4], 3.14, 0.1, 'and it fires when the rest ends, motion still on');
});

test('pir: a second motion in H mode restarts the time (check 35), in L mode it is ignored (check 36)', () => {
  const events = [[40, motion(true)], [41, motion(false)], [43, motion(true)], [44, motion(false)]];
  const samples = [39.9, 40.1, 45.5, 48.9, 49.2, 44.9, 45.1, 47.4];
  const h = run(pirEngine({ warmup: 0 }), events, samples, out);
  near(h[40.1], 3.14, 0.1, 'high at 40');
  near(h[45.5], 3.14, 0.1, 'still high at 45.5: the 43 s motion restarted it');
  near(h[48.9], 3.14, 0.1, 'until 49');
  near(h[49.2], 0, 0.05, 'low after 49');
  const l = run(pirEngine({ warmup: 0, mode: 'L' }), events, samples, out);
  near(l[44.9], 3.14, 0.1, 'L: high until 45');
  near(l[45.1], 0, 0.05, 'low from 45');
  near(l[47.4], 0, 0.05, 'and the rest lasts to 47.5');
  near(l[48.9], 0, 0.05, 'no second pulse: the 43 s motion was ignored');
});

test('pir: L mode with motion held pulses high 5 s, low 2.5 s (check 37)', () => {
  const r = run(pirEngine({ warmup: 0, mode: 'L' }), [[40, motion(true)]], [39.9, 44.9, 45.1, 47.4, 47.6, 52.4, 52.6], out);
  near(r[39.9], 0, 0.05, 'rest');
  near(r[44.9], 3.14, 0.1, 'high 40 to 45');
  near(r[45.1], 0, 0.05, 'low 45 to 47.5');
  near(r[47.4], 0, 0.05, 'still low');
  near(r[47.6], 3.14, 0.1, 'high 47.5 to 52.5');
  near(r[52.6], 0, 0.05, 'and low again');
});

test('pir: OUT is 3.3 V behind 500 Ω (check 38) and the module takes 65 µA from 5 V (check 39)', () => {
  const e = pirEngine({ warmup: 0, motion: true }, '3.3k');
  assert.ok(e.start('dc', H));
  const p = e.read().parts.U1;
  near(p.vout, 3.3 * 3300 / 3800, 0.1, 'OUT into 3.3 kΩ');
  near(p.quiescent, 65e-6, 5e-6, 'quiescent at 5 V');
  // Unloaded and at rest the supply current is its own.
  const idle = pirEngine({ warmup: 0 }, null);
  assert.ok(idle.start('dc', H));
  near(idle.read().parts.U1.quiescent, 65e-6, 5e-6, 'at rest');
});

test('pir: a slider on another part does not restart the time (the engine carries phase and clock)', () => {
  const e = pirEngine({ warmup: 0 });
  const r = run(e, [[1, motion(true)], [1.5, motion(false)], [3, (en) => assert.ok(en.set('R2', 'resistance', 2200))]], [2.9, 3.1, 3.5, 6.4, 6.6], out);
  for (const t of [2.9, 3.1, 3.5, 6.4]) near(r[t], 3.14, 0.1, `still high at ${t}`);
  near(r[6.6], 0, 0.05, 'and low by 6.6, Tx after the motion ended');
  // The same slider during the warm-up leaves it where it was.
  const w = run(pirEngine(), [[20, (en) => assert.ok(en.set('R2', 'resistance', 2200))], [10, motion(true)]], [29.5, 30.5], out);
  near(w[29.5], 0, 0.05, 'warming up at 29.5');
  near(w[30.5], 3.14, 0.1, 'it rose at 30 s, not 50');
});

test('pir: its own controls (motion, jumper, delay) change the part, not the clock', () => {
  const e = pirEngine({ warmup: 0, delay: 5 });
  assert.ok(e.start('dc', H));
  const controls = e.controls().filter((c) => c.id === 'U1').map((c) => c.field);
  assert.deepEqual(controls, ['motion', 'retrigger', 'delay']);
  // The jumper to L while motion is held: the next fall is not delayed by the motion.
  assert.ok(e.set('environment', 'motion', true));
  for (let k = 0; k < 100; k++) e.advance(H);
  assert.ok(e.set('U1', 'retrigger', false));
  for (let k = 0; k < 520; k++) e.advance(H);
  near(e.read().parts.U1.vout, 0, 0.05, 'L: low 6.2 s after the motion began (Tx counted from the jumper moving), though it is still on');
  assert.equal(e.read().parts.U1.env.find((x) => x.field === 'motion').follows, true, 'the jumper is not the field: it still follows the environment');
  // Its own motion switch detaches it from the environment.
  assert.ok(e.set('U1', 'motion', false));
  assert.equal(e.read().parts.U1.env.find((x) => x.field === 'motion').follows, false);
});

test('pir: the supply under 4.5 V does not start it; over 20 V and OUT overloaded are stresses (check 8)', () => {
  const low = pirEngine({ warmup: 0, motion: true }, '10k', 3.3);
  assert.ok(low.start('dc', H));
  assert.equal(low.read().parts.U1.state, 'off');
  near(low.read().parts.U1.vout, 0, 0.05, 'off: OUT low');
  const s24 = simulate(autoLayout({ parts: [{ id: 'U1', type: 'pir-sensor', warmup: 0, motion: true }, { id: 'R1', type: 'resistor', value: '100' }], nets: [['T+', 'U1.VCC'], ['U1.OUT', 'R1.1'], ['R1.2', 'U1.GND', 'T-']], supplies: [{ id: 'V1', kind: 'bench', voltage: 24, positive: 'T+', negative: 'T-' }] }).circuit);
  const codes = s24.issues.map((i) => i.code);
  assert.ok(codes.includes('SIM_IC_SUPPLY'), '24 V is over the 20 V');
  assert.ok(codes.includes('SIM_OVER_CURRENT'), 'OUT into 100 Ω gives 5.5 mA, over 2 mA');
  for (const lang of ['en', 'es']) for (const i of s24.issues) assert.ok(!formatIssue(i, lang).includes('check.'), `${lang} ${i.code}`);
  const sim = simulate(autoLayout({ parts: [{ id: 'U1', type: 'pir-sensor' }], nets: [['T+', 'U1.VCC'], ['U1.GND', 'T-']], supplies: [{ id: 'V1', kind: 'bench', voltage: 5, positive: 'T+', negative: 'T-' }] }).circuit);
  assert.ok(sim.issues.some((i) => i.code === 'SIM_PIR_WARMUP'), 'a note while it warms up');
  const brownout = simulate(autoLayout({ parts: [{ id: 'U1', type: 'pir-sensor' }], nets: [['T+', 'U1.VCC'], ['U1.GND', 'T-']], supplies: [{ id: 'V1', kind: 'bench', voltage: 3.3, positive: 'T+', negative: 'T-' }] }).circuit);
  assert.ok(brownout.issues.some((i) => i.code === 'SIM_PIR_LOW_SUPPLY'));
});

// ── the touch module (the sheet's checks 40 to 44) ─────────────────────────────────────────

test('touch machine: settling, held at power on, a response time, a toggle that flips on the rising touch', () => {
  const p = { touch: false, toggle: false, fast: false, activeLow: false };
  let s = touchAdvance({ phase: SETTLING, clock: 0, sensed: 0, level: 0 }, 0.49, true, { ...p, touch: true });
  assert.equal(s.phase, SETTLING);
  s = touchAdvance(s, 0.02, true, { ...p, touch: true });
  assert.deepEqual([s.phase, s.sensed], [HELD, 0], 'a finger on the pad at power on is the baseline');
  s = touchAdvance(s, 5, true, { ...p, touch: true });
  assert.equal(s.phase, HELD);
  s = touchAdvance(s, 0.01, true, p);
  assert.equal(s.phase, RUN, 'lifted');
  s = touchAdvance(s, 0.2, true, { ...p, touch: true });
  assert.equal(s.sensed, 0, '200 ms is not yet the 220');
  s = touchAdvance(s, 0.03, true, { ...p, touch: true });
  assert.equal(s.sensed, 1);
  const fast = touchAdvance({ phase: RUN, clock: 0, sensed: 0, level: 0 }, 0.07, true, { ...p, touch: true, fast: true });
  assert.equal(fast.sensed, 1, '60 ms in fast mode');
  let t = { phase: RUN, clock: 0, sensed: 0, level: 0 };
  for (const touched of [true, false, true, false]) t = touchAdvance(t, 0.3, true, { ...p, toggle: true, touch: touched });
  assert.equal(t.level, 0, 'two touches in toggle mode are back to the start');
  assert.equal(touchAdvance({ phase: RUN, clock: 0.1, sensed: 0, level: 0 }, 0.05, true, { ...p, touch: false }).clock, 0, 'a touch shorter than the response is not registered');
});

test('touch: momentary SIG follows touch 220 ms late (check 40), 60 ms in fast mode (check 41)', () => {
  const r = run(touchEngine(), [[1, touch(true)], [3, touch(false)]], [0.9, 1.15, 1.3, 3.15, 3.3], (p) => p.vout);
  near(r[0.9], 0, 0.05, 'before');
  near(r[1.15], 0, 0.05, 'not yet at 1.15 (due 1.22)');
  near(r[1.3], 3.3, 0.05, 'high at 1.3');
  near(r[3.15], 3.3, 0.05, 'still high at 3.15 (due 3.22)');
  near(r[3.3], 0, 0.05, 'low at 3.3');
  const f = run(touchEngine({ fast: true }), [[1, touch(true)], [3, touch(false)]], [1.03, 1.1, 3.03, 3.1], (p) => p.vout);
  near(f[1.03], 0, 0.05, 'fast: not yet at 1.03');
  near(f[1.1], 3.3, 0.05, 'high at 1.1');
  near(f[3.03], 3.3, 0.05, 'still high at 3.03');
  near(f[3.1], 0, 0.05, 'low at 3.1');
});

test('touch: toggle flips on each touch (check 42); the first 0.5 s and a finger held at power on are ignored (check 43)', () => {
  const r = run(touchEngine({ mode: 'toggle' }), [[1, touch(true)], [1.5, touch(false)], [2, touch(true)], [2.5, touch(false)], [3, touch(true)], [3.5, touch(false)]], [0.9, 1.9, 2.9, 3.9], (p) => p.vout);
  near(r[0.9], 0, 0.05, 'start');
  near(r[1.9], 3.3, 0.05, 'high after the first touch');
  near(r[2.9], 0, 0.05, 'low after the second');
  near(r[3.9], 3.3, 0.05, 'high after the third');
  const early = run(touchEngine(), [[0.1, touch(true)], [0.4, touch(false)]], [0.6, 1], (p) => p.vout);
  near(early[0.6], 0, 0.05, 'a touch inside the first 0.5 s did nothing');
  const held = run(touchEngine({ touch: true }), [], [0.3, 1, 5], (p) => p.vout);
  for (const t of [0.3, 1, 5]) near(held[t], 0, 0.05, `held from power on, ${t}`);
  const freed = touchEngine({ touch: true });
  assert.ok(freed.start('dc', H));
  for (let k = 0; k < 100; k++) freed.advance(H);
  assert.ok(freed.set('U1', 'touch', false));
  for (let k = 0; k < 30; k++) freed.advance(H);
  assert.ok(freed.set('U1', 'touch', true));
  for (let k = 0; k < 30; k++) freed.advance(H);
  near(freed.read().parts.U1.vout, 3.3, 0.05, 'lifted and touched again');
});

test('touch: SIG is as high as the supply (check 44), active low swaps the levels, a supply over 5.5 V is a stress', () => {
  const r = run(touchEngine({}, 5), [[1, touch(true)]], [2], (p) => p.vout);
  near(r[2], 5, 0.1, 'SIG at 5 V');
  const low = run(touchEngine({ activeLow: true }), [[1, touch(true)]], [0.9, 1.5], (p) => p.vout);
  near(low[0.9], 3.3, 0.05, 'active low: high at rest');
  near(low[1.5], 0, 0.05, 'low while touched');
  const six = simulate(autoLayout({ parts: [{ id: 'U1', type: 'touch-sensor' }], nets: [['T+', 'U1.VCC'], ['U1.GND', 'T-']], supplies: [{ id: 'V1', kind: 'bench', voltage: 6, positive: 'T+', negative: 'T-' }] }).circuit);
  assert.ok(six.issues.some((i) => i.code === 'SIM_IC_SUPPLY'));
});

// ── what the page needs ────────────────────────────────────────────────────────────────────

test('timed sensors run in real time and ask for fine steps while they time', () => {
  const pir = pirEngine({ warmup: 0 });
  assert.ok(pir.start('dc', H));
  assert.equal(pir.stepHint(), null, 'waiting for motion needs no more than the page');
  assert.ok(pir.set('environment', 'motion', true));
  assert.equal(pir.stepHint(), 0.01, 'while it times, 10 ms');
  const pace = paceOf(pir.timeConstants(), pir.periods(), false, pir.stimuli());
  assert.ok(pace.h > 0 && pace.perSecond === 1, 'real time, not a static page');
  assert.ok(pace.h >= 0.001 && pace.h <= 0.02);
  const t = touchEngine();
  assert.ok(t.start('dc', H));
  assert.ok(paceOf(t.timeConstants(), t.periods(), false, t.stimuli()).h > 0);
});

test('the card says the phase and the time left in words, in both languages', () => {
  const e = pirEngine();
  assert.ok(e.start('dc', H));
  for (let k = 0; k < 500; k++) e.advance(H);
  const reading = e.read().parts.U1;
  const words = (lang) => {
    const table = { en: { 'sim.pir.warmup': 'warming up · {time} left' }, es: {} };
    return linesFor(reading, { t: (key, params) => (table[lang]?.[key] ?? key).replace('{time}', params?.time ?? ''), decimal: '.' })[0].text;
  };
  assert.match(words('en'), /warming up · 25 s left|warming up · 24\.9\d* s left/);
  assert.equal(reading.state, 'warmup');
  near(reading.left, 25, 0.02, 'the warm-up left at 5 s');
});

// ── the part ──────────────────────────────────────────────────────────────────────────────

test('the types are sensors with their pins and the fields they take', () => {
  assert.deepEqual(resolvePart({ id: 'U1', part: 'PIR' }).part.type, 'pir-sensor');
  assert.deepEqual(resolvePart({ id: 'U1', part: 'HC-SR501' }).part.type, 'pir-sensor');
  assert.deepEqual(resolvePart({ id: 'U1', part: 'TTP223' }).part.type, 'touch-sensor');
  const bad = (part) => buildCircuit({ parts: [{ id: 'U1', pins: ['h2', 'h3', 'h4'], ...part }] }).issues.map((i) => i.code);
  assert.ok(bad({ type: 'pir-sensor', delay: 1000 }).includes('BAD_VALUE'));
  assert.ok(bad({ type: 'pir-sensor', mode: 'X' }).includes('UNKNOWN_KIND'));
  assert.ok(bad({ type: 'touch-sensor', mode: 'press' }).includes('UNKNOWN_KIND'));
  assert.ok(!bad({ type: 'pir-sensor', delay: 30, mode: 'l', warmup: 0, motion: true }).includes('BAD_VALUE'));
});

test('both modules render in both views, inspect clean, say which face is which and have symbol and inside view', () => {
  const circuit = { parts: [{ id: 'U1', type: 'pir-sensor', pins: ['h5', 'h6', 'h7'] }, { id: 'U2', type: 'touch-sensor', pins: ['h20', 'h21', 'h22'] }] };
  for (const view of ['front', 'back']) {
    const { svg } = renderCircuit(circuit, { view });
    assert.ok(!/NaN/.test(svg), `${view}: NaN in the drawing`);
    const report = inspectCircuit(circuit, { view });
    const bad = report.problems.filter((p) => p.severity === 'error');
    assert.deepEqual(bad, [], `${view}: ${JSON.stringify(bad)}`);
  }
  const built = buildCircuit(circuit);
  const [pir, tch] = ['U1', 'U2'].map((id) => built.parts.find((p) => p.id === id));
  for (const [part, order] of [[pir, 'VCC OUT GND'], [tch, 'I/O VCC GND']]) {
    const front = pinoutOf(part, createCamera({ view: 'front' }), 'en').mark.text;
    const back = pinoutOf(part, createCamera({ view: 'back' }), 'en').mark.text;
    assert.match(front, /^Printed face (toward you|away from you): .* from the left$/);
    assert.notEqual(front.split(':')[0], back.split(':')[0], 'the face the other way round in the other view');
    assert.ok([front, back].some((t) => t.endsWith(`: ${order} from the left`)), `${part.id} reads ${order} from one side`);
    assert.ok(symbolOf(part) && insideOf(part), part.id);
  }
  assert.equal(pinoutOf(pir, createCamera({ view: 'front' }), 'es').mark.text.startsWith('Cara impresa'), true);
  assert.deepEqual(insideOf(pir), { kind: 'pir', ids: ['VCC', 'OUT', 'GND'], delay: 5, mode: 'H', warmup: 30 });
  assert.deepEqual(insideOf(tch), { kind: 'touch', ids: ['I/O', 'VCC', 'GND'], toggle: false, activeLow: false, fast: false });
});

// ── the recipes ───────────────────────────────────────────────────────────────────────────

test('the four recipes are ready, clean, and react to the environment', () => {
  for (const name of ['pir-lamp', 'pir-uno', 'touch-toggle-led', 'touch-uno']) {
    const { spec } = expandRecipe(name);
    assert.ok(RECIPES[name] && spec.environment && spec.page?.controls?.length, `${name}: an environment and its controls`);
    const r = autoLayout(spec);
    assert.equal(r.status, 'done', name);
    const errors = checkCircuit(r.circuit).issues.filter((i) => i.severity === 'error');
    assert.deepEqual(errors, [], name);
  }
});

test('pir-lamp: motion lights the lamp, it stays on for the delay, then goes out', () => {
  const circuit = autoLayout(expandRecipe('pir-lamp').spec).circuit;
  const e = createEngine(compile(circuit).program);
  assert.ok(e.start('dc', H));
  const lamp = () => e.read().parts.D1.brightness;
  for (let k = 0; k < 100; k++) e.advance(H);
  assert.ok(lamp() < 0.01, 'dark at rest');
  assert.ok(e.set('environment', 'motion', true));
  for (let k = 0; k < 100; k++) e.advance(H);
  assert.ok(lamp() > 0.3, `lit: ${lamp()}`);
  assert.ok(e.set('environment', 'motion', false));
  for (let k = 0; k < 450; k++) e.advance(H);
  assert.ok(lamp() > 0.3, 'still lit 4.5 s after the motion ended');
  for (let k = 0; k < 100; k++) e.advance(H);
  assert.ok(lamp() < 0.01, 'out after the 5 s delay');
});

test('touch-toggle-led: each touch flips the LED, and its current stays under the 4 mA of the guaranteed high level', () => {
  const circuit = autoLayout(expandRecipe('touch-toggle-led').spec).circuit;
  const e = createEngine(compile(circuit).program);
  assert.ok(e.start('dc', H));
  for (let k = 0; k < 100; k++) e.advance(H);
  assert.ok(e.set('environment', 'touch', true));
  for (let k = 0; k < 50; k++) e.advance(H);
  assert.ok(e.set('environment', 'touch', false));
  for (let k = 0; k < 100; k++) e.advance(H);
  const on = e.read().parts;
  assert.ok(on.D1.current > 2e-3 && on.D1.current < 4e-3, `LED at ${on.D1.current} A`);
  assert.ok(!(on.U1.stress ?? []).some((s) => s.level === 'exceeded'));
  assert.ok(e.set('environment', 'touch', true));
  for (let k = 0; k < 50; k++) e.advance(H);
  assert.ok(e.read().parts.D1.current < 1e-4, 'flipped back off');
});
