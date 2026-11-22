// The clocked logic chips the kit used to draw only (src/sim/devices/logic.js): the 74HC595 shift
// register (shift-register.js). Each expected value is worked out from the datasheet beside it.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { autoLayout } from './layout-generous.js';
import { simulate } from '../src/sim/index.js';
import { runCircuit } from '../src/sim/run.js';
import { review, formatIssue, t } from '../src/index.js';
import { formatLayout } from '../src/layout.js';
import { catalogEntry, formatCatalogEntry } from '../src/node/catalog.js';

const Q = ['QA', 'QB', 'QC', 'QD', 'QE', 'QF', 'QG', 'QH'];
const laid = new Map();
// Lay each spec out once; the sketch is put in afterwards (a different program needs no new layout).
const layoutOnce = (key, spec) => {
  if (!laid.has(key)) {
    const r = autoLayout(spec);
    assert.ok(r.circuit, `${key}: ${r.status}`);
    laid.set(key, r.circuit);
  }
  return laid.get(key);
};
const withProgram = (circuit, program, id = 'U1') => ({ ...circuit, parts: circuit.parts.map((p) => (p.id === id ? { ...p, program } : p)) });
// A pin's level from its volts against the chip's supply (the readings' `pins`).
const high = (reading, id, pin, vcc) => reading.parts[id].pins[pin] > 0.7 * vcc;
const pattern = (reading, id, vcc) => Q.map((q) => (high(reading, id, q, vcc) ? 1 : 0)).join('');

// A sketch that latches one value with shiftOut (DATA D11, CLOCK D12, LATCH D8).
const LATCH_ONCE = (order, value, extra = '') => `const int DATA = 11; const int CLOCK = 12; const int LATCH = 8;
void setup() { pinMode(DATA, OUTPUT); pinMode(CLOCK, OUTPUT); pinMode(LATCH, OUTPUT);
  digitalWrite(LATCH, LOW); ${extra || `shiftOut(DATA, CLOCK, ${order}, ${value});`} digitalWrite(LATCH, HIGH); }
void loop() { delay(100); }`;

// A UNO and a 74HC595 with no LEDs: the outputs' volts say what it latched.
const unoChip = ({ oe = 'U1.GND', clr = 'U1.5V' } = {}) => ({
  parts: [
    { id: 'U1', part: 'UNO', program: LATCH_ONCE('MSBFIRST', 0) },
    { id: 'U2', part: '74HC595' },
  ],
  nets: [['U1.5V', 'U2.VCC'], ['U1.GND', 'U2.GND'], ['U1.D11', 'U2.SER'], ['U1.D12', 'U2.SRCLK'], ['U1.D8', 'U2.RCLK'], [oe, 'U2.OE'], [clr, 'U2.SRCLR']],
});

// The same with eight red LEDs through 330 Ω on QA…QH (D1 on QA … D8 on QH).
const unoLeds = () => {
  const spec = unoChip();
  Q.forEach((q, i) => {
    spec.parts.push({ id: `R${i + 1}`, type: 'resistor', value: '330' }, { id: `D${i + 1}`, type: 'led', color: 'red' });
    spec.nets.push([`U2.${q}`, `R${i + 1}.1`], [`R${i + 1}.2`, `D${i + 1}.A`], [`D${i + 1}.K`, 'U1.GND']);
  });
  return spec;
};

test('74HC595: shiftOut MSBFIRST puts bit 7 on QH and bit 0 on QA; LSBFIRST the mirror; QH\' is the register\'s last stage', () => {
  const c = layoutOnce('uno-chip', unoChip());
  // MSBFIRST sends bit 7 first; eight SRCLK edges carry it from QA's stage to QH's: bit k ends on Q(k).
  // 0b00000011: bits 0 and 1 → QA and QB. LSBFIRST sends bit 0 first: bit k ends on Q(7 − k) → QH, QG.
  const msb = simulate(withProgram(c, LATCH_ONCE('MSBFIRST', '0b00000011')));
  assert.equal(pattern(msb, 'U2', 5), '11000000');
  const lsb = simulate(withProgram(c, LATCH_ONCE('LSBFIRST', '0b00000011')));
  assert.equal(pattern(lsb, 'U2', 5), '00000011');
  // QH' follows the register's last stage: bit 7 under MSBFIRST of 0x80, before any latch pulse too.
  const noLatch = `void setup() { pinMode(11, OUTPUT); pinMode(12, OUTPUT); pinMode(8, OUTPUT); shiftOut(11, 12, MSBFIRST, 0x80); }
void loop() { delay(100); }`;
  const r = simulate(withProgram(c, noLatch));
  assert.equal(pattern(r, 'U2', 5), '00000000', 'no RCLK edge: the outputs keep the zeros of power-up');
  assert.ok(r.parts.U2.pins["QH'"] > 4.5, `QH' high: ${r.parts.U2.pins["QH'"]}`);
  assert.equal(r.parts.U2.register, '00000001');
  // Hand-written bit banging is the same chip: 0x0F MSBFIRST by digitalWrite.
  const bang = LATCH_ONCE('', '', 'for (int k = 7; k >= 0; k--) { digitalWrite(DATA, (0x0F >> k) & 1); digitalWrite(CLOCK, HIGH); digitalWrite(CLOCK, LOW); }');
  assert.equal(pattern(simulate(withProgram(c, bang)), 'U2', 5), '11110000');
});

