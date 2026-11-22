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

// ── 3. Mistakes a real board would show, the kit says (each with its line; the sketch goes on) ──

const warned = (r) => r.runner.warnings.map((w) => [w.code, w.line]);
const loopOnly = (body, before = '', family = 'uno') => {
  const r = translateSketch(`${before}\nvoid setup() { Serial.begin(9600); pinMode(13, OUTPUT); }\nvoid loop() {\n${body}\n  delay(500);\n}`);
  assert.ok(r.js, JSON.stringify(r.issues));
  const pins = family === 'uno' ? [...Array(20).keys()] : [0, 1, 2, 3, 4, 5, 12, 13, 14, 15, 16, 17, 18, 19, 21, 22, 23, 25, 26, 27, 32, 33, 34, 35, 36, 39];
  const runner = createRunner(r.js, { family, pins, read: () => null, vil: 0.3, vih: 0.6, adcBits: 10, adcFull: 5 });
  runner.advance(0);
  return { runner, issues: r.issues, log: [...runner.log, ...(runner.line ? [runner.line] : [])] };
};

test('a pin the board does not have: warned with its line, and the sketch goes on', () => {
  const r = loopOnly('  digitalWrite(99, HIGH);\n  Serial.println("after");');
  assert.deepEqual(warned(r), [['SIM_PROGRAM_PIN_UNKNOWN', 4]]);
  assert.equal(r.runner.warnings[0].pin, 99);
  assert.deepEqual(r.log, ['after']);
});

test('HIGH to a pin never set as OUTPUT: an UNO sources it through its pull-up; warned once', () => {
  const r = loopOnly('  digitalWrite(12, HIGH);\n  digitalWrite(12, HIGH);');
  assert.deepEqual(warned(r), [['SIM_PROGRAM_NOT_OUTPUT', 4]]);
  assert.equal(r.runner.pins[12].pull, 'up');
  assert.equal(r.runner.pins[12].mode, 'input');
  const esp = loopOnly('  digitalWrite(12, HIGH);', '', 'esp32');
  assert.deepEqual(warned(esp), [['SIM_PROGRAM_NOT_OUTPUT', 4]]);
  assert.equal(esp.runner.pins[12]?.pull ?? null, null, 'an ESP32 leaves it an input');
  assert.deepEqual(warned(loopOnly('  digitalWrite(13, HIGH);')), [], 'a pin set as OUTPUT is not warned');
});

test('analogWrite on a pin with no PWM keeps the AVR behaviour and says it', () => {
  const r = loopOnly('  analogWrite(13, 200);');
  assert.deepEqual(warned(r), [['SIM_PROGRAM_NO_PWM', 4]]);
  assert.equal(r.runner.pins[13].level, 1, '200 is HIGH');
  assert.deepEqual(warned(loopOnly('  analogWrite(9, 200);')), []);
});

test('an integer division by zero: 0 and a warning; an ESP32 stops there as the chip does', () => {
  const r = loopOnly('  int x = 10 / d;\n  int y = 7 % d;\n  int z = 10;\n  z /= d;\n  Serial.println(x + y + z);\n  float f = 1.0 / d;', 'int d = 0;');
  assert.deepEqual(warned(r), [['SIM_PROGRAM_DIVIDE_ZERO', 4], ['SIM_PROGRAM_DIVIDE_ZERO', 5], ['SIM_PROGRAM_DIVIDE_ZERO', 7]]);
  assert.deepEqual(r.log, ['0'], 'a float division by zero is no warning (it is inf)');
  assert.equal(r.runner.error, null);
  const esp = loopOnly('  int x = 10 / d;\n  Serial.println(x);', 'int d = 0;', 'esp32');
  assert.match(esp.runner.error, /division by zero.*\(line 4\)/);
  assert.deepEqual(esp.log, []);
  assert.deepEqual(loopOnly('  Serial.println(7 / 2);\n  Serial.println(-7 % 3);').log, ['3', '-1'], 'C\'s integer division and remainder');
});

