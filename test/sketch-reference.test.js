// The skill's reference of what a sketch may use (plugin-src/references/sketch.md) is written from the
// simulator's own tables and a probe of each name (scripts/sketch-reference.js): it is never stale,
// and it agrees with what the translator and the runner do.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { FILE, probe, probeRun, sketchReference } from '../scripts/sketch-reference.js';
import { SKETCH_API } from '../src/sim/sketch.js';
import { LIBRARY_CLASSES, LIBRARY_INCLUDES } from '../src/sim/libraries.js';

const text = readFileSync(FILE, 'utf8');

test('sketch.md is what the script writes (npm run parts-reference -- --write)', () => {
  assert.equal(text, sketchReference());
});

test("sketch.md names every function, header and library class of the simulator's tables", () => {
  for (const name of [...SKETCH_API, ...LIBRARY_INCLUDES, ...LIBRARY_CLASSES.map((c) => c.name)]) assert.ok(text.includes(`\`${name}\``), name);
});

test('sketch.md: what it says works runs, and what it says is unknown does not', () => {
  assert.deepEqual(probe('void setup() { delay(10); } void loop() { delay(1000); }'), { issues: [], error: null });
  const shift = probe('void setup() { shiftOut(2, 3, 1, 5); } void loop() { delay(1000); }');
  assert.equal(text.includes('Not known (noted, they return 0 or stop the program): `shiftOut`'), shift.issues.length > 0);
  assert.equal(text.includes('`shiftOut`, `shiftIn`.'), shift.issues.length === 0 && !shift.error);
  const two = probe('int a[2][3] = {{1, 2, 3}, {4, 5, 6}}; void setup() { } void loop() { delay(1000); }');
  assert.equal(/two dimensions are refused/.test(text), Boolean(two.error || two.issues.length));
});

test("sketch.md: a two-dimensional array is refused with the kit's own message, never run", () => {
  const two = probe('int a[2][3] = {{1, 2, 3}, {4, 5, 6}}; void setup() { a[1][2] = a[0][1]; } void loop() { delay(1000); }');
  assert.equal(two.error, 'not read');
  assert.deepEqual(two.issues.map((i) => i.code), ['SIM_PROGRAM_ARRAY_DIMENSIONS']);
  assert.match(text, /two dimensions are refused/);
});

test('sketch.md: shiftOut and shiftIn run, and the bit orders are known constants', () => {
  assert.deepEqual(probe('void setup() { shiftOut(2, 3, MSBFIRST, 5); byte b = shiftIn(4, 3, LSBFIRST); } void loop() { delay(1000); }'), { issues: [], error: null });
  assert.doesNotMatch(text, /Not known[^\n]*`shiftOut`/);
  assert.match(text, /Known: [^\n]*`MSBFIRST`, `LSBFIRST`/);
});

test('sketch.md says what a char prints, what interrupts, Serial2 and deep sleep do, from probes', () => {
  const chars = probeRun("void setup() { Serial.begin(9600); Serial.println('Z'); } void loop() { delay(1000); }");
  assert.deepEqual(chars.log, ['Z']);
  assert.match(text, /a `char` prints as its letter/);
  const isr = probeRun('void f() { } void setup() { attachInterrupt(digitalPinToInterrupt(2), f, RISING); } void loop() { delay(1000); }', { pins: [...Array(20).keys()] });
  assert.deepEqual([isr.issues, isr.error, isr.warnings], [[], null, []]);
  assert.match(text, /`attachInterrupt\(digitalPinToInterrupt\(pin\), handler, RISING \| FALLING \| CHANGE \| LOW\)`[^\n]* work on the pins that have an interrupt/);
  assert.match(text, /buttons do not bounce/);
  assert.match(probeRun('void setup() { Serial2.begin(9600); } void loop() { delay(1000); }').error, /Serial2 is not declared on an UNO/);
  assert.match(text, /An UNO has only `Serial`/);
  const sleep = probeRun('void setup() { esp_sleep_enable_timer_wakeup(100000); esp_deep_sleep_start(); } void loop() { }', { family: 'esp32', seconds: 0.25 });
  assert.equal(sleep.wakes, 2);
  assert.match(text, /deep sleep[^\n]* starts again from `setup\(\)`/);
});
