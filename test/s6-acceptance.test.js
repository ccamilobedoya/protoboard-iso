// Acceptance tests for session S6 (the DHT11 and the BME280 / BMP280 read by a board's program through
// their usual libraries, `climate-sensor`, and the `pressure` field), written from the brief (section 7
// "Acceptance" L1 … L17 read with sections 1-5) and the physics notes (sections 12, 13 and 17 rows 59-66,
// 68-79) alone, before looking at any implementation.
//
// How a learner reads the result: what the sketch prints on Serial (every bench prints ONE number or word per
// line, so parsing is unambiguous), pin voltages, and the issues list. Time is read through `millis()` printed
// by the sketch. The engine is stepped as the page steps it (the engine's own `stepHint()` when it asks for a
// finer step than 1 ms, else 1 ms).
//
// Names used that the brief does not fix are listed in the verifier's report (assumptions).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkCircuit, inspectCircuit } from '../src/index.js';
import { simulate, compile, createEngine } from '../src/sim/index.js';
import { translateSketch } from '../src/sim/sketch.js';
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
import { LIMITS } from '../src/limits.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const tourFile = join(root, 'examples/tours/uno-dht11.json');
const H = 0.001;
const TYPE = 'climate-sensor';
const PARTS = ['DHT11', 'BME280', 'BME280-5V', 'BMP280'];
const codes = (issues) => issues.map((i) => i.code);
const near = (actual, expected, tol, what) => assert.ok(Math.abs(actual - expected) <= tol, `${what}: ${actual} vs ${expected} (± ${tol})`);

// ---------------------------------------------------------------- engine helpers

function engineOf(circuit) {
  const compiled = compile(circuit);
  assert.ok(compiled.program, `compiles: ${JSON.stringify(compiled.issues)}`);
  const engine = createEngine(compiled.program);
  assert.ok(engine.start('dc', H), 'starts at the DC point');
  return engine;
}

function run(engine, until, each) {
  while (until - engine.time > 1e-9) {
    const hint = engine.stepHint();
    const h = Math.min(H, hint ?? H, until - engine.time);
    assert.ok(engine.advance(h), `stalled at t = ${engine.time} s`);
    each?.(engine);
  }
}

const programOf = (engine, board = 'A1') => engine.read().parts[board].program;
const serialOf = (engine, board = 'A1') => programOf(engine, board).serial;
const pinVolts = (engine, name, board = 'A1') => engine.read().parts[board].pins.find((p) => p.name === name).voltage;

// ---------------------------------------------------------------- the hand bench

// The module stands on f10 f11 …, one pin per column, in the order the part prints them; a board (A1) is
// wired to row j of those columns. Nothing small sits behind the module (R2, when asked for, is far away).
const ROLE = { vcc: /^(VCC|VIN|\+)$/, gnd: /^(GND|[-−–])$/, data: /^(S|DATA|OUT|DAT|SIG)$/, sda: /^SDA$/, scl: /^SCL$/ };

function pinsOf(part, count) {
  const built = buildCircuit({ parts: [{ id: 'U1', type: TYPE, part, pins: Array.from({ length: count }, (_, i) => `f${10 + i}`) }] });
  const bad = built.issues.filter((i) => i.severity === 'error');
  assert.deepEqual(bad, [], `${part} is a part number of ${TYPE}: ${JSON.stringify(bad)}`);
  return built.parts.find((p) => p.id === 'U1').pinNames;
}
const PIN_COUNT = { DHT11: 3, BME280: 4, 'BME280-5V': 4, BMP280: 4 };

// part: the part number; board: 'UNO' | 'ESP32-DEVKIT'; link: { role: boardPin } (roles data, sda, scl);
// power: 'rail' (a V1 supply of `volts` across the module), 'board' (the board's 3V3 pin) or 'open' (VCC not
// connected). Every bench is a spec of nets laid out by the kit (`autoLayout`), so a DevKit straddles the
// breadboard as it does in a recipe and the module is placed where the kit puts it.
function bench({ part = 'DHT11', board = 'UNO', program, volts = 5, power = 'rail', link, environment = {}, own = {}, slider = false } = {}) {
  const names = pinsOf(part, PIN_COUNT[part]);
  const pin = (role) => {
    const n = names.find((x) => ROLE[role].test(x));
    assert.ok(n, `${part}: a pin for ${role} among ${names.join(' ')}`);
    return `U1.${n}`;
  };
  const nets = [[pin('gnd'), 'A1.GND']];
  for (const [role, boardPin] of Object.entries(link)) nets.push([pin(role), `A1.${boardPin}`]);
  if (power === 'board') nets.push([pin('vcc'), 'A1.3V3']);
  if (slider) nets.push(['R2.1', pin('vcc')], ['R2.2', pin('gnd')]);
  const spec = {
    board: 'auto',
    environment,
    parts: [
      { id: 'U1', type: TYPE, part, ...own },
      { id: 'A1', part: board, program },
      ...(slider ? [{ id: 'R2', type: 'resistor', value: '1k' }] : []),
    ],
    nets,
    ...(power === 'rail' ? { supplies: [{ id: 'V1', voltage: volts, positive: pin('vcc'), negative: pin('gnd') }] } : {}),
  };
  const laid = autoLayout(spec);
  assert.ok(['done', 'approved'].includes(laid.status) || laid.circuit, `laid out (${laid.status}): ${JSON.stringify(laid.problems)}`);
  return laid.circuit;
}

const dhtBench = (options) => bench({ part: 'DHT11', link: { data: 'D2' }, environment: { temperature: 23.6, humidity: 41.4 }, ...options });
const i2cLink = { UNO: { sda: 'A4', scl: 'A5' }, 'ESP32-DEVKIT': { sda: 'D21', scl: 'D22' } };
const bmeBench = ({ board = 'UNO', power = board === 'UNO' ? 'rail' : 'board', volts = 3.3, link, ...rest } = {}) =>
  bench({ part: 'BME280', board, power, volts, link: link ?? i2cLink[board], environment: { temperature: 22, humidity: 45, pressure: 1013.25 }, ...rest });

// ---------------------------------------------------------------- the sketches

const dht = (body, pin = 2, kind = 'DHT11') => `#include <DHT.h>
DHT dht(${pin}, ${kind});
void setup() {
  Serial.begin(9600);
  dht.begin();
${body}
}
void loop() { delay(1000); }`;

