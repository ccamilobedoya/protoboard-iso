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
