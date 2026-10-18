// Simulator checks. Each model is compared once with an independent reference (a textbook
// formula solved separately, or the datasheet figure) and kept here so it never drifts.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { checkCircuit } from '../src/index.js';
import { simulate } from '../src/sim/index.js';
import { VT, WIRE_RESISTANCE, DIODES, ledModel, MOSFETS, BJTS } from '../src/sim/models.js';

const example = (name) => JSON.parse(readFileSync(new URL(`../examples/${name}`, import.meta.url), 'utf8'));
const codes = (issues) => issues.map((i) => i.code);
const near = (actual, expected, tol, what) => assert.ok(Math.abs(actual - expected) <= tol, `${what}: ${actual} vs ${expected} (± ${tol})`);

// Placement must be clean before simulating: these circuits are also drawing tests.
function run(circuit, options) {
  const errors = checkCircuit(circuit).issues.filter((i) => i.severity === 'error');
  assert.deepEqual(errors, [], 'the layout has no placement errors');
  const result = simulate(circuit, options);
  assert.ok(result.ok, `simulation ran: ${JSON.stringify(result.issues)}`);
  return result;
}

// Root of a monotonic function by bisection: the independent solver for the references.
function bisect(f, lo, hi) {
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    if (f(lo) * f(mid) <= 0) hi = mid;
    else lo = mid;
  }
  return (lo + hi) / 2;
}

const supply = (voltage, extra = {}) => [{ id: 'V1', voltage, ...extra }];

test('voltage divider: two equal resistors split the voltage in half (textbook)', () => {
  const r = run({ ...example('voltage-divider.json'), supplies: supply(9) });
  near(r.nodes['16:f-j'], 4.5, 1e-4, 'middle node');
  near(r.parts.R1.current, 9 / 20000, 1e-8, 'current');
  near(r.supplies.V1.current, 9 / 20000, 1e-8, 'supply current');
  assert.equal(r.supplies.V1.mode, 'CV');
  assert.deepEqual(r.issues, []);
});

test('series and parallel resistors: 1 kΩ in series with 2 kΩ ∥ 2 kΩ (textbook)', () => {
  const circuit = {
    supplies: supply(6),
    parts: [
      { id: 'W1', type: 'wire', pins: ['T+5', 'j5'] },
      { id: 'R1', type: 'resistor', value: '1k', pins: ['i5', 'i10'] },
      { id: 'R2', type: 'resistor', value: '2k', pins: ['h10', 'h15'] },
      { id: 'R3', type: 'resistor', value: '2k', pins: ['g10', 'g15'] },
      { id: 'W2', type: 'wire', color: 'black', pins: ['j15', 'T-15'] },
    ],
  };
  const r = run(circuit);
  // 1 k + 1 k = 2 k → 3 mA, 3 V across the pair, 1.5 mA each (wires: 0.05 Ω, negligible).
  near(r.supplies.V1.current, 3e-3, 1e-6, 'total current');
  near(r.nodes['10:f-j'], 3, 1e-3, 'middle node');
  near(r.parts.R2.current, 1.5e-3, 1e-6, 'one branch');
});

test('LED with resistor matches an independent solution of the loop equation', () => {
  const r = run({ ...example('led-resistor.json'), supplies: supply(5) });
  const m = ledModel('red');
  const loss = (i) => 5 - i * (330 + m.rs + WIRE_RESISTANCE) - m.n * VT * Math.log1p(i / m.is);
  const expected = bisect(loss, 0, 5 / 330);
  near(r.parts.D1.current, expected, 1e-7, 'LED current');
  near(r.parts.R1.voltage + r.parts.D1.voltage, 5, 1e-3, 'Kirchhoff voltage law');
  assert.ok(r.parts.D1.brightness > 0.4 && r.parts.D1.brightness < 0.6);
});

// A bench supply in constant-current mode forces the current: the diode shows its Vf.
// Axial diodes span five columns; LEDs sit in two neighbouring ones.
const forward = (part, current) => {
  const end = part.type === 'led' ? 6 : 10;
  return {
    supplies: supply(5, { currentLimit: current }),
    parts: [
      { id: 'W1', type: 'wire', pins: ['T+5', 'j5'] },
      { id: 'D1', ...part, pins: ['i5', `b${end}`] },
      { id: 'W2', type: 'wire', color: 'black', pins: [`a${end}`, `T-${end}`] },
    ],
  };
};

