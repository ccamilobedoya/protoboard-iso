// Analog sensors (docs/en/analog-sensors.md): the linear Hall sensor 49E, the voltage
// sensor module, the KY-037 sound module, the active buzzer, and the four recipes that use them. Each
// number below is worked out apart from the device (a formula, a divider, a datasheet figure).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { simulate, compile, createEngine } from '../src/sim/index.js';
import { PART_TYPES } from '../src/parts/types/index.js';
import { lookupPartNumber } from '../src/parts/db.js';
import { findPin } from '../src/parts/pin-names.js';
import { RECIPES, expandRecipe, resolveRecipe } from '../src/recipes/index.js';
import { autoLayout } from '../src/layout.js';
import { loadTour, tourIssues } from '../src/tour.js';
import { compactCatalog, formatCompactCatalog } from '../src/node/catalog.js';
import { electretPeak, SENSOR_MODULES } from '../src/parts/sensors.js';
import { buildCircuit } from '../src/circuit/build.js';
import { createCamera } from '../src/core/camera.js';
import { pinoutOf } from '../src/pinout.js';
import { partLines } from '../src/sim/format.js';

const near = (actual, expected, tol, what) => assert.ok(Math.abs(actual - expected) <= tol, `${what}: ${actual} against ${expected} ± ${tol}`);
const codes = (s) => s.issues.map((i) => i.code);

// One part on the top rails: the first pin of `rails` names go to + and the others to −.
function bench(part, { v = 5, env, plus = [], minus = [] } = {}) {
  const pins = part.pins.map((_, i) => `c${10 + i}`);
  const wires = [];
  part.pins.forEach((name, i) => {
    const rail = plus.includes(name) ? `T+${10 + i}` : minus.includes(name) ? `T-${10 + i}` : null;
    if (rail) wires.push({ id: `W${i}`, type: 'wire', color: plus.includes(name) ? 'red' : 'black', pins: [`a${10 + i}`, rail] });
  });
  const { pins: names, ...rest } = part;
  return { version: 1, board: 'bb830', supplies: [{ id: 'V1', voltage: v }], ...(env && { environment: env }), parts: [{ ...rest, id: 'U1', pins, ...(names ? {} : {}) }, ...wires], names };
}
const run = (part, options) => {
  const { names, ...circuit } = bench(part, options);
  const s = simulate(circuit);
  assert.ok(s.ok, JSON.stringify(s.issues));
  return { ...s.parts.U1, issues: s.issues };
};

const hall = (extra = {}, options = {}) => run({ type: 'hall-sensor', part: 'KY-035', pins: ['S', '+', '-'], ...extra }, { plus: ['+'], minus: ['-'], ...options });

test('the types and part numbers: hall-sensor, voltage-sensor, KY-037, TMB12A05; the catalog stays small', () => {
  for (const t of ['hall-sensor', 'voltage-sensor']) assert.equal(PART_TYPES[t].family, 'sensor', t);
  assert.equal(lookupPartNumber('KY-037').entry.type, 'sensor-module');
  assert.equal(lookupPartNumber('ky037').number, 'KY-037');
  assert.equal(lookupPartNumber('TMB12A05').entry.type, 'buzzer');
  assert.deepEqual(lookupPartNumber('KY-035').entry.pins, ['S', '+', '-']);
  assert.deepEqual(lookupPartNumber('49E').entry.pins, ['VCC', 'GND', 'OUT']);
  assert.deepEqual(lookupPartNumber('KY-037').entry.pins, ['DO', 'VCC', 'GND', 'AO']);
  assert.equal(lookupPartNumber('VOLT-25V').entry.pins.join(' '), 'S + - VIN GND');
  // Pin synonyms of the Hall sensor, only on that type.
  assert.equal(findPin(['S', '+', '-'], 'OUT', 'hall-sensor'), 'S');
  assert.equal(findPin(['S', '+', '-'], 'VCC', 'hall-sensor'), '+');
  assert.equal(findPin(['VCC', 'GND', 'OUT'], 'S', 'hall-sensor'), 'OUT');
  assert.equal(findPin(['VCC', 'GND', 'OUT'], '-', 'hall-sensor'), 'GND');
  assert.equal(PART_TYPES['hall-sensor'].resolve({ part: 'nope' }).error.code, 'UNKNOWN_PART_NUMBER');
  const length = formatCompactCatalog(compactCatalog('en'), 'en').length;
  assert.ok(length <= 4600, `compact catalog ${length}`);
});

