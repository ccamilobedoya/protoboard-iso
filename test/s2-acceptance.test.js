// Acceptance tests for the LM393 sensor modules (session S2), written from the brief (B1–B10) and from
// the physics spec's section 9 rows for rain, soil, light, slot, line follower, Hall, vibration and
// obstacle; nothing else. Every tolerance below is the spec's own; where a number is a bracket around
// a value read from a pin it is the spec's value ± its tolerance.
//
// One type `sensor-module`, eight part numbers. Pins in the order the spec prints them:
//   MH-RD VCC GND AO DO · YL-69 AO DO GND VCC · LDR-LM393 DO GND VCC · SLOT-IR AO DO GND VCC
//   TCRT5000-M AO DO GND VCC · KY-024 DO VCC GND AO · SW-420-M DO GND VCC · FC-51 OUT GND VCC
// A part with no AO pin (light, vibration, obstacle) is read through DO and the trimmer: with the
// `threshold` control at (AO ± tolerance) / VCC, DO is HIGH when AO is above the bracket's low end and
// LOW when it is under the high end, which is the comparator's own rule (DO LOW exactly when AO < Vref).
//
// The imports are at the top: a missing export fails the whole file, which is what we want for a missing module.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { simulate, compile, createEngine } from '../src/sim/index.js';
import { inspectCircuit, renderCircuit, checkCircuit } from '../src/index.js';
import { PART_TYPES } from '../src/parts/types/index.js';
import { catalogEntry, compactCatalog, formatCompactCatalog } from '../src/node/catalog.js';
import { RECIPES, expandRecipe } from '../src/recipes/index.js';
import { autoLayout } from '../src/layout.js';
import { tourIssues, loadTour } from '../src/tour.js';
import { buildCircuit } from '../src/circuit/build.js';
import { createCamera } from '../src/core/camera.js';
import { pinList, pinoutOf } from '../src/pinout.js';
import { t as translate } from '../src/i18n/index.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const near = (actual, expected, tol, what) => assert.ok(Math.abs(actual - expected) <= tol, `${what}: ${actual} vs ${expected} (± ${tol})`);

// ---------------------------------------------------------------- the eight parts

const PINS = {
  'MH-RD': ['VCC', 'GND', 'AO', 'DO'],
  'YL-69': ['AO', 'DO', 'GND', 'VCC'],
  'LDR-LM393': ['DO', 'GND', 'VCC'],
  'SLOT-IR': ['AO', 'DO', 'GND', 'VCC'],
  'TCRT5000-M': ['AO', 'DO', 'GND', 'VCC'],
  'KY-024': ['DO', 'VCC', 'GND', 'AO'],
  'SW-420-M': ['DO', 'GND', 'VCC'],
  'FC-51': ['DO', 'GND', 'VCC'], // printed OUT; OUT is DO
};
const PARTS = Object.keys(PINS);
// The spec lets A0/D0 stand for AO/DO and prints the obstacle sensor's DO as OUT.
const canonical = (pin) => ({ A0: 'AO', D0: 'DO', OUT: 'DO' })[pin] ?? pin;

// ---------------------------------------------------------------- a bench: module + supply + wires

// The module stands in row e from column 10, one column per pin; VCC and GND are wired to the rails.
// pullup: a 10 kΩ from DO to the 5 V rail (the spec's boards have their own; this one is the bench's).
// tie: 'wire' or an ohm value, DO joined to the + rail. own: the part's fields. environment: the circuit's.
const FIRST = 10;
function bench(part, { vcc = 5, own = {}, environment, pullup = true, tie, id = 'M1' } = {}) {
  const names = PINS[part];
  const col = (name) => FIRST + names.indexOf(name);
  const parts = [{ id, type: 'sensor-module', part, pins: names.map((_, i) => `e${FIRST + i}`), ...own }];
  parts.push({ id: 'W1', type: 'wire', color: 'red', pins: [`T+${col('VCC')}`, `a${col('VCC')}`] });
  parts.push({ id: 'W2', type: 'wire', color: 'black', pins: [`T-${col('GND')}`, `a${col('GND')}`] });
  if (pullup) parts.push({ id: 'R1', type: 'resistor', value: '10k', pins: [`a${col('DO')}`, `T+${col('DO')}`] });
  if (tie === 'wire') parts.push({ id: 'W3', type: 'wire', color: 'yellow', pins: [`a${col('DO')}`, `T+${col('DO')}`] });
  else if (tie) parts.push({ id: 'R2', type: 'resistor', value: tie, pins: [`a${col('DO')}`, `T+${col('DO')}`] });
  return { supplies: [{ id: 'V1', voltage: vcc }], ...(environment && { environment }), parts };
}
const nodeKey = (part, name) => `${FIRST + PINS[part].indexOf(name)}:a-e`;
const run = (circuit) => {
  const r = simulate(circuit);
  assert.ok(r.ok, `simulation ran: ${JSON.stringify(r.issues)}`);
  return r;
};
const pin = (r, part, name) => {
  const v = r.nodes[nodeKey(part, name)];
  assert.equal(typeof v, 'number', `${part}: a node for ${name}`);
  return v;
};
const isHigh = (v, vcc = 5) => v > vcc / 2;
const doHigh = (part, opts = {}) => isHigh(pin(run(bench(part, opts)), part, 'DO'), opts.vcc ?? 5);
const codesOf = (r) => r.issues.map((i) => i.code);

