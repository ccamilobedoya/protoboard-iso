// Library-level climate sensors (docs/en/library-sensors.md): a board's program calls the DHT and
// Adafruit BME280 / BMP280 libraries, and the sensor wired where the library looks answers with the
// environment through its range, resolution and timing. Numbers from the datasheets and the libraries (DHT11:
// nearest whole numbers, 0…50 °C, 20…90 %RH, 2 s cache, 1 s power-up, 25 ms a real read; BME280: 0.01 °C,
// 1 Pa, 0.01 %RH, address and chip id, the library's readAltitude).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { autoLayout } from '../src/layout.js';
import { compile, createEngine, simulate } from '../src/sim/index.js';
import { PART_TYPES } from '../src/parts/types/index.js';
import { dhtValues, boschValues } from '../src/sim/devices/climate.js';
import { heatIndex, altitudeOf } from '../src/sim/libraries.js';
import { FIELDS, altitudeOfPressure, pressureAtAltitude } from '../src/sim/environment.js';

const near = (a, b, tolerance, what) => assert.ok(Math.abs(a - b) <= tolerance, `${what}: ${a} against ${b}`);
const codes = (issues) => issues.map((i) => i.code);

// A circuit laid out by the kit, its engine started, run in 1 ms steps; `at` { seconds: fn(engine) }
// is called when the simulated time reaches that second.
function bench(spec) {
  const laid = autoLayout(spec);
  // Laid out (a part hidden behind another, 'changes', does not change what it simulates).
  assert.ok(['done', 'changes'].includes(laid.status), JSON.stringify(laid.issues));
  const engine = createEngine(compile(laid.circuit).program);
  assert.ok(engine.start('dc', 1e-3));
  return { circuit: laid.circuit, engine };
}
function runTo(engine, seconds, at = {}) {
  const marks = Object.keys(at).map(Number).sort((a, b) => a - b);
  while (engine.time < seconds - 1e-9) {
    assert.ok(engine.advance(1e-3));
    while (marks.length && engine.time >= marks[0] - 1e-9) at[marks.shift()](engine);
  }
  return engine.read();
}
const serial = (reading, id = 'U1') => reading.parts[id].program.serial;
const numbers = (reading, id) => serial(reading, id).map(Number);

const dhtSketch = (body, pin = 2) => `#include <DHT.h>\nDHT dht(${pin}, DHT11);\nvoid setup() {\n  Serial.begin(9600);\n  dht.begin();\n  ${body}\n}\nvoid loop() { delay(1000); }\n`;
const unoDht = ({ program, env = {}, pin = 'D2', nets }) => ({
  parts: [{ id: 'U1', part: 'UNO', program }, { id: 'U2', type: 'climate-sensor' }],
  nets: nets ?? [['U1.5V', 'U2.+'], ['U2.−', 'U1.GND'], [`U1.${pin}`, 'U2.S']],
  environment: { temperature: 25, humidity: 50, ...env },
});
const readBoth = 'delay(3000);\n  Serial.println(dht.readTemperature());\n  Serial.println(dht.readHumidity());';

test('climate-sensor: one type of the sensor family, part numbers DHT11 (default), BME280, BME280-5V, BMP280', () => {
  const t = PART_TYPES['climate-sensor'];
  assert.equal(t.family, 'sensor');
  const dht = t.resolve({});
  assert.equal(dht.electrical.part, 'DHT11');
  assert.deepEqual(dht.pinNames, ['S', '+', '−']);
  assert.equal(dht.electrical.warmup, 1);
  for (const part of ['BME280', 'BME280-5V', 'BMP280']) {
    const r = t.resolve({ part });
    assert.deepEqual(r.pinNames, ['VCC', 'GND', 'SCL', 'SDA'], part);
    assert.equal(r.electrical.address, 0x76, part);
  }
  assert.equal(t.resolve({ part: 'BME280', address: '0x77' }).electrical.address, 0x77);
  assert.equal(t.resolve({ part: 'BME280', address: 119 }).electrical.address, 0x77);
  assert.ok(t.resolve({ part: 'BME280', address: 0x40 }).error);
  assert.ok(t.resolve({ part: 'LM35DZ' }).error);
  assert.ok(t.resolve({ humidity: 120 }).error);
  assert.equal(t.resolve({ part: 'KY-015' }).electrical.part, 'DHT11');
  assert.equal(FIELDS.pressure.default, 1013.25);
  assert.deepEqual([FIELDS.pressure.min, FIELDS.pressure.max, ...FIELDS.pressure.limit], [300, 1100, 0, 1500]);
});