test('49E: Vs/2 + 1.4 mV/G · Vs/5 · field, clamped', () => {
  for (const [field, volts] of [[0, 2.5], [100, 2.64], [-100, 2.36], [700, 3.48]]) near(hall({ field }).vout, volts, 0.03, `${field} G`);
  near(hall({ field: 100 }, { v: 3.3 }).vout, 1.742, 0.03, '3.3 V');
  near(hall({ field: 1500 }).vout, 4.05, 0.1, 'clamped high');
  near(hall({ field: -1500 }).vout, 0.95, 0.1, 'clamped low');
  // The bare chip, its pins in its own order.
  const bare = run({ type: 'hall-sensor', part: '49E', field: 100, pins: ['VCC', 'GND', 'OUT'] }, { plus: ['VCC'], minus: ['GND'] });
  near(bare.vout, 2.64, 0.03, '49E bare');
  near(hall({ field: 0 }).supply, 6e-3, 0.5e-3, 'own current');
});

test('49E: the environment moves it, the part\'s own field wins, the slider detaches it', () => {
  near(hall({}, { env: { field: 200 } }).vout, 2.5 + 0.28, 0.03, 'environment');
  near(hall({ field: -100 }, { env: { field: 200 } }).vout, 2.36, 0.03, 'own wins');
  const { names, ...circuit } = bench({ type: 'hall-sensor', part: 'KY-035', pins: ['S', '+', '-'] }, { plus: ['+'], minus: ['-'], env: { field: 0 } });
  const e = createEngine(compile(circuit).program);
  assert.ok(e.start('dc'));
  e.set('environment', 'field', 300);
  near(e.read().parts.U1.vout, 2.5 + 0.42, 0.03, 'moved');
  e.set('U1', 'field', -300);
  e.set('environment', 'field', 0);
  near(e.read().parts.U1.vout, 2.5 - 0.42, 0.03, 'own control detached it');
});

test('49E: supply over 8 V, under 2.7 V, reversed, and a load over 1.5 mA', () => {
  assert.ok(codes({ issues: hall({}, { v: 9 }).issues }).includes('SIM_IC_SUPPLY'));
  assert.ok(codes({ issues: hall({}, { v: 2 }).issues }).includes('SIM_MODULE_LOW_SUPPLY'));
  assert.ok(!codes({ issues: hall({}, { v: 5 }).issues }).includes('SIM_MODULE_LOW_SUPPLY'));
  const reversed = run({ type: 'hall-sensor', part: 'KY-035', pins: ['S', '+', '-'] }, { plus: ['-'], minus: ['+'] });
  assert.ok(codes({ issues: reversed.issues }).includes('SIM_REVERSE_VOLTAGE'));
  // 2 mA out of the output into 1 kΩ to ground: 1 kΩ + 50 Ω.
  const loaded = simulate({ version: 1, board: 'bb830', supplies: [{ id: 'V1', voltage: 5 }], parts: [
    { id: 'U1', type: 'hall-sensor', part: 'KY-035', field: 0, pins: ['c10', 'c11', 'c12'] }, { id: 'R1', type: 'resistor', value: '1.2k', pins: ['e10', 'e21'] },
    { id: 'W1', type: 'wire', color: 'red', pins: ['a11', 'T+11'] }, { id: 'W2', type: 'wire', color: 'black', pins: ['a12', 'T-12'] }, { id: 'W3', type: 'wire', color: 'black', pins: ['a21', 'T-21'] }] });
  assert.ok(loaded.ok && codes(loaded).includes('SIM_HALL_LOAD'), JSON.stringify(loaded.issues));
});

const voltage = (v, extra = {}) => {
  const circuit = { version: 1, board: 'bb830', supplies: [{ id: 'V1', voltage: v }], parts: [
    { id: 'U1', type: 'voltage-sensor', pins: ['c10', 'c11', 'c12', 'c13', 'c14'] }, ...(extra.parts ?? []),
    { id: 'W1', type: 'wire', color: 'red', pins: ['a13', 'T+13'] }, { id: 'W2', type: 'wire', color: 'black', pins: ['a14', 'T-15'] }, { id: 'W3', type: 'wire', color: 'black', pins: ['a12', 'T-16'] }] };
  const s = simulate(circuit);
  assert.ok(s.ok, JSON.stringify(s.issues));
  return s;
};

