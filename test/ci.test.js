// The repository's GitHub side, read from its files: the CI runs the whole verification on the Node
// versions engines promise, every action is pinned by commit SHA, dependabot watches each place
// that has dependencies, and the ruleset requires the CI's own job names.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ciChecks, rulesetFor } from '../scripts/github-ruleset.js';

const root = new URL('../', import.meta.url).pathname;
const read = (f) => readFileSync(join(root, f), 'utf8');
const ci = read('.github/workflows/ci.yml');
const workflows = readdirSync(join(root, '.github/workflows')).filter((f) => /\.ya?ml$/.test(f));

test('ci: the whole verification on every push and pull request, with gitleaks pinned', () => {
  assert.match(ci, /^on:\n {2}push:\n {2}pull_request:/m);
  assert.match(ci, /run: npm run verify$/m);
  assert.match(ci, /npm ci\n\s+npm --prefix mcp ci/, 'the development tools and the MCP server installed');
  assert.match(ci, /npx playwright install --with-deps chromium-headless-shell$/m, 'a browser for the golden frames');
  assert.match(ci, /fetch-depth: 0/, 'gitleaks reads the whole history');
  assert.match(ci, /GITLEAKS_SHA256: [0-9a-f]{64}/);
  assert.match(ci, /sha256sum -c -/);
  assert.match(ci, /name: Install gitleaks\n\s+working-directory: \$\{\{ runner\.temp \}\}/, 'gitleaks downloaded outside the checkout, where the privacy test would scan it');
  assert.doesNotMatch(ci.replace(/^\s*#.*$/gm, ''), /privacy\.local/, 'the private word list never reaches the CI');
});

test('ci: the Node versions are the ones engines promises, in both packages', () => {
  const versions = /^\s+node:\s*\[([^\]]+)\]/m.exec(ci)[1].split(',').map((s) => Number(s.trim()));
  for (const pkg of ['package.json', 'mcp/package.json']) {
    const min = Number(/^>=(\d+)$/.exec(JSON.parse(read(pkg)).engines.node)?.[1]);
    assert.equal(Math.min(...versions), min, `${pkg}: engines.node is >=${Math.min(...versions)}, the oldest Node the CI runs`);
  }
});

test('ci: every action in every workflow is pinned by commit SHA, with its tag beside it', () => {
  assert.ok(workflows.length >= 2);
  for (const file of workflows) {
    for (const [, action] of read(`.github/workflows/${file}`).matchAll(/uses:\s*(\S+.*)$/gm)) assert.match(action, /^[\w.-]+\/[\w.-]+@[0-9a-f]{40} # v\d+(\.\d+)*$/, `${file}: ${action}`);
  }
});

test('dependabot: npm at the root and in mcp/, and the actions', () => {
  const d = read('.github/dependabot.yml');
  const entries = [...d.matchAll(/package-ecosystem:\s*(\S+)\n\s+directory:\s*(\S+)/g)].map((m) => `${m[1]} ${m[2]}`);
  assert.deepEqual(entries.sort(), ['github-actions /', 'npm /', 'npm /mcp']);
  for (const [, dir] of entries.map((e) => e.split(' '))) if (dir !== '/') assert.ok(existsSync(join(root, dir.slice(1), 'package-lock.json')), dir);
});

test('ruleset: it requires the CI jobs by their names, blocks force pushes and deletion', () => {
  const checks = ciChecks(ci);
  assert.deepEqual(checks, ['verify (Node 22)', 'verify (Node 24)']);
  const r = rulesetFor(checks);
  assert.deepEqual(r.rules.map((x) => x.type), ['deletion', 'non_fast_forward', 'required_status_checks']);
  assert.deepEqual(r.rules[2].parameters.required_status_checks.map((c) => c.context), checks);
  assert.deepEqual(r.conditions.ref_name.include, ['~DEFAULT_BRANCH']);
  assert.throws(() => ciChecks('jobs: {}'), /no "verify/);
});

test('docs: the Node they promise is the one engines says', () => {
  const min = /^>=(\d+)$/.exec(JSON.parse(read('package.json')).engines.node)[1];
  for (const file of ['README.md', 'README.es.md', 'SKILL.md', 'PLANNING.md', 'docs/es/planeacion.md']) {
    // The decision log (section 5) keeps what was decided then: only what is in force counts.
    const text = read(file).split(/^## 5\./m)[0];
    const promised = [...text.matchAll(/Node(?:\.js)? ≥ (\d+)/g)].map((m) => m[1]);
    assert.ok(promised.length, `${file} says which Node`);
    assert.deepEqual([...new Set(promised)], [min], `${file}: Node ≥ ${min}`);
  }
});
