// The skill's worked example of checking what a circuit does (plugin-src/references/run-it.md): every
// command in it runs, in order, in a fresh folder, every file it shows is written where it says, and
// every line it quotes after a command is a line that command prints (test/skill-doc.js). A change of
// the kit's words or of the simulation that the example no longer shows fails here, as the spec
// examples do in test/layout.test.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { runDoc } from './skill-doc.js';

const root = new URL('../', import.meta.url).pathname;
const text = readFileSync(join(root, 'plugin-src/references/run-it.md'), 'utf8');

test('run-it.md: each command runs and prints the lines quoted after it', () => {
  const runs = runDoc(text, { prefix: 'pb-run-it-' });
  assert.ok(runs.length >= 4, 'the layout and three runs');
  const quoted = runs.reduce((n, r) => n + r.quoted, 0);
  assert.ok(quoted >= 8, `${quoted} lines quoted`);
  // The example's point: at 10 cm the LED is on, at 50 cm it is off.
  assert.match(text, /D1 \(LED\): on > 99 % of the time/);
  assert.match(text, /D1 \(LED\): off the whole time/);
});