test('diode forward voltage at the datasheet test current', () => {
  for (const [number, model] of Object.entries(DIODES)) {
    const r = run(forward({ type: 'diode', part: number }, model.vf.current));
    assert.equal(r.supplies.V1.mode, 'CC', `${number}: supply limits the current`);
    near(r.parts.D1.current, model.vf.current, 1e-9, `${number} current`);
    const vf = r.parts.D1.voltage;
    assert.ok(vf > 0.25 && vf <= model.vf.max, `${number}: Vf ${vf.toFixed(3)} V within its datasheet maximum ${model.vf.max} V`);
  }
  const vf4007 = run(forward({ type: 'diode', part: '1N4007' }, 1)).parts.D1.voltage;
  near(vf4007, 0.93, 0.05, '1N4007 typical Vf at 1 A');
  assert.ok(codes(run(forward({ type: 'diode', part: '1N4007' }, 1)).issues).includes('SIM_SUPPLY_LIMITED'));
});

test('LED forward voltage at 20 mA is the typical value of its colour, or the one given', () => {
  const led = (color, model) => ({ type: 'led', color, ...(model && { model }) });
  for (const color of ['red', 'green', 'blue']) {
    const r = run(forward(led(color), 0.02));
    near(r.parts.D1.voltage, ledModel(color).vf, 1e-3, `${color} LED Vf`);
  }
  const measured = run(forward(led('green', { vf: 2.95 }), 0.02));
  near(measured.parts.D1.voltage, 2.95, 1e-3, 'override from the circuit');
  const over = run(forward(led('red'), 0.05));
  assert.ok(codes(over.issues).includes('SIM_OVER_CURRENT'));
});

test('short circuit: a current-limited supply drops its voltage; an unlimited one is flagged', () => {
  const short = (extra) => ({ supplies: supply(5, extra), parts: [{ id: 'W1', type: 'wire', pins: ['T+5', 'T-5'] }] });
  const limited = run(short({ currentLimit: 0.5 }));
  assert.equal(limited.supplies.V1.mode, 'CC');
  near(limited.supplies.V1.current, 0.5, 1e-9, 'current at the limit');
  near(limited.supplies.V1.voltage, 0.5 * WIRE_RESISTANCE, 1e-6, 'voltage left');
  assert.ok(codes(limited.issues).includes('SIM_SUPPLY_LIMITED'));
  assert.ok(codes(run(short({})).issues).includes('SIM_SHORT_CIRCUIT'));
});

test('resistor dissipating more than its rating is flagged', () => {
  const circuit = {
    supplies: supply(5),
    parts: [
      { id: 'R1', type: 'resistor', value: '10', pins: ['T+5', 'j5'] },
      { id: 'W1', type: 'wire', color: 'black', pins: ['i5', 'T-6'] },
    ],
  };
  const r = run(circuit);
  near(r.parts.R1.power, 2.5, 0.05, 'P = V² / R');
  assert.ok(codes(r.issues).includes('SIM_OVER_POWER'));
});

test('battery: internal resistance of 1.5 V cells lowers the voltage under load', () => {
  const circuit = {
    supplies: [{ id: 'B1', kind: 'battery', voltage: 9 }],
    parts: [
      { id: 'R1', type: 'resistor', value: '100', pins: ['T+5', 'j5'] },
      { id: 'W1', type: 'wire', color: 'black', pins: ['i5', 'T-6'] },
    ],
  };
  const r = run(circuit);
  near(r.supplies.B1.voltage, (9 * 100.05) / (100.05 + 1.5), 1e-3, 'terminal voltage (6 cells × 0.25 Ω)');
});

// n-channel MOSFET switching a 10 Ω load, gate from the + rail through a wire.
const mosfetSwitch = (part, gate) => ({
  supplies: supply(5),
  parts: [
    { id: 'R1', type: 'resistor', value: '10', power: '1', pins: ['T+21', 'j21'] },
    { id: 'Q1', type: 'mosfet', part, pins: { G: 'h20', D: 'h21', S: 'h22' } },
    { id: 'W1', type: 'wire', color: gate ? 'red' : 'black', pins: [gate ? 'T+19' : 'T-19', 'j20'] },
    { id: 'W2', type: 'wire', color: 'black', pins: ['j22', 'T-22'] },
  ],
});

