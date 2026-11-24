#!/usr/bin/env node
// The verification of a change (CLAUDE.md, "How to verify a change") as one command:
//
//   npm run verify [-- --quick] [-- --write-examples]
//
// Exits 0 when every step passed, 1 when one failed, 2 when none failed but one could not run
// (the MCP server without its npm install, say): a step that did not run is never a pass.
// --quick runs only the fast checks (privacy, licences, hooks, attack), as the pre-commit hook does.
// --write-examples saves the issues the examples report now as the expected ones
// (test/fixtures/examples-issues.json), after an intended change.
//
// Named verify, not review: review is the circuit review (bin/protoboard-iso.js review).

import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { tempDir } from './tmp.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const EXPECTED = join(root, 'test/fixtures/examples-issues.json');
const node = process.execPath;
const run = (args, opts = {}) => spawnSync(args[0], args.slice(1), { cwd: root, encoding: 'utf8', ...opts });

// Issue counts per drawing, from the lines "name.view.svg: N issues" of npm run examples.
export const examplesIssues = (output) => Object.fromEntries([...output.matchAll(/^(\S+\.svg): (\d+) issues?$/gm)].map((m) => [m[1], Number(m[2])]));

// Differences between the issue counts expected and found, as lines.
export function issueChanges(expected, found) {
  const names = [...new Set([...Object.keys(expected), ...Object.keys(found)])].sort();
  return names.filter((n) => expected[n] !== found[n]).map((n) => `${n}: ${expected[n] ?? 'none'} expected, ${found[n] ?? 'none'} now`);
}

// What a failed step shows: node:test's list of failing tests when there is one (the tail alone
// is the coverage table, and on the CI the log is all there is), then the last lines.
export function failureDetail(output) {
  const lines = output.trim().split('\n');
  const tail = lines.slice(-15);
  const start = lines.findIndex((l) => /^✖ failing tests:/.test(l));
  if (start < 0) {
    // Node 22 writes TAP when there is no terminal: its failing tests are the "not ok" lines.
    const notOk = lines.filter((l) => /^\s*not ok \d+ /.test(l) && !tail.includes(l));
    return [...notOk.slice(0, 80), ...(notOk.length > 80 ? ['…'] : []), ...tail].join('\n');
  }
  const failing = lines.slice(start, start + 80).filter((l) => !tail.includes(l));
  return [...failing, ...(lines.length - start > 80 ? ['…'] : []), ...tail].join('\n');
}

// What a step left in the scratch folder (the TMPDIR every step runs with) that no earlier step
// had left: names not in `known`, which then learns them. Empty when every test cleaned up.
// Node's own compile cache (npm and Node put it in TMPDIR) is a tool's, not a test's.
const TOOL_FILES = new Set(['node-compile-cache']);
export function newLeftovers(dir, known) {
  const fresh = readdirSync(dir).filter((name) => !known.has(name) && !TOOL_FILES.has(name));
  for (const name of fresh) known.add(name);
  return fresh;
}

