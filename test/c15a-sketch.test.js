// The sketch runner computes what a board computes (trust work, 2026-11): integers have their size
// on the board in use, the bit macros change their variable, a serial line follows the wire, the run
// can type to a board, and what the kit does not read is said in words a beginner's assistant can act
// on. Each case comes from a sketch a fresh agent wrote that ran with the wrong result and no word.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { translateSketch } from '../src/sim/sketch.js';
import { createRunner } from '../src/sim/program.js';
import { autoLayout } from './layout-generous.js';
// Its runs take under a second of a free machine (a run's step is at least its length over 20 000):
// the default machine-time budget, not test/run-generous.js.
import { runCircuit, parseStimuli, behaviourOf } from '../src/sim/run.js';
import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tempDir } from '../scripts/tmp.js';

const root = new URL('../', import.meta.url).pathname;
import { formatIssue } from '../src/index.js';

// A sketch run for a moment on a board of a family with nothing wired: what it printed and noted.
function runSketch(source, { family = 'uno', seconds = 0.01 } = {}) {
  const { js, issues } = translateSketch(source);
  if (!js) return { issues, log: null, error: 'not read' };
  const runner = createRunner(js, { family, states: {}, read: () => null });
  runner.advance(0);
  for (let t = 0; t < seconds - 1e-9; t += 0.01) runner.advance(0.01);
  return { issues, log: [...runner.log, ...(runner.line ? [runner.line] : [])], error: runner.error, runner };
}
const setup = (body, head = '') => `${head}\nvoid setup() { Serial.begin(9600); ${body} }\nvoid loop() { delay(1000); }`;
const codes = (issues) => issues.map((i) => i.code);

test('integers: a value stored in a variable is wrapped to its type, as an UNO stores it', () => {
  // The sketch that printed 256, 32768, -1, 260, 4294967296, 2147483648.
  const r = runSketch(setup('byte b = 255; b = b + 1; Serial.println(b); int i = 32767; i = i + 1; Serial.println(i); unsigned int u = 0; u = u - 1; Serial.println(u); uint8_t c = 250; c += 10; Serial.println(c); unsigned long ms = 4294967295UL; ms++; Serial.println(ms); long l = 2147483647L; l = l + 1; Serial.println(l);'));
  assert.deepEqual(r.issues, []);
  assert.deepEqual(r.log, ['0', '-32768', '65535', '4', '0', '-2147483648']);
});

test('integers: int and unsigned int are 32 bits on an ESP32, 16 on an UNO', () => {
  const body = 'int i = 32767; i++; Serial.println(i); unsigned int u = 0; u--; Serial.println(u); unsigned int a = 5, b = 10; Serial.println(a - b); uint16_t w = 5; Serial.println(w - 10);';
  assert.deepEqual(runSketch(setup(body), { family: 'esp32' }).log, ['32768', '4294967295', '4294967291', '-5']);
  assert.deepEqual(runSketch(setup(body)).log, ['-32768', '65535', '65531', '65531']);
});

test('integers: two unsigned longs subtract as a board does, the idiom every millis() timer relies on', () => {
  const r = runSketch(setup('unsigned long start = 4294967290UL; unsigned long now = 10UL; unsigned long diff = now - start; Serial.println(diff); Serial.println(now - start); Serial.println(now - start >= 16); unsigned long big = 4294967295UL; big = big + 2; Serial.println(big);'));
  assert.deepEqual(r.log, ['16', '16', '1', '1']);
  // In an expression that is never stored too, and with a literal or a long on the other side.
  assert.deepEqual(runSketch(setup('unsigned long t = 5; long k = 10; Serial.println(t - 10); Serial.println(t - k); Serial.println(1UL << 31);')).log, ['4294967291', '4294967291', '2147483648']);
});

test('integers: parameters, returns, array elements, casts and increments keep their type', () => {
  const r = runSketch(
    setup(
      'a[0]++; Serial.println(a[0]); a[1] += 255; Serial.println(a[1]); Serial.println(a[2]++); Serial.println(a[2]); Serial.println(++a[2]); Serial.println(f(0)); Serial.println(g(300)); byte b = 255; Serial.println(b++); Serial.println(b); Serial.println((byte) 300); char c = 200; Serial.println(c, DEC); bool q = 5; Serial.println(q); int n = 0; for (byte i = 250; i != 2; i++) n++; Serial.println(n); Serial.println(7 / 2); Serial.println(-7 / 2);',
      'byte a[3] = {300, 2, 3};\nunsigned int f(unsigned int x) { return x - 1; }\nbyte g(byte x) { return x; }',
    ),
  );
  assert.deepEqual(r.issues, []);
  assert.deepEqual(r.log, ['45', '1', '3', '4', '5', '65535', '44', '255', '0', '44', '-56', '1', '8', '3', '-3']);
});

