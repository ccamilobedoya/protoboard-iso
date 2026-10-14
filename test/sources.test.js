// Batteries and the parts added with them (Zener diodes, regulators, inductors, sensors, the
// buzzer, header pins, trimmers). As in sim.test.js, each model is checked once against an
// independent reference: Ohm's law with the internal resistance, a datasheet figure, or the
// textbook formula.

import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { checkCircuit, renderCircuit, buildCircuit } from '../src/index.js';
import { simulate } from '../src/sim/index.js';
import { batteryModel, cellVoltage } from '../src/parts/batteries.js';
import { valueCode } from '../src/parts/types/controls.js';
import { partLines } from '../src/sim/format.js';
import { BRIDGES, VT } from '../src/sim/models.js';

const codes = (issues) => issues.map((i) => i.code);
const near = (actual, expected, tol, what) => assert.ok(Math.abs(actual - expected) <= tol, `${what}: ${actual} vs ${expected} (± ${tol})`);
function run(circuit, options) {
  const errors = checkCircuit(circuit).issues.filter((i) => i.severity === 'error');
  assert.deepEqual(errors, [], 'the layout has no placement errors');
  const result = simulate(circuit, options);
  assert.ok(result.ok, `simulation ran: ${JSON.stringify(result.issues)}`);
  return result;
}
const W = 0.05; // jumper wire, ohms

const battery = (extra = {}) => ({ id: 'BT1', type: 'battery', format: 'AA', cells: 4, pins: { '+': 'T+3', '-': 'T-3' }, ...extra });
const load = (ohms) => [
  { id: 'R1', type: 'resistor', value: String(ohms), power: '1', pins: ['T+9', 'a12'] },
  { id: 'W1', type: 'wire', color: 'black', pins: ['c12', 'T-15'] },
];

test('battery model: cells in series add their voltages and resistances', () => {
  const aa = batteryModel({ format: 'AA', cells: 4 });
  assert.equal(aa.nominal, 6);
  assert.equal(aa.emf, 6, 'without charge: the nominal voltage');
  near(aa.resistance, 1, 1e-12, '4 × 0.25 Ω');
  assert.equal(aa.chemistry, 'alkaline');
  const nine = batteryModel({ format: '9V' });
  assert.equal(nine.nominal, 9, 'a 9 V block holds six cells');
  const li = batteryModel({ format: '18650', cells: 2, charge: 1 });
  near(li.emf, 8.4, 1e-12, '2 × 4.2 V full');
  near(cellVoltage('li-ion', 0), 3.0, 1e-12, 'empty');
  near(cellVoltage('li-ion', 0.5), 3.75, 1e-12, 'half');
  assert.ok(batteryModel({ format: 'AA', charge: 0 }).resistance > batteryModel({ format: 'AA', charge: 1 }).resistance, 'an empty alkaline cell is worse at delivering current');
  assert.equal(batteryModel({ format: 'AA', cells: 4, voltage: 6.32 }).emf, 6.32, 'a measured voltage wins');
  assert.equal(batteryModel({ format: 'pouch', capacity: '1000 mAh' }).capacity, 1);
  assert.equal(batteryModel({ format: 'D' }).error.code, 'UNKNOWN_KIND');
  assert.equal(batteryModel({ format: 'AA', chemistry: 'li-ion' }).error.code, 'UNKNOWN_KIND');
  assert.equal(batteryModel({ format: 'AA', cells: 0 }).error.code, 'BAD_VALUE');
  assert.equal(batteryModel({ format: 'AA', charge: 2 }).error.code, 'BAD_VALUE');
});

