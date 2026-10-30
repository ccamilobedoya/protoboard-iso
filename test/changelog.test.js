// CHANGELOG.md and the versions: the newest released version is package.json's (and mcp/'s), each
// released version has a date and a git tag v<version> on a commit with that version, and the
// links at the bottom match the versions.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('../', import.meta.url).pathname;
const changelog = readFileSync(join(root, 'CHANGELOG.md'), 'utf8');
const versionOf = (file) => JSON.parse(readFileSync(join(root, file), 'utf8')).version;

// The versions of the changelog, newest first: { version, date } (Unreleased has no date).
export const versions = (text) => [...text.matchAll(/^## \[([^\]]+)\](?: - (\d{4}-\d{2}-\d{2}))?$/gm)].map((m) => ({ version: m[1], date: m[2] }));

test('changelog: newest first, each released version dated, the newest is package.json', () => {
  const list = versions(changelog);
  assert.equal(list[0].version, 'Unreleased');
  const released = list.slice(1);
  assert.ok(released.length >= 2);
  for (const v of released) assert.match(v.date ?? '', /^\d{4}-\d{2}-\d{2}$/, `${v.version} has a date`);
  const dates = released.map((v) => v.date);
  assert.deepEqual([...dates].sort().reverse(), dates, 'newest first');
  assert.equal(released[0].version, versionOf('package.json'), 'package.json is the newest released version');
  for (const v of list) assert.match(changelog, new RegExp(`^\\[${v.version.replace(/\./g, '\\.')}\\]: https://`, 'm'), `a link for ${v.version}`);
});

test('changelog: each released version has its git tag, on a commit with that version', (t) => {
  let tags;
  try {
    tags = execFileSync('git', ['tag', '-l', 'v*'], { cwd: root, encoding: 'utf8' }).split('\n').filter(Boolean);
  } catch {
    return t.skip('not a git checkout');
  }
  for (const { version } of versions(changelog).slice(1)) {
    assert.ok(tags.includes(`v${version}`), `tag v${version} (git tag -a v${version} <commit>, then push it)`);
    const pkg = JSON.parse(execFileSync('git', ['show', `v${version}:package.json`], { cwd: root, encoding: 'utf8' }));
    assert.equal(pkg.version, version, `v${version} points at a commit whose package.json is ${pkg.version}`);
  }
});
