// The Claude Code settings shared by the repository (.claude/settings.json): the hook that keeps
// tools away from secrets, the reminder of uncommitted work, and the settings that wire them.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { refusal } from '../.claude/hooks/guard-secrets.js';
import { secretPath, SECRET_NAMES } from '../.claude/hooks/secret-paths.js';

const root = new URL('../', import.meta.url).pathname;
const hook = (file, input, env = {}) => execFileSync(process.execPath, [join(root, '.claude/hooks', file)], { input: JSON.stringify(input), encoding: 'utf8', env: { ...process.env, ...env } });
// Names built from pieces, so this file is not itself a list a scanner reads as secrets.
const dot = '.';
const env = `local${dot}env`;

test('guard: tools stay away from secrets, by path or in a Bash command', () => {
  const refused = [
    ['Read', { file_path: `/work/app/${env}` }],
    ['Read', { file_path: `/work/app/${dot}env` }],
    ['Edit', { file_path: `/work/app/${dot}env${dot}production` }],
    ['Read', { file_path: `/srv/box/${dot}ssh/config` }],
    ['Write', { file_path: `certs/server${dot}pem`, content: 'x' }],
    ['Grep', { pattern: 'x', path: `/root/${dot}aws` }],
    ['Glob', { pattern: '*', path: `/root/${dot}gnupg` }],
    ['NotebookEdit', { notebook_path: `/x/${dot}netrc` }],
    ['Bash', { command: `cat ~/${dot}ssh/id_ed25519` }],
    ['Bash', { command: `source ${env} && npm test` }],
    ['Bash', { command: `cp "a${dot}key" /tmp/` }],
    // $HOME and ${HOME} are ~, and a folder of credentials refuses a pattern too.
    ['Bash', { command: `cat $HOME/${dot}ssh/id_rsa` }],
    ['Bash', { command: `cat \${HOME}/${dot}ssh/id_ed25519` }],
    ['Bash', { command: `cat ~/${dot}ssh/id_*` }],
    ['Bash', { command: `ls "$HOME"/${dot}aws/` }],
  ];
  for (const [tool, input] of refused) assert.ok(refusal(tool, input), `${tool} ${JSON.stringify(input)}`);
  const allowed = [
    ['Read', { file_path: 'src/sim/sketch.js' }],
    ['Read', { file_path: `${dot}env${dot}example` }],
    ['Read', { file_path: 'CLAUDE.local.md' }],
    ['Write', { file_path: 'docs/en/x.md', content: `never commit ${env} or id_rsa` }],
    ['Bash', { command: 'npm test && git status' }],
    ['Bash', { command: `printf '*${dot}pem\\n' >> ${dot}gitignore` }],
    ['Bash', { command: `printf '*${dot}env\\n' >> ${dot}gitignore` }],
    ['Bash', { command: `echo "${dot}env${dot}*" >> ${dot}gitignore && echo '*${dot}env' >> ${dot}gitignore` }],
    ['Bash', { command: 'echo $HOME && ls $HOME/work' }],
    // JavaScript's environment objects are code, not a file named *.env.
    ['Bash', { command: `node -e 'run({ ...process${dot}env, A: 1 }); console.log(process${dot}env.HOME)'` }],
    ['Bash', { command: `node -e 'f(import.meta${dot}env)'` }],
    ['Bash', { command: `git ls-files | grep -i keys${dot}js` }],
    ['Grep', { pattern: 'id_rsa', path: 'src' }],
  ];
  for (const [tool, input] of allowed) assert.equal(refusal(tool, input), null, `${tool} ${JSON.stringify(input)}`);
});

test('guard: as a hook it answers with a deny decision, and with nothing otherwise', () => {
  const out = JSON.parse(hook('guard-secrets.js', { tool_name: 'Read', tool_input: { file_path: `/x/${env}` } }));
  assert.equal(out.hookSpecificOutput.hookEventName, 'PreToolUse');
  assert.equal(out.hookSpecificOutput.permissionDecision, 'deny');
  assert.match(out.hookSpecificOutput.permissionDecisionReason, /local settings/);
  assert.equal(hook('guard-secrets.js', { tool_name: 'Read', tool_input: { file_path: 'README.md' } }), '');
});

test('stop: a reminder of uncommitted work, and silence when there is none', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pbi-stop-'));
  const git = (...args) => execFileSync('git', args, { cwd: dir });
  git('init', '-q');
  assert.equal(hook('stop-uncommitted.js', {}, { CLAUDE_PROJECT_DIR: dir }), '', 'an empty repository');
  writeFileSync(join(dir, 'a.md'), 'x\n');
  writeFileSync(join(dir, 'b.md'), 'x\n');
  assert.deepEqual(JSON.parse(hook('stop-uncommitted.js', {}, { CLAUDE_PROJECT_DIR: dir })), { systemMessage: 'protoboard-iso: 2 files not committed.' });
  git('add', '.');
  git('-c', 'user.name=test', '-c', 'user.email=test@example.com', 'commit', '-qm', 'x');
  assert.equal(hook('stop-uncommitted.js', {}, { CLAUDE_PROJECT_DIR: dir }), '', 'all committed');
  assert.equal(hook('stop-uncommitted.js', {}, { CLAUDE_PROJECT_DIR: tmpdir() }), '', 'outside a repository');
});

test('settings: valid, wiring hooks that exist, denying every kind of secret for Read and Edit', () => {
  const settings = JSON.parse(readFileSync(join(root, '.claude/settings.json'), 'utf8'));
  const commands = Object.values(settings.hooks).flatMap((groups) => groups.flatMap((g) => g.hooks.map((h) => h.command)));
  assert.ok(commands.length >= 2);
  for (const c of commands) {
    const file = /\$CLAUDE_PROJECT_DIR\/([^"]+)/.exec(c)?.[1];
    assert.ok(file && existsSync(join(root, file)), c);
  }
  const deny = settings.permissions.deny;
  const paths = (tool) => deny.filter((r) => r.startsWith(`${tool}(`)).map((r) => r.slice(tool.length + 1, -1));
  assert.deepEqual(paths('Edit'), paths('Read'), 'the same paths for reading and editing');
  // Each rule names a secret, and each kind of secret has a rule.
  const sample = (p) => p.replace('~/', '/srv/box/').replace('**/', 'a/').replace('/**', '/x').replace('*', 'name');
  for (const p of paths('Read')) assert.ok(secretPath(sample(p)), p);
  for (const [what] of SECRET_NAMES) assert.ok(paths('Read').some((p) => secretPath(sample(p)) === what), what);
  assert.ok(settings.hooks.PreToolUse.some((g) => ['Read', 'Edit', 'Write', 'Bash', 'Grep', 'Glob'].every((tool) => new RegExp(`^(?:${g.matcher})$`).test(tool))), 'the guard sees every file tool and Bash');
});
