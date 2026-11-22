// The skill's reference for the six chips the kit simulates (plugin-src/references/chips.md): its
// generated blocks are what `kit catalog` says today (scripts/chips-reference.js), every worked spec
// is laid out by the CLI to STATUS: DONE, and every line quoted after a command is printed by it
// (test/skill-doc.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { FILE, chipsReference } from '../scripts/chips-reference.js';
import { runDoc } from './skill-doc.js';

const text = readFileSync(FILE, 'utf8');
const CHIPS = ['74HC595', 'CD4017', 'ULN2003', 'ULN2803', 'PC817', 'LM386'];

test("chips.md's generated blocks are the catalog's (npm run parts-reference -- --write)", () => {
  assert.equal(text, chipsReference(text));
  for (const chip of CHIPS) assert.match(text, new RegExp(`<!-- generated: ${chip} [^>]*-->\\n- Pins, [^\\n]*\\n- Simulated: `), chip);
});

test('chips.md: each worked spec ends DONE and prints the lines quoted after it', () => {
  const runs = runDoc(text, { prefix: 'pb-chips-' });
  const layouts = runs.filter((r) => r.command.startsWith('kit layout '));
  assert.equal(layouts.length, 6, 'one worked spec per section (two for the ULNs)');
  for (const r of layouts) assert.match(r.stdout, /^STATUS: DONE/m, r.command);
  for (const chip of CHIPS) assert.ok(text.includes(`"part": "${chip}"`), `a worked spec with ${chip}`);
  assert.ok(runs.reduce((n, r) => n + r.quoted, 0) >= 7);
});

// What the prose of chips.md says the kit does, beside the quoted lines: a ULN's COM left off a
// coil is warned, a PC817's LED with no resistor is a hazard.
test('chips.md: a ULN with COM off the coil and a PC817 with no resistor are ⚠, as it says', async () => {
  const { autoLayout } = await import('./layout-generous.js');
  const spec = (file) => JSON.parse([...text.matchAll(/^```json (\S+)\n([\s\S]*?)^```/gm)].find((m) => m[1] === file)[2]);
  assert.match(text, /Without it the kit warns that the coil is switched with no diode across it/);
  const relay = spec('relay.json');
  relay.parts[0].program = 'void setup() {\n  pinMode(8, OUTPUT);\n}\n\nvoid loop() {\n  digitalWrite(8, HIGH);\n  delay(1000);\n  digitalWrite(8, LOW);\n  delay(1000);\n}';
  const noCom = { ...relay, nets: relay.nets.map((n) => n.filter((p) => p !== 'U2.COM')) };
  assert.ok(autoLayout(noCom).review.doubts.some((d) => d.code === 'COIL_NO_FLYBACK'), 'COM off the coil');
  assert.ok(!autoLayout(relay).review.doubts.some((d) => d.code === 'COIL_NO_FLYBACK'), 'COM on the coil');
  assert.match(text, /With no resistor the LED is over its current \(a ⚠\)/);
  const opto = spec('opto.json');
  const bare = { ...opto, parts: opto.parts.filter((p) => p.id !== 'R1'), nets: opto.nets.filter((n) => !n.includes('R1.2')).map((n) => n.map((p) => (p === 'R1.1' ? 'U1.A' : p))) };
  assert.ok(autoLayout(bare).review.hazards.some((h) => h.params.part === 'U1'), 'the LED over its current');
});
