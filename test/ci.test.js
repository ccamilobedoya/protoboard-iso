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
  for (const file of ['README.md', 'README.es.md', 'plugin-src/SKILL.md', 'PLANNING.md', 'docs/es/planeacion.md']) {
    // The decision log (section 5) keeps what was decided then: only what is in force counts.
    const text = read(file).split(/^## 5\./m)[0];
    const promised = [...text.matchAll(/Node(?:\.js)? (?:≥ (\d+)|(\d+) or later)/g)].map((m) => m[1] ?? m[2]);
    assert.ok(promised.length, `${file} says which Node`);
    assert.deepEqual([...new Set(promised)], [min], `${file}: Node ≥ ${min}`);
  }
});

// The jobs of a workflow, by name: the text of each, from its line under jobs: to the next.
const jobsOf = (yml) => Object.fromEntries(yml.split(/^jobs:\n/m)[1].split(/^(?= {2}[\w-]+:\n)/m).filter((b) => /^ {2}[\w-]+:/.test(b)).map((b) => [/^ {2}([\w-]+):/.exec(b)[1], b]));

test('release: on a tag v* or by hand with dry_run, Node 22, write permission only on the job that publishes', () => {
  const release = read('.github/workflows/release.yml');
  assert.match(release, /^on:\n {2}push:\n {4}tags: \['v\*'\]\n {2}workflow_dispatch:\n {4}inputs:\n {6}dry_run:/m);
  assert.match(release, /^permissions:\n {2}contents: read$/m, 'read by default');
  const jobs = jobsOf(release);
  assert.deepEqual(Object.keys(jobs), ['build', 'release']);
  assert.match(jobs.build, /permissions:\n\s+contents: read/);
  assert.equal((release.match(/contents: write/g) ?? []).length, 1);
  assert.match(jobs.release, /permissions:\n\s+contents: write/);
  assert.match(jobs.release, /if: github\.ref_type == 'tag' && !\(github\.event_name == 'workflow_dispatch' && inputs\.dry_run\)/, 'never on a dry run, never without a tag');
  const min = /^>=(\d+)$/.exec(JSON.parse(read('package.json')).engines.node)[1];
  assert.deepEqual([...release.matchAll(/node-version: (\S+)/g)].map((m) => m[1]), [min], 'the Node engines promises');
  assert.match(jobs.build, /persist-credentials: false/);
});

test('release: the build checks before it builds, and publishes the four files with the changelog as notes', () => {
  const { build, release } = jobsOf(read('.github/workflows/release.yml'));
  const order = ['node scripts/release-assets.js check "$tag"', 'node scripts/release-assets.js notes "$version" > release-notes.md', 'node scripts/pack-skill.js --check', 'zip -qrX', 'node scripts/pack-mcpb.js --out', 'sha256sum -- *.zip *.mcpb > SHA256SUMS', 'actions/upload-artifact@'];
  const at = order.map((s) => build.indexOf(s));
  assert.ok(at.every((i) => i >= 0), `every step is there: ${order.filter((_, i) => at[i] < 0).join(', ')}`);
  assert.deepEqual([...at].sort((a, b) => a - b), at, 'in this order');
  for (const name of ['plugin-', 'skill-', ''].map((k) => `protoboard-iso-${k}\${VERSION}.${k ? 'zip' : 'mcpb'}`)) assert.ok(build.includes(name), name);
  assert.match(build, /unzip -Z1 "\$f" \| cut -d\/ -f1 \| sort -u\)" = protoboard-iso/, 'one top-level folder in each zip');
  assert.match(build, /npm --prefix mcp ci --omit=dev --omit=optional --ignore-scripts/, 'no rasteriser');
  assert.doesNotMatch(build, /gh release/);
  assert.match(release, /gh release create "\$TAG" release\/dist\/\* --repo "\$GITHUB_REPOSITORY" --verify-tag --title "\$TAG" --notes-file release\/release-notes\.md/);
  assert.match(release, /GH_TOKEN: \$\{\{ github\.token \}\}/);
});

test('release: the official mcpb CLI is pinned to an exact version', async () => {
  const { MCPB_CLI } = await import('../scripts/pack-mcpb.js');
  assert.match(MCPB_CLI, /^@anthropic-ai\/mcpb@\d+\.\d+\.\d+$/);
});
