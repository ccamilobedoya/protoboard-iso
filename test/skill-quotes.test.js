// The commands and the kit's lines that SKILL.md, recipes.md and beyond-the-kit.md quote, run as
// written (run-it.md, warnings.md and chips.md have their own tests: test/skill-run-it.test.js,
// test/skill-warnings.test.js, test/skill-chips.test.js). Every file of the skill that quotes the
// kit's output in a `text` block is one of those four, so no quote goes unchecked.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { tempDir } from '../scripts/tmp.js';
import { blocksOf } from './skill-doc.js';

const root = new URL('../', import.meta.url).pathname;
const skill = (f) => readFileSync(join(root, 'plugin-src', f), 'utf8');
const kit = (args, cwd) => spawnSync(process.execPath, [join(root, 'bin/protoboard-iso.js'), ...args], { cwd, encoding: 'utf8' });
// A command as written in a block: `kit layout x --values '{"a": 1}'`, quotes kept together.
const argsOf = (line) => line.trim().match(/'[^']*'|\S+/g).map((a) => a.replace(/^'|'$/g, ''));

test('the one-call recipe commands of SKILL.md and recipes.md run and end DONE', () => {
  const dir = tempDir('pb-skill-quotes-');
  for (const file of ['SKILL.md', 'references/recipes.md']) {
    const [command] = blocksOf(skill(file)).filter((b) => b.lang === 'bash').map((b) => b.body.trim());
    const args = argsOf(command);
    assert.equal(args[0], 'kit', command);
    const r = kit(args.slice(1), dir);
    assert.equal(r.status, 0, `${file}: ${command}\n${r.stdout}${r.stderr}`);
    assert.match(r.stdout, /^STATUS: DONE/m, `${file}: ${command}`);
  }
});

test("beyond-the-kit.md: the buzzer on a pin prints the lines it quotes, and --fix the line it names", () => {
  const dir = tempDir('pb-skill-quotes-');
  const spec = join(root, 'test/fixtures/kit-first/buzzer-on-pin.json');
  const text = skill('references/beyond-the-kit.md');
  const made = kit(['layout', 'circuits/two-leds', spec], dir);
  const printed = new Set(made.stdout.split('\n').map((l) => l.trimEnd()));
  const [quote] = blocksOf(text).filter((b) => b.lang === 'text');
  let n = 0;
  for (const line of quote.body.split('\n').filter((l) => l.trim() && l.trim() !== '…')) {
    // "STATUS: WARNINGS · …" stands for the line that starts so.
    const ok = line.endsWith(' · …') ? [...printed].some((p) => p.startsWith(line.slice(0, -1))) : printed.has(line.trimEnd());
    assert.ok(ok, `layout prints:\n${line}\n---\n${made.stdout}`);
    n++;
  }
  assert.ok(n >= 4, `${n} lines`);
  const [fix] = blocksOf(text).filter((b) => b.lang === 'bash').map((b) => b.body.trim());
  const fixed = kit(argsOf(fix).slice(1), dir);
  assert.equal(fixed.status, 0, fixed.stdout + fixed.stderr);
  assert.ok(text.includes('`Applied the fix: R3 = 200 Ω in series with BZ1.`'));
  assert.match(fixed.stdout, /^Applied the fix: R3 = 200 Ω in series with BZ1\.$/m);
  assert.match(fixed.stdout, /^STATUS: DONE/m);
  // The redesign the text says a trial shows: its ⚠ as the text gives it.
  const trial = kit(['layout', 'circuits/two-leds', join(root, 'test/fixtures/kit-first/buzzer-npn.json'), '--dry-run'], dir);
  assert.match(trial.stdout, /⚠ warning: BZ1 dissipates 1\.42 W, more than its 500 mW: it overheats, with D9 \+ D10 high\./);
  assert.match(text, /dissipates 1\.4 W,\s+more\s+than its 500 mW, with D9 \+ D10 high/);
});

test("every file of the skill that quotes the kit's output has a test that runs it", () => {
  const checked = new Set(['run-it.md', 'warnings.md', 'chips.md', 'beyond-the-kit.md']);
  const quoting = readdirSync(join(root, 'plugin-src/references')).filter((f) => blocksOf(skill(`references/${f}`)).some((b) => b.lang === 'text'));
  assert.deepEqual(quoting.filter((f) => !checked.has(f)), []);
  assert.ok(!blocksOf(skill('SKILL.md')).some((b) => b.lang === 'text'), 'SKILL.md quotes no output block');
});