test('74HC595: OE high leaves the outputs open; SRCLR low clears the register whatever is shifted', () => {
  const off = simulate(withProgram(layoutOnce('uno-oe-high', unoChip({ oe: 'U1.5V' })), LATCH_ONCE('MSBFIRST', '0xFF')));
  assert.equal(off.parts.U2.latch, '11111111', 'the latches hold the value');
  assert.ok(Object.entries(off.parts.U2.outputs).filter(([n]) => n !== "QH'").every(([, o]) => o.level === null), 'QA…QH open');
  const clear = simulate(withProgram(layoutOnce('uno-clr-low', unoChip({ clr: 'U1.GND' })), LATCH_ONCE('MSBFIRST', '0xFF')));
  assert.equal(clear.parts.U2.register, '00000000');
  assert.equal(pattern(clear, 'U2', 5), '00000000');
});

test('74HC595 with eight LEDs: the latched LEDs carry (5 V − Vf) / (330 Ω + 30 Ω), the others nothing; a walking bit moves every 100 ms', () => {
  const c = layoutOnce('uno-leds', unoLeds());
  const r = simulate(withProgram(c, LATCH_ONCE('MSBFIRST', '0b10100101')));
  assert.equal(r.ok, true);
  // 0b10100101 MSBFIRST: bits 0, 2, 5, 7 → QA, QC, QF, QH → D1, D3, D6, D8.
  const lit = Q.map((_, i) => r.parts[`D${i + 1}`].current > 1e-3);
  assert.deepEqual(lit, [true, false, true, false, false, true, false, true]);
  for (const i of [1, 3, 6, 8]) {
    // KVL around the loop: the output's 30 Ω (VOH 4.32 V at 6 mA, VCC 4.5 V) and 330 Ω carry what is
    // left of the chip's supply after the LED's own drop: about (5 − 1.8) / 360 ≈ 9 mA.
    const led = r.parts[`D${i}`];
    const vcc = r.parts.U2.vcc;
    const expected = (vcc - led.voltage) / (330 + 30);
    assert.ok(Math.abs(led.current - expected) / expected < 0.03, `D${i}: ${led.current} vs ${expected}`);
    assert.ok(led.current > 5e-3 && led.current < 12e-3, `D${i}: ${led.current}`);
  }
  assert.ok(!r.issues.some((i) => i.code === 'SIM_PART_NOT_SIMULATED' || i.code === 'SIM_UNSUPPORTED'));
  // A walking bit: QA, QB, … each for 100 ms, then again.
  const walk = `int k = 0;
void setup() { pinMode(11, OUTPUT); pinMode(12, OUTPUT); pinMode(8, OUTPUT); }
void loop() { digitalWrite(8, LOW); shiftOut(11, 12, MSBFIRST, 1 << k); digitalWrite(8, HIGH); k = (k + 1) % 8; delay(100); }`;
  const run = runCircuit(withProgram(c, walk), { seconds: 1 });
  assert.equal(run.ok, true);
  const intervals = Object.fromEntries(run.outputs.map((o) => [o.id, o.intervals]));
  for (let i = 0; i < 8; i++) {
    const [first] = intervals[`D${i + 1}`];
    assert.ok(Math.abs(first[0] - i * 0.1) <= 0.015 && Math.abs(first[1] - first[0] - 0.1) <= 0.015, `D${i + 1}: ${JSON.stringify(first)}`);
  }
  assert.ok(Math.abs(intervals.D1[1][0] - 0.8) <= 0.015, `D1 again at 0.8 s: ${JSON.stringify(intervals.D1)}`);
});

