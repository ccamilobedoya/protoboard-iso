// The skill's reference of what a sketch may use (plugin-src/references/sketch.md) is written from the
// simulator's own tables and a probe of each name (scripts/sketch-reference.js): it is never stale,
// and it agrees with what the translator and the runner do.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { FILE, probe, sketchReference } from '../scripts/sketch-reference.js';
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
  const two = probe('int a[2][3] = {{1, 2, 3}, {4, 5, 6}}; void setup() { } void loop() { delay(1000); }');
  assert.equal(/two dimensions are not read/.test(text), Boolean(two.error || two.issues.length));
});
