// The analog chips the kit used to draw only (C11b): the ULN2003 and ULN2803 Darlington arrays, the
// PC817 optocoupler and the LM386 audio amplifier, each against its datasheet; and the regulators'
// maximum input. Each circuit is laid out once and shared by its tests.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { autoLayout } from './layout-generous.js';
import { simulate, checkHazards, compile } from '../src/sim/index.js';
import { catalogEntry, formatCatalogEntry, simulates } from '../src/node/catalog.js';

const root = new URL('../', import.meta.url).pathname;
const cli = (...args) => spawnSync(process.execPath, [join(root, 'bin/protoboard-iso.js'), ...args], { encoding: 'utf8', timeout: 120_000 });
const near = (actual, expected, tol, what) => assert.ok(Math.abs(actual - expected) <= tol, `${what}: ${actual} vs ${expected} (± ${tol})`);
const codes = (list) => list.map((i) => i.code);
const once = (make) => {
  let done = null;
  return () => (done ??= make());
};
// The same placed circuit with some parts' fields changed (the placement does not move).
const withParts = (circuit, changes) => ({ ...circuit, parts: circuit.parts.map((p) => (changes[p.id] ? { ...p, ...changes[p.id] } : p)) });
const HIGH_D8 = 'void setup(){ pinMode(8, OUTPUT); digitalWrite(8, HIGH); } void loop(){}';
const LOW_D8 = 'void setup(){ pinMode(8, OUTPUT); digitalWrite(8, LOW); } void loop(){}';

// ---- ULN2003 / ULN2803

// A UNO's D8 into IN1, a 5 V relay coil from 5 V to OUT1, COM on that 5 V (or left open).
const relaySpec = (com) => ({
  parts: [{ id: 'U1', part: 'UNO', program: HIGH_D8 }, { id: 'U2', part: 'ULN2003' }, { id: 'K1', part: 'SRD-05VDC-SL-C' }],
  nets: [['U1.D8', 'U2.IN1'], ['U2.OUT1', 'K1.A2'], ['U1.5V', 'K1.A1', ...(com ? ['U2.COM'] : [])], ['U2.GND', 'U1.GND']],
});
const relayCom = once(() => autoLayout(relaySpec(true)));
const relayOpen = once(() => autoLayout(relaySpec(false)));

test('ULN2003: a UNO pin high pulls a relay in through OUT1, low lets it drop; COM wired is its flyback diode', () => {
  const r = relayCom();
  assert.equal(r.review.verdict, 'approved', JSON.stringify(r.review.doubts));
  assert.ok(!codes(r.review.doubts).includes('COIL_NO_FLYBACK'));
  const on = simulate(r.circuit);
  assert.ok(on.ok);
  assert.equal(on.parts.K1.closed, true, 'pin high: pulled in');
  assert.equal(on.parts.U2.channels[0].on, true);
  // The coil (70 Ω) from 5 V across a saturated channel: about (5 − 0.8) / 70 = 60 mA.
  near(on.parts.U2.channels[0].current, 0.06, 0.006, 'coil current');
  assert.ok(on.parts.U2.pins.OUT1 > 0.6 && on.parts.U2.pins.OUT1 < 1.1, `OUT1 at ${on.parts.U2.pins.OUT1} V`);
  const off = simulate(withParts(r.circuit, { U1: { program: LOW_D8 } }));
  assert.equal(off.parts.K1.closed, false, 'pin low: released');
  assert.equal(off.parts.U2.channels[0].on, false);
});

test('ULN2003: with COM not connected the coil has no flyback diode (a doubt naming the chip)', () => {
  const r = relayOpen();
  const doubt = r.review.doubts.find((d) => d.code === 'COIL_NO_FLYBACK');
  assert.ok(doubt, JSON.stringify(r.review.doubts));
  assert.deepEqual([doubt.params.part, doubt.params.by], ['K1', 'U2']);
});

test('ULN2003: switching off the coil, the clamp diode to COM holds OUT1 about a diode above 5 V', () => {
  const { circuit } = relayCom();
  const blink = 'void setup(){ pinMode(8, OUTPUT); } void loop(){ digitalWrite(8, HIGH); delay(50); digitalWrite(8, LOW); delay(50); }';
  const r = simulate(withParts(circuit, { U1: { program: blink } }), { analysis: 'transient', stop: 0.12, step: 1e-4, points: 240 });
  assert.ok(r.ok, JSON.stringify(r.issues));
  const node = compile(circuit).program.devices.find((d) => d.id === 'U2').pins.find((p) => p.name === 'OUT1').node;
  const out = r.nodes[node];
  const top = Math.max(...out);
  // 5 V and the clamp's forward voltage at the coil's 60 mA (n = 2.5, Is = 1 pA: about 1.5 V).
  assert.ok(top > 5.5 && top < 7.5, `OUT1 peaks at ${top} V`);
});

