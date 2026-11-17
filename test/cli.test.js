// The command line is strict: an option nobody knows, or one left without its value, stops with a
// usage error (exit 2) and a message in the asked language, instead of running with a default.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { tempDir } from '../scripts/tmp.js';

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

// ---- clean-install contract: names and paths say what they are

import { readFileSync, existsSync } from 'node:fs';
import { isAbsolute } from 'node:path';
import { rasterAvailable } from '../src/node/raster.js';

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

test('cli: render to a .png name writes a real PNG or fails, never SVG text under that name', async () => {
  const dir = tempDir('pbi-cli-');
  const out = join(dir, 'x.png');
  const r = cli('render', example, '-o', out, '--png-width', '400');
  if (await rasterAvailable()) {
    assert.equal(r.status, 0, r.stderr);
    const bytes = readFileSync(out);
    assert.deepEqual(bytes.subarray(0, 8), PNG);
    assert.equal(bytes.readUInt32BE(16), 400, 'IHDR width');
  } else {
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /not available in this install: the SVG and the page are/);
    assert.match(r.stderr, /cd mcp && npm install/, 'in a clone (mcp/ beside bin/) the message says how to get PNG');
    assert.ok(!existsSync(out) || readFileSync(out).subarray(0, 8).equals(PNG), 'no SVG text in a .png');
  }
});

test('cli: --png-width with an SVG output is an error, not silently ignored', () => {
  const r = cli('render', example, '-o', join(tempDir('pbi-cli-'), 'x.svg'), '--png-width', '400');
  assert.equal(r.status, 1);
  assert.match(r.stderr, /--png-width/);
});

test('cli: catalog is the name of the catalogue and parts still works', () => {
  const a = cli('catalog');
  assert.equal(a.status, 0, a.stderr);
  assert.equal(cli('parts').stdout, a.stdout);
  assert.equal(cli('catalog', 'resistor').stdout, cli('parts', 'resistor').stdout);
  assert.match(cli('--help').stdout, /protoboard-iso catalog/);
});

test('cli: layout, apply and undo say where the page is (absolute, before STATUS for layout)', () => {
  const dir = tempDir('pbi-cli-');
  const run = (...a) => spawnSync(process.execPath, [join(root, 'bin/protoboard-iso.js'), ...a], { cwd: dir, encoding: 'utf8' });
  const made = run('layout', 'sw', '--recipe', 'npn-switch');
  assert.equal(made.status, 0, made.stderr);
  const lines = made.stdout.trim().split('\n');
  assert.match(lines.at(-1), /^STATUS: DONE/);
  const page = lines.at(-2).match(/^Page: (.+?) \(open it/)?.[1];
  assert.ok(page && isAbsolute(page) && existsSync(page), lines.at(-2));
  const applied = run('apply', 'sw', '--ops', '{"op":"set","part":"R1","value":"470"}');
  assert.match(applied.stdout.trim().split('\n').at(-1), /^Page: \//);
  assert.match(run('undo', 'sw').stdout.trim().split('\n').at(-1), /^Page: \//);
  assert.match(run('layout', 'sw2', '--recipe', 'npn-switch', '--lang', 'es').stdout.trim().split('\n').at(-2), /^Página: \//);
});
