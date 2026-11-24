// Acceptance: the six chips the kit used to draw only (74HC595, CD4017, ULN2003, ULN2803, PC817,
// LM386) are simulated. Each test is one item (G1-G20), driven through the CLI as a
// child process (always with a timeout, so a hang fails the test instead of blocking it).
//
// Expected values come from the datasheets and the LED model the kit uses, worked out in a comment
// beside each assertion. The kit's red LED (src/sim/models.js, `catalog led`): Vf 1.9 V at 20 mA,
// n = 2, series 10 ohm, so Vf(I) = 1.7 V + 0.0517 V * ln(I / 20 mA) + I * 10 ohm:
//   Vf(10 mA) = 1.76 V, Vf(5 mA) = 1.68 V, Vf(4 mA) = 1.66 V (the kit's blink run reads 1.74 V at 8.75 mA).
// A UNO pin is 5 V behind 40 ohm, an ESP32 pin 3.3 V behind 17 ohm (`catalog UNO`, `catalog ESP32-DEVKIT`).
//
// Each circuit is laid out once per file (a lazy helper) and shared by the tests that read it. Names
// the items leave open (the issue code for "inputs do not reach a high level", for an output's
// current) are matched by the part's id and the kind (a hazard, a doubt), never by the code.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tempDir } from '../scripts/tmp.js';
import { LIMITS } from '../src/limits.js';
import { RUN_BUDGET_ARGS } from './run-generous.js';

const root = new URL('../', import.meta.url).pathname;
const bin = join(root, 'bin/protoboard-iso.js');
const LAYOUT_MS = (LIMITS.layoutSeconds + 60) * 1000;

// The CLI as a child process with a wall-clock timeout (a hang is a failure, not a block).
function cli(args, timeout = 120_000, { cwd = root } = {}) {
  const r = spawnSync(process.execPath, [bin, ...args], { cwd, encoding: 'utf8', maxBuffer: 1 << 28, timeout, killSignal: 'SIGKILL' });
  const out = { ...r, stdout: r.stdout ?? '', stderr: r.stderr ?? '', timedOut: r.error?.code === 'ETIMEDOUT' };
  assert.ok(!out.timedOut, `timed out after ${timeout} ms: ${args.slice(0, 3).join(' ')}`);
  return out;
}
const lastLine = (r) => r.stdout.trim().split('\n').at(-1);

// ---- laying circuits out: once each, lazily, and the spec itself must be valid today
const laid = new Map();
function circuit(key, makeSpec) {
  if (!laid.has(key)) {
    const dir = tempDir(`chips-${key}-`);
    const file = join(dir, 'spec.json');
    writeFileSync(file, JSON.stringify(makeSpec()));
    const target = join(dir, 'c');
    const r = cli(['layout', target, file, '--budget', String(LIMITS.layoutSeconds)], LAYOUT_MS);
    // A spec that ends FIX_SPEC or CHANGES is a mistake of the test, never an expected failure.
    assert.match(lastLine(r), /^STATUS: (WARNINGS|DONE)\b/, `spec ${key} must lay out: ${lastLine(r)}\n${r.stdout.slice(-1500)}${r.stderr}`);
    laid.set(key, { target, layoutOut: r.stdout });
  }
  return laid.get(key);
}
const parsed = (r, what) => {
  try { return JSON.parse(r.stdout); } catch { return assert.fail(`${what}: not JSON (exit ${r.status}): ${r.stdout.slice(0, 300)}${r.stderr.slice(0, 300)}`); }
};
// simulate --run <s> --json, with the largest machine-time budget (a busy machine never cuts the run; test/run-generous.js) (readings are those at the end of the run). A board's sketch that does not even
// run is a mistake of the test, not an expected failure: it is checked here.
const run = (c, seconds, { press = [] } = {}) => {
  const r = parsed(cli(['simulate', c.target, '--run', String(seconds), ...RUN_BUDGET_ARGS, ...press.flatMap((p) => ['--press', p]), '--json']), 'simulate --run');
  for (const [id, p] of Object.entries(r.readings?.parts ?? {})) if (p.program) assert.equal(p.program.error, null, `the sketch of ${id} must run: ${JSON.stringify(p.program)}`);
  return r;
};
// simulate --json: the DC point
const dc = (c) => parsed(cli(['simulate', c.target, '--json']), 'simulate');
// simulate --transient <s> --start dc --json
const transient = (c, stop) => parsed(cli(['simulate', c.target, '--transient', String(stop), '--start', 'dc', '--json']), 'simulate --transient');
const review = (c) => parsed(cli(['review', c.target, '--json']), 'review');

// ---- reading the answers
const output = (r, id) => r.outputs.find((o) => o.id === id) ?? assert.fail(`no output ${id}; there are ${r.outputs.map((o) => o.id).join(', ')}`);
// An output is on for the whole of [a, b] / on at some moment of [a, b] (intervals are in seconds).
const coversWindow = (o, a, b) => o.intervals.some(([s, e]) => s <= a && e >= b);
const touchesWindow = (o, a, b) => o.intervals.some(([s, e]) => s < b && e > a);
const partOf = (readings, id) => readings.parts[id] ?? assert.fail(`no part ${id} in the readings`);
const near = (value, expected, tolerance, what) => assert.ok(Math.abs(value - expected) <= tolerance, `${what}: ${value} is not ${expected} +- ${tolerance}`);
const mA = (a) => Math.abs(a) * 1000;
// Notes that only say "this chip is drawn, not simulated" (and what follows from it: its pins floating, its
// outputs never on) are not findings about what the chip does or what it is given.
const NOT_THE_MODEL = /NOT_SIMULATED|NEVER_ON|FLOATING|UNSUPPORTED|SEPARATE_CIRCUIT|NO_DC/;
const about = (rev, id, lists = ['hazards', 'doubts']) => lists.flatMap((l) => rev[l]).filter((x) => (x.parts ?? []).includes(id) && !NOT_THE_MODEL.test(x.code));
const codes = (rev) => [...rev.hazards, ...rev.doubts, ...rev.blocking, ...rev.advisory].map((x) => x.code);

// ---- building specs
const QA = ['QA', 'QB', 'QC', 'QD', 'QE', 'QF', 'QG', 'QH'];
// An LED fed by a pin through a resistor to ground: R<n>, D<n>.
function ledOn(parts, nets, n, pin, { res = '330', ground = 'T-' } = {}) {
  parts.push({ id: `R${n}`, type: 'resistor', value: res }, { id: `D${n}`, type: 'led', color: 'red' });
  nets.push([pin, `R${n}.1`], [`R${n}.2`, `D${n}.A`], [`D${n}.K`, ground]);
}
// An LED that lights when the pin is LOW: supply, resistor, LED, pin.
function ledSink(parts, nets, n, pin, { res = '330', supply = 'T+' } = {}) {
  parts.push({ id: `R${n}`, type: 'resistor', value: res }, { id: `D${n}`, type: 'led', color: 'red' });
  nets.push([supply, `R${n}.1`], [`R${n}.2`, `D${n}.A`], [`D${n}.K`, pin]);
}
const bench = (voltage, currentLimit = 0.5) => ({ id: 'V1', kind: 'bench', voltage, currentLimit, positive: 'T+', negative: 'T-' });

// The usual Arduino pattern: latch low, shiftOut, latch high (the rising edge of RCLK is the latch).
const shiftSketch = ({ d, c, l }, steps, tail = 'void loop(){delay(100);}') =>
  `void setup(){pinMode(${d},OUTPUT);pinMode(${c},OUTPUT);pinMode(${l},OUTPUT);${steps}}\n${tail}`;
