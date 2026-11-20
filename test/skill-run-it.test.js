// The skill's worked example of checking what a circuit does (plugin-src/references/run-it.md): every
// command in it runs, in order, in a fresh folder, and every line it quotes after a command is a line
// that command prints. A change of the kit's words or of the simulation that the example no longer
// shows fails here, as the spec examples do in test/layout.test.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tempDir } from '../scripts/tmp.js';

const root = new URL('../', import.meta.url).pathname;
const text = readFileSync(join(root, 'plugin-src/references/run-it.md'), 'utf8');

// The fenced blocks in order: [{ lang, body }].
const blocks = [...text.matchAll(/^```(\w*)\n([\s\S]*?)^```/gm)].map((m) => ({ lang: m[1], body: m[2] }));

test('run-it.md: each command runs and prints the lines quoted after it', () => {
  const dir = tempDir('pb-run-it-');
  const commands = blocks.filter((b) => b.lang === 'bash');
  assert.ok(commands.length >= 4, 'the layout and three runs');
  let last = null;
  let quoted = 0;
  for (const b of blocks) {
    if (b.lang === 'bash') {
      const args = b.body.trim().split(/\s+/);
      assert.equal(args[0], 'kit', b.body);
      const r = spawnSync(process.execPath, [join(root, 'bin/protoboard-iso.js'), ...args.slice(1)], { cwd: dir, encoding: 'utf8' });
      assert.equal(r.status, 0, `${b.body}\n${r.stdout}${r.stderr}`);
      last = { command: b.body.trim(), lines: new Set(r.stdout.split('\n').map((l) => l.trimEnd())) };
    } else if (b.lang === 'text') {
      assert.ok(last, 'a quoted output follows a command');
      for (const line of b.body.split('\n').filter((l) => l.trim())) {
        assert.ok(last.lines.has(line.trimEnd()), `${last.command} prints:\n${line}`);
        quoted++;
      }
    }
  }
  assert.ok(quoted >= 8, `${quoted} lines quoted`);
  // The example's point: at 10 cm the LED is on, at 50 cm it is off.
  assert.match(text, /D1 \(LED\): on > 99 % of the time/);
  assert.match(text, /D1 \(LED\): off the whole time/);
});