test('MOSFET square law: on-resistance with the gate high, off with it low', () => {
  const on = run(mosfetSwitch('IRLZ44N', true));
  const m = MOSFETS.IRLZ44N;
  // Linear region: Id = k·(Vov·Vds − Vds²/2)·(1 + λ·Vds). The source wire lifts the source by
  // Id·Rw, so Vgs = 5 − Id·Rw; the drain sits at 5 − 10·Id.
  const vdsOf = (id) => 5 - 10 * id - id * WIRE_RESISTANCE;
  const law = (id) => {
    const vds = vdsOf(id);
    return m.k * ((5 - id * WIRE_RESISTANCE - m.vth) * vds - (vds * vds) / 2) * (1 + m.lambda * vds) - id;
  };
  const id = bisect(law, 0.4, 0.5);
  near(on.parts.Q1.currents.D, id, 1e-6, 'Id');
  near(on.parts.Q1.vds, vdsOf(id), 1e-5, 'Vds');
  assert.equal(on.parts.Q1.region, 'linear');
  near(on.parts.Q1.vds / on.parts.Q1.currents.D, 1 / (m.k * (5 - m.vth)), 0.002, 'Rds(on) ≈ 1 / (k·Vov) = 25 mΩ');
  const off = run(mosfetSwitch('IRLZ44N', false));
  assert.equal(off.parts.Q1.region, 'off');
  assert.ok(off.parts.Q1.currents.D < 1e-6);
  // IRF520 at Vgs = 5 V barely turns on: saturation current k/2·(5 − 3)² ≈ 1 A limits nothing
  // here, but its on-resistance is about 1 Ω, so it heats more than the IRLZ44N.
  const weak = run(mosfetSwitch('IRF520', true));
  assert.ok(weak.parts.Q1.vds > 20 * on.parts.Q1.vds);
});

test('a MOSFET gate connected to nothing is reported as floating', () => {
  const circuit = mosfetSwitch('IRLZ44N', true);
  circuit.parts = circuit.parts.filter((p) => p.id !== 'W1');
  const r = run(circuit);
  assert.ok(codes(r.issues).includes('SIM_FLOATING'));
  assert.equal(r.parts.Q1.pins.G, null);
});

// Common-emitter stage: base resistor from the + rail, collector resistor.
const commonEmitter = (part, rb) => ({
  supplies: supply(5),
  parts: [
    { id: 'RB', type: 'resistor', value: rb, pins: ['T+30', 'j31'] },
    { id: 'RC', type: 'resistor', value: '1k', pins: ['T+33', 'j32'] },
    { id: 'Q1', type: 'bjt', part, pins: { E: 'h30', B: 'h31', C: 'h32' } },
    { id: 'W1', type: 'wire', color: 'black', pins: ['j30', 'T-29'] },
  ],
});

test('BJT in its active region matches the Ebers–Moll equations solved separately', () => {
  const r = run(commonEmitter('2N3904', '470k'));
  const m = BJTS['2N3904'];
  const vbe = bisect((v) => (5 - v) / 470e3 - (m.is / m.bf) * Math.expm1(v / VT), 0.3, 0.9);
  near(r.parts.Q1.vbe, vbe, 2e-3, 'Vbe');
  near(r.parts.Q1.beta, m.bf, 1, 'beta in the active region');
  assert.equal(r.parts.Q1.region, 'active');
  near(r.parts.Q1.vce, 5 - r.parts.Q1.currents.C * 1000, 1e-3, 'collector loop');
  const sat = run(commonEmitter('2N3904', '10k'));
  assert.equal(sat.parts.Q1.region, 'saturation');
  assert.ok(sat.parts.Q1.vce < 0.3);
});

test('PNP transistor mirrors the NPN one', () => {
  const circuit = {
    supplies: supply(5),
    parts: [
      { id: 'RB', type: 'resistor', value: '470k', pins: ['T-30', 'j31'] },
      { id: 'RC', type: 'resistor', value: '1k', pins: ['T-33', 'j32'] },
      { id: 'Q1', type: 'bjt', part: '2N3906', pins: { E: 'h30', B: 'h31', C: 'h32' } },
      { id: 'W1', type: 'wire', color: 'red', pins: ['j30', 'T+29'] },
    ],
  };
  const r = run(circuit);
  assert.equal(r.parts.Q1.region, 'active');
  assert.ok(r.parts.Q1.vbe < -0.5 && r.parts.Q1.currents.C < 0, 'current flows out of the collector');
  near(r.parts.Q1.beta, BJTS['2N3906'].bf, 1, 'beta');
});

