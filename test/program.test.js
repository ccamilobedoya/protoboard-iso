// A board's program (phase M2 of docs/en/microcontrollers.md): the sketch translator
// (src/sim/sketch.js) and the program running between time steps (src/sim/program.js, through
// the board device and the engine).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { translateSketch } from '../src/sim/sketch.js';
import { simulate, compile, createEngine } from '../src/sim/index.js';
import { autoLayout } from '../src/layout.js';
import { expandRecipe } from '../src/recipes/index.js';
import { resolveTarget, loadCircuit } from '../src/node/workspace.js';

const codes = (issues) => issues.map((i) => i.code);
const run = (js) => new Function('api', js);

test('sketch: C++ the way a lesson writes it becomes generators; integers stay integers', () => {
  const r = translateSketch(`#include <Arduino.h>
#define WAIT 250
const int LED = 13;     // a comment
unsigned long count = 0;
int half(int n) { return n / 2; }
void setup() { pinMode(LED, OUTPUT); Serial.begin(115200); }
void loop() {
  for (int i = 0; i < 3; i++) { count += 7 / 2; }
  int h = half(5);
  char c = 'A';
  float f = (float) h / 2;
  switch (h) { case 2: digitalWrite(LED, HIGH); break; default: break; }
  delay(WAIT);
}`);
  assert.deepEqual(r.issues, []);
  assert.match(r.js, /function\* loop\(\)/);
  assert.match(r.js, /\(yield \(\(WAIT\) \/ 1e3\)\)/, 'delay waits in seconds');
  assert.match(r.js, /yield\* half\(5\)/, 'a call to its own function');
  // Run it with a stub API and look at what it computes.
  const seen = {};
  const api = new Proxy({ HIGH: 1, LOW: 0, OUTPUT: 1, __int: Math.trunc, Serial: { begin() {} }, digitalWrite: (p, v) => (seen[p] = v), pinMode() {} }, { get: (o, k) => (k in o ? o[k] : () => 0) });
  const program = run(`${r.js.replace('return {', 'globalThis.__probe = () => ({ count }); return {')}`)(api);
  [...program.setup()];
  const steps = [...program.loop()];
  assert.deepEqual(steps.filter((s) => s > 0), [0.25], 'one delay of 250 ms');
  assert.equal(seen[13], 1, 'half(5) is 2: integer division');
  assert.equal(globalThis.__probe().count, 9, '7 / 2 is 3, three times');
  delete globalThis.__probe;
});

test('sketch: what it cannot read is reported with its line, and nothing runs', () => {
  const bad = translateSketch('void setup() {}\nvoid loop() {\n  int x = ;\n}');
  assert.equal(bad.js, null);
  assert.deepEqual(codes(bad.issues), ['SIM_PROGRAM_ERROR']);
  assert.equal(bad.issues[0].line, 3);
  const unknown = translateSketch('#include <GxEPD2_BW.h>\nvoid setup() {}\nvoid loop() { display(); }');
  assert.ok(unknown.js, 'an unknown call still runs (it returns 0)');
  assert.deepEqual(codes(unknown.issues), ['SIM_PROGRAM_LIBRARY', 'SIM_PROGRAM_UNSUPPORTED']);
  assert.deepEqual(codes(translateSketch('void setup() {}').issues), ['SIM_PROGRAM_NO_LOOP']);
});

const laid = (spec) => {
  const r = autoLayout({ board: 'auto', ...spec });
  assert.equal(r.status, 'done');
  return r.circuit;
};

test('blink: the LED follows delay() in simulated time, and Serial prints', () => {
  const circuit = laid(expandRecipe('esp32-led').spec);
  const r = simulate(circuit, { analysis: 'transient', stop: 2, step: 1e-3, points: 2001 });
  assert.ok(r.ok, JSON.stringify(r.issues));
  const on = (t) => r.parts.D1.current[Math.round(t / 1e-3)] > 1e-3;
  // On from 0 to 0.5 s, off to 1 s, on again (a change takes effect one step after it is written).
  assert.deepEqual([0.1, 0.45, 0.6, 0.95, 1.1, 1.45, 1.6].map(on), [true, true, false, false, true, true, false]);
  const dc = simulate(circuit);
  assert.equal(dc.parts.U1.program.until, 0.5, 'at t = 0 it waits in the first delay');
});

test('a button read by the program lights an LED; the engine steps it as the page does', () => {
  const circuit = laid({
    parts: [
      { id: 'U1', part: 'ESP32-DEVKIT', program: 'void setup() { pinMode(27, INPUT_PULLUP); pinMode(13, OUTPUT); }\nvoid loop() { digitalWrite(13, digitalRead(27) == LOW ? HIGH : LOW); delay(10); }' },
      { id: 'S1', type: 'button' },
      { id: 'R1', type: 'resistor', value: '220' },
      { id: 'D1', type: 'led', color: 'red' },
    ],
    nets: [['U1.D27', 'S1.1'], ['S1.3', 'U1.GND'], ['U1.D13', 'R1.1'], ['R1.2', 'D1.anode'], ['D1.cathode', 'U1.GND']],
  });
  assert.ok(Math.abs(simulate(circuit).parts.D1.current) < 1e-6, 'released: off');
  const pressed = { ...circuit, parts: circuit.parts.map((p) => (p.id === 'S1' ? { ...p, pressed: true } : p)) };
  assert.ok(simulate(pressed).parts.D1.current > 5e-3, 'pressed: on');
  // Step by step, pressing the button in the middle (engine.set rebuilds; the program goes on).
  const engine = createEngine(compile(circuit).program);
  assert.ok(engine.hasProgram());
  assert.ok(engine.start('dc', 1e-3));
  for (let k = 0; k < 50; k++) assert.ok(engine.step(1e-3));
  assert.ok(Math.abs(engine.read().parts.D1.current) < 1e-6);
  assert.ok(engine.set('S1', 'pressed', true));
  for (let k = 0; k < 50; k++) engine.step(1e-3);
  const now = engine.read();
  assert.ok(now.parts.D1.current > 5e-3, 'the program saw the press');
  assert.ok(now.parts.U1.program.time > 0.09, 'and kept its clock across the rebuild');
});

test('the program as a .ino file beside the circuit; a missing one is reported', () => {
  const folder = mkdtempSync(join(tmpdir(), 'pbi-'));
  const circuit = laid(expandRecipe('esp32-led').spec);
  circuit.parts.find((p) => p.id === 'U1').program = 'blink.ino';
  writeFileSync(join(folder, 'circuit.json'), JSON.stringify(circuit));
  writeFileSync(join(folder, 'blink.ino'), 'void setup() { pinMode(13, OUTPUT); digitalWrite(13, HIGH); }\nvoid loop() { delay(1000); }');
  const loaded = loadCircuit(resolveTarget(folder));
  assert.ok(simulate(loaded).parts.D1.current > 5e-3);
  assert.deepEqual(codes(simulate(circuit).issues), ['SIM_PROGRAM_FILE'], 'without its folder');
});