const latchWrite = ({ d, c, l }, order, value) => `digitalWrite(${l},LOW);shiftOut(${d},${c},${order},${value});digitalWrite(${l},HIGH);`;

const UNO_PINS = { d: 2, c: 3, l: 4, board: 'UNO', names: { d: 'D2', c: 'D3', l: 'D4' } };
// The ESP32 family board used is the small one (ESP32-C3 SuperMini, 3.3 V pins behind 17 ohm): the DevKit's width with sixteen
// LED parts around it ends layout in CHANGES (a drawing finding: the chip is 44 % visible in the back view), which is not what is tested.
const ESP_PINS = { d: 4, c: 3, l: 2, board: 'ESP32-C3-SUPERMINI', names: { d: 'GPIO4', c: 'GPIO3', l: 'GPIO2' } };

// One or two 74HC595 on a board. OE and SRCLR are tied as asked; the LEDs are on QA..QH of each chip.
function hc595Spec({ pins = UNO_PINS, vcc = 5, oe = 'gnd', srclr = 'vcc', program, chips = 1, outs = [0, 1, 2, 3, 4, 5, 6, 7], qhPrimeLed = false, sinkLedOnQHPrime = false, clearance }) {
  const parts = [{ id: 'U1', part: pins.board, program }];
  const nets = [['U1.GND', 'T-']];
  nets.push([`U1.${pins.names.d}`, 'IC1.SER'], [`U1.${pins.names.c}`, 'IC1.SRCLK'], [`U1.${pins.names.l}`, 'IC1.RCLK']);
  for (let k = 1; k <= chips; k++) {
    parts.push({ id: `IC${k}`, type: 'ic', part: '74HC595' });
    nets.push([`IC${k}.VCC`, 'T+'], [`IC${k}.GND`, 'T-'], [`IC${k}.OE`, oe === 'gnd' ? 'T-' : 'T+'], [`IC${k}.SRCLR`, srclr === 'vcc' ? 'T+' : 'T-']);
    for (const i of outs) ledOn(parts, nets, (k - 1) * 8 + i + 1, `IC${k}.${QA[i]}`);
  }
  if (chips === 2) nets.push(['IC1.QH\'', 'IC2.SER'], ['IC1.SRCLK', 'IC2.SRCLK'], ['IC1.RCLK', 'IC2.RCLK']);
  const extra = chips * 8 + 1;
  if (qhPrimeLed) ledOn(parts, nets, extra, 'IC1.QH\'');
  if (sinkLedOnQHPrime) ledSink(parts, nets, extra, 'IC1.QH\'');
  return { parts, nets, supplies: [bench(vcc)], ...(clearance ? { clearance } : {}) };
}

// ============================================================================================
// 74HC595
// ============================================================================================

// 74HC595 bit order (datasheet, function table): on each rising edge of SRCLK the register shifts one place
// towards QH and SER enters at QA's stage. The first bit shifted in has moved one place per later clock,
// so after eight clocks it sits at QH and the last one at QA. shiftOut(..., MSBFIRST, v) sends bit 7 first:
//   0b10100101 = b7..b0 = 1,0,1,0,0,1,0,1  ->  QH = b7 = 1, QG = b6 = 0, QF = b5 = 1, QE = b4 = 0,
//                                               QD = b3 = 0, QC = b2 = 1, QB = b1 = 0, QA = b0 = 1
//   lit: QA, QC, QF, QH  (LEDs D1, D3, D6, D8 when D1 is on QA).
// With LSBFIRST bit 0 goes first and ends at QH: QA = b7, ..., QH = b0. 0b10100101 is a palindrome (the
// reversed byte is the same byte), so it cannot tell the orders apart: G1b uses 0b10110000 for that.
//   0b10110000, MSBFIRST: QA = b0 = 0, QB = 0, QC = 0, QD = 0, QE = b4 = 1, QF = b5 = 1, QG = b6 = 0, QH = b7 = 1
//                         lit: QE, QF, QH  (D5, D6, D8)
//   0b10110000, LSBFIRST: QA = b7 = 1, QB = b6 = 0, QC = b5 = 1, QD = b4 = 1, QE..QH = b3..b0 = 0
//                         lit: QA, QC, QD  (D1, D3, D4)
const PALINDROME_ON = [1, 3, 6, 8]; // D numbers lit by 0xA5, either order

const g1Circuit = () => circuit('g1', () => hc595Spec({ program: shiftSketch(UNO_PINS, latchWrite(UNO_PINS, 'MSBFIRST', '0b10100101')) }));

test('G1: shiftOut(MSBFIRST, 0b10100101) then the latch: QA, QC, QF, QH on, the other four off, 5 to 12 mA each', () => {
  const c = g1Circuit();
  const r = run(c, 0.5);
  for (let n = 1; n <= 8; n++) {
    const d = output(r, `D${n}`);
    if (PALINDROME_ON.includes(n)) assert.ok(coversWindow(d, 0.05, 0.5), `D${n} (${QA[n - 1]}) should be on after the latch: ${JSON.stringify(d.intervals)}`);
    else assert.ok(!touchesWindow(d, 0, 0.5), `D${n} (${QA[n - 1]}) should be off: ${JSON.stringify(d.intervals)}`);
  }
  // Current of a lit LED: VCC 5 V, red LED 1.76 V at 10 mA, 330 ohm, the output's resistance (datasheet
  // VOH(min) 3.98 V at 6 mA from 4.5 V: 87 ohm at most; VOL(max) 0.26 V at 6 mA: 43 ohm):
  //   I = (5 - 1.76) / (330 + 87) = 7.8 mA  ...  (5 - 1.76) / (330 + 43) = 8.7 mA  ...  with no output resistance 9.8 mA.
  // So 5 to 12 mA, the item's bounds.
  for (const n of PALINDROME_ON) {
    const i = mA(partOf(r.readings, `D${n}`).current);
    assert.ok(i >= 5 && i <= 12, `D${n} carries ${i} mA, expected 5 to 12 (hand figure 7.8 to 9.8 mA)`);
  }
});

test('G1b (extra): LSBFIRST is the mirror of MSBFIRST, on a byte that is not a palindrome (0b10110000)', () => {
  // Phase A at t = 0: MSBFIRST -> D5, D6, D8. Phase B at t = 0.3 s: LSBFIRST -> D1, D3, D4. Work-through above.
  const steps = `${latchWrite(UNO_PINS, 'MSBFIRST', '0b10110000')}delay(300);${latchWrite(UNO_PINS, 'LSBFIRST', '0b10110000')}`;
  const c = circuit('g1b', () => hc595Spec({ program: shiftSketch(UNO_PINS, steps) }));
  const r = run(c, 0.6);
  const A = [5, 6, 8], B = [1, 3, 4];
  for (let n = 1; n <= 8; n++) {
    const d = output(r, `D${n}`);
    if (A.includes(n)) assert.ok(coversWindow(d, 0.02, 0.28), `phase A (MSBFIRST): D${n} on ${JSON.stringify(d.intervals)}`);
    else assert.ok(!touchesWindow(d, 0.02, 0.28), `phase A (MSBFIRST): D${n} off ${JSON.stringify(d.intervals)}`);
    if (B.includes(n)) assert.ok(coversWindow(d, 0.33, 0.58), `phase B (LSBFIRST): D${n} on ${JSON.stringify(d.intervals)}`);
    else assert.ok(!touchesWindow(d, 0.33, 0.58), `phase B (LSBFIRST): D${n} off ${JSON.stringify(d.intervals)}`);
  }
});

