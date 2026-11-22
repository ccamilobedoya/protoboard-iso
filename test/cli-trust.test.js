// The command line never crashes, cuts its output or saves silently: a user's mistake is one or two
// lines (exit 1), an unexpected error is contained (exit 3), output drains, apply tells what it saved.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync, spawn } from 'node:child_process';
import { writeFileSync, readFileSync, existsSync } from 'node:fs';
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

const piped = (cmd, env = {}) => spawnSync('bash', ['-c', `"$NODE" "$BIN" ${cmd} 2>"$ERR" | head -1 >/dev/null; echo "\${PIPESTATUS[0]}"`], { encoding: 'utf8', env: { ...process.env, NODE: process.execPath, BIN: bin, ...env } });

test('a reader that closes the pipe early ends quietly and the kit keeps its own exit code', () => {
  const dir = tempDir('trust-epipe-');
  const bad = join(dir, 'bad.json');
  writeFileSync(bad, JSON.stringify({ parts: [{ id: 'R1', type: 'resistor', value: 'banana', pins: ['a1', 'a5'] }] }));
  const ok = piped('catalog', { ERR: join(dir, 'e1.txt') });
  assert.equal(ok.stdout.trim(), '0');
  assert.equal(readFileSync(join(dir, 'e1.txt'), 'utf8'), '');
  const failing = piped(`check "${bad}"`, { ERR: join(dir, 'e2.txt') });
  assert.equal(failing.stdout.trim(), '1');
  assert.equal(readFileSync(join(dir, 'e2.txt'), 'utf8'), '');
});

test('a write error is one line and exit 3, no stack', () => {
  const r = spawnSync('bash', ['-c', `"$NODE" "$BIN" catalog > /dev/full`], { encoding: 'utf8', env: { ...process.env, NODE: process.execPath, BIN: bin } });
  assert.equal(r.status, 3);
  assert.match(r.stderr, /Could not write the output/);
  noStack(r);
});

test('a circuit file over the size cap, or with the wrong shape, is an input error (exit 1), not a kit fault', () => {
  const dir = tempDir('trust-shape-');
  writeFileSync(join(dir, 'big.json'), JSON.stringify({ parts: [], pad: 'x'.repeat(1_100_000) }));
  const big = cli(['check', join(dir, 'big.json')]);
  assert.equal(big.status, 1);
  assert.match(big.stderr, /more than the 1000000 the kit accepts/);
  assert.doesNotMatch(big.stderr, /internal error/);
  const folder = join(dir, 'f');
  assert.equal(cli(['layout', folder, '--recipe', 'led-resistor']).status, 0);
  writeFileSync(join(folder, 'circuit.json'), '{"parts":"x"}');
  for (const args of [['layout', folder, '--recipe', 'led-resistor'], ['check', folder], ['simulate', folder], ['inspect', folder]]) {
    const r = cli(args);
    assert.equal(r.status, 1, args[0]);
    assert.doesNotMatch(r.stdout + r.stderr, /internal error/);
    assert.match(r.stdout + r.stderr, /"parts" holds text/);
  }
  assert.match(cli(['layout', folder, '--recipe', 'led-resistor']).stdout.trim().split('\n').at(-1), /^STATUS: FIX_SPEC/);
});

test('apply refuses a field the part does not take (a warning, still a mistake)', () => {
  const dir = tempDir('trust-field-');
  const c = join(dir, 'c');
  assert.equal(cli(['layout', c, '--recipe', 'led-resistor']).status, 0);
  const r = cli(['apply', c, '--ops', '[{"op":"add","part":{"id":"R9","type":"resistor","value":"1k","ZZZ-NOPE":1,"pins":["a1","a5"]}}]']);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /Nothing was saved/);
});

test('numbers, JSON and languages on the command line are checked', () => {
  const dir = tempDir('trust-args-');
  const c = join(dir, 'c');
  assert.equal(cli(['layout', c, '--recipe', 'led-resistor', '--lang', 'es']).status, 0);
  const rev = cli(['apply', c, '--lang', 'en', '--expect-revision', 'abc', '--ops', '[]']);
  assert.equal(rev.status, 2);
  assert.match(rev.stderr, /--expect-revision takes a number/);
  assert.doesNotMatch(rev.stdout + rev.stderr, /NaN/);
  const values = cli(['layout', join(dir, 'd'), '--recipe', 'led-resistor', '--values', 'x']);
  assert.equal(values.status, 1);
  assert.match(values.stdout.trim().split('\n').at(-1), /^STATUS: FIX_SPEC/);
  const fr = cli(['layout', c, '--lang', 'fr']);
  assert.equal(fr.status, 2);
  assert.match(fr.stderr, /"fr"/);
  assert.match(cli(['layout', c, '--lang', 'en']).stdout, /^Laid out the existing circuit again/);
  assert.match(cli(['apply', c, '--ops', '[{"op":"set","part":"R1","value":"470"}]']).stdout, /^Saved/);
});

test('a missing field in an operation is named, never "undefined"', () => {
  const dir = tempDir('trust-undef-');
  const c = join(dir, 'c');
  assert.equal(cli(['layout', c, '--recipe', 'led-resistor']).status, 0);
  for (const [ops, want] of [['[{"op":"remove"}]', /needs `part`/], ['{}', /needs `op`/]]) {
    const r = cli(['apply', c, '--lang', 'en', '--ops', ops]);
    assert.equal(r.status, 1, ops);
    assert.match(r.stdout, want);
    assert.doesNotMatch(r.stdout, /undefined/);
  }
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
  // Two placement errors and the three of the spec's nets that review gives too (C12: apply says what review will say).
  assert.match(saved.stdout, /Saved as revision 1 with 5 new error\(s\) \(✖ above\): review says CHANGES/);
  assert.equal(cli(['simulate', c]).status, 1);
  assert.equal(cli(['undo', c]).status, 0);
  assert.equal(cli(['simulate', c]).status, 0);
  assert.equal(JSON.parse(cli(['apply', c, '--ops', op, '--json']).stdout).newErrors, 5);
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
