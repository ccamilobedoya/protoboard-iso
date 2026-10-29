// The privacy scan (CLAUDE.md, "Privacy"), as a function so test/privacy.test.js can run it on the
// repository and on a throwaway repository built to prove it works.
//
//   scanRepo({ root, localFile }) → { findings: ['file:line: what: match'], local: n }
//
// What it checks, in tracked and new (not ignored) files:
// - names that must never be committed (NEVER_COMMIT), whatever .gitignore says: `git add -f`
//   goes past it;
// - generic patterns (emails, home folders, private hosts and IPs, secrets) and the maintainer's
//   own words (privacy.local.txt, one regular expression per line, kept out of git);
// - in each file's text and in its path, both normalised to NFC, so "Año" typed with a combining
//   tilde still matches "Año" in the list;
// - file names read with `git ls-files -z`: without it git quotes a name with an accent
//   ("a\303\261o.md") and the file would be skipped in silence;
// - a file it cannot read, or a line of privacy.local.txt that is not a valid expression, is a
//   finding, never a pass.

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { basename, join } from 'node:path';
import { SECRET_NAMES } from '../../.claude/hooks/secret-paths.js';

export const BINARY = /\.(png|jpe?g|gif|webp|ico|pdf|woff2?|ttf|zip)$/i;
// Files that hold the patterns themselves.
export const SKIP = new Set(['package-lock.json', 'mcp/package-lock.json', 'test/privacy.test.js', 'test/privacy/scan.js']);

export const GENERIC = [
  ['email address', /[A-Za-z0-9._%+-]+@(?!example\.(?:com|org)\b|users\.noreply\.github\.com\b)[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/],
  ['home folder', /\/home\/[a-z_][a-z0-9_-]*\/|\/Users\/[A-Za-z][\w.-]*\/|[A-Z]:\\Users\\/],
  ['path in a home folder (~/…, only ~/.config-like folders are generic)', /~\/(?!\.)[A-Za-z]/],
  ['private hostname', /\.ts\.net\b|\.tailscale\.net\b/],
  ['private IP address', /\b(?:192\.168|10\.\d{1,3}|172\.(?:1[6-9]|2\d|3[01]))\.\d{1,3}\.\d{1,3}\b/],
  ['secret', /\bgh[pousr]_[A-Za-z0-9]{20,}|\bgithub_pat_[A-Za-z0-9_]{20,}|\bsk-ant-[A-Za-z0-9_-]{10,}|\bAKIA[0-9A-Z]{16}\b|\bAIza[0-9A-Za-z_-]{35}|\bxox[abprs]-[A-Za-z0-9-]{10,}|\bnpm_[A-Za-z0-9]{36}\b|-----BEGIN [A-Z ]*PRIVATE KEY-----/],
];

// File names that are never committed (case does not matter): the secrets the Claude Code hook
// also keeps tools away from (.claude/hooks/secret-paths.js), and the maintainer's private files.
export const NEVER_COMMIT = [...SECRET_NAMES, ['a private file of the maintainer', /^(?:CLAUDE\.local\.md|privacy\.local\.txt)$/i]];

// The maintainer's own words: [what, pattern] per line, and the lines that are not valid.
export function localPatterns(localFile) {
  if (!localFile || !existsSync(localFile)) return { patterns: [], bad: [] };
  const patterns = [];
  const bad = [];
  readFileSync(localFile, 'utf8')
    .split('\n')
    .forEach((raw, i) => {
      const line = raw.trim().normalize('NFC');
      if (!line || line.startsWith('#')) return;
      try {
        patterns.push(['a word in privacy.local.txt', new RegExp(line, 'i')]);
      } catch (e) {
        bad.push(`privacy.local.txt:${i + 1}: not a valid expression (${e.message})`);
      }
    });
  return { patterns, bad };
}

// Tracked and new files, or null outside a git checkout (a package: nothing to check).
export function listFiles(root) {
  try {
    return execFileSync('git', ['ls-files', '-z', '-co', '--exclude-standard'], { cwd: root, encoding: 'utf8' })
      .split('\0')
      .filter(Boolean);
  } catch {
    return null;
  }
}

export function scanText(text, patterns, where) {
  const found = [];
  text
    .normalize('NFC')
    .split('\n')
    .forEach((line, i) => {
      for (const [what, pattern] of patterns) {
        const m = line.match(pattern);
        if (m) found.push(`${where}:${i + 1}: ${what}: ${m[0]}`);
      }
    });
  return found;
}

export function scanRepo({ root, localFile = join(root, 'privacy.local.txt') }) {
  const list = listFiles(root);
  if (!list) return null;
  const local = localPatterns(localFile);
  const patterns = [...GENERIC, ...local.patterns];
  const findings = [...local.bad];
  for (const file of list) {
    const name = basename(file).normalize('NFC');
    for (const [what, pattern] of NEVER_COMMIT) if (pattern.test(name)) findings.push(`${file}: never committed: ${what}`);
    for (const f of scanText(file, patterns, '(path)')) findings.push(`${file} ${f}`);
    if (SKIP.has(file) || BINARY.test(file)) continue;
    const full = join(root, file);
    if (!existsSync(full)) continue; // deleted in the work tree, not yet in the index
    let text;
    try {
      if (!statSync(full).isFile()) continue;
      text = readFileSync(full, 'utf8');
    } catch (e) {
      findings.push(`${file}: unreadable (${e.code ?? e.message}): fix its permissions or ignore it`);
      continue;
    }
    findings.push(...scanText(text, patterns, file));
  }
  return { findings, local: local.patterns.length };
}
