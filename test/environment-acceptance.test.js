// Acceptance tests for the environment system (shared fields such as light and temperature that
// sensors follow; programs that move them over time), written from the contract alone:
// registry and programs (src/sim/environment.js), `environment` in a circuit and what `check` says
// about it, the sensors that follow a field, the engine's controls, the timeline's `set` and
// `gauge`, the examples, and a few physics sanity checks derived from first principles.
// The page side is in verify-environment-page.test.js.
//
// The module under test is imported inside each test, so a missing module fails that test
// alone, with the import error.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { checkCircuit } from '../src/index.js';
import { simulate, compile, createEngine } from '../src/sim/index.js';
import { partLines } from '../src/sim/format.js';
import { tourIssues, loadTour } from '../src/tour.js';
import { CIRCUIT_FOLDER } from '../src/beside.js';
import { LANGUAGES } from '../src/i18n/index.js';
import { ntcResistance, ldrResistance, LDR_PARTS } from '../src/parts/sensors.js';
import { goldenCases, computeGolden } from './golden/cases.js';
import { compareGolden } from './golden/compare.js';

const loadEnv = () => import('../src/sim/environment.js');
const examples = fileURLToPath(new URL('../examples/', import.meta.url));
const exampleFile = (name) => `${examples}${name}`;
const example = (name) => Object.defineProperty(JSON.parse(readFileSync(exampleFile(name), 'utf8')), CIRCUIT_FOLDER, { value: examples });
const codes = (issues) => issues.map((i) => i.code);
const close = (a, b, rel = 1e-9) => Math.abs(a - b) <= rel * Math.max(Math.abs(a), Math.abs(b), 1e-12);
const near = (actual, expected, tol, what) => assert.ok(Math.abs(actual - expected) <= tol, `${what}: ${actual} vs ${expected} (± ${tol})`);
const engineOf = (circuit) => {
  const e = createEngine(compile(circuit).program);
  assert.ok(e.start('dc'));
  return e;
};
const envCodes = (circuit) => codes(checkCircuit(circuit).issues).filter((c) => c.startsWith('ENV_'));

// 5 V, one sensor between columns 10 and 11 (row e), and a resistor from column 11 to ground.
const supply = [{ id: 'V1', voltage: 5 }];
const rail = [{ id: 'W1', type: 'wire', color: 'red', pins: ['T+10', 'a10'] }];
const ldrCircuit = (own = {}, environment) => ({
  supplies: supply,
  ...(environment && { environment }),
  parts: [...rail, { id: 'LDR1', type: 'ldr', part: 'GL5528', pins: ['e10', 'e11'], ...own }, { id: 'R1', type: 'resistor', value: '10k', pins: ['a11', 'T-12'] }],
});
const thermistorCircuit = (own = {}, environment) => ({
  supplies: supply,
  ...(environment && { environment }),
  parts: [...rail, { id: 'RT1', type: 'thermistor', value: '10k', pins: ['e10', 'e11'], ...own }, { id: 'R1', type: 'resistor', value: '10k', pins: ['a11', 'T-12'] }],
});
// An LM35: +VS on T+, GND on T−, VOUT into a light load (1 MΩ).
const lm35Circuit = (own = {}, environment) => ({
  supplies: supply,
  ...(environment && { environment }),
  parts: [
    { id: 'U1', type: 'temperature-sensor', part: 'LM35DZ', pins: ['e10', 'e11', 'e12'], ...own },
    { id: 'W1', type: 'wire', color: 'red', pins: ['T+10', 'a10'] },
    { id: 'W2', type: 'wire', color: 'black', pins: ['a12', 'T-12'] },
    { id: 'R1', type: 'resistor', value: '1M', pins: ['c11', 'c15'] },
    { id: 'W3', type: 'wire', color: 'black', pins: ['a15', 'T-15'] },
  ],
});
const tiltCircuit = (own = {}, environment) => ({
  supplies: supply,
  ...(environment && { environment }),
  parts: [...rail, { id: 'S1', type: 'tilt-switch', pins: ['e10', 'e11'], ...own }, { id: 'R1', type: 'resistor', value: '1k', pins: ['a11', 'T-12'] }],
});
const run = (circuit) => {
  const r = simulate(circuit);
  assert.ok(r.ok, `simulation ran: ${JSON.stringify(r.issues)}`);
  return r;
};
const GL5528 = LDR_PARTS.GL5528;
const NTC = { r25: 10e3, beta: 3950 };