test('voltage sensor: a fifth of the input, 0.32 mA at 12 V', () => {
  const s = voltage(12);
  near(s.parts.U1.vs, 2.4, 0.012, 'S');
  near(s.parts.U1.current, 0.32e-3, 0.02e-3, 'input current');
  near(s.parts.U1.ratio, 0.2, 0.001, 'ratio');
  near(voltage(25).parts.U1.vs, 5, 0.025, '25 V');
  assert.deepEqual(codes(voltage(12)), []);
});

test('voltage sensor: 25 V with S on a 3.3 V board\'s pin is the board\'s over-voltage issue', () => {
  const r = autoLayout({
    board: 'auto',
    parts: [{ id: 'U1', type: 'voltage-sensor' }, { id: 'U2', part: 'ESP32-DEVKIT', program: 'void setup() {} void loop() {}' }],
    nets: [['T+', 'U1.VIN'], ['U1.GND', 'U1.-', 'U2.GND', 'T-'], ['U1.S', 'U2.D34']],
    supplies: [{ id: 'V1', kind: 'bench', voltage: 25, positive: 'T+', negative: 'T-' }],
  });
  assert.equal(r.status, 'done', JSON.stringify(r.problems));
  const s = simulate(r.circuit);
  assert.ok(s.ok, JSON.stringify(s.issues));
  assert.ok(s.parts.U1.vs > 3.6, `S is held up to the board's clamp: ${s.parts.U1.vs}`);
  assert.ok(codes(s).includes('SIM_PIN_OVERVOLTAGE'), JSON.stringify(s.issues));
  // 9 V in is 1.8 V at S: nothing to say.
  r.circuit.supplies[0].voltage = 9;
  assert.ok(!codes(simulate(r.circuit)).includes('SIM_PIN_OVERVOLTAGE'));
});

const mic = (db, options = {}) => run({ type: 'sensor-module', part: 'KY-037', pins: ['DO', 'VCC', 'GND', 'AO'], ...options.own }, { plus: ['VCC'], minus: ['GND'], env: { sound: db }, v: options.v });

test('KY-037: AO is the bias, the card has the AC peak; DO falls above about 98.5 dB', () => {
  const quiet = mic(94);
  near(quiet.ao, 2.5, 0.1, 'bias');
  near(quiet.value.peak, 8.9e-3, 0.89e-3, 'peak at 94 dB');
  near(electretPeak(SENSOR_MODULES['KY-037'].model, 100), 17.8e-3, 0.2e-3, 'peak formula at 100 dB');
  assert.ok(mic(70).vdo >= 4.5, 'DO high at 70 dB');
  assert.ok(mic(105).vdo <= 0.4, 'DO low at 105 dB');
  assert.ok(mic(98).vdo > 4, 'still high just under the threshold');
  assert.ok(mic(99).vdo < 0.4, 'low just over it');
  // The trimmer moves Vref: with Vref a volt-percent lower DO needs a louder sound.
  assert.ok(mic(105, { own: { threshold: 0.49 } }).vdo > 4.5);
  assert.ok(mic(40, { own: { sound: 105 } }).vdo <= 0.4, 'the part\'s own sound wins');
  near(mic(94, { v: 3.3 }).ao, 1.65, 0.1, 'ratiometric bias');
});

const buzzer = (v, { part = 'TMB12A05', reversed = false } = {}) => {
  const circuit = { version: 1, board: 'bb830', supplies: [{ id: 'V1', voltage: v }], parts: [
    { id: 'BZ1', type: 'buzzer', ...(part && { part }), pins: ['c10', 'c12'] },
    { id: 'W1', type: 'wire', color: 'red', pins: ['a10', reversed ? 'T-10' : 'T+10'] }, { id: 'W2', type: 'wire', color: 'black', pins: ['a12', reversed ? 'T+12' : 'T-12'] }] };
  const s = simulate(circuit);
  assert.ok(s.ok, JSON.stringify(s.issues));
  return { ...s.parts.BZ1, issues: s.issues };
};

