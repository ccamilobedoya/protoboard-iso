// Acceptance tests for the HC-SR04 ultrasonic sensor (`ultrasonic-sensor`) and `pulseIn` in a board's
// program (A1 … A10), written from their contract and the module's physics (the speed of sound,
// 331.3 + 0.606·T m/s; the echo 2·d / v), before looking at any implementation.
//
// How time is read, the way a learner would: through what the sketch prints (the board's Serial lines,
// `engine.read().parts.<board>.program.serial`) and through voltages / currents over engine steps. The
// engine is stepped as the page steps it: `advance(h)` with h = the engine's own `stepHint()` when it
// asks for a finer step than 1 ms, else 1 ms.
//
// Where the contract names nothing, the names used here are assumptions about the kit's own.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkCircuit, inspectCircuit } from '../src/index.js';
import { simulate, compile, createEngine } from '../src/sim/index.js';
import { partLines } from '../src/sim/format.js';
import { buildCircuit } from '../src/circuit/build.js';
import { PART_TYPES } from '../src/parts/types/index.js';
import { catalogEntry, compactCatalog, formatCompactCatalog } from '../src/node/catalog.js';
import { RECIPES, expandRecipe } from '../src/recipes/index.js';
import { autoLayout } from '../src/layout.js';
import { symbolOf, insideOf } from '../src/parts/symbols.js';
import { t as translate } from '../src/i18n/index.js';
import { tourIssues } from '../src/tour.js';
import { timelineCircuit } from '../scripts/render-frames.js';
import { formatIssue } from '../src/index.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const tourFile = join(root, 'examples/tours/uno-distance.json');
const H = 0.001;
const TYPE = 'ultrasonic-sensor';
const codes = (issues) => issues.map((i) => i.code);
const near = (actual, expected, tol, what) => assert.ok(Math.abs(actual - expected) <= tol, `${what}: ${actual} vs ${expected} (± ${tol})`);
const inRange = (value, lo, hi, what) => assert.ok(value >= lo && value <= hi, `${what}: ${value} not in ${lo}…${hi}`);

// ---------------------------------------------------------------- engine helpers

function engineOf(circuit) {
  const compiled = compile(circuit);
  assert.ok(compiled.program, `compiles: ${JSON.stringify(compiled.issues)}`);
  const engine = createEngine(compiled.program);
  assert.ok(engine.start('dc', H), 'starts at the DC point');
  return engine;
}

// Steps until `until` seconds of simulated time, the way the page does: the engine's own step hint when it
// asks for less than 1 ms. `each(engine)` runs after every step.
function run(engine, until, each) {
  while (until - engine.time > 1e-9) {
    const hint = engine.stepHint();
    const h = Math.min(H, hint ?? H, until - engine.time);
    assert.ok(engine.advance(h), `stalled at t = ${engine.time} s`);
    each?.(engine);
  }
}

const serialOf = (engine, board) => engine.read().parts[board].program.serial;
const programOf = (engine, board) => engine.read().parts[board].program;

// Every line the sketch printed is a whole number (pulseIn returns an integer), at least `count` of them.
function widths(engine, board, count = 3) {
  const program = programOf(engine, board);
  assert.equal(program.error, null, `the program runs: ${program.error}`);
  assert.ok(program.serial.length >= count, `at least ${count} lines printed, got ${JSON.stringify(program.serial)}`);
  for (const line of program.serial) assert.match(line, /^\d+$/, `an integer on Serial: "${line}"`);
  return program.serial.map(Number);
}

// ---------------------------------------------------------------- the hand bench

// The classic sketch of uno-distance: TRIG on D9, ECHO on D10; `high` is the TRIG pulse in µs, `timeout`
// the pulseIn timeout in µs (null: the two-argument form), `wait` the delay between measurements in ms.
const sketch = ({ high = 10, timeout = 30000, wait = 100, fn = 'pulseIn' } = {}) => `void setup() {
  Serial.begin(9600);
  pinMode(9, OUTPUT);
  pinMode(10, INPUT);
}
void loop() {
  digitalWrite(9, LOW);
  delayMicroseconds(2);
  digitalWrite(9, HIGH);
  delayMicroseconds(${high});
  digitalWrite(9, LOW);
  unsigned long us = ${fn}(10, HIGH${timeout == null ? '' : `, ${timeout}`});
  Serial.println(us);
  delay(${wait});
}`;

