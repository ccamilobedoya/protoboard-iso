// Hostile input (CLAUDE.md, "External input"): a circuit, a list of operations or a board's
// program may come from anyone. A sketch must not reach anything but the runtime, a program
// file must stay inside the circuit's folder, text must not become markup, and every input has a
// size cap (src/limits.js).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { translateSketch, SKETCH_API } from '../src/sim/sketch.js';
import { createRunner } from '../src/sim/program.js';
import { simulate } from '../src/sim/index.js';
import { autoLayout } from '../src/layout.js';
import { RECIPES, expandRecipe } from '../src/recipes/index.js';
import { resolveTarget, loadCircuit, createTarget } from '../src/node/workspace.js';
import { applyOps } from '../src/ops.js';
import { renderCircuit } from '../src/index.js';
import { renderPage } from '../src/page.js';
import { LIMITS } from '../src/limits.js';

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
const ALLOWED = new Set([...SKETCH_API, 'HIGH', 'LOW', 'INPUT', 'OUTPUT', 'INPUT_PULLUP', 'INPUT_PULLDOWN', 'LED_BUILTIN', 'A0', 'A1', 'A2', 'A3', 'A4', 'A5', 'PI', 'Serial', 'true', 'false', '__int', '__missing', '__idx', '__array', '__str', 'let', 'const', 'function', 'yield', 'return', 'if', 'else', 'while', 'do', 'for', 'switch', 'case', 'default', 'break', 'continue', 'undefined']);
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
  const hostile = [sketch('int a[3] = {1, 2, 3}; a[a[0]] = window + document + require + import_meta;'), sketch('Serial.write(1); Serial.flush();')];
  for (const p of [...programs, ...hostile]) {
    const { js } = translateSketch(p);
    assert.ok(js, p);
    assert.deepEqual(strayNames(js), [], p);
  }
});

test('attack: a sketch cannot take the memory or the time of the machine', () => {
  const long = translateSketch(sketch(`int x = 0; ${'x++; '.repeat(LIMITS.sketchChars / 5)}`));
  assert.equal(long.js, null);
  assert.deepEqual(codes(long.issues), ['SIM_PROGRAM_TOO_LARGE']);
  const started = Date.now();
  const big = run('int a[1000000000];\n' + sketch('a[5] = 7; Serial.println(a[5]);'));
  assert.deepEqual(big.log, ['7'], 'an array is capped, not refused');
  const busy = run('void setup() { while (true) { } }\nvoid loop() { }');
  assert.equal(busy.error, null, 'a loop that never waits gives the step back');
  assert.ok(Date.now() - started < 5000);
  assert.equal(run('void f(int "x") { }\n' + sketch('')).r.js, null, 'a parameter must be a name');
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
