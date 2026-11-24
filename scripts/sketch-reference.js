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
import { LIBRARY_CLASSES, LIBRARY_CONSTANTS, LIBRARY_INCLUDES, NOT_IN_KIT, STRING_METHODS } from '../src/sim/libraries.js';

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
export function probeRun(source, { family = 'uno', seconds = 0.01, pins, typed } = {}) {
  const { js, issues } = translateSketch(source);
  if (js == null || issues.some((i) => i.code === 'SIM_PROGRAM_ERROR')) return { issues, error: 'not read' };
  const runner = createRunner(js, { family, states: {}, read: () => null, ...(pins && { pins }), ...(typed && { typed }) });
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
// Integers at the board's size, the bit macros, Strings, sprintf, typed input and what is refused.
const INTEGERS = 'void setup() { Serial.begin(9600); byte b = 255; b++; Serial.println(b); int i = 32767; i++; Serial.println(i); unsigned long start = 4294967290UL, now = 10; Serial.println(now - start); Serial.println(7 / 2); } void loop() { delay(1000); }';
const BITS = 'byte v = 178; void setup() { Serial.begin(9600); bitSet(v, 2); Serial.println(v); bitClear(v, 7); Serial.println(v); bitToggle(v, 0); Serial.println(v); bitWrite(v, 1, 0); Serial.println(v); } void loop() { delay(1000); }';
const NOT_LVALUE = 'void setup() { Serial.begin(9600); Serial.println(bitSet(5, 1)); } void loop() { delay(1000); }';
const REFERENCE = 'void inc(int &x) { x++; } void setup() { Serial.begin(9600); int a = 1; inc(a); Serial.println(a); } void loop() { delay(1000); }';
const STRINGS = 'void setup() { Serial.begin(9600); String s = "  Hi  "; s.trim(); s.toUpperCase(); char c = 33; s += c; Serial.println(s); Serial.println(s.length()); Serial.println(s.substring(0, 2) + 2.5); Serial.println(String(42).toInt() + 1); } void loop() { delay(1000); }';
const SPRINTF = 'char buf[24]; void setup() { Serial.begin(9600); sprintf(buf, "v=%04d %s %x %.1f", 42, "ok", 255, 1.5); Serial.println(buf); } void loop() { delay(1000); }';
const MACRO = '#define SQUARE(x) ((x) * (x))\nvoid setup() { Serial.begin(9600); Serial.println(SQUARE(5)); } void loop() { delay(1000); }';
const MENU = 'void setup() { Serial.begin(9600); } void loop() { if (Serial.available()) { char c = Serial.read(); Serial.print("got "); Serial.println(c); } }';
const REFUSED = {
  pointer: 'int x = 1; void setup() { int *p = &x; } void loop() { }',
  struct: 'struct Point { int x; int y; }; void setup() { } void loop() { }',
  class: 'class Blinker { public: int pin; }; void setup() { } void loop() { }',
  method: 'String s = "a"; void setup() { s.reverse(); } void loop() { }',
  member: 'int p = 0; void setup() { p.x = 1; } void loop() { }',
  macro: '#define NAME(x) #x\nvoid setup() { } void loop() { }',
};
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
  const ints = { uno: printed(probeRun(INTEGERS)), esp32: printed(probeRun(INTEGERS, { family: 'esp32' })) };
  const sized = ints.uno === '0 -32768 16 3' && ints.esp32 === '0 32768 16 3';
  const bits = printed(probeRun(BITS)) === '182 54 55 53' && probe(NOT_LVALUE).issues.some((i) => i.code === 'SIM_PROGRAM_NOT_LVALUE');
  const reference = probe(REFERENCE).issues.some((i) => i.code === 'SIM_PROGRAM_REFERENCE');
  const strings = probeRun(STRINGS);
  const stringsWork = works(strings) && printed(strings) === 'HI! 3 HI2.50 43';
  const formats = { uno: printed(probeRun(SPRINTF)), esp32: printed(probeRun(SPRINTF, { family: 'esp32' })) };
  const sprintf = formats.uno === 'v=0042 ok ff ?' && formats.esp32 === 'v=0042 ok ff 1.5';
  const macros = printed(probeRun(MACRO)) === '25';
  const typed = printed(probeRun(MENU, { seconds: 0.05, typed: [{ port: 0, text: '7', time: 0.02 }] })) === 'got 7';
  const refused = Object.fromEntries(Object.entries(REFUSED).map(([k, src]) => [k, probe(src)]));
  const refusedBy = (k, codeName) => refused[k].error === 'not read' && refused[k].issues.some((i) => i.code === codeName);
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
    ...(macros ? ['- Macros: `#define NAME value`, and simple function-like ones, expanded where they are used (`#define SQUARE(x) ((x) * (x))`; `SQUARE(5)` is 25). One with `#` or `##`, or that expands into itself, is refused: write a function.'] : []),
    '',
    '## Integers',
    '',
    sized
      ? `- A value stored in a variable, a parameter, an array element or a function's return keeps its type's size on the board in use, as a board stores it: \`byte\` / \`uint8_t\` 8 bits (\`byte b = 255; b++;\` is 0), \`char\` / \`int8_t\` signed 8, \`int\` and \`unsigned int\` 16 bits on an UNO and 32 on an ESP32 (\`int i = 32767; i++;\` prints ${ints.uno.split(' ')[1]} on an UNO, ${ints.esp32.split(' ')[1]} on an ESP32), \`long\` / \`unsigned long\` / \`uint32_t\` 32, \`bool\` 0 or 1; a \`float\` stays a number. Arithmetic with an \`unsigned long\` in it wraps as the board's does (\`now - start\` with \`now = 10\` and \`start = 4294967290\` prints ${ints.uno.split(' ')[2]}), and \`millis()\` and \`micros()\` wrap at 2^32, so a \`millis()\` timer works across the wrap; an \`int\` sum that overflows inside an expression is left as it is (C leaves it undefined), and wraps when stored. Integer division truncates (\`7 / 2\` is ${ints.uno.split(' ')[3]}).`
      : '- Integers: the probe of their sizes did not print what a board does: see `kit simulate <folder> --run`.',
    bits ? '- `bitSet`, `bitClear`, `bitToggle` and `bitWrite` change the variable or array element they are given, as Arduino\'s macros do (`byte v = 178; bitSet(v, 2);` makes it 182); given something that is not a variable (`bitSet(5, 1)`) they are a warning, as a compiler refuses them, and only give the value.' : '- The bit macros did not change their variable in the probe.',
    ...(reference ? ['- A parameter passed by reference (`void inc(int &x)`) is a copy in the kit, with a warning: return the new value instead (`a = inc(a);`) or change a global.'] : []),
    '',
    '## Text',
    '',
    stringsWork ? `- \`String\` and its methods: ${STRING_METHODS.map((m) => code(m)).join(', ')} (\`trim\`, \`toUpperCase\`, \`toLowerCase\`, \`concat\`, \`replace\` and \`remove\` change the String, as on a board). A \`char\` added to a String is its letter and a \`float\` has two decimals (\`s += c\`, \`s + 2.5\`); \`char *text = "…"\` is a text too.` : '- `String` holds text; the probe of its methods did not run as a board does.',
    sprintf ? `- \`sprintf(buf, …)\` and \`snprintf(buf, size, …)\` write into a \`char\` buffer, which then prints as that text: \`%d %i %u %ld %lu %x %X %c %s %%\` with \`-\`, \`0\`, \`+\` and a width; an UNO's \`sprintf\` has no \`%f\` (it writes \`?\`, as avr-libc does: \`${formats.uno}\`), an ESP32's has (\`${formats.esp32}\`). An untouched buffer prints as nothing.` : '- `sprintf` did not format in the probe: print the pieces with `Serial.print`.',
    '',
    '## Refused, and what to write instead',
    '',
    'Each of these stops the program before it runs, and the warning names the construct and its line:',
    ...(refusedBy('pointer', 'SIM_PROGRAM_POINTER') ? ['- Pointers (`int *p = &x;`, `*p`, `p->x`): use the variable itself, or an array and an index (`values[i]`); a text is a `String` or `char *text = "…"`.'] : []),
    ...(refusedBy('struct', 'SIM_PROGRAM_TYPE_DECL') && refusedBy('class', 'SIM_PROGRAM_TYPE_DECL') ? ['- `struct`, `class`, `union`, `enum`, `typedef`, `template`: write the fields as separate variables (`pointX`, `pointY`) or as arrays with one index (`x[i]`, `y[i]`), the methods as functions that take what they change, an enum as constants (`const int IDLE = 0;`).'] : []),
    ...(refusedBy('method', 'SIM_PROGRAM_STRING_METHOD') ? ['- A `String` method not in the list above (`s.reverse()`): the warning lists the ones the kit reads.'] : []),
    ...(refusedBy('member', 'SIM_PROGRAM_MEMBER') ? ['- A member read with `.` on anything but `Serial`, a `String` or a library object (`p.x`): a variable of its own (`pointX`).'] : []),
    ...(refusedBy('macro', 'SIM_PROGRAM_MACRO') ? ['- A macro with `#` or `##`, or one that expands into itself: a function.'] : []),
    '',
    '## Interrupts, serial ports and deep sleep',
    '',
    interrupts ? '- `attachInterrupt(digitalPinToInterrupt(pin), handler, RISING | FALLING | CHANGE | LOW)`, `detachInterrupt`, `noInterrupts()` and `interrupts()` work on the pins that have an interrupt: an UNO\'s D2 and D3, any ESP32 GPIO. The handler runs at the step that sees the pin cross, between two statements of `loop()`, also during a `delay`. Another pin is warned and its handler never runs, as on the board.' : '- Interrupts (`attachInterrupt`) are not simulated: read the pin in `loop()` instead.',
    '- The kit\'s buttons do not bounce: a press is one clean edge, so a debounce in a sketch is exercised only as a lockout (the time it ignores the pin after a press), never against real bounce.',
    ports ? '- `Serial1` and `Serial2` on an ESP32 (`Serial1` on an ESP32-C3) are ports of their own (`Serial2.begin(9600, SERIAL_8N1, 16, 17)`), their output labelled in the run (`Serial2: …`). An UNO has only `Serial`: `Serial2` there stops the program, as a real UNO would not compile it.' : '- `Serial1` and `Serial2` are not simulated.',
    ports ? '- Between two boards the bytes follow the wire: a board hears another board\'s TX when the TX pin\'s high and low reach its RX pin as a high and a low for it, directly or through resistors (the usual 1 kΩ over 2 kΩ divider from an UNO\'s 5 V to an ESP32\'s 3.3 V carries data, and takes away the 5 V hazard of the direct wire); a path that never gives the RX pin both levels, or an RX pin wired to nothing that sends, is a warning saying why (`available`, `read`, `parseInt`, `readStringUntil` read what arrives; a received `\\r` prints as nothing).' : '',
    typed ? '- Typing to a board: `simulate --run 3 --serial "1@0.5"` sends the text to its USB `Serial` at 0.5 s (repeatable; `\\n` for a new line; `U1:` in front names the board, `Serial2:` the port). A sketch that reads its serial port with nothing typed and nothing wired to RX gets a note saying so and naming the option. A DHT11 read in its first second prints `nan`, with a note saying it was still powering up.' : '',
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