test('a battery part is the power source: Ohm\'s law with its internal resistance', () => {
  const r = run({ parts: [battery(), ...load(330)] });
  const i = 6 / (330 + W + 1);
  near(r.parts.BT1.current, i, 1e-7, 'current');
  near(r.parts.BT1.voltage, 6 - i * 1, 1e-6, 'terminal voltage = emf − I·r');
  near(r.parts.BT1.drop, i, 1e-7, 'internal drop');
  near(r.parts.BT1.runtime, 2.5 / i, 0.01, 'runtime = capacity / current (h)');
  assert.equal(r.ground, 'T-', 'its − is ground');
  assert.deepEqual(r.parts.BT1.pinCurrents, { '+': -r.parts.BT1.current, '-': r.parts.BT1.current }, 'current comes out of +');
  // The same battery described in supplies (not drawn) gives the same answer.
  const s = run({ supplies: [{ id: 'V1', kind: 'battery', format: 'AA', cells: 4, positive: 'T+', negative: 'T-' }], parts: load(330) });
  near(s.supplies.V1.current, i, 1e-7, 'as a supply');
  const lines = partLines(r.parts.BT1, 'es').map((l) => l.key);
  assert.deepEqual(lines, ['battery.emf', 'battery.voltage', 'battery.drop', 'battery.current', 'battery.power', 'battery.runtime']);
});

test('battery switch, short circuit and over-current', () => {
  const off = run({ parts: [battery({ switch: 'off' }), ...load(330)] });
  assert.equal(off.parts.BT1.current, 0);
  assert.ok(codes(off.issues).includes('SIM_BATTERY_OFF'));
  assert.equal(partLines(off.parts.BT1, 'en')[0].key, 'battery.off');
  const short = run({ parts: [battery({ format: '18650', cells: 1 }), { id: 'W1', type: 'wire', pins: ['T+9', 'T-9'] }] });
  assert.ok(codes(short.issues).includes('SIM_SHORT_CIRCUIT'), '3.7 V / (0.03 + 0.05) Ω ≈ 46 A');
  const heavy = run({ parts: [battery({ format: '9V', cells: 1 }), ...load(10)] });
  assert.ok(codes(heavy.issues).includes('SIM_OVER_CURRENT'), 'a 9 V block is not meant for 0.8 A');
  assert.equal(simulate({ parts: load(330) }).issues[0].code, 'SIM_NO_SUPPLY');
});

test('a battery lies beside the board; the board hides it when it is on the far side', () => {
  const circuit = { parts: [battery({ side: 'left' }), ...load(330)] };
  const front = renderCircuit(circuit, { view: 'front' }).scene;
  const back = renderCircuit(circuit, { view: 'back' }).scene;
  assert.ok(front.layers.under.some((op) => op.part === 'BT1'), 'front view: the left side is away from the viewer');
  const count = (scene, layer) => scene.layers[layer].filter((op) => op.part === 'BT1').length;
  assert.ok(count(back, 'parts') > 10 * count(back, 'under'), 'back view: it is in front of the board (a wall past the front edge may go either way: nothing overlaps there)');
  assert.match(renderCircuit(circuit).svg, /<g class="under">/);
  const [bt] = buildCircuit(circuit).parts;
  assert.ok(bt.built.anchor.x < 0, 'beside the left edge');
  assert.equal(checkCircuit({ parts: [battery({ side: 'up' })] }).issues[0].code, 'UNKNOWN_KIND');
});

test('Zener diode: 5.1 V at its 49 mA test current (1N4733A datasheet)', () => {
  const zener = (ohms, extra = {}) => ({
    supplies: [{ id: 'V1', voltage: 12 }],
    parts: [{ id: 'R1', type: 'resistor', value: String(ohms), power: '1', pins: ['T+9', 'a12'] }, { id: 'D1', type: 'zener', pins: { K: 'c12', A: 'c16' }, ...extra }, { id: 'W1', type: 'wire', color: 'black', pins: ['a16', 'T-17'] }],
  });
  const atTest = run(zener(140, { part: '1N4733A' }));
  near(-atTest.parts.D1.current, 0.049, 0.002, 'about Izt');
  near(-atTest.parts.D1.voltage, 5.1, 0.02, 'Vz at Izt');
  const low = run(zener(690, { value: '5V1' }));
  const v = -low.parts.D1.voltage;
  assert.ok(v > 4.8 && v < 5.1, `at 10 mA a little below Vz: ${v}`);
  const forward = run({ supplies: [{ id: 'V1', voltage: 5 }], parts: [{ id: 'R1', type: 'resistor', value: '220', pins: ['T+9', 'a12'] }, { id: 'D1', type: 'zener', value: '12', pins: { A: 'c12', K: 'c16' } }, { id: 'W1', type: 'wire', color: 'black', pins: ['a16', 'T-17'] }] });
  assert.ok(forward.parts.D1.voltage > 0.6 && forward.parts.D1.voltage < 0.85, 'forward it is a silicon diode');
});