test('G1c (extra): hand-written bit banging gives the same result as shiftOut', () => {
  // The same 0b10100101, MSB first, with a loop of digitalWrite: QA, QC, QF, QH.
  const sketch = 'void setup(){pinMode(2,OUTPUT);pinMode(3,OUTPUT);pinMode(4,OUTPUT);digitalWrite(4,LOW);int v=165;for(int i=7;i>=0;i--){digitalWrite(2,(v>>i)&1);digitalWrite(3,HIGH);digitalWrite(3,LOW);}digitalWrite(4,HIGH);}\nvoid loop(){delay(100);}';
  const c = circuit('g1c', () => hc595Spec({ program: sketch }));
  const r = run(c, 0.5);
  for (let n = 1; n <= 8; n++) {
    const d = output(r, `D${n}`);
    if (PALINDROME_ON.includes(n)) assert.ok(coversWindow(d, 0.05, 0.5), `D${n} on ${JSON.stringify(d.intervals)}`);
    else assert.ok(!touchesWindow(d, 0, 0.5), `D${n} off ${JSON.stringify(d.intervals)}`);
  }
});

test('G2a: OE tied to 5 V: no output LED lit (the outputs are open), while QH\' (not three-state) shows the register', () => {
  // QH' follows the last stage of the register whatever OE says: after shiftOut(MSBFIRST, 0xA5) the stage
  // QH holds b7 = 1, so the LED on QH' is on, and QA..QH are in high impedance: their LEDs are off.
  const c = circuit('g2a', () => hc595Spec({ oe: 'vcc', qhPrimeLed: true, program: shiftSketch(UNO_PINS, latchWrite(UNO_PINS, 'MSBFIRST', '0b10100101')) }));
  const r = run(c, 0.5);
  assert.ok(coversWindow(output(r, 'D9'), 0.05, 0.5), `the chip must be running (QH' is on): ${JSON.stringify(output(r, 'D9').intervals)}`);
  for (let n = 1; n <= 8; n++) assert.ok(!touchesWindow(output(r, `D${n}`), 0, 0.5), `D${n} must be off with OE high`);
});

test('G2b: SRCLR tied to GND: nothing is ever shifted in, so every output is low after any shifting', () => {
  // A LED from 5 V through 330 ohm to QH' lights when QH' is LOW (it sinks). With SRCLR held low the register
  // is cleared at all times (QH' follows its last stage: 0) and RCLK copies zeros to the latches: D9 is on and D1..D8 (to GND) are off.
  const c = circuit('g2b', () => hc595Spec({ srclr: 'gnd', sinkLedOnQHPrime: true, program: shiftSketch(UNO_PINS, latchWrite(UNO_PINS, 'MSBFIRST', '0b10100101')) }));
  const r = run(c, 0.5);
  assert.ok(coversWindow(output(r, 'D9'), 0.05, 0.5), `QH' must be driven low (the sink LED on): ${JSON.stringify(output(r, 'D9').intervals)}`);
  for (let n = 1; n <= 8; n++) assert.ok(!touchesWindow(output(r, `D${n}`), 0, 0.5), `D${n} must be off with SRCLR low`);
});

// The walking bit of G3 (also G6's circuit: it lights every LED at some moment).
const WALK_SKETCH = 'void setup(){pinMode(2,OUTPUT);pinMode(3,OUTPUT);pinMode(4,OUTPUT);}\nvoid loop(){for(int i=0;i<8;i++){digitalWrite(4,LOW);shiftOut(2,3,MSBFIRST,1<<i);digitalWrite(4,HIGH);delay(100);}}';
const g3Circuit = () => circuit('g3', () => hc595Spec({ program: WALK_SKETCH }));

test('G3: a walking bit, latched every 100 ms: each LED on for 100 ms +- 15 ms, in order, then it wraps', () => {
  // shiftOut(MSBFIRST, 1 << i): bit i ends at output i (QA = bit 0), so step i lights D(i+1) from about
  // i * 100 ms; the loop runs eight steps of delay(100) = 800 ms, so at 800 ms D1 comes on again.
  const c = g3Circuit();
  const r = run(c, 1);
  for (let i = 0; i < 8; i++) {
    const iv = output(r, `D${i + 1}`).intervals;
    assert.ok(iv.length >= 1, `D${i + 1} never comes on`);
    near(iv[0][0], i * 0.1, 0.015, `D${i + 1} starts at step ${i}`);
    near(iv[0][1] - iv[0][0], 0.1, 0.015, `D${i + 1} on for 100 ms`);
  }
  // Wrapping: D1 again at 800 ms, D2 at 900 ms.
  const d1 = output(r, 'D1').intervals, d2 = output(r, 'D2').intervals;
  assert.ok(d1.length >= 2, 'D1 comes on a second time after the wrap');
  near(d1[1][0], 0.8, 0.015, 'D1 second start');
  near(d1[1][1] - d1[1][0], 0.1, 0.015, 'D1 second duration');
  assert.ok(d2.length >= 2, 'D2 comes on a second time after the wrap');
  near(d2[1][0], 0.9, 0.015, 'D2 second start');
  // Never two LEDs at once: the on-intervals of all eight do not overlap by more than one step (1 ms).
  const all = [];
  for (let i = 0; i < 8; i++) for (const [s, e] of output(r, `D${i + 1}`).intervals) all.push([s, e]);
  all.sort((a, b) => a[0] - b[0]);
  for (let k = 1; k < all.length; k++) assert.ok(all[k][0] >= all[k - 1][1] - 0.0011, `two LEDs on together: ${JSON.stringify(all[k - 1])} and ${JSON.stringify(all[k])}`);
});

test('G4: two 74HC595 chained (QH\' to SER, shared clocks), shiftOut 0xA5 then 0x0F: 0xA5 ends in the far chip, 0x0F in the near one', () => {
  // The first byte shifted (0xA5) has been pushed on by the second one: after 16 clocks it sits in the far
  // chip (IC2, fed by IC1's QH'), the second byte (0x0F) in the near chip (IC1, fed by the board).
  // Sixteen LED parts make layout end in CHANGES (a drawing finding), so each chip carries three LEDs: QA, QB, QH.
  //   IC1 = 0x0F, MSBFIRST: QA..QD = b0..b3 = 1, QE..QH = b4..b7 = 0  -> QA on, QB on, QH off   (D1, D2 on; D8 off)
  //   IC2 = 0xA5: QA = 1, QB = 0, QH = 1 (QA, QC, QF, QH lit)         -> QA on, QB off, QH on   (D9, D16 on; D10 off)
  // A chip that got the other byte would show it: swapped, IC1's QB would be off and IC2's QB on.
  const steps = `digitalWrite(4,LOW);shiftOut(2,3,MSBFIRST,0xA5);shiftOut(2,3,MSBFIRST,0x0F);digitalWrite(4,HIGH);`;
  const c = circuit('g4', () => hc595Spec({ chips: 2, clearance: 3, outs: [0, 1, 7], program: shiftSketch(UNO_PINS, steps) }));
  const r = run(c, 0.5);
  const on = new Set([1, 2, 9, 16]);
  for (const n of [1, 2, 8, 9, 10, 16]) {
    const d = output(r, `D${n}`);
    if (on.has(n)) assert.ok(coversWindow(d, 0.05, 0.5), `D${n} should be on ${JSON.stringify(d.intervals)}`);
    else assert.ok(!touchesWindow(d, 0, 0.5), `D${n} should be off ${JSON.stringify(d.intervals)}`);
  }
});

