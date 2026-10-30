#!/usr/bin/env node
// The index of the documents: docs/en/README.md and docs/es/README.md hold, between their markers,
// one line per document of their folder (its title and the first sentence of its first paragraph),
// written from the documents themselves. test/docs.test.js fails when an index is stale.
//
//   npm run docs-index             show both indexes
//   npm run docs-index -- --write  write them

import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
export const OPEN = '<!-- generated: the documents of this folder (npm run docs-index -- --write) -->';
export const CLOSE = '<!-- /generated -->';
export const FOLDERS = ['docs/en', 'docs/es'];

// A document's title (its # heading) and what it is for (the first sentence of its first paragraph).
export function aboutOf(markdown) {
  const lines = markdown.split('\n');
  const title = lines.find((l) => /^# /.test(l))?.slice(2).trim() ?? '';
  const start = lines.findIndex((l) => /^# /.test(l)) + 1;
  const para = [];
  let fence = false;
  let skip = false; // inside the paragraph of the language line, which may span two lines
  for (const l of lines.slice(start)) {
    if (/^\*\[/.test(l.trim()) && !para.length) skip = true;
    if (skip) {
      if (!l.trim()) skip = false;
      continue;
    }
    // Code blocks, the language line (*[English](…)* · …), headings, lists, tables: not prose.
    if (/^\s*```/.test(l)) fence = !fence;
    if (fence || /^\s*```/.test(l) || /^ {4}/.test(l)) {
      if (para.length) break;
      continue;
    }
    if (!l.trim()) {
      if (para.length) break;
      continue;
    }
    if (/^\*\[/.test(l.trim()) || /^(#|\||- |\* |\d+\. |>)/.test(l)) {
      if (para.length) break;
      continue;
    }
    para.push(l.trim());
  }
  const text = para.join(' ');
  const sentence = /^(.+?[.!?])(?:\s|$)/.exec(text)?.[1] ?? text;
  return { title, about: sentence.replace(/\s+/g, ' ') };
}

export function indexOf(folder) {
  const files = readdirSync(join(root, folder)).filter((f) => f.endsWith('.md') && f !== 'README.md').sort();
  return [OPEN, ...files.map((f) => {
    const { title, about } = aboutOf(readFileSync(join(root, folder, f), 'utf8'));
    return `- [${title}](${f}): ${about}`;
  }), CLOSE].join('\n');
}

export function withIndex(text, index) {
  const a = text.indexOf(OPEN);
  const b = text.indexOf(CLOSE);
  if (a < 0 || b < a) throw new Error('no generated block');
  return text.slice(0, a) + index + text.slice(b + CLOSE.length);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  for (const folder of FOLDERS) {
    if (process.argv.includes('--write')) {
      const file = join(root, folder, 'README.md');
      writeFileSync(file, withIndex(readFileSync(file, 'utf8'), indexOf(folder)));
      console.log(`${folder}/README.md: index written.`);
    } else console.log(`${folder}\n${indexOf(folder)}\n`);
  }
}
