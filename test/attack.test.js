// Hostile input (CLAUDE.md, "External input"): a circuit, a list of operations, a board's
// program or a page's timeline may come from anyone. A sketch must not reach anything but the
// runtime, a program or timeline file must stay inside the circuit's folder, text must not become markup, and every input has a
// size cap (src/limits.js).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { translateSketch, SKETCH_API } from '../src/sim/sketch.js';
import { createRunner } from '../src/sim/program.js';
import { simulate, compile, createEngine } from '../src/sim/index.js';
import { autoLayout } from '../src/layout.js';
import { RECIPES, expandRecipe } from '../src/recipes/index.js';
import { resolveTarget, loadCircuit, createTarget } from '../src/node/workspace.js';
import { applyOps } from '../src/ops.js';
import { renderCircuit, checkCircuit } from '../src/index.js';
import { renderPage } from '../src/page.js';
import { LIMITS } from '../src/limits.js';
import { tourIssues } from '../src/tour.js';
import { CIRCUIT_FOLDER } from '../src/beside.js';

const codes = (issues) => issues.map((i) => i.code);
const board = { family: 'uno', states: {}, read: () => null, vil: 0.3, vih: 0.6, adcBits: 10, adcFull: 5 };
// Translates and runs a sketch's setup(); what it printed, its error, and whether it got out.
function run(source) {
  delete globalThis.__pwned;
  const r = translateSketch(source);
  const runner = r.js ? createRunner(r.js, board) : null;
  runner?.advance(0);
  const out = { r, log: runner?.log ?? [], error: runner?.error ?? null, pwned: globalThis.__pwned };
  delete globalThis.__pwned;
  return out;
}
const sketch = (body) => `void setup() { ${body} }\nvoid loop() { delay(1000); }`;