test('74HC595: two chained (QH\' to the next SER, shared clocks): the first byte shifted ends in the far chip', () => {
  const spec = unoChip();
  spec.parts.push({ id: 'U3', part: '74HC595' });
  spec.nets.push(['U1.5V', 'U3.VCC', 'U3.SRCLR'], ['U1.GND', 'U3.GND', 'U3.OE'], ["U2.QH'", 'U3.SER'], ['U1.D12', 'U3.SRCLK'], ['U1.D8', 'U3.RCLK']);
  const c = layoutOnce('chain', spec);
  const r = simulate(withProgram(c, LATCH_ONCE('', '', 'shiftOut(DATA, CLOCK, MSBFIRST, 0xA5); shiftOut(DATA, CLOCK, MSBFIRST, 0x0F);')));
  // 0xA5 goes first through U2 and on into U3 by QH'; 0x0F stays in U2. MSBFIRST: bit k on Q(k).
  assert.equal(pattern(r, 'U3', 5), '10100101');
  assert.equal(pattern(r, 'U2', 5), '11110000');
});

test('74HC595 on an ESP32: on its 3.3 V it works; on 5 V its 3.3 V pins do not reach the high level, and the review says so', () => {
  const esp = (vcc) => ({
    parts: [
      { id: 'U1', part: 'ESP32-DEVKIT', program: LATCH_ONCE('MSBFIRST', 0).replace('DATA = 11', 'DATA = 23').replace('CLOCK = 12', 'CLOCK = 18').replace('LATCH = 8', 'LATCH = 5') },
      { id: 'U2', part: '74HC595' },
    ],
    nets: [[vcc, 'U2.VCC', 'U2.SRCLR'], ['U1.GND', 'U2.GND', 'U2.OE'], ['U1.D23', 'U2.SER'], ['U1.D18', 'U2.SRCLK'], ['U1.D5', 'U2.RCLK']],
  });
  const sketch = (v) => LATCH_ONCE('MSBFIRST', v).replace('DATA = 11', 'DATA = 23').replace('CLOCK = 12', 'CLOCK = 18').replace('LATCH = 8', 'LATCH = 5');
  const low = withProgram(layoutOnce('esp-3v3', esp('U1.3V3')), sketch('0b00000101'));
  const r = simulate(low);
  // VCC 3.3 V: high above 0.7 · 3.3 = 2.31 V; the pins give 3.3 V.
  assert.equal(pattern(r, 'U2', r.parts.U2.vcc), '10100000');
  const high5 = withProgram(layoutOnce('esp-5v', esp('U1.VIN')), sketch('0b00000101'));
  const five = simulate(high5);
  // VCC 5 V: 3.3 V is past where a 74HC input switches (about half the supply: NXP's typical 2.4 V at
  // 4.5 V), so the chip reads it high and latches; but it is under the guaranteed 0.7 · 5 = 3.5 V: a doubt.
  assert.equal(pattern(five, 'U2', five.parts.U2.vcc), '10100000');
  const level = five.issues.filter((i) => i.code === 'SIM_IC_INPUT_LEVEL');
  assert.ok(level.length >= 1 && level.every((i) => i.params.part === 'U2'), JSON.stringify(five.issues));
  assert.match(formatIssue(level[0], 'en'), /reads it as high here .* does not guarantee it: a 3\.3 V pin into a chip fed 5 V/);
  const doubts = review(high5).doubts.filter((d) => d.code === 'SIM_IC_INPUT_LEVEL');
  assert.ok(doubts.length >= 1, 'a doubt in the review');
});

test('74HC595: an LED straight on an output with no resistor is a hazard on the chip\'s output current', () => {
  const c = layoutOnce('no-resistor', {
    parts: [{ id: 'U1', part: 'UNO', program: LATCH_ONCE('MSBFIRST', 1) }, { id: 'U2', part: '74HC595' }, { id: 'D1', type: 'led', color: 'red' }],
    nets: [['U1.5V', 'U2.VCC', 'U2.SRCLR'], ['U1.GND', 'U2.GND', 'U2.OE', 'D1.K'], ['U1.D11', 'U2.SER'], ['U1.D12', 'U2.SRCLK'], ['U1.D8', 'U2.RCLK'], ['U2.QA', 'D1.A']],
  });
  const r = simulate(c);
  // Only the output's 30 Ω limits it: (5 − ~2.2 V) / 30 Ω is far over the 35 mA absolute maximum.
  const over = r.issues.find((i) => i.code === 'SIM_OVER_CURRENT' && i.params.part === 'U2.QA');
  assert.ok(over, JSON.stringify(r.issues.map((i) => [i.code, i.params.part])));
  assert.ok(r.parts.U2.outputs.QA.current > 0.035);
});

