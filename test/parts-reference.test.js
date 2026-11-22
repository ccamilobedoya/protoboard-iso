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
import * as layoutModule from '../src/layout.js';
import { simulate } from '../src/sim/index.js';

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
  // Since C11a the 74HC595 is simulated; the LM386 is still drawn only.
  assert.notEqual(variant('ic', '74HC595').simulated, false);
  assert.equal(variant('ic', 'LM386').simulated, false);
  assert.match(text, /`LM386`: drawn, not simulated/);
  assert.doesNotMatch(text, /`74HC595`: drawn, not simulated/);
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

// The notes parts.md gives a type (reference.<type> in src/i18n) say what a run does: each is
// checked here against the simulator, so the skill can rely on it.
test('parts.md: which way a potentiometer runs, which buzzer pin is +, which button pins switch, as a run gives them', () => {
  const { autoLayout } = layoutModule;
  const volts = (r, part, pin) => r.parts[part].pins[pin];
  const pot = (position) => simulate(autoLayout({ parts: [{ id: 'BT1', type: 'battery', format: '9V' }, { id: 'RV1', type: 'potentiometer', value: '10k', position }, { id: 'R1', type: 'resistor', value: '1M' }], nets: [['BT1.+', 'RV1.1'], ['RV1.3', 'BT1.-'], ['RV1.W', 'R1.1'], ['R1.2', 'BT1.-']] }).circuit);
  assert.ok(Math.abs(volts(pot(0), 'RV1', 'W') - volts(pot(0), 'RV1', '1')) < 0.01, 'position 0: the wiper at pin 1');
  assert.ok(Math.abs(volts(pot(1), 'RV1', 'W') - volts(pot(1), 'RV1', '3')) < 0.01, 'position 1: the wiper at pin 3');
  assert.match(text, /Position 0 puts the wiper \(W\) at pin 1 and 1 at pin 3/);
  // A button between a battery and an active buzzer: pressed, 1 and 3 are joined and it sounds; the
  // passive one on the same DC is silent (the kit says it only heats its coil).
  const buzzer = (part, pressed) => simulate(autoLayout({ parts: [{ id: 'BT1', type: 'battery', format: 'AA', cells: 4 }, { id: 'S1', type: 'button', pressed }, { id: 'BZ1', type: 'buzzer', ...(part && { part }) }], nets: [['BT1.+', 'S1.1'], ['S1.3', 'BZ1.1'], ['BZ1.2', 'BT1.-']] }).circuit);
  assert.equal(buzzer('TMB12A05', true).parts.BZ1.sounding, true, 'pressed: S1.1 and S1.3 joined, the active buzzer sounds');
  assert.equal(buzzer('TMB12A05', false).parts.BZ1.sounding, false, 'released: 1 and 3 apart');
  assert.ok(buzzer('TMB12A05', true).parts.BZ1.pins['1'] > buzzer('TMB12A05', true).parts.BZ1.pins['2'], 'pin 1 is +');
  assert.equal(buzzer(null, true).parts.BZ1.sounding, undefined, 'the passive buzzer has no sound on DC');
  assert.match(text, /Pin 1 is \+[^\n]*a button that sounds a buzzer needs TMB12A05/);
  assert.match(text, /the switch is between the two pairs/);
});