test('an array read or written outside its bounds: warned, reads 0, the write dropped', () => {
  const r = loopOnly('  Serial.println(a[7]);\n  a[7] = 5;\n  Serial.println(a[7]);\n  Serial.println(a[2]);\n  Serial.println(b[4]);', 'int a[3] = {1, 2, 3};\nint b[5] = {9};');
  assert.deepEqual(warned(r), [['SIM_PROGRAM_OUT_OF_BOUNDS', 5], ['SIM_PROGRAM_OUT_OF_BOUNDS', 6], ['SIM_PROGRAM_OUT_OF_BOUNDS', 7]]);
  assert.deepEqual(r.log, ['0', '0', '3', '0'], 'int b[5] = {9} has five elements');
  assert.deepEqual(r.runner.warnings[0], { code: 'SIM_PROGRAM_OUT_OF_BOUNDS', line: 5, index: 7, size: 3 });
});

test('a negative delay is the very long wait of an unsigned argument, warned', () => {
  const r = loopOnly('  Serial.println("on");\n  delay(-1);\n  Serial.println("off");');
  assert.deepEqual(warned(r), [['SIM_PROGRAM_DELAY_NEGATIVE', 5]]);
  assert.equal(r.runner.warnings[0].wrapped, 4294967295);
  assert.ok(r.runner.until() > 4e6, 'it waits about 49.7 days');
  r.runner.advance(10);
  assert.deepEqual(r.runner.log, ['on'], 'still waiting after 10 s');
});

test('a name never declared: a real board refuses to compile it, said with its line', () => {
  const r = translateSketch('void setup() { Serial.begin(9600); }\nvoid loop() {\n  Serial.println(counter);\n  counter = 5;\n  delay(500);\n}');
  assert.deepEqual(r.issues.map((i) => [i.code, i.line, i.name]), [['SIM_PROGRAM_UNDECLARED', 3, 'counter']]);
  const runner = createRunner(r.js, { family: 'uno', read: () => null, vil: 0.3, vih: 0.6, adcBits: 10, adcFull: 5 });
  runner.advance(0);
  assert.equal(runner.error, 'counter is not declared: a real board would not compile this sketch (line 3)');
  // A name of Arduino's the kit lacks is not "undeclared": a real board compiles it.
  const arduino = translateSketch('void setup() { int x = RISING; }\nvoid loop() { delay(10); }');
  assert.deepEqual(arduino.issues, []);
  // Declared names of every kind are not noted.
  const fine = translateSketch('#define N 3\nint g = 1;\nint f(int p) { return p + g + N; }\nvoid setup() { for (int i = 0; i < N; i++) { int k = f(i); g += k; } }\nvoid loop() { delay(10); }');
  assert.deepEqual(fine.issues, []);
});

test('a brace never closed: said with the line where its block opened', () => {
  const eof = translateSketch('void setup() {\n  pinMode(13, OUTPUT);\n}\nvoid loop() {\n  digitalWrite(13, HIGH);\n  delay(500);');
  assert.equal(eof.js, null);
  assert.deepEqual(eof.issues.map((i) => [i.code, i.line]), [['SIM_PROGRAM_BRACE', 4]]);
  const inner = translateSketch('void loop() {\n  if (1) {\n    delay(5);\n}\nvoid setup() {\n  delay(1);\n}');
  assert.deepEqual(inner.issues.map((i) => [i.code, i.line]), [['SIM_PROGRAM_BRACE', 1]], 'a function defined inside a block: the block before it');
});