test('active buzzer: 30 mA and sounding on 5 V, silent on 1 V, silent reversed; the passive one still warns on DC', () => {
  const on = buzzer(5);
  near(on.current, 0.03, 0.005, 'current at 5 V');
  assert.equal(on.sounding, true);
  assert.equal(on.state, 'sounding');
  assert.ok(!codes({ issues: on.issues }).includes('SIM_BUZZER_DC'));
  const low = buzzer(1);
  assert.ok(Math.abs(low.current) < 1e-3 && low.sounding === false);
  const back = buzzer(5, { reversed: true });
  assert.equal(back.sounding, false);
  assert.ok(codes({ issues: back.issues }).includes('SIM_REVERSE_VOLTAGE'));
  assert.ok(codes({ issues: buzzer(5, { part: null }).issues }).includes('SIM_BUZZER_DC'));
  assert.equal(buzzer(1.4).sounding, false);
  assert.equal(buzzer(2.5).sounding, true);
});

test('active buzzer: from 2.0 V it is a 167 ohm load and sounds, quieter below 5 V (2.5, 3.3, 6, 8 and 12 V)', () => {
  for (const [v, mA] of [[2.5, 15], [3.3, 19.8], [5, 30], [6, 36], [8, 48], [12, 72]]) {
    const r = buzzer(v);
    near(r.current, mA / 1000, 0.0007 * Math.max(1, v / 5), `${v} V`);
    assert.equal(r.sounding, true, `${v} V sounds`);
  }
  near(buzzer(3.3).level, 77.7, 0.3, 'level at 3.3 V (85 - 40 log10(5/V))');
  near(buzzer(5).level, 85, 0.3, 'level at 5 V');
  assert.equal(buzzer(1.7).sounding, false);
  assert.ok(buzzer(1.7).current > 0.001 && buzzer(1.7).current < 0.01, 'the ramp is between nothing and the law');
  // Over 35 mA a current note (never a warning), over 7.5 V the maximum-supply warning, and neither at 5 V.
  const six = buzzer(6).issues;
  assert.ok(codes({ issues: six }).includes('SIM_BUZZER_CURRENT') && !codes({ issues: six }).includes('SIM_OVER_CURRENT'));
  assert.ok(six.every((i) => i.severity === 'info'), JSON.stringify(six));
  assert.ok(!codes({ issues: buzzer(6).issues }).includes('SIM_IC_SUPPLY'));
  assert.ok(codes({ issues: buzzer(8).issues }).includes('SIM_IC_SUPPLY'));
  assert.deepEqual(codes({ issues: buzzer(5).issues }), []);
  // Reversed: 100 kohm, silent; the note only from 1 V.
  near(buzzer(5, { reversed: true }).current, -5e-5, 1e-5, 'reverse leak');
  assert.ok(!codes({ issues: buzzer(0.8, { reversed: true }).issues }).includes('SIM_REVERSE_VOLTAGE'));
  assert.ok(codes({ issues: buzzer(1.5, { reversed: true }).issues }).includes('SIM_REVERSE_VOLTAGE'));
  // The monotonic law: the current never falls as the voltage rises.
  let last = -1;
  for (let v = 0; v <= 8; v += 0.25) {
    const i = buzzer(v).current;
    assert.ok(i >= last - 1e-9, `monotonic at ${v} V`);
    last = i;
  }
});

const layoutOf = (name, values) => {
  const { spec, problems } = expandRecipe(name, values);
  assert.deepEqual(problems, [], name);
  return autoLayout(spec);
};

test('the four recipes and the two alarm recipes are DONE, clean, with their environment and page controls', () => {
  for (const name of ['hall-linear-uno', 'voltage-sensor-uno', 'clap-switch', 'rain-alarm', 'obstacle-buzzer']) {
    const r = layoutOf(name);
    assert.equal(r.status, 'done', name);
    assert.deepEqual(r.review.blocking, [], name);
    assert.equal(r.check.ok, true, name);
  }
  for (const [name, field, range] of [['hall-linear-uno', 'field', [-500, 500]], ['clap-switch', 'sound', [30, 110]]]) {
    const c = layoutOf(name).circuit;
    assert.deepEqual(c.environment[field].range, range, name);
    assert.ok(c.page.controls.some((x) => x.environment === field), name);
  }
  for (const name of ['rain-alarm', 'obstacle-buzzer']) assert.ok(layoutOf(name).circuit.parts.some((p) => p.type === 'buzzer' && p.part === 'TMB12A05'), `${name}: the active buzzer`);
});

