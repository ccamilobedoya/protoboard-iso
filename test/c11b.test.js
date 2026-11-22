// The analog chips the kit used to draw only (C11b): the ULN2003 and ULN2803 Darlington arrays, the
// PC817 optocoupler and the LM386 audio amplifier, each against its datasheet; and the regulators'
// maximum input. Each circuit is laid out once and shared by its tests.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import { autoLayout } from './layout-generous.js';
import { simulate, checkHazards, compile } from '../src/sim/index.js';
import { catalogEntry, formatCatalogEntry, simulates } from '../src/node/catalog.js';
import { renderPage } from '../src/page.js';
import { installClock } from './clock.js';

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

// ---- PC817

// A 9 V battery, a button and 680 Ω light the LED; a 5 V bench supply with its own ground, 1 kΩ to C,
// E to that ground. No net is shared between the two sides.
const optoSpec = (reversed = false) => ({
  supplies: [{ id: 'V1', voltage: 5, positive: 'R2.1', negative: 'U1.E' }],
  parts: [{ id: 'BT1', type: 'battery', format: '9V' }, { id: 'S1', type: 'button' }, { id: 'R1', type: 'resistor', value: '680' }, { id: 'U1', part: 'PC817' }, { id: 'R2', type: 'resistor', value: '1k' }],
  nets: [['BT1.+', 'S1.1'], ['S1.3', 'R1.1'], reversed ? ['R1.2', 'U1.K'] : ['R1.2', 'U1.A'], reversed ? ['U1.A', 'BT1.-'] : ['U1.K', 'BT1.-'], ['R2.2', 'U1.C']],
});
const opto = once(() => autoLayout(optoSpec()));
const pressed = (circuit, extra = {}) => withParts(circuit, { S1: { pressed: true }, ...extra });

test('PC817: two sides with their own supplies and grounds simulate; released C sits at 5 V, pressed under 0.5 V', () => {
  const r = opto();
  assert.equal(r.review.verdict, 'approved', JSON.stringify(r.review.doubts));
  const rest = simulate(r.circuit);
  assert.ok(rest.ok);
  near(rest.parts.U1.pins.C, 5, 0.01, 'collector, LED dark');
  const on = simulate(pressed(r.circuit));
  assert.ok(on.ok);
  assert.ok(on.parts.U1.pins.C < 0.5, `collector ${on.parts.U1.pins.C} V`);
  // (9 − 1.2) / 680 = 11.5 mA (the battery's own resistance takes a little).
  near(on.parts.U1.input.current, 0.0115, 0.0115 * 0.15, 'LED current');
  // Each side against its own ground: the output's E reads 0 V, the input's K too.
  near(on.parts.U1.output.voltage, on.parts.U1.pins.C - on.parts.U1.pins.E, 1e-9, 'output side');
  assert.equal(on.parts.U1.state, 'saturated');
});

test('PC817 against its datasheet: VF 1.2 V at 20 mA, collector current CTR × IF while not saturated', () => {
  const { circuit } = opto();
  // 20 mA: (9 − 1.2 − 20 mA · 1.5 Ω of battery) / 20 mA ≈ 389 Ω.
  const s = simulate(pressed(circuit, { R1: { value: '390' } }));
  near(s.parts.U1.input.voltage, 1.2, 0.05, 'VF at 20 mA');
  // 5 mA in, 100 Ω load: 1.7 × 5 mA = 8.5 mA leaves 4.15 V across C–E (active).
  const a = simulate(pressed(circuit, { R1: { value: '1.5k' }, R2: { value: '100' } }));
  assert.equal(a.parts.U1.state, 'active');
  near(a.parts.U1.output.current / a.parts.U1.input.current, 1.7, 0.02, 'CTR');
});

test('PC817: 100 mA through its LED is a hazard on the chip; its LED reversed at 9 V is a reverse hazard', () => {
  const { circuit } = opto();
  const hot = checkHazards(pressed(circuit, { R1: { value: '75' } }));
  assert.ok(hot.hazards.some((h) => h.code === 'SIM_OVER_CURRENT' && h.params.part === 'U1'), JSON.stringify(hot.hazards));
  const back = autoLayout(optoSpec(true));
  const rev = checkHazards(pressed(back.circuit));
  assert.ok(rev.hazards.some((h) => h.code === 'SIM_REVERSE_VOLTAGE' && h.params.part === 'U1'), JSON.stringify(rev.hazards));
});

