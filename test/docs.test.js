// The documents' links, offline: every relative link of every tracked Markdown file points at a
// file that exists, and every #anchor at a heading of that file (GitHub's rule for the slug).
// No network: links to other sites are left alone.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, normalize } from 'node:path';
import { FOLDERS, indexOf } from '../scripts/docs-index.js';

const root = new URL('../', import.meta.url).pathname;

// GitHub's slug of a heading: lower case, punctuation dropped, spaces to hyphens; repeats get -1, -2.
export function slugs(markdown) {
  const seen = new Map();
  const out = new Set();
  const text = markdown.replace(/^```[\s\S]*?^```/gm, '');
  for (const m of text.matchAll(/^#{1,6}\s+(.+?)\s*#*\s*$/gm)) {
    const base = m[1]
      .replace(/<[^>]+>/g, '')
      .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s_-]/gu, '')
      .replace(/\s/g, '-');
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    out.add(n ? `${base}-${n}` : base);
  }
  for (const m of text.matchAll(/<a\s+(?:name|id)="([^"]+)"/g)) out.add(m[1]);
  return out;
}

// The relative links of a Markdown file, outside code: [text](target) and ![alt](target).
export function links(markdown) {
  const text = markdown.replace(/^```[\s\S]*?^```/gm, '').replace(/`[^`\n]*`/g, '');
  return [...text.matchAll(/\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)].map((m) => m[1]).filter((l) => !/^[a-z][a-z0-9+.-]*:/i.test(l));
}

test('docs: every relative link and anchor of the Markdown files resolves', () => {
  const files = execFileSync('git', ['ls-files', '-z', '-co', '--exclude-standard', '*.md'], { cwd: root, encoding: 'utf8' }).split('\0').filter(Boolean);
  assert.ok(files.length > 20);
  const anchors = new Map();
  const anchorsOf = (file) => anchors.get(file) ?? anchors.set(file, slugs(readFileSync(join(root, file), 'utf8'))).get(file);
  const broken = [];
  for (const file of files) {
    for (const link of links(readFileSync(join(root, file), 'utf8'))) {
      const [path, anchor] = link.split('#');
      const target = path ? normalize(join(dirname(file), decodeURIComponent(path))) : file;
      if (!existsSync(join(root, target))) broken.push(`${file}: ${link}: no such file`);
      else if (anchor && target.endsWith('.md') && statSync(join(root, target)).isFile() && !anchorsOf(target).has(decodeURIComponent(anchor))) broken.push(`${file}: ${link}: no such heading in ${target}`);
    }
  }
  assert.deepEqual(broken, []);
});

test('docs: slugs as GitHub makes them', () => {
  const s = slugs('# Stage 3 — Live simulation 🔜\n## A · Security ✅ (2026-10-29)\n## Known limits, and where to improve\n## Notas\n## Notas\n```\n# not a heading\n```');
  assert.ok(s.has('stage-3--live-simulation-'));
  assert.ok(s.has('a--security--2026-10-29'));
  assert.ok(s.has('known-limits-and-where-to-improve'));
  assert.ok(s.has('notas') && s.has('notas-1'));
  assert.ok(!s.has('not-a-heading'));
  assert.deepEqual(links('[a](docs/x.md#y) ![i](img/a.png) [w](https://x.org) `[c](no.md)`'), ['docs/x.md#y', 'img/a.png']);
});

// Two style rules the documents keep (markdownlint's others fight the repository's style: a bold
// label right above its list, long lines in the roadmap): a code block says its language, and
// blank lines come one at a time.
test('docs: every code block names its language, and no blank line is doubled', () => {
  const files = execFileSync('git', ['ls-files', '-z', '-co', '--exclude-standard', '*.md'], { cwd: root, encoding: 'utf8' }).split('\0').filter(Boolean);
  const found = [];
  for (const file of files) {
    let open = false;
    let blank = false;
    readFileSync(join(root, file), 'utf8')
      .split('\n')
      .forEach((line, i) => {
        const fence = /^\s*```(.*)$/.exec(line);
        if (fence) {
          if (!open && !fence[1].trim()) found.push(`${file}:${i + 1}: a code block without a language (\`\`\`text for plain text)`);
          open = !open;
        } else if (!open && !line.trim() && blank) found.push(`${file}:${i + 1}: two blank lines`);
        blank = !open && !line.trim();
      });
    if (open) found.push(`${file}: a code block never closed`);
  }
  assert.deepEqual(found, []);
});

// The index of each docs folder is written from the documents (scripts/docs-index.js).

test('docs: the index of each folder is current, one line per document', () => {
  for (const folder of FOLDERS) {
    const readme = readFileSync(join(root, folder, 'README.md'), 'utf8');
    const index = indexOf(folder);
    assert.ok(readme.includes(index), `${folder}/README.md is stale: npm run docs-index -- --write`);
    const lines = index.split('\n').filter((l) => l.startsWith('- ['));
    for (const l of lines) assert.match(l, /^- \[[^\]]+\]\([^)]+\.md\): \S.{10,}/, l);
    const docs = execFileSync('git', ['ls-files', '-co', '--exclude-standard', `${folder}/*.md`], { cwd: root, encoding: 'utf8' }).split('\n').filter((f) => f && !f.endsWith('/README.md'));
    assert.equal(lines.length, docs.length, `${folder}: every document listed`);
  }
});