// HC-SR04 standing on f10 f11 f12 f13 (VCC TRIG ECHO GND, as the catalog lists them), a UNO (A1) whose
// D9 and D10 lead to the TRIG and ECHO columns on the far strip (row j) and whose GND goes to the − rail;
// the module's VCC and GND by wires from the rails to row j. Nothing small sits behind the module.
// `slider` adds an unrelated 1 kΩ resistor across the supply (R2), which has a control of its own.
function bench({ program = sketch(), volts = 5, environment = { distance: 100, temperature: 20 }, slider = false, own = {} } = {}) {
  const pins = catalogEntry(TYPE)?.pins;
  assert.deepEqual(pins, ['VCC', 'TRIG', 'ECHO', 'GND'], 'pins as printed');
  const col = (name) => 10 + pins.indexOf(name);
  return {
    supplies: [{ id: 'V1', voltage: volts }],
    environment,
    parts: [
      { id: 'U1', type: TYPE, pins: pins.map((_, i) => `f${10 + i}`), ...own },
      { id: 'W1', type: 'wire', color: 'red', pins: [`T+${col('VCC')}`, `j${col('VCC')}`] },
      { id: 'W2', type: 'wire', color: 'black', pins: [`T-${col('GND')}`, `j${col('GND')}`] },
      { id: 'A1', type: 'module', part: 'UNO', pins: { D9: `j${col('TRIG')}`, D10: `j${col('ECHO')}`, GND: 'T-27' }, program },
      ...(slider
        ? [
            { id: 'R2', type: 'resistor', value: '1k', pins: ['h34', 'h38'] },
            { id: 'W4', type: 'wire', color: 'red', pins: ['T+34', 'j34'] },
            { id: 'W5', type: 'wire', color: 'black', pins: ['T-39', 'j38'] },
          ]
        : []),
    ],
  };
}

// The width the sketch prints for one setting, after `seconds` of simulated time.
function measured(options, seconds = 1.0) {
  const engine = engineOf(bench(options));
  run(engine, seconds);
  return widths(engine, 'A1');
}

// ---------------------------------------------------------------- A1 · the catalog

test('A1 · ultrasonic-sensor is a type of family sensor with pins VCC TRIG ECHO GND', () => {
  const type = PART_TYPES[TYPE];
  assert.ok(type, `type ${TYPE}`);
  assert.equal(type.family, 'sensor');
  assert.deepEqual(type.pins, ['VCC', 'TRIG', 'ECHO', 'GND']);
  const entry = catalogEntry(TYPE);
  assert.ok(entry, 'a catalog entry');
  assert.deepEqual(entry.pins, ['VCC', 'TRIG', 'ECHO', 'GND']);
});

test('A1 · the compact catalog lists it under the family sensor in both languages and stays within 4600 characters', () => {
  for (const lang of ['en', 'es']) {
    const lines = formatCompactCatalog(compactCatalog(lang), lang).split('\n');
    const start = lines.indexOf('sensor');
    assert.ok(start >= 0, `${lang}: block sensor`);
    let end = start + 1;
    while (end < lines.length && lines[end].startsWith('  ')) end++;
    const listed = lines.slice(start + 1, end).map((l) => l.trim().split(':')[0]);
    assert.ok(listed.includes(TYPE), `${lang}: ${TYPE} under sensor (${listed.join(', ')})`);
  }
  const length = formatCompactCatalog(compactCatalog('en'), 'en').length;
  assert.ok(length <= 4600, `${length} characters`);
});

// ---------------------------------------------------------------- A2 · pulseIn against the HC-SR04

test('A2 · pulseIn at 100 cm and 20 °C reads 5824 µs ± 1 % (5766…5882), every measurement', () => {
  for (const w of measured({ environment: { distance: 100, temperature: 20 } })) inRange(w, 5766, 5882, 'echo width at 100 cm, 20 °C');
});

test('A2 · pulseIn at 10 cm and 25 °C reads 577 ± 20 µs', () => {
  for (const w of measured({ environment: { distance: 10, temperature: 25 } })) near(w, 577, 20, 'echo width at 10 cm, 25 °C');
});

