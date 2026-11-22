// What a board's program may use, as the skill's reference plugin-src/references/sketch.md: written
// from the simulator's own tables (src/sim/sketch.js SKETCH_API, src/sim/libraries.js) and from a
// probe of each common Arduino name through the translator and the runner, so what it says is what
// the simulator does today. scripts/parts-reference.js writes it with parts.md; test/sketch-reference
// .test.js fails when it is stale.
//
//   node scripts/sketch-reference.js             show it
//   npm run parts-reference -- --write            write it (with parts.md)

import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { SKETCH_API, translateSketch } from '../src/sim/sketch.js';
import { createRunner } from '../src/sim/program.js';
import { LIBRARY_CLASSES, LIBRARY_CONSTANTS, LIBRARY_INCLUDES, NOT_IN_KIT } from '../src/sim/libraries.js';

const root = fileURLToPath(new URL('../', import.meta.url));
export const FILE = join(root, 'plugin-src/references/sketch.md');

const code = (s) => `\`${s}\``;

// A sketch run for a moment on an UNO with nothing wired: what the translator noted and whether the
// program stopped with an error. A sketch the translator refuses (a read error, a two-dimensional
// array) has no program to run (js is null), as in compile.js: it is "not read", never run.
export function probe(source) {
  const { issues, error } = probeRun(source);
  return { issues, error };
}
// The same, run longer on a board of any family, with what it printed, the runtime's warnings and
// how many times it woke from deep sleep.
export function probeRun(source, { family = 'uno', seconds = 0.01, pins } = {}) {
  const { js, issues } = translateSketch(source);
  if (js == null || issues.some((i) => i.code === 'SIM_PROGRAM_ERROR')) return { issues, error: 'not read' };
  const runner = createRunner(js, { family, states: {}, read: () => null, ...(pins && { pins }) });
  runner.advance(0);
  for (let t = 0; t < seconds - 1e-9; t += 0.01) runner.advance(0.01);
  return { issues, error: runner.error, log: [...runner.log, ...(runner.line ? [runner.line] : [])], warnings: runner.warnings.map((w) => w.code), wakes: runner.wakes ?? 0 };
}
// What a probe printed, as one text (for the sentences that quote it).
const printed = (r) => (r.log ?? []).join(' ');
const UNO_PINS = [...Array(20).keys()];
const works = (r) => !r.issues.length && !r.error;

// Common Arduino names beyond the simulator's table, probed one by one.
const FUNCTIONS = ['delay', 'delayMicroseconds', 'shiftOut', 'shiftIn', 'attachInterrupt', 'detachInterrupt', 'interrupts', 'noInterrupts', 'analogReference', 'analogReadResolution', 'tan', 'atan2', 'sq', 'highByte', 'lowByte', 'bit'];
const CONSTANTS = ['HIGH', 'LOW', 'INPUT', 'OUTPUT', 'INPUT_PULLUP', 'INPUT_PULLDOWN', 'LED_BUILTIN', 'A0', 'A5', 'A6', 'A7', 'PI', 'true', 'false', 'MSBFIRST', 'LSBFIRST', 'RISING', 'FALLING', 'CHANGE', 'DEG_TO_RAD'];
const SERIAL = ['begin', 'print', 'println', 'available', 'read', 'write', 'printf', 'flush'];
const TYPES = ['int', 'long', 'unsigned long', 'byte', 'bool', 'boolean', 'char', 'float', 'double', 'uint8_t', 'uint16_t', 'int32_t', 'word', 'String'];
const LIBRARIES = ['Servo.h', 'LiquidCrystal.h', 'LiquidCrystal_I2C.h', 'Adafruit_NeoPixel.h', 'IRremote.h'];

