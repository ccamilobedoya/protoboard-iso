// The repository is public: nothing in it may carry personal data, private paths, private
// hostnames or secrets (CLAUDE.md, "Privacy"). The patterns here are generic; a maintainer's own
// words (a name, a machine, a notes app's ids) go in privacy.local.txt at the root, one regular
// expression per line, kept out of git so the check is not itself a list of what it protects.
// Files checked: tracked and new (not ignored) ones, so a mistake is caught before a commit.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('../', import.meta.url).pathname;
const BINARY = /\.(png|jpe?g|gif|webp|ico|pdf|woff2?|ttf|zip)$/i;
const SKIP = new Set(['package-lock.json', 'mcp/package-lock.json', 'test/privacy.test.js']);

const GENERIC = [
  ['email address', /[A-Za-z0-9._%+-]+@(?!example\.(?:com|org)\b|users\.noreply\.github\.com\b)[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/],
  ['home folder', /\/home\/[a-z_][a-z0-9_-]*\/|\/Users\/[A-Za-z][\w.-]*\/|[A-Z]:\\Users\\/],
  ['path in a home folder (~/…, only ~/.config-like folders are generic)', /~\/(?!\.)[A-Za-z]/],
  ['private hostname', /\.ts\.net\b|\.tailscale\.net\b/],
  ['private IP address', /\b(?:192\.168|10\.\d{1,3}|172\.(?:1[6-9]|2\d|3[01]))\.\d{1,3}\.\d{1,3}\b/],
  ['secret', /\bghp_[A-Za-z0-9]{20,}|\bsk-ant-[A-Za-z0-9_-]{10,}|-----BEGIN [A-Z ]*PRIVATE KEY-----/],
];

const local = existsSync(join(root, 'privacy.local.txt'))
  ? readFileSync(join(root, 'privacy.local.txt'), 'utf8')
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith('#'))
      .map((l) => ['a word in privacy.local.txt', new RegExp(l, 'i')])
  : [];

function files() {
  try {
    return execFileSync('git', ['ls-files', '-co', '--exclude-standard'], { cwd: root, encoding: 'utf8' })
      .split('\n')
      .filter((f) => f && !BINARY.test(f) && !SKIP.has(f) && existsSync(join(root, f)));
  } catch {
    return null; // not a git checkout (a package): nothing to check
  }
}

test('no personal data, private paths, hostnames or secrets in the repository', (t) => {
  const list = files();
  if (!list) return t.skip('not a git checkout');
  const found = [];
  for (const file of list) {
    const lines = readFileSync(join(root, file), 'utf8').split('\n');
    lines.forEach((line, i) => {
      for (const [what, pattern] of [...GENERIC, ...local]) {
        const m = line.match(pattern);
        if (m) found.push(`${file}:${i + 1}: ${what}: ${m[0]}`);
      }
    });
  }
  assert.deepEqual(found, [], `Private data found (see CLAUDE.md, "Privacy"):\n${found.join('\n')}`);
});