test('the models as pure functions: DHT11 rounds to the nearest and clamps; BME280 to 0.01 and 1 Pa', () => {
  assert.deepEqual(dhtValues({ temperature: 23.6, humidity: 41.4 }), { temperature: 24, humidity: 41 });
  assert.deepEqual(dhtValues({ temperature: 23.4, humidity: 41.5 }), { temperature: 23, humidity: 42 });
  assert.deepEqual(dhtValues({ temperature: 55, humidity: 95 }), { temperature: 50, humidity: 90 });
  assert.deepEqual(dhtValues({ temperature: -5, humidity: 10 }), { temperature: 0, humidity: 20 });
  assert.deepEqual(boschValues({ temperature: 22.346, humidity: 45.678, pressure: 1013.25 }), { temperature: 22.35, humidity: 45.68, pressure: 101325 });
  assert.deepEqual(boschValues({ temperature: 100, humidity: 120, pressure: 1200 }), { temperature: 85, humidity: 100, pressure: 110000 });
  assert.deepEqual(boschValues({ temperature: -50, humidity: -5, pressure: 200 }), { temperature: -40, humidity: 0, pressure: 30000 });
  near(heatIndex(30, 60, false), 32.83, 0.1, 'heat index 30 °C / 60 %');
  near(heatIndex(25, 50, false), 24.86, 0.1, '25 °C / 50 %');
  near(heatIndex(35, 70, false), 50.34, 0.1, '35 °C / 70 %');
  near(altitudeOf(1013.25, 1013.25), 0, 0.5, 'sea level');
  near(altitudeOf(900, 1013.25), 988.7, 0.5, '900 hPa');
  near(altitudeOf(1100, 1013.25), -698.4, 0.5, '1100 hPa');
  near(altitudeOf(300, 1013.25), 9165.4, 0.5, '300 hPa');
  near(altitudeOf(1013.25, 1020), 55.98, 0.5, 'sea level given as 1020 hPa');
  near(pressureAtAltitude(1000), 898.8, 0.1, '1000 m');
  near(altitudeOfPressure(pressureAtAltitude(1495)), 1495, 0.5, 'and back');
});

test('DHT11 on an UNO: 23.6 °C / 41.4 % reads 24 and 41, °F from the rounded value, clamps', () => {
  const cases = [
    [{ temperature: 23.6, humidity: 41.4 }, [24, 41]],
    [{ temperature: 23.4, humidity: 41.5 }, [23, 42]],
    [{ temperature: 23.5, humidity: 41.5 }, [24, 42]],
    [{ temperature: 55, humidity: 95 }, [50, 90]],
    [{ temperature: -5, humidity: 10 }, [0, 20]],
  ];
  for (const [env, want] of cases) {
    const { engine } = bench(unoDht({ program: dhtSketch(readBoth), env }));
    assert.deepEqual(numbers(runTo(engine, 3.1), 'U1'), want, JSON.stringify(env));
  }
  const { engine } = bench(unoDht({ program: dhtSketch('delay(3000);\n  Serial.println(dht.readTemperature(true));'), env: { temperature: 23.6 } }));
  near(numbers(runTo(engine, 3.1), 'U1')[0], 75.2, 0.05, '°F');
});

