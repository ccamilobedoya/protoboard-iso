// LM393 sensor modules (family F3; docs/en/sensor-modules.md), against the physics spec's reference
// checks: each number below is worked out apart from the device (a divider, a datasheet curve, the
// element's formula), never read back from it. One module on a bench supply, the environment set.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { simulate, compile, createEngine } from '../src/sim/index.js';
import { SENSOR_MODULES, ldrResistance, LDR_PARTS } from '../src/parts/sensors.js';
import { autoLayout } from '../src/layout.js';
import { buildCircuit } from '../src/circuit/build.js';
import { findPin } from '../src/parts/pin-names.js';
import { PART_TYPES } from '../src/parts/types/index.js';
import { lookupPartNumber } from '../src/parts/db.js';

// One module in row c from column 10, its VCC and GND wired to the top rails; `extra` more parts.
function circuit(part, { v = 5, env, own = {}, extra = [], reversed = false } = {}) {
  const pins = SENSOR_MODULES[part].pins;
  const parts = [{ id: 'U1', type: 'sensor-module', part, pins: pins.map((_, i) => `c${10 + i}`), ...own }];
  pins.forEach((name, i) => {
    if (name === 'VCC') parts.push({ id: 'WV', type: 'wire', color: 'red', pins: [`a${10 + i}`, `T${reversed ? '-' : '+'}${10 + i}`] });
    if (name === 'GND') parts.push({ id: 'WG', type: 'wire', color: 'black', pins: [`a${10 + i}`, `T${reversed ? '+' : '-'}${10 + i}`] });
  });
  return { version: 1, board: 'bb830', supplies: [{ id: 'V1', voltage: v }], ...(env && { environment: env }), parts: [...parts, ...extra] };
}
const run = (part, options) => {
  const s = simulate(circuit(part, options));
  assert.ok(s.ok, JSON.stringify(s.issues));
  return { ...s.parts.U1, issues: s.issues };
};
const near = (actual, expected, tol, what) => assert.ok(Math.abs(actual - expected) <= tol, `${what}: ${actual} against ${expected} ± ${tol}`);
const codes = (r) => r.issues.map((i) => i.code);
// The engine, started at its operating point, for checks that move a field step by step.
const engine = (c) => {
  const e = createEngine(compile(c).program);
  assert.ok(e.start('dc'));
  return e;
};

test('sensor modules: the eight part numbers, their pins as printed, one type of the sensor family', () => {
  const t = PART_TYPES['sensor-module'];
  assert.equal(t.family, 'sensor');
  const pins = { 'MH-RD': 'VCC GND AO DO', 'YL-69': 'AO DO GND VCC', 'LDR-LM393': 'DO GND VCC', 'SLOT-IR': 'AO DO GND VCC', 'TCRT5000-M': 'AO DO GND VCC', 'KY-024': 'DO VCC GND AO', 'SW-420-M': 'DO GND VCC', 'FC-51': 'OUT GND VCC' };
  for (const [n, list] of Object.entries(pins)) {
    assert.equal(lookupPartNumber(n).entry.type, 'sensor-module', n);
    assert.equal(lookupPartNumber(n).entry.pins.join(' '), list, n);
  }
  assert.equal(lookupPartNumber('ky024').number, 'KY-024');
  // A0 and D0, as some boards print them, are the AO and DO pins.
  assert.equal(findPin(['AO', 'DO', 'GND', 'VCC'], 'A0'), 'AO');
  assert.equal(findPin(['DO', 'GND', 'VCC'], 'D0'), 'DO');
  assert.equal(t.resolve({ part: 'nope' }).error.code, 'UNKNOWN_PART_NUMBER');
  assert.equal(t.resolve({ part: 'MH-RD', threshold: 2 }).error.code, 'BAD_VALUE');
});

test('sensor modules: the family\'s currents and levels (checks 1–3)', () => {
  // DO high, element open: power LED (5 − 2) / 1 kΩ, trimmer 5 V / 10 kΩ, LM393 0.4 mA = 3.9 mA.
  const dry = run('MH-RD', { env: { rain: 0 } });
  near(dry.supply, 3.9e-3, 0.7e-3, 'supply, DO high');
  near(dry.vdo, 5, 0.01, 'DO high is VCC');
  // DO low (wet): plus the divider (5 / 15 kΩ) and the DO LED and pull-up through 60 Ω.
  const wet = run('MH-RD', { env: { rain: 1 } });
  near(wet.vdo, 0.2, 0.05, 'DO low');
  near(wet.supply, 7.5e-3, 1e-3, 'supply, DO low');
  const low = run('MH-RD', { env: { rain: 1 }, v: 3.3 });
  near(low.vdo, 0.09, 0.04, 'DO low at 3.3 V');
});