test('regulators: a 7805 holds 5 V; an LM317 follows 1.25 V · (1 + R2/R1) + Iadj · R2', () => {
  const r7805 = (vin, ohms) => ({
    supplies: [{ id: 'V1', voltage: vin }],
    parts: [
      { id: 'U1', type: 'regulator', part: 'L7805CV', pins: { IN: 'a10', GND: 'a11', OUT: 'a12' } },
      { id: 'W1', type: 'wire', pins: ['T+9', 'c10'] },
      { id: 'W2', type: 'wire', color: 'black', pins: ['T-11', 'c11'] },
      { id: 'RL', type: 'resistor', value: String(ohms), power: '1', pins: ['c12', 'c18'] },
      { id: 'W3', type: 'wire', color: 'black', pins: ['a18', 'T-17'] },
    ],
  });
  const ok = run(r7805(9, 100));
  near(ok.parts.U1.vout, 5, 0.005, 'output');
  assert.equal(ok.parts.U1.state, 'regulating');
  near(ok.parts.U1.quiescent, 5e-3, 1e-4, 'its own 5 mA out of GND');
  near(ok.parts.U1.currents.IN, ok.parts.U1.current + ok.parts.U1.quiescent, 1e-9, 'input = output + own current');
  const low = run(r7805(6, 100));
  assert.equal(low.parts.U1.state, 'dropout');
  near(low.parts.U1.vout, 4, 0.05, 'about 2 V below the input');
  assert.ok(codes(low.issues).includes('SIM_REG_DROPOUT'));
  assert.ok(codes(run(r7805(24, 25)).issues).includes('SIM_REG_HOT'), '19 V × 0.2 A = 3.8 W');

  const lm317 = run({
    supplies: [{ id: 'V1', voltage: 12 }],
    parts: [
      { id: 'U1', type: 'regulator', part: 'LM317T', pins: { ADJ: 'a10', OUT: 'a11', IN: 'a12' } },
      { id: 'W1', type: 'wire', pins: ['T+11', 'c12'] },
      { id: 'R1', type: 'resistor', value: '240', pins: ['c11', 'c15'] },
      { id: 'W2', type: 'wire', pins: ['d15', 'd10'] },
      { id: 'R2', type: 'resistor', value: '720', pins: ['e10', 'e5'] },
      { id: 'W3', type: 'wire', color: 'black', pins: ['a5', 'T-5'] },
    ],
  });
  near(lm317.parts.U1.vout, 1.25 * (1 + 720 / 240) + 50e-6 * 720, 0.005, 'LM317 output');
});