// ---------------------------------------------------------------- 1. the registry

// The fourteen fields of the environment's contract, the two the LM393 sensor modules added at the end
// (reflectance for the line follower, beam for the optical slot), and the library sensors' pressure.
test('environment: FIELDS lists exactly the seventeen fields', async () => {
  const { FIELDS } = await loadEnv();
  assert.deepEqual(Object.keys(FIELDS).sort(), ['angle', 'beam', 'distance', 'field', 'humidity', 'light', 'moisture', 'motion', 'pressure', 'rain', 'reflectance', 'sound', 'temperature', 'tilt', 'touch', 'vibration', 'water']);
  assert.deepEqual(Object.keys(FIELDS).slice(-3), ['reflectance', 'beam', 'pressure']);
});

test('environment: FIELDS gives each field its unit, range, limit, scale and default', async () => {
  const { FIELDS } = await loadEnv();
  const level = { light: ['lx', 0.1, 10000, 300], temperature: ['°C', -20, 100, 25], humidity: ['%RH', 0, 100, 50], moisture: ['%', 0, 100, 30], water: ['mm', 0, 40, 0], distance: ['cm', 2, 400, 50], field: ['G', -500, 500, 0], sound: ['dB', 30, 110, 40], angle: ['°', 0, 360, 0] };
  for (const [name, [unit, min, max, value]] of Object.entries(level)) {
    const f = FIELDS[name];
    assert.deepEqual([f.unit, f.min, f.max, f.default, f.kind], [unit, min, max, value, 'level'], name);
  }
  assert.equal(FIELDS.light.scale, 'log');
  assert.deepEqual(FIELDS.light.limit, [0, 1e6]);
  assert.equal(FIELDS.temperature.scale, 'linear');
  assert.deepEqual(FIELDS.temperature.limit, [-55, 150]);
  assert.equal(FIELDS.temperature.step, 1);
  assert.equal(FIELDS.distance.scale, 'linear');
  for (const name of ['rain', 'motion', 'touch', 'vibration', 'tilt']) {
    assert.equal(FIELDS[name].kind, 'switch', name);
    assert.equal(FIELDS[name].default, 0, name);
  }
});

test('environment: every level field has a limit [lo, hi] that contains its slider range, and a scale', async () => {
  const { FIELDS } = await loadEnv();
  for (const [name, f] of Object.entries(FIELDS)) {
    if (f.kind !== 'level') continue;
    assert.ok(Array.isArray(f.limit) && f.limit.length === 2, `${name}: limit is [lo, hi]`);
    assert.ok(f.limit[0] <= f.min && f.max <= f.limit[1], `${name}: ${f.min}…${f.max} inside ${f.limit}`);
    assert.ok(['log', 'linear'].includes(f.scale), `${name}: scale ${f.scale}`);
    assert.ok(f.min <= f.default && f.default <= f.max, `${name}: default inside the range`);
  }
});

// ---------------------------------------------------------------- 2. `environment` in a circuit, and check

test('check: environment names real fields and values inside their limit', () => {
  const led = example('led-resistor.json');
  const withEnv = (environment) => ({ ...led, environment });
  assert.deepEqual(envCodes(withEnv({ light: 300, temperature: { value: 30 }, rain: 1 })), []);
  assert.deepEqual(envCodes(withEnv({ gravity: 3 })), ['ENV_UNKNOWN_FIELD']);
  assert.deepEqual(envCodes(withEnv({ light: { value: 3 }, gravity: { value: 3 } })), ['ENV_UNKNOWN_FIELD']);
  assert.deepEqual(envCodes(withEnv({ light: 2e6 })), ['ENV_OUT_OF_RANGE']);
  assert.deepEqual(envCodes(withEnv({ light: { value: 2e6 } })), ['ENV_OUT_OF_RANGE']);
  assert.deepEqual(envCodes(withEnv({ temperature: -56 })), ['ENV_OUT_OF_RANGE']);
  assert.deepEqual(envCodes(withEnv({ temperature: 151 })), ['ENV_OUT_OF_RANGE']);
  // The limit itself is inside it.
  assert.deepEqual(envCodes(withEnv({ light: 1e6, temperature: -55 })), []);
  assert.deepEqual(envCodes(withEnv({ light: 0, temperature: 150 })), []);
  assert.deepEqual(envCodes(led), [], 'no environment: nothing to say');
});