// AO at the stimulus is `expected` ± `tol` volts, read through DO and the trimmer (for the parts with no AO pin).
function aoBracket(part, expected, tol, { vcc = 5, own = {}, environment } = {}) {
  const lowEnd = (expected - tol) / vcc;
  const highEnd = (expected + tol) / vcc;
  assert.equal(doHigh(part, { vcc, own: { ...own, threshold: lowEnd }, environment }), true, `${part}: AO is above ${expected - tol} V (DO HIGH with Vref there)`);
  assert.equal(doHigh(part, { vcc, own: { ...own, threshold: highEnd }, environment }), false, `${part}: AO is under ${expected + tol} V (DO LOW with Vref there)`);
}

// ---------------------------------------------------------------- B1 the type, the catalog

test('B1: sensor-module is a type of the family sensor', () => {
  assert.ok(PART_TYPES['sensor-module'], 'the type exists');
  assert.equal(PART_TYPES['sensor-module'].family, 'sensor');
});

test('B1: the catalog lists the eight part numbers, each with its pins in the spec\'s order', () => {
  const entry = catalogEntry('sensor-module');
  assert.ok(entry, 'catalogEntry("sensor-module")');
  assert.equal(entry.kind, 'type');
  const listed = Array.isArray(entry.parts) ? entry.parts : Object.keys(entry.parts);
  for (const part of PARTS) assert.ok(listed.includes(part), `${part} is listed: ${listed}`);
  // Nine since the KY-037 joined the family: the only change to this test.
  assert.equal(listed.length, 9, `the eight and the KY-037: ${listed}`);
  assert.ok(!Array.isArray(entry.parts), 'parts is keyed by part number so that each one tells its pins');
  for (const part of PARTS) {
    const pins = entry.parts[part].pins.map(canonical);
    assert.deepEqual(pins, PINS[part], `${part}: pins`);
  }
});

test('B1: the type\'s fields are part, threshold and the per-part stimulus overrides', () => {
  const fields = Object.keys(catalogEntry('sensor-module').fields);
  for (const f of ['part', 'threshold', 'wetness', 'moisture', 'light', 'beam', 'reflectance', 'field', 'vibration', 'distance']) assert.ok(fields.includes(f), `field ${f}: ${fields}`);
});

// ---------------------------------------------------------------- the environment registry

test('environment: reflectance (%, linear, limit 0…100, default 80, a level) and beam (a switch, default 0)', async () => {
  const { FIELDS } = await import('../src/sim/environment.js');
  const r = FIELDS.reflectance;
  assert.ok(r, 'reflectance');
  assert.deepEqual([r.unit, r.scale, r.limit, r.default, r.kind], ['%', 'linear', [0, 100], 80, 'level']);
  const b = FIELDS.beam;
  assert.ok(b, 'beam');
  assert.deepEqual([b.kind, b.default, b.limit], ['switch', 0, [0, 1]]);
  // Appended after the first fourteen (later sensors append after them: pressure).
  const keys = Object.keys(FIELDS);
  assert.deepEqual(keys.slice(14, 16), ['reflectance', 'beam'], 'appended at the end of FIELDS, one line each');
});

test('environment: a circuit may declare reflectance and beam, and check accepts their limits', () => {
  const env = (environment) => checkCircuit({ ...bench('TCRT5000-M'), environment }).issues.map((i) => i.code).filter((c) => c.startsWith('ENV_'));
  assert.deepEqual(env({ reflectance: 90, beam: 1 }), []);
  assert.deepEqual(env({ reflectance: 100 }), []);
  assert.deepEqual(env({ reflectance: 101 }), ['ENV_OUT_OF_RANGE']);
});

test('environment docs: the fields table names reflectance and beam in English and Spanish', () => {
  for (const file of ['docs/en/environment.md', 'docs/es/ambiente.md']) {
    const doc = readFileSync(`${root}${file}`, 'utf8');
    for (const f of ['reflectance', 'beam']) assert.ok(doc.includes(`\`${f}\``), `${file}: ${f}`);
  }
});

// ---------------------------------------------------------------- B2 both views, inspect clean

const finite = (value, path = '') => {
  if (typeof value === 'number') return Number.isFinite(value) ? [] : [path];
  if (Array.isArray(value)) return value.flatMap((v, i) => finite(v, `${path}[${i}]`));
  if (value && typeof value === 'object') return Object.entries(value).flatMap(([k, v]) => finite(v, `${path}.${k}`));
  return [];
};

for (const part of PARTS) {
  test(`B2: ${part} renders in both views with inspect clean (module + supply)`, () => {
    const circuit = { supplies: [{ id: 'V1', voltage: 5 }], parts: [{ id: 'M1', type: 'sensor-module', part, pins: PINS[part].map((_, i) => `e${FIRST + i}`) }] };
    for (const view of ['front', 'back']) {
      const report = inspectCircuit(circuit, { view });
      const bad = report.problems.filter((p) => p.severity === 'error' || p.severity === 'warning');
      assert.deepEqual(bad, [], `${part} ${view}: problems`);
      assert.deepEqual(finite(report), [], `${part} ${view}: every number is finite`);
      const m = report.parts.find((p) => p.id === 'M1');
      assert.ok(m, `${part} ${view}: the module is in the report`);
      assert.equal(m.pins.length, PINS[part].length, `${part} ${view}: a hole per pin`);
      assert.ok(m.box.width > 0 && m.box.height > 0);
      const out = renderCircuit(circuit, { view });
      assert.ok(!/NaN|undefined/.test(out.svg), `${part} ${view}: no NaN in the drawing`);
      assert.equal(out.issues.filter((i) => i.severity === 'error').length, 0, `${part} ${view}: render issues`);
    }
  });
}

// ---------------------------------------------------------------- B3 spec §9 rows

test('§9 row 1: any module with DO HIGH and the element open draws 3.9 mA at 5 V (± 0.7)', () => {
  const r = run(bench('MH-RD', { environment: { rain: 0 }, pullup: false }));
  near(r.supplies.V1.current, 3.9e-3, 0.7e-3, 'supply current');
});