test('A2 · at 450 cm pulseIn(ECHO, HIGH, 30000) returns 0', () => {
  for (const w of measured({ environment: { distance: 450, temperature: 20 }, program: sketch({ timeout: 30000 }) })) assert.equal(w, 0);
});

test('A2 · at 450 cm with a 60 000 µs timeout pulseIn reads 38 000 ± 2000 µs (the no-echo pulse)', () => {
  const lines = measured({ environment: { distance: 450, temperature: 20 }, program: sketch({ timeout: 60000 }) }, 1.5);
  for (const w of lines) near(w, 38000, 2000, 'echo width at 450 cm');
});

test('A2 · 400 cm at 20 °C reads 23.3 ms (23 300 µs, ± 1 %, as at 100 cm)', () => {
  for (const w of measured({ environment: { distance: 400, temperature: 20 }, program: sketch({ timeout: 60000 }) }, 1.0)) near(w, 23300, 233, 'echo width at 400 cm');
});

test('A2 · 50 cm at 0 °C reads 3018 µs (± 1 %: the speed of sound follows the temperature field)', () => {
  for (const w of measured({ environment: { distance: 50, temperature: 0 } })) near(w, 3018, 30.18, 'echo width at 50 cm, 0 °C');
});

test('A2 · the two-argument pulseIn and pulseInLong give the same width', () => {
  for (const options of [{ program: sketch({ timeout: null }) }, { program: sketch({ fn: 'pulseInLong' }) }]) {
    for (const w of measured(options)) inRange(w, 5766, 5882, `echo width with ${options.program.match(/= (pulseIn\w*\(10, HIGH[^)]*\))/)[1]}`);
  }
});

test('A2 · pulseIn called while the pin is already at the value waits for it to fall and then for a new pulse: here none, so 0', () => {
  // TRIG at 0 µs, ECHO rises ~250 µs later and stays high for ~5.8 ms; at 2000 µs the pin is high.
  const program = `void setup() { Serial.begin(9600); pinMode(9, OUTPUT); pinMode(10, INPUT); }
void loop() {
  digitalWrite(9, HIGH); delayMicroseconds(10); digitalWrite(9, LOW);
  delayMicroseconds(2000);
  unsigned long us = pulseIn(10, HIGH, 30000);
  Serial.println(us);
  delay(100);
}`;
  for (const w of measured({ program })) assert.equal(w, 0);
});

// ---------------------------------------------------------------- A3 · uno-distance follows the environment

const layoutOf = (name) => {
  const { spec, problems } = expandRecipe(name);
  assert.deepEqual(problems, [], `${name}: ${JSON.stringify(problems)}`);
  return autoLayout(spec);
};
const boardOf = (circuit, part) => circuit.parts.find((p) => p.part === part).id;

test('A3 · uno-distance prints "30" (± 1) within 0.5 s, and "10" (± 1) within 0.5 s of moving the environment to 10 cm', () => {
  const { circuit } = layoutOf('uno-distance');
  const board = boardOf(circuit, 'UNO');
  const engine = engineOf(circuit);
  run(engine, 0.5);
  const first = serialOf(engine, board);
  assert.equal(programOf(engine, board).error, null);
  assert.ok(first.some((line) => /^\d+(\.\d+)?$/.test(line.trim()) && Math.abs(Number(line) - 30) <= 1), `a line 30 ± 1 within 0.5 s: ${JSON.stringify(first)}`);
  const printed = first.length;
  assert.ok(engine.set('environment', 'distance', 10), 'the environment moves');
  run(engine, engine.time + 0.5);
  const after = serialOf(engine, board).slice(printed);
  assert.ok(after.length > 0, 'it kept printing');
  assert.ok(after.some((line) => /^\d+(\.\d+)?$/.test(line.trim()) && Math.abs(Number(line) - 10) <= 1), `a line 10 ± 1 within 0.5 s: ${JSON.stringify(after)}`);
});

// ---------------------------------------------------------------- A4 · a short TRIG pulse

test('A4 · a TRIG pulse of 5 µs gives no echo: pulseIn returns 0 with a 30 000 µs timeout (and 10 µs does)', () => {
  for (const w of measured({ program: sketch({ high: 5, timeout: 30000 }) })) assert.equal(w, 0);
  for (const w of measured({ program: sketch({ high: 10, timeout: 30000 }) })) assert.ok(w > 5000, `10 µs triggers: ${w}`);
});