test('DHT11: a read within 2 s of the last real one gives the cached value; 2 s later a new one', () => {
  const program = dhtSketch('delay(3000);\n  Serial.println(dht.readTemperature());\n  delay(975);\n  Serial.println(dht.readTemperature());\n  delay(1100);\n  Serial.println(dht.readTemperature());');
  const { engine } = bench(unoDht({ program, env: { temperature: 20 } }));
  const r = runTo(engine, 5.2, { 3.5: (e) => assert.ok(e.set('environment', 'temperature', 30)) });
  assert.deepEqual(numbers(r, 'U1'), [20, 20, 30]);
});

test('DHT11 not answering: VCC open, on another pin, 2.5 V; and the power-up second', () => {
  const failing = dhtSketch('delay(3000);\n  float t = dht.readTemperature();\n  if (isnan(t)) Serial.println("fail"); else Serial.println(t);');
  const open = bench(unoDht({ program: failing, nets: [['U2.−', 'U1.GND'], ['U1.D2', 'U2.S']] }));
  assert.deepEqual(serial(runTo(open.engine, 3.1)), ['fail'], 'VCC open');
  const other = bench(unoDht({ program: failing, pin: 'D3' }));
  const r = runTo(other.engine, 3.1);
  assert.deepEqual(serial(r), ['fail'], 'on D3 while the sketch reads D2');
  assert.equal(r.parts.U2.last.reason, 'pin');
  const low = bench({
    parts: [{ id: 'U1', part: 'UNO', program: failing }, { id: 'U2', type: 'climate-sensor' }],
    nets: [['T+', 'U2.+'], ['U2.−', 'U1.GND', 'T-'], ['U1.D2', 'U2.S']],
    supplies: [{ id: 'V1', kind: 'bench', voltage: 2.5, positive: 'T+', negative: 'T-' }],
    environment: { temperature: 25, humidity: 50 },
  });
  const lr = runTo(low.engine, 3.1);
  assert.deepEqual(serial(lr), ['fail'], 'supply 2.5 V');
  assert.equal(lr.parts.U2.last.reason, 'power');
  assert.ok(codes(simulate(low.circuit).issues).includes('SIM_MODULE_LOW_SUPPLY'));
  // Reads at 0.4, 1.2 and 2.5 s after power: under its second, the cached failure, a good one.
  const early = dhtSketch('delay(400);\n  Serial.println(dht.readTemperature());\n  delay(775);\n  Serial.println(dht.readTemperature());\n  delay(1300);\n  Serial.println(dht.readTemperature());');
  const e = bench(unoDht({ program: early }));
  assert.deepEqual(serial(runTo(e.engine, 2.6)), ['nan', 'nan', '25.00']);
});

test('DHT11: a real read holds the sketch 25 ms, a cached one nothing', () => {
  const program = dhtSketch('delay(3000);\n  unsigned long a = millis();\n  dht.readTemperature();\n  unsigned long b = millis();\n  dht.readHumidity();\n  unsigned long c = millis();\n  Serial.println(b - a);\n  Serial.println(c - b);');
  const { engine } = bench(unoDht({ program }));
  const [real, cached] = numbers(runTo(engine, 3.1), 'U1');
  near(real, 25, 5, 'real read');
  assert.ok(cached >= 0 && cached <= 1, `cached read: ${cached}`);
});

test('DHT11 on an ESP32 at 3.3 V reads as on 5 V; over 5.5 V is SIM_IC_SUPPLY', () => {
  const { engine } = bench({
    parts: [{ id: 'U1', part: 'ESP32-DEVKIT', program: dhtSketch(readBoth, 4) }, { id: 'U2', type: 'climate-sensor' }],
    nets: [['U1.3V3', 'U2.+'], ['U2.−', 'U1.GND'], ['U1.D4', 'U2.S']],
    environment: { temperature: 23.6, humidity: 41.4 },
  });
  assert.deepEqual(numbers(runTo(engine, 3.1), 'U1'), [24, 41]);
  const high = autoLayout({ parts: [{ id: 'U2', type: 'climate-sensor' }], nets: [['T+', 'U2.+'], ['U2.−', 'T-']], supplies: [{ id: 'V1', kind: 'bench', voltage: 6.5, positive: 'T+', negative: 'T-' }] });
  assert.ok(codes(simulate(high.circuit).issues).includes('SIM_IC_SUPPLY'));
});