const ctor = (lib) => `#include <Wire.h>
#include <Adafruit_Sensor.h>
#include <${lib}.h>
${lib} bme;`;
const i2c = (body, lib = 'Adafruit_BME280') => `${ctor(lib)}
void setup() {
  Serial.begin(9600);
${body}
}
void loop() { delay(1000); }`;

const okWord = (call) => `if (${call}) Serial.println("true"); else Serial.println("false");`;
const beginWith = (arg, lib) => i2c(`  ${okWord(`bme.begin(${arg})`)}`, lib);

// Plays a bench for `seconds` and returns the engine.
function play(circuit, seconds) {
  const engine = engineOf(circuit);
  run(engine, seconds);
  assert.equal(programOf(engine).error, null, `the program runs: ${programOf(engine).error}`);
  return engine;
}
const numbers = (engine) => serialOf(engine).map(Number);

// Reads (T, H, F) of a DHT bench after a 3 s wait.
const dhtReads = (environment, options) =>
  numbers(play(dhtBench({ environment, program: dht('  delay(3000);\n  Serial.println(dht.readTemperature());\n  Serial.println(dht.readHumidity());\n  Serial.println(dht.readTemperature(true), 3);'), ...options }), 3.3));

// ---------------------------------------------------------------- L1 · the catalog and the field

test('L1 · climate-sensor is a type of family sensor, with the part numbers DHT11, BME280, BME280-5V and BMP280', () => {
  const type = PART_TYPES[TYPE];
  assert.ok(type, `type ${TYPE}`);
  assert.equal(type.family, 'sensor');
  assert.ok(catalogEntry(TYPE), 'a catalog entry');
  for (const part of PARTS) assert.ok(pinsOf(part, PIN_COUNT[part]).length === PIN_COUNT[part], `${part} builds with ${PIN_COUNT[part]} pins`);
});

test('L1 · the pins print as the brief says: DHT11 S + − ; BME280, BME280-5V and BMP280 VCC GND SCL SDA (5V board: VCC or VIN for the first)', () => {
  assert.deepEqual(pinsOf('DHT11', 3).map((n) => n.replace('-', '−')), ['S', '+', '−']);
  for (const part of ['BME280', 'BMP280']) assert.deepEqual(pinsOf(part, 4), ['VCC', 'GND', 'SCL', 'SDA']);
  const five = pinsOf('BME280-5V', 4);
  assert.deepEqual(five.slice(1), ['GND', 'SCL', 'SDA']);
  assert.match(five[0], /^(VCC|VIN)$/);
});