test('sensor modules: stresses and warnings of the family (checks 4–6, B6)', () => {
  // DO tied to VCC while low: 5 V / 60 Ω = 83 mA into the open collector.
  const tied = run('MH-RD', { env: { rain: 1 }, extra: [{ id: 'WX', type: 'wire', color: 'red', pins: ['a13', 'T+13'] }] });
  near(tied.sink, 5 / 60, 8e-3, 'DO shorted to VCC');
  assert.ok(codes(tied).includes('SIM_OVER_CURRENT'));
  // A 62 Ω load from VCC into DO: about 40 mA through the 60 Ω open collector.
  const load = run('MH-RD', { env: { rain: 1 }, extra: [{ id: 'RL', type: 'resistor', value: '62', pins: ['a13', 'T+16'] }] });
  assert.ok(load.sink > 0.035 && codes(load).includes('SIM_OVER_CURRENT'), String(load.sink));
  assert.ok(codes(run('MH-RD', { v: 7 })).includes('SIM_IC_SUPPLY'), 'supply over 5.5 V');
  assert.ok(!codes(run('MH-RD', { v: 5 })).includes('SIM_IC_SUPPLY'), '5 V is its supply');
  assert.ok(codes(run('MH-RD', { reversed: true })).includes('SIM_REVERSE_VOLTAGE'), 'reversed');
});

test('sensor modules: rain (checks 7–9)', () => {
  near(run('MH-RD', { env: { rain: 0 } }).ao, (5 * 10e6) / (10e6 + 10e3), 0.02, 'dry AO');
  const wet = run('MH-RD', { env: { rain: 1 } });
  near(wet.ao, 5 / 3, 0.05, 'wet AO');
  assert.equal(wet.low, true);
  assert.ok(codes(wet).includes('SIM_MODULE_CORROSION'));
  // Vref 1.0 V under AO 1.67 V: DO stays high.
  assert.equal(run('MH-RD', { env: { rain: 1 }, own: { threshold: 0.2 } }).low, false);
});

test('sensor modules: soil (checks 10–11)', () => {
  for (const [m, ao] of [[10, 4.55], [40, 3.15], [70, 2.22], [100, 1.6]]) near(run('YL-69', { env: { moisture: m } }).ao, ao, 0.05, `${m} %`);
  // The flip: R = 10 kΩ between 17 kΩ at 40 % and 8 kΩ at 70 %, log-linear: 61.2 %.
  assert.equal(run('YL-69', { env: { moisture: 59.7 } }).low, false);
  assert.equal(run('YL-69', { env: { moisture: 62.7 } }).low, true);
});

test('sensor modules: light, digital (checks 12–14), ratiometric', () => {
  const r = (lux) => ldrResistance(LDR_PARTS.GL5528, lux);
  for (const v of [5, 3.3]) {
    for (const lux of [1, 10, 100, 300]) near(run('LDR-LM393', { env: { light: lux }, v }).ao, (v * r(lux)) / (r(lux) + 10e3), 0.05, `${lux} lx at ${v} V`);
    // AO = Vref where R = 10 kΩ: 17.6 lx, at either supply.
    assert.equal(run('LDR-LM393', { env: { light: 16.6 }, v }).low, false, `${v} V`);
    assert.equal(run('LDR-LM393', { env: { light: 18.6 }, v }).low, true, `${v} V`);
  }
  near(run('LDR-LM393', { env: { light: 1 } }).ao, 4.37, 0.05, '1 lx');
});

test('sensor modules: optical slot (checks 15–18)', () => {
  const clear = run('SLOT-IR', { env: { beam: false } });
  near(clear.ao, 0.2, 0.1, 'beam clear');
  assert.equal(clear.low, true);
  const blocked = run('SLOT-IR', { env: { beam: true } });
  near(blocked.ao, blocked.vcc, 0.02, 'blocked');
  assert.equal(blocked.low, false);
  const paper = run('SLOT-IR', { env: { beam: false }, own: { transmittance: 0.3 } });
  near(paper.ao, 0.2, 0.1, 'paper');
  assert.equal(paper.low, true, 'paper does not trigger it');
  // An encoder disc of 20 slots: low for the first 9° of every 18°.
  let pulses = 0;
  let was = false;
  for (let a = 0; a < 360; a += 1) {
    const low = run('SLOT-IR', { env: { angle: a }, own: { slots: 20 } }).low;
    if (low && !was) pulses++;
    was = low;
    assert.equal(low, a % 18 < 9, `${a}°`);
  }
  assert.equal(pulses, 20);
});