const engineOf = (circuit) => {
  const e = createEngine(compile(circuit).program);
  assert.ok(e.start('dc'));
  return e;
};
const advance = (e, ms) => {
  for (let i = 0; i < ms; i++) assert.ok(e.advance(0.001));
};

test('hall-linear-uno prints the field within 15 G (0, +200, -200 G)', () => {
  for (const G of [0, 200, -200]) {
    const e = engineOf(layoutOf('hall-linear-uno').circuit);
    advance(e, 200); // setup() measures the zero first, with no magnet near
    e.set('environment', 'field', G);
    advance(e, 1200);
    const last = Number(e.read().parts.U1.program.serial.at(-1));
    near(last, G, 15, `${G} G`);
  }
});

test('voltage-sensor-uno prints the measured supply\'s volts', () => {
  for (const V of [9, 12]) {
    const e = engineOf(layoutOf('voltage-sensor-uno', { V1: V }).circuit);
    advance(e, 1200);
    near(Number(e.read().parts.U1.program.serial.at(-1)), V, 0.1, `${V} V`);
  }
});

test('clap-switch: a clap toggles the LED once, a second clap toggles it back', () => {
  const e = engineOf(layoutOf('clap-switch').circuit);
  const led = () => e.read().parts.D1.current;
  advance(e, 300);
  assert.ok(led() < 1e-4, 'off in a quiet room');
  for (const [claps, on] of [[1, true], [2, false], [3, true]]) {
    e.set('environment', 'sound', 105);
    advance(e, 60);
    e.set('environment', 'sound', 40);
    advance(e, 400);
    assert.equal(led() > 3e-3, on, `after clap ${claps}`);
  }
});

test('the clap-switch tour validates and runs 20 to 30 s with Spanish captions and a sound gauge', () => {
  const raw = JSON.parse(readFileSync(new URL('../examples/tours/clap-switch.json', import.meta.url), 'utf8'));
  const circuit = { ...layoutOf('clap-switch').circuit };
  circuit.page = { ...circuit.page, tour: raw };
  assert.deepEqual(tourIssues(circuit), []);
  assert.ok(loadTour(circuit, 'es').tour);
  const end = Math.max(...raw.steps.map((s) => s.at + (s.ms ?? 0)));
  assert.ok(end >= 20000 && end <= 30000, `ends at ${end}`);
  assert.ok(raw.steps.some((s) => s.do === 'gauge' && s.environment === 'sound' && s.on === true));
  const sets = raw.steps.filter((s) => s.do === 'set' && s.environment === 'sound').map((s) => s.value);
  assert.deepEqual(sets, [105, 40, 105, 40]);
  assert.ok(raw.steps.filter((s) => s.do === 'caption').every((s) => s.text.es));
});

test('resolveRecipe: a deep copy; changing one spec leaves the recipe and the next spec alone', () => {
  const a = resolveRecipe('soil-led').spec;
  const b = resolveRecipe({ recipe: 'soil-led' }).spec;
  a.environment.moisture = 99;
  a.page.controls.push({ environment: 'light' });
  a.parts[0].threshold = 0.9;
  a.title.en = 'changed';
  a.nets[0].push('X');
  assert.equal(b.environment.moisture, 20);
  assert.equal(b.page.controls.length, 2);
  assert.equal(b.parts[0].threshold, 0.5);
  assert.notEqual(b.title.en, 'changed');
  assert.equal(RECIPES['soil-led'].environment.moisture, 20);
  assert.equal(RECIPES['soil-led'].title.en, 'Soil moisture LED with a YL-69 module');
  assert.notEqual(resolveRecipe('soil-led').spec.environment, resolveRecipe('soil-led').spec.environment);
  assert.notEqual(resolveRecipe('soil-led').spec.page, resolveRecipe('soil-led').spec.page);
});