// On the small ESP32 board only five outputs carry a LED (QA, QB, QC, QD, QH): sixteen LED parts around a board make layout end in
// CHANGES (a drawing finding), which is not what is tested. 0b10100101 lights QA, QC and QH; QB and QD stay off.
const ESP_OUTS = [0, 1, 2, 3, 7];
test('G5a: the same circuit on an ESP32 at 3.3 V (chip on 3.3 V): the same LEDs, with the lower current of 3.3 V', () => {
  // Levels: high above 0.7 * 3.3 = 2.31 V, the ESP32 pin gives 3.3 V: a high level. The LED current at 3.3 V:
  // Vf(3.8 mA) = 1.66 V, chip output about 43 to 150 ohm (the datasheet's resistance grows as VCC falls):
  //   I = (3.3 - 1.66) / (330 + 43) = 4.4 mA ... (3.3 - 1.66) / (330 + 150) = 3.4 mA. Bounds 2.5 to 6 mA.
  const c = circuit('g5a', () => hc595Spec({ pins: ESP_PINS, vcc: 3.3, outs: ESP_OUTS, program: shiftSketch(ESP_PINS, latchWrite(ESP_PINS, 'MSBFIRST', '0b10100101')) }));
  const r = run(c, 0.5);
  for (const n of [1, 2, 3, 4, 8]) {
    const d = output(r, `D${n}`);
    if (PALINDROME_ON.includes(n)) assert.ok(coversWindow(d, 0.05, 0.5), `D${n} should be on ${JSON.stringify(d.intervals)}`);
    else assert.ok(!touchesWindow(d, 0, 0.5), `D${n} should be off ${JSON.stringify(d.intervals)}`);
  }
  for (const n of [1, 3, 8]) {
    const i = mA(partOf(r.readings, `D${n}`).current);
    assert.ok(i >= 2.5 && i <= 6, `D${n} carries ${i} mA, expected 2.5 to 6 mA at 3.3 V`);
  }
});

test('G5b: a 74HC595 on 5 V driven by 3.3 V pins: the review warns about the chip\'s inputs (3.3 V is under 0.7 * 5 = 3.5 V)', () => {
  const c = circuit('g5b', () => hc595Spec({ pins: ESP_PINS, vcc: 5, outs: ESP_OUTS, program: shiftSketch(ESP_PINS, latchWrite(ESP_PINS, 'MSBFIRST', '0b10100101')) }));
  const rev = review(c);
  const found = about(rev, 'IC1');
  assert.ok(found.length >= 1, `a hazard or a doubt about IC1 (not the "not simulated" one) is expected; the review has: ${codes(rev).join(', ')}`);
});

// G1's sketch lights four of the eight LEDs on purpose, so
// the kit's "never comes on" for the other four is honest and that circuit ends WARNINGS. G6 is checked on
// the walking bit of G3 instead, whose sketch lights every LED at some moment.
test('G6: review of the walking-bit circuit (G3): no SIM_PART_NOT_SIMULATED, no SIM_OUTPUT_NEVER_ON, verdict approved; layout ends STATUS: DONE', () => {
  const c = g3Circuit();
  assert.match(lastLine({ stdout: c.layoutOut }), /^STATUS: DONE\b/, 'layout of the walking-bit circuit ends DONE');
  const rev = review(c);
  assert.ok(!codes(rev).includes('SIM_PART_NOT_SIMULATED'), 'IC1 is simulated');
  assert.ok(!codes(rev).includes('SIM_OUTPUT_NEVER_ON'), 'every LED comes on in a state the kit visits');
  assert.equal(rev.verdict, 'approved');
});

test('G7: an LED straight on an output, no resistor: a hazard on the chip\'s output current (over its maximum)', () => {
  // The LED between 5 V and QA (the register holds zero at power-up and QA sinks). The output's resistance is
  // the datasheet's VOL(max) 0.26 V at 6 mA, 4.5 V: 43 ohm. Solve 5 V = Vf(I) + I * 43: Vf(60 mA) = 2.36 V,
  // 2.36 + 60 * 0.043 = 4.94 V, so I is about 61 mA, over the +-35 mA the chip allows per output (and the LED's 30 mA).
  // (An LED on the source side sees VOH(min) 3.98 V at 6 mA: 87 ohm, about 34 mA: just under the limit, so not used.)
  const c = circuit('g7', () => {
    const parts = [{ id: 'IC1', type: 'ic', part: '74HC595' }, { id: 'D1', type: 'led', color: 'red' }];
    const nets = [['IC1.VCC', 'T+'], ['IC1.GND', 'T-'], ['IC1.OE', 'T-'], ['IC1.SRCLR', 'T+'], ['IC1.SER', 'T-'], ['IC1.SRCLK', 'T-'], ['IC1.RCLK', 'T-'], ['T+', 'D1.A'], ['D1.K', 'IC1.QA']];
    return { parts, nets, supplies: [bench(5, 1)] };
  });
  const rev = review(c);
  const mine = rev.hazards.filter((h) => (h.parts ?? []).includes('IC1'));
  assert.ok(mine.length >= 1, `a hazard on IC1 (output current) expected; hazards: ${rev.hazards.map((h) => `${h.code} ${h.parts}`).join(', ')}`);
});

// ============================================================================================
// CD4017
// ============================================================================================

// A 555 astable with the recipe's values (timing resistors 1k and 10k, C1 10u, C2 10n, 9 V) clocks a CD4017.
// Period T = ln 2 * (1k + 2 * 10k) * C1 = 0.6931 * 21 kohm * 10 uF = 0.1456 s (about 6.9 Hz, the recipe's 1.44 / ((R1 + 2 R2) C1)).
const CLOCK_PERIOD = Math.LN2 * (1000 + 2 * 10000) * 10e-6;

function chaserSpec() {
  const parts = [
    { id: 'RA', type: 'resistor', value: '1k' }, { id: 'RB', type: 'resistor', value: '10k' },
    { id: 'U1', type: 'ic', part: 'NE555' },
    { id: 'C1', type: 'capacitor', kind: 'electrolytic', value: '10u' }, { id: 'C2', type: 'capacitor', value: '10n' },
    { id: 'IC1', type: 'ic', part: 'CD4017' },
  ];
  const nets = [
    ['T+', 'U1.VCC', 'U1.RESET', 'RA.1'], ['RA.2', 'RB.1', 'U1.DIS'], ['RB.2', 'U1.THR', 'U1.TRIG', 'C1.+'], ['C1.-', 'T-'],
    ['U1.CTRL', 'C2.1'], ['C2.2', 'T-'], ['U1.GND', 'T-'],
    ['U1.OUT', 'IC1.CLK'], ['T+', 'IC1.VDD'], ['T-', 'IC1.VSS'], ['T-', 'IC1.CE'], ['IC1.Q5', 'IC1.MR'],
  ];
  ['Q0', 'Q1', 'Q2', 'Q3', 'Q4'].forEach((q, i) => ledOn(parts, nets, i + 1, `IC1.${q}`, { res: '1k' }));
  return { parts, nets, supplies: [bench(9)] };
}

