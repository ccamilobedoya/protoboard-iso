// The repository's own context: the named options of project.json and the block CLAUDE.md shows
// of them, the private file's example, and the size of what a session loads at start.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { CLOSE, OPEN, optionValue, optionsBlock, projectOptions, withBlock } from '../scripts/project-options.js';
import { startupContext } from '../scripts/context-size.js';

const root = new URL('../', import.meta.url).pathname;
const read = (f) => readFileSync(join(root, f), 'utf8');

test('project options: each has a whole-number value and says what it means', () => {
  const options = projectOptions();
  assert.deepEqual(Object.keys(options).sort(), ['briefs_per_agent', 'context_kb', 'review_rounds']);
  for (const [name, o] of Object.entries(options)) {
    assert.ok(Number.isInteger(o.value) && o.value > 0, name);
    assert.ok(o.means.length > 30, `${name} says what it means`);
  }
});

test('project options: CLAUDE.md shows the current block, and the docs cite the names', () => {
  const claude = read('CLAUDE.md');
  assert.ok(claude.includes(optionsBlock()), 'the block is stale: npm run options -- --write');
  assert.equal(withBlock(claude), claude);
  assert.throws(() => withBlock('no markers'), /no <!-- generated/);
  assert.equal(optionsBlock({ a: { value: 1, means: 'one' } }), `${OPEN}\n- \`a\` = 1: one.\n${CLOSE}`);
  for (const file of ['CLAUDE.md', 'docs/en/agents.md', 'docs/es/agentes.md']) {
    for (const name of ['review_rounds', 'briefs_per_agent']) assert.ok(read(file).includes(name), `${file} cites ${name}`);
  }
  // The number lives in project.json only: no prose that says it again.
  const tracked = execFileSync('git', ['ls-files', '-z', '-co', '--exclude-standard', '*.md'], { cwd: root, encoding: 'utf8' }).split('\0').filter(Boolean);
  for (const file of tracked.filter((f) => !/ROADMAP|hoja-de-ruta|PLANNING|planeacion|CHANGELOG/.test(f))) assert.doesNotMatch(read(file), /\btwo rounds\b|\bdos rondas\b/i, file);
});

test('CLAUDE.local.md.example: in git, short, and pointed at from CLAUDE.md', () => {
  const text = read('CLAUDE.local.md.example');
  const words = text.split(/\s+/).filter(Boolean).length;
  assert.ok(words <= 300, `${words} words (300 at most)`);
  assert.match(read('CLAUDE.md'), /CLAUDE\.local\.md\.example/);
  assert.match(text, /privacy\.local\.txt/, 'it says where the private words go');
});

test('startup context: within context_kb', async (t) => {
  const parts = await startupContext();
  if (parts.some((p) => p.bytes == null)) return t.skip('mcp/node_modules is missing: cd mcp && npm install');
  const total = parts.reduce((n, p) => n + p.bytes, 0);
  const cap = optionValue('context_kb') * 1024;
  assert.ok(total <= cap, `${(total / 1024).toFixed(1)} KB loaded at start, more than context_kb = ${optionValue('context_kb')} (project.json): ${parts.map((p) => `${p.what} ${(p.bytes / 1024).toFixed(1)}`).join(', ')}`);
  assert.ok(existsSync(join(root, '.mcp.json')));
});
