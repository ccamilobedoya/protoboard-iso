// The sketch runner against what a real board does (src/sim/program.js, src/sim/sketch.js): each case
// reproduces a sketch a first-time user wrote that misbehaved, run as `simulate --run` runs it (the
// engine's advance, the page's path) and, where it matters, stepped as the page steps.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { autoLayout } from './layout-generous.js';
import { runCircuit, parseStimuli } from '../src/sim/run.js';
import { compile, createEngine } from '../src/sim/index.js';

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