test('DHT11: computeHeatIndex in the sketch, and the state carried across a slider elsewhere', () => {
  const hi = dhtSketch('Serial.println(dht.computeHeatIndex(30, 60, false));\n  Serial.println(dht.computeHeatIndex(25, 50, false));');
  const { engine } = bench(unoDht({ program: hi }));
  const [a, b] = numbers(runTo(engine, 0.01), 'U1');
  near(a, 32.83, 0.1, '30/60');
  near(b, 24.86, 0.1, '25/50');
  // A real read at 3.0 s; 0.5 s later a slider on another part (a resistor) and the temperature
  // change; the call at 3.6 s still gets the cached value.
  const program = dhtSketch('delay(3000);\n  Serial.println(dht.readTemperature());\n  delay(575);\n  Serial.println(dht.readTemperature());');
  const spec = unoDht({ program, env: { temperature: 20 } });
  spec.parts.push({ id: 'R1', type: 'resistor', value: '10k' }, { id: 'D1', type: 'led', color: 'red' });
  spec.nets.push(['U1.D13', 'R1.1'], ['R1.2', 'D1.anode'], ['D1.cathode', 'U1.GND']);
  const s = bench(spec);
  const r = runTo(s.engine, 3.7, {
    3.5: (e) => {
      assert.ok(e.set('R1', 'resistance', 4700));
      assert.ok(e.set('environment', 'temperature', 30));
    },
  });
  assert.deepEqual(numbers(r, 'U1'), [20, 20]);
});

// BME280 / BMP280 on the board's default I2C pins.
const boschSketch = (cls, body) => `#include <Wire.h>\n#include <${cls}.h>\n${cls} bme;\nvoid setup() {\n  Serial.begin(115200);\n  ${body}\n}\nvoid loop() { delay(1000); }\n`;
const espBosch = (program, part = {}, env = {}, nets) => ({
  parts: [{ id: 'U1', part: 'ESP32-DEVKIT', program }, { id: 'U2', type: 'climate-sensor', part: 'BME280', ...part }],
  nets: nets ?? [['U1.3V3', 'U2.VCC'], ['U2.GND', 'U1.GND'], ['U1.D22', 'U2.SCL'], ['U2.SDA', 'U1.D21']],
  environment: { temperature: 25, humidity: 50, pressure: 1013.25, ...env },
});

test('BME280: begin() at its address only (0x76 by default; the library\'s default is 0x77)', () => {
  const begins = boschSketch('Adafruit_BME280', 'Serial.println(bme.begin(0x76));\n  Serial.println(bme.begin(0x77));\n  Serial.println(bme.begin());');
  assert.deepEqual(serial(runTo(bench(espBosch(begins)).engine, 0.5)), ['1', '0', '0']);
  const at77 = bench(espBosch(begins, { address: 0x77 }));
  const r = runTo(at77.engine, 0.5);
  assert.deepEqual(serial(r), ['0', '1', '1']);
  // begin() takes 100 ms.
  const timed = boschSketch('Adafruit_BME280', 'unsigned long a = millis();\n  bme.begin(0x76);\n  Serial.println(millis() - a);');
  near(numbers(runTo(bench(espBosch(timed)).engine, 0.3), 'U1')[0], 100, 2, 'begin');
});

