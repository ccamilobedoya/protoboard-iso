// The clocked logic chips the kit used to draw only (src/sim/devices/logic.js): the 74HC595 shift
// register (shift-register.js). Each expected value is worked out from the datasheet beside it.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { autoLayout } from './layout-generous.js';
import { simulate } from '../src/sim/index.js';
import { runCircuit } from '../src/sim/run.js';
import { review, formatIssue } from '../src/index.js';
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
  // VCC 5 V: high above 3.5 V; 3.3 V is in between and the chip keeps its zeros.
  assert.equal(pattern(five, 'U2', five.parts.U2.vcc), '00000000');
  const level = five.issues.filter((i) => i.code === 'SIM_IC_INPUT_LEVEL');
  assert.ok(level.length >= 1 && level.every((i) => i.params.part === 'U2'), JSON.stringify(five.issues));
  assert.match(formatIssue(level[0], 'en'), /does not reach its high level/);
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
  assert.match(text, /model: simulated: SRCLK shifts SER/);
  assert.match(text, /maximum current 35 mA \(QA, QB, QC, QD, QE, QF, QG, QH, QH'\) \(output\)/);
  assert.match(formatCatalogEntry(catalogEntry('74HC595', 'es'), 'es'), /modelo: se simula/);
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