// ---------------------------------------------------------------- A5 · supply

const idleSketch = 'void setup() { pinMode(9, OUTPUT); digitalWrite(9, LOW); pinMode(10, INPUT); }\nvoid loop() { delay(100); }';

test('A5 · the supply current idle is 2 mA ± 1 mA', () => {
  const engine = engineOf(bench({ program: idleSketch }));
  run(engine, 0.5);
  near(Math.abs(engine.read().supplies.V1.current), 2e-3, 1e-3, 'idle supply current');
});

test('A5 · the supply current while measuring is 15 mA ± 1 mA, and 2 mA ± 1 mA again between measurements', () => {
  const engine = engineOf(bench());
  let peak = 0;
  let floor = Infinity;
  run(engine, 0.5, (e) => {
    const i = Math.abs(e.read().supplies.V1.current);
    peak = Math.max(peak, i);
    floor = Math.min(floor, i);
  });
  near(peak, 15e-3, 1e-3, 'peak supply current while measuring');
  near(floor, 2e-3, 1e-3, 'lowest supply current between measurements');
});

test('A5 · on 4 V the module says SIM_MODULE_LOW_SUPPLY and gives no echo (pulseIn 0 with 30 000 µs); on 5 V it does not say it', () => {
  assert.ok(codes(simulate(bench({ volts: 4 })).issues).includes('SIM_MODULE_LOW_SUPPLY'), JSON.stringify(simulate(bench({ volts: 4 })).issues));
  assert.ok(!codes(simulate(bench({ volts: 5 })).issues).includes('SIM_MODULE_LOW_SUPPLY'));
  for (const w of measured({ volts: 4, program: sketch({ timeout: 30000 }) })) assert.equal(w, 0);
});

test('A5 · on 6 V the module says SIM_IC_SUPPLY; on 5 V it does not', () => {
  assert.ok(codes(simulate(bench({ volts: 6 })).issues).includes('SIM_IC_SUPPLY'), JSON.stringify(simulate(bench({ volts: 6 })).issues));
  assert.ok(!codes(simulate(bench({ volts: 5 })).issues).includes('SIM_IC_SUPPLY'));
});

// ---------------------------------------------------------------- the card

test('cards · the card says the phase in words, the distance it sees and the echo width, in both languages, and changes with the phase', () => {
  const engine = engineOf(bench({ program: sketch({ wait: 100 }), environment: { distance: 100, temperature: 20 } }));
  const pin = () => engine.read().parts.A1.pins.find((x) => x.name === 'D10').voltage;
  const text = (lang) => partLines(engine.read().parts.U1, lang).map((l) => l.text).join(' | ');
  const idle = { en: text('en'), es: text('es') };
  let high;
  run(engine, 0.2, () => {
    if (!high && pin() > 2.5) high = { en: text('en'), es: text('es') };
  });
  assert.ok(high, 'ECHO went high');
  const done = { en: text('en'), es: text('es') };
  for (const lang of ['en', 'es']) {
    for (const [name, line] of [['idle', idle[lang]], ['echo high', high[lang]], ['after', done[lang]]]) {
      assert.ok(line.length > 0, `${lang} ${name}: lines`);
      assert.doesNotMatch(line, /\{\w+\}|undefined|NaN/, `${lang} ${name}: placeholders filled`);
    }
    assert.notEqual(idle[lang], high[lang], `${lang}: the phase shows`);
    assert.match(high[lang], /100/, `${lang}: the distance it sees (100 cm) while the echo is high`);
    assert.match(`${high[lang]} | ${done[lang]}`, /5[.,]8\d* ?ms|5[ .]?824 ?µs|58\d\d ?µs/, `${lang}: the echo width in µs or ms`);
  }
  assert.notEqual(high.en, high.es, 'translated');
});

// ---------------------------------------------------------------- A6 · the ESP32 and the divider

const resistors = (circuit, ohms) => circuit.parts.filter((p) => p.type === 'resistor' && Number.parseFloat(String(p.value)) * ({ k: 1e3, K: 1e3, M: 1e6 }[String(p.value).trim().slice(-1)] ?? 1) === ohms);

