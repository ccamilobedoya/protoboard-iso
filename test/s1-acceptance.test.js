// Acceptance tests for session S1 (recipes with real sensors), written from the brief alone:
// five recipes (`ldr-night-light`, `ldr-comparator`, `lm35-comparator`, `ntc-follower`,
// `thermistor-uno`) whose sensor reads the shared environment, and two tours for the comparators.
// Part ids are not fixed by the brief, so parts are found by type (the LED, the thermistor, the
// op-amp, the board), never by name.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { RECIPES, expandRecipe } from '../src/recipes/index.js';
import { autoLayout } from '../src/layout.js';
import { simulate, compile, createEngine } from '../src/sim/index.js';
import { checkCircuit, formatIssue } from '../src/index.js';
import { compactCatalog } from '../src/node/catalog.js';
import { tourIssues, loadTour } from '../src/tour.js';

const NAMES = ['ldr-night-light', 'ldr-comparator', 'lm35-comparator', 'ntc-follower', 'thermistor-uno'];
const SENSES = { 'ldr-night-light': 'light', 'ldr-comparator': 'light', 'lm35-comparator': 'temperature', 'ntc-follower': 'temperature', 'thermistor-uno': 'temperature' };
const examples = fileURLToPath(new URL('../examples/', import.meta.url));

const why = (r) => [...r.problems, ...r.review.blocking].map((b) => formatIssue(b, 'en')).join('\n') + JSON.stringify(r.check);
const laid = (name) => {
  const { spec, problems } = expandRecipe(name);
  assert.deepEqual(problems, [], `${name}: ${JSON.stringify(problems)}`);
  const r = autoLayout(spec);
  assert.equal(r.status, 'done', `${name}: ${why(r)}`);
  return r.circuit;
};
const ofType = (circuit, type) => circuit.parts.filter((p) => p.type === type);
const the = (circuit, type) => {
  const found = ofType(circuit, type);
  assert.equal(found.length, 1, `exactly one ${type}, found ${found.map((p) => p.id)}`);
  return found[0];
};
const engineOf = (circuit) => {
  const e = createEngine(compile(circuit).program);
  assert.ok(e.start('dc'));
  return e;
};
// The LED's current (A) at a value of the environment, from a fresh DC solution of the engine.
const ledCurrent = (e, led, field, value) => {
  assert.ok(e.set('environment', field, value), `set ${field} = ${value}`);
  return e.dc().parts[led.id].current;
};
const OFF = 0.5e-3; // brief: "off" is a current < 0.5 mA
const ON = 3e-3; // brief: "on" is a current > 3 mA

// ---------------------------------------------------------------- A1, A2

test('A1: the five recipes are in the catalog and in RECIPES', () => {
  const c = compactCatalog('en');
  for (const name of NAMES) {
    assert.ok(RECIPES[name], `RECIPES has ${name}`);
    assert.ok(c.recipes[name], `the catalog lists ${name}`);
  }
});

for (const name of NAMES) {
  test(`A1: ${name} expands with its defaults, lays out DONE and checks clean`, () => {
    const circuit = laid(name);
    const bad = checkCircuit(circuit).issues.filter((i) => i.severity === 'error' || i.severity === 'warning');
    assert.deepEqual(bad.map((i) => `${i.code} ${i.severity}`), []);
  });

  test(`A1: ${name} simulates without errors and stresses no part`, () => {
    const s = simulate(laid(name));
    assert.ok(s.ok, JSON.stringify(s.issues));
    const over = Object.entries(s.parts).flatMap(([id, p]) => (p.stress ?? []).filter((x) => x.level !== 'fine').map((x) => `${id} ${x.quantity} ${x.level}`));
    assert.deepEqual(over, []);
  });

  test(`recipe ${name}: title and teaches in English and Spanish, and its values have roles`, () => {
    const r = RECIPES[name];
    for (const key of ['title', 'teaches']) for (const lang of ['en', 'es']) assert.ok(typeof r[key]?.[lang] === 'string' && r[key][lang].length > 0, `${key}.${lang}`);
    const withRole = Object.values(r.values).filter((v) => v.role);
    assert.ok(withRole.length > 0, 'some value has a role');
    for (const v of withRole) for (const lang of ['en', 'es']) assert.ok(typeof v.role[lang] === 'string' && v.role[lang].length > 0, `role.${lang}`);
  });

  test(`A2: ${name} carries environment.${SENSES[name]} and a page control for it`, () => {
    const circuit = laid(name);
    const field = SENSES[name];
    assert.ok(circuit.environment && field in circuit.environment, `environment has ${field}: ${JSON.stringify(circuit.environment)}`);
    const controls = circuit.page?.controls;
    assert.ok(Array.isArray(controls), 'page.controls is a list');
    assert.ok(controls.some((c) => c.environment === field), `a control { environment: "${field}" } in ${JSON.stringify(controls)}`);
  });
}