test('Darlington TIP120 at the datasheet test point: gain above 1000, Vbe below 2.5 V', () => {
  // Datasheet: hFE ≥ 1000 at Ic = 0.5 A, Vce = 3 V. A 20 Ω load at 12 V gets close to that.
  const circuit = {
    supplies: supply(12),
    parts: [
      { id: 'RB', type: 'resistor', value: '47k', pins: ['T+19', 'j20'] },
      { id: 'RC', type: 'resistor', value: '20', power: '1', pins: ['T+21', 'j21'] },
      { id: 'Q1', type: 'bjt', part: 'TIP120', pins: { B: 'h20', C: 'h21', E: 'h22' } },
      { id: 'W1', type: 'wire', color: 'black', pins: ['j22', 'T-22'] },
    ],
  };
  const r = run(circuit);
  assert.equal(r.parts.Q1.region, 'active');
  assert.ok(r.parts.Q1.currents.C > 0.3 && r.parts.Q1.vce > 2, `Ic ${r.parts.Q1.currents.C}, Vce ${r.parts.Q1.vce}`);
  assert.ok(r.parts.Q1.beta > 1000, `hFE ${r.parts.Q1.beta}`);
  assert.ok(r.parts.Q1.vbe > 1.1 && r.parts.Q1.vbe < 2.5, `Vbe ${r.parts.Q1.vbe}`);
  assert.ok(codes(r.issues).includes('SIM_OVER_POWER'), 'the 20 Ω load burns several watts');
});

test('push button: the LED is on only while it is pressed', () => {
  const circuit = (pressed) => ({
    supplies: supply(5),
    parts: [
      { id: 'S1', type: 'button', pressed, pins: ['f10', 'f12', 'e10', 'e12'] },
      { id: 'W1', type: 'wire', color: 'red', pins: ['T+10', 'j10'] },
      { id: 'R1', type: 'resistor', value: '330', pins: ['a10', 'a14'] },
      { id: 'D1', type: 'led', pins: { anode: 'c14', cathode: 'c15' } },
      { id: 'W2', type: 'wire', color: 'black', pins: ['a15', 'B-15'] },
      { id: 'W3', type: 'wire', color: 'black', pins: ['T-3', 'j3'] },
      { id: 'W4', type: 'wire', color: 'black', pins: ['i3', 'B-3'] },
    ],
  });
  const on = run(circuit(true));
  const off = run(circuit(false));
  assert.ok(on.parts.D1.current > 5e-3, 'pressed: LED on');
  assert.ok(Math.abs(off.parts.D1.current) < 1e-9, 'released: no current');
});

test('RC charging follows V·(1 − e^(−t/RC)) (backward Euler, small step)', () => {
  const circuit = {
    supplies: supply(5),
    parts: [
      { id: 'R1', type: 'resistor', value: '10k', pins: ['T+5', 'j5'] },
      { id: 'C1', type: 'capacitor', value: '100u', voltage: 16, pins: { '+': 'i5', '-': 'i7' } },
      { id: 'W1', type: 'wire', color: 'black', pins: ['j7', 'T-7'] },
    ],
  };
  const r = run(circuit, { analysis: 'transient', stop: 5, step: 1e-3 });
  const tau = 10e3 * 100e-6;
  assert.equal(r.times[0], 0);
  near(r.parts.C1.voltage[0], 0, 1e-3, 'starts discharged');
  for (const t of [0.5, 1, 2, 3]) {
    const k = r.times.findIndex((x) => x >= t - 1e-9);
    near(r.parts.C1.voltage[k], 5 * (1 - Math.exp(-r.times[k] / tau)), 0.01, `V at ${t} s`);
  }
  near(r.parts.C1.current[0], 5 / 10e3, 2e-5, 'current at switch-on = V / R');
  assert.ok(r.times.length <= 401);
  const dc = simulate(circuit);
  near(dc.parts.C1.voltage, 5, 1e-3, 'DC: the capacitor ends at the supply voltage');
});

