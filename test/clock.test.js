// Tests do not wait for the real clock (test/clock.js moves time by hand): a wait makes a test
// slow, and on a busy machine it makes it fail now and then. This checks the clock and holds every
// test file to it; a line that must read the real clock (a speed test, a file time) says why with
// a "// real clock:" comment.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { installClock } from './clock.js';

const root = new URL('../', import.meta.url).pathname;

test('clock: timers run in order as time moves, and only then', () => {
  const window = { Date: { now: () => 0 }, performance: { now: () => 0 } };
  const clock = installClock(window);
  const seen = [];
  window.setTimeout(() => seen.push('b'), 20);
  window.setTimeout(() => seen.push('a'), 10);
  const every = window.setInterval(() => seen.push('i'), 15);
  const gone = window.setTimeout(() => seen.push('never'), 5);
  window.clearTimeout(gone);
  clock.tick(9);
  assert.deepEqual(seen, []);
  clock.tick(21);
  assert.deepEqual(seen, ['a', 'i', 'b', 'i'], '10, 15, 20, 30 ms');
  window.clearInterval(every);
  clock.tick(100);
  assert.equal(seen.length, 4);
  assert.equal(window.Date.now() - 1_000_000, 130);
  assert.ok(window.performance.now() > 0, 'never 0, as in a browser');
  assert.equal(clock.stamp({}).timeStamp, window.performance.now());
});

const REAL = /\b(?:setTimeout|setInterval)\s*\(|\bDate\.now\(\)|\bperformance\.now\(\)|\bnew Date\(\)/;
const files = (dir) => readdirSync(join(root, dir), { recursive: true }).filter((f) => f.endsWith('.js')).map((f) => join(dir, f));

test('tests do not read the real clock, unless a line says why', () => {
  const found = [];
  for (const file of [...files('test'), ...files('mcp/test')]) {
    if (file === 'test/clock.js' || file === 'test/clock.test.js') continue;
    readFileSync(join(root, file), 'utf8')
      .split('\n')
      .forEach((line, i) => {
        if (REAL.test(line) && !line.includes('// real clock:')) found.push(`${file}:${i + 1}: ${line.trim()}`);
      });
  }
  assert.deepEqual(found, [], 'move time with test/clock.js, or mark the line "// real clock: <why>"');
});