// ---------------------------------------------------------------- 3. programs

const TOGGLE = { kind: 'toggle', high: 1000, low: 10, on: 2, off: 3 };

test('programValue: toggle is high for `on` seconds from t = 0, then low for `off` seconds, and repeats', async () => {
  const { programValue } = await loadEnv();
  for (const [t, v] of [[0, 1000], [0.5, 1000], [1.5, 1000], [2.5, 10], [4.5, 10], [5.5, 1000], [6.5, 1000], [7.5, 10], [9.5, 10], [10.5, 1000]]) {
    assert.equal(programValue(TOGGLE, t), v, `t = ${t}`);
  }
});

test('programValue: cycle stays between min and max, reaches both, and repeats every period (sine, square, triangle)', async () => {
  const { programValue } = await loadEnv();
  const [min, max, period] = [5, 2000, 8];
  for (const shape of ['sine', 'square', 'triangle']) {
    const program = { kind: 'cycle', shape, period, min, max };
    const N = 1000;
    const samples = Array.from({ length: N }, (_, k) => programValue(program, (k * period) / N));
    assert.ok(samples.every((v) => v >= min - 1e-9 && v <= max + 1e-9), `${shape}: inside min…max`);
    // 1000 samples per period: the extremes are met to within 1 % of the span.
    assert.ok(Math.max(...samples) >= max - 0.01 * (max - min), `${shape}: reaches max`);
    assert.ok(Math.min(...samples) <= min + 0.01 * (max - min), `${shape}: reaches min`);
    for (const t of [0, 0.7, 1.9, 3.3, 5.1, 7.7]) assert.ok(close(programValue(program, t), programValue(program, t + period), 1e-9), `${shape}: period at t = ${t}`);
    assert.ok(close(programValue(program, 2.2), programValue(program, 2.2 + 5 * period), 1e-9), `${shape}: five periods later`);
  }
  const square = { kind: 'cycle', shape: 'square', period, min, max };
  const seen = new Set(Array.from({ length: 200 }, (_, k) => programValue(square, (k * period) / 200)));
  assert.deepEqual([...seen].sort((a, b) => a - b), [min, max], 'a square wave takes only its two levels');
});

test('programValue: ramp goes from `from` to `to` in `seconds` and holds `to` after (linear between: assumed)', async () => {
  const { programValue } = await loadEnv();
  const ramp = { kind: 'ramp', from: 10, to: 50, seconds: 4 };
  assert.equal(programValue(ramp, 0), 10);
  assert.equal(programValue(ramp, 4), 50);
  assert.equal(programValue(ramp, 100), 50, 'holds the end');
  assert.ok(close(programValue(ramp, 2), 30), 'halfway at half the time (linear between the ends)');
  let before = -Infinity;
  for (let t = 0; t <= 4; t += 0.25) {
    const v = programValue(ramp, t);
    assert.ok(v >= before, `rising at ${t}`);
    before = v;
  }
  const down = { kind: 'ramp', from: 50, to: 10, seconds: 4 };
  assert.equal(programValue(down, 0), 50);
  assert.equal(programValue(down, 9), 10);
});

test('programValue: keyframes interpolate linearly between points and hold the last', async () => {
  const { programValue } = await loadEnv();
  const program = { kind: 'keyframes', points: [[0, 10], [2, 30], [4, 20]] };
  for (const [t, v] of [[0, 10], [1, 20], [2, 30], [3, 25], [4, 20], [10, 20], [1000, 20]]) assert.ok(close(programValue(program, t), v), `t = ${t}`);
});

test('programValue: keyframes with loop start again after the last point (the period is the last time: assumed)', async () => {
  const { programValue } = await loadEnv();
  const program = { kind: 'keyframes', points: [[0, 0], [2, 10]], loop: true };
  for (const [t, v] of [[1, 5], [3, 5], [5, 5], [0.5, 2.5], [4.5, 2.5]]) assert.ok(close(programValue(program, t), v), `t = ${t}`);
});