// Each step: run() → { status: 'pass' | 'fail' | 'skip', detail }.
const command = (args, opts) => () => {
  const r = run(args, opts);
  return r.status === 0 ? { status: 'pass' } : { status: 'fail', detail: failureDetail(`${r.stdout ?? ''}${r.stderr ?? ''}`) };
};
const QUICK = ['test/privacy.test.js', 'test/licenses.test.js', 'test/hooks.test.js', 'test/attack.test.js'];
// A development tool from node_modules/.bin (npm install), or a step that cannot run without it.
const installed = (bin) => existsSync(join(root, 'node_modules/.bin', bin));
const withTool = (bin, args) => () => (installed(bin) ? command(args)() : { status: 'skip', detail: `${bin} is not installed: npm install` });
export const STEPS = [
  {
    name: 'unit and rendering tests, with coverage thresholds (npm run coverage)',
    full: true,
    // Without c8 the tests still run; only the coverage is left unchecked.
    run: () => {
      if (installed('c8')) return command(['npm', 'run', 'coverage'])();
      const r = command(['npm', 'test'])();
      return r.status === 'fail' ? r : { status: 'skip', detail: 'tests passed, but c8 is not installed (npm install): coverage not checked' };
    },
  },
  { name: 'lint (npm run lint, Biome)', run: withTool('biome', ['npm', 'run', 'lint']), full: true },
  { name: 'unused files, exports and dependencies (npm run knip)', run: withTool('knip', ['npm', 'run', 'knip']), full: true },
  { name: 'copied code (npm run dupes, jscpd)', run: withTool('jscpd', ['npm', 'run', 'dupes']), full: true },
  { name: 'quick checks: privacy, licences, hooks, hostile input', run: command([node, '--test', ...QUICK]), quick: true },
  {
    name: 'MCP server end to end (npm run test:mcp)',
    full: true,
    run: () => (existsSync(join(root, 'mcp/node_modules')) ? command(['npm', 'run', 'test:mcp'])() : { status: 'skip', detail: 'mcp/node_modules is missing: cd mcp && npm install' }),
  },
  { name: 'simulator against the golden file', run: command([node, 'scripts/golden.js']), full: true },
  {
    name: 'golden frames of the live page (scripts/frames.js, Chromium)',
    full: true,
    // Two renders of each case, so a page that is not deterministic fails here and not later.
    // Its own exit 2 (no Playwright, no browser) is a step that could not run. On the CI (another
    // machine, other fonts) only that the two renders agree, not the stored hashes.
    run: () => {
      const r = run([node, 'scripts/frames.js', '--runs', '2', ...(process.env.CI ? ['--determinism'] : [])]);
      const detail = `${r.stdout ?? ''}${r.stderr ?? ''}`.trim();
      return r.status === 0 ? { status: 'pass' } : { status: r.status === 2 ? 'skip' : 'fail', detail };
    },
  },
  {
    name: 'examples report only the expected issues',
    full: true,
    run: () => {
      const r = run([node, 'scripts/render-examples.js']);
      if (r.status !== 0) return { status: 'fail', detail: r.stderr.trim() };
      const found = examplesIssues(r.stdout);
      if (process.argv.includes('--write-examples')) {
        writeFileSync(EXPECTED, `${JSON.stringify(found, null, 2)}\n`);
        return { status: 'pass', detail: `written ${Object.keys(found).length} drawings to test/fixtures/examples-issues.json` };
      }
      const changes = issueChanges(JSON.parse(readFileSync(EXPECTED, 'utf8')), found);
      return changes.length ? { status: 'fail', detail: `${changes.join('\n')}\n(after an intended change: npm run verify -- --write-examples)` } : { status: 'pass' };
    },
  },
];

// The exit code of a run: 1 if a step failed, 2 if one could not run, 0 otherwise.
export const exitCode = (results) => (results.some((r) => r.status === 'fail') ? 1 : results.some((r) => r.status === 'skip') ? 2 : 0);

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const quick = process.argv.includes('--quick');
  // npm test runs the quick checks too; the quick step is only for --quick.
  const steps = STEPS.filter((s) => (quick ? s.quick : s.full));
  // Every step runs with its own TMPDIR, a folder made here and removed at exit: whatever a test or
  // a script leaves behind lands there, is named below as a failure, and never reaches the shared
  // temporary folder, not even when a step crashes. Nothing from another process can be in it.
  const scratch = tempDir('pbi-verify-');
  process.env.TMPDIR = scratch;
  const known = new Set();
  const results = [];
  for (const step of steps) {
    if (process.stdout.isTTY) process.stdout.write(`… ${step.name}\r`);
    const started = Date.now();
    const r = step.run();
    const left = newLeftovers(scratch, known);
    if (left.length) {
      r.detail = `${r.detail ? `${r.detail}\n` : ''}left in the temporary folder (remove what the test creates, scripts/tmp.js): ${left.join(', ')}`;
      if (r.status === 'pass') r.status = 'fail';
    }
    results.push(r);
    const mark = { pass: '✔', fail: '✖', skip: '﹣' }[r.status];
    if (process.stdout.isTTY) process.stdout.write('\x1b[2K');
    console.log(`${mark} ${step.name} (${((Date.now() - started) / 1000).toFixed(1)} s)${r.detail ? `\n${r.detail.replace(/^/gm, '    ')}` : ''}`);
  }
  const code = exitCode(results);
  console.log(['verify: all passed', 'verify: FAILED', 'verify: nothing failed, but a step did not run (not a pass)'][code]);
  process.exit(code);
}