test('integers: millis() and micros() wrap at 2^32; a float stays a number', () => {
  const r = runSketch(setup('float f = 2.5; f = f * 3; Serial.println(f); unsigned long last = millis(); Serial.println(millis() - last);'));
  assert.deepEqual(r.log, ['7.50', '0']);
  const { js } = translateSketch(setup('Serial.println(micros());'));
  const runner = createRunner(js, { family: 'esp32', states: {}, read: () => null });
  runner.time = 4294.967296 + 0.000005; // just past 2^32 µs
  runner.advance(0);
  assert.deepEqual(runner.log, ['5']);
});

test('bitWrite, bitSet, bitClear and bitToggle change their variable or element', () => {
  // The sketch that printed 178 three times.
  const r = runSketch(setup('byte v = 178; bitWrite(v, 0, 1); Serial.println(v); bitSet(v, 2); Serial.println(v); bitClear(v, 7); Serial.println(v); int w = 0; bitWrite(w, 3, 1); Serial.println(w); w = 5; bitSet(w, 4); Serial.println(w); bitToggle(w, 0); Serial.println(w);'));
  assert.deepEqual(r.issues, []);
  assert.deepEqual(r.log, ['179', '183', '55', '8', '21', '20']);
  const arr = runSketch(setup('bitSet(a[1], 3); Serial.println(a[1]); bitToggle(a[1], 0); Serial.println(a[1]); bitWrite(a[1], 3, 0); Serial.println(a[1]); bitSet(m, 31); Serial.println(m);', 'byte a[2] = {0, 0};\nunsigned long m = 0;'));
  assert.deepEqual(arr.log, ['8', '9', '1', '2147483648']);
});

test('a bit macro on something that is not a variable is what a compiler refuses: noted, with its line', () => {
  const r = runSketch(setup('int x = 1;\n  Serial.println(bitSet(5, 1));\n  bitClear(x + 1, 0);'));
  assert.deepEqual(codes(r.issues), ['SIM_PROGRAM_NOT_LVALUE', 'SIM_PROGRAM_NOT_LVALUE']);
  assert.deepEqual(r.issues.map((i) => [i.name, i.line]), [['bitSet', 3], ['bitClear', 4]]);
  assert.deepEqual(r.log, ['7']);
});

// ---- A serial line follows the wire: an UNO's TX into an ESP32's RX2, the ESP32 printing what it gets.
const TX = 'void setup() { Serial.begin(9600); }\nvoid loop() { Serial.println(24.9, 1); delay(1000); }';
const RX = "void setup() { Serial.begin(115200); Serial2.begin(9600, SERIAL_8N1, 16, 17); }\nvoid loop() { if (Serial2.available()) { String line = Serial2.readStringUntil('\\n'); Serial.print(\"Temperature: \"); Serial.println(line); } }";
function link(path) {
  const parts = [{ id: 'U1', part: 'UNO', program: TX }, { id: 'U2', part: 'ESP32-DEVKIT', program: RX }];
  const nets = [['U1.GND', 'U2.GND']];
  if (path === 'wire') nets.push(['U1.D1', 'U2.RX2']);
  else if (path === 'none') {
    parts.push({ id: 'R2', type: 'resistor', value: '10k' });
    nets.push(['U2.RX2', 'R2.1'], ['R2.2', 'U1.GND']);
  } else {
    const [top, bottom] = path;
    parts.push({ id: 'R1', type: 'resistor', value: top });
    if (bottom) parts.push({ id: 'R2', type: 'resistor', value: bottom });
    nets.push(['U1.D1', 'R1.1'], bottom ? ['R1.2', 'U2.RX2', 'R2.1'] : ['R1.2', 'U2.RX2']);
    if (bottom) nets.push(['R2.2', 'U1.GND']);
  }
  const laid = autoLayout({ parts, nets }, { lang: 'en' });
  const run = runCircuit(laid.circuit, { seconds: 1.5 });
  const all = [...(laid.review?.doubts ?? []), ...(laid.review?.hazards ?? []), ...(run.issues ?? [])];
  return { status: laid.status, got: run.serial.lines.filter((l) => l.board === 'U2').map((l) => l.text), codes: [...new Set(all.map((i) => i.code))], text: all.map((i) => formatIssue(i, 'en')) };
}