test('programValue: pure, the same time gives the same value and the program is not changed', async () => {
  const { programValue } = await loadEnv();
  for (const program of [TOGGLE, { kind: 'cycle', shape: 'sine', period: 8, min: 5, max: 2000 }, { kind: 'ramp', from: 1, to: 9, seconds: 3 }, { kind: 'keyframes', points: [[0, 1], [1, 2]] }]) {
    const copy = structuredClone(program);
    const a = [0, 1.3, 7, 0.2].map((t) => programValue(program, t));
    const b = [0, 1.3, 7, 0.2].map((t) => programValue(program, t));
    assert.deepEqual(a, b);
    assert.deepEqual(program, copy);
  }
});

// ---------------------------------------------------------------- 3. createEnvironment

const LIGHT_CYCLE = { kind: 'cycle', shape: 'sine', period: 8, min: 5, max: 2000 };

test('createEnvironment: plain values, `{ value }` and a field with nothing but its default', async () => {
  const { createEnvironment, FIELDS } = await loadEnv();
  const env = createEnvironment({ light: 500, temperature: { value: 30 }, humidity: {} });
  for (const t of [0, 3.7]) {
    const now = env.at(t);
    assert.equal(now.light, 500);
    assert.equal(now.temperature, 30);
    assert.equal(now.humidity, FIELDS.humidity.default, 'a declared field with no value takes its default');
  }
  assert.equal(env.value('light'), 500);
  assert.equal(env.value('temperature'), 30);
  assert.equal(env.value('humidity'), FIELDS.humidity.default);
  const names = [...env.fields()].map((f) => (typeof f === 'string' ? f : f.field ?? f.name));
  for (const name of ['light', 'temperature', 'humidity']) assert.ok(names.includes(name), `fields() lists ${name}: ${names}`);
});

test('createEnvironment: a programmed field follows programValue at the time asked', async () => {
  const { createEnvironment, programValue } = await loadEnv();
  const RAIN = { kind: 'toggle', high: 1, low: 0, on: 2, off: 3 }; // a switch field takes a 0/1 program
  const env = createEnvironment({ light: { value: 300, program: LIGHT_CYCLE }, rain: { program: RAIN }, temperature: 30 });
  for (const t of [0, 1, 2.5, 6, 11.3]) {
    const now = env.at(t);
    assert.ok(close(now.light, programValue(LIGHT_CYCLE, t)), `light at ${t}`);
    assert.ok(close(now.rain, programValue(RAIN, t)), `rain at ${t}`);
    assert.equal(now.temperature, 30, 'a plain field does not move');
  }
});

test('createEnvironment: set holds a plain field at the new value', async () => {
  const { createEnvironment } = await loadEnv();
  const env = createEnvironment({ light: 500, temperature: 30 });
  env.set('light', 800);
  assert.equal(env.value('light'), 800);
  for (const t of [0, 5]) assert.equal(env.at(t).light, 800);
  assert.equal(env.at(0).temperature, 30, 'the others stay');
});

test('createEnvironment: set on a programmed field pauses its program at that value, resume restarts it', async () => {
  const { createEnvironment, programValue } = await loadEnv();
  const env = createEnvironment({ light: { program: LIGHT_CYCLE }, temperature: { program: { kind: 'ramp', from: 10, to: 90, seconds: 8 } } });
  env.set('light', 123);
  assert.equal(env.value('light'), 123);
  for (const t of [0, 1, 3, 100]) assert.equal(env.at(t).light, 123, `paused at t = ${t}`);
  assert.ok(close(env.at(4).temperature, programValue({ kind: 'ramp', from: 10, to: 90, seconds: 8 }, 4)), 'another programmed field keeps moving');
  env.resume('light');
  const values = [0, 1, 2, 3, 4, 5, 6, 7].map((t) => env.at(t).light);
  assert.ok(new Set(values).size > 1, `moving again: ${values}`);
  assert.ok(values.every((v) => v >= 5 - 1e-9 && v <= 2000 + 1e-9), `inside its program's range: ${values}`);
});