test('G8: 555 astable clocking a CD4017, five LEDs on Q0..Q4, Q5 to MR: they light one at a time in order, each for one clock period +- 10 %', () => {
  const c = circuit('g8', chaserSpec);
  const seconds = 2.5; // 17 clock periods of 0.1456 s
  const r = run(c, seconds);
  const spans = [];
  for (let k = 0; k < 5; k++) for (const [s, e] of output(r, `D${k + 1}`).intervals) spans.push({ k, s, e });
  spans.sort((a, b) => a.s - b.s);
  assert.ok(spans.length >= 12, `at least 12 LED steps over ${seconds} s, got ${spans.length}`);
  // In order 0,1,2,3,4,0,1,... (whichever LED the first edge after power-up lands on).
  for (let i = 1; i < spans.length; i++) assert.equal(spans[i].k, (spans[i - 1].k + 1) % 5, `step ${i} is Q${spans[i].k} after Q${spans[i - 1].k}`);
  // Never two at once for more than one step (1 ms).
  for (let i = 1; i < spans.length; i++) assert.ok(spans[i].s >= spans[i - 1].e - 0.0011, `two LEDs at once at ${spans[i].s}`);
  // Each step lasts one clock period +- 10 % (the first one starts at power-up and the last one is cut by the run's end).
  const full = spans.slice(1, -1);
  assert.ok(full.length >= 10, `at least 10 complete steps, got ${full.length}`);
  for (const sp of full) near(sp.e - sp.s, CLOCK_PERIOD, CLOCK_PERIOD * 0.1, `Q${sp.k} step from ${sp.s}`);
});

// A CD4017 at 5 V clocked by a UNO pin (D2): after a first 10 ms at LOW, the rising edges are at 10 ms + k * 100 ms.
const UNO_CLOCK = 'void setup(){pinMode(2,OUTPUT);digitalWrite(2,LOW);delay(10);}\nvoid loop(){digitalWrite(2,HIGH);delay(50);digitalWrite(2,LOW);delay(50);}';
function cd4017Uno({ ce = 'gnd', mr = 'gnd', leds }) {
  const parts = [{ id: 'U1', part: 'UNO', program: UNO_CLOCK }, { id: 'IC1', type: 'ic', part: 'CD4017' }];
  const nets = [['U1.GND', 'T-'], ['U1.D2', 'IC1.CLK'], ['IC1.VDD', 'T+'], ['IC1.VSS', 'T-'], ['IC1.CE', ce === 'gnd' ? 'T-' : 'T+'], ['IC1.MR', mr === 'gnd' ? 'T-' : 'T+']];
  leds.forEach((pin, i) => ledOn(parts, nets, i + 1, `IC1.${pin}`));
  return { parts, nets, supplies: [bench(5)] };
}

test('G9a: CE tied high: the count does not move, Q0 stays on', () => {
  // Datasheet: clock inhibit high holds the count. At power-up the count is 0 (Q0 high, CO high).
  const c = circuit('g9a', () => cd4017Uno({ ce: 'vcc', leds: ['Q0', 'Q1', 'Q2', 'CO'] }));
  const r = run(c, 1);
  assert.ok(coversWindow(output(r, 'D1'), 0.02, 1), `Q0 on the whole run: ${JSON.stringify(output(r, 'D1').intervals)}`);
  assert.ok(coversWindow(output(r, 'D4'), 0.02, 1), 'CO high at count 0 the whole run');
  for (const id of ['D2', 'D3']) assert.ok(!touchesWindow(output(r, id), 0, 1), `${id} never on`);
});

test('G9b: MR tied high: Q0 on, nothing moves', () => {
  const c = circuit('g9b', () => cd4017Uno({ mr: 'vcc', leds: ['Q0', 'Q1', 'Q2', 'CO'] }));
  const r = run(c, 1);
  assert.ok(coversWindow(output(r, 'D1'), 0.02, 1), `Q0 on the whole run: ${JSON.stringify(output(r, 'D1').intervals)}`);
  assert.ok(coversWindow(output(r, 'D4'), 0.02, 1), 'CO high at count 0 the whole run');
  for (const id of ['D2', 'D3']) assert.ok(!touchesWindow(output(r, id), 0, 1), `${id} never on`);
});

test('G9c: CO is high for counts 0 to 4 and low for 5 to 9 (once per ten clocks); Q9 is the ninth step', () => {
  // Rising edges at 0.010 + 0.1 * (k - 1) s, k = 1, 2, ... ; the count after edge k is k mod 10.
  //   CO high: from 0 until edge 5 (0.410 s), low until edge 10 (0.910 s), high until edge 15 (1.410 s), low until 1.910 s, high again.
  //   Q9 high from edge 9 (0.810 s) to edge 10 (0.910 s); and again 1.810 to 1.910 s.
  //   Q0 high 0 to 0.010 s, then 0.910 to 1.010 s.
  const c = circuit('g9c', () => cd4017Uno({ leds: ['CO', 'Q9', 'Q0'] }));
  const r = run(c, 2.4);
  const co = output(r, 'D1').intervals, q9 = output(r, 'D2').intervals, q0 = output(r, 'D3').intervals;
  assert.ok(co.length >= 3, `CO comes on three times in 2.4 s: ${JSON.stringify(co)}`);
  near(co[0][1], 0.41, 0.015, 'CO falls at the fifth edge');
  near(co[1][0], 0.91, 0.015, 'CO rises at the tenth edge');
  near(co[1][1], 1.41, 0.015, 'CO falls at the fifteenth edge');
  near(co[2][0], 1.91, 0.015, 'CO rises at the twentieth edge');
  assert.ok(q9.length >= 2, `Q9 comes on twice: ${JSON.stringify(q9)}`);
  near(q9[0][0], 0.81, 0.015, 'Q9 on at the ninth edge');
  near(q9[0][1], 0.91, 0.015, 'Q9 off at the tenth edge');
  near(q9[1][0], 1.81, 0.015, 'Q9 on again');
  assert.ok(q0.length >= 2, `Q0 comes on again: ${JSON.stringify(q0)}`);
  near(q0[1][0], 0.91, 0.015, 'Q0 on at the tenth edge');
  near(q0[1][1], 1.01, 0.015, 'Q0 off at the eleventh edge');
});

test('G10: clocked by a button with a pull-down, three presses: Q3 is the output that is on at the end', () => {
  // 5 V - button - CLK, 10 kohm CLK to ground. The kit's button does not bounce. Rising edges at 0.2, 0.5, 0.8 s: count 3.
  // Unloaded outputs: the high one is at VDD (> 4.5 V), the nine others at 0 V (< 0.5 V).
  const c = circuit('g10', () => {
    const parts = [{ id: 'IC1', type: 'ic', part: 'CD4017' }, { id: 'SW1', type: 'button' }, { id: 'R1', type: 'resistor', value: '10k' }];
    const nets = [['IC1.VDD', 'T+'], ['IC1.VSS', 'T-'], ['IC1.CE', 'T-'], ['IC1.MR', 'T-'], ['SW1.1', 'T+'], ['SW1.3', 'IC1.CLK'], ['R1.1', 'IC1.CLK'], ['R1.2', 'T-']];
    return { parts, nets, supplies: [bench(5)] };
  });
  const r = run(c, 1.2, { press: ['SW1@0.2+0.1', 'SW1@0.5+0.1', 'SW1@0.8+0.1'] });
  const pins = partOf(r.readings, 'IC1').pins;
  assert.ok(pins.Q3 > 4.5, `Q3 high: ${pins.Q3}`);
  for (const q of ['Q0', 'Q1', 'Q2', 'Q4', 'Q5', 'Q6', 'Q7', 'Q8', 'Q9']) assert.ok(pins[q] < 0.5, `${q} low: ${pins[q]}`);
});

