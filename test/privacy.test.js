// The repository is public: nothing in it may carry personal data, private paths, private
// hostnames or secrets (CLAUDE.md, "Privacy"). The scan is test/privacy/scan.js; a maintainer's own
// words (a name, a machine, a notes app's ids) go in privacy.local.txt at the root, one regular
// expression per line, kept out of git so the check is not itself a list of what it protects.
// Files checked: tracked and new (not ignored) ones, so a mistake is caught before a commit.
// The cases below prove the patterns catch what they must and leave alone what they must; the
// secrets are built from pieces so this file holds none.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile, execFileSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { scanRepo, scanText, GENERIC, NEVER_COMMIT, localPatterns } from './privacy/scan.js';

const root = new URL('../', import.meta.url).pathname;
const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8' });
const at = '@';

test('no personal data, private paths, hostnames or secrets in the repository', (t) => {
  const r = scanRepo({ root });
  if (!r) return t.skip('not a git checkout');
  if (!r.local) t.diagnostic('privacy.local.txt not found: only the generic patterns ran');
  assert.deepEqual(r.findings, [], `Private data found (see CLAUDE.md, "Privacy"):\n${r.findings.join('\n')}`);
});

// gitleaks (a development tool, not a dependency): the history, the changes not committed yet
// (staged and not) and the new files, after it proves in a throwaway repository that it sees a
// token in each of those places. Without gitleaks the test is skipped, which node:test counts
// apart: never a pass.
// Exit 1 when gitleaks finds something: its report; '' when clean. Each run takes about half a
// second to start, so the runs of a repository go side by side.
function gitleaks(args, cwd, input) {
  return new Promise((done, fail) => {
    const child = execFile('gitleaks', [...args, '--no-banner', '--redact', '--exit-code', '1'], { cwd, encoding: 'utf8' }, (e, stdout, stderr) => {
      if (!e) return done('');
      if (e.code !== 1) return fail(e);
      done(`${stdout}${stderr}` || 'found');
    });
    if (input !== undefined) child.stdin.end(input);
  });
}
// What gitleaks finds in each place of a repository. The new files go in one run; when it finds
// something, each is run alone to name it.
async function gitleaksAll(dir) {
  const fresh = git(dir, 'ls-files', '-z', '-o', '--exclude-standard').split('\0').filter(Boolean);
  const text = (f) => readFileSync(join(dir, f), 'utf8');
  const [history, changed, staged, any] = await Promise.all([
    gitleaks(['git', '.'], dir),
    gitleaks(['git', '--pre-commit', '.'], dir),
    gitleaks(['git', '--pre-commit', '--staged', '.'], dir),
    fresh.length ? gitleaks(['stdin'], dir, fresh.map(text).join('\n')) : '',
  ]);
  const found = { history, changed, staged };
  if (any) (await Promise.all(fresh.map((f) => gitleaks(['stdin'], dir, text(f))))).forEach((v, i) => (found[`new: ${fresh[i]}`] = v));
  return Object.fromEntries(Object.entries(found).filter(([, v]) => v));
}

test('gitleaks finds no secret in the history, the changes or the new files', async (t) => {
  try {
    execFileSync('gitleaks', ['version'], { stdio: 'ignore' });
  } catch {
    return t.skip('gitleaks is not installed (https://github.com/gitleaks/gitleaks)');
  }
  // Tokens made now, so no file holds one: committed, staged, changed and new.
  const token = () => `gh${'p_'}${[...randomBytes(36)].map((b) => 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'[b % 62]).join('')}`;
  const dir = mkdtempSync(join(tmpdir(), 'pbi-gitleaks-'));
  const commit = (m) => git(dir, '-c', 'user.name=test', '-c', `user.email=test${at}example.com`, 'commit', '-qm', m);
  git(dir, 'init', '-q');
  writeFileSync(join(dir, 'a.txt'), 'clean\n');
  writeFileSync(join(dir, 'b.txt'), `token = "${token()}"\n`);
  git(dir, 'add', '.');
  commit('a and b');
  writeFileSync(join(dir, 'c.txt'), `token = "${token()}"\n`);
  git(dir, 'add', 'c.txt');
  writeFileSync(join(dir, 'a.txt'), `token = "${token()}"\n`);
  writeFileSync(join(dir, 'd.txt'), `token = "${token()}"\n`);
  assert.deepEqual(Object.keys(await gitleaksAll(dir)), ['history', 'changed', 'staged', 'new: d.txt'], 'a token in each place');
  const found = await gitleaksAll(root);
  assert.deepEqual(found, {}, `gitleaks found something (see CLAUDE.md, "Privacy"):\n${Object.entries(found).map(([k, v]) => `${k}: ${v}`).join('\n')}`);
});