test('BME280: pressure in Pa, the library\'s altitude, resolutions and clamps', () => {
  const reads = boschSketch('Adafruit_BME280', 'bme.begin(0x76);\n  Serial.println(bme.readPressure());\n  Serial.println(bme.readAltitude(1013.25));\n  Serial.println(bme.readAltitude(1020));\n  Serial.println(bme.readTemperature());\n  Serial.println(bme.readHumidity());');
  const at = (env) => numbers(runTo(bench(espBosch(reads, {}, env)).engine, 0.3), 'U1');
  const [p, a, a1020, t, h] = at({ temperature: 22.346, humidity: 45.678 });
  near(p, 101325, 1, 'Pa');
  near(a, 0, 0.5, 'altitude');
  near(a1020, 55.98, 0.5, 'altitude, sea level 1020 hPa');
  near(t, 22.35, 0.005, '°C');
  near(h, 45.68, 0.005, '%RH');
  const [p900, a900] = at({ pressure: 900 });
  near(p900, 90000, 1, '900 hPa');
  near(a900, 988.7, 0.5, '900 hPa altitude');
  const [p1200, , , t100, h120] = at({ pressure: 1200, temperature: 100, humidity: 100 });
  assert.equal(p1200, 110000);
  assert.equal(t100, 85);
  assert.equal(h120, 100);
});

test('BMP280: its own library finds it, the BME280 library does not (chip id 0x58)', () => {
  const bmp = boschSketch('Adafruit_BMP280', 'Serial.println(bme.begin(0x76));\n  Serial.println(bme.readPressure());');
  assert.deepEqual(serial(runTo(bench(espBosch(bmp, { part: 'BMP280' })).engine, 0.3)), ['1', '101325.00']);
  const wrong = boschSketch('Adafruit_BME280', 'Serial.println(bme.begin(0x76));\n  Serial.println(bme.readPressure());');
  const r = runTo(bench(espBosch(wrong, { part: 'BMP280' })).engine, 0.3);
  assert.deepEqual(serial(r), ['0', 'nan']);
  assert.equal(r.parts.U2.last.reason, 'chip');
});

test('BME280: SDA and SCL swapped, or on D2/D3 of an UNO, and begin is false', () => {
  const begin = boschSketch('Adafruit_BME280', 'Serial.println(bme.begin(0x76));');
  const swapped = runTo(bench(espBosch(begin, {}, {}, [['U1.3V3', 'U2.VCC'], ['U2.GND', 'U1.GND'], ['U1.D21', 'U2.SCL'], ['U2.SDA', 'U1.D22']])).engine, 0.3);
  assert.deepEqual(serial(swapped), ['0']);
  assert.equal(swapped.parts.U2.last.reason, 'swapped');
  const uno = (sda, scl) => ({ parts: [{ id: 'U1', part: 'UNO', program: begin }, { id: 'U2', type: 'climate-sensor', part: 'BME280' }], nets: [['U1.3V3', 'U2.VCC'], ['U2.GND', 'U1.GND'], [`U1.${scl}`, 'U2.SCL'], ['U2.SDA', `U1.${sda}`]], environment: { temperature: 25, pressure: 1013.25 } });
  assert.deepEqual(serial(runTo(bench(uno('D2', 'D3')).engine, 0.3)), ['0']);
  assert.deepEqual(serial(runTo(bench(uno('A4', 'A5')).engine, 0.3)), ['1'], 'on A4 / A5 it answers');
});

test('BME280 on 5 V: SIM_IC_SUPPLY and no answer; the regulated board on 5 V idles at 3.3 V and answers', () => {
  const begin = boschSketch('Adafruit_BME280', 'Serial.println(bme.begin(0x76));');
  const nets = [['U1.5V', 'U2.VCC'], ['U2.GND', 'U1.GND'], ['U1.A5', 'U2.SCL'], ['U2.SDA', 'U1.A4']];
  const plain = bench({ parts: [{ id: 'U1', part: 'UNO', program: begin }, { id: 'U2', type: 'climate-sensor', part: 'BME280' }], nets, environment: { temperature: 25 } });
  const r = runTo(plain.engine, 0.3);
  assert.deepEqual(serial(r), ['0']);
  assert.equal(r.parts.U2.state, 'dead');
  assert.ok(codes(simulate(plain.circuit).issues).includes('SIM_IC_SUPPLY'));
  const regulated = bench({ parts: [{ id: 'U1', part: 'UNO', program: begin }, { id: 'U2', type: 'climate-sensor', part: 'BME280-5V' }], nets, environment: { temperature: 25 } });
  const g = runTo(regulated.engine, 0.3);
  assert.deepEqual(serial(g), ['1']);
  near(g.parts.U2.vsda, 3.3, 0.05, 'SDA idles at the regulated rail');
  near(g.parts.U2.rail, 3.3, 0.05, 'the chip rail');
  assert.ok(!codes(simulate(regulated.circuit).issues).includes('SIM_IC_SUPPLY'));
});

