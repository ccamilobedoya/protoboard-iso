// Acceptance tests for the trust contract C3 (D1-D10): the command line never crashes, cuts its
// output or saves silently. Everything goes through the CLI as a child process.
//
// D9 needs an internal error forced from outside. The test uses a hidden hook: with
// PROTOBOARD_TEST_THROW=1 any command throws an unexpected error right after parsing its arguments.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tempDir } from '../scripts/tmp.js';

const root = new URL('../', import.meta.url).pathname;
const bin = join(root, 'bin/protoboard-iso.js');
const MAX = 64 * 1024 * 1024;
const cli = (args, { input, env, timeout = 120000 } = {}) =>
  spawnSync(process.execPath, [bin, ...args], {
    cwd: root, encoding: 'utf8', input, timeout, maxBuffer: MAX, env: { ...process.env, ...env },
  });
const lines = (text) => text.split('\n').filter((l) => l.trim() !== '');
const lastLine = (text) => lines(text).at(-1) ?? '';
const noStack = (r, label) => {
  const all = `${r.stdout}\n${r.stderr}`;
  assert.doesNotMatch(all, /^ {4}at /m, `${label}: a stack line is printed`);
  assert.doesNotMatch(all, /node:internal/, `${label}: node:internal is printed`);
};
const laid = (prefix, recipe = 'led-resistor') => {
  const dir = tempDir(prefix);
  const target = join(dir, 'x');
  const r = cli(['layout', target, '--recipe', recipe]);
  assert.equal(r.status, 0, r.stderr);
  return { dir, target };
};

// ---- D1 / D2: a user's mistake in the spec file is a message, not a stack

test('D1: layout with a missing spec file: exit 1, no stack, STATUS: FIX_SPEC', () => {
  const dir = tempDir('c3-d1-');
  const r = cli(['layout', join(dir, 'x'), join(dir, 'missing.json')]);
  noStack(r, 'missing');
  assert.equal(r.status, 1);
  assert.match(lastLine(r.stdout), /^STATUS: FIX_SPEC/);
});

for (const [label, content] of [['a zero-byte spec', ''], ['malformed JSON', '{bad'], ['an array', '[1,2]'], ['a number', '42']]) {
  test(`D2: layout with ${label}: exit 1, no stack, STATUS: FIX_SPEC`, () => {
    const dir = tempDir('c3-d2-');
    const spec = join(dir, 'spec.json');
    writeFileSync(spec, content);
    const r = cli(['layout', join(dir, 'x'), spec]);
    noStack(r, label);
    assert.equal(r.status, 1);
    assert.match(lastLine(r.stdout), /^STATUS: FIX_SPEC/);
  });
}

// ---- D3: the same for the operations file

test('D3: apply with a missing operations file: exit 1, no stack', () => {
  const { dir, target } = laid('c3-d3a-');
  const r = cli(['apply', target, join(dir, 'missing-ops.json')]);
  noStack(r, 'missing ops');
  assert.equal(r.status, 1);
});

test('D3: apply --ops with malformed JSON: exit 1, no stack', () => {
  const { target } = laid('c3-d3b-');
  const r = cli(['apply', target, '--ops', '{bad']);
  noStack(r, 'bad ops');
  assert.equal(r.status, 1);
});

// ---- D4: an empty spec is not a circuit

for (const spec of ['{}', '{"parts":[],"nets":[]}']) {
  test(`D4: spec ${spec} is FIX_SPEC, exit 1, nothing created`, () => {
    const dir = tempDir('c3-d4-');
    const file = join(dir, 'spec.json');
    writeFileSync(file, spec);
    const target = join(dir, 'x');
    const r = cli(['layout', target, file]);
    assert.equal(r.status, 1, r.stdout);
    assert.match(lastLine(r.stdout), /^STATUS: FIX_SPEC/);
    assert.equal(existsSync(join(target, 'circuit.json')), false, 'circuit.json was created');
  });
}

// ---- D5: output is never cut

test('D5: simulate --transient --json through a pipe arrives whole and parses', () => {
  const { target } = laid('c3-d5-', 'rc-square');
  const r = cli(['simulate', target, '--transient', '1,0.001', '--json']);
  assert.equal(r.status, 0, r.stderr);
  assert.ok(r.stdout.length > 65536, `the output is only ${r.stdout.length} bytes: use a longer transient`);
  assert.doesNotThrow(() => JSON.parse(r.stdout), 'the JSON is cut');
});

// ---- D6: a reader that closes the pipe ends quietly