// The recipe's circuit without the divider: the 1 kΩ becomes a wire between its two holes and the 2 kΩ goes.
function withoutDivider(circuit) {
  const top = resistors(circuit, 1000);
  const bottom = resistors(circuit, 2000);
  assert.equal(top.length, 1, 'the recipe has one 1 kΩ resistor');
  assert.equal(bottom.length, 1, 'the recipe has one 2 kΩ resistor');
  return {
    ...circuit,
    parts: circuit.parts.filter((p) => p !== bottom[0]).map((p) => (p === top[0] ? { id: p.id, type: 'wire', color: 'green', pins: p.pins } : p)),
  };
}
const overvoltage = (circuit) => simulate(circuit, { analysis: 'transient', stop: 0.01, step: 1e-5, points: 2000 }).issues.filter((i) => i.code === 'SIM_PIN_OVERVOLTAGE');

test('A6 · esp32-distance: no pin over-voltage issue', () => {
  const { circuit } = layoutOf('esp32-distance');
  assert.deepEqual(overvoltage(circuit), []);
});

test('A6 · esp32-distance: the ESP32 pin sees 3.33 V ± 0.05 while ECHO is high', () => {
  const { circuit } = layoutOf('esp32-distance');
  const board = boardOf(circuit, 'ESP32-DEVKIT');
  const engine = engineOf(circuit);
  let peak = 0;
  run(engine, 0.4, (e) => {
    for (const x of e.read().parts[board].pins) if (x.mode === 'input') peak = Math.max(peak, x.voltage);
  });
  near(peak, 3.33, 0.05, 'highest voltage on an input pin of the ESP32');
});

test('A6 · esp32-distance: the program still reads 30 cm ± 1', () => {
  const { circuit } = layoutOf('esp32-distance');
  const board = boardOf(circuit, 'ESP32-DEVKIT');
  const engine = engineOf(circuit);
  run(engine, 0.5);
  const lines = serialOf(engine, board);
  assert.equal(programOf(engine, board).error, null);
  assert.ok(lines.length > 0, 'it prints');
  assert.ok(lines.some((l) => /^\d+(\.\d+)?$/.test(l.trim()) && Math.abs(Number(l) - 30) <= 1), JSON.stringify(lines));
});

test('A6 · the same circuit WITHOUT the divider raises SIM_PIN_OVERVOLTAGE', () => {
  const { circuit } = layoutOf('esp32-distance');
  const bare = withoutDivider(circuit);
  assert.ok(overvoltage(bare).length > 0, 'over-voltage on the ESP32 pin');
});

test('A6 · the recipe says why the divider is there, in both languages', () => {
  const r = RECIPES['esp32-distance'];
  assert.ok(r, 'recipe esp32-distance');
  for (const lang of ['en', 'es']) assert.match(`${r.teaches?.[lang]} ${r.title?.[lang]}`, /divid|divisor|3[.,]3/i, lang);
});

// ---------------------------------------------------------------- A7 · the recipes

const RECIPE_NAMES = ['uno-distance', 'esp32-distance', 'distance-alarm-uno'];
const why = (r) => [...r.problems, ...r.review.blocking].map((b) => formatIssue(b, 'en')).join('\n') + JSON.stringify(r.check);

test('A7 · the three recipes exist with a title and a lesson in both languages', () => {
  for (const name of RECIPE_NAMES) {
    assert.ok(RECIPES[name], `recipe ${name}`);
    for (const lang of ['en', 'es']) {
      assert.ok(RECIPES[name].title?.[lang], `${name}: title ${lang}`);
      assert.ok(RECIPES[name].teaches?.[lang], `${name}: teaches ${lang}`);
    }
  }
});