test('a part\'s own value wins over the environment, and its card says what it would answer and why not', () => {
  const { engine } = bench({ ...unoDht({ program: dhtSketch(readBoth, 3) }), parts: [{ id: 'U1', part: 'UNO', program: dhtSketch(readBoth, 3) }, { id: 'U2', type: 'climate-sensor', temperature: 30 }] });
  const r = runTo(engine, 3.1);
  assert.equal(r.parts.U2.answer.temperature, 30, 'its own 30 °C');
  assert.equal(r.parts.U2.answer.humidity, 50, 'the environment\'s humidity');
  assert.ok(engine.controls().some((c) => c.id === 'U2' && c.field === 'temperature'));
});

// ---------------------------------------------------------------- the three recipes, the tour, up close

import { readFileSync } from 'node:fs';
import { expandRecipe } from '../src/recipes/index.js';
import { checkCircuit, inspectCircuit, buildCircuit } from '../src/index.js';
import { tourIssues, loadTour } from '../src/tour.js';
import { symbolOf, insideOf } from '../src/parts/symbols.js';
import { pinList } from '../src/pinout.js';

const recipe = (name) => {
  const { spec, problems } = expandRecipe(name);
  assert.deepEqual(problems, []);
  return autoLayout(spec);
};
for (const name of ['uno-dht11', 'esp32-bme280', 'uno-bmp280-altitude']) {
  test(`${name}: DONE, check clean, every part at least half seen in one of the two views`, () => {
    const r = recipe(name);
    assert.equal(r.status, 'done', JSON.stringify(r.review.blocking));
    const bad = checkCircuit(r.circuit).issues.filter((i) => i.severity === 'error' || i.severity === 'warning');
    assert.deepEqual(codes(bad), []);
    const seen = new Map();
    for (const view of ['front', 'back']) {
      const report = inspectCircuit(r.circuit, { view });
      assert.deepEqual(report.problems.filter((p) => (p.severity === 'error' || p.severity === 'warning') && p.code !== 'PART_HIDDEN'), [], view);
      for (const p of report.parts) seen.set(p.id, Math.max(seen.get(p.id) ?? 0, p.visible));
    }
    for (const [id, visible] of seen) assert.ok(visible >= 0.5, `${id}: ${Math.round(visible * 100)} % at best`);
    assert.deepEqual(codes(simulate(r.circuit).issues.filter((i) => i.severity !== 'info')), []);
  });
}

const runRecipe = (name) => {
  const engine = createEngine(compile(recipe(name).circuit).program);
  assert.ok(engine.start('dc', 1e-3));
  return engine;
};
const lineWith = (reading, ...values) => serial(reading).find((l) => values.every((v) => new RegExp(`\\b${v}(\\.|\\b)`).test(l)));

test('uno-dht11: a line with 24 and 41 within 2.5 s; after 31 °C a line with 31 within 2.1 s more', () => {
  const engine = runRecipe('uno-dht11');
  const first = runTo(engine, 2.5);
  assert.equal(lineWith(first, 24, 41), 'T: 24.00 C  H: 41.00 %');
  assert.ok(engine.set('environment', 'temperature', 31));
  const later = runTo(engine, 4.6);
  assert.ok(lineWith(later, 31), serial(later).join(' | '));
});