test('D6: catalog | head -1: the kit exits 0 and prints nothing on stderr', () => {
  const dir = tempDir('c3-d6-');
  const err = join(dir, 'err.txt');
  const r = spawnSync('bash', ['-c', `"$NODE" "$BIN" catalog 2>"$ERR" | head -1 >/dev/null; echo "\${PIPESTATUS[0]}"`], {
    cwd: root, encoding: 'utf8', env: { ...process.env, NODE: process.execPath, BIN: bin, ERR: err },
  });
  assert.equal(r.stdout.trim(), '0', 'exit status of the kit');
  const stderr = existsSync(err) ? spawnSync('cat', [err], { encoding: 'utf8' }).stdout : '';
  assert.equal(stderr, '', 'stderr is not empty');
});

test('D6 (large output): simulate --transient --json | head -c 100: the kit exits 0 and prints nothing on stderr', () => {
  const { dir, target } = laid('c3-d6b-', 'rc-square');
  const err = join(dir, 'err.txt');
  const r = spawnSync('bash', ['-c', `"$NODE" "$BIN" simulate "$T" --transient 1,0.001 --json 2>"$ERR" | head -c 100 >/dev/null; echo "\${PIPESTATUS[0]}"`], {
    cwd: root, encoding: 'utf8', env: { ...process.env, NODE: process.execPath, BIN: bin, ERR: err, T: target },
  });
  assert.equal(r.stdout.trim(), '0', 'exit status of the kit');
  assert.equal(spawnSync('cat', [err], { encoding: 'utf8' }).stdout, '', 'stderr is not empty');
});

test('D6 (failing command): check <circuit with errors> | head -1 keeps the kit exit code 1', () => {
  const dir = tempDir('c3-d6c-');
  const bad = join(dir, 'bad.json');
  writeFileSync(bad, JSON.stringify({ parts: [{ id: 'R1', type: 'resistor', value: 'banana', pins: ['a1', 'a5'] }] }));
  const alone = cli(['check', bad]);
  assert.equal(alone.status, 1);
  const r = spawnSync('bash', ['-c', `"$NODE" "$BIN" check "$T" 2>"$ERR" | head -1 >/dev/null; echo "\${PIPESTATUS[0]}"`], {
    cwd: root, encoding: 'utf8', env: { ...process.env, NODE: process.execPath, BIN: bin, ERR: join(dir, 'err.txt'), T: bad },
  });
  assert.equal(r.stdout.trim(), '1', 'exit status of the kit through a closed pipe');
});

// ---- D7: apply tells the truth about what it saved

const badOps = '[{"op":"set","part":"U2","angle":-72}]';

// Arbitrated after the contract was written (a decision of the maintainer): a change is one of two
// kinds. Input the kit cannot read (a value a part does not understand, an unknown pin…) is the
// caller's slip and is refused whole. A circuit the kit reads and that turns out wrong (a part on
// occupied holes, a short) is allowed, because getting it wrong is part of learning: it is saved,
// and the save line says so.

test('D7: apply --dry-run reports the value the part does not understand and says the real run would be refused', () => {
  const { target } = laid('c3-d7a-', 'encoder-uno');
  const r = cli(['apply', target, '--ops', badOps, '--dry-run']);
  assert.equal(r.status, 1, r.stderr);
  assert.match(r.stdout, /^\s*✖ new: error: .*U2.*$/m);
  assert.match(r.stdout, /would be refused/);
  assert.doesNotMatch(r.stdout, /no change in issues/);
});

test('D7: apply refuses a value the part does not understand: nothing saved, and simulate still accepts the circuit', () => {
  const { target } = laid('c3-d7b-', 'encoder-uno');
  const r = cli(['apply', target, '--ops', badOps]);
  assert.equal(r.status, 1, r.stderr);
  assert.match(r.stdout, /^\s*✖ new: error: .*U2.*$/m);
  assert.match(r.stdout, /Nothing was saved/);
  assert.doesNotMatch(r.stdout, /Saved as revision/);
  const s = cli(['simulate', target]);
  assert.equal(s.status, 0, s.stderr);
  assert.doesNotMatch(`${s.stdout}${s.stderr}`, /placement errors/);
});

test('D7: apply saves a readable change that breaks the circuit, says so in words, and undo takes it back', () => {
  const { target } = laid('c3-d7c-');
  // R1 moved onto holes the LED already uses: read fine, wrong as a circuit.
  const r = cli(['apply', target, '--ops', '[{"op":"move","part":"R1","pins":["j6","j2"]}]']);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /Saved as revision 1 with \d+ new error/);
  assert.doesNotMatch(r.stdout, /no change in issues/);
  assert.match(`${cli(['simulate', target]).stdout}`, /placement errors/);
  assert.equal(cli(['undo', target]).status, 0);
  const s = cli(['simulate', target]);
  assert.equal(s.status, 0, s.stderr);
  assert.doesNotMatch(`${s.stdout}${s.stderr}`, /placement errors/);
});

// ---- D8: one language per circuit