test('§9 row 2: rain wet at 5 V: DO 0.20 V (± 0.05), 7.5 mA (± 1 mA)', () => {
  const r = run(bench('MH-RD', { environment: { rain: 1 }, pullup: false }));
  near(pin(r, 'MH-RD', 'DO'), 0.2, 0.05, 'DO');
  near(r.supplies.V1.current, 7.5e-3, 1e-3, 'supply current');
});

test('§9 row 3: rain wet at 3.3 V: DO 0.09 V (± 0.04)', () => {
  const r = run(bench('MH-RD', { vcc: 3.3, environment: { rain: 1 }, pullup: false }));
  near(pin(r, 'MH-RD', 'DO'), 0.09, 0.04, 'DO');
});

test('§9 row 7: rain 0 at 5 V: AO 4.99 V (± 0.02), DO HIGH', () => {
  const r = run(bench('MH-RD', { environment: { rain: 0 } }));
  near(pin(r, 'MH-RD', 'AO'), 4.99, 0.02, 'AO');
  assert.ok(isHigh(pin(r, 'MH-RD', 'DO')), 'DO HIGH');
});

test('§9 row 8: rain 1 at 5 V: AO 1.67 V (± 0.05), DO LOW', () => {
  const r = run(bench('MH-RD', { environment: { rain: 1 } }));
  near(pin(r, 'MH-RD', 'AO'), 1.67, 0.05, 'AO');
  assert.ok(!isHigh(pin(r, 'MH-RD', 'DO')), 'DO LOW');
});

test('§9 row 9: rain 1 with the trimmer at 0.2 (Vref 1.0 V): AO 1.67 V is above Vref, DO HIGH', () => {
  const r = run(bench('MH-RD', { environment: { rain: 1 }, own: { threshold: 0.2 } }));
  near(pin(r, 'MH-RD', 'AO'), 1.67, 0.05, 'AO');
  assert.ok(isHigh(pin(r, 'MH-RD', 'DO')), 'DO HIGH');
});

test('§9 row 10: soil at 10 / 40 / 70 / 100 % moisture: AO 4.55 / 3.15 / 2.22 / 1.60 V (± 0.05)', () => {
  for (const [moisture, ao] of [[10, 4.55], [40, 3.15], [70, 2.22], [100, 1.6]]) near(pin(run(bench('YL-69', { environment: { moisture } })), 'YL-69', 'AO'), ao, 0.05, `AO at ${moisture} %`);
});

test('§9 row 11: soil DO falls from HIGH to LOW at 61.2 % moisture (± 1.5 %) at the trimmer\'s 0.5', () => {
  assert.equal(doHigh('YL-69', { environment: { moisture: 61.2 - 1.5 } }), true, 'HIGH just under');
  assert.equal(doHigh('YL-69', { environment: { moisture: 61.2 + 1.5 } }), false, 'LOW just over');
  assert.equal(doHigh('YL-69', { environment: { moisture: 0 } }), true, 'HIGH at 0 %');
  assert.equal(doHigh('YL-69', { environment: { moisture: 100 } }), false, 'LOW at 100 %');
});

test('§9 row 12: light at 1 / 10 / 100 / 300 lx, 5 V: AO 4.37 / 2.98 / 1.15 / 0.61 V (± 0.05), read through DO and the trimmer', () => {
  for (const [light, ao] of [[1, 4.37], [10, 2.98], [100, 1.15], [300, 0.61]]) aoBracket('LDR-LM393', ao, 0.05, { environment: { light } });
});

test('§9 row 13: light at 3.3 V: AO 2.89 / 1.97 / 0.76 / 0.40 V (± 0.05) and DO flips at the same lux (± 1 lx)', () => {
  for (const [light, ao] of [[1, 2.89], [10, 1.97], [100, 0.76], [300, 0.4]]) aoBracket('LDR-LM393', ao, 0.05, { vcc: 3.3, environment: { light } });
  assert.equal(doHigh('LDR-LM393', { vcc: 3.3, environment: { light: 17.6 - 1 } }), true, 'HIGH just under 17.6 lx');
  assert.equal(doHigh('LDR-LM393', { vcc: 3.3, environment: { light: 17.6 + 1 } }), false, 'LOW just over 17.6 lx');
});

test('§9 row 14: light, trimmer 0.5, 5 V: DO flips HIGH to LOW at 17.6 lx (± 1)', () => {
  assert.equal(doHigh('LDR-LM393', { environment: { light: 17.6 - 1 } }), true);
  assert.equal(doHigh('LDR-LM393', { environment: { light: 17.6 + 1 } }), false);
  assert.equal(doHigh('LDR-LM393', { environment: { light: 1 } }), true, 'dark');
  assert.equal(doHigh('LDR-LM393', { environment: { light: 1000 } }), false, 'bright');
});

test('§9 row 15: slot, beam 0: AO 0.2 V (± 0.1), DO LOW', () => {
  const r = run(bench('SLOT-IR', { environment: { beam: 0 } }));
  near(pin(r, 'SLOT-IR', 'AO'), 0.2, 0.1, 'AO');
  assert.ok(!isHigh(pin(r, 'SLOT-IR', 'DO')), 'DO LOW');
});

test('§9 row 16: slot, beam 1: AO = VCC (± 0.02), DO HIGH', () => {
  const r = run(bench('SLOT-IR', { environment: { beam: 1 } }));
  near(pin(r, 'SLOT-IR', 'AO'), 5, 0.02, 'AO');
  assert.ok(isHigh(pin(r, 'SLOT-IR', 'DO')), 'DO HIGH');
});