test('a library the kit does not have: one line, and its objects and calls do nothing', () => {
  const r = translateSketch('#include <WiFi.h>\n#include <LiquidCrystal.h>\nLiquidCrystal lcd(12, 11, 5, 4, 3, 2);\nvoid setup() { Serial.begin(9600); WiFi.begin("ssid", "pass"); lcd.begin(16, 2); lcd.setCursor(0, 1).print("x"); }\nvoid loop() { Serial.println(WiFi.status() == WL_CONNECTED); delay(500); }');
  assert.ok(r.js, JSON.stringify(r.issues));
  assert.deepEqual(r.issues.map((i) => [i.code, i.line, i.name]), [['SIM_PROGRAM_LIBRARY', 1, 'WiFi.h'], ['SIM_PROGRAM_LIBRARY', 2, 'LiquidCrystal.h']]);
  const runner = createRunner(r.js, { family: 'esp32', read: () => null, vil: 0.3, vih: 0.6, adcBits: 12, adcFull: 3.3 });
  runner.advance(0);
  assert.equal(runner.error, null);
  assert.deepEqual(runner.log, ['1'], 'WiFi.status() and WL_CONNECTED are both 0 here');
});

test('the review turns a program\'s mistake into a ⚠ with its line', async () => {
  const { checkHazards } = await import('../src/sim/index.js');
  const doubts = checkHazards(uno('void setup() { pinMode(8, OUTPUT); }\nvoid loop() {\n  digitalWrite(99, HIGH);\n  analogWrite(8, 50);\n  delay(500);\n}')).doubts;
  assert.deepEqual(doubts.filter((d) => d.code.startsWith('SIM_PROGRAM_')).map((d) => [d.code, d.params.line, d.params.pin]), [['SIM_PROGRAM_PIN_UNKNOWN', 3, '99'], ['SIM_PROGRAM_NO_PWM', 4, 'D8']]);
});

// ── 4. No false "never lets time pass" ──

test('a loop printing 100 000 lines lets time pass at the serial rate and is not stuck', () => {
  const flood = 'void setup() { pinMode(13, OUTPUT); Serial.begin(9600); }\nvoid loop() { for (long i = 0; i < 100000; i++) { Serial.println("spam line"); } digitalWrite(13, HIGH); }';
  const r = runOf(flood, 1);
  assert.ok(!r.issues.some((i) => i.code === 'SIM_PROGRAM_STUCK'), JSON.stringify(r.issues.map((i) => i.code)));
  // "spam line" and "\r\n": 11 characters, 11.46 ms at 9600 baud; the first lines fill the 64-byte buffer.
  assert.ok(r.serial.count > 80 && r.serial.count < 100, String(r.serial.count));
  const fast = runOf(flood.replace('9600', '115200'), 1);
  assert.ok(fast.serial.count > 1000 && fast.serial.count < 1100, String(fast.serial.count));
});

test('a long loop that ends is not stuck; one that never ends is, at its count of turns', () => {
  const ends = runOf('long n = 0;\nvoid setup() { for (long i = 0; i < 150000; i++) { n++; } Serial.begin(9600); Serial.println(n); }\nvoid loop() { delay(100); }', 0.5);
  assert.ok(!ends.issues.some((i) => i.code === 'SIM_PROGRAM_STUCK'));
  assert.deepEqual(ends.serial.lines.map((l) => l.text), ['150000'], 'at t = 0 the start runs it to its end');
  const inLoop = runOf('long n = 0;\nvoid setup() { Serial.begin(9600); }\nvoid loop() { for (long i = 0; i < 150000; i++) { n++; } Serial.println(n); delay(100); }', 0.5);
  assert.ok(!inLoop.issues.some((i) => i.code === 'SIM_PROGRAM_STUCK'));
  assert.ok(inLoop.serial.lines.length >= 2);
  const never = runOf('void setup() {}\nvoid loop() { while (1) {} }', 0.5);
  assert.ok(never.issues.some((i) => i.code === 'SIM_PROGRAM_STUCK'));
  const runner = createRunner(translateSketch('void setup() { while (1) {} }\nvoid loop() {}').js, { family: 'uno', read: () => null });
  runner.advance(0);
  assert.equal(runner.stuck, true, 'the start says it at once');
  const empty = createRunner(translateSketch('void setup() {}\nvoid loop() {}').js, { family: 'uno', read: () => null });
  empty.advance(0);
  assert.equal(empty.stuck, false, 'a loop() that returns is not stuck');
});

