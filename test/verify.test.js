// scripts/verify.js (npm run verify) and the git hooks that run it (scripts/hooks/): three exits,
// a step that could not run is never a pass, and the examples are held to the issues they report.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { examplesIssues, issueChanges, exitCode, STEPS } from '../scripts/verify.js';

const root = new URL('../', import.meta.url).pathname;

test('verify: 0 when all passed, 1 when one failed, 2 when one could not run', () => {
  const pass = { status: 'pass' };
  const fail = { status: 'fail' };
  const skip = { status: 'skip' };
  assert.equal(exitCode([pass, pass]), 0);
  assert.equal(exitCode([pass, skip]), 2, 'a step that did not run is not a pass');
  assert.equal(exitCode([skip, fail, pass]), 1, 'a failure wins');
  assert.equal(exitCode([]), 0);
});

test('verify: the issues of each example, read from npm run examples and compared', () => {
  const out = 'Rendering…\nled.front.svg: 0 issues\nbad.front.svg: 8 issues\n  error: Hole h12 holds two leads\nbad.back.svg: 1 issue\n';
  const found = examplesIssues(out);
  assert.deepEqual(found, { 'led.front.svg': 0, 'bad.front.svg': 8, 'bad.back.svg': 1 });
  assert.deepEqual(issueChanges(found, found), []);
  assert.deepEqual(issueChanges({ 'led.front.svg': 0, 'old.svg': 2 }, { 'led.front.svg': 1, 'new.svg': 0 }), ['led.front.svg: 0 expected, 1 now', 'new.svg: none expected, 0 now', 'old.svg: 2 expected, none now']);
  const expected = JSON.parse(readFileSync(join(root, 'test/fixtures/examples-issues.json'), 'utf8'));
  assert.ok(Object.keys(expected).length > 10, 'the expected issues of the examples are stored');
});

test('verify: the steps of "How to verify a change", and the quick ones for pre-commit', () => {
  const full = STEPS.filter((s) => s.full).map((s) => s.name);
  for (const what of ['coverage', 'lint', 'knip', 'dupes', 'test:mcp', 'golden', 'examples']) assert.ok(full.some((n) => n.includes(what)), what);
  assert.ok(STEPS.some((s) => s.quick && /privacy/.test(s.name)));
});

test('git hooks: executable, pre-commit quick, pre-push the whole verification', () => {
  for (const hook of ['pre-commit', 'pre-push']) {
    const file = join(root, 'scripts/hooks', hook);
    assert.ok(statSync(file).mode & 0o111, `${hook} is executable`);
    assert.match(readFileSync(file, 'utf8'), /^#!\/bin\/sh\n/);
  }
  assert.match(readFileSync(join(root, 'scripts/hooks/pre-commit'), 'utf8'), /scripts\/verify\.js" --quick$/m);
  assert.match(readFileSync(join(root, 'scripts/hooks/pre-push'), 'utf8'), /scripts\/verify\.js"$/m);
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  assert.equal(pkg.scripts.verify, 'node scripts/verify.js');
  assert.equal(pkg.scripts.setup, 'node scripts/setup.js');
});
