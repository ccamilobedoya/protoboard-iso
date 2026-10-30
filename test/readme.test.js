// The README's "try it" commands (the code blocks after a <!-- smoke --> line, in English and
// Spanish) run as written, in a fresh folder, and end as the README says: a reviewed circuit with
// its page. Cloning and entering the folder are skipped: this checkout already is that folder.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const root = new URL('../', import.meta.url).pathname;

// The commands of the smoke blocks of a Markdown file.
export function smokeCommands(markdown) {
  const blocks = [...markdown.matchAll(/<!-- smoke -->\n```(?:bash|sh)\n([\s\S]*?)```/g)].map((m) => m[1]);
  return blocks
    .flatMap((b) => b.split('\n'))
    .map((l) => l.replace(/\s+#.*$/, '').trim())
    .filter((l) => l && !/^git clone |^cd protoboard-iso$/.test(l));
}

for (const [readme, name] of [['README.md', 'my-switch'], ['README.es.md', 'mi-interruptor']]) {
  test(`${readme}: the try-it commands run as written`, () => {
    const commands = smokeCommands(readFileSync(join(root, readme), 'utf8'));
    assert.ok(commands.length >= 4, `smoke blocks found: ${commands.length} commands`);
    const dir = mkdtempSync(join(tmpdir(), 'pbi-readme-'));
    const outputs = commands.map((c) => execSync(c.replaceAll('node bin/', `node ${join(root, 'bin')}/`), { cwd: dir, encoding: 'utf8', stdio: 'pipe' }));
    assert.ok(existsSync(join(dir, name, 'circuit.json')), 'the circuit');
    assert.ok(existsSync(join(dir, name, 'out', `${name}.html`)), 'its page');
    assert.match(outputs.at(-1), /^(APPROVED|APROBADO) /m, 'the review approves it');
  });
}
