// The skill's reference of what each part takes (plugin-src/references/parts.md) is written from the
// kit's own data by scripts/parts-reference.js: it is never stale, it names every part type and part
// number, and what it says about a part agrees with what a run and the catalog do with it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { FILE, forType, partsReference } from '../scripts/parts-reference.js';
import { PART_TYPES } from '../src/parts/types/index.js';
import { PART_NUMBERS } from '../src/parts/db.js';
import { MODULES } from '../src/parts/modules.js';
import { partReference } from '../src/node/catalog.js';

const text = readFileSync(FILE, 'utf8');

test('parts.md is what the script writes (npm run parts-reference -- --write)', () => {
  assert.equal(text, partsReference());
});

test('parts.md names every part type, part number and board module', () => {
  for (const type of Object.keys(PART_TYPES)) assert.ok(text.includes(`## \`${type}\` · `), type);
  for (const name of [...Object.keys(PART_NUMBERS), ...Object.keys(MODULES)]) assert.ok(text.includes(`\`${name}\``), name);
});

test('parts.md: what a run changes and what a sensor reads come from the parts themselves', () => {
  const ref = Object.fromEntries(partReference().map((e) => [e.type, e]));
  const variant = (type, part = null) => ref[type].variants.find((v) => v.part === part);
  assert.deepEqual(variant('ultrasonic-sensor', 'HC-SR04').senses, ['distance', 'temperature']);
  assert.deepEqual(variant('climate-sensor', 'DHT11').senses, ['temperature', 'humidity'], 'a DHT11 has no pressure');
  assert.deepEqual(variant('sensor-module', 'YL-69').senses, ['moisture']);
  assert.deepEqual(variant('slide-switch').senses, [], 'only the tilt switch follows tilt');
  assert.deepEqual(variant('tilt-switch').senses, ['tilt']);
  assert.ok(variant('potentiometer').controls.position, 'a potentiometer has its position');
  assert.ok(variant('rotary-encoder', 'KY-040').controls.angle);
  assert.equal(variant('ic', '74HC595').simulated, false);
  assert.match(text, /`74HC595`: drawn, not simulated/);
  assert.match(text, /reads the environment's `distance` in cm \(`--env` 2 … 400 cm\)/);
  assert.match(text, /`program`: [^·]*\.ino file beside the circuit/);
});

test("a field's shared description keeps only what is about the part's own type", () => {
  const style = 'wire: "arc" | "flat"; potentiometer: "knob" (default) | "trimmer" (multi-turn 3296W); switch: "rocker" (KCD1, default) | "latching" (7 × 7 push button)';
  assert.equal(forType(style, 'potentiometer'), '"knob" (default) | "trimmer" (multi-turn 3296W)');
  assert.equal(forType('pir-sensor: seconds (the trimmer Tx; default 5)', 'pir-sensor'), 'seconds (the trimmer Tx; default 5)');
  assert.equal(forType('electrolytic: rated volts; battery: measured volts', 'battery'), 'measured volts');
  assert.equal(forType('plain words', 'led'), 'plain words');
});