test('sensor modules: line follower (checks 19–24)', () => {
  const white = run('TCRT5000-M', { env: { reflectance: 90, distance: 0.25 } });
  near(white.ao, 0.2, 0.1, 'white near');
  assert.equal(white.low, true);
  // Black at 2.5 mm: 0.1 · 2 mA = 0.2 mA, AO = 5 − 2 V; white at 15 mm: 0.9 · 2 mA · 0.12 = 0.216 mA.
  near(run('TCRT5000-M', { env: { reflectance: 10, distance: 0.25 } }).ao, 3, 0.15, 'black near');
  const far = run('TCRT5000-M', { env: { reflectance: 90, distance: 1.5 } });
  near(far.ao, 5 - 2.16, 0.15, 'white at 15 mm');
  assert.equal(far.low, false);
  // DO flips where Ic = 0.25 mA: g = 0.139, 14.6 mm.
  assert.equal(run('TCRT5000-M', { env: { reflectance: 90, distance: 1.32 } }).low, true);
  assert.equal(run('TCRT5000-M', { env: { reflectance: 90, distance: 1.6 } }).low, false);
  // IR LED (12 − 1.25) / 150 = 72 mA at 12 V; 29 mA for the whole module at 5 V.
  const hot = run('TCRT5000-M', { v: 12, env: { reflectance: 10, distance: 1 } });
  near(hot.ir, 0.0717, 0.005, 'IR LED at 12 V');
  assert.ok(hot.issues.some((i) => i.code === 'SIM_OVER_CURRENT' && i.params.part === 'U1.IR'));
  near(run('TCRT5000-M', { env: { reflectance: 10, distance: 1 } }).supply, 29e-3, 4e-3, 'module at 5 V');
});

test('sensor modules: obstacle (checks 25–27)', () => {
  // Ic = 0.9 · 0.5 mA / (1 + (d / 10 cm)²): 0.36, 0.225, 0.09 mA.
  for (const [d, ao] of [[5, 1.4], [10, 2.75], [20, 4.1]]) near(run('FC-51', { env: { reflectance: 90, distance: d } }).ao, ao, 0.1, `${d} cm`);
  // Detection where Ic = Vref / 10 kΩ … (5 − Vref) / 10 kΩ: 4.5 cm at 0.25, 9.0 at 0.5, 28.3 at 0.9.
  for (const [threshold, d] of [[0.25, 4.47], [0.5, 8.94], [0.9, 28.28]]) {
    assert.equal(run('FC-51', { env: { reflectance: 90, distance: d * 0.92 }, own: { threshold } }).low, true, `${threshold}: nearer`);
    assert.equal(run('FC-51', { env: { reflectance: 90, distance: d * 1.08 }, own: { threshold } }).low, false, `${threshold}: farther`);
  }
  const grey = run('FC-51', { env: { reflectance: 30, distance: 5 } });
  near(grey.ao, 3.8, 0.15, 'grey at 5 cm');
  assert.equal(grey.low, false);
});

test('sensor modules: Hall switch with hysteresis (checks 28–30, B4)', () => {
  const e = engine(circuit('KY-024', { env: { field: 0 } }));
  const steps = [[0, false], [100, false], [170, true], [120, true], [100, false], [-300, false], [200, true], [120, true], [90, false]];
  for (const [b, low] of steps) {
    assert.ok(e.set('environment', 'field', b));
    assert.equal(e.read().parts.U1.low, low, `${b} G`);
  }
  const on = run('KY-024', { env: { field: 200 } });
  near(on.ao, 0.09, 0.05, 'AO with a magnet');
  near(on.vdo, 0.2, 0.05, 'DO with a magnet');
  const low = run('KY-024', { v: 3.3, env: { field: 200 } });
  assert.ok(low.issues.some((i) => i.code === 'SIM_MODULE_LOW_SUPPLY'), 'under 4.5 V');
  assert.equal(low.low, true, 'it still works');
});

test('sensor modules: vibration in bursts (checks 31–32)', () => {
  const e = engine(circuit('SW-420-M', { env: { vibration: false } }));
  const h = 1e-4;
  let falls = 0;
  let high = e.read().parts.U1.vdo > 2.5;
  near(e.read().parts.U1.vdo, 0.2, 0.05, 'at rest');
  const count = (n) => {
    for (let k = 0; k < n; k++) {
      e.step(h);
      const now = e.read().parts.U1.vdo > 2.5;
      if (high && !now) falls++;
      high = now;
    }
  };
  count(10000);
  assert.equal(falls, 0, 'no edges at rest');
  e.set('environment', 'vibration', true);
  assert.ok(e.stepHint() > 0 && e.stepHint() <= 1e-4, 'short steps while it chatters');
  falls = 0;
  count(10000);
  assert.ok(falls >= 60 && falls <= 140, `${falls} falling edges in 1 s`);
  e.set('environment', 'vibration', false);
  let last = 0;
  for (let k = 1; k <= 1000; k++) {
    e.step(h);
    if (e.read().parts.U1.vdo > 2.5) last = k * h;
  }
  assert.ok(last <= 0.05, `low again ${last} s after`);
  // The same seed, the same burst.
  const a = engine(circuit('SW-420-M', { env: { vibration: true } }));
  const b = engine(circuit('SW-420-M', { env: { vibration: true } }));
  for (let k = 0; k < 300; k++) {
    a.step(h);
    b.step(h);
    assert.equal(a.read().parts.U1.low, b.read().parts.U1.low);
  }
});

