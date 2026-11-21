// The skill's reference of what a ⚠, a Note: and an "about" mean (plugin-src/references/warnings.md):
// each spec in it is laid out and every line it quotes after it is a line layout prints; a `text fix`
// block is what layout --fix prints after it. A change of the kit's words that the reference no longer
// shows fails here.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { autoLayout, fixRequest, formatLayout } from '../src/layout.js';
import { formatIssue, t } from '../src/index.js';
import { expandRecipe } from '../src/recipes/index.js';

const root = new URL('../', import.meta.url).pathname;
const text = readFileSync(join(root, 'plugin-src/references/warnings.md'), 'utf8');
const blocks = [...text.matchAll(/^```(\w*)( fix)?\n([\s\S]*?)^```/gm)].map((m) => ({ lang: m[1], fix: Boolean(m[2]), body: m[3] }));
const linesOf = (r) => new Set(formatLayout(r, 'en', { t, formatIssue }).split('\n').map((l) => l.trimEnd()));

test('warnings.md: each spec is laid out and prints the lines quoted after it', () => {
  let laid = null;
  let quoted = 0;
  let specs = 0;
  for (const b of blocks) {
    if (b.lang === 'json') {
      const given = JSON.parse(b.body);
      const spec = given.recipe ? expandRecipe(given.recipe, given.values).spec : given;
      laid = autoLayout(spec);
      specs++;
      continue;
    }
    assert.equal(b.lang, 'text', 'only json specs and text quotes');
    assert.ok(laid, 'a quote follows a spec');
    let r = laid;
    if (b.fix) {
      const fixed = fixRequest(laid.circuit);
      assert.ok(fixed.spec, JSON.stringify(fixed));
      r = { ...autoLayout(fixed.spec), applied: fixed.applied };
      assert.deepEqual(r.review.hazards, [], 'the circuit after the fix has no hazard');
    }
    const printed = linesOf(r);
    for (const line of b.body.split('\n').filter((l) => l.trim())) {
      assert.ok(printed.has(line.trimEnd()), `layout prints:\n${line}\n---\n${[...printed].join('\n')}`);
      quoted++;
    }
  }
  assert.equal(specs, 4);
  // The buzzer in backwards is also an output that never comes on (its line names the kit, so it is
  // said in prose, not quoted in a block the plugin test reads as commands).
  const buzzer = JSON.parse(blocks.filter((b) => b.lang === 'json')[1].body);
  const r = autoLayout(buzzer);
  assert.ok(r.review.doubts.some((d) => d.code === 'SIM_OUTPUT_NEVER_ON' && d.params.part === 'BZ1'), JSON.stringify(r.review.doubts));
  assert.ok([...linesOf(r)].some((l) => l.startsWith('  ⚠ warning: BZ1 never comes on:')));
  assert.match(text, /`BZ1 never comes on:`/);
  assert.ok(quoted >= 6, `${quoted} lines quoted`);
});

test('warnings.md: the program section says what sketch.md says', () => {
  const sketch = readFileSync(join(root, 'plugin-src/references/sketch.md'), 'utf8');
  assert.match(sketch, /`shiftOut`, `shiftIn`\./);
  assert.match(sketch, /two dimensions are refused/);
  assert.match(text, /`shiftOut` and `shiftIn` run/);
  assert.match(text, /two-dimensional\s+array \(`int a\[2\]\[3\]`\) is refused/);
});