for (const name of RECIPE_NAMES) {
  test(`A7 · ${name} is DONE in the layout bench and checks clean`, () => {
    const r = layoutOf(name);
    assert.equal(r.status, 'done', why(r));
    assert.deepEqual(r.circuit.spec.recipe, { name });
    const bad = checkCircuit(r.circuit).issues.filter((i) => i.severity === 'error' || i.severity === 'warning');
    assert.deepEqual(codes(bad), [], name);
    assert.ok(r.circuit.parts.some((p) => p.type === TYPE), `${name} uses the ${TYPE}`);
  });

  test(`A7 · ${name}: no part is hidden in both views (at least 50 % visible in one of them), no render error`, () => {
    const { circuit } = layoutOf(name);
    const seen = new Map();
    for (const view of ['front', 'back']) {
      const report = inspectCircuit(circuit, { view });
      const bad = report.problems.filter((p) => (p.severity === 'error' || p.severity === 'warning') && p.code !== 'PART_HIDDEN');
      assert.deepEqual(bad, [], `${view}: inspect problems`);
      for (const p of report.parts) seen.set(p.id, Math.max(seen.get(p.id) ?? 0, p.visible));
    }
    assert.ok(seen.size > 0);
    for (const [id, visible] of seen) assert.ok(visible >= 0.5, `${id} is hidden in both views (${Math.round(visible * 100)} % at best)`);
  });

  test(`A7 · ${name} carries an environment with distance and a controls panel for it`, () => {
    const { circuit } = layoutOf(name);
    assert.ok(circuit.environment && 'distance' in circuit.environment, 'environment names distance');
    const controls = circuit.page?.controls;
    assert.ok(Array.isArray(controls) && controls.some((c) => c.environment === 'distance'), 'a page control for distance');
  });
}

test('A7 · uno-distance: the environment distance is 30 cm with range [2, 100]; TRIG D9, ECHO D10, the classic sketch', () => {
  const { circuit } = layoutOf('uno-distance');
  const field = circuit.environment.distance;
  const value = typeof field === 'object' ? field.value : field;
  assert.equal(value, 30);
  assert.deepEqual(typeof field === 'object' ? field.range : null, [2, 100]);
  const code = circuit.parts.find((p) => p.part === 'UNO').program;
  assert.match(code, /pulseIn\s*\(\s*\w+\s*,\s*HIGH\s*,\s*30000\s*\)/);
  assert.match(code, /delayMicroseconds\s*\(\s*10\s*\)/);
  assert.match(code, /delayMicroseconds\s*\(\s*2\s*\)/);
  assert.match(code, /\/\s*58/);
  assert.match(code, /Serial\.println/);
  assert.match(code, /delay\s*\(\s*100\s*\)/);
});

test('A7 · esp32-distance is on an ESP32 DevKit with a 1 kΩ / 2 kΩ divider', () => {
  const { circuit } = layoutOf('esp32-distance');
  assert.ok(circuit.parts.some((p) => p.part === 'ESP32-DEVKIT'), 'an ESP32 DevKit');
  assert.equal(resistors(circuit, 1000).length, 1);
  assert.equal(resistors(circuit, 2000).length, 1);
});

test('A7 · distance-alarm-uno: the LED is off at 30 cm and lit at 10 cm (alarm under 15 cm), with a resistor in series', () => {
  const { circuit } = layoutOf('distance-alarm-uno');
  const led = circuit.parts.find((p) => p.type === 'led');
  assert.ok(led, 'an LED');
  assert.ok(circuit.parts.some((p) => p.type === 'resistor'), 'a resistor');
  const engine = engineOf(circuit);
  const current = () => Math.abs(engine.read().parts[led.id].current);
  run(engine, 0.5);
  assert.ok(current() < 1e-4, `off at 30 cm: ${current()} A`);
  assert.ok(engine.set('environment', 'distance', 10));
  run(engine, engine.time + 0.5);
  assert.ok(current() > 1e-3, `lit at 10 cm: ${current()} A`);
  assert.ok(engine.set('environment', 'distance', 30));
  run(engine, engine.time + 0.5);
  assert.ok(current() < 1e-4, `off again at 30 cm: ${current()} A`);
});

// ---------------------------------------------------------------- A8 · up close and the tour

