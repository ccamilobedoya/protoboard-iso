// English is the reference and every document has its Spanish copy (CLAUDE.md, "Rules"). A pair is
// declared once, by the language link at the top of each file (*[Español](…)* and *[English](…)*),
// and the two files keep the same shape: headings per level, code blocks and table rows. A section
// written in one language only, or a decision logged in one of them, shows up here.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, normalize } from 'node:path';

const root = new URL('../', import.meta.url).pathname;
const read = (f) => readFileSync(join(root, f), 'utf8');
// Documents that are not part of a pair: one file for both languages, or not for readers.
const SINGLE = new Set(['CLAUDE.md', 'SKILL.md', 'CHANGELOG.md', 'src/sim/README.md', 'mcp/README.md', '.interface-design/system.md']);

// The other language's file a document's top link names, or null.
export function pairOf(file, text) {
  const m = /^\*\[(?:Español|Leer en español|English|Read in English)\]\(([^)#]+)\)\*/m.exec(text.split('\n').slice(0, 6).join('\n'));
  return m ? normalize(join(dirname(file), m[1])) : null;
}
// What a translation must keep: headings per level, code blocks, table rows.
export function shapeOf(text) {
  const prose = text.replace(/^```[\s\S]*?^```/gm, '```');
  return {
    headings: [1, 2, 3, 4].map((n) => (prose.match(new RegExp(`^#{${n}}\\s`, 'gm')) ?? []).length),
    code: (text.match(/^```\S/gm) ?? []).length,
    tableRows: (prose.match(/^\|.*\|\s*$/gm) ?? []).length,
  };
}

const tracked = execFileSync('git', ['ls-files', '-z', '-co', '--exclude-standard', '*.md'], { cwd: root, encoding: 'utf8' })
  .split('\0')
  .filter((f) => f && !f.startsWith('.claude/') && !f.startsWith('test/') && !SINGLE.has(f));

test('parity: every document has its copy in the other language, and they point at each other', () => {
  assert.ok(tracked.length >= 40);
  const found = [];
  for (const file of tracked) {
    const other = pairOf(file, read(file));
    if (!other) found.push(`${file}: no language link at the top (*[Español](…)* or *[English](…)*)`);
    else if (!existsSync(join(root, other))) found.push(`${file}: its copy ${other} does not exist`);
    else if (pairOf(other, read(other)) !== file) found.push(`${file} → ${other}, but ${other} does not point back`);
  }
  assert.deepEqual(found, []);
});

test('parity: each pair keeps the same headings, code blocks and table rows', () => {
  const found = [];
  for (const file of tracked.filter((f) => /^\*\[(?:Español|Leer en español)\]/m.test(read(f)))) {
    const other = pairOf(file, read(file));
    const a = shapeOf(read(file));
    const b = shapeOf(read(other));
    for (const k of Object.keys(a)) if (JSON.stringify(a[k]) !== JSON.stringify(b[k])) found.push(`${file} / ${other}: ${k} ${JSON.stringify(a[k])} vs ${JSON.stringify(b[k])}`);
  }
  assert.deepEqual(found, []);
});
