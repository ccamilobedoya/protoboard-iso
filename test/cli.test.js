// The command line is strict: an option nobody knows, or one left without its value, stops with a
// usage error (exit 2) and a message in the asked language, instead of running with a default.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

const root = new URL('../', import.meta.url).pathname;
const cli = (...args) => spawnSync(process.execPath, [join(root, 'bin/protoboard-iso.js'), ...args], { cwd: root, encoding: 'utf8' });
const example = 'examples/led-resistor.json';

test('cli: an unknown option is a usage error, in the asked language', () => {
  const en = cli('check', example, '--sime');
  assert.equal(en.status, 2);
  assert.match(en.stderr, /Unknown option --sime\./);
  const es = cli('check', example, '--lang', 'es', '-x');
  assert.equal(es.status, 2);
  assert.match(es.stderr, /Opción desconocida: -x\./);
});

test('cli: an option without its value is a usage error, not a crash', () => {
  for (const option of ['--view', '--between', '--values', '--expect-revision']) {
    const r = cli('render', example, option);
    assert.equal(r.status, 2, option);
    assert.match(r.stderr, new RegExp(`The option ${option} needs a value after it\\.`));
    assert.doesNotMatch(r.stderr, /TypeError|SyntaxError|at /, 'no stack trace');
  }
});

test('cli: known options and "-" for standard input still read', () => {
  const r = cli('check', example, '--lang', 'en', '--json');
  assert.equal(r.status, 0, r.stderr);
  assert.ok(Array.isArray(JSON.parse(r.stdout).issues ?? JSON.parse(r.stdout)));
  const dry = spawnSync(process.execPath, [join(root, 'bin/protoboard-iso.js'), 'apply', example, '-', '--dry-run'], { cwd: root, encoding: 'utf8', input: '{"op":"set","part":"R1","value":"470"}' });
  assert.equal(dry.status, 0, dry.stderr);
});