// ---------------------------------------------------------------- A3 to A7

test('A3: ldr-night-light, the LED is off at 300 lx and on at 10 lx', () => {
  const circuit = laid('ldr-night-light');
  const led = the(circuit, 'led');
  const e = engineOf(circuit);
  const bright = ledCurrent(e, led, 'light', 300);
  assert.ok(Math.abs(bright) < OFF, `${bright} A at 300 lx`);
  const dark = ledCurrent(e, led, 'light', 10);
  assert.ok(dark > ON, `${dark} A at 10 lx`);
  // The same whichever way it got there.
  const again = ledCurrent(e, led, 'light', 300);
  assert.ok(Math.abs(again) < OFF, `${again} A back at 300 lx`);
});

test('A4: ldr-comparator, the LED is on at 10 lx and off at 300 lx', () => {
  const circuit = laid('ldr-comparator');
  const led = the(circuit, 'led');
  const e = engineOf(circuit);
  const dark = ledCurrent(e, led, 'light', 10);
  assert.ok(dark > ON, `${dark} A at 10 lx`);
  const bright = ledCurrent(e, led, 'light', 300);
  assert.ok(Math.abs(bright) < OFF, `${bright} A at 300 lx`);
});

test('A5: lm35-comparator, the LED is off at 25 C and on at 60 C', () => {
  const circuit = laid('lm35-comparator');
  const led = the(circuit, 'led');
  const e = engineOf(circuit);
  const cool = ledCurrent(e, led, 'temperature', 25);
  assert.ok(Math.abs(cool) < OFF, `${cool} A at 25 C`);
  const hot = ledCurrent(e, led, 'temperature', 60);
  assert.ok(hot > ON, `${hot} A at 60 C`);
});

test('A6: ntc-follower, the output follows the divider within 2 % and moves by more than 0.5 V', () => {
  const circuit = laid('ntc-follower');
  const ntc = the(circuit, 'thermistor');
  const amp = circuit.parts.find((p) => p.part === 'LM358');
  assert.ok(amp, 'an LM358');
  const vs = circuit.supplies[0].voltage;
  const e = engineOf(circuit);
  const out = {};
  for (const celsius of [25, 60]) {
    assert.ok(e.set('environment', 'temperature', celsius));
    const reading = e.dc();
    const rNtc = e.read().parts[ntc.id].sensor.resistance;
    // The divider unloaded: the NTC and a 10 k resistor across the supply. The NTC is on the top
    // when its higher pin sits at the supply's voltage.
    const onTop = Math.max(...Object.values(reading.parts[ntc.id].pins)) > vs - 0.01;
    const open = onTop ? (vs * 10e3) / (10e3 + rNtc) : (vs * rNtc) / (10e3 + rNtc);
    out[celsius] = reading.parts[amp.id].pins.OUT1;
    assert.ok(Math.abs(out[celsius] - open) <= 0.02 * open, `${celsius} C: output ${out[celsius]} V, divider open at ${open} V`);
  }
  assert.ok(Math.abs(out[25] - out[60]) > 0.5, `${out[25]} V at 25 C, ${out[60]} V at 60 C`);
});