test('what the simulator cannot do is reported, not guessed', () => {
  assert.deepEqual(codes(simulate({ ...example('led-resistor.json'), supplies: undefined }).issues), ['SIM_NO_SUPPLY']);
  const withChip = { supplies: supply(5), parts: [{ id: 'U1', type: 'ic', part: 'NE555', pin1: 'e10' }] };
  assert.ok(codes(simulate(withChip).issues).includes('SIM_UNSUPPORTED'));
  const broken = {
    supplies: supply(5),
    parts: [
      { id: 'R1', type: 'resistor', value: '1k', pins: ['j5', 'j10'] },
      { id: 'R2', type: 'resistor', value: '1k', pins: ['j5', 'j15'] },
    ],
  };
  assert.deepEqual(codes(simulate(broken).issues), ['SIM_PLACEMENT_ERRORS']);
  const badSupply = { supplies: [{ id: 'V1', voltage: 5, positive: 'zz9' }], parts: [] };
  assert.deepEqual(codes(simulate(badSupply).issues), ['SIM_BAD_SUPPLY']);
});

test('results drawn on the board: a layer of their own, labelled as a model', async () => {
  const { renderCircuit, formatIssue } = await import('../src/index.js');
  const { formatSimulation } = await import('../src/sim/format.js');
  const circuit = { ...example('led-resistor.json'), supplies: supply(5) };
  const { svg } = renderCircuit(circuit, { sim: true, lang: 'es' });
  const layer = svg.match(/<g class="results">([\s\S]*?)<\/g>/)[1];
  assert.match(layer, /MODELO · simulación DC/);
  assert.match(layer, />9,81 mA</);
  assert.match(layer, />5 V</);
  assert.doesNotMatch(renderCircuit(circuit, {}).svg, /class="results"/, 'only on request');
  const text = formatSimulation(simulate(circuit), 'es', { formatIssue, netLabels: circuit.netLabels });
  assert.match(text, /un modelo, no una medición/);
  assert.match(text, /riel T\+ \(\+5 V\)\s+5 V/);
  assert.match(text, /D1\s+1,76 V\s+9,81 mA/);
  const warned = formatSimulation(simulate({ ...circuit, supplies: supply(5, { currentLimit: 0.005 }) }), 'es', { formatIssue });
  assert.match(warned, /llegó a su límite de 5 mA y pasó a corriente constante/);
});

test('the page has results by default with a source (page.results false turns them off), shown per tapped part', async () => {
  const { renderPage } = await import('../src/page.js');
  const circuit = { ...example('led-resistor.json'), supplies: supply(5), page: undefined };
  const off = renderPage({ ...circuit, page: { results: false } }, { lang: 'es' }).html;
  assert.doesNotMatch(off, /class="results"|data-results|class="lights"/);
  const html = renderPage(circuit, { lang: 'es' }).html;
  assert.doesNotMatch(html, /data-key="results"/, 'no button: always on');
  assert.match(html, /<body [^>]*data-results="on"/);
  assert.match(html, /\.results > \* \{ display: none; \}|\.results > \* \{ display: none; \}/);
  assert.match(html, /\.strips > \*, \.results > \* \{ display: none; \}/, 'every tag hidden until its part is tapped');
  let JSDOM;
  try {
    ({ JSDOM } = await import('jsdom'));
  } catch {
    return;
  }
  const dom = new JSDOM(html, { runScripts: 'outside-only' });
  dom.window.eval(html.match(/<script>([\s\S]*)<\/script>/)[1]);
  const doc = dom.window.document;
  assert.ok(doc.body.classList.contains('show-results'), 'on from the start');
  doc.querySelector('.parts > [data-part="D1"]').dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
  assert.match(doc.getElementById('dynamic').textContent, /\.results > \[data-part="D1"\]/);
  assert.match(doc.querySelector('.info').textContent, /Voltaje \(tensión\): 1,76 V/);
});

test('supplies can be set with an operation, like any circuit field', async () => {
  const { applyOps } = await import('../src/index.js');
  const { circuit, errors } = applyOps(example('led-resistor.json'), [{ op: 'circuit', supplies: supply(5), page: { results: true } }]);
  assert.deepEqual(errors, []);
  assert.ok(simulate(circuit).ok);
});

test('an inductor in a floating island does not break DC; the rest still solves (textbook divider)', () => {
  const circuit = { ...example('voltage-divider.json'), supplies: supply(9) };
  circuit.parts = [...circuit.parts, { id: 'L1', type: 'inductor', value: '100u', pins: ['h40', 'h45'] }];
  const r = run(circuit);
  near(r.nodes['16:f-j'], 4.5, 1e-4, 'middle node');
  assert.ok(r.parts.L1.floating, 'the inductor is reported floating');
  assert.ok(codes(r.issues).includes('SIM_FLOATING'));
});