test('esp32-bme280 prints 1013 hPa within 2 s; uno-bmp280-altitude about 0 m, then 988.7 m at 900 hPa', () => {
  const bme = runTo(runRecipe('esp32-bme280'), 2);
  assert.match(serial(bme)[0], /^T: 22\.00 C {2}P: 1013\.25 hPa {2}H: 45\.00 % {2}alt: 0\.00 m$/);
  const engine = runRecipe('uno-bmp280-altitude');
  assert.equal(serial(runTo(engine, 0.5))[0], 'alt: 0.00 m');
  assert.ok(engine.set('environment', 'pressure', 900));
  assert.match(serial(runTo(engine, 1.6)).at(-1), /^alt: 988\.[67]\d m$/);
});

test('uno-dht11 tour: validates, 25–35 s, Spanish captions, gauges of temperature and humidity, both moved with travel', () => {
  const raw = JSON.parse(readFileSync(new URL('../examples/tours/uno-dht11.json', import.meta.url), 'utf8'));
  const circuit = recipe('uno-dht11').circuit;
  circuit.page = { ...circuit.page, tour: raw };
  assert.deepEqual(tourIssues(circuit), []);
  assert.ok(loadTour(circuit, 'es').tour);
  const last = Math.max(...raw.steps.map((s) => s.at + (s.ms ?? 0)));
  assert.ok(last >= 25000 && last <= 35000, `${last} ms`);
  assert.ok(raw.steps.filter((s) => s.do === 'caption').every((s) => s.text.es));
  assert.deepEqual(raw.steps.filter((s) => s.do === 'gauge').map((s) => s.environment).sort(), ['humidity', 'temperature']);
  assert.deepEqual(raw.steps.filter((s) => s.do === 'set').map((s) => [s.environment, s.value, s.move]), [['temperature', 31, 'travel'], ['humidity', 70, 'travel']]);
});

test('a BME280 up close: its pins, symbol letters, mark and inside view', () => {
  const part = buildCircuit(recipe('esp32-bme280').circuit).parts.find((p) => p.id === 'U2');
  assert.deepEqual(pinList(part, 'en').map((p) => p.text), ['VCC · supply, 3.3 V', 'GND · ground, 0 V', 'SCL · I2C clock, pulled up', 'SDA · I2C data, pulled up']);
  const symbol = symbolOf(part);
  for (const n of part.pinNames) assert.ok(symbol.ids[n] && symbol.pins[n], n);
  assert.ok(part.built.mark);
  assert.deepEqual(insideOf(part), { kind: 'climate', ids: ['VCC', 'GND', 'SCL', 'SDA'], part: 'BME280', humidity: true, pressure: true, temperature: 25 });
});

test('page: the pressure row says the altitude, its indicator is a barometer', async (t) => {
  let JSDOM;
  try {
    ({ JSDOM } = await import('jsdom'));
  } catch {
    return t.skip('jsdom not installed');
  }
  const { renderPage } = await import('../src/page.js');
  const { html } = renderPage(recipe('esp32-bme280').circuit, { lang: 'es' });
  const dom = new JSDOM(html, { runScripts: 'outside-only', url: 'https://page.test/bme.html?static' });
  const { window } = dom;
  const rect = () => ({ left: 0, top: 0, right: 800, bottom: 500, width: 800, height: 500 });
  window.document.querySelector('main').getBoundingClientRect = rect;
  for (const svg of window.document.querySelectorAll('svg')) svg.getBoundingClientRect = rect;
  window.eval(html.match(/<script>([\s\S]*)<\/script>/)[1]);
  const rows = [...window.document.querySelectorAll('.side .environment .env-row')];
  const pressure = rows.find((r) => r.querySelector('svg.gauge-pressure'));
  assert.ok(pressure, 'a row with the barometer');
  assert.ok(pressure.querySelector('svg.gauge-pressure .face'));
  assert.match(pressure.querySelector('output').textContent, /^1013,25 hPa · 0 m en la atmósfera estándar$/);
});