// ── 7. A serial line from one board to another ──

// An UNO's TX (D1) into an ESP32's RX2, grounds joined, laid out once; each test gives the programs.
let linked = null;
const link = (uno, esp) => {
  linked ??= autoLayout({
    board: 'auto',
    parts: [
      { id: 'U1', part: 'UNO', program: 'void setup() {}\nvoid loop() { delay(10); }' },
      { id: 'E1', part: 'ESP32-DEVKIT', program: 'void setup() {}\nvoid loop() { delay(10); }' },
    ],
    nets: [['U1.D1', 'E1.RX2'], ['U1.GND', 'E1.GND']],
  }).circuit;
  return { ...linked, parts: linked.parts.map((p) => (p.id === 'U1' ? { ...p, program: uno } : p.id === 'E1' ? { ...p, program: esp } : p)) };
};

test('an UNO\'s TX idles at 5 V once Serial.begin runs: the ESP32\'s RX pin over its rail is seen', async () => {
  const { simulate } = await import('../src/sim/index.js');
  const esp = 'void setup() { Serial.begin(115200); }\nvoid loop() { delay(100); }';
  const r = simulate(link('int n = 0;\nvoid setup() { Serial.begin(9600); }\nvoid loop() { Serial.println(n); n++; delay(1000); }', esp));
  assert.ok(r.ok, JSON.stringify(r.issues));
  assert.equal(r.parts.U1.pins.find((p) => p.name === 'D1').mode, 'output');
  assert.ok(r.parts.E1.pins.find((p) => p.name === 'RX2').voltage > 3.6);
  assert.ok(r.issues.some((i) => i.code === 'SIM_PIN_OVERVOLTAGE' && i.params.pin === 'RX2'), JSON.stringify(r.issues.map((i) => i.code)));
  // Without Serial.begin the pin is not driven, as on a board.
  const idle = simulate(link('void setup() {}\nvoid loop() { delay(1000); }', esp));
  assert.ok(!idle.issues.some((i) => i.code === 'SIM_PIN_OVERVOLTAGE'));
});

// ── 6. The names of the family the user wrote ──

const runFor = (source, family, seconds) => {
  const r = translateSketch(source);
  assert.ok(r.js, JSON.stringify(r.issues));
  const runner = createRunner(r.js, { family, read: () => null, vil: 0.3, vih: 0.6, adcBits: 12, adcFull: 3.3 });
  runner.advance(0);
  for (let k = 0; k < seconds * 1000 && !runner.error; k++) runner.advance(1e-3);
  return { runner, issues: r.issues };
};

test('Serial1 and Serial2 on an ESP32 are ports of their own, labelled in the output; an UNO has none', () => {
  const esp = runFor('void setup() { Serial.begin(115200); Serial2.begin(9600, SERIAL_8N1, 16, 17); Serial2.println("hi"); Serial2.print(3.5); Serial2.println(); Serial1.begin(9600, SERIAL_8N1, 25, 26); Serial1.write(65); Serial1.println(); Serial.println(Serial2.available()); }\nvoid loop() { delay(10); }', 'esp32', 0.1);
  assert.deepEqual(esp.issues, []);
  assert.equal(esp.runner.error, null);
  assert.deepEqual(esp.runner.log, ['Serial2: hi', 'Serial2: 3.50', 'Serial1: A', '0']);
  assert.equal(esp.runner.pins[17].mode, 'output', 'Serial2\'s TX idles high');
  assert.equal(esp.runner.pins[26].level, 1, 'Serial1\'s TX, as its begin named it');
  const uno = runFor('void setup() { Serial2.begin(9600); }\nvoid loop() { delay(10); }', 'uno', 0);
  assert.equal(uno.runner.error, 'Serial2 is not declared on an UNO: a real board would not compile this sketch (it has one serial port, Serial) (line 1)');
});