test('74HC595: an input left open is warned and read as low; the catalog says what the model covers', () => {
  const c = layoutOnce('open-oe', {
    parts: [{ id: 'U1', part: 'UNO', program: LATCH_ONCE('MSBFIRST', 1) }, { id: 'U2', part: '74HC595' }],
    nets: [['U1.5V', 'U2.VCC', 'U2.SRCLR'], ['U1.GND', 'U2.GND'], ['U1.D11', 'U2.SER'], ['U1.D12', 'U2.SRCLK'], ['U1.D8', 'U2.RCLK']],
  });
  const r = simulate(c);
  const open = r.issues.filter((i) => i.code === 'SIM_IC_INPUT_OPEN');
  assert.deepEqual(open.map((i) => i.params.pin), ['OE']);
  assert.match(formatIssue(open[0], 'en'), /takes it as low/);
  assert.equal(pattern(r, 'U2', 5), '10000000', 'OE taken as low: the outputs are on');
  const entry = catalogEntry('74HC595');
  assert.notEqual(entry.simulated, false);
  const text = formatCatalogEntry(entry, 'en');
  assert.doesNotMatch(text, /Not simulated/);
  assert.match(text, /\n {2}Simulated: SRCLK shifts SER/);
  assert.match(text, /maximum current 35 mA \(QA, QB, QC, QD, QE, QF, QG, QH, QH'\) \(output\)/);
  assert.match(formatCatalogEntry(catalogEntry('74HC595', 'es'), 'es'), /\n {2}Simulado: SRCLK mete SER/);
});

// The live page bundles the engine and the devices: the example's LEDs fill in the page as in a run.
async function loadPage(html) {
  let JSDOM;
  try {
    ({ JSDOM } = await import('jsdom'));
  } catch {
    return null;
  }
  const dom = new JSDOM(html, { runScripts: 'outside-only' });
  for (const svg of dom.window.document.querySelectorAll('svg')) svg.getBoundingClientRect = () => ({ left: 0, top: 0, width: 800, height: 500 });
  dom.window.eval(html.match(/<script>([\s\S]*)<\/script>/)[1]);
  return dom.window;
}

test('74HC595 in the live page: the example fills its LEDs from QA up, one every 200 ms', async (t) => {
  const { readFileSync } = await import('node:fs');
  const { renderPage } = await import('../src/page.js');
  const circuit = JSON.parse(readFileSync(new URL('../examples/uno-74hc595-fill.json', import.meta.url), 'utf8'));
  const window = await loadPage(renderPage(circuit, { lang: 'en' }).html);
  if (!window) return t.skip('jsdom not installed');
  const live = window.protoboardLive;
  const FRAME = 1000 / 60;
  const lit = () => Q.map((_, i) => ((live.reading.parts[`D${i + 1}`].brightness ?? 0) > 0.05 ? 1 : 0)).join('');
  const seen = new Set();
  for (let k = 0; k < 1700 / FRAME; k++) {
    live.tick(FRAME);
    seen.add(lit());
  }
  // The sketch latches 0, 1, 3, 7 … 255: each pattern lights the LEDs from QA (D1) up.
  for (const p of ['10000000', '11000000', '11100000', '11110000']) assert.ok(seen.has(p), `${p} in ${[...seen].join(' ')}`);
  for (const p of seen) assert.match(p, /^1*0*$/, `only fills from D1: ${p}`);
});

// ---- CD4017 (counter.js)

const COUNT = ['Q0', 'Q1', 'Q2', 'Q3', 'Q4', 'Q5', 'Q6', 'Q7', 'Q8', 'Q9'];
// The output that is high (from the pins' volts against VDD), or a list when more than one is.
const countOf = (reading, id) => {
  const vdd = reading.parts[id].vcc;
  const on = COUNT.filter((q) => reading.parts[id].pins[q] > 0.7 * vdd);
  return on.length === 1 ? on[0] : on.join('+');
};
// A button with a 10 kΩ pull-down on CLK, at 5 V; CE and MR where asked; no LEDs (the pins' volts).
const buttonCounter = ({ ce = 'T-', mr = 'T-', extra = {} } = {}) => ({
  supplies: [{ id: 'V1', kind: 'bench', voltage: 5, positive: 'T+', negative: 'T-' }],
  parts: [{ id: 'S1', type: 'button' }, { id: 'R1', type: 'resistor', value: '10k' }, { id: 'U1', part: 'CD4017' }, ...(extra.parts ?? [])],
  nets: [['T+', 'S1.1', 'U1.VDD'], ['S1.3', 'R1.1', 'U1.CLK'], ['R1.2', 'T-', 'U1.VSS'], [ce, 'U1.CE'], [mr, 'U1.MR'], ...(extra.nets ?? [])],
});
const presses = (n, every = 0.2) => ({ press: Array.from({ length: n }, (_, k) => ({ name: 'S1', at: 0.1 + k * every, duration: every / 2 })) });

test('CD4017 clocked by a button with a pull-down: each press counts one, CO is high for 0–4; CE high holds, MR high resets', () => {
  const c = layoutOnce('cd4017-button', buttonCounter());
  // Three presses: three rising edges on CLK with CE low → count 3 (the kit's button does not bounce).
  const three = runCircuit(c, { seconds: 0.8, stimuli: presses(3) });
  assert.equal(three.ok, true, JSON.stringify(three.issues));
  assert.equal(countOf(three.readings, 'U1'), 'Q3');
  assert.ok(three.readings.parts.U1.pins.CO > 4.5, 'CO high at count 3');
  // Five: count 5, CO low; ten: back at 0, CO high again (it rose once in ten clocks).
  const five = runCircuit(c, { seconds: 1.2, stimuli: presses(5) });
  assert.equal(countOf(five.readings, 'U1'), 'Q5');
  assert.ok(five.readings.parts.U1.pins.CO < 0.5, 'CO low at count 5');
  const ten = runCircuit(c, { seconds: 2.2, stimuli: presses(10) });
  assert.equal(countOf(ten.readings, 'U1'), 'Q0');
  assert.ok(ten.readings.parts.U1.pins.CO > 4.5);
  const held = runCircuit(layoutOnce('cd4017-ce-high', buttonCounter({ ce: 'T+' })), { seconds: 0.8, stimuli: presses(3) });
  assert.equal(countOf(held.readings, 'U1'), 'Q0', 'CE high: the count does not move');
  const reset = layoutOnce('cd4017-mr-high', buttonCounter({ mr: 'T+' }));
  assert.equal(countOf(simulate(reset), 'U1'), 'Q0');
  assert.equal(countOf(runCircuit(reset, { seconds: 0.8, stimuli: presses(3) }).readings, 'U1'), 'Q0', 'MR high: Q0, nothing moves');
});

test('CD4017 chaser (the example): a 555 clocks it, the five LEDs light in order, each for one clock period, Q5 on MR resets it', async () => {
  const { readFileSync } = await import('node:fs');
  const circuit = JSON.parse(readFileSync(new URL('../examples/555-cd4017-chaser.json', import.meta.url), 'utf8'));
  // 555 astable: f = 1.44 / ((R1 + 2·R2)·C) = 1.44 / (21 kΩ · 10 µF) ≈ 6.86 Hz, T ≈ 146 ms; the kit's
  // 555 runs within 4 % of it. Twelve periods: about 1.75 s.
  const run = runCircuit(circuit, { seconds: 1.9 });
  assert.equal(run.ok, true, JSON.stringify(run.issues));
  const on = Object.fromEntries(run.outputs.map((o) => [o.id, o.intervals]));
  const events = ['D1', 'D2', 'D3', 'D4', 'D5'].flatMap((id) => on[id].map(([a, b]) => ({ id, a, b })));
  events.sort((x, y) => x.a - y.a);
  const whole = events.filter((e) => e.b < 1.89);
  const period = (whole.at(-1).a - whole[0].a) / (whole.length - 1);
  assert.ok(Math.abs(period - 0.146) / 0.146 < 0.06, `period ${period}`);
  // In order 1, 2, 3, 4, 5, 1, …; each on for one period ± 10 %; one at a time (no overlap past a step).
  const ids = whole.map((e) => e.id);
  for (let k = 1; k < ids.length; k++) assert.equal(Number(ids[k].slice(1)), (Number(ids[k - 1].slice(1)) % 5) + 1, ids.join(' '));
  // D1 is on for the period minus the instant Q5 holds before MR resets it: the 0 count's own period.
  for (const e of whole.slice(1)) assert.ok(Math.abs(e.b - e.a - period) / period < 0.1, `${e.id} ${e.a}–${e.b}`);
  for (let k = 1; k < whole.length; k++) assert.ok(whole[k].a >= whole[k - 1].b - 1e-3, 'never two at once');
});

test('CD4017: an LED with no resistor takes about 3 mA at 5 V (no hazard on it); at 15 V the chip\'s output transistor is over its 100 mW', () => {
  const spec = (v) => ({
    supplies: [{ id: 'V1', kind: 'bench', voltage: v, positive: 'T+', negative: 'T-' }],
    parts: [{ id: 'U1', part: 'CD4017' }, { id: 'D1', type: 'led', color: 'red' }],
    nets: [['T+', 'U1.VDD'], ['T-', 'U1.VSS', 'U1.CE', 'U1.MR', 'U1.CLK', 'D1.K'], ['U1.Q0', 'D1.A']],
  });
  const c = layoutOnce('cd4017-led', spec(5));
  const r = simulate(c);
  const i = r.parts.D1.current;
  // The datasheet: IOH −3.2 mA typical at VO = 2.5 V, VDD = 5 V; near the rail 400 Ω. A red LED drops
  // about 1.8 V at 3 mA, so the output sits 3.2 V below the rail: the drive's tanh at 3.35 mA,
  // tanh(3.2 / (400 Ω · 3.35 mA)) · 3.35 mA ≈ 3.3 mA. Under 5 mA, not the 20 mA of a stiff source.
  const expected = 3.35e-3 * Math.tanh((r.parts.U1.vcc - r.parts.D1.voltage) / (400 * 3.35e-3));
  assert.ok(i < 5e-3 && Math.abs(i - expected) / expected < 0.02, `${i} vs ${expected}`);
  assert.ok(!r.issues.some((x) => x.params?.part === 'D1'), JSON.stringify(r.issues));
  const hot = simulate({ ...c, supplies: [{ ...c.supplies[0], voltage: 15 }] });
  assert.ok(hot.issues.some((x) => x.code === 'SIM_OVER_POWER' && x.params.part === 'U1.Q0'), JSON.stringify(hot.issues.map((x) => [x.code, x.params.part])));
});

test('CD4017 clocked by a board\'s pin: each rising edge of the sketch counts, Q3 on MR makes it count to three', () => {
  const sketch = 'void setup() { pinMode(2, OUTPUT); }\nvoid loop() { digitalWrite(2, HIGH); delay(50); digitalWrite(2, LOW); delay(50); }';
  const c = layoutOnce('cd4017-uno', {
    parts: [{ id: 'U1', part: 'UNO', program: sketch }, { id: 'U2', part: 'CD4017' }],
    nets: [['U1.5V', 'U2.VDD'], ['U1.GND', 'U2.VSS', 'U2.CE'], ['U1.D2', 'U2.CLK'], ['U2.Q3', 'U2.MR']],
  });
  // An edge every 100 ms from t = 0 (setup's first HIGH): 0.25 s → the third edge → count 3 → reset to
  // 0 at once (a step later); at 0.15 s two edges → Q2.
  assert.equal(countOf(runCircuit(c, { seconds: 0.15 }).readings, 'U2'), 'Q2');
  assert.equal(countOf(runCircuit(c, { seconds: 0.25 }).readings, 'U2'), 'Q0');
  assert.equal(countOf(runCircuit(c, { seconds: 0.35 }).readings, 'U2'), 'Q1');
  const entry = formatCatalogEntry(catalogEntry('CD4017'), 'en');
  assert.doesNotMatch(entry, /Not simulated/);
  assert.match(entry, /\n {2}Simulated: CLK rising/);
  assert.match(entry, /maximum power 100 mW \(Q0, Q1, Q2, Q3, Q4, Q5, Q6, Q7, Q8, Q9, CO\) \(output\)/);
});

test('CD4017 in the live page: the chaser\'s LEDs light one at a time, in order', async (t) => {
  const { readFileSync } = await import('node:fs');
  const { renderPage } = await import('../src/page.js');
  const circuit = JSON.parse(readFileSync(new URL('../examples/555-cd4017-chaser.json', import.meta.url), 'utf8'));
  const window = await loadPage(renderPage(circuit, { lang: 'en' }).html);
  if (!window) return t.skip('jsdom not installed');
  const live = window.protoboardLive;
  // The page slows this circuit down (its longest time constant every 2 s, sim/pace.js): frames of
  // 100 ms of wall clock until 0.62 s of simulated time, about four clock periods.
  const order = [];
  for (let k = 0; k < 2000 && live.time < 0.62; k++) {
    live.tick(100);
    const lit = [1, 2, 3, 4, 5].filter((n) => (live.reading.parts[`D${n}`].brightness ?? 0) > 0.05);
    assert.ok(lit.length <= 1, `one at a time: ${lit}`);
    if (lit.length && order.at(-1) !== lit[0]) order.push(lit[0]);
  }
  assert.ok(order.length >= 4, order.join(' '));
  for (let k = 1; k < order.length; k++) assert.equal(order[k], (order[k - 1] % 5) + 1, order.join(' '));
});

// Every IC part number the kit lists has a model of its own: a part listed and silently unsimulated is
// the defect this work was about. Each one, placed on the board with a supply, is read by its device
// (no `unsupported` reading, no SIM_UNSUPPORTED) and its catalog entry does not say "not simulated".
const { PART_NUMBERS } = await import('../src/parts/db.js');
for (const [name, entry] of Object.entries(PART_NUMBERS).filter(([n, e]) => e.type === 'ic' && !n.startsWith('TEST-'))) {
  test(`every IC is simulated: ${name}`, () => {
    const r = simulate({ supplies: [{ id: 'V1', voltage: 5 }], parts: [{ id: 'U1', type: 'ic', part: name, pin1: 'e10' }] });
    assert.ok(r.parts?.U1 && !r.parts.U1.unsupported, `${name}: ${JSON.stringify(r.parts?.U1 ?? r.issues)}`);
    assert.ok(!r.issues.some((i) => i.code === 'SIM_UNSUPPORTED'), name);
    assert.doesNotMatch(formatCatalogEntry(catalogEntry(name), 'en'), /not simulated/i, `${entry.model?.function}`);
  });
}

// A slow chaser: the review's run must follow it long enough to see every LED come on (C11, second
// round). 555 astable 10 kΩ, 47 kΩ, 47 µF: f = 1.44 / ((10 kΩ + 2 · 47 kΩ) · 47 µF) ≈ 0.29 Hz, a period
// of about 3.4 s; the five LEDs need four clock edges, over 13 s, far past the plain 2 s.
const slowChaser = (c1) => {
  const spec = JSON.parse(JSON.stringify(SLOW_BASE));
  spec.parts = spec.parts.map((p) => (p.id === 'R1' ? { ...p, value: '10k' } : p.id === 'R2' ? { ...p, value: '47k' } : p.id === 'C1' ? { ...p, value: c1 } : p));
  return spec;
};
const { readFileSync: readSpec } = await import('node:fs');
const SLOW_BASE = JSON.parse(readSpec(new URL('../examples/layout/555-cd4017-chaser.json', import.meta.url), 'utf8'));

test('a 555 at 0.3 Hz clocking a CD4017 with five LEDs: layout ends DONE, no LED is called never on', () => {
  const r = autoLayout(slowChaser('47u'));
  assert.equal(r.status, 'done', JSON.stringify(r.review.doubts));
  assert.ok(!r.review.doubts.some((d) => d.code === 'SIM_OUTPUT_NEVER_ON'));
});

test('a 555 too slow for the review\'s run (470 µF: a period of about 34 s): no never-on doubt, the Checked line says the run was too short', () => {
  // τ of the timing capacitor ≈ 470 µF · 57 kΩ ≈ 27 s: two periods are far over the run's 30 s bound.
  const r = autoLayout(slowChaser('470u'));
  assert.ok(!r.review.doubts.some((d) => d.code === 'SIM_OUTPUT_NEVER_ON'), JSON.stringify(r.review.doubts));
  assert.ok(r.review.checked.notChecked.includes('short-run'), JSON.stringify(r.review.checked));
  assert.match(formatLayout(r, 'en', { t, formatIssue }), /^Checked: .*whether every output comes on \(the run was too short to tell\)/m);
});

// SUPPLY_PINS_UNWIRED (C12) reads a chip's supply pins by name: VCC/GND on the 74HC595, VDD/VSS on the
// CD4017. Left open, each is said; the examples, wired, are not.
test('a 74HC595 or a CD4017 with a supply pin left open gets SUPPLY_PINS_UNWIRED; the logic examples do not', async () => {
  const { compile } = await import('../src/sim/compile.js');
  const { checkSupplyPins } = await import('../src/circuit/checks.js');
  const { readFileSync } = await import('node:fs');
  for (const name of ['uno-74hc595-fill', '555-cd4017-chaser']) {
    const c = JSON.parse(readFileSync(new URL(`../examples/${name}.json`, import.meta.url), 'utf8'));
    assert.deepEqual(checkSupplyPins(compile(c).program), [], name);
  }
  const register = layoutOnce('595-no-vcc', {
    supplies: [{ id: 'V1', kind: 'bench', voltage: 5, positive: 'T+', negative: 'T-' }],
    parts: [{ id: 'U1', part: '74HC595' }, { id: 'R1', type: 'resistor', value: '330' }, { id: 'D1', type: 'led', color: 'red' }],
    nets: [['T-', 'U1.GND', 'U1.OE', 'U1.SER', 'U1.SRCLK', 'U1.RCLK', 'D1.K'], ['T+', 'U1.SRCLR'], ['U1.QA', 'R1.1'], ['R1.2', 'D1.A']],
  });
  const counter = layoutOnce('4017-no-vdd', {
    supplies: [{ id: 'V1', kind: 'bench', voltage: 5, positive: 'T+', negative: 'T-' }],
    parts: [{ id: 'U1', part: 'CD4017' }, { id: 'R1', type: 'resistor', value: '1k' }, { id: 'D1', type: 'led', color: 'red' }],
    nets: [['T-', 'U1.VSS', 'U1.CE', 'U1.MR', 'U1.CLK', 'D1.K'], ['U1.Q0', 'R1.1'], ['R1.2', 'D1.A']],
  });
  for (const [c, open] of [[register, 'VCC'], [counter, 'VDD']]) {
    const found = review(c).doubts.filter((d) => d.code === 'SUPPLY_PINS_UNWIRED');
    assert.equal(found.length, 1, JSON.stringify(review(c).doubts));
    assert.equal(found[0].params.open, open);
  }
});

// The supply: damage over the absolute maximum, a softer note between the recommended range's top and it
// (NXP 74HC595: 2–6 V recommended, 7 V absolute; TI CD4017B: 3–18 V recommended, 20 V absolute).
test('logic chips: the damage warning is over the absolute maximum; past the recommended range a note', () => {
  const chip = (part, v) => simulate({ supplies: [{ id: 'V1', voltage: v, positive: 'T+', negative: 'T-' }], parts: [{ id: 'U1', type: 'ic', part, pin1: 'e10' }, { id: 'W1', type: 'wire', pins: ['T+10', 'j10'] }, { id: 'W2', type: 'wire', pins: ['T-17', 'a17'] }] });
  const supply = (r) => r.issues.filter((i) => i.code === 'SIM_IC_SUPPLY' || i.code === 'SIM_IC_SUPPLY_RANGE').map((i) => i.code);
  for (const [part, normal, past, damage] of [['CD4017', 18, 19, 21], ['74HC595', 6, 6.5, 7.5]]) {
    assert.deepEqual(supply(chip(part, normal)), [], `${part} at ${normal} V`);
    assert.deepEqual(supply(chip(part, past)), ['SIM_IC_SUPPLY_RANGE'], `${part} at ${past} V`);
    assert.deepEqual(supply(chip(part, damage)), ['SIM_IC_SUPPLY'], `${part} at ${damage} V`);
  }
});

// An input switches where the chip switches (about half its supply), and a level the datasheet does not
// guarantee is a doubt: a CD4017 at 5 V counting to seven with a white LED straight on Q7 (Q7 sits near
// 2.9 V under that load: over half of 5 V, under the guaranteed 0.7 · 5 = 3.5 V) resets, and says so.
test('CD4017: Q7 on MR with a white LED on it resets at about 2.9 V, and the review says the level is not guaranteed', () => {
  const spec = JSON.parse(JSON.stringify(SLOW_BASE));
  spec.supplies[0].voltage = 5;
  spec.nets = spec.nets.filter((n) => !n.includes('U2.MR')).concat([['U2.Q7', 'U2.MR', 'D9.A'], ['D9.K', 'T-']]);
  spec.parts.push({ id: 'D9', type: 'led', color: 'white' });
  const r = autoLayout(spec);
  const level = r.review.doubts.find((d) => d.code === 'SIM_IC_INPUT_LEVEL' && d.params.pin === 'MR');
  assert.ok(level, JSON.stringify(r.review.doubts));
  assert.match(formatIssue(level, 'en'), /reads it as high here .*an output loaded by an LED/);
  const run = runCircuit(r.circuit, { seconds: 2.2 });
  const q7 = run.outputs.find((o) => o.id === 'D9').intervals;
  // It resets: Q7 is high for one time step only, and the chase starts again at D1.
  assert.ok(q7.length >= 1 && q7.every(([a, b]) => b - a < 0.01), JSON.stringify(q7));
});