test('environmentControls: controls shaped like the others, id "environment", one per declared field', async () => {
  const { createEnvironment, environmentControls, FIELDS } = await loadEnv();
  const env = createEnvironment({ light: 500, temperature: { value: 30 }, rain: 1 });
  const list = environmentControls(env);
  assert.ok(list.every((c) => c.id === 'environment'));
  const by = (field) => list.find((c) => c.field === field);
  for (const field of ['light', 'temperature', 'rain']) assert.ok(by(field), `a control for ${field}`);
  const light = by('light');
  assert.deepEqual([light.min, light.max, light.scale, light.unit, light.value], [0.1, 10000, 'log', 'lx', 500]);
  assert.deepEqual(light.limit, [0, 1e6]);
  const temperature = by('temperature');
  assert.deepEqual([temperature.min, temperature.max, temperature.scale, temperature.unit, temperature.step, temperature.value], [-20, 100, 'linear', '°C', 1, 30]);
  assert.deepEqual(temperature.limit, [-55, 150]);
  assert.equal(by('rain').scale, 'toggle', 'a switch field is a toggle');
  assert.equal(Boolean(by('rain').value), true);
  env.set('light', 800);
  assert.equal(environmentControls(env).find((c) => c.field === 'light').value, 800, 'the control states the value now');
  const quiet = createEnvironment({ rain: 0 });
  assert.equal(Boolean(environmentControls(quiet).find((c) => c.field === 'rain').value), false);
  assert.equal(FIELDS.rain.kind, 'switch');
});

// ---------------------------------------------------------------- 4. sensors that follow a field

const ldrR = (r, id = 'LDR1') => r.parts[id].sensor.resistance;

test('sensors: a photoresistor with no light of its own follows environment.light; its own value wins', () => {
  assert.ok(close(ldrR(run(ldrCircuit({}, { light: 500 }))), ldrResistance(GL5528, 500)), 'follows the field');
  assert.ok(close(ldrR(run(ldrCircuit({}, { light: { value: 20 } }))), ldrResistance(GL5528, 20)), 'follows { value }');
  assert.ok(close(ldrR(run(ldrCircuit({ light: 3 }, { light: 500 }))), ldrResistance(GL5528, 3)), 'the part\'s light wins');
});

test('sensors: a thermistor with no temperature of its own follows environment.temperature; its own value wins', () => {
  assert.ok(close(run(thermistorCircuit({}, { temperature: 60 })).parts.RT1.sensor.resistance, ntcResistance(NTC, 60)), 'follows the field');
  assert.ok(close(run(thermistorCircuit({ temperature: 0 }, { temperature: 60 })).parts.RT1.sensor.resistance, ntcResistance(NTC, 0)), 'the part\'s temperature wins');
});

test('sensors: an LM35 with no temperature of its own follows environment.temperature; its own value wins', () => {
  near(run(lm35Circuit({}, { temperature: 60 })).parts.U1.vout, 0.6, 1e-3, 'Vout at the field\'s 60 °C');
  near(run(lm35Circuit({ temperature: 40 }, { temperature: 60 })).parts.U1.vout, 0.4, 1e-3, 'Vout at the part\'s own 40 °C');
});

test('sensors: a tilt switch with no `tilted` of its own follows environment.tilt; its own value wins', () => {
  const current = (circuit) => run(circuit).parts.R1.current;
  near(current(tiltCircuit({}, { tilt: 1 })), 0, 1e-9, 'tilted by the field: open');
  near(current(tiltCircuit({}, { tilt: 0 })), 5 / 1000, 5e-5, 'upright by the field: closed');
  near(current(tiltCircuit({ tilted: false }, { tilt: 1 })), 5 / 1000, 5e-5, 'its own upright wins over the field');
  near(current(tiltCircuit({ tilted: true }, { tilt: 0 })), 0, 1e-9, 'its own tilt wins over the field');
});

