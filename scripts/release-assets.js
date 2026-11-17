#!/usr/bin/env node
// The release workflow's checks (.github/workflows/release.yml), here so they run and are tested
// without GitHub: a tag is released only when it is v + package.json's version (and mcp/'s), and
// CHANGELOG.md has that version's dated section, which becomes the release notes.
//
//   node scripts/release-assets.js check <tag>       exit 1 with the reason when the tag cannot be released
//   node scripts/release-assets.js notes <version>   the version's section of CHANGELOG.md, to stdout

import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(fileURLToPath(new URL('../', import.meta.url)));
const read = (f) => readFileSync(join(root, f), 'utf8');

// The body of a version's section: from its "## [x.y.z] - date" heading to the next "## " heading
// (or the link definitions at the end), trimmed. null when the version has no dated section.
export function changelogSection(text, version) {
  const lines = text.split(/\r?\n/);
  const heading = new RegExp(`^## \\[${version.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\] - \\d{4}-\\d{2}-\\d{2}$`);
  const start = lines.findIndex((l) => heading.test(l));
  if (start < 0) return null;
  let end = lines.findIndex((l, i) => i > start && /^## /.test(l));
  if (end < 0) end = lines.length;
  const body = lines.slice(start + 1, end);
  while (body.length && /^\s*(\[[^\]]+\]: \S+)?\s*$/.test(body[body.length - 1])) body.pop();
  const out = body.join('\n').trim();
  return out || null;
}

// Why a tag cannot be released, or [] when it can.
export function releaseProblems(tag, { version, mcpVersion, changelog }) {
  const problems = [];
  if (tag !== `v${version}`) problems.push(`the tag ${tag} is not v${version}, the version in package.json`);
  if (mcpVersion !== version) problems.push(`mcp/package.json has ${mcpVersion}, package.json ${version}`);
  if (!changelogSection(changelog, version)) problems.push(`CHANGELOG.md has no dated section "## [${version}] - <date>" with text in it`);
  return problems;
}

const repository = () => ({
  version: JSON.parse(read('package.json')).version,
  mcpVersion: JSON.parse(read('mcp/package.json')).version,
  changelog: read('CHANGELOG.md'),
});

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [command, arg] = process.argv.slice(2);
  if (command === 'check' && arg) {
    const problems = releaseProblems(arg, repository());
    if (problems.length) {
      console.error(`${arg} cannot be released:\n${problems.map((p) => `  ${p}`).join('\n')}`);
      process.exit(1);
    }
    console.log(`${arg}: package.json, mcp/package.json and CHANGELOG.md agree.`);
  } else if (command === 'notes' && arg) {
    const section = changelogSection(read('CHANGELOG.md'), arg);
    if (!section) {
      console.error(`CHANGELOG.md has no section for ${arg}`);
      process.exit(1);
    }
    process.stdout.write(`${section}\n`);
  } else {
    console.error('usage: release-assets.js check <tag> | notes <version>');
    process.exit(1);
  }
}