const callOf = (name) => `void setup() { long x = ${name}(1, 2); } void loop() { delay(1000); }`;
const constantOf = (name) => `void setup() { long x = ${name}; } void loop() { delay(1000); }`;
const serialOf = (m) => `void setup() { Serial.${m}(1); } void loop() { delay(1000); }`;
const typeOf = (type) => `${type} v; void setup() { } void loop() { delay(1000); }`;
const includeOf = (h) => `#include <${h}>\nvoid setup() { } void loop() { delay(1000); }`;
// Probes of what a program prints, of interrupts, of the serial ports and of deep sleep.
const PRINTS = "void setup() { Serial.begin(9600); char c = 'B'; Serial.println('Z'); Serial.println(c); Serial.println(c + 1); Serial.println(c, DEC); Serial.write(65); Serial.println(); Serial.println(255, HEX); Serial.println(3.14159, 3); } void loop() { delay(1000); }";
const INTERRUPT = (pin) => `volatile int n = 0; void count() { n++; } void setup() { attachInterrupt(digitalPinToInterrupt(${pin}), count, FALLING); noInterrupts(); interrupts(); } void loop() { delay(1000); }`;
const PORT2 = 'void setup() { Serial2.begin(9600, SERIAL_8N1, 16, 17); Serial2.println(1); } void loop() { delay(1000); }';
const SLEEP = 'int boots = 0; void setup() { Serial.begin(115200); boots++; Serial.println(boots); esp_sleep_enable_timer_wakeup(100000); esp_deep_sleep_start(); } void loop() { }';
const STRING_METHOD = 'String s = "ab"; void setup() { int n = s.length(); } void loop() { delay(1000); }';
const STATEMENTS = 'int n = 0; int f(int x) { return (int) x * 2; } void setup() { for (int i = 0; i < 3; i++) { if (i == 1) continue; else n += f(i); } while (n > 100) break; do { n--; } while (n > 50); switch (n) { case 1: n = 2; break; default: n = 3; } unsigned long t = 1000UL; } void loop() { delay(1000); }';
const ARRAYS = {
  one: 'int a[3] = {1, 2, 3}; void setup() { a[1] = a[0] + a[2]; Serial.println(a[1]); } void loop() { delay(1000); }',
  two: 'int a[2][3] = {{1, 2, 3}, {4, 5, 6}}; void setup() { a[1][2] = a[0][1]; Serial.println(a[1][2]); } void loop() { delay(1000); }',
};

const split = (names, of) => {
  const yes = [];
  const no = [];
  for (const n of names) (works(probe(of(n))) ? yes : no).push(n);
  return { yes, no };
};