test('sensors: moving the part\'s own control detaches it from the field; the field moves the others on', () => {
  const circuit = {
    supplies: supply,
    environment: { light: 500 },
    parts: [
      ...rail,
      { id: 'LDR1', type: 'ldr', part: 'GL5528', pins: ['e10', 'e11'] },
      { id: 'LDR2', type: 'ldr', part: 'GL5528', pins: ['e20', 'e21'] },
      { id: 'W2', type: 'wire', color: 'red', pins: ['T+21', 'a20'] },
      { id: 'R1', type: 'resistor', value: '10k', pins: ['a11', 'T-12'] },
      { id: 'R2', type: 'resistor', value: '10k', pins: ['a21', 'T-22'] },
    ],
  };
  const e = engineOf(circuit);
  const R = (id) => e.read().parts[id].sensor.resistance;
  assert.ok(close(R('LDR1'), ldrResistance(GL5528, 500)));
  assert.ok(e.set('environment', 'light', 50));
  assert.ok(close(R('LDR1'), ldrResistance(GL5528, 50)), 'follows while attached');
  assert.ok(close(R('LDR2'), ldrResistance(GL5528, 50)));
  assert.ok(e.set('LDR1', 'light', 3));
  assert.ok(close(R('LDR1'), ldrResistance(GL5528, 3)), 'its own slider');
  assert.ok(e.set('environment', 'light', 5000));
  assert.ok(close(R('LDR1'), ldrResistance(GL5528, 3)), 'detached: the field no longer moves it');
  assert.ok(close(R('LDR2'), ldrResistance(GL5528, 5000)), 'the other one still follows');
});

test('sensors: the card of a following part says so with sim.env.follows, one with its own value does not', () => {
  for (const lang of ['en', 'es']) {
    const template = LANGUAGES[lang]['sim.env.follows'];
    assert.equal(typeof template, 'string', `${lang} has sim.env.follows`);
    const chunks = template.split(/\{\w+\}/).map((s) => s.trim()).filter(Boolean);
    assert.ok(chunks.length > 0, `${lang}: the text has words of its own`);
    const says = (reading) => partLines(reading, lang).some((line) => chunks.every((c) => line.text.includes(c)));
    assert.ok(says(run(ldrCircuit({}, { light: 500 })).parts.LDR1), `${lang}: follows`);
    assert.ok(says(run(thermistorCircuit({}, { temperature: 60 })).parts.RT1), `${lang}: thermistor follows`);
    assert.ok(!says(run(ldrCircuit({ light: 3 }, { light: 500 })).parts.LDR1), `${lang}: own value, nothing said`);
  }
});

test('i18n: the page texts of the environment exist in both languages, the title in Spanish is "Ambiente"', () => {
  assert.equal(LANGUAGES.es['page.env.title'], 'Ambiente');
  for (const lang of ['en', 'es']) for (const key of ['page.env.title', 'page.env.pause', 'page.env.resume', 'sim.env.follows']) assert.ok(typeof LANGUAGES[lang][key] === 'string' && LANGUAGES[lang][key].length > 0, `${lang} ${key}`);
});

// ---------------------------------------------------------------- 5. engine

test('engine: controls include the environment; set changes the sensors that follow, environment() says the values', () => {
  const e = engineOf(ldrCircuit({}, { light: 500, temperature: 30 }));
  const own = e.controls().filter((c) => c.id === 'environment');
  assert.deepEqual(own.map((c) => c.field).sort(), ['light', 'temperature']);
  assert.equal(own.find((c) => c.field === 'light').value, 500);
  assert.equal(e.environment().light, 500);
  assert.equal(e.environment().temperature, 30);
  assert.ok(e.set('environment', 'light', 2000));
  assert.equal(e.environment().light, 2000);
  assert.equal(e.controls().find((c) => c.id === 'environment' && c.field === 'light').value, 2000);
  assert.ok(close(e.read().parts.LDR1.sensor.resistance, ldrResistance(GL5528, 2000)));
  assert.equal(e.set('environment', 'gravity', 1), false, 'a field the circuit does not have');
  assert.equal(e.set('environment', 'temperature', 'warm'), false, 'not a number');
});

test('engine: each environment control gives what a fresh simulation of the changed circuit gives', () => {
  const e = engineOf(ldrCircuit({}, { light: 500 }));
  assert.ok(e.set('environment', 'light', 8));
  const fresh = run(ldrCircuit({}, { light: 8 }));
  for (const [node, v] of Object.entries(fresh.nodes)) if (v != null) near(e.read().nodes[node], v, 1e-6, `V(${node})`);
  const lm = engineOf(lm35Circuit({}, { temperature: 20 }));
  assert.ok(lm.set('environment', 'temperature', 80));
  near(lm.dc().parts.U1.vout, 0.8, 1e-3, 'LM35 follows the engine\'s field');
});

test('engine: set on a programmed field pauses it at that value', () => {
  const e = engineOf(ldrCircuit({}, { light: { program: LIGHT_CYCLE } }));
  assert.ok(e.set('environment', 'light', 777));
  assert.equal(e.environment().light, 777);
  assert.equal(e.controls().find((c) => c.id === 'environment' && c.field === 'light').value, 777);
});