test('G11a: an LED with no resistor on a CD4017 output at 5 V carries under 5 mA, and nothing burns', () => {
  // Datasheet (CD4017B, VDD 5 V): VOH 4.6 V at -0.51 mA (guaranteed minimum), so the output resistance is at
  // most (5 - 4.6) / 0.51 mA = 784 ohm and a real one gives more than 0.5 mA: I = (5 - 1.62) / 784 = 4.3 mA at the
  // weakest. The LED must carry more than 0.5 mA (it is driven at all) and under 5 mA (the drive is small).
  const c = circuit('g11a', () => {
    const parts = [{ id: 'IC1', type: 'ic', part: 'CD4017' }, { id: 'D1', type: 'led', color: 'red' }];
    const nets = [['IC1.VDD', 'T+'], ['IC1.VSS', 'T-'], ['IC1.CE', 'T-'], ['IC1.MR', 'T-'], ['IC1.CLK', 'T-'], ['IC1.Q0', 'D1.A'], ['D1.K', 'T-']];
    return { parts, nets, supplies: [bench(5)] };
  });
  const s = dc(c);
  const i = mA(partOf(s, 'D1').current);
  assert.ok(i > 0.5 && i < 5, `the LED carries ${i} mA, expected more than 0.5 and under 5`);
  const rev = review(c);
  assert.deepEqual(rev.hazards.filter((h) => (h.parts ?? []).includes('D1')), [], 'no burn-out hazard on the LED');
});

test('G11b: an LED with no resistor on a CD4017 output at 15 V: the kit warns about the chip\'s output', () => {
  // At 15 V the datasheet's drive is IOH(min) -3.4 mA at 13.5 V (about 440 ohm): (15 - 2) / 440 = 30 mA, far over what an output is meant to give.
  const c = circuit('g11b', () => {
    const parts = [{ id: 'IC1', type: 'ic', part: 'CD4017' }, { id: 'D1', type: 'led', color: 'red' }];
    const nets = [['IC1.VDD', 'T+'], ['IC1.VSS', 'T-'], ['IC1.CE', 'T-'], ['IC1.MR', 'T-'], ['IC1.CLK', 'T-'], ['IC1.Q0', 'D1.A'], ['D1.K', 'T-']];
    return { parts, nets, supplies: [bench(15)] };
  });
  const rev = review(c);
  assert.ok(about(rev, 'IC1').length >= 1, `a hazard or doubt about IC1 expected; the review has: ${codes(rev).join(', ')}`);
});

// ============================================================================================
// ULN2003 / ULN2803
// ============================================================================================

function relaySpec({ comWired }) {
  const program = 'void setup(){pinMode(2,OUTPUT);digitalWrite(2,HIGH);delay(1000);digitalWrite(2,LOW);}\nvoid loop(){delay(100);}';
  const parts = [{ id: 'U1', part: 'UNO', program }, { id: 'IC1', type: 'ic', part: 'ULN2003' }, { id: 'K1', type: 'relay' }];
  const nets = [['U1.GND', 'T-'], ['U1.D2', 'IC1.IN1'], ['IC1.GND', 'T-'], ['K1.A1', 'T+'], ['K1.A2', 'IC1.OUT1']];
  if (comWired) nets.push(['IC1.COM', 'T+']);
  return { parts, nets, supplies: [bench(5)] };
}

test('G12a: pin high pulls the relay in through the ULN2003, pin low drops it; COM wired: no COIL_NO_FLYBACK', () => {
  // The coil is 70 ohm: 71 mA at 5 V. With the Darlington saturated (VCE(sat) about 1 V at 70 mA) the coil sees
  // about 4 V: 57 mA, over the pull-in threshold of 75 % of 5 V = 3.75 V. The pin goes low at 1.0 s.
  const c = circuit('g12a', () => relaySpec({ comWired: true }));
  const r = run(c, 2);
  const k = output(r, 'K1');
  assert.ok(k.intervals.length >= 1, `K1 closes: ${JSON.stringify(k.intervals)}`);
  assert.ok(k.intervals[0][0] < 0.1, `K1 closes at once: ${JSON.stringify(k.intervals)}`);
  assert.ok(k.intervals[0][1] > 0.95 && k.intervals[0][1] < 1.1, `K1 drops when the pin goes low (1.0 s): ${JSON.stringify(k.intervals)}`);
  assert.ok(!codes(review(c)).includes('COIL_NO_FLYBACK'), 'COM on the supply is the flyback diode');
});

test('G12b: COM not connected: the relay still pulls in, and the COIL_NO_FLYBACK doubt is there', () => {
  const c = circuit('g12b', () => relaySpec({ comWired: false }));
  const r = run(c, 2);
  const k = output(r, 'K1');
  assert.ok(k.intervals.length >= 1 && k.intervals[0][0] < 0.1, `K1 closes with the pin high: ${JSON.stringify(k.intervals)}`);
  assert.ok(codes(review(c)).includes('COIL_NO_FLYBACK'), 'the clamp diodes go to COM; with COM open there is no diode');
});

test('G13: ULN2803 with eight LEDs from 5 V: each LED follows its input, 0.6 to 1.2 V on the output at 10 mA, an open input is off', () => {
  // IN1..IN7 from D2..D8, IN8 open. Phase A (0 to 0.5 s): D2, D4, D6, D8 high (IN1, IN3, IN5, IN7 -> LED 1, 3, 5, 7 on);
  // phase B (from 0.5 s): the other pins high (IN2, IN4, IN6 -> LED 2, 4, 6 on). LED 8 (input open) never.
  // LED current with 220 ohm: the datasheet's VCE(sat) is 0.9 to 1.1 V at 100 mA and a little less at 10 mA (about 0.6 to 1.0 V),
  // so I = (5 - 1.76 - 0.8) / 220 = 11 mA (about 10), and the output sits at 0.6 to 1.2 V, the item's bounds.
  const program = 'void setup(){for(int p=2;p<=8;p++)pinMode(p,OUTPUT);digitalWrite(2,HIGH);digitalWrite(4,HIGH);digitalWrite(6,HIGH);digitalWrite(8,HIGH);delay(500);for(int p=2;p<=8;p++)digitalWrite(p,(p%2)?HIGH:LOW);}\nvoid loop(){delay(100);}';
  const c = circuit('g13', () => {
    const parts = [{ id: 'U1', part: 'UNO', program }, { id: 'IC1', type: 'ic', part: 'ULN2803' }];
    const nets = [['U1.GND', 'T-'], ['IC1.GND', 'T-'], ['IC1.COM', 'T+']];
    for (let n = 1; n <= 8; n++) {
      parts.push({ id: `R${n}`, type: 'resistor', value: '220' }, { id: `D${n}`, type: 'led', color: 'red' });
      nets.push(['T+', `R${n}.1`], [`R${n}.2`, `D${n}.A`], [`D${n}.K`, `IC1.OUT${n}`]);
      if (n <= 7) nets.push([`U1.D${n + 1}`, `IC1.IN${n}`]);
    }
    return { parts, nets, supplies: [bench(5)] };
  });
  const r = run(c, 1);
  const A = [1, 3, 5, 7], B = [2, 4, 6];
  for (let n = 1; n <= 8; n++) {
    const d = output(r, `D${n}`);
    if (A.includes(n)) assert.ok(coversWindow(d, 0.05, 0.45), `D${n} on in phase A: ${JSON.stringify(d.intervals)}`);
    else assert.ok(!touchesWindow(d, 0.05, 0.45), `D${n} off in phase A: ${JSON.stringify(d.intervals)}`);
    if (B.includes(n)) assert.ok(coversWindow(d, 0.55, 1), `D${n} on in phase B: ${JSON.stringify(d.intervals)}`);
    else assert.ok(!touchesWindow(d, 0.55, 1), `D${n} off in phase B: ${JSON.stringify(d.intervals)}`);
  }
  // The end of the run is phase B: OUT2 is on at about 10 mA.
  const pins = partOf(r.readings, 'IC1').pins;
  assert.ok(pins.OUT2 >= 0.6 && pins.OUT2 <= 1.2, `OUT2 sits at ${pins.OUT2} V, expected 0.6 to 1.2 V`);
  const i = mA(partOf(r.readings, 'D2').current);
  assert.ok(i > 8 && i < 13, `D2 carries ${i} mA, about 10`);
});