test('inductor: an RL circuit rises as I·(1 − e^(−t/τ)), τ = L/R (textbook)', () => {
  const circuit = {
    supplies: [{ id: 'V1', voltage: 5 }],
    parts: [{ id: 'R1', type: 'resistor', value: '100', pins: ['T+3', 'a5'] }, { id: 'L1', type: 'inductor', value: '10m', dcr: 0, pins: ['c5', 'c12'] }, { id: 'W1', type: 'wire', pins: ['a12', 'T-12'] }],
  };
  const dc = run(circuit);
  near(dc.parts.L1.current, 5 / (100 + W + 1e-3), 1e-5, 'in DC it is a wire');
  const tau = 0.01 / (100 + W + 1e-3);
  const tr = run(circuit, { analysis: 'transient', stop: 5 * tau, step: tau / 200, points: 100 });
  const k = tr.times.findIndex((t) => t >= tau - 1e-12);
  near(tr.parts.L1.current[k], (5 / (100 + W)) * (1 - Math.exp(-tr.times[k] / tau)), 0.0005, 'current at t = τ');
  const [l] = buildCircuit({ parts: [{ id: 'L1', type: 'inductor', value: '100u', pins: ['a5', 'a10'] }] }).parts;
  assert.deepEqual(l.def.info.bands, ['brown', 'black', 'brown', 'silver'], '100 µH: 10 × 10¹ µH, 10 %');
});

test('sensors: NTC B equation, photoresistor curve, buzzer on DC', () => {
  const divider = (sensor) => ({ supplies: [{ id: 'V1', voltage: 5 }], parts: [{ id: 'S1', pins: ['T+3', 'a5'], ...sensor }, { id: 'R1', type: 'resistor', value: '10k', pins: ['c5', 'T-7'] }] });
  const ntc = run(divider({ type: 'thermistor', value: '10k', temperature: 50 }));
  near(ntc.parts.S1.sensor.resistance, 10e3 * Math.exp(3950 * (1 / 323.15 - 1 / 298.15)), 1e-6, 'R(50 °C)');
  near(ntc.parts.S1.sensor.resistance, 3588, 2, 'MF52 10k B3950 table at 50 °C');
  const lit = run(divider({ type: 'ldr', part: 'GL5528', light: 10 }));
  near(lit.parts.S1.sensor.resistance, 1 / (1 / 15e3 + 1 / 1e6), 1e-6, 'GL5528 at 10 lx');
  const dark = run(divider({ type: 'ldr', light: 0 }));
  near(dark.parts.S1.sensor.resistance, 1e6, 1e-6, 'dark resistance');
  assert.deepEqual(partLines(ntc.parts.S1, 'es').slice(0, 2).map((l) => l.key), ['sensor.temperature', 'sensor.resistance']);
  const buzz = run({ supplies: [{ id: 'V1', voltage: 5 }], parts: [{ id: 'BZ1', type: 'buzzer', pins: ['T+3', 'a5'] }, { id: 'R1', type: 'resistor', value: '100', pins: ['c5', 'T-7'] }] });
  assert.ok(codes(buzz.issues).includes('SIM_BUZZER_DC'), 'a passive buzzer on DC');
});

test('header pins by pin1, trimmer code, more part numbers', () => {
  const { parts, issues } = buildCircuit({ parts: [{ id: 'J1', type: 'header', count: 4, pin1: 'h50' }] });
  assert.deepEqual(parts[0].holes.map((h) => h.id), ['h50', 'h51', 'h52', 'h53']);
  assert.ok(!issues.some((i) => i.severity === 'error'));
  assert.deepEqual([valueCode(10e3), valueCode(500), valueCode(1e6), valueCode(50)], ['103', '501', '105', '500']);
  const [rv] = buildCircuit({ parts: [{ id: 'RV1', type: 'potentiometer', style: 'trimmer', value: '10k', pins: ['a3', 'a4', 'a5'] }] }).parts;
  assert.equal(rv.def.package, 'trimmer-3296');
  const [q] = buildCircuit({ parts: [{ id: 'Q1', type: 'bjt', part: '2SC1815', pins: ['a3', 'a4', 'a5'] }] }).parts;
  assert.deepEqual(q.pinNames, ['E', 'C', 'B'], 'Toshiba pinout, by its other name');
  const [u] = buildCircuit({ parts: [{ id: 'U1', type: 'ic', part: 'LM324', pin1: 'f10' }] }).parts;
  assert.equal(u.holes.length, 14);
});