const x = (n, c = 'A') => c.repeat(n);
// [text, what it must be reported as]
const MUST = [
  [`ana.perez${at}correo-real.co`, 'email address'],
  [`dev+lists${at}mail.example.net`, 'email address'],
  ['/home/someone/projects', 'home folder'],
  ['/Users/someone/Documents', 'home folder'],
  ['C:\\Users\\someone', 'home folder'],
  ['~/projects/notes', 'path in a home folder (~/…, only ~/.config-like folders are generic)'],
  ['https://box.tail1234.ts.net:8088/', 'private hostname'],
  ['192.168.1.20', 'private IP address'],
  ['10.0.0.5', 'private IP address'],
  ['172.20.1.1', 'private IP address'],
  [`gh${'p_'}${x(36)}`, 'secret'],
  [`gh${'s_'}${x(36)}`, 'secret'],
  [`github${'_pat_'}${x(30)}`, 'secret'],
  [`sk${'-ant-'}${x(20)}`, 'secret'],
  [`AK${'IA'}${x(16, 'B')}`, 'secret'],
  [`AI${'za'}${x(35)}`, 'secret'],
  [`xo${'xb-'}${x(20, '1')}`, 'secret'],
  [`np${'m_'}${x(36)}`, 'secret'],
  [`-----BEGIN OPENSSH ${'PRIVATE'} KEY-----`, 'secret'],
];
const MUST_NOT = [
  `someone${at}example.com`,
  `123+someone${at}users.noreply.github.com`,
  '~/.config/app',
  'the home folder',
  '172.32.0.1',
  '192.169.1.1',
  'version 10.2.3',
  'sk-short',
  `gh${'p_'}short`,
  '-----BEGIN PUBLIC KEY-----',
  'box.ts.network',
];

test('privacy cases: the generic patterns catch what they must, and nothing else', () => {
  for (const [text, what] of MUST) assert.deepEqual(scanText(text, GENERIC, 'case').map((f) => f.split(': ')[1]), [what], text);
  for (const text of MUST_NOT) assert.deepEqual(scanText(text, GENERIC, 'case'), [], text);
});

const NAMES_MUST = ['local.env', 'LOCAL.ENV', '.env', '.env.local', 'prod.env', 'id_rsa', 'id_ed25519', 'id_rsa_work', 'server.pem', 'ca.srl', 'site.KEY', 'cert.p12', '.netrc', 'CLAUDE.local.md', 'claude.LOCAL.md', 'privacy.local.txt'];
const NAMES_MUST_NOT = ['.env.example', 'env.js', 'id_rsa.pub', 'keyboard.js', 'keys.js', 'CLAUDE.md', 'README.md', 'monkey.txt'];

test('privacy cases: names never committed, whatever their case', () => {
  const hit = (name) => NEVER_COMMIT.some(([, p]) => p.test(name));
  for (const name of NAMES_MUST) assert.ok(hit(name), name);
  for (const name of NAMES_MUST_NOT) assert.ok(!hit(name), name);
});

test('privacy cases: the maintainer\'s words match in NFC or NFD, and a bad line is a finding', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pbi-privacy-'));
  const file = join(dir, 'privacy.local.txt');
  writeFileSync(file, `# a comment\nMontaña\n${'Peña'.normalize('NFD')}\n(\n`);
  const { patterns, bad } = localPatterns(file);
  assert.equal(patterns.length, 2);
  assert.equal(bad.length, 1, 'an expression that does not compile');
  assert.equal(scanText('la montaña'.normalize('NFD'), patterns, 'case').length, 1, 'text in NFD, word in NFC');
  assert.equal(scanText('Peña', patterns, 'case').length, 1, 'text in NFC, word in NFD');
  assert.equal(scanText('montana', patterns, 'case').length, 0);
});

test('privacy cases: in a repository, accents in names, forced adds and unreadable files are found', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pbi-privacy-'));
  git(dir, 'init', '-q');
  writeFileSync(join(dir, '.gitignore'), 'local.env\nprivacy.local.txt\n');
  writeFileSync(join(dir, 'privacy.local.txt'), 'Montaña\n');
  writeFileSync(join(dir, 'notas-año.md'), `escribe a ana${at}correo-real.co\n`);
  writeFileSync(join(dir, 'nfd.md'), 'Montaña'.normalize('NFD'));
  mkdirSync(join(dir, 'montaña'));
  writeFileSync(join(dir, 'montaña', 'clean.md'), 'nothing here\n');
  writeFileSync(join(dir, 'local.env'), 'TOKEN=1\n');
  writeFileSync(join(dir, 'clean.md'), 'nothing here\n');
  git(dir, 'add', '.');
  git(dir, 'add', '-f', 'local.env');
  const root = process.getuid?.() !== 0; // root reads everything
  if (root) {
    writeFileSync(join(dir, 'locked.md'), 'x\n');
    chmodSync(join(dir, 'locked.md'), 0o000);
  }
  const { findings } = scanRepo({ root: dir });
  const has = (re) => findings.some((f) => re.test(f));
  assert.ok(has(/^notas-año\.md:1: email address/), 'a name with an accent is read, not skipped');
  assert.ok(has(/^nfd\.md:1: a word in privacy\.local\.txt/), 'text in NFD');
  assert.ok(has(/^montaña\/clean\.md \(path\)/), 'a private word in a path');
  assert.ok(has(/^local\.env: never committed: local settings/), 'git add -f past .gitignore');
  if (root) assert.ok(has(/^locked\.md: unreadable/), 'an unreadable file is a finding');
  assert.ok(!has(/^clean\.md|^\.gitignore|^privacy\.local\.txt/), findings.join('\n'));
});
