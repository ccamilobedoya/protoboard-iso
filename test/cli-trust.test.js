// The command line never crashes, cuts its output or saves silently: a user's mistake is one or two
// lines (exit 1), an unexpected error is contained (exit 3), output drains, apply tells what it saved.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync, spawn } from 'node:child_process';
import { writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tempDir } from '../scripts/tmp.js';

const root = new URL('../', import.meta.url).pathname;
const bin = join(root, 'bin/protoboard-iso.js');
const cli = (args, env = {}) => spawnSync(process.execPath, [bin, ...args], { cwd: root, encoding: 'utf8', maxBuffer: 1 << 28, env: { ...process.env, ...env } });
const noStack = (r) => assert.doesNotMatch(r.stdout + r.stderr, /^\s+at |node:internal/m);

test('layout: a missing, empty, malformed or wrongly shaped spec is a spec error, not a stack', () => {
  const dir = tempDir('trust-spec-');
  const bad = { 'empty.json': '', 'bad.json': '{bad', 'list.json': '[1,2]', 'number.json': '42' };
  for (const [name, text] of Object.entries(bad)) writeFileSync(join(dir, name), text);
  for (const name of ['missing.json', ...Object.keys(bad)]) {
    const r = cli(['layout', join(dir, `x-${name}`), join(dir, name)]);
    assert.equal(r.status, 1, name);
    noStack(r);
    assert.match(r.stdout.trim().split('\n').at(-1), /^STATUS: FIX_SPEC/, name);
    assert.ok(!existsSync(join(dir, `x-${name}`, 'circuit.json')));
  }
});

test('layout: a spec with no parts is not a circuit', () => {
  const dir = tempDir('trust-empty-');
  for (const [i, text] of ['{}', '{"parts":[],"nets":[]}'].entries()) {
    writeFileSync(join(dir, `s${i}.json`), text);
    const r = cli(['layout', join(dir, `t${i}`), join(dir, `s${i}.json`)]);
    assert.equal(r.status, 1);
    assert.match(r.stdout, /needs parts and nets/);
    assert.match(r.stdout.trim().split('\n').at(-1), /^STATUS: FIX_SPEC/);
    assert.ok(!existsSync(join(dir, `t${i}`, 'circuit.json')));
  }
});

test('apply: a missing operations file or malformed --ops is an error of one line', () => {
  const dir = tempDir('trust-ops-');
  assert.equal(cli(['layout', join(dir, 'c'), '--recipe', 'led-resistor']).status, 0);
  for (const args of [[join(dir, 'c'), join(dir, 'missing.json')], [join(dir, 'c'), '--ops', '{bad'], [join(dir, 'c'), '--ops', '5']]) {
    const r = cli(['apply', ...args]);
    assert.equal(r.status, 1);
    noStack(r);
    assert.ok((r.stdout + r.stderr).trim().split('\n').length <= 2);
  }
  const circuit = join(dir, 'broken.json');
  writeFileSync(circuit, '[1]');
  const r = cli(['simulate', circuit]);
  assert.equal(r.status, 1);
  noStack(r);
});

test('an unexpected error ends in exit 3 with no stack, unless PROTOBOARD_DEBUG=1', () => {
  const quiet = cli(['catalog'], { PROTOBOARD_TEST_THROW: '1' });
  assert.equal(quiet.status, 3);
  assert.match(quiet.stderr, /^internal error: /m);
  noStack(quiet);
  const loud = cli(['catalog'], { PROTOBOARD_TEST_THROW: '1', PROTOBOARD_DEBUG: '1' });
  assert.equal(loud.status, 3);
  assert.match(loud.stderr, /^\s+at /m);
});

test('output is never cut: a long transient read through a pipe arrives whole', async () => {
  const dir = tempDir('trust-pipe-');
  assert.equal(cli(['layout', join(dir, 'rc'), '--recipe', 'rc-square']).status, 0);
  const child = spawn(process.execPath, [bin, 'simulate', join(dir, 'rc'), '--transient', '1,0.001', '--json'], { cwd: root });
  let text = '';
  child.stdout.on('data', (d) => (text += d));
  await new Promise((done) => child.on('close', done));
  assert.ok(text.length > 65536, `length ${text.length}`);
  assert.ok(JSON.parse(text));
});

test('a reader that closes the pipe early ends quietly', () => {
  const r = spawnSync('sh', ['-c', `${JSON.stringify(process.execPath)} ${JSON.stringify(bin)} catalog | head -1; echo "kit=$\{PIPESTATUS:-0}"`], { encoding: 'utf8' });
  assert.equal(r.stderr, '');
});

test('apply refuses what the kit cannot read, in a dry run too, and saves nothing', () => {
  const dir = tempDir('trust-refuse-');
  const c = join(dir, 'c');
  assert.equal(cli(['layout', c, '--recipe', 'led-resistor']).status, 0);
  const op = '[{"op":"set","part":"R1","value":"banana"}]';
  const trial = cli(['apply', c, '--ops', op, '--dry-run']);
  assert.equal(trial.status, 1);
  assert.match(trial.stdout, /✖ new: error: R1: the kit does not understand the value/);
  assert.match(trial.stdout.trim().split('\n').at(-1), /would be refused/);
  const real = cli(['apply', c, '--ops', op]);
  assert.equal(real.status, 1);
  assert.match(real.stdout.trim().split('\n').at(-1), /^Nothing was saved\./);
  assert.match(cli(['history', c]).stdout.trim(), /^rev 0 [^\n]*$/);
  assert.equal(cli(['simulate', c]).status, 0);
});

test('apply saves a circuit outcome that is wrong, says so in words, and undo brings it back', () => {
  const dir = tempDir('trust-outcome-');
  const c = join(dir, 'c');
  assert.equal(cli(['layout', c, '--recipe', 'led-resistor']).status, 0);
  const op = '[{"op":"move","part":"R1","pins":["j6","j2"]}]';
  const saved = cli(['apply', c, '--ops', op]);
  assert.equal(saved.status, 0);
  assert.match(saved.stdout, /Saved as revision 1 with 2 new error\(s\) \(✖ above\)/);
  assert.equal(cli(['simulate', c]).status, 1);
  assert.equal(cli(['undo', c]).status, 0);
  assert.equal(cli(['simulate', c]).status, 0);
  assert.equal(JSON.parse(cli(['apply', c, '--ops', op, '--json']).stdout).newErrors, 2);
});

test('one language per circuit: --lang at layout is kept, --lang wins later', () => {
  const dir = tempDir('trust-lang-');
  const c = join(dir, 'c');
  assert.equal(cli(['layout', c, '--recipe', 'led-resistor', '--lang', 'es']).status, 0);
  const op = '[{"op":"set","part":"R1","value":"470"}]';
  assert.match(cli(['apply', c, '--ops', op]).stdout, /^Guardado/);
  assert.match(cli(['apply', c, '--ops', '[{"op":"set","part":"R1","value":"330"}]', '--lang', 'en']).stdout, /^Saved/);
});

test('layout on an existing circuit without a spec says it laid it out again', () => {
  const dir = tempDir('trust-again-');
  const c = join(dir, 'c');
  assert.equal(cli(['layout', c, '--recipe', 'led-resistor']).status, 0);
  assert.match(cli(['layout', c]).stdout.split('\n')[0], /Laid out the existing circuit again/);
});