test('§9 row 19: TCRT5000, reflectance 90 %, 0.25 cm, 5 V: AO 0.20 V (± 0.1), DO LOW', () => {
  const r = run(bench('TCRT5000-M', { environment: { reflectance: 90, distance: 0.25 } }));
  near(pin(r, 'TCRT5000-M', 'AO'), 0.2, 0.1, 'AO');
  assert.ok(!isHigh(pin(r, 'TCRT5000-M', 'DO')), 'DO LOW');
});

test('§9 row 20: TCRT5000, reflectance 10 %, 0.25 cm: AO 3.00 V (± 0.15), DO HIGH', () => {
  const r = run(bench('TCRT5000-M', { environment: { reflectance: 10, distance: 0.25 } }));
  near(pin(r, 'TCRT5000-M', 'AO'), 3.0, 0.15, 'AO');
  assert.ok(isHigh(pin(r, 'TCRT5000-M', 'DO')), 'DO HIGH');
});

test('§9 row 21: TCRT5000, reflectance 90 %, 1.5 cm: AO 2.84 V (± 0.15), DO HIGH', () => {
  const r = run(bench('TCRT5000-M', { environment: { reflectance: 90, distance: 1.5 } }));
  near(pin(r, 'TCRT5000-M', 'AO'), 2.84, 0.15, 'AO');
  assert.ok(isHigh(pin(r, 'TCRT5000-M', 'DO')), 'DO HIGH');
});

test('§9 row 22: TCRT5000, reflectance 90 %: DO flips LOW to HIGH at 1.46 cm (± 0.15)', () => {
  assert.equal(doHigh('TCRT5000-M', { environment: { reflectance: 90, distance: 1.46 - 0.15 } }), false, 'LOW just inside');
  assert.equal(doHigh('TCRT5000-M', { environment: { reflectance: 90, distance: 1.46 + 0.15 } }), true, 'HIGH just outside');
  assert.equal(doHigh('TCRT5000-M', { environment: { reflectance: 90, distance: 0.2 } }), false, 'LOW at 0.2 cm');
  assert.equal(doHigh('TCRT5000-M', { environment: { reflectance: 90, distance: 3 } }), true, 'HIGH at 3 cm');
});

test('§9 row 23: TCRT5000 at 12 V: the IR LED takes about 72 mA (± 5), a warning over its 60 mA', () => {
  const r = run(bench('TCRT5000-M', { vcc: 12, environment: { reflectance: 90, distance: 0.25 } }));
  const hit = r.issues.filter((i) => i.code === 'SIM_OVER_CURRENT' && i.params.part.startsWith('M1') && Math.abs(i.params.current.value - 0.072) <= 0.005);
  assert.ok(hit.length > 0, `an over-current of 72 mA ± 5 on M1: ${JSON.stringify(r.issues)}`);
  near(hit[0].params.max.value, 0.06, 1e-9, 'the limit is 60 mA');
});

test('§9 row 24: TCRT5000 at 5 V (default environment, DO HIGH) draws about 29 mA (± 4)', () => {
  const r = run(bench('TCRT5000-M', { pullup: false }));
  near(r.supplies.V1.current, 29e-3, 4e-3, 'supply current');
});

test('§9 row 25: obstacle, reflectance 90 %, 5 / 10 / 20 cm, 5 V: AO 1.40 / 2.75 / 4.10 V (± 0.1), read through OUT and the trimmer', () => {
  for (const [distance, ao] of [[5, 1.4], [10, 2.75], [20, 4.1]]) aoBracket('FC-51', ao, 0.1, { environment: { reflectance: 90, distance } });
});

test('§9 row 26: obstacle, reflectance 90 %: detection distance 4.5 / 9.0 / 28.3 cm (± 8 %) at the trimmer 0.25 / 0.5 / 0.9', () => {
  for (const [threshold, d] of [[0.25, 4.5], [0.5, 9.0], [0.9, 28.3]]) {
    const at = (distance) => doHigh('FC-51', { own: { threshold }, environment: { reflectance: 90, distance } });
    assert.equal(at(d * 0.92), false, `trimmer ${threshold}: detected (OUT LOW) just inside ${d} cm`);
    assert.equal(at(d * 1.08), true, `trimmer ${threshold}: not detected (OUT HIGH) just outside ${d} cm`);
  }
});

test('§9 row 27: obstacle, reflectance 30 %, 5 cm, trimmer 0.5: AO 3.80 V (± 0.15), OUT HIGH', () => {
  aoBracket('FC-51', 3.8, 0.15, { environment: { reflectance: 30, distance: 5 } });
  assert.equal(doHigh('FC-51', { environment: { reflectance: 30, distance: 5 } }), true, 'not detected');
});

test('§9 row 29: Hall at +200 G, 5 V: AO 0.09 V (± 0.05), DO LOW', () => {
  const r = run(bench('KY-024', { environment: { field: 200 } }));
  near(pin(r, 'KY-024', 'AO'), 0.09, 0.05, 'AO');
  assert.ok(!isHigh(pin(r, 'KY-024', 'DO')), 'DO LOW');
});

test('§9 row 30: Hall at 3.3 V: the note that the supply is under 4.5 V and the behaviour unchanged', () => {
  const r = run(bench('KY-024', { vcc: 3.3, environment: { field: 200 } }));
  assert.ok(codesOf(r).includes('SIM_MODULE_LOW_SUPPLY'), `SIM_MODULE_LOW_SUPPLY in ${codesOf(r)}`);
  assert.ok(!isHigh(pin(r, 'KY-024', 'DO'), 3.3), 'DO still LOW with the magnet');
  const away = run(bench('KY-024', { vcc: 3.3, environment: { field: 0 } }));
  assert.ok(isHigh(pin(away, 'KY-024', 'DO'), 3.3), 'DO still HIGH without it');
});