test('simulate: a DC result uses the values the programs have at t = 0', () => {
  const toggle = { kind: 'toggle', high: 800, low: 5, on: 2, off: 2 };
  assert.ok(close(ldrR(run(ldrCircuit({}, { light: { program: toggle } }))), ldrResistance(GL5528, 800)), 'toggle starts high');
  assert.ok(close(ldrR(run(ldrCircuit({}, { light: { value: 20, program: { kind: 'ramp', from: 100, to: 900, seconds: 4 } } }))), ldrResistance(GL5528, 100)), 'ramp starts at its from');
  const e = engineOf(ldrCircuit({}, { light: { program: toggle } }));
  assert.equal(e.environment().light, 800, 'the engine starts at t = 0 too');
});

test('golden: with no environment declared, every stored case gives the same result (no --write)', () => {
  const stored = JSON.parse(readFileSync(new URL('./fixtures/sim-golden.json', import.meta.url), 'utf8'));
  const cases = goldenCases().filter((c) => c.name in stored);
  assert.equal(cases.length, Object.keys(stored).length, 'every stored case still exists');
  // The environment examples are in the golden file too; this guard is about the ones before it.
  for (const c of cases.filter((c) => c.circuit.environment === undefined)) {
    const differences = compareGolden(stored[c.name], computeGolden(c));
    assert.deepEqual(differences.slice(0, 10), [], `${c.name}: ${differences.length} difference(s)`);
  }
});

// ---------------------------------------------------------------- 8. timeline

const withTour = (steps, circuit = ldrCircuit({}, { light: 300, temperature: 25 })) => ({ ...circuit, page: { tour: { steps } } });

test('tour: a set may name an environment field instead of a part', () => {
  assert.deepEqual(tourIssues(withTour([{ at: 0, do: 'set', environment: 'light', value: 800 }])), []);
  assert.deepEqual(tourIssues(withTour([{ at: 0, do: 'set', environment: 'temperature', value: 60 }])), []);
  assert.ok(loadTour(withTour([{ at: 0, do: 'set', environment: 'light', value: 800 }])).tour, 'it plays');
});

test('tour: a set naming an unknown environment field is a TOUR_ issue', () => {
  assert.deepEqual(tourIssues(withTour([{ at: 0, do: 'set', environment: 'light', value: 9 }])), [], 'a known field is fine');
  const issues = tourIssues(withTour([{ at: 0, do: 'set', environment: 'gravity', value: 9 }]));
  assert.ok(issues.length > 0, 'something is said');
  assert.ok(codes(issues).every((c) => c.startsWith('TOUR_')), codes(issues).join(', '));
});

test('tour: gauge is an action, with an environment field and on / off', () => {
  assert.deepEqual(tourIssues(withTour([{ at: 0, do: 'gauge', environment: 'light', on: true }, { at: 3000, do: 'gauge', environment: 'light', on: false }])), []);
  const missing = tourIssues(withTour([{ at: 0, do: 'gauge', environment: 'light' }]));
  assert.ok(missing.length > 0 && codes(missing).every((c) => c.startsWith('TOUR_')), '`on` is not optional');
});

// ---------------------------------------------------------------- 9. examples

test('examples: environment, environment-cycle and the tour exist', () => {
  for (const name of ['environment.json', 'environment-cycle.json', 'tours/environment.json']) assert.ok(existsSync(exampleFile(name)), name);
});

for (const name of ['environment.json', 'environment-cycle.json']) {
  test(`examples: ${name} loads, checks clean and simulates`, () => {
    const circuit = example(name);
    assert.ok(circuit.environment && Object.keys(circuit.environment).length > 0, 'declares an environment');
    const problems = checkCircuit(circuit).issues.filter((i) => i.severity === 'error' || i.severity === 'warning');
    assert.deepEqual(codes(problems), []);
    assert.ok(simulate(circuit).ok);
  });
}

test('examples: environment-cycle has a light program whose value differs between t = 0 and half a period', async () => {
  const { createEnvironment } = await loadEnv();
  const circuit = example('environment-cycle.json');
  const light = circuit.environment.light;
  assert.equal(light.program.kind, 'cycle');
  const env = createEnvironment(circuit.environment);
  assert.notEqual(env.at(0).light, env.at(light.program.period / 2).light);
});