// The datasheet's VCE(sat): 12 V through a load resistor into OUT1, the input fed through 22 kΩ from
// the same 12 V (about 0.4 mA, the datasheet's 250–500 µA of input).
const satLayout = once(() =>
  autoLayout({
    supplies: [{ id: 'V1', voltage: 12 }],
    parts: [{ id: 'U1', part: 'ULN2003' }, { id: 'R1', type: 'resistor', value: '22k' }, { id: 'R2', type: 'resistor', value: '120', power: 25 }],
    nets: [['T+', 'R1.1', 'R2.1'], ['R1.2', 'U1.IN1'], ['R2.2', 'U1.OUT1'], ['U1.GND', 'T-']],
  }),
);

test('ULN2003: VCE(sat) against the datasheet at 100, 200 and 350 mA (typical 0.9, 1.0, 1.2 V)', () => {
  const { circuit } = satLayout();
  for (const [load, want] of [['117', 0.9], ['56', 1.0], ['31', 1.2]]) {
    const r = simulate(withParts(circuit, { R2: { value: load } }));
    assert.ok(r.ok);
    const ch = r.parts.U1.channels[0];
    near(ch.vout, want, 0.15, `VCE(sat) with ${load} Ω (${(ch.current * 1e3).toFixed(0)} mA)`);
  }
});

test('ULN2003: 400 mA in one channel is within its limits, 700 mA is a hazard naming the channel', () => {
  const { circuit } = satLayout();
  const fine = checkHazards(withParts(circuit, { R2: { value: '27' } }));
  assert.ok(!fine.hazards.some((h) => String(h.params.part).startsWith('U1')), JSON.stringify(fine.hazards));
  const over = checkHazards(withParts(circuit, { R2: { value: '15' } }));
  const h = over.hazards.find((x) => x.code === 'SIM_OVER_CURRENT' && x.params.part === 'U1.OUT1');
  assert.ok(h, JSON.stringify(over.hazards));
});

// ULN2803: two LEDs from 5 V to OUT1 and OUT2, IN1 from a UNO pin, IN2 left open.
const ledsLayout = once(() =>
  autoLayout({
    parts: [{ id: 'U1', part: 'UNO', program: HIGH_D8 }, { id: 'U2', part: 'ULN2803' }, { id: 'R1', type: 'resistor', value: '220' }, { id: 'D1', type: 'led', color: 'red' }, { id: 'R2', type: 'resistor', value: '220' }, { id: 'D2', type: 'led', color: 'red' }],
    nets: [['U1.D8', 'U2.IN1'], ['U1.5V', 'R1.1', 'R2.1'], ['R1.2', 'D1.A'], ['D1.K', 'U2.OUT1'], ['R2.2', 'D2.A'], ['D2.K', 'U2.OUT2'], ['U2.GND', 'U1.GND']],
  }),
);

test('ULN2803: an LED on a channel driven high is lit with OUT at 0.6–1.2 V; an input left open is off', () => {
  const r = ledsLayout();
  const s = simulate(r.circuit);
  assert.ok(s.ok);
  // (5 − 2 − 0.75) / 220 ≈ 10 mA.
  near(s.parts.D1.current, 0.01, 0.003, 'D1');
  assert.ok(s.parts.U2.pins.OUT1 > 0.6 && s.parts.U2.pins.OUT1 < 1.2, `OUT1 ${s.parts.U2.pins.OUT1}`);
  assert.ok(Math.abs(s.parts.D2.current) < 1e-6, `D2 carries ${s.parts.D2.current}`);
  const low = simulate(withParts(r.circuit, { U1: { program: LOW_D8 } }));
  assert.ok(Math.abs(low.parts.D1.current) < 1e-6, 'D1 follows its pin');
});

test('catalog: the Darlington arrays are simulated, with their limits and what the model covers', () => {
  for (const n of ['ULN2003', 'ULN2803']) {
    assert.equal(simulates({ type: 'ic', part: n }), true, n);
    const text = formatCatalogEntry(catalogEntry(n), 'en');
    assert.doesNotMatch(text, /Not simulated/);
    assert.match(text, /Simulated: each channel/);
    assert.match(text, /maximum current 500 mA \(OUT1/);
    assert.match(text, /maximum current 2\.5 A/);
  }
});