const setR1 = '[{"op":"set","part":"R1","value":"470"}]';

test('D8: a spec with "lang": "es": apply answers in Spanish, --lang en wins', () => {
  const dir = tempDir('c3-d8a-');
  const spec = join(dir, 'spec.json');
  writeFileSync(spec, JSON.stringify({ recipe: 'led-resistor', values: { R1: '330' }, lang: 'es' }));
  const target = join(dir, 'x');
  assert.equal(cli(['layout', target, spec]).status, 0);
  const es = cli(['apply', target, '--ops', setR1]);
  assert.equal(es.status, 0, es.stderr);
  assert.match(es.stdout, /Guardado/);
  assert.doesNotMatch(es.stdout, /Saved/);
  const en = cli(['apply', target, '--ops', '[{"op":"set","part":"R1","value":"330"}]', '--lang', 'en']);
  assert.match(en.stdout, /Saved/);
});

test('D8: layout --lang es keeps the language: apply, review, check, simulate, undo answer in Spanish', () => {
  const dir = tempDir('c3-d8b-');
  const target = join(dir, 'x');
  assert.equal(cli(['layout', target, '--recipe', 'led-resistor', '--lang', 'es']).status, 0);
  const es = cli(['apply', target, '--ops', setR1]);
  assert.match(es.stdout, /Guardado/, 'apply');
  assert.doesNotMatch(es.stdout, /Saved/);
  assert.match(cli(['review', target]).stdout, /^APROBADO|^RECHAZADO|^APROBADA/m, 'review');
  assert.match(cli(['simulate', target]).stdout, /Punto de operación|operación/i, 'simulate');
  assert.doesNotMatch(cli(['undo', target]).stdout, /Saved|Undone/, 'undo');
  const en = cli(['apply', target, '--ops', setR1, '--lang', 'en']);
  assert.match(en.stdout, /Saved/, '--lang en wins');
});

// ---- D9: unexpected errors are contained (hidden hook PROTOBOARD_TEST_THROW=1)

test('D9: an internal error is one "internal error:" line, exit 3, no stack; PROTOBOARD_DEBUG=1 adds the stack', () => {
  const { target } = laid('c3-d9-');
  const quiet = cli(['check', target], { env: { PROTOBOARD_TEST_THROW: '1', PROTOBOARD_DEBUG: '' } });
  assert.equal(quiet.status, 3, `${quiet.stdout}${quiet.stderr}`);
  assert.match(`${quiet.stdout}${quiet.stderr}`, /internal error: /);
  noStack(quiet, 'quiet');
  const debug = cli(['check', target], { env: { PROTOBOARD_TEST_THROW: '1', PROTOBOARD_DEBUG: '1' } });
  assert.equal(debug.status, 3);
  assert.match(`${debug.stdout}${debug.stderr}`, /^ +at /m, 'no stack with PROTOBOARD_DEBUG=1');
});

// ---- D10: a normal run is unchanged (invariants recorded on v0.12.1)

test('D10: layout, simulate, review and catalog keep their normal output', () => {
  const dir = tempDir('c3-d10-');
  const target = join(dir, 'x');
  const layout = cli(['layout', target, '--recipe', 'led-resistor']);
  assert.equal(layout.status, 0);
  assert.match(lines(layout.stdout)[0], /^Laid out 2 parts and 1 jumpers in \d+ ms \(30 columns\):$/);
  assert.equal(lastLine(layout.stdout), 'STATUS: DONE · the circuit is ready: every net is there and the lesson review approves it. Add descriptions if the brief asks, and report.');

  const sim = cli(['simulate', target]);
  assert.equal(sim.status, 0);
  assert.equal(lines(sim.stdout)[0], 'DC operating point — a model, not a measurement (11 Newton iterations).');
  assert.match(lastLine(sim.stdout), /^ {2}W1 {5}-491 µV {4}-9\.81 mA {3}4\.81 µW$/);
  assert.equal(lines(sim.stdout).length, 12);

  const review = cli(['review', target]);
  assert.equal(review.status, 0);
  assert.equal(lines(review.stdout)[0], 'APPROVED (lesson, views front, back): 3 parts, nothing blocking; notes: 3.');
  assert.equal(lastLine(review.stdout), '  · note: The leader line of R1 passes over W1. [front]');
  assert.equal(lines(review.stdout).length, 6);

  const catalog = cli(['catalog']);
  assert.equal(catalog.status, 0);
  assert.equal(lines(catalog.stdout)[0], 'resistor   Resistor             pins: 1, 2');
  assert.equal(lastLine(catalog.stdout), '  uno-bmp280-altitude (Arduino UNO: altitude with a BMP280 (on 3.3 V)) · U1=(sketch)');
  assert.equal(lines(catalog.stdout).length, 98);
});