test('Serial.parseInt waits its timeout for digits and returns 0 when none come', () => {
  const r = runFor('void setup() { Serial.begin(9600); Serial.setTimeout(50); int v = Serial.parseInt(); Serial.println(millis()); Serial.println(v); }\nvoid loop() { delay(5); }', 'uno', 0.2);
  assert.deepEqual(r.runner.log, ['50', '0']);
});

test('ESP32 deep sleep: the program stops, its pins are released, and it starts again from setup()', () => {
  const source = 'int boots = 0;\nvoid setup() { Serial.begin(115200); pinMode(2, OUTPUT); digitalWrite(2, HIGH); boots++; Serial.println(boots); Serial.println(millis()); esp_sleep_enable_timer_wakeup(2 * 1000000ULL); esp_deep_sleep_start(); }\nvoid loop() { }';
  const r = runFor(source, 'esp32', 1);
  assert.deepEqual(r.runner.log, ['1', '0']);
  assert.equal(r.runner.pins[2].mode, 'input', 'asleep, the pin is let go');
  assert.ok(Math.abs(r.runner.sleeping.until - 2) < 1e-6);
  const later = runFor(source, 'esp32', 4.5);
  assert.deepEqual(later.runner.log, ['1', '0', '1', '0', '1', '0'], 'globals as at power-up, millis() from the wake');
  assert.equal(later.runner.wakes, 2);
  const esp = runFor('void setup() { Serial.begin(115200); Serial.println("x"); ESP.deepSleep(1000000); }\nvoid loop() { }', 'esp32c3', 2.5);
  assert.deepEqual(esp.runner.log, ['x', 'x', 'x']);
  const forever = runFor('void setup() { esp_deep_sleep_start(); }\nvoid loop() { }', 'esp32', 0.5);
  assert.deepEqual(forever.runner.sleeping, { until: null });
  const uno = runFor('void setup() { esp_deep_sleep_start(); }\nvoid loop() { }', 'uno', 0);
  assert.match(uno.runner.error, /^esp_deep_sleep_start is not declared on an UNO/);
});

// ── 5. Interrupts ──

test('attachInterrupt runs its handler at each edge, while loop() waits in a delay', () => {
  const sketch = (mode, extra = '') => `volatile int count = 0;\nvoid onPress() { count++; }\nvoid setup() { Serial.begin(9600); pinMode(2, INPUT_PULLUP); attachInterrupt(digitalPinToInterrupt(2), onPress, ${mode}); }\nvoid loop() { ${extra} delay(1000); Serial.println(count); }`;
  const presses = { press: ['S1@0.2+0.1', 'S1@0.5+0.1', 'S1@0.8+0.1'] };
  assert.deepEqual(runOf(sketch('FALLING'), 1.05, presses).serial.lines.map((l) => l.text), ['3']);
  assert.deepEqual(runOf(sketch('RISING'), 1.05, presses).serial.lines.map((l) => l.text), ['3']);
  assert.deepEqual(runOf(sketch('CHANGE'), 1.05, presses).serial.lines.map((l) => l.text), ['6']);
  // LOW: at every step the pin is low (a level interrupt), about 100 for a press of 100 ms.
  const low = Number(runOf(sketch('LOW'), 1.05, { press: ['S1@0.2+0.1'] }).serial.lines[0].text);
  assert.ok(low >= 95 && low <= 105, String(low));
  // detachInterrupt: no handler after it.
  assert.deepEqual(runOf(sketch('FALLING', 'detachInterrupt(digitalPinToInterrupt(2));'), 1.05, presses).serial.lines.map((l) => l.text), ['0']);
});

