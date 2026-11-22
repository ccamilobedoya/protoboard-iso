// Edge cases and careless or hostile use of the command line: what a stress run found the kit doing
// against its own rules, each case written from its reproduction.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tempDir } from '../scripts/tmp.js';

const root = new URL('../', import.meta.url).pathname;
const bin = join(root, 'bin/protoboard-iso.js');
const cli = (args, env = {}) => spawnSync(process.execPath, [bin, ...args], { cwd: root, encoding: 'utf8', maxBuffer: 1 << 28, env: { ...process.env, ...env } });
const led = (dir, name = 'c') => {
  const target = join(dir, name);
  assert.equal(cli(['layout', target, '--recipe', 'led-resistor']).status, 0);
  return target;
};

test('apply: a batch of 900 add operations does not overflow the stack', () => {
  const dir = tempDir('c12-batch-');
  const target = led(dir);
  // Off the board, as the stress run had them: every part is measured, and refused as an input mistake.
  const ops = Array.from({ length: 900 }, (_, i) => ({ op: 'add', part: { id: `X${i}`, type: 'resistor', value: '1k', pins: [`i${10 + i}`, `j${10 + i}`] } }));
  writeFileSync(join(dir, 'ops.json'), JSON.stringify(ops));
  const r = cli(['apply', target, join(dir, 'ops.json'), '--dry-run']);
  assert.doesNotMatch(r.stdout + r.stderr, /internal error|call stack/);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /^Refused/);
});

test('apply: 3000 add operations are refused by the parts cap, quickly', () => {
  const dir = tempDir('c12-cap-');
  const target = led(dir);
  const ops = Array.from({ length: 3000 }, (_, i) => ({ op: 'add', part: { id: `X${i}`, type: 'resistor', value: '1k', pins: ['a1', 'a5'] } }));
  writeFileSync(join(dir, 'ops.json'), JSON.stringify(ops));
  const start = Date.now();
  const r = cli(['apply', target, join(dir, 'ops.json')]);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /more than the 1000 the kit accepts/);
  assert.ok(Date.now() - start < 30_000);
});
