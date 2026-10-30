#!/usr/bin/env node
// Protects main on GitHub, for the repository's owner to run (it needs admin rights, through the
// gh command line):
//
//   node scripts/github-ruleset.js            show what it would do (nothing changes)
//   node scripts/github-ruleset.js --apply    do it
//
// - a ruleset "main" on the default branch: no deletion, no force push, and the CI's verify jobs
//   (one per Node version of .github/workflows/ci.yml) must pass. Admins can bypass it, because the
//   maintainer pushes straight to main; everyone else goes through a pull request.
// - secret scanning with push protection: GitHub refuses a push that carries a known secret.
// Run again after the CI's Node versions change: it updates the ruleset in place.

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));

// The names GitHub gives the CI's verify jobs: "verify (Node 22)", one per version in the matrix.
export function ciChecks(ciYaml) {
  const name = /^\s+name:\s*verify \(Node \$\{\{ matrix\.node \}\}\)\s*$/m.test(ciYaml);
  const nodes = /^\s+node:\s*\[([^\]]+)\]/m.exec(ciYaml)?.[1].split(',').map((s) => s.trim());
  if (!name || !nodes?.length) throw new Error('ci.yml: no "verify (Node …)" job with a node matrix');
  return nodes.map((n) => `verify (Node ${n})`);
}

export const rulesetFor = (checks) => ({
  name: 'main',
  target: 'branch',
  enforcement: 'active',
  conditions: { ref_name: { include: ['~DEFAULT_BRANCH'], exclude: [] } },
  bypass_actors: [{ actor_id: 5, actor_type: 'RepositoryRole', bypass_mode: 'always' }], // 5: admin
  rules: [
    { type: 'deletion' },
    { type: 'non_fast_forward' },
    { type: 'required_status_checks', parameters: { strict_required_status_checks_policy: false, required_status_checks: checks.map((context) => ({ context })) } },
  ],
});

export const SECURITY = { security_and_analysis: { secret_scanning: { status: 'enabled' }, secret_scanning_push_protection: { status: 'enabled' } } };

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const apply = process.argv.includes('--apply');
  const gh = (...args) => execFileSync('gh', args, { cwd: root, encoding: 'utf8' });
  const api = (method, path, body) => JSON.parse(execFileSync('gh', ['api', '--method', method, path, '--input', '-'], { cwd: root, encoding: 'utf8', input: JSON.stringify(body ?? {}) }) || 'null');
  const repo = gh('repo', 'view', '--json', 'nameWithOwner', '--jq', '.nameWithOwner').trim();
  const ruleset = rulesetFor(ciChecks(readFileSync(join(root, '.github/workflows/ci.yml'), 'utf8')));
  const existing = JSON.parse(gh('api', `repos/${repo}/rulesets`)).find((r) => r.name === ruleset.name);
  const plan = [
    [existing ? 'PUT' : 'POST', existing ? `repos/${repo}/rulesets/${existing.id}` : `repos/${repo}/rulesets`, ruleset],
    ['PATCH', `repos/${repo}`, SECURITY],
  ];
  for (const [method, path, body] of plan) {
    console.log(`${method} ${path}\n${JSON.stringify(body, null, 2)}\n`);
    if (apply) api(method, path, body);
  }
  console.log(apply ? `Done: ${repo} protects main and scans for secrets.` : 'Nothing changed. Run with --apply to do it (needs admin rights on the repository).');
}