// Up close (F5): each new kind has its drawing in the page, read from the simulation. The page runs in
// jsdom; the test is skipped where jsdom is not installed.
test('up close: the Hall plate, the divider, the electret and the active buzzer are drawn from the reading', async (t) => {
  let JSDOM;
  try {
    ({ JSDOM } = await import('jsdom'));
  } catch {
    return t.skip('jsdom not installed');
  }
  const { renderPage } = await import('../src/page.js');
  const inside = async (circuit, id, more = []) => {
    const steps = [{ at: 0, do: 'scene', mode: 'part', part: id }, { at: 0, do: 'inside', part: id, on: true }, ...more];
    const html = renderPage({ ...circuit, page: { ...circuit.page, tour: { format: 'vertical', steps } } }, { lang: 'en' }).html;
    const { window } = new JSDOM(html, { runScripts: 'outside-only', url: 'https://page.test/p.html?director=1' });
    const size = { width: 360, height: 640 };
    const rect = () => ({ left: 0, top: 0, right: size.width, bottom: size.height, x: 0, y: 0, ...size });
    window.document.querySelector('main').getBoundingClientRect = rect;
    for (const svg of window.document.querySelectorAll('svg')) svg.getBoundingClientRect = rect;
    window.eval(html.match(/<script>([\s\S]*)<\/script>/)[1]);
    window.protoboardLive.tour.play();
    for (let ms = 0; ms <= 1500; ms += 100) window.protoboardLive.tick(100);
    const box = window.document.querySelector('main > svg:not([hidden]) > .figure [data-inside]');
    const text = (sel) => box?.querySelector(sel)?.textContent ?? null;
    return { kind: box?.getAttribute('data-inside'), state: text('.state'), names: [...(box?.querySelectorAll('.pin-name') ?? [])].map((x) => x.textContent), count: (sel) => box?.querySelectorAll(sel).length ?? 0 };
  };
  const hall = await inside(layoutOf('hall-linear-uno').circuit, 'U2');
  assert.equal(hall.kind, 'hall');
  assert.equal(hall.state, 'output follows the field');
  assert.ok(hall.names.includes('S') && hall.names.includes('+') && hall.names.includes('-'), hall.names.join());
  const divider = await inside(layoutOf('voltage-sensor-uno').circuit, 'U2');
  assert.equal(divider.kind, 'divider5');
  assert.match(divider.state, /^S is a fifth of the input/);
  assert.equal(divider.count('.film'), 2, 'two resistors');
  const electret = await inside(layoutOf('clap-switch').circuit, 'U2');
  assert.equal(electret.kind, 'module');
  assert.equal(electret.count('.disc'), 1, 'the capsule\'s diaphragm');
  const loud = await inside(layoutOf('clap-switch').circuit, 'U2', [{ at: 200, do: 'set', environment: 'sound', value: 105, move: 'cut' }]);
  assert.match(loud.state, /^DO low: loud/);
  const alarm = layoutOf('rain-alarm').circuit;
  const quiet = await inside(alarm, 'BZ1');
  assert.equal(quiet.kind, 'buzzer-active');
  assert.equal(quiet.state, 'silent: under 2 V');
  assert.equal(quiet.count('.sound'), 0);
  const wet = await inside(alarm, 'BZ1', [{ at: 200, do: 'set', environment: 'rain', value: 1, move: 'cut' }]);
  assert.match(wet.state, /^sounding at 2\.3 kHz/);
  assert.ok(wet.count('.sound') >= 1 && wet.count('.disc.on') === 1);
});

test('up close: the active buzzer\'s pinout says how to tell it from the passive one;', () => {
  const b = buildCircuit(layoutOf('rain-alarm').circuit);
  const active = b.parts.find((p) => p.id === 'BZ1');
  const passive = buildCircuit({ version: 1, board: 'bb830', parts: [{ id: 'BZ2', type: 'buzzer', pins: ['e10', 'e12'] }] }).parts[0];
  for (const lang of ['en', 'es']) {
    const text = pinoutOf(active, createCamera({ view: 'front' }), lang).mark.text;
    assert.match(text, lang === 'en' ? /sealed bottom and beeps as soon as it is powered/ : /fondo sellado y pita apenas se alimenta/);
    assert.doesNotMatch(pinoutOf(passive, createCamera({ view: 'front' }), lang).mark.text, /sealed|sellado/);
  }
});