test('serial: bytes arrive through a 1k/2k divider and through a series resistor, as on the wire', () => {
  const divider = link(['1k', '2k']);
  assert.deepEqual(divider.got, ['Temperature: 24.9', 'Temperature: 24.9'], 'a received \\r is shown as nothing');
  assert.equal(divider.status, 'done');
  assert.ok(!divider.codes.includes('SIM_PIN_OVERVOLTAGE'), 'the divider keeps RX2 at 3.3 V: no 5 V hazard');
  assert.deepEqual(link(['1k']).got, ['Temperature: 24.9', 'Temperature: 24.9']);
  // The direct wire still carries data, and still warns of 5 V into a 3.3 V pin.
  const wire = link('wire');
  assert.deepEqual(wire.got, ['Temperature: 24.9', 'Temperature: 24.9']);
  assert.ok(wire.codes.includes('SIM_PIN_OVERVOLTAGE'), JSON.stringify(wire.codes));
});

test('serial: a path that never gives RX both levels, or no TX at all, is a doubt that says why', () => {
  const weak = link(['10k', '1k']);
  assert.deepEqual(weak.got, []);
  assert.equal(weak.status, 'warnings');
  const why = weak.text.find((t) => t.includes('SIM_SERIAL') || t.includes('cannot carry data'));
  assert.match(why, /U2: Serial2 reads its RX pin RX2, which U1's TX reaches through the circuit at 453 mV when it idles high and 0 V when it sends a 0/);
  const none = link('none');
  assert.deepEqual(none.got, []);
  assert.ok(none.codes.includes('SIM_SERIAL_NO_TX'), JSON.stringify(none.codes));
  assert.match(none.text.find((t) => t.includes('nothing on that pin sends')), /--serial/);
});

// ---- Something can type to the board: simulate --run … --serial "<text>@<seconds>".
const MENU = "void setup() { Serial.begin(9600); pinMode(8, OUTPUT); pinMode(9, OUTPUT); Serial.println(\"Type 1 or 2\"); }\nvoid loop() { if (Serial.available() > 0) { char c = Serial.read(); if (c == '1' || c == '2') { digitalWrite(8, c == '1' ? HIGH : LOW); digitalWrite(9, c == '2' ? HIGH : LOW); Serial.print(\"LED \"); Serial.print(c); Serial.println(\" on\"); } else if (c != '\\n') Serial.println(\"Unknown option\"); } }";
const menuSpec = () => ({ parts: [{ id: 'U1', part: 'UNO', program: MENU }, { id: 'R1', type: 'resistor', value: '220' }, { id: 'D1', type: 'led', color: 'red' }], nets: [['U1.D8', 'R1.1'], ['R1.2', 'D1.A'], ['D1.K', 'U1.GND']] });
let menu = null;
const menuCircuit = () => (menu ??= autoLayout(menuSpec(), { lang: 'en' }));

test('serial input: --serial types text to the board at its time, with \\n and a board named in front', () => {
  const { stimuli, errors } = parseStimuli({ serial: ['2@0.3', 'U1:1\\n@0.6', 'x@0.9'] });
  assert.deepEqual(errors, []);
  assert.deepEqual(stimuli.serial.map((s) => [s.text, s.time]), [['2', 0.3], ['U1:1\n', 0.6], ['x', 0.9]]);
  const run = runCircuit(menuCircuit().circuit, { seconds: 1.2, stimuli });
  assert.deepEqual(run.serial.lines.map((l) => l.text), ['Type 1 or 2', 'LED 2 on', 'LED 1 on', 'Unknown option']);
  assert.ok(run.serial.lines[1].t >= 0.3 && run.serial.lines[1].t < 0.31, String(run.serial.lines[1].t));
  const d8 = run.outputs.find((o) => o.id === 'U1.D8');
  assert.ok(d8.onShare > 0.4 && d8.onShare < 0.6, String(d8.onShare));
  assert.ok(!run.issues.some((i) => i.code === 'SIM_SERIAL_WAITS'), 'typed: no note');
  // A port the board does not have, a board nobody has, and a text without its time are input errors.
  assert.deepEqual(runCircuit(menuCircuit().circuit, { seconds: 1, stimuli: parseStimuli({ serial: ['Serial2:1@0.5'] }).stimuli }).errors.map((e) => e.code), ['RUN_SERIAL_PORT']);
  assert.deepEqual(parseStimuli({ serial: ['1'] }).errors.map((e) => e.code), ['RUN_BAD_STIMULUS']);
});

test('serial input: a sketch that reads Serial with nothing sent gets one note naming --serial, and layout says it waits', () => {
  const run = runCircuit(menuCircuit().circuit, { seconds: 1 });
  const notes = run.issues.filter((i) => i.code === 'SIM_SERIAL_WAITS');
  assert.equal(notes.length, 1);
  assert.match(formatIssue(notes[0], 'en'), /U1: the program reads Serial, and nothing reaches it .*--serial "1@0.5"/);
  assert.match(formatIssue(notes[0], 'es'), /--serial "1@0.5"/);
  assert.deepEqual(behaviourOf(menuCircuit().circuit).serialWaits, ['U1']);
});

test('serial input: the command line takes --serial (repeatable) and prints what the board answered', () => {
  const dir = tempDir('c15a-serial-');
  writeFileSync(join(dir, 'circuit.json'), JSON.stringify(menuCircuit().circuit));
  const r = spawnSync(process.execPath, [join(root, 'bin/protoboard-iso.js'), 'simulate', dir, '--run', '1', '--serial', '2@0.2', '--serial', 'U1:1@0.5'], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /LED 2 on[\s\S]*LED 1 on/);
  const late = spawnSync(process.execPath, [join(root, 'bin/protoboard-iso.js'), 'simulate', dir, '--run', '1', '--serial', '1@3'], { encoding: 'utf8' });
  assert.match(late.stdout, /A change at 3 s comes after the run ends \(1 s\)/);
});

// ---- What the kit does not read is said in words an assistant can act on; what it can, it reads.
test('String methods are read: length, charAt, indexOf, substring, toInt, trim, toUpperCase, concat…', () => {
  const r = runSketch(setup('String a = "Hello"; String b = a + " world"; b = b + 42; Serial.println(b); Serial.println(b.length()); String t = "  ab  "; t.trim(); t.toUpperCase(); Serial.println(t); Serial.println(t.charAt(1)); Serial.println(t.indexOf(\'B\')); Serial.println(b.substring(0, 4)); String n = "42"; Serial.println(n.toInt() + 1); Serial.println(n.toFloat()); if (t.equals("AB") && t.startsWith("A")) Serial.println("yes"); t.concat(\'!\'); Serial.println(t);'));
  assert.deepEqual(r.issues, []);
  assert.deepEqual(r.log, ['Hello world42', '13', 'AB', 'B', '1', 'Hell', '43', '42.00', 'yes', 'AB!']);
  // A char added to a String is its letter, a float its two decimals; an empty String is "".
  assert.deepEqual(runSketch(setup('String in; char c = 65; in += c; in = in + c + 2.5; Serial.println(in); String e; Serial.println(e.length()); const char *msg = "hi"; Serial.println(msg); Serial.println(String(c) + String(3.14159, 3) + String(255, HEX));')).log, ['AA2.50', '0', 'hi', 'A3.142FF']);
});

test('sprintf and snprintf format into a char buffer; an AVR has no %f, an ESP32 does', () => {
  const body = 'char buf[32]; Serial.println(buf); int v = 42; sprintf(buf, "value=%d", v); Serial.println(buf); int n = snprintf(buf, 8, "%05d|%-3s|%x|%c|%%", -42, "ab", 255, 65); Serial.println(buf); sprintf(buf, "%u %lu %.1f", -1, 4294967295UL, 1.26); Serial.println(buf);';
  assert.deepEqual(runSketch(setup(body)).log, ['', 'value=42', '-0042|a', '65535 4294967295 ?']);
  assert.deepEqual(runSketch(setup(body), { family: 'esp32' }).log, ['', 'value=42', '-0042|a', '4294967295 4294967295 1.3']);
});

test('a simple function-like macro is expanded; one the kit cannot expand says to write a function', () => {
  assert.deepEqual(runSketch(setup('Serial.println(SQUARE(5) + MAXV); Serial.println(MAX(3, SQUARE(2)));', '#define SQUARE(x) ((x) * (x))\n#define MAXV 10\n#define MAX(a, b) ((a) > (b) ? (a) : (b))')).log, ['35', '4']);
  for (const head of ['#define S(x) #x', '#define SELF(x) SELF(x)\nint y = SELF(1);']) {
    const r = runSketch(setup('', head));
    assert.deepEqual(codes(r.issues), ['SIM_PROGRAM_MACRO'], head);
    assert.match(formatIssue({ severity: 'warning', code: 'SIM_PROGRAM_MACRO', params: { part: 'U1', ...r.issues[0] } }, 'en'), /Write it as a function/);
  }
});

test('pointers, struct, class and a member the kit does not read name the construct and what to write', () => {
  const said = (source) => {
    const r = runSketch(source);
    assert.equal(r.log, null, 'the program does not run');
    assert.equal(r.issues.length, 1, JSON.stringify(r.issues));
    const i = r.issues[0];
    return { code: i.code, line: i.line, en: formatIssue({ severity: 'warning', code: i.code, params: { part: 'U1', ...i } }, 'en'), es: formatIssue({ severity: 'warning', code: i.code, params: { part: 'U1', ...i } }, 'es') };
  };
  const pointer = said(setup('int x = 7;\n  int *p = &x;'));
  assert.deepEqual([pointer.code, pointer.line], ['SIM_PROGRAM_POINTER', 3]);
  assert.match(pointer.en, /pointers \(\*p, &x, p->x\) are not in the kit's Arduino subset/);
  assert.match(pointer.es, /los punteros/);
  const struct = said('struct Point { int x; int y; };\nPoint p;\nvoid setup() { }\nvoid loop() { }');
  assert.equal(struct.code, 'SIM_PROGRAM_TYPE_DECL');
  assert.match(struct.en, /declares a struct, .*separate variables \(pointX, pointY\) or as arrays/);
  assert.match(said('class Blinker { public: int pin; };\nvoid setup() { }\nvoid loop() { }').en, /declares a class/);
  const method = said(setup('String s = "a";\n  s.reverse();'));
  assert.equal(method.code, 'SIM_PROGRAM_STRING_METHOD');
  assert.match(method.en, /the String method reverse\(\), which the kit does not read/);
  assert.match(said(setup('int p = 0;\n  p.x = 3;')).en, /reads a member with "." \(p\.x\)/);
});

// ---- Small: a sensor read before it is ready prints nan, and one note says why.
test('a DHT11 read in its first second prints nan, with one note saying it was still powering up', () => {
  const sketch = (wait) => `#include <DHT.h>\nDHT dht(4, DHT11);\nvoid setup() { Serial.begin(115200); dht.begin(); delay(${wait}); Serial.println(dht.readTemperature(), 1); }\nvoid loop() { delay(1000); }`;
  const of = (wait) => {
    const laid = autoLayout({ parts: [{ id: 'U1', part: 'ESP32-DEVKIT', program: sketch(wait) }, { id: 'S1', part: 'DHT11' }], nets: [['S1.+', 'U1.3V3'], ['S1.−', 'U1.GND'], ['S1.S', 'U1.D4']] }, { lang: 'en' });
    return runCircuit(laid.circuit, { seconds: 2 });
  };
  const early = of(300);
  assert.deepEqual(early.serial.lines.map((l) => l.text), ['nan']);
  const notes = early.issues.filter((i) => i.code === 'SIM_LIBRARY_EARLY');
  assert.equal(notes.length, 1);
  assert.match(formatIssue(notes[0], 'en'), /U1: the program read S1 at 300 ms, while it was still powering up/);
  const ready = of(1500);
  assert.deepEqual(ready.serial.lines.map((l) => l.text), ['25.0']);
  assert.ok(!ready.issues.some((i) => i.code === 'SIM_LIBRARY_EARLY'));
});

test('a reference parameter is a copy in the kit, with a warning; a method of a text expression is read', () => {
  const r = runSketch(setup('int a = 1;\n  inc(a); Serial.println(a);', 'void inc(int &x) { x++; }'));
  assert.deepEqual(codes(r.issues), ['SIM_PROGRAM_REFERENCE']);
  assert.deepEqual(r.log, ['1']);
  assert.match(formatIssue({ severity: 'warning', code: 'SIM_PROGRAM_REFERENCE', params: { part: 'U1', ...r.issues[0] } }, 'en'), /the kit passes a copy/);
  assert.deepEqual(runSketch(setup('Serial.println(String(42).toInt() + 1); Serial.println(names[1].length()); String s = "ab"; Serial.println((s + "cd").substring(1, 3));', 'String names[2] = {"ab", "cde"};')).log, ['43', '3', 'bc']);
});
