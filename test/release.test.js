// The release's checks (scripts/release-assets.js): the version's section of the changelog becomes
// the notes, and a tag is released only as v + the version both packages have, with that section.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { changelogSection, releaseProblems } from '../scripts/release-assets.js';

const root = new URL('../', import.meta.url).pathname;
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));

const sample = `# Changelog

## [Unreleased]

- Something not out yet.

## [1.2.0] - 2026-01-02

Short summary.

### Added

- A thing.

## [1.1.0] - 2026-01-01

- The first.

[Unreleased]: https://example.org/compare/v1.2.0...HEAD
[1.2.0]: https://example.org/compare/v1.1.0...v1.2.0
[1.1.0]: https://example.org/releases/tag/v1.1.0
`;

test('release: changelogSection takes one version, up to the next heading, without the link definitions', () => {
  assert.equal(changelogSection(sample, '1.2.0'), 'Short summary.\n\n### Added\n\n- A thing.');
  assert.equal(changelogSection(sample, '1.1.0'), '- The first.');
  assert.equal(changelogSection(sample, '1.3.0'), null);
  assert.equal(changelogSection(sample, 'Unreleased'), null, 'only a dated section');
  assert.equal(changelogSection(sample, '1.2'), null, 'the whole version, not a prefix');
  assert.equal(changelogSection(sample.replace('1.2.0] - 2026-01-02', '1.2.x] - 2026-01-02'), '1.2.0'), null);
  assert.equal(changelogSection('## [2.0.0] - 2026-02-02\n\n## [1.0.0] - 2026-01-01\n- a\n', '2.0.0'), null, 'an empty section is none');
  assert.equal(changelogSection(sample.replace(/\n/g, '\r\n'), '1.1.0'), '- The first.');
});

test('release: releaseProblems names each reason a tag cannot be released', () => {
  const ok = { version: '1.2.0', mcpVersion: '1.2.0', changelog: sample };
  assert.deepEqual(releaseProblems('v1.2.0', ok), []);
  assert.match(releaseProblems('v1.2.1', ok).join(), /not v1\.2\.0/);
  assert.match(releaseProblems('1.2.0', ok).join(), /not v1\.2\.0/);
  assert.match(releaseProblems('v1.2.0', { ...ok, mcpVersion: '1.1.0' }).join(), /mcp\/package\.json has 1\.1\.0/);
  assert.match(releaseProblems('v1.3.0', { ...ok, version: '1.3.0', mcpVersion: '1.3.0' }).join(), /no dated section/);
});

test("release: the command on this repository: its own version passes, another tag fails, the notes are the changelog's", () => {
  const run = (...args) => spawnSync(process.execPath, [join(root, 'scripts/release-assets.js'), ...args], { encoding: 'utf8' });
  const good = run('check', `v${pkg.version}`);
  assert.equal(good.status, 0, good.stderr);
  const bad = run('check', 'v0.0.0-fake');
  assert.equal(bad.status, 1);
  assert.match(bad.stderr, /cannot be released/);
  const notes = run('notes', pkg.version);
  assert.equal(notes.status, 0, notes.stderr);
  assert.equal(notes.stdout, `${changelogSection(readFileSync(join(root, 'CHANGELOG.md'), 'utf8'), pkg.version)}\n`);
  assert.equal(run('notes', '0.0.0').status, 1);
  assert.equal(run().status, 1, 'usage');
});