test('A8 · ultrasonic-sensor has everything for its view up close (symbol, mark, inside view, drawer, legend, pin texts in both languages)', () => {
  const figure = readFileSync(new URL('../src/page/client/figure.js', import.meta.url), 'utf8');
  const legends = readFileSync(new URL('../src/page/client/focus-view.js', import.meta.url), 'utf8');
  const both = (key) => ['en', 'es'].every((lang) => translate(lang, key) !== key);
  const p = buildCircuit(layoutOf('uno-distance').circuit).parts.find((x) => x.type === TYPE);
  assert.ok(p, 'the sensor in the circuit');
  for (const n of p.pinNames) assert.ok(both(`pin.role.${p.raw?.part}.${n}`) || both(`pin.role.${TYPE}.${n}`), `the text of pin ${n} (pin.role.*) in every language`);
  const symbol = symbolOf(p);
  assert.ok(symbol, 'a symbol');
  for (const n of p.pinNames) assert.ok(symbol.ids?.[n] && symbol.pins[n], `the symbol's terminal and letter for pin ${n}`);
  assert.ok(p.built?.mark, "the package's orientation mark");
  const inside = insideOf(p);
  assert.ok(inside, 'an inside view');
  assert.match(figure, new RegExp(`\\n  ${inside.kind}\\(g, r, data`), 'its drawer in figure.js INSIDE');
  const legend = legends.match(new RegExp(`\\n  ${inside.kind}: \\[(.*)\\],`))?.[1];
  assert.ok(legend, 'its legend in focus-view.js LEGENDS');
  for (const [, key] of legend.matchAll(/\['[a-z]*', '([a-z]+)'\]/g)) assert.ok(both(`page.tour.legend.${inside.kind}.${key}`), `legend line ${key} in every language`);
});

test('A8 · the tour examples/tours/uno-distance.json validates with render-frames.js --validate', () => {
  assert.ok(existsSync(tourFile), 'examples/tours/uno-distance.json');
  const r = spawnSync(process.execPath, ['scripts/render-frames.js', tourFile, '--validate'], { cwd: root, encoding: 'utf8' });
  assert.equal(r.status, 0, `${r.stdout}\n${r.stderr}`);
});

test('A8 · the tour plays its recipe, has Spanish captions, ends within 30 s, a gauge of distance 2…100, and sets 60 then 10 with a travel', () => {
  assert.ok(existsSync(tourFile), 'examples/tours/uno-distance.json');
  const timeline = JSON.parse(readFileSync(tourFile, 'utf8'));
  const circuit = timelineCircuit(tourFile, timeline);
  assert.deepEqual(tourIssues({ ...circuit, page: { ...circuit.page, tour: timeline } }), []);
  const steps = timeline.steps;
  const captions = steps.filter((s) => s.do === 'caption');
  assert.ok(captions.length > 0, 'captions');
  for (const s of captions) assert.ok(s.text?.es, `step at ${s.at}: a Spanish caption`);
  assert.ok(Math.max(...steps.map((s) => s.at)) <= 30000, 'no step after 30 s');
  assert.ok(steps.some((s) => s.do === 'gauge' && s.environment === 'distance' && s.on === true && s.min === 2 && s.max === 100), 'a gauge on distance, min 2, max 100');
  const sets = steps.filter((s) => s.do === 'set' && s.environment === 'distance').sort((a, b) => a.at - b.at);
  const first60 = sets.findIndex((s) => s.value === 60);
  assert.ok(first60 >= 0, 'distance set to 60');
  assert.ok(sets.slice(first60 + 1).some((s) => s.value === 10), 'then to 10');
  assert.ok(steps.some((s) => s.move === 'travel'), 'a travel move');
});

// ---------------------------------------------------------------- A9 · safety

// An unknown call of a sketch returns 0 at once (SIM_PROGRAM_UNSUPPORTED): a freeze test would pass for the
// wrong reason, so each one starts by asking that pulseIn is a name the runtime knows.
function aloneEngine(program) {
  const circuit = alone(program);
  assert.deepEqual(codes(simulate(circuit).issues).filter((c) => c === 'SIM_PROGRAM_UNSUPPORTED'), [], 'pulseIn is a name the runtime knows');
  return engineOf(circuit);
}

function wallMs(fn) {
  const t0 = process.hrtime.bigint();
  const result = fn();
  return { result, ms: Number(process.hrtime.bigint() - t0) / 1e6 };
}
// A UNO alone (no sensor, pin 7 left floating): the safety items are about pulseIn, not about the module.
const alone = (program) => ({ parts: [{ id: 'A1', type: 'module', part: 'UNO', pins: { GND: 'T-27' }, program }] });
const wild = (loop) => `void setup() { Serial.begin(9600); }\nvoid loop() { ${loop} }`;