// A 12 V supply, a resistor as the load on OUT1, IN1 from 12 V through 4.7 kohm (input current (12 - 1.6) / (2.7 k + 4.7 k) = 1.4 mA).
function loadSpec(ohms) {
  const parts = [{ id: 'IC1', type: 'ic', part: 'ULN2003' }, { id: 'R1', type: 'resistor', value: '4k7' }, { id: 'R2', type: 'resistor', value: ohms, power: '10' }];
  const nets = [['T+', 'R1.1'], ['R1.2', 'IC1.IN1'], ['T+', 'R2.1'], ['R2.2', 'IC1.OUT1'], ['IC1.GND', 'T-'], ['IC1.COM', 'T+']];
  return { parts, nets, supplies: [bench(12, 2)] };
}

test('G14a: a 12 V, 400 mA load on one ULN2003 channel: within the limits, no hazard', () => {
  // 27 ohm: I = (12 - VCE(sat)) / 27 with VCE(sat) about 1.1 V at 350 mA (datasheet): 0.40 A. The limit is 500 mA per channel.
  const c = circuit('g14a', () => loadSpec('27'));
  const s = dc(c);
  const i = Math.abs(partOf(s, 'R2').current);
  near(i, 0.4, 0.04, 'the load current');
  assert.deepEqual(review(c).hazards, [], 'nothing burns at 400 mA');
});

test('G14b: 700 mA on one channel: a hazard naming the channel', () => {
  // 15 ohm: I = (12 - 1.6) / 15 = 0.69 A with VCE(sat) 1.6 V at 350 mA and above; the limit is 500 mA.
  const c = circuit('g14b', () => loadSpec('15'));
  const s = dc(c);
  near(Math.abs(partOf(s, 'R2').current), 0.69, 0.07, 'the load current');
  const rev = review(c);
  const mine = rev.hazards.filter((h) => (h.parts ?? []).includes('IC1'));
  assert.ok(mine.length >= 1, `a hazard on IC1 expected; hazards: ${rev.hazards.map((h) => `${h.code} ${h.parts}`).join(', ')}`);
  assert.ok(mine.some((h) => /OUT1/.test(JSON.stringify(h.params))), `the hazard names the channel OUT1: ${JSON.stringify(mine.map((h) => h.params))}`);
});

// ============================================================================================
// PC817
// ============================================================================================

// Left side: 9 V battery, button, 680 ohm, the infrared LED (A, K). Right side: a 5 V bench supply with its own
// ground, 1 kohm from 5 V to C, E to that ground. The two sides share no net.
function optoSpec() {
  const parts = [
    { id: 'BT1', type: 'battery', format: '9V' }, { id: 'SW1', type: 'button' }, { id: 'R1', type: 'resistor', value: '680' },
    { id: 'U1', type: 'ic', part: 'PC817' }, { id: 'R2', type: 'resistor', value: '1k' },
  ];
  const nets = [['BT1.+', 'SW1.1'], ['SW1.3', 'R1.1'], ['R1.2', 'U1.A'], ['U1.K', 'BT1.-'], ['T+', 'R2.1'], ['R2.2', 'U1.C'], ['U1.E', 'T-']];
  return { parts, nets, supplies: [bench(5)] };
}

test('G15: PC817 with separate supplies and grounds: DC point ok, collector near 5 V released, under 0.5 V pressed, input current (9 - 1.2) / 680 = 11.5 mA +- 15 %', () => {
  const c = circuit('g15', optoSpec);
  // The two sides share no net (the spec's own, checked on the laid-out circuit).
  const nets = parsed(cli(['nets', c.target, '--json']), 'nets').nets.map((n) => n.pins.map((p) => p.replace(/@.*$/, '')));
  const left = /^(BT1|SW1|R1)\./, right = /^(R2\.|U1\.[CE]$)/;
  for (const pins of nets) assert.ok(!(pins.some((p) => left.test(p)) && pins.some((p) => right.test(p))), `a net joins both sides: ${pins.join(' ')}`);
  const released = dc(c);
  assert.equal(released.ok, true, 'the island with no path to the reference still solves');
  // Released: no light, the phototransistor is off and R2 (1 kohm) pulls the collector up to 5 V (the dark current is nanoamps).
  const collector = partOf(released, 'R2').pins['2'];
  assert.ok(collector > 4.9 && collector < 5.01, `collector released: ${collector} V`);
  // Pressed: the input current is (9 - 1.2 V) / 680 = 11.47 mA; with a CTR of about 100 % the phototransistor wants
  // more than the 5 mA the load allows ((5 - 0.15) / 1 kohm = 4.85 mA), so it saturates: VCE(sat) about 0.1 to 0.2 V.
  const r = run(c, 0.5, { press: ['SW1@0.1+10'] });
  assert.equal(r.readings.ok, true);
  const pressed = partOf(r.readings, 'R2').pins['2'];
  assert.ok(pressed < 0.5, `collector pressed: ${pressed} V`);
  near(mA(partOf(r.readings, 'R1').current), 11.5, 11.5 * 0.15, 'the input LED current');
});

function optoOneSide({ resistor, reversed }) {
  const parts = [{ id: 'BT1', type: 'battery', format: '9V' }, { id: 'R1', type: 'resistor', value: resistor }, { id: 'U1', type: 'ic', part: 'PC817' }];
  const nets = reversed ? [['BT1.+', 'R1.1'], ['R1.2', 'U1.K'], ['U1.A', 'BT1.-']] : [['BT1.+', 'R1.1'], ['R1.2', 'U1.A'], ['U1.K', 'BT1.-']];
  return { parts, nets, supplies: [] };
}

test('G16a: 100 mA through the PC817\'s LED: a hazard on the chip (50 mA maximum)', () => {
  // 75 ohm from 9 V: (9 - 1.2 to 1.4) / 75 = 101 to 104 mA, twice the 50 mA the infrared LED allows.
  const c = circuit('g16a', () => optoOneSide({ resistor: '75', reversed: false }));
  const rev = review(c);
  assert.ok(rev.hazards.some((h) => (h.parts ?? []).includes('U1')), `a hazard on U1 expected; hazards: ${rev.hazards.map((h) => `${h.code} ${h.parts}`).join(', ')}`);
});

test('G16b: the PC817\'s LED reversed at 9 V: a hazard on the chip (6 V reverse rating)', () => {
  const c = circuit('g16b', () => optoOneSide({ resistor: '680', reversed: true }));
  const rev = review(c);
  assert.ok(rev.hazards.some((h) => (h.parts ?? []).includes('U1')), `a hazard on U1 expected; hazards: ${rev.hazards.map((h) => `${h.code} ${h.parts}`).join(', ')}`);
});

// ============================================================================================
// LM386
// ============================================================================================