export function sketchReference() {
  const fns = split(FUNCTIONS.filter((f) => !SKETCH_API.includes(f)), callOf);
  const consts = split(CONSTANTS, constantOf);
  const serial = split(SERIAL, serialOf);
  const types = split(TYPES, typeOf);
  const libs = split(LIBRARIES, includeOf);
  const two = works(probe(ARRAYS.two));
  const one = works(probe(ARRAYS.one));
  const stringMethods = works(probe(STRING_METHOD));
  const statements = works(probe(STATEMENTS));
  const prints = probeRun(PRINTS);
  const charLetter = printed(prints).startsWith('Z B 67 66 A');
  const onD2 = probeRun(INTERRUPT(2), { pins: UNO_PINS });
  const onD4 = probeRun(INTERRUPT(4), { pins: UNO_PINS });
  const interrupts = works(onD2) && onD4.warnings.includes('SIM_PROGRAM_NO_INTERRUPT');
  const port2 = probeRun(PORT2, { family: 'esp32' });
  const port2Uno = probeRun(PORT2);
  const ports = works(port2) && printed(port2) === 'Serial2: 1' && /Serial2 is not declared on an UNO/.test(port2Uno.error ?? '');
  const sleep = probeRun(SLEEP, { family: 'esp32', seconds: 0.25 });
  const sleeps = works(sleep) && sleep.wakes === 2 && printed(sleep) === '1 1 1';
  const list = (xs) => (xs.length ? xs.map(code).join(', ') : 'none');
  const lines = [
    '# What a sketch may use',
    '',
    '<!-- generated: npm run parts-reference -- --write (from the simulator\'s own tables and a probe of each name; do not edit) -->',
    '',
    'A board\'s program (a `.ino` file beside `circuit.json`, named in `"program"`) runs in the',
    'simulator as a subset of Arduino C++. This is what that subset takes today. A name it does not',
    'know is not an error of the circuit: `layout` and `simulate --run` say "`<name>()` … is not',
    'something the simulator knows; it returns 0" or "the program stopped with an error", and the kit',
    'cannot confirm what the program does (`WARNINGS`). Tell the user so; write the sketch with what',
    'is below when they want the kit to check it.',
    '',
    '## Functions',
    '',
    `- From the simulator's table: ${list(SKETCH_API)}.`,
    `- Also: ${list(fns.yes)}; your own functions, with their types.`,
    `- Not known (noted, they return 0 or stop the program): ${list(fns.no)}.`,
    '',
    '## Serial',
    '',
    `- \`Serial.\` ${list(serial.yes)}; not known: ${list(serial.no)}.`,
    '',
    '## Constants',
    '',
    `- Known: ${list(consts.yes)} (the analog pins of the board: \`A0\` … \`A5\` on an UNO); \`#define NAME value\` and \`const\` globals of your own.`,
    `- Not defined (a program that uses one stops): ${list(consts.no)}.`,
    '',
    '## Types and arrays',
    '',
    `- Types: ${list(types.yes)}${types.no.length ? `; not read: ${list(types.no)}` : ''}${types.yes.includes('String') && !stringMethods ? '. A `String` holds text for `Serial.print`; its methods (`.length()`, `.substring()`…) are not read' : ''}.`,
    `- Arrays: ${one ? 'one dimension, `int a[3] = {1, 2, 3};`' : 'none'}; ${two ? 'two dimensions too (`int a[2][3] = {{…}, {…}};`)' : 'two dimensions are refused (`int a[2][3]`: the kit names the array and its line, and the program does not run): flatten one into one dimension, `a[row * 3 + col]`'}.`,
    ...(charLetter ? ['- Printing: a `char` prints as its letter (`Serial.println(\'Z\')` prints `Z`, a `char` variable too); arithmetic on it is a number (`c + 1` prints 67) and `Serial.println(c, DEC)` the number; `Serial.write(65)` prints `A`; an integer\'s second argument is its base (`HEX`, `BIN`, `OCT`, `DEC`), a float\'s its decimals (`Serial.println(3.14159, 3)` is `3.142`).'] : []),
    statements ? '- Statements: if / else, while, do … while, for, switch, break, continue, return; casts such as `(int) x`; number suffixes (`1000UL`). No pointers, classes of your own or templates.' : '- Statements: the probe of if, for, while, do, switch and casts did not run: see `kit simulate <folder> --run`.',
    '',
    '## Interrupts, serial ports and deep sleep',
    '',
    interrupts ? '- `attachInterrupt(digitalPinToInterrupt(pin), handler, RISING | FALLING | CHANGE | LOW)`, `detachInterrupt`, `noInterrupts()` and `interrupts()` work on the pins that have an interrupt: an UNO\'s D2 and D3, any ESP32 GPIO. The handler runs at the step that sees the pin cross, between two statements of `loop()`, also during a `delay`. Another pin is warned and its handler never runs, as on the board.' : '- Interrupts (`attachInterrupt`) are not simulated: read the pin in `loop()` instead.',
    '- The kit\'s buttons do not bounce: a press is one clean edge, so a debounce in a sketch is exercised only as a lockout (the time it ignores the pin after a press), never against real bounce.',
    ports ? '- `Serial1` and `Serial2` on an ESP32 (`Serial1` on an ESP32-C3) are ports of their own (`Serial2.begin(9600, SERIAL_8N1, 16, 17)`), their output labelled in the run (`Serial2: …`); the bytes a TX pin sends reach the board whose RX pin is on its net (`available`, `read`, `parseInt`, `readStringUntil`). An UNO has only `Serial`: `Serial2` there stops the program, as a real UNO would not compile it.' : '- `Serial1` and `Serial2` are not simulated.',
    sleeps ? '- ESP32 deep sleep (`esp_sleep_enable_timer_wakeup(µs)` and `esp_deep_sleep_start()`, or `ESP.deepSleep(µs)`): the program stops, its pins go back to inputs, and after the time given it starts again from `setup()` with its globals as at power-up.' : '- Deep sleep is not simulated: a real ESP32 stops, releases its pins and restarts from `setup()`.',
    '',
    '## Libraries',
    '',
    `- \`#include\`: ${list(LIBRARY_INCLUDES)}; other headers are noted and do nothing (probed: ${list(libs.no)}${libs.yes.length ? `; accepted: ${list(libs.yes)}` : ''}).`,
    ...LIBRARY_CLASSES.map((c) => `- ${code(c.name)}: ${c.methods.map((m) => code(`${m}()`)).join(', ')}${c.ignored?.length ? ` (${c.ignored.map((m) => code(`${m}()`)).join(', ')} accepted, it changes nothing the kit simulates)` : ''}.`),
    `- Library constants: ${list(Object.keys(LIBRARY_CONSTANTS))}${NOT_IN_KIT.length ? ` (${list(NOT_IN_KIT)}: sensors the kit does not have)` : ''}.`,
    '',
  ];
  return `${lines.join('\n')}`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.stdout.write(sketchReference());