// The last Serial line of the board after 3 s of simulated time at a temperature, as a number.
const serialTemperature = (celsius) => {
  const circuit = laid('thermistor-uno');
  const board = circuit.parts.find((p) => p.part === 'UNO');
  assert.ok(board, 'an Arduino UNO');
  const e = engineOf(circuit);
  assert.ok(e.set('environment', 'temperature', celsius));
  assert.equal(e.environment().temperature, celsius);
  while (e.time < 3 - 1e-9) assert.ok(e.advance(0.05), `stalled at ${e.time} s`);
  const { serial, error } = e.read().parts[board.id].program;
  assert.equal(error, null);
  const last = serial[serial.length - 1];
  const m = /^T=(-?\d+(?:\.\d+)?)$/.exec(String(last).trim());
  assert.ok(m, `the last line is T=<value>: ${JSON.stringify(serial)}`);
  return Number(m[1]);
};

for (const celsius of [25, 60]) {
  test(`A7: thermistor-uno prints T=<value> within 1.5 C of ${celsius} C after 3 s`, () => {
    const t = serialTemperature(celsius);
    assert.ok(Math.abs(t - celsius) <= 1.5, `${t} against ${celsius}`);
  });
}

test('A7: thermistor-uno prints a new line every second (3 s of simulated time give lines to read)', () => {
  const circuit = laid('thermistor-uno');
  const board = circuit.parts.find((p) => p.part === 'UNO');
  const e = engineOf(circuit);
  while (e.time < 3 - 1e-9) assert.ok(e.advance(0.05));
  const { serial } = e.read().parts[board.id].program;
  assert.ok(serial.length >= 3 && serial.length <= 4, `${serial.length} lines in 3 s: ${JSON.stringify(serial)}`);
  assert.ok(serial.every((l) => /^T=-?\d+(\.\d+)?$/.test(String(l).trim())), JSON.stringify(serial));
});

// ---------------------------------------------------------------- A8, tours

const TOURS = { 'ldr-comparator': { field: 'light', to: 10, reading: 'current' }, 'lm35-comparator': { field: 'temperature', to: 60, reading: 'vout' } };

for (const [name, want] of Object.entries(TOURS)) {
  const file = `${examples}tours/${name}.json`;
  test(`A8: tour ${name} exists, names an existing recipe or circuit and validates`, () => {
    assert.ok(existsSync(file), file);
    const tour = JSON.parse(readFileSync(file, 'utf8'));
    assert.ok(Array.isArray(tour.steps) && tour.steps.length > 0);
    const isRecipe = tour.circuit in RECIPES;
    const isFile = existsSync(`${examples}${tour.circuit}.json`);
    assert.ok(isRecipe || isFile, `circuit "${tour.circuit}" is neither a recipe nor a file in examples/`);
    const circuit = isRecipe ? laid(tour.circuit) : JSON.parse(readFileSync(`${examples}${tour.circuit}.json`, 'utf8'));
    const withTour = { ...circuit, page: { ...circuit.page, tour } };
    const bad = tourIssues(withTour).filter((i) => i.severity === 'error' || i.severity === 'warning');
    assert.deepEqual(bad.map((i) => `${i.code} ${i.severity}`), []);
    assert.ok(loadTour(withTour, 'es').tour, 'it plays');
  });

  test(`tour ${name}: Spanish captions, gauge on, a travelling set on the environment, and a ${want.reading} value`, () => {
    const { steps } = JSON.parse(readFileSync(file, 'utf8'));
    const captions = steps.filter((s) => s.do === 'caption');
    assert.ok(captions.length > 0);
    for (const c of captions) assert.ok(typeof c.text?.es === 'string' && c.text.es.length > 0, JSON.stringify(c));
    assert.ok(steps.some((s) => s.do === 'gauge' && s.environment === want.field && s.on === true), 'gauge on');
    assert.ok(steps.some((s) => s.do === 'set' && s.environment === want.field && s.value === want.to && s.move === 'travel'), `set ${want.field} to ${want.to} with travel`);
    assert.ok(steps.some((s) => s.do === 'value' && s.field === want.reading), `a value of ${want.reading}`);
    assert.ok(Math.max(...steps.map((s) => s.at)) <= 30000, 'no step after 30 s');
  });
}

// ---------------------------------------------------------------- A9

test('A9: the compact catalog stays within 4600 characters', async () => {
  const m = await import('../src/node/catalog.js');
  const length = m.formatCompactCatalog(m.compactCatalog('en'), 'en').length;
  assert.ok(length <= 4600, `${length} characters`);
});