// The generator is the signal source: sine at 1 kHz through 10 uF into IN+, IN- to ground; the output through 220 uF into 8 ohm.
function lm386Spec({ vcc = 9, amplitude = 0.05, gain200 = false, shorted = false, noInput = false }) {
  const parts = [{ id: 'U1', type: 'ic', part: 'LM386' }];
  const nets = [['U1.VS', 'T+'], ['U1.GND', 'T-'], ['U1.IN-', 'T-']];
  const supplies = [bench(vcc)];
  if (noInput) nets.push(['U1.IN+', 'T-']);
  else {
    parts.push({ id: 'CIN', type: 'capacitor', value: '10u' });
    nets.push(['CIN.+', 'U1.IN+']);
    supplies.push({ id: 'G1', kind: 'generator', waveform: 'sine', frequency: 1000, amplitude, offset: 0, positive: 'CIN.-', negative: 'T-' });
  }
  if (shorted) nets.push(['U1.OUT', 'T-']);
  else {
    parts.push({ id: 'COUT', type: 'capacitor', kind: 'electrolytic', value: '220u' }, { id: 'RL', type: 'resistor', value: '8' });
    nets.push(['U1.OUT', 'COUT.+'], ['COUT.-', 'RL.1'], ['RL.2', 'T-']);
  }
  if (gain200) {
    parts.push({ id: 'CG', type: 'capacitor', kind: 'electrolytic', value: '10u' });
    nets.push(['U1.GAIN1', 'CG.+'], ['CG.-', 'U1.GAIN8']);
  }
  return { parts, nets, supplies };
}

// Peak and frequency of the load voltage in a transient: skip the first millisecond, measure on the rest.
function waveOf(t, id) {
  assert.equal(t.ok, true, `the transient solves: ${JSON.stringify(t.issues)}`);
  const times = t.times, v = partOf(t, id).voltage;
  assert.ok(Array.isArray(v) && v.length === times.length, 'a voltage series with the times');
  const idx = times.map((x, i) => (x >= 0.001 ? i : -1)).filter((i) => i >= 0);
  const w = idx.map((i) => v[i]);
  const mean = w.reduce((a, b) => a + b, 0) / w.length;
  const peak = (Math.max(...w) - Math.min(...w)) / 2;
  const ups = [];
  for (let k = 1; k < idx.length; k++) {
    const a = v[idx[k - 1]] - mean, b = v[idx[k]] - mean;
    if (a < 0 && b >= 0) ups.push(times[idx[k - 1]] + ((0 - a) / (b - a)) * (times[idx[k]] - times[idx[k - 1]]));
  }
  const freq = ups.length >= 2 ? (ups.length - 1) / (ups.at(-1) - ups[0]) : 0;
  return { peak, freq, crossings: ups.length };
}

test('G17a: LM386 on 9 V, gain 20: the output rests at 4.5 V +- 0.5; 50 mV at 1 kHz gives 1.0 V peak +- 20 % at 1 kHz +- 5 % across the load', () => {
  // Rest: the output is biased at half the supply: 9 / 2 = 4.5 V. Gain 20 (pins 1 and 8 open): 0.050 V * 20 = 1.0 V peak.
  // The 220 uF into 8 ohm is a high-pass at 1 / (2 pi * 8 * 220 uF) = 90 Hz: at 1 kHz it passes 0.996 of the wave.
  const c = circuit('g17a', () => lm386Spec({}));
  const out = partOf(dc(c), 'U1').pins.OUT;
  near(out, 4.5, 0.5, 'output at rest');
  const w = waveOf(transient(c, 0.005), 'RL');
  near(w.peak, 1.0, 0.2, 'peak across the 8 ohm load');
  assert.ok(w.crossings >= 3, `a wave of several cycles: ${w.crossings} rising crossings`);
  near(w.freq, 1000, 50, 'frequency');
});

test('G17b: LM386 with 10 uF between pins 1 and 8 (gain 200) and a 5 mV input: 1.0 V peak +- 25 % across the load', () => {
  // Gain 200 with the capacitor: 0.005 V * 200 = 1.0 V. Corner of the gain network: 1 / (2 pi * 1.35 kohm * 10 uF) = 12 Hz, well under 1 kHz.
  const c = circuit('g17b', () => lm386Spec({ amplitude: 0.005, gain200: true }));
  const w = waveOf(transient(c, 0.005), 'RL');
  near(w.peak, 1.0, 0.25, 'peak across the 8 ohm load at gain 200');
});

test('G18a: LM386 on 3 V: a warning that the supply is under its 4 V minimum', () => {
  const c = circuit('g18a', () => lm386Spec({ vcc: 3, noInput: true }));
  const rev = review(c);
  assert.ok(about(rev, 'U1').length >= 1, `a hazard or doubt about U1 expected; the review has: ${codes(rev).join(', ')}`);
});

test('G18b: LM386 on 9 V with the output shorted to ground: a hazard on the chip', () => {
  const c = circuit('g18b', () => lm386Spec({ shorted: true, noInput: true }));
  const rev = review(c);
  assert.ok(rev.hazards.some((h) => (h.parts ?? []).includes('U1')), `a hazard on U1 expected; hazards: ${rev.hazards.map((h) => `${h.code} ${h.parts}`).join(', ')}`);
});

// ============================================================================================
// Catalog and what must not change
// ============================================================================================

test('G19: catalog lists none of the six as not simulated, and their entries have no "Not simulated"', () => {
  const list = cli(['catalog'], 60_000).stdout;
  for (const name of ['74HC595', 'CD4017', 'ULN2003', 'ULN2803', 'PC817', 'LM386']) {
    assert.ok(!new RegExp(`${name}[^,\\n]*not simulated`, 'i').test(list), `${name} is listed as not simulated`);
    const entry = cli(['catalog', name], 60_000).stdout;
    assert.ok(entry.includes(name), `catalog ${name} answers`);
    assert.doesNotMatch(entry, /not simulated/i, `catalog ${name} still says it is not simulated`);
  }
});

test('G20: every recipe still ends DONE with unchanged readings (recipe-sweep) and the simulator\'s golden file still matches', () => {
  // This passes today and must keep passing: the new devices touch the engine and the solver.
  // A child `node --test` inside a test run would inherit the runner's context and report nothing: the context is dropped.
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  // The reporter is named: without a terminal Node 22 writes TAP and Node 24 the spec report read below.
  const sweep = spawnSync(process.execPath, ['--test', '--test-reporter=spec', 'test/recipe-sweep.test.js'], { cwd: root, env, encoding: 'utf8', maxBuffer: 1 << 28, timeout: 1_500_000, killSignal: 'SIGKILL' });
  assert.ok(sweep.error?.code !== 'ETIMEDOUT', 'recipe-sweep timed out');
  assert.equal(sweep.status, 0, `recipe-sweep failed:\n${(sweep.stdout ?? '').slice(-2500)}${sweep.stderr ?? ''}`);
  assert.match(sweep.stdout, /ℹ pass (\d+)/, 'the sweep really ran');
  assert.ok(Number(/ℹ pass (\d+)/.exec(sweep.stdout)[1]) >= 60, 'at least one test per recipe passed');
  assert.match(sweep.stdout, /ℹ fail 0/);
  const golden = spawnSync(process.execPath, ['scripts/golden.js'], { cwd: root, encoding: 'utf8', timeout: 300_000, killSignal: 'SIGKILL' });
  assert.equal(golden.status, 0, `golden differs:\n${golden.stdout}${golden.stderr}`);
});