test('printed pin names: + and G find VCC and GND on the sensor modules, and nothing else changes', () => {
  assert.equal(findPin(['DO', 'VCC', 'GND', 'AO'], '+', 'sensor-module'), 'VCC');
  assert.equal(findPin(['DO', 'VCC', 'GND', 'AO'], 'G', 'sensor-module'), 'GND');
  assert.equal(findPin(['S', '+', '-'], 'G', 'hall-sensor'), '-');
  assert.equal(findPin(['VCC', 'GND', 'OUT'], '+', 'hall-sensor'), 'VCC');
  // A part with a real + pin keeps it; other types do not get the synonym.
  assert.equal(findPin(['S', '+', '-', 'VIN', 'GND'], '+', 'voltage-sensor'), '+');
  assert.equal(findPin(['+', '-'], '+', 'battery'), '+');
  assert.equal(findPin(['DO', 'VCC', 'GND', 'AO'], 'G', 'module'), undefined);
  const named = buildCircuit({ version: 1, board: 'bb830', parts: [{ id: 'U1', type: 'sensor-module', part: 'KY-037', pins: { DO: 'c10', '+': 'c11', G: 'c12', AO: 'c13' } }] });
  assert.deepEqual(named.parts[0].holes.map((h) => h.id), ['c10', 'c11', 'c12', 'c13']);
});

test('KY-037: the words follow DO\'s voltage: switching between the thresholds, not high while it is at 1 V', () => {
  const [lo, hi] = [98.3, 98.7];
  let seen = false;
  for (let db = lo; db <= hi; db += 0.02) {
    const r = mic(db);
    const word = r.level;
    assert.equal(word, r.vdo < 1.5 ? 'low' : r.vdo > 3.5 ? 'high' : 'switching', `${db} dB: ${r.vdo} V`);
    if (word === 'switching') seen = true;
  }
  assert.ok(seen, 'a stretch of switching');
  assert.equal(mic(70).level, 'high');
  assert.equal(mic(105).level, 'low');
  near(mic(94.9, { v: 3.3 }).vdo, 3.3, 3.3, 'any');
});

test('KY-037 on 3.3 V trips about 95 dB with the default trimmer', () => {
  assert.ok(mic(93.5, { v: 3.3 }).vdo > 3, 'quiet at 93.5 dB');
  assert.ok(mic(96, { v: 3.3 }).vdo < 0.4, 'low at 96 dB');
});

test('a hostile `model` on the new devices is dropped, not solved', () => {
  for (const model of [{ rated: 0 }, { reference: 0 }, { outputResistance: 0 }, { upper: 0 }, 'x', null, [1], { start: 'x', current: -1 }]) {
    for (const [type, extra, plus, minus, pins] of [
      ['hall-sensor', { part: 'KY-035' }, ['+'], ['-'], ['S', '+', '-']],
      ['buzzer', { part: 'TMB12A05' }, [], [], ['1', '2']],
    ]) {
      const c = type === 'buzzer'
        ? { version: 1, board: 'bb830', supplies: [{ id: 'V1', voltage: 5 }], parts: [{ id: 'U1', type, ...extra, model, pins: ['c10', 'c12'] }, { id: 'W1', type: 'wire', color: 'red', pins: ['a10', 'T+10'] }, { id: 'W2', type: 'wire', color: 'black', pins: ['a12', 'T-12'] }] }
        : { ...bench({ type, ...extra, model, pins }, { plus, minus }), names: undefined };
      delete c.names;
      const s = simulate(c);
      assert.ok(s.ok, `${type} ${JSON.stringify(model)}: ${JSON.stringify(s.issues)}`);
      assert.ok(!codes(s).includes('SIM_NO_CONVERGENCE'), `${type} ${JSON.stringify(model)}`);
    }
  }
});

test('49E with its supply reversed: the output sits at ground, the reverse note stays', () => {
  const r = run({ type: 'hall-sensor', part: 'KY-035', pins: ['S', '+', '-'] }, { plus: ['-'], minus: ['+'] });
  near(r.vout, 0, 0.01, 'output');
  assert.ok(codes({ issues: r.issues }).includes('SIM_REVERSE_VOLTAGE'));
});

