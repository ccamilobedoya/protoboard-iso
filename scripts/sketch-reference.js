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
// program stopped with an error.
export function probe(source) {
  const { js, issues } = translateSketch(source);
  if (issues.some((i) => i.code === 'SIM_PROGRAM_ERROR')) return { issues, error: 'not read' };
  const runner = createRunner(js, { family: 'uno', states: {}, read: () => null });
  runner.advance(0.01);
  return { issues, error: runner.error };
}
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
    `- Arrays: ${one ? 'one dimension, `int a[3] = {1, 2, 3};`' : 'none'}; ${two ? 'two dimensions too (`int a[2][3] = {{…}, {…}};`)' : 'two dimensions are not read (`int a[2][3]` stops the program before it starts): flatten one into one dimension, `a[row * 3 + col]`'}.`,
    statements ? '- Statements: if / else, while, do … while, for, switch, break, continue, return; casts such as `(int) x`; number suffixes (`1000UL`). No pointers, classes of your own or templates.' : '- Statements: the probe of if, for, while, do, switch and casts did not run: see `kit simulate <folder> --run`.',
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