test('examples: the environment tour is a valid timeline for the environment example', () => {
  const file = JSON.parse(readFileSync(exampleFile('tours/environment.json'), 'utf8'));
  assert.ok(Array.isArray(file.steps) && file.steps.length > 0);
  const circuit = { ...example('environment.json'), page: { ...example('environment.json').page, tour: file } };
  assert.deepEqual(tourIssues(circuit), []);
  assert.ok(loadTour(circuit, 'en').tour);
  const beside = example('environment.json');
  assert.deepEqual(codes(checkCircuit(beside).issues).filter((c) => c.startsWith('TOUR_') || c.startsWith('ENV_') || c.startsWith('PAGE_')), []);
});

// ---------------------------------------------------------------- physics sanity (first principles)

test('physics: a GL5528 photoresistor has more resistance at 5 lx than at 500 lx (dimmer, higher R)', () => {
  const dim = ldrR(run(ldrCircuit({ light: 5 })));
  const bright = ldrR(run(ldrCircuit({ light: 500 })));
  assert.ok(dim > bright, `${dim} Ω at 5 lx vs ${bright} Ω at 500 lx`);
  // The same, when the light is the shared field.
  const dimField = ldrR(run(ldrCircuit({}, { light: 5 })));
  const brightField = ldrR(run(ldrCircuit({}, { light: 500 })));
  assert.ok(dimField > brightField, `field: ${dimField} Ω at 5 lx vs ${brightField} Ω at 500 lx`);
  // And the divider says so: more of the 5 V falls across the sensor in the dark.
  assert.ok(run(ldrCircuit({}, { light: 5 })).parts.R1.current < run(ldrCircuit({}, { light: 500 })).parts.R1.current, 'less current in the dark');
});

test('physics: an NTC thermistor has less resistance at 60 °C than at 25 °C (negative coefficient)', () => {
  const warm = run(thermistorCircuit({ temperature: 60 })).parts.RT1.sensor.resistance;
  const room = run(thermistorCircuit({ temperature: 25 })).parts.RT1.sensor.resistance;
  assert.ok(warm < room, `${warm} Ω at 60 °C vs ${room} Ω at 25 °C`);
  const warmField = run(thermistorCircuit({}, { temperature: 60 })).parts.RT1.sensor.resistance;
  const roomField = run(thermistorCircuit({}, { temperature: 25 })).parts.RT1.sensor.resistance;
  assert.ok(warmField < roomField, `field: ${warmField} Ω at 60 °C vs ${roomField} Ω at 25 °C`);
  near(roomField, 10e3, 1, 'a 10 kΩ NTC is 10 kΩ at 25 °C');
});

test('physics: an LM35 at 60 °C gives about 0.60 V (10 mV per °C, ±2 %) from 5 V with a light load', () => {
  near(run(lm35Circuit({ temperature: 60 })).parts.U1.vout, 0.6, 0.012, 'own temperature');
  near(run(lm35Circuit({}, { temperature: 60 })).parts.U1.vout, 0.6, 0.012, 'the shared temperature');
});

test('physics: a sine cycle of min 5, max 2000, period 8 s is at its maximum at t = 2 s and its minimum at t = 6 s (assumes it starts at the middle, rising)', async () => {
  const { programValue } = await loadEnv();
  const program = { kind: 'cycle', shape: 'sine', period: 8, min: 5, max: 2000 };
  assert.ok(close(programValue(program, 2), 2000, 1e-9), `max at 2 s: ${programValue(program, 2)}`);
  assert.ok(close(programValue(program, 6), 5, 1e-9), `min at 6 s: ${programValue(program, 6)}`);
  assert.ok(close(programValue(program, 0), 1002.5, 1e-9), 'the middle at t = 0 (same assumption)');
  assert.ok(close(programValue(program, 4), 1002.5, 1e-9), 'the middle at half a period (same assumption)');
});

test('physics: a toggle of 2 s on and 2 s off is high at t = 1 and low at t = 3', async () => {
  const { programValue } = await loadEnv();
  const program = { kind: 'toggle', high: 900, low: 20, on: 2, off: 2 };
  assert.equal(programValue(program, 1), 900);
  assert.equal(programValue(program, 3), 20);
});