test('§9 row 31: SW-420, vibration 0, 5 V: DO LOW (0.2 V ± 0.05) steady, no edge in 10 s', () => {
  const circuit = bench('SW-420-M', { environment: { vibration: 0 }, pullup: false });
  near(pin(run(circuit), 'SW-420-M', 'DO'), 0.2, 0.05, 'DO');
  const e = engineOf(circuit, 2.5e-3);
  let edges = 0;
  let before = e.read().nodes[nodeKey('SW-420-M', 'DO')];
  for (let k = 0; k < 4000; k++) {
    assert.ok(e.advance(2.5e-3));
    const v = e.read().nodes[nodeKey('SW-420-M', 'DO')];
    if (isHigh(before) !== isHigh(v)) edges++;
    before = v;
  }
  assert.equal(edges, 0, 'no edges in 10 s');
});

test('§9 row 32: SW-420, vibration 1 for 1 s: about 100 falling edges (± 40); LOW again within 50 ms of vibration 0', () => {
  const e = engineOf(bench('SW-420-M', { environment: { vibration: 0 } }), 2.5e-4);
  const key = nodeKey('SW-420-M', 'DO');
  assert.ok(e.set('environment', 'vibration', 1));
  const h = 2.5e-4;
  let falling = 0;
  let before = e.read().nodes[key];
  for (let k = 0; k < 4000; k++) {
    assert.ok(e.advance(h));
    const v = e.read().nodes[key];
    if (isHigh(before) && !isHigh(v)) falling++;
    before = v;
  }
  near(falling, 100, 40, 'falling edges in the burst');
  assert.ok(e.set('environment', 'vibration', 0));
  for (let k = 0; k < 200; k++) assert.ok(e.advance(h)); // 50 ms
  assert.ok(!isHigh(e.read().nodes[key]), 'LOW at 50 ms');
  for (let k = 0; k < 4000; k++) {
    assert.ok(e.advance(h));
    assert.ok(!isHigh(e.read().nodes[key]), `stays LOW (step ${k})`);
  }
});

// ---------------------------------------------------------------- engine helper (after the tests that use it: hoisted)

function engineOf(circuit, h = 1e-3) {
  const e = createEngine(compile(circuit).program);
  assert.ok(e.start('dc', h));
  return e;
}

// ---------------------------------------------------------------- B4 Hall hysteresis

function hallDO(e) {
  for (let k = 0; k < 5; k++) assert.ok(e.advance(1e-3));
  return isHigh(e.read().nodes[nodeKey('KY-024', 'DO')]);
}

test('B4: Hall hysteresis: DO low at 200 G, still low back at 120 G, high at 90 G', () => {
  const e = engineOf(bench('KY-024', { environment: { field: 0 } }));
  assert.equal(hallDO(e), true, 'HIGH with no magnet');
  assert.ok(e.set('environment', 'field', 200));
  assert.equal(hallDO(e), false, 'LOW at 200 G');
  assert.ok(e.set('environment', 'field', 120));
  assert.equal(hallDO(e), false, 'still LOW at 120 G (held)');
  assert.ok(e.set('environment', 'field', 90));
  assert.equal(hallDO(e), true, 'HIGH at 90 G');
});

test('§9 row 28: Hall field 0 → 100 → 170 → 120 → 100 → −300 G: HIGH, HIGH, LOW, LOW, HIGH, HIGH (thresholds ± 5 G)', () => {
  const e = engineOf(bench('KY-024', { environment: { field: 0 } }));
  const seen = [hallDO(e)];
  for (const g of [100, 170, 120, 100, -300]) {
    assert.ok(e.set('environment', 'field', g));
    seen.push(hallDO(e));
  }
  assert.deepEqual(seen, [true, true, false, false, true, true]);
  // The thresholds: on at 160 G (± 5), off at 105 G (± 5).
  const t = engineOf(bench('KY-024', { environment: { field: 0 } }));
  assert.ok(t.set('environment', 'field', 160 - 5));
  assert.equal(hallDO(t), true, 'not yet on at 155 G');
  assert.ok(t.set('environment', 'field', 160 + 5));
  assert.equal(hallDO(t), false, 'on at 165 G');
  assert.ok(t.set('environment', 'field', 105 + 5));
  assert.equal(hallDO(t), false, 'still on at 110 G');
  assert.ok(t.set('environment', 'field', 105 - 5));
  assert.equal(hallDO(t), true, 'off at 100 G');
});

test('B4: the latch survives a change of another control (the trimmer moved while the magnet is in the hysteresis band)', () => {
  const e = engineOf(bench('KY-024', { environment: { field: 0 } }));
  assert.ok(e.set('environment', 'field', 200));
  assert.equal(hallDO(e), false);
  assert.ok(e.set('environment', 'field', 120));
  assert.ok(e.set('M1', 'threshold', 0.4));
  assert.equal(hallDO(e), false, 'held after set(threshold)');
});

// ---------------------------------------------------------------- B5 a value on the part wins; the engine's controls

test('B5: a module with no stimulus of its own follows the environment; its own value wins (soil: AO)', () => {
  const ao = (own, moisture) => pin(run(bench('YL-69', { own, environment: { moisture } })), 'YL-69', 'AO');
  near(ao({}, 70), 2.22, 0.05, 'follows the field at 70 %');
  near(ao({}, 10), 4.55, 0.05, 'follows the field at 10 %');
  near(ao({ moisture: 10 }, 70), 4.55, 0.05, 'its own 10 % wins over the field\'s 70 %');
  near(ao({ moisture: 70 }, 10), 2.22, 0.05, 'its own 70 % wins over the field\'s 10 %');
});