test('catalog: the PC817 is simulated and says its CTR is the middle of a wide range', () => {
  const text = formatCatalogEntry(catalogEntry('PC817'), 'en');
  assert.doesNotMatch(text, /Not simulated/);
  assert.match(text, /170 %/);
  assert.match(text, /maximum current 50 mA \(LED\)/);
  assert.match(text, /maximum reverse voltage 6 V \(LED\)/);  assert.doesNotMatch(cli('catalog', 'PC817').stdout, /not simulated/i, 'the CLI says it too');
});

// ---- LM386

// 9 V, the generator through 10 µF into IN+ (IN− to GND), the output through 220 µF into 8 Ω; with
// `gain`, what goes between pins 1 and 8 (a 10 µF capacitor, alone or with a resistor in series).
const ampSpec = ({ amplitude = 0.05, gain = null } = {}) => ({
  supplies: [{ id: 'V1', voltage: 9 }, { id: 'G1', kind: 'generator', waveform: 'sine', frequency: 1000, amplitude, positive: 'C1.+', negative: 'T-' }],
  parts: [
    { id: 'C1', type: 'capacitor', kind: 'electrolytic', value: '10u' },
    { id: 'U1', part: 'LM386' },
    { id: 'C2', type: 'capacitor', kind: 'electrolytic', value: '220u' },
    { id: 'R1', type: 'resistor', value: '8', power: 1 },
    ...(gain ? [{ id: 'C3', type: 'capacitor', kind: 'electrolytic', value: '10u' }, ...(gain.resistor ? [{ id: 'R2', type: 'resistor', value: gain.resistor }] : [])] : []),
  ],
  nets: [
    ['C1.-', 'U1.IN+'], ['U1.IN-', 'T-'], ['U1.GND', 'T-'], ['U1.VS', 'T+'], ['U1.OUT', 'C2.+'], ['C2.-', 'R1.1'], ['R1.2', 'T-'],
    ...(gain ? (gain.resistor ? [['U1.GAIN1', 'R2.1'], ['R2.2', 'C3.+'], ['C3.-', 'U1.GAIN8']] : [['U1.GAIN1', 'C3.+'], ['C3.-', 'U1.GAIN8']]) : []),
  ],
});
const amp20 = once(() => autoLayout(ampSpec()));
const amp200 = once(() => autoLayout(ampSpec({ amplitude: 0.005, gain: {} })));
const ampMid = once(() => autoLayout(ampSpec({ amplitude: 0.01, gain: { resistor: '1.2k' } })));
// The load's voltage over the last 3 ms of a 5 ms transient from the DC point: its peak and the
// frequency from its rising zero crossings.
function swing(circuit) {
  const r = simulate(circuit, { analysis: 'transient', stop: 0.005, step: 5e-6, start: 'dc', points: 1000 });
  assert.ok(r.ok, JSON.stringify(r.issues));
  const from = r.times.findIndex((t) => t >= 0.002);
  const v = r.parts.R1.voltage.slice(from);
  const t = r.times.slice(from);
  const ups = [];
  for (let i = 1; i < v.length; i++) if (v[i - 1] < 0 && v[i] >= 0) ups.push(t[i - 1] + ((t[i] - t[i - 1]) * -v[i - 1]) / (v[i] - v[i - 1]));
  return { peak: (Math.max(...v) - Math.min(...v)) / 2, frequency: (ups.length - 1) / (ups.at(-1) - ups[0]) };
}

test('LM386: at rest its output sits at half the supply; gain 20 with pins 1 and 8 open (1 V peak from 50 mV at 1 kHz)', () => {
  const r = amp20();
  assert.equal(r.review.verdict, 'approved', JSON.stringify(r.review.doubts));
  const dc = simulate(r.circuit);
  near(dc.parts.U1.pins.OUT, 4.5, 0.1, 'OUT at rest');
  const s = swing(r.circuit);
  // 2 · 15 kΩ / (150 Ω + 1.35 kΩ) = 20: 50 mV → 1.0 V.
  near(s.peak, 1.0, 0.1, 'peak across 8 Ω');
  near(s.frequency, 1000, 20, 'frequency');
});