test('A9 · void loop(){ pulseIn(7, HIGH); } on a pin nothing drives: one advance of 1 s returns in well under 2 s of wall time', () => {
  const engine = aloneEngine(wild('pulseIn(7, HIGH);'));
  const { result, ms } = wallMs(() => engine.advance(1));
  assert.equal(result, true, 'the engine takes the step');
  assert.ok(ms < 2000, `${ms} ms of wall time`);
  assert.equal(programOf(engine, 'A1').error, null);
});

test('A9 · pulseIn(7, HIGH, 4000000000) does not freeze the engine (advance of 1 s well under 2 s of wall time, still running)', () => {
  const engine = aloneEngine(wild('pulseIn(7, HIGH, 4000000000);'));
  for (let k = 0; k < 3; k++) {
    const { result, ms } = wallMs(() => engine.advance(1));
    assert.equal(result, true, `advance ${k}`);
    assert.ok(ms < 2000, `advance ${k}: ${ms} ms of wall time`);
  }
  assert.equal(programOf(engine, 'A1').error, null);
});

test('A9 · a timeout that is negative or not finite does not freeze the engine either', () => {
  for (const timeout of ['-5', '-4000000000', '1e999']) {
    const engine = aloneEngine(wild(`pulseIn(7, HIGH, ${timeout});`));
    const { result, ms } = wallMs(() => engine.advance(1));
    assert.equal(result, true, `timeout ${timeout}`);
    assert.ok(ms < 2000, `timeout ${timeout}: ${ms} ms of wall time`);
    assert.equal(programOf(engine, 'A1').error, null, `timeout ${timeout}`);
    }
});

test('A9 · a pulseIn loop with a tight timeout on the floating pin keeps the loop going (returns 0, prints)', () => {
  const engine = aloneEngine('void setup() { Serial.begin(9600); }\nvoid loop() { Serial.println(pulseIn(7, HIGH, 1000)); }');
  run(engine, 0.1);
  const lines = widths(engine, 'A1', 3);
  for (const w of lines) assert.equal(w, 0);
  // 1000 µs of simulated time per call: about 100 calls in 0.1 s of simulated time, not an instant return.
  assert.ok(programOf(engine, 'A1').time >= 0.099, 'the program lived 0.1 s of simulated time');
});

// ---------------------------------------------------------------- A10 · state carried

test('A10 · a slider on an unrelated part while ECHO is high does not restart the measurement (width still 5824 ± 1 %)', () => {
  const engine = engineOf(bench({ slider: true }));
  assert.ok(engine.controls().some((c) => c.id === 'R2' && c.field === 'resistance'), 'R2 has a resistance control');
  const echo = () => engine.read().parts.A1.pins.find((x) => x.name === 'D10').voltage;
  let rose = null;
  let moved = false;
  run(engine, 1.0, (e) => {
    if (rose == null && echo() > 2.5) rose = e.time;
    if (rose != null && !moved && e.time >= rose + 2e-3) {
      assert.ok(echo() > 2.5, 'ECHO is still high when the slider moves');
      assert.ok(e.set('R2', 'resistance', 470), 'the slider moves');
      moved = true;
    }
  });
  assert.ok(moved, 'the slider moved while ECHO was high');
  for (const w of widths(engine, 'A1')) inRange(w, 5766, 5882, 'echo width with a slider moved in the middle of it');
});

test('A10 · the same at 450 cm: a slider 10 ms into the 38 ms no-echo pulse leaves its width at 38 000 ± 2000 µs', () => {
  const engine = engineOf(bench({ slider: true, environment: { distance: 450, temperature: 20 }, program: sketch({ timeout: 60000 }) }));
  const echo = () => engine.read().parts.A1.pins.find((x) => x.name === 'D10').voltage;
  let rose = null;
  let moved = false;
  run(engine, 1.5, (e) => {
    if (rose == null && echo() > 2.5) rose = e.time;
    if (rose != null && !moved && e.time >= rose + 10e-3) {
      assert.ok(echo() > 2.5, 'ECHO is still high when the slider moves');
      assert.ok(e.set('R2', 'resistance', 470));
      moved = true;
    }
  });
  assert.ok(moved, 'the slider moved while ECHO was high');
  for (const w of widths(engine, 'A1')) near(w, 38000, 2000, 'width with a slider moved in the middle of it');
});