test('the battery and regulator example: 9 V in, 5 V out, the LED lit (a model)', () => {
  const circuit = JSON.parse(readFileSync(new URL('../examples/battery-regulator.json', import.meta.url), 'utf8'));
  const r = run(circuit);
  near(r.parts.U1.vout, 5, 0.01, 'regulated output');
  assert.equal(r.parts.U1.state, 'regulating');
  assert.ok(r.parts.D1.current > 5e-3 && r.parts.D1.current < 20e-3, 'LED current within its range');
  assert.deepEqual(r.issues.filter((i) => i.severity !== 'info'), []);
});

test('bridge rectifier: two diode drops, and the same output polarity either way round', () => {
  // Each diode drops about 1.0 V at the rated current (KBP2/KBP3 datasheets: 1.1 V maximum).
  for (const [family, m] of Object.entries(BRIDGES)) {
    const vf = m.n * VT * Math.log(m.maxCurrent / m.is) + m.maxCurrent * m.rs;
    assert.ok(vf > 0.9 && vf < 1.1, `${family}: ${vf} V at ${m.maxCurrent} A`);
  }
  const bridge = (ac1, ac2) => ({
    version: 1,
    board: 'bb830',
    supplies: [{ id: 'V1', voltage: 9 }],
    parts: [
      { id: 'BR1', type: 'bridge', part: 'KBP307', pins: { '+': 'e10', AC1: 'e11', AC2: 'e13', '-': 'e14' } },
      { id: 'W1', type: 'wire', pins: ['a11', ac1] },
      { id: 'W2', type: 'wire', pins: ['a13', ac2] },
      { id: 'R1', type: 'resistor', value: '1k', pins: ['c10', 'c4'] },
      { id: 'W3', type: 'wire', pins: ['a4', 'a14'] },
    ],
  });
  for (const [ac1, ac2] of [['T+11', 'T-13'], ['T-11', 'T+13']]) {
    const r = run(bridge(ac1, ac2));
    const br = r.parts.BR1;
    assert.ok(br.vdc > 7.5 && br.vdc < 8, `two drops of about 0.6 V at 8 mA: ${br.vdc}`);
    near(r.parts.R1.voltage, br.vdc, 0.01, 'the load gets the DC side');
    assert.ok(r.parts.R1.current > 0, `${ac1}: current through the load always the same way`);
    near(Object.values(br.pinCurrents).reduce((s, i) => s + i, 0), 0, 1e-9, 'Kirchhoff at the bridge');
  }
  const bad = checkCircuit({ version: 1, board: 'bb830', parts: [{ id: 'BR1', type: 'bridge', pins: ['e10', 'e13', 'e14', 'e18'] }] });
  assert.ok(codes(bad.issues).includes('BRIDGE_SHAPE'), 'its legs are one or two holes apart');
});

test('cement resistor (5 W), printed electrolytic value', () => {
  const circuit = {
    version: 1,
    board: 'bb830',
    supplies: [{ id: 'V1', voltage: 9 }],
    parts: [
      { id: 'R1', type: 'resistor', value: '10', power: '5W', pins: ['T+3', 'a14'] },
      { id: 'W1', type: 'wire', color: 'black', pins: ['c14', 'T-15'] },
      { id: 'C1', type: 'capacitor', value: '100u', voltage: 25, pins: { '+': 'h3', '-': 'h4' } },
    ],
  };
  const built = buildCircuit(circuit);
  const r1 = built.parts.find((p) => p.id === 'R1').def;
  assert.equal(r1.params.shape, 'box');
  assert.equal(r1.params.print, '5W 10ΩJ');
  // 9 V across 10 Ω is 8.1 W: too much even for 5 W.
  assert.ok(codes(run(circuit).issues).includes('SIM_OVER_POWER'));
  // The value is printed around the sleeve; each view shows one copy.
  for (const view of ['front', 'back']) {
    const svg = renderCircuit(circuit, { view }).svg;
    assert.equal(svg.split('100µF 25V').length - 1, 1, `${view}: one copy of the print`);
  }
});
