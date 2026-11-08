// The recipes with real sensors (S1): each one carries an environment and the page controls for the
// field it senses, and its behaviour is the sensor's, read from the environment (docs/en/environment.md).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { RECIPES, expandRecipe, resolveRecipe } from '../src/recipes/index.js';
import { autoLayout } from '../src/layout.js';
import { checkCircuit } from '../src/index.js';
import { compile, createEngine } from '../src/sim/index.js';
import { loadTour, tourIssues } from '../src/tour.js';

const SENSED = { 'ldr-night-light': 'light', 'ldr-comparator': 'light', 'lm35-comparator': 'temperature', 'ntc-follower': 'temperature', 'thermistor-uno': 'temperature' };
const circuitOf = (name, values) => {
  const { spec, problems } = expandRecipe(name, values);
  assert.deepEqual(problems, []);
  const r = autoLayout(spec);
  assert.equal(r.status, 'done', name);
  return r.circuit;
};
const engineOf = (circuit) => {
  const e = createEngine(compile(circuit).program);
  assert.ok(e.start('dc'));
  return e;
};
const read = (e, field, value) => {
  e.set('environment', field, value);
  return e.read();
};

test('sensor recipes: in the catalog, laid out, checked without errors or warnings', () => {
  for (const name of Object.keys(SENSED)) {
    assert.ok(RECIPES[name], name);
    for (const lang of ['en', 'es']) {
      assert.ok(RECIPES[name].title[lang] && RECIPES[name].teaches[lang], `${name} ${lang}`);
      for (const [id, v] of Object.entries(RECIPES[name].values)) if (v.role) assert.ok(v.role[lang], `${name} ${id} ${lang}`);
    }
    const bad = checkCircuit(circuitOf(name)).issues.filter((i) => i.severity === 'error' || i.severity === 'warning');
    assert.deepEqual(bad, [], name);
  }
});

test('sensor recipes: the circuit has the environment of the field it senses and its page control', () => {
  for (const [name, field] of Object.entries(SENSED)) {
    const c = circuitOf(name);
    assert.ok(c.environment && field in c.environment, `${name} environment`);
    assert.ok(c.page.controls.some((x) => x.environment === field), `${name} page control`);
  }
});

test('recipes carry environment and page: copied, not shared, and replaced by what is given beside', () => {
  const a = expandRecipe('ldr-comparator').spec;
  a.environment.light = 1;
  a.page.controls.push({ environment: 'temperature' });
  const b = expandRecipe('ldr-comparator').spec;
  assert.equal(b.environment.light, 300);
  assert.equal(b.page.controls.length, 1);
  const own = resolveRecipe({ recipe: 'ldr-comparator', environment: { light: 5 }, page: { controls: [] } }).spec;
  assert.deepEqual(own.environment, { light: 5 });
  assert.deepEqual(own.page, { controls: [] });
  assert.equal(autoLayout(own).circuit.environment.light, 5);
});

test('ldr-night-light: off at 300 lx, on at 10 lx', () => {
  const e = engineOf(circuitOf('ldr-night-light'));
  assert.ok(read(e, 'light', 300).parts.D1.current < 0.5e-3);
  assert.ok(read(e, 'light', 10).parts.D1.current > 3e-3);
});

test('ldr-comparator: on at 10 lx, off at 300 lx', () => {
  const e = engineOf(circuitOf('ldr-comparator'));
  assert.ok(read(e, 'light', 300).parts.D1.current < 0.5e-3);
  assert.ok(read(e, 'light', 10).parts.D1.current > 3e-3);
  assert.ok(read(e, 'light', 300).parts.D1.current < 0.5e-3, 'and back off');
});

test('lm35-comparator: off at 25 °C, on at 60 °C', () => {
  const e = engineOf(circuitOf('lm35-comparator'));
  assert.ok(read(e, 'temperature', 25).parts.D1.current < 0.5e-3);
  assert.ok(read(e, 'temperature', 60).parts.D1.current > 3e-3);
  assert.ok(read(e, 'temperature', 25).parts.D1.current < 0.5e-3, 'and back off');
});

test('ntc-follower: the output is the divider\'s open voltage, and it moves with the temperature', () => {
  const e = engineOf(circuitOf('ntc-follower'));
  const out = (T) => {
    const s = read(e, 'temperature', T);
    return { vout: s.parts.U1.vout, divider: s.parts.R1.voltage };
  };
  const cold = out(25);
  const hot = out(60);
  assert.ok(Math.abs(cold.vout - cold.divider) <= 0.02 * cold.divider, JSON.stringify(cold));
  assert.ok(Math.abs(hot.vout - hot.divider) <= 0.02 * hot.divider, JSON.stringify(hot));
  assert.ok(Math.abs(hot.vout - cold.vout) > 0.5);
});

test('thermistor-uno: it prints T=<°C> every second, within 1.5 °C of the environment', () => {
  for (const T of [25, 60]) {
    const e = engineOf(circuitOf('thermistor-uno'));
    e.set('environment', 'temperature', T);
    for (let i = 0; i < 3000; i++) assert.ok(e.advance(0.001));
    const serial = e.read().parts.U1.program.serial;
    assert.ok(serial.length >= 3, `one line a second: ${serial}`);
    const last = serial.at(-1);
    assert.match(last, /^T=-?\d+(\.\d+)?$/);
    assert.ok(Math.abs(Number(last.slice(2)) - T) <= 1.5, `${T} °C read as ${last}`);
  }
});

test('a sketch can call log (natural logarithm)', () => {
  const sketch = 'void setup() { Serial.begin(9600); } void loop() { Serial.println(log(100.0)); delay(1000); }';
  const e = engineOf(autoLayout(expandRecipe('uno-blink', { U1: sketch }).spec).circuit);
  for (let i = 0; i < 1500; i++) assert.ok(e.advance(0.001));
  const board = e.read().parts.U1.program;
  assert.equal(board.error, null);
  assert.deepEqual(board.notes, []);
  assert.ok(Math.abs(Number(board.serial.at(-1)) - Math.log(100)) < 0.01, board.serial.join());
});

for (const name of ['ldr-comparator', 'lm35-comparator']) {
  test(`tour ${name}: valid for its recipe, in Spanish too`, () => {
    const file = JSON.parse(readFileSync(new URL(`../examples/tours/${name}.json`, import.meta.url), 'utf8'));
    assert.equal(file.circuit, name);
    assert.ok(RECIPES[file.circuit]);
    const circuit = { ...circuitOf(name), page: { ...circuitOf(name).page, tour: file } };
    assert.deepEqual(tourIssues(circuit), []);
    assert.ok(loadTour(circuit, 'es').tour);
    const sets = file.steps.filter((s) => s.do === 'set');
    assert.ok(sets.length >= 2 && sets.every((s) => s.environment === SENSED[name] && s.move === 'travel'));
    assert.ok(file.steps.some((s) => s.do === 'gauge' && s.on));
    assert.ok(file.steps.at(-1).at >= 20000 && file.steps.at(-1).at <= 30000);
  });
}