// The 49E's output is current-limited at 5 mA: a short draws about that, the supply current stays
// positive (the chip's own 6 mA is more than the limit) and SIM_OVER_CURRENT says the output was asked for more.
const hallShort = (railOfS) => simulate({ version: 1, board: 'bb830', supplies: [{ id: 'V1', voltage: 5 }], parts: [
  { id: 'U1', type: 'hall-sensor', part: 'KY-035', field: 0, pins: ['c10', 'c11', 'c12'] },
  { id: 'W1', type: 'wire', color: 'red', pins: ['a11', 'T+11'] }, { id: 'W2', type: 'wire', color: 'black', pins: ['a12', 'T-12'] },
  { id: 'W3', type: 'wire', color: 'green', pins: ['a10', railOfS === 'gnd' ? 'T-10' : 'T+10'] }] });

test('49E: S shorted to ground gives about 5 mA, not 50, and says SIM_OVER_CURRENT', () => {
  const s = hallShort('gnd');
  assert.ok(s.ok, JSON.stringify(s.issues));
  near(s.parts.U1.current, 5e-3, 0.1e-3, 'output current');
  near(s.parts.U1.supply, 11e-3, 0.2e-3, 'supply current');
  assert.ok(codes(s).includes('SIM_OVER_CURRENT'), JSON.stringify(s.issues));
  assert.ok(s.issues.find((i) => i.code === 'SIM_OVER_CURRENT').severity === 'warning');
});

test('49E: S shorted to the supply sinks 5 mA and the supply current never goes negative', () => {
  const s = hallShort('vcc');
  assert.ok(s.ok, JSON.stringify(s.issues));
  near(s.parts.U1.current, -5e-3, 0.1e-3, 'output current');
  assert.ok(s.parts.U1.supply > 0.5e-3, `supply ${s.parts.U1.supply}`);
  assert.ok(codes(s).includes('SIM_OVER_CURRENT'), JSON.stringify(s.issues));
});

test('49E: a load inside the limit is unchanged (the 1 kΩ load of 2 mA says no over-current)', () => {
  const loaded = simulate({ version: 1, board: 'bb830', supplies: [{ id: 'V1', voltage: 5 }], parts: [
    { id: 'U1', type: 'hall-sensor', part: 'KY-035', field: 0, pins: ['c10', 'c11', 'c12'] }, { id: 'R1', type: 'resistor', value: '1.2k', pins: ['e10', 'e21'] },
    { id: 'W1', type: 'wire', color: 'red', pins: ['a11', 'T+11'] }, { id: 'W2', type: 'wire', color: 'black', pins: ['a12', 'T-12'] }, { id: 'W3', type: 'wire', color: 'black', pins: ['a21', 'T-21'] }] });
  assert.ok(loaded.ok && !codes(loaded).includes('SIM_OVER_CURRENT'), JSON.stringify(loaded.issues));
  near(loaded.parts.U1.current, 2.5 / 1250, 0.05e-3, 'output current');
});

test('active buzzer: its card says it is not sounding for want of voltage between 1.5 and 2.0 V, and only "silent" under 1.5 V', () => {
  const text = (v, lang) => partLines(buzzer(v), lang).map((l) => l.text)[0];
  assert.equal(text(1.8, 'en'), 'silent · not enough voltage to sound');
  assert.equal(text(1.8, 'es'), 'en silencio · sin voltaje suficiente para sonar');
  assert.equal(text(1.0, 'en'), 'silent');
  assert.match(text(5, 'en'), /^sounding/);
});

test('49E: a note between 6.5 V and the 8 V of the warning, nothing at 5 V', () => {
  const at = (v) => codes({ issues: hall({}, { v }).issues });
  assert.ok(at(7).includes('SIM_HALL_HIGH_SUPPLY') && !at(7).includes('SIM_IC_SUPPLY'));
  assert.ok(!at(6.4).includes('SIM_HALL_HIGH_SUPPLY') && !at(5).includes('SIM_HALL_HIGH_SUPPLY'));
  assert.ok(at(9).includes('SIM_IC_SUPPLY') && !at(9).includes('SIM_HALL_HIGH_SUPPLY'));
});

test('voltage sensor: a note above the 25 V on its label (40 V gives 8 V on S), none at 25 V', () => {
  const over = voltage(40);
  near(over.parts.U1.vs, 8, 0.01, 'S at 40 V');
  assert.ok(codes(over).includes('SIM_VOLTAGE_SENSOR_RANGE') && over.issues.find((i) => i.code === 'SIM_VOLTAGE_SENSOR_RANGE').severity === 'info');
  assert.ok(!codes(voltage(25)).includes('SIM_VOLTAGE_SENSOR_RANGE'));
});