test('LM386: 10 µF between pins 1 and 8 gives about 200; with 1.2 kΩ in series, the datasheet formula', () => {
  // 2 · 15 kΩ / (150 Ω + |Z|): the 10 µF is 16 Ω at 1 kHz (about 180); with 1.2 kΩ, 1.35 kΩ ∥ 1.2 kΩ
  // = 635 Ω: 2 · 15k / 785 = 38.
  near(swing(amp200().circuit).peak, 0.005 * 180, 0.005 * 25, 'gain about 200');
  near(swing(ampMid().circuit).peak, 0.01 * 38.2, 0.01 * 3, 'gain 38');
});

test('LM386: under its 4 V minimum a doubt; its output shorted to GND a hazard; over 15 V a hazard', () => {
  const bare = (voltage, short = false) => autoLayout({ supplies: [{ id: 'V1', voltage }], parts: [{ id: 'U1', part: 'LM386' }], nets: [['U1.IN-', 'T-'], ['U1.IN+', 'T-'], ['U1.GND', 'T-'], ['U1.VS', 'T+'], ...(short ? [['U1.OUT', 'T-']] : [])] });
  const low = bare(9);
  const at = (v) => checkHazards({ ...low.circuit, supplies: low.circuit.supplies.map((x) => ({ ...x, voltage: v })) });
  assert.ok(at(3).doubts.some((d) => d.code === 'SIM_IC_SUPPLY_RANGE' && d.params.part === 'U1'));
  assert.deepEqual(at(9).doubts, []);
  assert.ok(at(16).hazards.some((h) => h.code === 'SIM_IC_SUPPLY' && h.params.part === 'U1'));
  const shorted = checkHazards(bare(9, true).circuit);
  assert.ok(shorted.hazards.some((h) => h.code === 'SIM_OVER_POWER' && h.params.part === 'U1'), JSON.stringify(shorted.hazards));
});

test('catalog: the LM386 is simulated, says what it leaves out and that an 8 Ω resistor stands for a speaker', () => {
  const text = formatCatalogEntry(catalogEntry('LM386'), 'en');
  assert.doesNotMatch(text, /Not simulated/);
  assert.match(text, /gain of 20/);
  assert.match(text, /8 Ω resistor/);
  assert.match(text, /maximum power 1\.25 W/);
  assert.match(text, /maximum voltage 15 V \(supply\)/);
});

// ---- The live page (jsdom)

const example = (name) => JSON.parse(readFileSync(join(root, 'examples', name), 'utf8'));
async function loadPage(html) {
  let JSDOM;
  try {
    ({ JSDOM } = await import('jsdom'));
  } catch {
    return null;
  }
  const { window } = new JSDOM(html, { runScripts: 'outside-only', url: 'https://page.test/chip.html' });
  const rect = () => ({ left: 0, top: 0, right: 800, bottom: 500, width: 800, height: 500 });
  window.document.querySelector('main').getBoundingClientRect = rect;
  for (const svg of window.document.querySelectorAll('svg')) svg.getBoundingClientRect = rect;
  window.testClock = installClock(window);
  window.eval(html.match(/<script>([\s\S]*)<\/script>/)[1]);
  return window;
}

test('page: the PC817 example runs in the page, each side on its own ground; pressing the button lights the LED', async (t) => {
  const window = await loadPage(renderPage(example('pc817-isolated-led.json'), { lang: 'en' }).html);
  if (!window) return t.skip('jsdom not installed');
  const live = window.protoboardLive;
  assert.equal(live.reading.parts.U1.state, 'dark');
  assert.ok(Math.abs(live.reading.parts.D1.current) < 1e-6);
  live.set('S1', 'pressed', true);
  live.tick(50, 4);
  assert.equal(live.reading.parts.U1.state, 'saturated');
  assert.ok(live.reading.parts.D1.current > 5e-3, `D1 ${live.reading.parts.D1.current}`);
});

test('page: the LM386 example amplifies in the page: the load\'s voltage swings about 1 V', async (t) => {
  const window = await loadPage(renderPage(example('lm386-amplifier.json'), { lang: 'en' }).html);
  if (!window) return t.skip('jsdom not installed');
  const live = window.protoboardLive;
  near(live.reading.parts.U1.pins.OUT, 4.5, 0.1, 'OUT at rest');
  const seen = [];
  for (let k = 0; k < 60; k++) {
    live.tick(16);
    seen.push(live.reading.parts.R1.voltage);
  }
  const top = Math.max(...seen.map(Math.abs));
  assert.ok(top > 0.5 && top < 1.2, `load peaks at ${top} V`);
});
