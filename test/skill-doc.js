// Runs a reference of the skill as a stranger's assistant would follow it, for the tests that guard
// what the skill quotes (test/skill-run-it.test.js, test/skill-chips.test.js). The fenced blocks, in
// order, in one fresh folder: a block with a file name after its language (```json shift.json,
// ```cpp circuits/shift/fill.ino) is written to that file; a `bash` block is a `kit …` command, run
// with the repository's CLI; every line of a `text` block must be a line the last command printed.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tempDir } from '../scripts/tmp.js';

const root = new URL('../', import.meta.url).pathname;

export const blocksOf = (text) => [...text.matchAll(/^```(\w*)(?: (\S+))?\n([\s\S]*?)^```/gm)].map((m) => ({ lang: m[1], file: m[2] ?? null, body: m[3] }));

// Returns what was run: [{ command, status, stdout, quoted }], `quoted` the lines checked after it.
// `quotes: false` runs the commands only (a variant of the text whose quotes no longer apply).
export function runDoc(text, { prefix = 'pb-skill-doc-', quotes = true } = {}) {
  const dir = tempDir(prefix);
  const runs = [];
  for (const b of blocksOf(text)) {
    if (b.file) {
      assert.ok(!b.file.startsWith('/') && !b.file.includes('..'), b.file);
      mkdirSync(dirname(join(dir, b.file)), { recursive: true });
      writeFileSync(join(dir, b.file), b.body);
    } else if (b.lang === 'bash') {
      const args = b.body.trim().split(/\s+/);
      assert.equal(args[0], 'kit', b.body);
      const r = spawnSync(process.execPath, [join(root, 'bin/protoboard-iso.js'), ...args.slice(1)], { cwd: dir, encoding: 'utf8' });
      assert.equal(r.status, 0, `${b.body}\n${r.stdout}${r.stderr}`);
      runs.push({ command: b.body.trim(), status: r.status, stdout: r.stdout, lines: new Set(r.stdout.split('\n').map((l) => l.trimEnd())), quoted: 0 });
    } else if (b.lang === 'text' && quotes) {
      const last = runs.at(-1);
      assert.ok(last, 'a quoted output follows a command');
      for (const line of b.body.split('\n').filter((l) => l.trim())) {
        assert.ok(last.lines.has(line.trimEnd()), `${last.command} prints:\n${line}\n---\n${last.stdout}`);
        last.quoted++;
      }
    }
  }
  return runs;
}
