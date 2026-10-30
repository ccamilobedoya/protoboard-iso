#!/usr/bin/env node
// The named options of project.json, as the block CLAUDE.md shows between its markers
// <!-- generated: project.json --> and <!-- /generated -->. test/project.test.js fails when the
// block is stale.
//
//   npm run options             show the block
//   npm run options -- --write  write it into CLAUDE.md

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
export const OPEN = '<!-- generated: project.json (npm run options -- --write) -->';
export const CLOSE = '<!-- /generated -->';

export const projectOptions = () => JSON.parse(readFileSync(join(root, 'project.json'), 'utf8')).options;
export const optionValue = (name) => projectOptions()[name].value;

export const optionsBlock = (options = projectOptions()) => [OPEN, ...Object.entries(options).map(([name, o]) => `- \`${name}\` = ${o.value}: ${o.means}.`), CLOSE].join('\n');

// CLAUDE.md with its block replaced by the current one; throws if the markers are missing.
export function withBlock(text, block = optionsBlock()) {
  const a = text.indexOf(OPEN);
  const b = text.indexOf(CLOSE);
  if (a < 0 || b < a) throw new Error(`CLAUDE.md has no ${OPEN} … ${CLOSE} block`);
  return text.slice(0, a) + block + text.slice(b + CLOSE.length);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv.includes('--write')) {
    const file = join(root, 'CLAUDE.md');
    writeFileSync(file, withBlock(readFileSync(file, 'utf8')));
    console.log('CLAUDE.md: options block written.');
  } else console.log(optionsBlock());
}