// What the JavaScript may name: its own words, the runtime's, and the sketch's ($-prefixed).
const ALLOWED = new Set([...SKETCH_API, 'HIGH', 'LOW', 'INPUT', 'OUTPUT', 'INPUT_PULLUP', 'INPUT_PULLDOWN', 'LED_BUILTIN', 'A0', 'A1', 'A2', 'A3', 'A4', 'A5', 'PI', 'Serial', 'DHT11', 'DHT22', 'NAN', 'true', 'false', '__int', '__missing', '__idx', '__array', '__new', '__lib', '__str', 'let', 'const', 'function', 'yield', 'return', 'if', 'else', 'while', 'do', 'for', 'switch', 'case', 'default', 'break', 'continue', 'undefined']);
function strayNames(js) {
  // The body, without the prelude (two lines) and the last line, and without the quoted names of
  // __missing("name", …), which JSON.stringify writes.
  // Serial.<method>( is the one member access allowed; any other "." must be inside a number.
  const body = js
    .split('\n')
    .slice(2, -1)
    .join('\n')
    .replace(/__missing\("[^"\\]*"/g, '__missing(')
    .replace(/Serial\.(begin|print|println|available|read)\(/g, 'Serial(');
  const names = body.match(/(?<![\w$.])[A-Za-z_$][\w$]*/g) ?? [];
  const members = body.match(/\.[A-Za-z_$]/g) ?? [];
  return [...names.filter((n) => !n.startsWith('$') && !ALLOWED.has(n)), ...members];
}

test('attack: a sketch cannot reach JavaScript through a member, an index or a global', () => {
  const member = run(sketch('Serial.println("".constructor.constructor("globalThis.__pwned = 1")());'));
  assert.equal(member.r.js, null, 'a "." other than Serial.<method> is refused');
  assert.equal(member.pwned, undefined);
  const index = run(sketch('Serial.println(""["constructor"]["constructor"]("globalThis.__pwned = 1")());'));
  assert.equal(index.pwned, undefined, 'an index is a number, never "constructor"');
  assert.match(index.r.js, /\[__idx\(__str\[1\]\)\]/);
  const global = run(sketch('Serial.println(process); Serial.println(globalThis); Serial.println(api);'));
  assert.ok(global.r.js);
  assert.match(global.error, /\$process is not defined/, 'a name of the sketch is its own: $process');
  const viaCall = run(sketch('int x = Function("globalThis.__pwned = 1"); eval("globalThis.__pwned = 1");'));
  assert.equal(viaCall.pwned, undefined, 'an unknown call returns 0 and is noted');
  assert.deepEqual(codes(viaCall.r.issues), ['SIM_PROGRAM_UNSUPPORTED', 'SIM_PROGRAM_UNSUPPORTED']);
  const own = run('int __int = 1; int api = 2; int constructor = 3;\n' + sketch('Serial.println(__int + api + constructor);'));
  assert.deepEqual(own.log, ['6'], 'names that are JavaScript\'s or the runtime\'s are the sketch\'s own');
});

test('attack: a string never lands in the code, and a "/" where a value goes is refused', () => {
  // A "/" before a string would start a regular expression ending inside it; the rest would be code.
  const regex = run(sketch('int x = / "/; globalThis.__pwned = 1; //";'));
  assert.equal(regex.r.js, null);
  assert.equal(regex.pwned, undefined);
  assert.equal(run(sketch('int x = 1; x /= 2; x = (4) / 2; x = -8 / 2;')).r.issues.length, 0, 'division still reads');
  for (const s of ['"\\"); globalThis.__pwned = 1; ("', '"</script><script>globalThis.__pwned = 1</script>"', '"\\u0022 + (globalThis.__pwned = 1) + \\u0022"']) {
    const r = run(sketch(`Serial.println(${s});`));
    assert.equal(r.pwned, undefined, s);
    assert.ok(!r.r.js?.split('\n').slice(2).join('\n').includes('pwned'), 'only __str holds the text');
  }
  const text = run('#define MSG "hola"\n' + sketch('Serial.println(MSG); Serial.println("a\\tb\\"c\\x41");'));
  assert.deepEqual(text.log, ['hola', 'a\tb"cA'], 'a #define shares the strings; C escapes are read');
  assert.equal(run(sketch('Serial.println("open);')).r.js, null, 'a string that never closes');
});

test('attack: the JavaScript of every recipe and of hostile sketches names nothing else', () => {
  const programs = Object.keys(RECIPES).flatMap((name) => expandRecipe(name).spec.parts.map((p) => p.program).filter(Boolean));
  assert.ok(programs.length >= 5);
  const hostile = [sketch('int a[3] = {1, 2, 3}; a[a[0]] = window + document + require + import_meta;'), sketch('Serial.write(1); Serial.flush();'), sketch('long t = pulseIn(constructor, HIGH, pulseInLong(7, LOW)); Serial.println(t);')];
  for (const p of [...programs, ...hostile]) {
    const { js } = translateSketch(p);
    assert.ok(js, p);
    assert.deepEqual(strayNames(js), [], p);
  }
});

// Library objects (docs/en/library-sensors.md): a declared object is never named in the code, its
// methods are numbers from the translator's own table, and nothing else about it is read.
const dhtSketch = (body, head = '') => `#include <DHT.h>\n${head}DHT dht(2, DHT11);\nvoid setup() { dht.begin(); ${body} }\nvoid loop() { delay(1000); }`;
// The code of a sketch after its prelude: no member but Serial.<method>(, no "[" before a quote.
const noKeys = (js) => {
  const body = js.split('\n').slice(2).join('\n');
  assert.ok(!/\.constructor|__proto__|prototype/.test(body), body);
  assert.ok(!/\[\s*["'`]/.test(js), 'no [ followed by a string anywhere in the code');
};
test('attack: a library object reaches nothing but its own methods', () => {
  for (const body of ['dht.constructor;', 'dht["x"]();', 'Serial.println(dht.constructor);', 'Serial.constructor;', 'dht.__proto__.x = 1;', 'dht;', 'int x = dht + 1;']) {
    const r = run(dhtSketch(body));
    assert.equal(r.r.js, null, body);
    assert.deepEqual(codes(r.r.issues), ['SIM_PROGRAM_ERROR'], body);
  }
  // A method not in the class's list is noted and returns 0; its name never lands in the code.
  const unknown = run(dhtSketch('Serial.println(dht.constructor("globalThis.__pwned = 1")); Serial.println(dht.read());'));
  assert.equal(unknown.pwned, undefined);
  assert.deepEqual(unknown.log, ['0', '0']);
  assert.deepEqual(unknown.r.issues.map((i) => i.name), ['dht.constructor', 'dht.read']);
  noKeys(unknown.r.js);
  assert.ok(!/constructor|\bread\b/.test(unknown.r.js.split('\n').slice(2).join('\n')));
  // An object named like the runtime's own names: Serial and the class names are refused; any other
  // name is the translator's to keep (the code has only the object's number).
  for (const head of ['DHT Serial(2, DHT11);\n', 'DHT Wire(2, DHT11);\n', 'DHT DHT(2, DHT11);\n', 'DHT millis(2, DHT11);\n', 'int x = 1;\nDHT x(2, DHT11);\n', 'DHT a(2, DHT11);\nDHT a(3, DHT11);\n', 'DHT f(2, DHT11, 6, 7);\n', 'Adafruit_BME280 bme(10);\n']) {
    const r = run(`${head}void setup() { }\nvoid loop() { }`);
    assert.equal(r.r.js, null, head);
  }
  const fn = run('DHT Function(2, DHT11);\nDHT globalThis(3, DHT11);\nvoid setup() { Function.begin(); Serial.println(Function.readTemperature()); globalThis.begin(); }\nvoid loop() { }');
  assert.ok(fn.r.js);
  const runner = createRunner(fn.r.js, board);
  runner.advance(0);
  runner.advance(0.05); // a read with no sensor still waits its 25 ms
  assert.equal(runner.error, null);
  assert.deepEqual(runner.log, ['nan'], 'no sensor answers: NaN, printed as the AVR core does');
  assert.equal(globalThis.Function.begin, undefined);
  assert.ok(!/Function|globalThis/.test(fn.r.js), 'the object names are not in the code');
  noKeys(fn.r.js);
  // Declared inside a function, used outside one, or a variable named like an object: refused.
  for (const source of ['void setup() { DHT d(2, DHT11); }\nvoid loop() { }', 'void setup() { }\nvoid loop() { static DHT d(2, DHT11); }', 'void f(DHT d) { }\nvoid setup() { }\nvoid loop() { }', 'DHT dht(2, DHT11);\nfloat t = dht.readTemperature();\nvoid setup() { }\nvoid loop() { }', dhtSketch('int dht = 1;'), dhtSketch('', '#define T dht.readTemperature()\n')]) {
    assert.equal(run(source).r.js, null, source);
  }
});

test('attack: library objects have a cap, and the runtime checks the numbers it is given', () => {
  const many = (n) => `${Array.from({ length: n }, (_, i) => `DHT d${i}(2, DHT11);`).join('\n')}\nvoid setup() { }\nvoid loop() { }`;
  assert.ok(translateSketch(many(LIMITS.libraryObjects)).js, 'up to the cap');
  const over = translateSketch(many(LIMITS.libraryObjects + 1));
  assert.equal(over.js, null);
  assert.deepEqual(codes(over.issues), ['SIM_PROGRAM_ERROR']);
  const huge = translateSketch(many(10_000));
  assert.equal(huge.js, null, '10 000 objects: refused');
  // Hand-written JavaScript calling the helpers with numbers the translator never writes: nothing.
  const js = 'const { __new, __lib, Serial } = api; return { setup: function* () { __new(-1, 0); __new(0, 99); __new("constructor", 0); __new(1.5, 0); __new(0, 0, 2, 11); Serial.println(yield* __lib(0, 99)); Serial.println(yield* __lib("constructor", 1)); Serial.println(yield* __lib(0, "constructor")); Serial.println(yield* __lib(0, -1)); Serial.println(yield* __lib(5, 1)); }, loop: function* () {} };';
  const runner = createRunner(js, board);
  runner.advance(0);
  assert.equal(runner.error, null);
  assert.deepEqual(runner.log, ['0', '0', '0', '0', '0']);
});

test('attack: a sketch cannot take the memory or the time of the machine', { timeout: 5000 }, () => {
  const long = translateSketch(sketch(`int x = 0; ${'x++; '.repeat(LIMITS.sketchChars / 5)}`));
  assert.equal(long.js, null);
  assert.deepEqual(codes(long.issues), ['SIM_PROGRAM_TOO_LARGE']);
  const big = run('int a[1000000000];\n' + sketch('a[5] = 7; Serial.println(a[5]);'));
  assert.deepEqual(big.log, ['7'], 'an array is capped, not refused');
  const busy = run('void setup() { while (true) { } }\nvoid loop() { }');
  assert.equal(busy.error, null, 'a loop that never waits gives the step back');
  assert.equal(run('void f(int "x") { }\n' + sketch('')).r.js, null, 'a parameter must be a name');
});

test('attack: pulseIn on a pin nothing drives gives the engine back, whatever its timeout', { timeout: 10000 }, () => {
  for (const loop of ['pulseIn(7, HIGH);', 'while (1) pulseIn(7, HIGH);', 'pulseIn(7, HIGH, 4000000000);', 'while (true) { pulseIn(7, HIGH, 0); }', 'pulseIn(7, HIGH, -5); delayMicroseconds(1);']) {
    const circuit = autoLayout({ board: 'auto', ...expandRecipe('uno-blink', { U1: `void setup() { pinMode(7, INPUT); }\nvoid loop() { ${loop} }` }).spec }).circuit;
    const engine = createEngine(compile(circuit).program);
    assert.ok(engine.start('dc', 1e-3));
    const t0 = performance.now(); // real clock: the wall time is what a hostile sketch must not take
    assert.ok(engine.advance(1), loop);
    const wall = performance.now() - t0; // real clock: the same measurement
    assert.ok(wall < 2000, `${loop}: ${Math.round(wall)} ms of wall time for one advance of 1 s`);
    for (let k = 0; k < 100; k++) assert.ok(engine.advance(1e-3), loop);
    assert.ok(Math.abs(engine.time - 1.1) < 1e-9, loop);
    const u1 = engine.read().parts.U1.program;
    assert.equal(u1.error, null, loop);
    // Whatever timeout it gives, it waits at most the cap.
    assert.ok(u1.until - u1.time <= LIMITS.pulseInMicros / 1e6 + 1e-9, loop);
  }
});

// A board with a program file, in a folder of its own.
function withProgram(file) {
  const root = mkdtempSync(join(tmpdir(), 'pbi-attack-'));
  const folder = join(root, 'circuit');
  mkdirSync(folder);
  const r = autoLayout({ board: 'auto', ...expandRecipe('esp32-led').spec });
  r.circuit.parts.find((p) => p.id === 'U1').program = file;
  writeFileSync(join(folder, 'circuit.json'), JSON.stringify(r.circuit));
  writeFileSync(join(root, 'secret.ino'), sketch('pinMode(13, OUTPUT); digitalWrite(13, HIGH);'));
  return { root, folder, issues: () => codes(simulate(loadCircuit(resolveTarget(folder))).issues).filter((c) => c.startsWith('SIM_PROGRAM')) };
}

test('attack: a program file stays inside the circuit\'s folder', () => {
  assert.deepEqual(withProgram('../secret.ino').issues(), ['SIM_PROGRAM_OUTSIDE']);
  const abs = withProgram('x.ino');
  const loaded = loadCircuit(resolveTarget(abs.folder));
  loaded.parts.find((p) => p.id === 'U1').program = join(abs.root, 'secret.ino');
  assert.deepEqual(codes(simulate(loaded).issues).filter((c) => c.startsWith('SIM_PROGRAM')), ['SIM_PROGRAM_OUTSIDE'], 'an absolute path');
  const link = withProgram('link.ino');
  symlinkSync(join(link.root, 'secret.ino'), join(link.folder, 'link.ino'));
  assert.deepEqual(link.issues(), ['SIM_PROGRAM_OUTSIDE'], 'a link that leads out');
  const big = withProgram('big.ino');
  writeFileSync(join(big.folder, 'big.ino'), ' '.repeat(LIMITS.sketchChars + 1));
  assert.deepEqual(big.issues(), ['SIM_PROGRAM_TOO_LARGE']);
  const inside = withProgram('sub/blink.ino');
  mkdirSync(join(inside.folder, 'sub'));
  writeFileSync(join(inside.folder, 'sub', 'blink.ino'), sketch('pinMode(13, OUTPUT);'));
  assert.deepEqual(inside.issues(), [], 'a subfolder is inside');
});

test('attack: text in a circuit is never markup in the drawing or the page', () => {
  const r = autoLayout({ board: 'auto', ...expandRecipe('led-resistor').spec });
  const c = r.circuit;
  const evil = '"><script>alert(1)</script><svg onload="alert(1)">';
  c.title = evil;
  c.description = evil;
  for (const p of c.parts) {
    p.label = evil;
    p.description = evil;
    if (p.type === 'wire') p.color = `red" onload="alert(1)`;
  }
  const svg = renderCircuit(c, { annotate: 'all' }).svg;
  assert.ok(!/<script|\son\w+=["']/i.test(svg), 'SVG (escaped text such as onload=&quot; is fine)');
  const { html } = renderPage(c);
  // Only the kit's own: the page data, the program (absent here: an unknown colour is an error)
  // and the script.
  const kit = ['<script type="application/json" id="page-data">', '<script type="application/json" id="sim-program">', '<script>'];
  for (const tag of html.match(/<script\b[^>]*>/g)) assert.ok(kit.includes(tag), tag);
  assert.ok(!/\son\w+=["']alert/i.test(html), 'no event attribute in the page');
});

test('attack: a hole of a row or rail the board does not have is an error, not a crash', () => {
  for (const [board, holes] of [['bb830', ['k5', 't9']], ['double', ['T+5', 'v3']], ['auto', ['U-3', 'a999999999999']]]) {
    const circuit = { version: 1, board, parts: [{ id: 'R1', type: 'resistor', value: '1k', pins: holes }] };
    const r = renderCircuit(circuit);
    assert.deepEqual([...new Set(r.issues.filter((i) => i.severity === 'error').map((i) => i.code))], ['UNKNOWN_HOLE'], `${board}: ${holes}`);
  }
});

test('attack: circuits and operations have size caps', () => {
  const many = Array.from({ length: LIMITS.ops + 1 }, () => ({ op: 'circuit', clearance: 1 }));
  assert.deepEqual(codes(applyOps({ parts: [] }, many).errors), ['OPS_TOO_MANY']);
  const full = { parts: Array.from({ length: LIMITS.parts }, (_, i) => ({ id: `W${i}`, type: 'wire', pins: ['a1', 'a2'] })) };
  assert.deepEqual(codes(applyOps(full, [{ op: 'add', part: { id: 'W', type: 'wire', pins: ['b1', 'b2'] } }]).errors), ['CIRCUIT_TOO_MANY_PARTS']);
  assert.deepEqual(codes(applyOps({ parts: [] }, [{ op: 'circuit', title: 'x'.repeat(LIMITS.circuitBytes) }]).errors), ['CIRCUIT_TOO_LARGE']);
  const root = mkdtempSync(join(tmpdir(), 'pbi-attack-'));
  assert.deepEqual(codes(createTarget(join(root, 'big'), { parts: [], title: 'x'.repeat(LIMITS.circuitBytes) }, { outputs: false }).errors), ['CIRCUIT_TOO_LARGE']);
  writeFileSync(join(root, 'huge.json'), JSON.stringify({ parts: [], title: 'x'.repeat(LIMITS.circuitBytes) }));
  assert.throws(() => loadCircuit(resolveTarget(join(root, 'huge.json'))), (e) => e.issue?.code === 'CIRCUIT_TOO_LARGE');
});

// The environment (sensors, S0): a field the registry does not have, a program too long or that is
// not a program are errors for check; the simulation drops them and runs, never slower for them.
test('attack: the environment has a cap, and what it cannot use is left out', { timeout: 5000 }, () => {
  const points = Array.from({ length: LIMITS.envPoints + 1 }, (_, k) => [k, 10]);
  const circuit = {
    supplies: [{ id: 'V1', voltage: 5 }],
    environment: { light: { program: { kind: 'keyframes', points } }, ['<b>x</b>'.repeat(30)]: 1, temperature: { program: { kind: 'cycle', period: 1e-300, min: 0, max: 1 } }, constructor: 1, __proto__: { light: 1 } },
    parts: [{ id: 'L1', type: 'ldr', pins: ['T+3', 'T-3'] }, { id: 'T1', type: 'thermistor', value: '10k', pins: ['T+5', 'T-5'] }],
  };
  const found = codes(checkCircuit(circuit).issues).filter((c) => c.startsWith('ENV_'));
  assert.deepEqual(found, ['ENV_TOO_LARGE', 'ENV_UNKNOWN_FIELD', 'ENV_UNKNOWN_FIELD']);
  assert.equal(checkCircuit(circuit).issues.find((i) => i.code === 'ENV_UNKNOWN_FIELD').params.field.length, 40);
  const program = compile(circuit).program;
  assert.equal(program.environment.spec.light.program, undefined, 'the keyframes are dropped');
  const engine = createEngine(program);
  assert.ok(engine.start('dc'));
  for (let k = 0; k < 50; k++) engine.advance(0.02);
  assert.ok(Number.isFinite(engine.read().parts.T1.current), 'a period too short for the clock keeps a number');
});

// A page's timeline (page.tour, stage and video V2): read only beside the circuit, capped, checked
// field by field, and its texts reach the page as text.
test('attack: a timeline stays inside the circuit\'s folder, has caps and is never markup', () => {
  const circuit = () => ({ ...autoLayout({ board: 'auto', ...expandRecipe('led-resistor').spec }).circuit });
  const beside = (tour, files = {}) => {
    const root = mkdtempSync(join(tmpdir(), 'pbi-tour-'));
    const folder = join(root, 'circuit');
    mkdirSync(folder);
    writeFileSync(join(root, 'secret.json'), JSON.stringify({ steps: [] }));
    for (const [name, text] of Object.entries(files)) writeFileSync(join(folder, name), text);
    const c = Object.defineProperty({ ...circuit(), page: { tour } }, CIRCUIT_FOLDER, { value: folder });
    return { c, root, folder };
  };
  assert.deepEqual(codes(tourIssues(beside('../secret.json').c)), ['TOUR_OUTSIDE']);
  const link = beside('link.json');
  symlinkSync(join(link.root, 'secret.json'), join(link.folder, 'link.json'));
  assert.deepEqual(codes(tourIssues(link.c)), ['TOUR_OUTSIDE'], 'a link that leads out');
  assert.deepEqual(codes(tourIssues(beside('big.json', { 'big.json': ' '.repeat(LIMITS.tourBytes + 1) }).c)), ['TOUR_TOO_LARGE']);
  assert.deepEqual(codes(tourIssues(beside('bad.json', { 'bad.json': '{ steps: [' }).c)), ['TOUR_JSON']);
  assert.deepEqual(codes(tourIssues({ ...circuit(), page: { tour: 'missing.json' } })), ['TOUR_FILE'], 'no folder: nothing is read');
  // Caps on the timeline given whole.
  const given = (tour) => codes(tourIssues({ ...circuit(), page: { tour } }));
  const step = { at: 0, do: 'caption', text: 'x' };
  assert.deepEqual(given({ steps: Array.from({ length: LIMITS.tourSteps + 1 }, () => step) }), ['TOUR_TOO_MANY_STEPS']);
  assert.deepEqual(given({ steps: [{ ...step, text: { en: 'x'.repeat(LIMITS.tourText + 1) } }] }), ['TOUR_TEXT_TOO_LONG']);
  assert.deepEqual(given({ steps: [{ at: LIMITS.tourMs, do: 'frame', target: 'board', move: 'arrival' }] }), ['TOUR_TOO_LONG']);
  assert.deepEqual(given({ steps: [{ ...step, text: 'x'.repeat(LIMITS.tourBytes) }] }), ['TOUR_TOO_LARGE']);
  // Nothing outside the closed lists: an action, a field, a value of the wrong kind.
  assert.deepEqual(given({ steps: [{ at: 0, do: 'eval', code: 'alert(1)' }] }), ['TOUR_ACTION']);
  assert.deepEqual(given({ steps: [{ ...step, onload: 'alert(1)' }] }), ['TOUR_FIELD']);
  assert.deepEqual(given({ steps: [{ at: 0, do: 'set', part: 'R1', field: 'resistance', value: 'alert(1)' }] }), ['TOUR_FIELD']);
  assert.deepEqual(given({ steps: [{ at: 0, do: 'value', part: 'D1', field: 'constructor' }] }), ['TOUR_FIELD']);
  assert.deepEqual(given([step]), ['TOUR_SHAPE']);
  // A pedestal (scene, land) takes a part of the circuit by its id, nothing else.
  assert.deepEqual(given({ steps: [{ at: 0, do: 'scene', mode: 'part', part: '"] {} * { display: none } [x="' }] }), ['TOUR_UNKNOWN_PART']);
  assert.deepEqual(given({ steps: [{ at: 0, do: 'scene', mode: 'eval', part: 'D1' }] }), ['TOUR_FIELD']);
  assert.deepEqual(given({ steps: [{ at: 0, do: 'scene', mode: 'part', part: { toString: 'D1' } }] }), ['TOUR_FIELD']);
  assert.deepEqual(given({ steps: [{ at: 0, do: 'land', part: '__proto__' }] }), ['TOUR_UNKNOWN_PART']);
  // A pin (a video about one part, F2): a part of the circuit and one of its pins, read by the kit.
  assert.deepEqual(given({ steps: [{ at: 0, do: 'pin', pin: '"] {} * { display: none } [x=".B' }] }), ['TOUR_UNKNOWN_PART']);
  assert.deepEqual(given({ steps: [{ at: 0, do: 'pin', pin: 'D1.__proto__' }] }), ['TOUR_UNKNOWN_PIN']);
  assert.deepEqual(given({ steps: [{ at: 0, do: 'pin', pin: 'D1.constructor' }] }), ['TOUR_UNKNOWN_PIN']);
  assert.deepEqual(given({ steps: [{ at: 0, do: 'pin', pin: `D1.${'9'.repeat(400)}` }] }), ['TOUR_UNKNOWN_PIN']);
  assert.deepEqual(given({ steps: [{ at: 0, do: 'pin', mark: '__proto__' }] }), ['TOUR_UNKNOWN_PART']);
  assert.deepEqual(given({ steps: [{ at: 0, do: 'pin', pin: ['D1', 'anode'] }] }), ['TOUR_FIELD']);
  // A symbol and an inside view (F4): the same.
  assert.deepEqual(given({ steps: [{ at: 0, do: 'symbol', part: '__proto__', on: true }] }), ['TOUR_UNKNOWN_PART']);
  assert.deepEqual(given({ steps: [{ at: 0, do: 'inside', part: 'D1', on: 1 }] }), ['TOUR_FIELD']);
  // A bench (F3): a part of the circuit, on or off, nothing else.
  assert.deepEqual(given({ steps: [{ at: 0, do: 'bench', part: '"] {} * { display: none } [x="', on: true }] }), ['TOUR_UNKNOWN_PART']);
  assert.deepEqual(given({ steps: [{ at: 0, do: 'bench', part: 'D1', on: 'yes' }] }), ['TOUR_FIELD']);
  assert.deepEqual(given({ steps: [{ at: 0, do: 'bench', part: 'D1', on: true, onload: 'alert(1)' }] }), ['TOUR_FIELD']);
  // Texts: data in the page, written with textContent; never a tag.
  const evil = '</script><script>alert(1)</script><img src=x onerror="alert(1)">';
  const { html } = renderPage({ ...circuit(), page: { tour: { steps: [{ ...step, text: evil }, { at: 0, do: 'value', part: 'D1', field: 'current', label: evil }, { at: 0, do: 'pin', pin: 'D1.anode', text: evil }] } } });
  const kit = ['<script type="application/json" id="page-data">', '<script type="application/json" id="sim-program">', '<script>'];
  for (const tag of html.match(/<script\b[^>]*>/g)) assert.ok(kit.includes(tag), tag);
  assert.ok(!/<img/i.test(html), 'no tag from the timeline');
  assert.match(html, /"tour":\{/, 'the tour is in the page, as data');
});