test('sensor modules: a value on the part wins over the environment, field by field (B5)', () => {
  // The part's own reflectance, the environment's distance.
  const own = run('TCRT5000-M', { env: { reflectance: 10, distance: 0.25 }, own: { reflectance: 90 } });
  assert.equal(own.low, true);
  assert.deepEqual(own.env.map((x) => [x.field, x.follows]), [['distance', true], ['reflectance', false]]);
  // Without one it follows; its own control moved, it leaves the field.
  const e = engine(circuit('MH-RD', { env: { rain: 0 } }));
  assert.ok(e.set('environment', 'rain', 1));
  assert.equal(e.read().parts.U1.low, true);
  assert.ok(e.set('U1', 'wetness', 0));
  assert.ok(e.set('environment', 'rain', 1));
  assert.equal(e.read().parts.U1.low, false, 'its own wetness');
  assert.ok(e.attach('U1', 'rain'));
  assert.equal(e.read().parts.U1.low, true, 'following again');
  // A rain module with its own wetness never asks the environment.
  assert.equal(run('MH-RD', { env: { rain: 1 }, own: { wetness: 0 } }).low, false);
  // No environment at all: the part's own values (defaults: dry, 30 % soil, 300 lx…).
  assert.equal(run('MH-RD').low, false);
});

test('sensor modules: a 5 V module on a 3.3 V board drives its pin with VCC (the board warns)', () => {
  // An ESP32 on USB: its VIN is 5 V, its pins 3.3 V. The module on VIN, DO into D27, in the dark (DO high).
  const spec = { environment: { light: 1 }, parts: [{ id: 'U1', part: 'ESP32-DEVKIT' }, { id: 'U2', type: 'sensor-module', part: 'LDR-LM393' }], nets: [['U1.VIN', 'U2.VCC'], ['U2.GND', 'U1.GND'], ['U2.DO', 'U1.D27']] };
  const r = autoLayout(spec);
  assert.equal(r.status, 'done');
  const s = simulate(r.circuit);
  // DO's pull-up goes to the module's 5 V: the pin's protection diode holds it near 3.9 V, over the
  // 3.3 V + 0.3 V a pin takes.
  assert.ok(s.parts.U2.vcc > 4.9 && s.parts.U2.vdo > 3.6, `${s.parts.U2.vcc} ${s.parts.U2.vdo}`);
  assert.ok(s.issues.some((i) => i.code === 'SIM_PIN_OVERVOLTAGE'), JSON.stringify(s.issues.map((i) => i.code)));
  // On the board's 3.3 V the same module is safe (ratiometric: it still switches at the same light).
  const safe = simulate(autoLayout({ ...spec, nets: [['U1.3V3', 'U2.VCC'], ['U2.GND', 'U1.GND'], ['U2.DO', 'U1.D27']] }).circuit);
  assert.ok(!safe.issues.some((i) => i.code === 'SIM_PIN_OVERVOLTAGE'));
});

test('sensor modules: up close, the printed face and the pins as printed, from the left in each view', async () => {
  const { createCamera } = await import('../src/core/camera.js');
  const { pinoutOf } = await import('../src/pinout.js');
  // The eight side by side in row h, each 4 holes after the last.
  let col = 3;
  const parts = Object.entries(SENSOR_MODULES).map(([part, m], i) => {
    const pins = m.pins.map((_, k) => `h${col + k}`);
    col += m.pins.length + 4;
    return { id: `U${i + 1}`, type: 'sensor-module', part, pins };
  });
  const b = buildCircuit({ version: 1, board: 'bb830', parts });
  for (const p of b.parts) {
    const print = p.def.params.print;
    for (const view of ['front', 'back']) {
      const camera = createCamera({ view });
      const { mark, pins } = pinoutOf(p, camera, 'en');
      const order = [...pins].sort((x, y) => x.x - y.x).map((x) => x.id);
      assert.deepEqual([...order].sort(), [...print].sort(), p.id);
      assert.match(mark.text, new RegExp(`^Printed face (toward|away from) you: ${order.join(' ').replace(/\+/g, '\\+')} from the left$`), `${p.id} ${view}`);
    }
  }
});

test('sensor modules: the compact catalog stays within its budget', async () => {
  const { compactCatalog, formatCompactCatalog } = await import('../src/node/catalog.js');
  const text = formatCompactCatalog(compactCatalog('en'), 'en');
  assert.ok(text.length <= 4600, `${text.length}`);
  assert.match(text, /sensor-module: per part · MH-RD/);
});