test('noInterrupts holds a handler and interrupts() lets it run', () => {
  const sketch = 'volatile int count = 0;\nvoid onPress() { count++; }\nvoid setup() { Serial.begin(9600); pinMode(2, INPUT_PULLUP); attachInterrupt(digitalPinToInterrupt(2), onPress, FALLING); }\nvoid loop() { noInterrupts(); delay(500); Serial.println(count); interrupts(); Serial.println(count); delay(500); }';
  assert.deepEqual(runOf(sketch, 0.6, { press: ['S1@0.2+0.1'] }).serial.lines.map((l) => l.text), ['0', '1']);
});

test('an interrupt on an UNO pin that has none: warned, the handler never runs (as on the board)', () => {
  const r = loopOnly('', 'void onPress() { }\nvoid other() { attachInterrupt(digitalPinToInterrupt(4), onPress, FALLING); }');
  assert.deepEqual(warned(r), []);
  const s = translateSketch('void onPress() { }\nvoid setup() {\n  attachInterrupt(digitalPinToInterrupt(4), onPress, FALLING);\n}\nvoid loop() { delay(10); }');
  const runner = createRunner(s.js, { family: 'uno', pins: [...Array(20).keys()], read: () => null });
  runner.advance(0);
  assert.deepEqual(runner.warnings, [{ code: 'SIM_PROGRAM_NO_INTERRUPT', line: 3, pin: 4, variant: 'uno' }]);
  const esp = createRunner(s.js, { family: 'esp32', pins: [4, 13], read: () => null });
  esp.advance(0);
  assert.deepEqual(esp.warnings, [], 'an ESP32 has an interrupt on every GPIO');
});

test('bytes sent on an UNO\'s TX arrive at the ESP32 whose RX2 is on its net: both programs in one run', () => {
  const uno = 'int n = 0;\nvoid setup() { Serial.begin(9600); }\nvoid loop() { Serial.println(n); n++; delay(1000); }';
  const esp = 'void setup() { Serial.begin(115200); Serial2.begin(9600, SERIAL_8N1, 16, 17); }\nvoid loop() { if (Serial2.available()) { int v = Serial2.parseInt(); Serial.print("got "); Serial.println(v); } }';
  const r = runCircuit(link(uno, esp), { seconds: 2.5 });
  const of = (board) => r.serial.lines.filter((l) => l.board === board).map((l) => l.text);
  assert.deepEqual(of('U1'), ['0', '1', '2']);
  assert.deepEqual(of('E1'), ['got 0', 'got 1', 'got 2']);
  // "0\r\n" is three characters, 3.1 ms at 9600 baud: the line arrives when its bytes are through.
  const first = r.serial.lines.find((l) => l.board === 'E1');
  assert.ok(first.t > 0.002 && first.t < 0.01, String(first.t));
  // readStringUntil reads to its end character.
  const words = runCircuit(link('void setup() { Serial.begin(9600); Serial.print("hello\\nworld\\n"); }\nvoid loop() { delay(1000); }', 'void setup() { Serial.begin(115200); Serial2.begin(9600); }\nvoid loop() { if (Serial2.available()) { String s = Serial2.readStringUntil(\'\\n\'); Serial.println(s); } }'), { seconds: 0.5 });
  assert.deepEqual(words.serial.lines.filter((l) => l.board === 'E1').map((l) => l.text), ['hello', 'world']);
});

test('two rates that differ pass nothing and say so', () => {
  const uno = 'void setup() { Serial.begin(115200); }\nvoid loop() { Serial.println(7); delay(200); }';
  const esp = 'void setup() { Serial.begin(115200); Serial2.begin(9600); }\nvoid loop() { if (Serial2.available()) Serial.println("heard"); delay(10); }';
  const r = runCircuit(link(uno, esp), { seconds: 0.5 });
  assert.deepEqual(r.serial.lines.filter((l) => l.board === 'E1'), []);
  assert.ok(r.issues.some((i) => i.code === 'SIM_PROGRAM_BAUD_MISMATCH' && i.params.part === 'E1'), JSON.stringify(r.issues.map((i) => i.code)));
});