test('B5: the same for rain (wetness), slot (beam), line follower (reflectance and distance) and Hall (field)', () => {
  const rainAO = (own, rain) => pin(run(bench('MH-RD', { own, environment: { rain } })), 'MH-RD', 'AO');
  near(rainAO({}, 1), 1.67, 0.05, 'rain: follows the field');
  near(rainAO({ wetness: 0 }, 1), 4.99, 0.02, 'rain: its own wetness 0 wins over rain 1');
  near(rainAO({ wetness: 1 }, 0), 1.67, 0.05, 'rain: its own wetness 1 wins over rain 0');
  const slotAO = (own, beam) => pin(run(bench('SLOT-IR', { own, environment: { beam } })), 'SLOT-IR', 'AO');
  near(slotAO({}, 1), 5, 0.02, 'slot: follows the field');
  near(slotAO({ beam: 0 }, 1), 0.2, 0.1, 'slot: its own clear beam wins');
  near(slotAO({ beam: 1 }, 0), 5, 0.02, 'slot: its own blocked beam wins');
  const lineAO = (own, environment) => pin(run(bench('TCRT5000-M', { own, environment })), 'TCRT5000-M', 'AO');
  near(lineAO({}, { reflectance: 10, distance: 0.25 }), 3.0, 0.15, 'line: follows the field');
  near(lineAO({ reflectance: 90 }, { reflectance: 10, distance: 0.25 }), 0.2, 0.1, 'line: its own reflectance wins');
  near(lineAO({ distance: 0.25 }, { reflectance: 90, distance: 3 }), 0.2, 0.1, 'line: its own distance wins');
  const hallDOat = (own, field) => isHigh(pin(run(bench('KY-024', { own, environment: { field } })), 'KY-024', 'DO'));
  assert.equal(hallDOat({}, 200), false, 'Hall: follows the field');
  assert.equal(hallDOat({ field: 0 }, 200), true, 'Hall: its own 0 G wins over 200 G');
  assert.equal(hallDOat({ field: 200 }, 0), false, 'Hall: its own 200 G wins over 0 G');
});

test('B5: light and obstacle (DO): own light / distance wins', () => {
  assert.equal(doHigh('LDR-LM393', { environment: { light: 300 } }), false, 'follows: bright, LOW');
  assert.equal(doHigh('LDR-LM393', { own: { light: 1 }, environment: { light: 300 } }), true, 'its own 1 lx wins');
  assert.equal(doHigh('LDR-LM393', { own: { light: 300 }, environment: { light: 1 } }), false, 'its own 300 lx wins');
  assert.equal(doHigh('FC-51', { environment: { reflectance: 90, distance: 5 } }), false, 'follows: near, LOW');
  assert.equal(doHigh('FC-51', { own: { distance: 30 }, environment: { reflectance: 90, distance: 5 } }), true, 'its own 30 cm wins');
  assert.equal(doHigh('FC-51', { own: { distance: 5 }, environment: { reflectance: 90, distance: 30 } }), false, 'its own 5 cm wins');
});

test('B5: the engine: the environment moves a module that follows it; its own control detaches it; the trimmer is a control', () => {
  const key = nodeKey('YL-69', 'AO');
  const e = engineOf(bench('YL-69', { environment: { moisture: 10 } }));
  const ao = () => e.read().nodes[key];
  near(ao(), 4.55, 0.05, 'starts at 10 %');
  assert.ok(e.set('environment', 'moisture', 70));
  near(ao(), 2.22, 0.05, 'follows the field to 70 %');
  const mine = e.controls().filter((c) => c.id === 'M1').map((c) => c.field);
  assert.ok(mine.includes('threshold'), `the trimmer is a control: ${mine}`);
  assert.ok(mine.includes('moisture'), `the soil stimulus is a control: ${mine}`);
  assert.ok(e.set('M1', 'moisture', 10));
  near(ao(), 4.55, 0.05, 'its own slider');
  assert.ok(e.set('environment', 'moisture', 100));
  near(ao(), 4.55, 0.05, 'detached: the field no longer moves it');
  const control = e.controls().find((c) => c.id === 'M1' && c.field === 'threshold');
  assert.equal(control.value, 0.5, 'the trimmer starts at 0.5');
  assert.ok(e.set('M1', 'threshold', 0.9));
  assert.equal(e.controls().find((c) => c.id === 'M1' && c.field === 'threshold').value, 0.9);
});

test('B5: the trimmer sets Vref = threshold × VCC (rain wet, AO 1.67 V: DO LOW at 0.5 and 0.9, HIGH at 0.2; dry, AO 4.99 V: HIGH at 0.9)', () => {
  assert.equal(doHigh('MH-RD', { own: { threshold: 0.5 }, environment: { rain: 1 } }), false);
  assert.equal(doHigh('MH-RD', { own: { threshold: 0.2 }, environment: { rain: 1 } }), true);
  assert.equal(doHigh('MH-RD', { own: { threshold: 0.9 }, environment: { rain: 1 } }), false);
  assert.equal(doHigh('MH-RD', { own: { threshold: 0.9 }, environment: { rain: 0 } }), true);
});

// ---------------------------------------------------------------- B6 stresses

test('B6: supply 7 V: SIM_IC_SUPPLY on the module; 5 V: none', () => {
  const at7 = run(bench('MH-RD', { vcc: 7, environment: { rain: 0 } }));
  const hit = at7.issues.filter((i) => i.code === 'SIM_IC_SUPPLY' && i.params.part === 'M1');
  assert.equal(hit.length, 1, `SIM_IC_SUPPLY for M1: ${codesOf(at7)}`);
  near(hit[0].params.max.value, 5.5, 1e-9, 'the module rating, 5.5 V');
  assert.ok(!codesOf(run(bench('MH-RD', { environment: { rain: 0 } }))).includes('SIM_IC_SUPPLY'), 'no warning at 5 V');
});