test('L1 · the compact catalog lists climate-sensor under the family sensor in both languages and stays within 4600 characters', () => {
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

test('L1 · pressure is in the environment: hPa, default 1013.25, slider 300…1100, limit 0…1500, linear, level', async () => {
  const { FIELDS } = await import('../src/sim/environment.js');
  const f = FIELDS.pressure;
  assert.ok(f, 'FIELDS.pressure');
  assert.deepEqual([f.unit, f.default, f.min, f.max, f.scale, f.kind], ['hPa', 1013.25, 300, 1100, 'linear', 'level']);
  assert.deepEqual(f.limit, [0, 1500]);
});

// ---------------------------------------------------------------- includes, objects and helpers of the translator

test('§1 · <DHT.h>, <Wire.h>, <Adafruit_Sensor.h>, <Adafruit_BME280.h> and <Adafruit_BMP280.h> are known includes; any other keeps the note', () => {
  const head = '#include <DHT.h>\n#include <Wire.h>\n#include <Adafruit_Sensor.h>\n#include <Adafruit_BME280.h>\n#include <Adafruit_BMP280.h>\nvoid setup() { Wire.begin(); }\nvoid loop() { delay(1000); }';
  const known = translateSketch(head);
  assert.ok(known.js, JSON.stringify(known.issues));
  assert.deepEqual(codes(known.issues).filter((c) => c === 'SIM_PROGRAM_LIBRARY'), [], JSON.stringify(known.issues));
  assert.deepEqual(known.issues, [], 'Wire.begin() and the includes raise nothing');
  const other = translateSketch('#include <Servo.h>\nvoid setup() { }\nvoid loop() { }');
  assert.deepEqual(codes(other.issues), ['SIM_PROGRAM_LIBRARY']);
});

test('§1 · Wire.begin() and Wire.begin(sda, scl) are accepted and do nothing; the declarations of the three classes translate without notes', () => {
  const r = translateSketch(`${ctor('Adafruit_BME280')}\n#include <DHT.h>\nDHT dht(2, DHT11);\nvoid setup() { Wire.begin(); Wire.begin(21, 22); }\nvoid loop() { }`);
  assert.ok(r.js, JSON.stringify(r.issues));
  assert.deepEqual(r.issues, []);
  const bmp = translateSketch(`${ctor('Adafruit_BMP280')}\nvoid setup() { }\nvoid loop() { float p = bme.readPressure(); }`);
  assert.deepEqual(bmp.issues, []);
});

test('§1 · a method that is not in the class list is refused or noted: DHT.readPressure, BMP280.readHumidity, an unknown name', () => {
  for (const source of [dht('  Serial.println(dht.readPressure());'), i2c('  Serial.println(bme.readHumidity());', 'Adafruit_BMP280'), dht('  dht.explode();')]) {
    const r = translateSketch(source);
    assert.ok(r.js === null || r.issues.length > 0, `refused or noted: ${source.split('\n').slice(-3, -2)}`);
  }
});

test('§1 · isnan, NAN, F("text") and the printing of NaN: Serial prints "nan" and the text itself', () => {
  const program = `void setup() {
  Serial.begin(9600);
  float x = NAN;
  Serial.println(x);
  if (isnan(x)) Serial.println("isnan"); else Serial.println("number");
  if (isnan(1.5)) Serial.println("isnan"); else Serial.println("number");
  Serial.println(F("hola"));
}
void loop() { delay(1000); }`;
  const engine = play({ parts: [{ id: 'A1', type: 'module', part: 'UNO', pins: { GND: 'T-27' }, program }] }, 0.2);
  assert.deepEqual(serialOf(engine), ['nan', 'isnan', 'number', 'hola']);
});

test('§1 · DHT22 gives a clear note "not in the kit yet" and reads NaN', () => {
  const program = dht('  delay(3000);\n  float t = dht.readTemperature();\n  if (isnan(t)) Serial.println("fail"); else Serial.println("ok");', 2, 'DHT22');
  const r = translateSketch(program);
  assert.ok(r.js, 'translates');
  assert.ok(r.issues.length > 0, 'a note about DHT22');
  const engine = play(dhtBench({ program }), 3.3);
  assert.deepEqual(serialOf(engine), ['fail']);
  const issues = simulate(dhtBench({ program })).issues;
  assert.ok(issues.length >= 0);
});

// ---------------------------------------------------------------- L2 · DHT11 reads and rounding

test('L2 (row 59) · 23.6 °C / 41.4 %RH read at 3 s: readTemperature 24, readHumidity 41', () => {
  const [t, h] = dhtReads({ temperature: 23.6, humidity: 41.4 });
  assert.equal(t, 24);
  assert.equal(h, 41);
});

test('L2 (row 60) · 23.4 °C → 23, 23.5 °C → 24, 41.5 %RH → 42', () => {
  assert.equal(dhtReads({ temperature: 23.4, humidity: 41.5 })[0], 23);
  const [t, h] = dhtReads({ temperature: 23.5, humidity: 41.5 });
  assert.equal(t, 24);
  assert.equal(h, 42);
});

test('L2 (row 62) · 55 °C / 95 %RH read 50 / 90, and −5 °C / 10 %RH read 0 / 20', () => {
  const hot = dhtReads({ temperature: 55, humidity: 95 });
  assert.deepEqual(hot.slice(0, 2), [50, 90]);
  const cold = dhtReads({ temperature: -5, humidity: 10 });
  assert.deepEqual(cold.slice(0, 2), [0, 20]);
});

test('L2 (row 68) · readTemperature(true) at 23.6 °C is 75.2 °F ± 0.05', () => {
  const reads = dhtReads({ temperature: 23.6, humidity: 41.4 });
  near(reads[2], 75.2, 0.05, 'Fahrenheit');
});

// ---------------------------------------------------------------- L3 · the 2 s cache

test('L3 (row 61) · read at 3.0 s with 20 °C, the environment set to 30 at 3.5 s: reads at 4.0 s and 5.1 s give 20, 20, 30', () => {
  const program = dht('  delay(3000);\n  Serial.println(dht.readTemperature());\n  delay(1000);\n  Serial.println(dht.readTemperature());\n  delay(1100);\n  Serial.println(dht.readTemperature());');
  const engine = engineOf(dhtBench({ environment: { temperature: 20, humidity: 41 }, program }));
  run(engine, 3.5);
  assert.deepEqual(numbers(engine), [20], 'the first read is done by 3.5 s');
  assert.ok(engine.set('environment', 'temperature', 30), 'the environment moves');
  run(engine, 5.3);
  assert.equal(programOf(engine).error, null);
  assert.deepEqual(numbers(engine), [20, 20, 30]);
});

// ---------------------------------------------------------------- L4 · it does not answer

const failOrOk = dht('  delay(3000);\n  float h = dht.readHumidity();\n  float t = dht.readTemperature();\n  if (isnan(h) || isnan(t)) Serial.println("fail"); else Serial.println("ok");');

test('L4 (row 63) · the same sketch prints "ok" when the module is powered and wired to the constructor\'s pin (the control)', () => {
  assert.deepEqual(serialOf(play(dhtBench({ program: failOrOk }), 3.3)), ['ok']);
});

test('L4 (row 63a) · VCC open: the sketch\'s isnan branch prints "fail"', () => {
  assert.deepEqual(serialOf(play(dhtBench({ program: failOrOk, power: 'open' }), 3.3)), ['fail']);
});

test('L4 (row 63b) · the module on D3 while the sketch says D2: "fail"', () => {
  assert.deepEqual(serialOf(play(dhtBench({ program: failOrOk, link: { data: 'D3' } }), 3.3)), ['fail']);
});

test('L4 (row 63d) · supply 2.5 V: "fail"; and SIM_MODULE_LOW_SUPPLY is raised (§12.3 stresses)', () => {
  assert.deepEqual(serialOf(play(dhtBench({ program: failOrOk, volts: 2.5 }), 3.3)), ['fail']);
  assert.ok(codes(simulate(dhtBench({ program: failOrOk, volts: 2.5 })).issues).includes('SIM_MODULE_LOW_SUPPLY'));
  assert.ok(!codes(simulate(dhtBench({ program: failOrOk, volts: 5 })).issues).includes('SIM_MODULE_LOW_SUPPLY'));
});

// ---------------------------------------------------------------- L5 · power-up

test('L5 (row 64) · reads at 0.4 s, 1.2 s and 2.5 s after power: fail, fail, valid', () => {
  const program = dht(`  delay(400);
  float a = dht.readTemperature();
  if (isnan(a)) Serial.println("fail"); else Serial.println(a);
  delay(800);
  float b = dht.readTemperature();
  if (isnan(b)) Serial.println("fail"); else Serial.println(b);
  delay(1300);
  float c = dht.readTemperature();
  if (isnan(c)) Serial.println("fail"); else Serial.println(c);`);
  const engine = play(dhtBench({ program }), 2.8);
  assert.deepEqual(serialOf(engine).map((l) => (l === 'fail' ? l : Number(l))), ['fail', 'fail', 24]);
});

// ---------------------------------------------------------------- L6 · what a read costs

test('L6 (row 65) · millis() around a real read differ by 25 ± 5 ms; around a cached one by 0…1 ms', () => {
  const program = dht(`  delay(3000);
  unsigned long a = millis();
  float t = dht.readTemperature();
  unsigned long b = millis();
  Serial.println(b - a);
  a = millis();
  float h = dht.readHumidity();
  b = millis();
  Serial.println(b - a);`);
  const [real, cached] = numbers(play(dhtBench({ program }), 3.3));
  near(real, 25, 5, 'a real read');
  assert.ok(cached >= 0 && cached <= 1, `a cached read: ${cached} ms`);
});

// ---------------------------------------------------------------- L7 · 3.3 V and 6.5 V

test('L7 (row 66) · the module on the 3V3 pin of an ESP32 reads 24 / 41', () => {
  const engine = play(dhtBench({ board: 'ESP32-DEVKIT', power: 'board', program: dht('  delay(3000);\n  Serial.println(dht.readTemperature());\n  Serial.println(dht.readHumidity());') }), 3.3);
  assert.deepEqual(numbers(engine), [24, 41]);
});

test('L7 (row 66) · at 6.5 V the module says SIM_IC_SUPPLY; at 5 V it does not', () => {
  const program = dht('  delay(100);');
  assert.ok(codes(simulate(dhtBench({ program, volts: 6.5 })).issues).includes('SIM_IC_SUPPLY'), JSON.stringify(simulate(dhtBench({ program, volts: 6.5 })).issues));
  assert.ok(!codes(simulate(dhtBench({ program, volts: 5 })).issues).includes('SIM_IC_SUPPLY'));
});

// ---------------------------------------------------------------- L8 · heat index

test('L8 (row 69) · computeHeatIndex(30, 60, false) is 32.83 ± 0.1 and (25, 50) is 24.86 ± 0.1', () => {
  const [a, b] = numbers(play(dhtBench({ program: dht('  delay(100);\n  Serial.println(dht.computeHeatIndex(30, 60, false), 3);\n  Serial.println(dht.computeHeatIndex(25, 50, false), 3);') }), 0.5));
  near(a, 32.83, 0.1, 'heat index at 30 °C / 60 %');
  near(b, 24.86, 0.1, 'heat index at 25 °C / 50 %');
});

// ---------------------------------------------------------------- L9 · the BME280 address

const beginOn = (arg, options = {}, lib = 'Adafruit_BME280') => serialOf(play(bmeBench({ board: 'ESP32-DEVKIT', program: beginWith(arg, lib), ...options }), 0.5));

test('L9 (row 70) · a BME280 at its default address on an ESP32: begin(0x76) true, begin(0x77) false, begin() false', () => {
  assert.deepEqual(beginOn('0x76'), ['true']);
  assert.deepEqual(beginOn('0x77'), ['false']);
  assert.deepEqual(beginOn(''), ['false']);
});

test('L9 (row 70) · with the part\'s address 0x77: begin(0x76) false, begin() true (the library\'s default is 0x77)', () => {
  assert.deepEqual(beginOn('0x76', { own: { address: 0x77 } }), ['false']);
  assert.deepEqual(beginOn('', { own: { address: 0x77 } }), ['true']);
  assert.deepEqual(beginOn('0x77', { own: { address: 0x77 } }), ['true']);
});

// ---------------------------------------------------------------- L10 · pressure, temperature, humidity, altitude

// What `bme` answers for an environment: [temperature, pressure (Pa), humidity, altitude(1013.25), altitude(1020)].
function bmeReads(environment, options = {}) {
  const program = i2c(`  if (!bme.begin(0x76)) { Serial.println("nobegin"); return; }
  Serial.println(bme.readTemperature(), 3);
  Serial.println(bme.readPressure(), 3);
  Serial.println(bme.readHumidity(), 3);
  Serial.println(bme.readAltitude(1013.25), 3);
  Serial.println(bme.readAltitude(1020), 3);`);
  const engine = play(bmeBench({ board: 'ESP32-DEVKIT', program, environment, ...options }), 0.5);
  assert.equal(serialOf(engine).length, 5, JSON.stringify(serialOf(engine)));
  return numbers(engine);
}
const env = (temperature, humidity, pressure) => ({ temperature, humidity, pressure });

test('L10 (rows 71, 73) · 1013.25 hPa: readPressure 101325 ± 1, readAltitude(1013.25) 0 ± 0.5, readAltitude(1020) 55.98 ± 0.5', () => {
  const [, p, , a, a2] = bmeReads(env(22, 45, 1013.25));
  near(p, 101325, 1, 'Pa');
  near(a, 0, 0.5, 'altitude');
  near(a2, 55.98, 0.5, 'altitude against 1020 hPa');
});

test('L10 (row 72) · 900 hPa reads 90000 Pa and 988.7 m; 1100 hPa reads −698.4 m; 300 hPa reads 9165.4 m (± 1 Pa, ± 0.5 m)', () => {
  const [, p, , a] = bmeReads(env(22, 45, 900));
  near(p, 90000, 1, 'Pa at 900 hPa');
  near(a, 988.7, 0.5, 'altitude at 900 hPa');
  near(bmeReads(env(22, 45, 1100))[3], -698.4, 0.5, 'altitude at 1100 hPa');
  near(bmeReads(env(22, 45, 300))[3], 9165.4, 0.5, 'altitude at 300 hPa');
});

test('L10 (row 74) · 22.346 °C / 45.678 %RH read 22.35 / 45.68 (± 0.005)', () => {
  const [t, , h] = bmeReads(env(22.346, 45.678, 1013.25));
  near(t, 22.35, 0.005, 'temperature');
  near(h, 45.68, 0.005, 'humidity');
});

test('L10 (row 75) · clamps: 100 °C → 85, −50 °C → −40, 120 % → 100, −5 % → 0, 1200 hPa → 110000 Pa, 200 hPa → 30000 Pa', () => {
  const hot = bmeReads(env(100, 120, 1200));
  near(hot[0], 85, 0.01, 'temperature clamp');
  near(hot[2], 100, 0.01, 'humidity clamp');
  near(hot[1], 110000, 1, 'pressure clamp');
  const cold = bmeReads(env(-50, -5, 200));
  near(cold[0], -40, 0.01, 'temperature clamp');
  near(cold[2], 0, 0.01, 'humidity clamp');
  near(cold[1], 30000, 1, 'pressure clamp');
});

test('§3 · the part\'s own pressure wins over the environment (own value "pressure": 900 against 1013.25 hPa)', () => {
  const [, p] = bmeReads(env(22, 45, 1013.25), { own: { pressure: 900 } });
  near(p, 90000, 1, 'Pa from the part\'s own value');
});

// ---------------------------------------------------------------- L11 · BMP280 against BME280

test('L11 (row 76) · a BMP280 part: Adafruit_BMP280 begin(0x76) true; Adafruit_BME280 begin(0x76) on the same board false', () => {
  assert.deepEqual(serialOf(play(bench({ part: 'BMP280', board: 'ESP32-DEVKIT', power: 'board', link: i2cLink['ESP32-DEVKIT'], environment: { pressure: 1013.25 }, program: beginWith('0x76', 'Adafruit_BMP280') }), 0.5)), ['true']);
  assert.deepEqual(serialOf(play(bench({ part: 'BMP280', board: 'ESP32-DEVKIT', power: 'board', link: i2cLink['ESP32-DEVKIT'], environment: { pressure: 1013.25 }, program: beginWith('0x76', 'Adafruit_BME280') }), 0.5)), ['false']);
});

test('L11 (row 76) · a BMP280 part answers pressure and altitude through its own library; a BMP has no readHumidity in the BMP library', () => {
  const program = i2c(`  if (!bme.begin(0x76)) { Serial.println("nobegin"); return; }
  Serial.println(bme.readPressure(), 3);
  Serial.println(bme.readAltitude(1013.25), 3);`, 'Adafruit_BMP280');
  const engine = play(bench({ part: 'BMP280', board: 'ESP32-DEVKIT', power: 'board', link: i2cLink['ESP32-DEVKIT'], environment: { pressure: 900 }, program }), 0.5);
  const [p, a] = numbers(engine);
  near(p, 90000, 1, 'Pa');
  near(a, 988.7, 0.5, 'altitude');
  const r = translateSketch(i2c('  Serial.println(bme.readHumidity());', 'Adafruit_BMP280'));
  assert.ok(r.js === null || r.issues.length > 0, 'readHumidity does not exist for Adafruit_BMP280');
});

test('§13.3 · the chip id must match the class: BMP library on a BME280 module is false with begin(0x76), true with begin(0x76, 0x60); BMP280 module with begin(0x76, 0x60) false', () => {
  const on = (part, call) => serialOf(play(bench({ part, board: 'ESP32-DEVKIT', power: 'board', link: i2cLink['ESP32-DEVKIT'], environment: {}, program: beginWith(call, 'Adafruit_BMP280') }), 0.5));
  assert.deepEqual(on('BME280', '0x76'), ['false']);
  assert.deepEqual(on('BME280', '0x76, 0x60'), ['true']);
  assert.deepEqual(on('BMP280', '0x76, 0x60'), ['false']);
  assert.deepEqual(on('BMP280', '0x76, 0x58'), ['true']);
});

// ---------------------------------------------------------------- L12 · the bus pins

test('L12 (row 77) · wired on the right pins begin is true (the control: UNO A4/A5, ESP32 21/22)', () => {
  for (const board of ['UNO', 'ESP32-DEVKIT']) assert.deepEqual(serialOf(play(bmeBench({ board, program: beginWith('0x76') }), 0.5)), ['true'], board);
});

test('L12 (row 77) · SDA and SCL swapped: begin false (UNO and ESP32)', () => {
  assert.deepEqual(serialOf(play(bmeBench({ board: 'UNO', link: { sda: 'A5', scl: 'A4' }, program: beginWith('0x76') }), 0.5)), ['false']);
  assert.deepEqual(serialOf(play(bmeBench({ board: 'ESP32-DEVKIT', link: { sda: 'D22', scl: 'D21' }, program: beginWith('0x76') }), 0.5)), ['false']);
});

test('L12 (row 77) · on D2 / D3 of a UNO (SDA D2, SCL D3, and the other way round): begin false', () => {
  assert.deepEqual(serialOf(play(bmeBench({ board: 'UNO', link: { sda: 'D2', scl: 'D3' }, program: beginWith('0x76') }), 0.5)), ['false']);
  assert.deepEqual(serialOf(play(bmeBench({ board: 'UNO', link: { sda: 'D3', scl: 'D2' }, program: beginWith('0x76') }), 0.5)), ['false']);
});

test('L12 (row 77) · SDA and SCL not connected: begin false', () => {
  assert.deepEqual(serialOf(play(bmeBench({ board: 'UNO', link: {}, program: beginWith('0x76') }), 0.5)), ['false']);
});

// ---------------------------------------------------------------- L13 · the BME280 supply

test('L13 (rows 78, 79) · BME280 (3.3 V board) on 5 V: SIM_IC_SUPPLY and begin false; on 3.3 V: works, no SIM_IC_SUPPLY; on 1.5 V: begin false', () => {
  const at = (volts) => bmeBench({ board: 'UNO', volts, program: beginWith('0x76') });
  assert.ok(codes(simulate(at(5)).issues).includes('SIM_IC_SUPPLY'), JSON.stringify(simulate(at(5)).issues));
  assert.deepEqual(serialOf(play(at(5), 0.5)), ['false']);
  assert.ok(!codes(simulate(at(3.3)).issues).includes('SIM_IC_SUPPLY'));
  assert.deepEqual(serialOf(play(at(3.3), 0.5)), ['true']);
  assert.deepEqual(serialOf(play(at(1.5), 0.5)), ['false']);
});

test('L13 (row 79) · BME280-5V on 5 V: SDA idles at 3.3 ± 0.05 V, begin true, no SIM_IC_SUPPLY', () => {
  const circuit = bench({ part: 'BME280-5V', board: 'UNO', volts: 5, power: 'rail', link: i2cLink.UNO, environment: {}, program: beginWith('0x76') });
  const engine = play(circuit, 0.5);
  assert.deepEqual(serialOf(engine), ['true']);
  near(pinVolts(engine, 'A4'), 3.3, 0.05, 'SDA idle');
  near(pinVolts(engine, 'A5'), 3.3, 0.05, 'SCL idle');
  assert.ok(!codes(simulate(circuit).issues).includes('SIM_IC_SUPPLY'));
});

test('§3 · BME280-5V under 3.4 V raises SIM_MODULE_LOW_SUPPLY (a note); on 5 V it does not', () => {
  const at = (volts) => bench({ part: 'BME280-5V', board: 'UNO', volts, power: 'rail', link: i2cLink.UNO, environment: {}, program: beginWith('0x76') });
  assert.ok(codes(simulate(at(3.0)).issues).includes('SIM_MODULE_LOW_SUPPLY'), JSON.stringify(simulate(at(3.0)).issues));
  assert.ok(!codes(simulate(at(5)).issues).includes('SIM_MODULE_LOW_SUPPLY'));
});

// ---------------------------------------------------------------- the card

test('§3 cards · the DHT11 card says what it answers, the accuracy and why it does not answer, in both languages', () => {
  const text = (circuit, lang) => {
    const engine = play(circuit, 3.3);
    return partLines(engine.read().parts.U1, lang).map((l) => l.text).join(' | ');
  };
  const good = dhtBench({ program: failOrOk });
  const open = dhtBench({ program: failOrOk, power: 'open' });
  for (const lang of ['en', 'es']) {
    const on = text(good, lang);
    const off = text(open, lang);
    for (const line of [on, off]) assert.doesNotMatch(line, /\{\w+\}|undefined|NaN/, `${lang}: placeholders filled`);
    assert.notEqual(on, off, `${lang}: powered and not powered read differently`);
    assert.match(on, /24/, `${lang}: what it would answer (24 °C)`);
    assert.match(on, /41/, `${lang}: what it would answer (41 %)`);
    assert.match(on, /±\s?2/, `${lang}: accuracy ± 2 °C`);
    assert.match(on, /±\s?5/, `${lang}: accuracy ± 5 %RH`);
  }
});

test('§3 cards · a BME280 asked at 0x77 on a 0x76 board says both addresses; its accuracy shows (± 1 °C, ± 3 %RH, ± 1 hPa)', () => {
  const engine = play(bmeBench({ board: 'ESP32-DEVKIT', program: i2c(`  ${okWord('bme.begin()')}`) }), 0.5);
  assert.deepEqual(serialOf(engine), ['false']);
  for (const lang of ['en', 'es']) {
    const text = partLines(engine.read().parts.U1, lang).map((l) => l.text).join(' | ');
    assert.doesNotMatch(text, /\{\w+\}|undefined/, `${lang}: placeholders filled`);
    assert.match(text, /0x77/, `${lang}: the address the sketch asks`);
    assert.match(text, /0x76/, `${lang}: the address of the board`);
    assert.match(text, /±\s?1/, `${lang}: accuracy ± 1`);
    assert.match(text, /±\s?3/, `${lang}: accuracy ± 3 %RH`);
  }
});

// ---------------------------------------------------------------- L14 · safety

const alone = (program) => ({ parts: [{ id: 'A1', type: 'module', part: 'UNO', pins: { GND: 'T-27' }, program }] });
// The JavaScript as code: the quoted name of an unknown call, __missing("Serial.constructor", …), is text (as
// test/attack.test.js reads it), not a member access.
const codeOf = (js) => js.replace(/__missing\("[^"\\]*"/g, '__missing(');
const HEAD = '#include <DHT.h>\nDHT dht(2, DHT11);\n';
const HOSTILE = {
  'dht.constructor': `${HEAD}void setup() { Serial.println(dht.constructor); }\nvoid loop() { delay(1000); }`,
  'dht.constructor called': `${HEAD}void setup() { dht.constructor("globalThis.__pwned = 1")(); }\nvoid loop() { delay(1000); }`,
  'dht["x"]()': `${HEAD}void setup() { dht["x"](); }\nvoid loop() { delay(1000); }`,
  'dht["constructor"]': `${HEAD}void setup() { dht["constructor"]("globalThis.__pwned = 1")(); }\nvoid loop() { delay(1000); }`,
  'Serial.constructor': `void setup() { Serial.constructor("globalThis.__pwned = 1")(); }\nvoid loop() { delay(1000); }`,
  'an object named Function': `#include <DHT.h>\nDHT Function(2, DHT11);\nvoid setup() { Function.constructor("globalThis.__pwned = 1")(); }\nvoid loop() { delay(1000); }`,
  'an object named Serial': `#include <DHT.h>\nDHT Serial(2, DHT11);\nvoid setup() { Serial.begin(9600); }\nvoid loop() { delay(1000); }`,
  'an object declared inside loop': `#include <DHT.h>\nvoid setup() { }\nvoid loop() { DHT d(2, DHT11); d.readTemperature(); delay(1000); }`,
  'an object declared inside setup': `#include <DHT.h>\nvoid setup() { Adafruit_BME280 b; b.begin(0x76); }\nvoid loop() { delay(1000); }`,
};

for (const [name, source] of Object.entries(HOSTILE)) {
  test(`L14 · ${name}: refused with an issue, or translated with no .constructor and no [ followed by a string, and running it reaches nothing`, () => {
    delete globalThis.__pwned;
    const r = translateSketch(source);
    if (r.js === null) {
      assert.ok(r.issues.length > 0, 'a refusal comes with an issue');
    } else {
      const code = codeOf(r.js);
      assert.doesNotMatch(code, /\.\s*constructor/, 'no .constructor in the output');
      assert.doesNotMatch(code, /__proto__/, 'no __proto__ in the output');
      assert.doesNotMatch(code, /\[\s*["'`]/, 'no [ followed by a string in the output');
    }
    const engine = engineOf(alone(source));
    assert.doesNotThrow(() => run(engine, 0.3));
    assert.equal(globalThis.__pwned, undefined, 'nothing was reached');
    delete globalThis.__pwned;
  });
}

test('L14 · the translated JavaScript of a valid sketch holds no member access built from the sketch\'s text (no .readTemperature, .readHumidity, .readPressure, .computeHeatIndex)', () => {
  const r = translateSketch(`${ctor('Adafruit_BME280')}\n#include <DHT.h>\nDHT dht(2, DHT11);\nvoid setup() { dht.begin(); bme.begin(0x76); float t = dht.readTemperature(); float h = dht.readHumidity(); float p = bme.readPressure(); float c = dht.computeHeatIndex(t, h, false); }\nvoid loop() { delay(1000); }`);
  assert.ok(r.js, JSON.stringify(r.issues));
  assert.deepEqual(r.issues, []);
  assert.doesNotMatch(codeOf(r.js), /\.\s*(readTemperature|readHumidity|readPressure|computeHeatIndex|readAltitude)\b/);
  assert.doesNotMatch(codeOf(r.js), /\.\s*constructor|__proto__|\[\s*["'`]/);
});

test('L14 · 10 000 library objects: refused or noted (a cap in src/limits.js), and it does not take the machine', { timeout: 10000 }, () => {
  const objects = Array.from({ length: 10000 }, (_, i) => `DHT d${i}(2, DHT11);`).join('\n');
  const t0 = performance.now(); // real clock: a hostile sketch must not take the machine's time
  const r = translateSketch(`#include <DHT.h>\n${objects}\nvoid setup() { }\nvoid loop() { }`);
  assert.ok(r.js === null || r.issues.length > 0, 'refused or noted');
  assert.ok(performance.now() - t0 < 5000, 'quick'); // real clock: the bound on that time
  assert.ok(Object.keys(LIMITS).length > 0);
});

// ---------------------------------------------------------------- L15 · the recipes

const layoutOf = (name) => {
  const { spec, problems } = expandRecipe(name);
  assert.deepEqual(problems, [], `${name}: ${JSON.stringify(problems)}`);
  return autoLayout(spec);
};
const boardOf = (circuit, part) => circuit.parts.find((p) => p.part === part).id;
const RECIPE_NAMES = ['uno-dht11', 'esp32-bme280', 'uno-bmp280-altitude'];
const why = (r) => [...r.problems, ...r.review.blocking].map((b) => formatIssue(b, 'en')).join('\n') + JSON.stringify(r.check);

test('L15 · the three recipes exist with a title and a lesson in both languages', () => {
  for (const name of RECIPE_NAMES) {
    assert.ok(RECIPES[name], `recipe ${name}`);
    for (const lang of ['en', 'es']) {
      assert.ok(RECIPES[name].title?.[lang], `${name}: title ${lang}`);
      assert.ok(RECIPES[name].teaches?.[lang], `${name}: teaches ${lang}`);
    }
  }
});

for (const name of RECIPE_NAMES) {
  test(`L15 · ${name} is DONE in the layout bench and checks clean`, () => {
    const r = layoutOf(name);
    assert.equal(r.status, 'done', why(r));
    assert.deepEqual(r.circuit.spec.recipe, { name });
    const bad = checkCircuit(r.circuit).issues.filter((i) => i.severity === 'error' || i.severity === 'warning');
    assert.deepEqual(codes(bad), [], name);
    assert.ok(r.circuit.parts.some((p) => p.type === TYPE), `${name} uses the ${TYPE}`);
  });

  test(`L15 · ${name}: no part is hidden in both views (at least 50 % visible in one of them), no render error`, () => {
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

  test(`L15 (§5) · ${name} carries an environment and a controls panel for each of its fields`, () => {
    const { circuit } = layoutOf(name);
    assert.ok(circuit.environment, 'an environment');
    const fields = Object.keys(circuit.environment);
    assert.ok(fields.length > 0);
    const controls = circuit.page?.controls;
    assert.ok(Array.isArray(controls), 'page.controls');
    for (const f of fields.filter((x) => x !== 'temperature' || name !== 'uno-bmp280-altitude')) assert.ok(controls.some((c) => c.environment === f), `a page control for ${f}`);
  });
}

const rangeOf = (field) => (typeof field === 'object' ? field.range : null);
const valueIn = (field) => (typeof field === 'object' ? field.value : field);

test('L15 (§5) · uno-dht11: the DHT11 on D2 of a UNO, delay(2000), isnan check printing "fail"; environment temperature 24 range [0, 50], humidity 41 range [20, 90]', () => {
  const { circuit } = layoutOf('uno-dht11');
  const spec = circuit.spec;
  assert.equal(valueIn(circuit.environment.temperature), 24);
  assert.deepEqual(rangeOf(circuit.environment.temperature), [0, 50]);
  assert.equal(valueIn(circuit.environment.humidity), 41);
  assert.deepEqual(rangeOf(circuit.environment.humidity), [20, 90]);
  const code = circuit.parts.find((p) => p.part === 'UNO').program;
  assert.match(code, /DHT\s+\w+\s*\(\s*2\s*,\s*DHT11\s*\)/);
  assert.match(code, /delay\s*\(\s*2000\s*\)/);
  assert.match(code, /isnan/);
  assert.match(code, /"fail"/);
  assert.ok(spec.nets.some((n) => n.some((x) => /\.D2$/.test(x)) && n.some((x) => /\.(S|DATA|OUT)$/.test(x))), 'D2 is wired to the module\'s S');
});

test('L15 (§5) · uno-dht11 prints a line with 24 and 41 within 2.5 s, and after temperature 31 a line starting with 31 within 2.1 s more', () => {
  const { circuit } = layoutOf('uno-dht11');
  const board = boardOf(circuit, 'UNO');
  const engine = engineOf(circuit);
  const nums = (line) => (line.match(/-?\d+(\.\d+)?/g) ?? []).map(Number);
  run(engine, 2.5);
  const first = serialOf(engine, board);
  assert.equal(programOf(engine, board).error, null);
  assert.ok(first.some((l) => nums(l).includes(24) && nums(l).includes(41)), `a line with 24 and 41: ${JSON.stringify(first)}`);
  const printed = first.length;
  assert.ok(engine.set('environment', 'temperature', 31), 'the environment moves');
  run(engine, engine.time + 2.1);
  const after = serialOf(engine, board).slice(printed);
  assert.ok(after.some((l) => nums(l)[0] === 31), `a line with 31 within 2.1 s: ${JSON.stringify(after)}`);
});

test('L15 (§5) · esp32-bme280: a BME280 on an ESP32 DevKit (3V3, GND, 22, 21), begin(0x76), pressure range [900, 1050], prints 1013 within 2 s', () => {
  const { circuit } = layoutOf('esp32-bme280');
  const spec = circuit.spec;
  assert.ok(circuit.parts.some((p) => p.part === 'ESP32-DEVKIT'));
  assert.deepEqual(rangeOf(circuit.environment.pressure), [900, 1050]);
  for (const f of ['temperature', 'humidity', 'pressure']) assert.ok(f in circuit.environment, `environment has ${f}`);
  const code = circuit.parts.find((p) => p.part === 'ESP32-DEVKIT').program;
  assert.match(code, /begin\s*\(\s*0x76\s*\)/);
  const nets = spec.nets.map((n) => n.join(' '));
  for (const pin of ['3V3', 'D22', 'D21']) assert.ok(nets.some((n) => n.includes(`.${pin}`)), `${pin} is wired`);
  const board = boardOf(circuit, 'ESP32-DEVKIT');
  const engine = engineOf(circuit);
  run(engine, 2);
  const lines = serialOf(engine, board);
  assert.equal(programOf(engine, board).error, null);
  assert.ok(lines.some((l) => /(^|[^\d.])1013(\.\d+)?([^\d]|$)/.test(l)), `a line with 1013: ${JSON.stringify(lines)}`);
});

test('L15 (§5) · uno-bmp280-altitude: a BMP280 on a UNO\'s 3V3 pin and A4 / A5, printing the altitude; the text says why 3.3 V and not 5 V', () => {
  const { circuit } = layoutOf('uno-bmp280-altitude');
  const spec = circuit.spec;
  assert.ok(circuit.parts.some((p) => p.type === TYPE && p.part === 'BMP280'));
  const nets = spec.nets.map((n) => n.join(' '));
  for (const pin of ['3V3', 'A4', 'A5']) assert.ok(nets.some((n) => n.includes(`.${pin}`)), `${pin} is wired`);
  assert.ok(!nets.some((n) => /\.5V\b/.test(n) && /BMP|\.VCC|\.VIN/.test(n)) || nets.some((n) => n.includes('.3V3')), 'the supply is the 3V3 pin');
  const r = RECIPES['uno-bmp280-altitude'];
  for (const lang of ['en', 'es']) assert.match(`${r.title[lang]} ${r.teaches[lang]}`, /3[.,]3/, `${lang}: says why 3.3 V`);
  const code = circuit.parts.find((p) => p.part === 'UNO').program;
  assert.match(code, /readAltitude/);
  const board = boardOf(circuit, 'UNO');
  const engine = engineOf(circuit);
  run(engine, 2);
  const lines = serialOf(engine, board);
  assert.equal(programOf(engine, board).error, null);
  assert.ok(lines.some((l) => /-?\d/.test(l)), `it prints a number: ${JSON.stringify(lines)}`);
});

// ---------------------------------------------------------------- L16 · up close and the tour

test('L16 · climate-sensor is in the COMPLETE list of test/pinout.test.js', () => {
  const pinout = readFileSync(new URL('./pinout.test.js', import.meta.url), 'utf8');
  assert.match(pinout, /'climate-sensor':\s*'[\w-]+ \w+'/);
});

for (const [name, part] of [['uno-dht11', 'DHT11'], ['esp32-bme280', 'BME280'], ['uno-bmp280-altitude', 'BMP280']]) {
  test(`L16 · ${part} (in ${name}) has everything for its view up close (symbol, mark, inside view, drawer, legend, pin texts in both languages)`, () => {
    const figure = readFileSync(new URL('../src/page/client/figure.js', import.meta.url), 'utf8');
    const legends = readFileSync(new URL('../src/page/client/focus-view.js', import.meta.url), 'utf8');
    const both = (key) => ['en', 'es'].every((lang) => translate(lang, key) !== key);
    const p = buildCircuit(layoutOf(name).circuit).parts.find((x) => x.type === TYPE);
    assert.ok(p, 'the sensor in the circuit');
    assert.equal(p.raw?.part, part);
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
}

test('L16 · the tour examples/tours/uno-dht11.json validates with render-frames.js --validate', () => {
  assert.ok(existsSync(tourFile), 'examples/tours/uno-dht11.json');
  const r = spawnSync(process.execPath, ['scripts/render-frames.js', tourFile, '--validate'], { cwd: root, encoding: 'utf8' });
  assert.equal(r.status, 0, `${r.stdout}\n${r.stderr}`);
});

test('L16 (§5) · the tour plays uno-dht11, has Spanish captions, ends within 35 s, gauges of temperature and humidity, sets temperature 24 → 31 and humidity 41 → 70 with a travel', () => {
  assert.ok(existsSync(tourFile), 'examples/tours/uno-dht11.json');
  const timeline = JSON.parse(readFileSync(tourFile, 'utf8'));
  const circuit = timelineCircuit(tourFile, timeline);
  assert.deepEqual(tourIssues({ ...circuit, page: { ...circuit.page, tour: timeline } }), []);
  assert.deepEqual(circuit.spec?.recipe, { name: 'uno-dht11' });
  const steps = timeline.steps;
  const captions = steps.filter((s) => s.do === 'caption');
  assert.ok(captions.length > 0, 'captions');
  for (const s of captions) assert.ok(s.text?.es, `step at ${s.at}: a Spanish caption`);
  assert.ok(Math.max(...steps.map((s) => s.at)) <= 35000, 'no step after 35 s');
  for (const field of ['temperature', 'humidity']) assert.ok(steps.some((s) => s.do === 'gauge' && s.environment === field && s.on === true), `a gauge on ${field}`);
  // The circuit starts at 24 / 41 (its environment); the tour sets 31 and 70.
  assert.equal(valueIn(circuit.environment.temperature), 24);
  assert.equal(valueIn(circuit.environment.humidity), 41);
  assert.ok(steps.some((s) => s.do === 'set' && s.environment === 'temperature' && s.value === 31), 'temperature set to 31');
  assert.ok(steps.some((s) => s.do === 'set' && s.environment === 'humidity' && s.value === 70), 'humidity set to 70');
  assert.ok(steps.some((s) => s.move === 'travel'), 'a travel move');
});

// ---------------------------------------------------------------- L17 · state carried across engine.set

test('L17 · a slider on an unrelated part 0.5 s after a real read does not make the next call (0.6 s after the read) a real one: it returns the cached value', () => {
  const program = dht(`  delay(3000);
  Serial.println(dht.readTemperature());
  delay(600);
  Serial.println(dht.readTemperature());
  delay(1500);
  Serial.println(dht.readTemperature());`);
  const engine = engineOf(dhtBench({ slider: true, environment: { temperature: 20, humidity: 41 }, program }));
  assert.ok(engine.controls().some((c) => c.id === 'R2' && c.field === 'resistance'), 'R2 has a resistance control');
  run(engine, 3.03);
  assert.deepEqual(numbers(engine), [20], 'the real read is done');
  run(engine, 3.5);
  assert.ok(engine.set('R2', 'resistance', 470), 'the slider moves');
  assert.ok(engine.set('environment', 'temperature', 30), 'and the temperature changes');
  run(engine, 5.5);
  assert.equal(programOf(engine).error, null);
  assert.deepEqual(numbers(engine), [20, 20, 30], 'cached at 0.6 s, real again after 2 s');
});
