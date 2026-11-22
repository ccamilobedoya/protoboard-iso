// The sketch runner against what a real board does (src/sim/program.js, src/sim/sketch.js): each case
// reproduces a sketch a first-time user wrote that misbehaved, run as `simulate --run` runs it (the
// engine's advance, the page's path) and, where it matters, stepped as the page steps.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { autoLayout } from './layout-generous.js';
import { runCircuit, parseStimuli } from '../src/sim/run.js';
import { compile, createEngine } from '../src/sim/index.js';
import { translateSketch } from '../src/sim/sketch.js';
import { createRunner } from '../src/sim/program.js';

// A sketch run alone on an UNO with nothing wired (its setup and first loop up to the first wait).
const alone = (source, family = 'uno') => {
  const r = translateSketch(source);
  assert.ok(r.js, JSON.stringify(r.issues));
  const runner = createRunner(r.js, { family, read: () => null, vil: 0.3, vih: 0.6, adcBits: 10, adcFull: 5 });
  runner.advance(0);
  return { runner, issues: r.issues, log: [...runner.log, ...(runner.line ? [runner.line] : [])] };
};
const setupOnly = (body, before = '') => alone(`${before}\nvoid setup() { Serial.begin(9600);\n${body}\n}\nvoid loop() { delay(1000); }`);

// An UNO with a button from D2 to ground and an LED on D8, laid out once; each test gives its sketch.
let base = null;
const uno = (program) => {
  base ??= autoLayout({
    board: 'auto',
    parts: [
      { id: 'U1', part: 'UNO', program: 'void setup() {}\nvoid loop() { delay(10); }' },
      { id: 'R1', type: 'resistor', value: '220' },
      { id: 'D1', type: 'led', color: 'red' },
      { id: 'S1', type: 'button' },
    ],
    nets: [['U1.D8', 'R1.1'], ['R1.2', 'D1.A'], ['D1.K', 'U1.GND'], ['U1.D2', 'S1.1'], ['S1.3', 'U1.GND']],
  }).circuit;
  return { ...base, parts: base.parts.map((p) => (p.id === 'U1' ? { ...p, program } : p)) };
};
const runOf = (program, seconds, given = {}) => {
  const { stimuli, errors } = parseStimuli(given);
  assert.deepEqual(errors, []);
  return runCircuit(uno(program), { seconds, stimuli });
};
// The Serial lines as "ms:text".
const lines = (r) => r.serial.lines.map((l) => `${Math.round(l.t * 1000)}:${l.text}`);
const onPress = (body) => `void setup() { Serial.begin(9600); pinMode(2, INPUT_PULLUP); }\nvoid loop() {\n  if (digitalRead(2) == LOW) {\n${body}\n  }\n}`;

// ── 1. delay() lasts what it says ──

test('a delay after a loop() that never waited lasts all it says (the press does not end it)', () => {
  const sketch = onPress('Serial.println(millis()); delay(300); Serial.println(millis());');
  // The fault: the time loop() ran without waiting was a debt the next delay paid (501 … 501), and
  // the second delay seemed to end at the release (501 … 600).
  assert.deepEqual(lines(runOf(sketch, 2, { press: ['S1@0.5+0.1'] })), ['501:501', '801:801']);
  assert.deepEqual(lines(runOf(sketch, 2, { press: ['S1@0.45+0.05'] })), ['451:451', '751:751']);
});

test('a press before, during or after a delay leaves the delay its length', () => {
  const sketch = 'void setup() { Serial.begin(9600); pinMode(2, INPUT_PULLUP); }\nvoid loop() { unsigned long t = millis(); delay(300); Serial.println(millis() - t); }';
  for (const press of ['S1@0.1+0.05', 'S1@0.45+0.05', 'S1@0.6+0.2']) {
    const r = runOf(sketch, 1.25, { press: [press] });
    assert.deepEqual(r.serial.lines.map((l) => l.text), ['300', '300', '300', '300'], press);
  }
});

test('delayMicroseconds, pulseIn and a millis() wait each measure their own time', () => {
  const us = runOf(onPress('unsigned long a = micros(); delayMicroseconds(500); Serial.println(micros() - a); delay(200);'), 1, { press: ['S1@0.5+0.1'] });
  assert.deepEqual(us.serial.lines.map((l) => l.text), ['500']);
  const pulse = runOf('void setup() { Serial.begin(9600); pinMode(2, INPUT_PULLUP); }\nvoid loop() { unsigned long w = pulseIn(2, LOW, 3000000); if (w) Serial.println(w); }', 1, { press: ['S1@0.5+0.1'] });
  assert.deepEqual(pulse.serial.lines.map((l) => l.text), ['100000']);
  const busy = runOf(onPress('unsigned long t0 = millis(); while (millis() - t0 < 300) {} Serial.println(millis() - t0);'), 1.5, { press: ['S1@0.5+0.1'] });
  assert.deepEqual(lines(busy), ['801:300']);
});

test('the page steps (engine.advance at 60 frames a second) give the same delay', () => {
  const engine = createEngine(compile(uno(onPress('Serial.println(millis()); delay(300); Serial.println(millis());'))).program);
  assert.ok(engine.start('dc', 1e-3));
  const frame = 1 / 60;
  // The page advances a frame in steps of at most 1 ms, as simulate --run does.
  const advance = (seconds) => {
    const end = engine.time + seconds;
    while (engine.time < end - 1e-9) assert.ok(engine.advance(Math.min(1e-3, end - engine.time)));
  };
  advance(30 * frame);
  assert.ok(engine.set('S1', 'pressed', true));
  advance(6 * frame);
  assert.ok(engine.set('S1', 'pressed', false));
  advance(60 * frame);
  const printed = engine.serial().U1.lines.map(Number);
  assert.equal(printed.length, 2, String(printed));
  assert.equal(printed[1] - printed[0], 300);
});

// ── 2. A char prints as its letter ──

test('print and println of a char show its letter; char arithmetic stays a number', () => {
  const r = setupOnly(`Serial.println('Z'); char c = 'B'; Serial.println(c); Serial.print((char)65); Serial.println(); Serial.println(f());
Serial.println(c + 1); c++; Serial.println(c); Serial.println(char(68)); Serial.println(c == 'C' ? 'y' : 'n');
char letters[3] = {'x', 'y', 'z'}; Serial.println(letters[1]);`, "char f() { return 'Q'; }");
  assert.deepEqual(r.log, ['Z', 'B', 'A', 'Q', '67', 'C', 'D', 'y', 'y']);
  assert.deepEqual(r.issues, []);
});

test('a byte, an unsigned char and a char with DEC print the number; Serial.write sends the byte', () => {
  const r = setupOnly("unsigned char u = 66; Serial.println(u); byte b = 67; Serial.println(b); char c = 'B'; Serial.println(c, DEC); Serial.write(65); Serial.write('!'); Serial.write(\"hi\"); Serial.println();");
  assert.deepEqual(r.log, ['66', '67', '66', 'A!hi']);
});

test('HEX, BIN, OCT and DEC as print\'s second argument; a float\'s second argument is its decimals', () => {
  const r = setupOnly('Serial.println(255, HEX); Serial.println(5, BIN); Serial.println(8, OCT); Serial.println(42, DEC); Serial.println(-1, HEX); int n = 10; Serial.print(n, HEX); Serial.println(); Serial.println(3.14159, 3); float x = 2; Serial.println(x, 0); Serial.println(1.5);');
  assert.deepEqual(r.log, ['FF', '101', '10', '42', 'FFFFFFFF', 'A', '3.142', '2', '1.50']);
});