test('B6: DO sunk 40 mA: SIM_OVER_CURRENT on the module', () => {
  // DO (LOW: rain wet) tied to the 5 V rail through 62 Ω: 5 V / (62 + 60) Ω is about 41 mA.
  const r = run(bench('MH-RD', { environment: { rain: 1 }, pullup: false, tie: '62' }));
  const hit = r.issues.filter((i) => i.code === 'SIM_OVER_CURRENT' && i.params.part.startsWith('M1'));
  assert.equal(hit.length, 1, `SIM_OVER_CURRENT for M1: ${JSON.stringify(r.issues)}`);
  assert.ok(hit[0].params.current.value > 0.02, 'over the 20 mA limit');
  near(hit[0].params.max.value, 0.02, 1e-9, 'the limit is 20 mA');
  const calm = run(bench('MH-RD', { environment: { rain: 1 } }));
  assert.ok(!calm.issues.some((i) => i.code === 'SIM_OVER_CURRENT'), 'no warning with only the pull-up');
});

test('§9 row 4: DO tied to VCC while LOW (5 V): SIM_OVER_CURRENT on the output, about 83 mA (± 8)', () => {
  const r = run(bench('MH-RD', { environment: { rain: 1 }, pullup: false, tie: 'wire' }));
  const hit = r.issues.filter((i) => i.code === 'SIM_OVER_CURRENT' && i.params.part.startsWith('M1'));
  assert.equal(hit.length, 1, `SIM_OVER_CURRENT for M1: ${JSON.stringify(r.issues)}`);
  near(hit[0].params.current.value, 0.083, 0.008, 'current');
});

// ---------------------------------------------------------------- B7 the six recipes

const SENSOR_RECIPES = { 'rain-alarm': 'MH-RD', 'soil-led': 'YL-69', 'light-switch-module': 'LDR-LM393', 'line-follower-uno': 'TCRT5000-M', 'obstacle-buzzer': 'FC-51', 'hall-counter-uno': 'KY-024' };
const layoutOf = (name) => {
  const { spec, problems } = expandRecipe(name);
  assert.deepEqual(problems, [], `${name}: ${JSON.stringify(problems)}`);
  return autoLayout(spec);
};

for (const [name, part] of Object.entries(SENSOR_RECIPES)) {
  test(`B7: recipe ${name}: exists, ends DONE with a clean check, uses ${part}, declares its environment and page controls`, () => {
    assert.ok(RECIPES[name], `${name} is in RECIPES`);
    const r = layoutOf(name);
    assert.equal(r.status, 'done', JSON.stringify(r.problems) + JSON.stringify(r.check));
    assert.deepEqual(r.problems, []);
    assert.equal(r.check.ok, true, JSON.stringify(r.check));
    assert.deepEqual(r.check.missing, []);
    assert.deepEqual(r.check.shorted, []);
    assert.deepEqual(r.review.blocking, []);
    const modules = r.circuit.parts.filter((p) => p.type === 'sensor-module');
    assert.equal(modules.length, 1, 'one sensor module');
    assert.equal(modules[0].part, part);
    assert.ok(r.circuit.environment && Object.keys(r.circuit.environment).length > 0, 'environment declared');
    assert.ok(Array.isArray(r.circuit.page?.controls) && r.circuit.page.controls.length > 0, 'page.controls declared');
    const s = simulate(r.circuit);
    assert.ok(s.ok, JSON.stringify(s.issues));
    const over = Object.entries(s.parts).flatMap(([id, p]) => (p.stress ?? []).filter((x) => x.level !== 'fine').map((x) => `${id} ${x.quantity} ${x.level}`));
    assert.deepEqual(over, [], `${name}: no part stressed`);
  });
}

test('B7: the Uno recipes carry a program: the line follower prints LINE / NO LINE', () => {
  const text = JSON.stringify(layoutOf('line-follower-uno').circuit);
  const [all, no] = [(text.match(/LINE/g) ?? []).length, (text.match(/NO LINE/g) ?? []).length];
  assert.ok(no > 0 && all > no, 'prints LINE and NO LINE');
  assert.ok(JSON.stringify(layoutOf('hall-counter-uno').circuit).includes('program'), 'the Hall counter has a program');
});

test('B7: the six recipes are listed in the catalog and in both recipe docs', () => {
  const c = compactCatalog('en');
  for (const name of Object.keys(SENSOR_RECIPES)) {
    assert.ok(name in c.recipes, `${name} in the catalog`);
    for (const file of ['docs/en/recipes.md', 'docs/es/recetas.md']) assert.ok(readFileSync(`${root}${file}`, 'utf8').includes(`\`${name}\``), `${file}: ${name}`);
  }
});

// ---------------------------------------------------------------- B8 a part up close

test('B8: pinout.test.js lists sensor-module as COMPLETE with a recipe or example that holds one', () => {
  const source = readFileSync(`${root}test/pinout.test.js`, 'utf8');
  const entry = source.match(/const COMPLETE = \{[^}]*'sensor-module': '([^']+)'/);
  assert.ok(entry, 'COMPLETE has a sensor-module entry');
  const [name, id] = entry[1].split(' ');
  assert.ok(RECIPES[name] || existsSync(`${root}examples/${name}.json`), `${name} is a recipe or an example`);
  const circuit = RECIPES[name] ? autoLayout(expandRecipe(name).spec).circuit : JSON.parse(readFileSync(`${root}examples/${name}.json`, 'utf8'));
  const p = buildCircuit(circuit).parts.find((x) => x.id === id);
  assert.equal(p?.type, 'sensor-module', `${entry[1]} is a sensor-module`);
  assert.ok(!/const PENDING = \{[^}]*'sensor-module'/.test(source), 'and not in PENDING');
});

