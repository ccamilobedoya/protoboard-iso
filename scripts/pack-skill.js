#!/usr/bin/env node
// The plugin folder for the Claude apps: one skill with the kit inside (PLANNING.md, decision of
// 2026-11-15). The chat copies a skill's whole folder to its sandbox, so the skill carries the CLI's
// run-time files; a top-level bin/ makes claude.ai refuse a plugin, so the plugin is its own folder,
// plugin/, written from plugin-src/ and the kit, committed, and never edited by hand.
//
//   node scripts/pack-skill.js              write plugin/ from scratch
//   node scripts/pack-skill.js --check      exit 1 with the differences when plugin/ is stale, 0 when not
//   node scripts/pack-skill.js --out <dir>  write the plugin folder to <dir> (new or empty) instead
//
// Only what the CLI reads at run time goes in: bin/ and src/ (without its Markdown notes). schema/
// is left out: the CLI builds the schemas from src/schema.js and never reads those files.

import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(fileURLToPath(new URL('../', import.meta.url)));
const SOURCE = join(root, 'plugin-src');
export const SKILL = 'protoboard-iso';

// Every file under dir, as sorted paths relative to it with forward slashes.
export function listTree(dir) {
  const out = [];
  const walk = (d) => {
    for (const name of readdirSync(d).sort()) {
      const full = join(d, name);
      if (statSync(full).isDirectory()) walk(full);
      else out.push(relative(dir, full).split(sep).join('/'));
    }
  };
  walk(dir);
  return out;
}

// The files of the kit the skill carries: [from (relative to the repository), to (relative to the skill)].
const kitFiles = () =>
  ['bin', 'src'].flatMap((folder) =>
    listTree(join(root, folder))
      .filter((f) => !f.endsWith('.md'))
      .map((f) => [`${folder}/${f}`, `scripts/${folder}/${f}`]),
  );

// Writes the plugin folder into dir, which must not exist or be empty.
export function packTo(dir) {
  if (existsSync(dir) && readdirSync(dir).length) throw new Error(`${dir} is not empty`);
  const version = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version;
  const manifest = { ...JSON.parse(readFileSync(join(SOURCE, 'plugin.json'), 'utf8')), version };
  const skill = `skills/${SKILL}`;
  const copies = [
    ['plugin-src/README.md', 'README.md'],
    ['LICENSE', 'LICENSE'],
    // The listing's icon: a square PNG where the apps look for it (drawn from plugin-src/icon.svg).
    ['plugin-src/icon.png', '.claude-plugin/icon.png'],
    ['plugin-src/SKILL.md', `${skill}/SKILL.md`],
    ...listTree(join(SOURCE, 'references')).map((f) => [`plugin-src/references/${f}`, `${skill}/references/${f}`]),
    ...kitFiles().map(([from, to]) => [from, `${skill}/${to}`]),
  ];
  const write = (to, make) => {
    const file = join(dir, to);
    mkdirSync(dirname(file), { recursive: true });
    make(file);
  };
  write('.claude-plugin/plugin.json', (file) => writeFileSync(file, `${JSON.stringify(manifest, null, 2)}\n`));
  for (const [from, to] of copies) write(to, (file) => copyFileSync(join(root, from), file));
  return listTree(dir);
}

// The differences between two plugin folders, by names and bytes.
export function treeDifferences(expected, actual) {
  const a = existsSync(expected) ? listTree(expected) : [];
  const b = existsSync(actual) ? listTree(actual) : [];
  const inB = new Set(b);
  const inA = new Set(a);
  return [
    ...a.filter((f) => !inB.has(f)).map((f) => `missing: ${f}`),
    ...b.filter((f) => !inA.has(f)).map((f) => `not expected: ${f}`),
    ...a.filter((f) => inB.has(f) && !readFileSync(join(expected, f)).equals(readFileSync(join(actual, f)))).map((f) => `differs: ${f}`),
  ];
}

// A fresh pack in a temporary folder, compared with plugin/: the list of differences.
export function staleness(target = join(root, 'plugin')) {
  const temp = mkdtempSync(join(tmpdir(), 'pack-skill-'));
  try {
    packTo(join(temp, 'plugin'));
    return treeDifferences(join(temp, 'plugin'), target);
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
}

// plugin/ is removed only by this path, computed here and checked, never one given from outside.
function pluginFolder() {
  const folder = join(root, 'plugin');
  if (basename(folder) !== 'plugin' || dirname(folder) !== root || !existsSync(join(root, 'package.json'))) {
    throw new Error(`refusing to replace ${folder}: not <repository>/plugin`);
  }
  return folder;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const argv = process.argv.slice(2);
  if (argv.includes('--check')) {
    const diffs = staleness();
    if (diffs.length) {
      console.log(`plugin/ is stale (npm run pack-skill):\n${diffs.map((d) => `  ${d}`).join('\n')}`);
      process.exit(1);
    }
    console.log('plugin/ is up to date.');
  } else if (argv.includes('--out')) {
    const out = argv[argv.indexOf('--out') + 1];
    if (!out) {
      console.error('--out needs a folder');
      process.exit(1);
    }
    const files = packTo(resolve(out));
    console.log(`${resolve(out)}: ${files.length} files.`);
  } else {
    const folder = pluginFolder();
    rmSync(folder, { recursive: true, force: true });
    const files = packTo(folder);
    console.log(`plugin/: ${files.length} files.`);
  }
}
