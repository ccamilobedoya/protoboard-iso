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
  // What the sketches section says beside its quotes: the same counter read with digitalRead before
  // the delay misses both presses (it prints 0 twice).
  const counter = runs.find((r) => r.command.startsWith('kit simulate circuits/counter'));
  assert.ok(counter, 'the interrupt counter is run');
  assert.match(text, /`if \(digitalRead\(2\) == LOW\) presses\+\+;` before the `delay` instead of the interrupt prints `0` twice/);
  const polled = runDoc(text.replace('attachInterrupt(digitalPinToInterrupt(2), count, FALLING);', '').replace('void loop() {\n  delay(1000);', 'void loop() {\n  if (digitalRead(2) == LOW) presses++;\n  delay(1000);').split('## Sketches')[1], { prefix: 'pb-run-it-poll-', quotes: false }).find((r) => r.command.startsWith('kit simulate circuits/counter'));
  assert.deepEqual(polled.stdout.match(/^ {2}\d+(?:\.\d+)? m?s +\d+$/gm).map((l) => l.trim().split(/\s+/).at(-1)), ['0', '0']);
  // The example's point: at 10 cm the LED is on, at 50 cm it is off.
  assert.match(text, /D1 \(LED\): on > 99 % of the time/);
  assert.match(text, /D1 \(LED\): off the whole time/);
});