test('B8: every part number has its pin rows, mark, symbol and inside view, in both languages and both views', async () => {
  const { symbolOf, insideOf } = await import('../src/parts/symbols.js');
  const figure = readFileSync(`${root}src/page/client/figure.js`, 'utf8');
  const legends = readFileSync(`${root}src/page/client/focus-view.js`, 'utf8');
  const both = (key) => ['en', 'es'].every((lang) => translate(lang, key) !== key);
  for (const part of PARTS) {
    const circuit = { supplies: [{ id: 'V1', voltage: 5 }], parts: [{ id: 'M1', type: 'sensor-module', part, pins: PINS[part].map((_, i) => `e${FIRST + i}`) }] };
    const p = buildCircuit(circuit).parts.find((x) => x.id === 'M1');
    assert.equal(p.pinNames.length, PINS[part].length, `${part}: pins`);
    for (const lang of ['en', 'es']) {
      const rows = pinList(p, lang);
      assert.equal(rows.length, p.pinNames.length, `${part} ${lang}: a row per pin`);
      assert.ok(rows.every((r) => typeof r.text === 'string' && r.text.length > 0), `${part} ${lang}: every row says something`);
    }
    for (const n of p.pinNames) assert.ok(both(`pin.role.${part}.${n}`) || both(`pin.role.sensor-module.${n}`), `${part}: the text of pin ${n} (pin.role.*) in every language`);
    assert.ok(p.built?.mark, `${part}: the package's orientation mark`);
    for (const view of ['front', 'back']) {
      const out = pinoutOf(p, createCamera({ view }), 'en');
      assert.equal(out.pins.length, p.holes.length, `${part} ${view}`);
      assert.ok(out.mark.text.length > 0, `${part} ${view}: a mark sentence`);
      assert.ok(pinoutOf(p, createCamera({ view }), 'es').mark.text.length > 0, `${part} ${view}: in Spanish`);
    }
    const symbol = symbolOf(p);
    assert.ok(symbol, `${part}: a symbol`);
    for (const n of p.pinNames) assert.ok(symbol.ids?.[n] && symbol.pins[n], `${part}: the symbol's terminal and letter for pin ${n}`);
    const inside = insideOf(p);
    assert.ok(inside, `${part}: an inside view`);
    assert.match(figure, new RegExp(`\\n  ${inside.kind}\\(g, r, data`), `${part}: its drawer in figure.js INSIDE`);
    const legend = legends.match(new RegExp(`\\n  ${inside.kind}: \\[(.*)\\],`))?.[1];
    assert.ok(legend, `${part}: its legend in focus-view.js LEGENDS`);
    for (const [, key] of legend.matchAll(/\['[a-z]*', '([a-z]+)'\]/g)) assert.ok(both(`page.tour.legend.${inside.kind}.${key}`), `${part}: legend line ${key} in every language`);
  }
});

// ---------------------------------------------------------------- B9 the compact catalog

test('B9: the compact catalog stays within 4600 characters and lists sensor-module under sensor', () => {
  const text = formatCompactCatalog(compactCatalog('en'), 'en');
  assert.ok(text.length <= 4600, `${text.length} characters`);
  const lines = text.split('\n');
  const start = lines.indexOf('sensor');
  assert.ok(start >= 0, 'a block for the family sensor');
  let end = start + 1;
  while (end < lines.length && lines[end].startsWith('  ')) end++;
  assert.ok(lines.slice(start + 1, end).some((l) => l.trim().startsWith('sensor-module:')), 'sensor-module is in the sensor block');
});

// ---------------------------------------------------------------- B10 the two tours

for (const name of ['soil-led', 'obstacle-buzzer']) {
  test(`B10: examples/tours/${name}.json validates against the ${name} recipe, 20–30 s, Spanish captions, a gauge and a travelling set of the environment`, () => {
    const file = `${root}examples/tours/${name}.json`;
    assert.ok(existsSync(file), `${name}.json exists`);
    const raw = JSON.parse(readFileSync(file, 'utf8'));
    const circuit = { ...layoutOf(name).circuit };
    circuit.page = { ...circuit.page, tour: raw };
    assert.deepEqual(tourIssues(circuit), [], 'no issue');
    assert.ok(loadTour(circuit, 'es').tour, 'it plays');
    const end = Math.max(...raw.steps.map((s) => s.at + (s.ms ?? 0)));
    assert.ok(end >= 20000 && end <= 30000, `the last step ends at ${end} ms`);
    assert.ok(raw.steps.some((s) => s.do === 'gauge' && s.on === true), 'a gauge is shown');
    assert.ok(raw.steps.some((s) => s.do === 'set' && s.environment && s.move === 'travel'), 'a set of an environment field with travel');
    const captions = raw.steps.filter((s) => s.do === 'caption');
    assert.ok(captions.length > 0 && captions.every((s) => typeof s.text?.es === 'string' && s.text.es.length > 0), 'every caption in Spanish');
  });
}

// ---------------------------------------------------------------- the docs the brief asks for

test('docs: sensor-modules.md and its Spanish twin exist and name the eight part numbers', () => {
  for (const file of ['docs/en/sensor-modules.md', 'docs/es/modulos-sensores.md']) {
    assert.ok(existsSync(`${root}${file}`), file);
    const doc = readFileSync(`${root}${file}`, 'utf8');
    for (const part of PARTS) assert.ok(doc.includes(part), `${file}: ${part}`);
  }
});
