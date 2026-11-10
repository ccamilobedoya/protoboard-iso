// Rotary encoder (docs/en/rotary-encoder.md): the shaft follower and the quadrature table against the
// worked numbers of the sheet, 20 pulses and 20 detents at 360 °/s: a cycle is 50 ms, an edge every
// 12.5 ms, the first (CLK falling) at 6.25 ms.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { snapTarget, shortestArc, advance, contacts, closedAt, neededStep, QUIET } from '../src/sim/devices/encoder.js';

const PITCH = 18;
const base = { speed: 360, pitch: PITCH, bounce: 0 };
const near = (a, b, tolerance, what) => assert.ok(Math.abs(a - b) <= tolerance, `${what}: ${a} against ${b}`);

// Runs a move from `from` to `to` in steps of h and returns the edges: [time (ms), channel, closed].
function edges(from, to, { h = 1e-4, bounce = 0, seconds = 1 } = {}) {
  const p = { ...base, bounce, target: snapTarget(to, 20) };
  let s = { shaft: snapTarget(from, 20), ageA: QUIET, ageB: QUIET };
  let was = contacts(s, p);
  const out = [];
  for (let k = 1; k * h <= seconds + 1e-12; k++) {
    s = advance(s, h, p);
    const now = contacts(s, p);
    for (const c of ['a', 'b']) if (now[c] !== was[c]) out.push([k * h * 1000, c, now[c]]);
    was = now;
  }
  return { out, s };
}
const falls = (list, c) => list.filter(([, ch, closed]) => ch === c && closed).map(([t]) => t);
const rises = (list, c) => list.filter(([, ch, closed]) => ch === c && !closed).map(([t]) => t);

test('encoder: the target snaps to the nearest detent, ties up, and wraps', () => {
  assert.equal(snapTarget(0, 20), 0);
  assert.equal(snapTarget(90, 20), 90);
  assert.equal(snapTarget(8.9, 20), 0);
  assert.equal(snapTarget(9, 20), 18);
  assert.equal(snapTarget(355, 20), 0);
  assert.equal(snapTarget(360, 20), 0);
  assert.equal(snapTarget(36, 20), 36);
});

test('encoder: the shortest arc; an exact half turn goes clockwise', () => {
  assert.equal(shortestArc(0, 90), 90);
  assert.equal(shortestArc(90, 0), -90);
  assert.equal(shortestArc(0, 270), -90);
  assert.equal(shortestArc(0, 180), 180);
  assert.equal(shortestArc(180, 0), 180);
  assert.equal(shortestArc(350, 10), 20);
});

test('encoder: the quadrature table (clockwise: CLK first, DT a quarter cycle later)', () => {
  const at = (deg) => ({ a: closedAt(deg / PITCH, 'a'), b: closedAt(deg / PITCH, 'b') });
  assert.deepEqual(at(0), { a: false, b: false });
  assert.deepEqual(at(1), { a: false, b: false });
  assert.deepEqual(at(3), { a: true, b: false });
  assert.deepEqual(at(9), { a: true, b: true });
  assert.deepEqual(at(13), { a: false, b: true });
  assert.deepEqual(at(17), { a: false, b: false });
  assert.deepEqual(at(18 + 3), { a: true, b: false }, 'the next cycle repeats');
});

test('encoder: 0 to 90 at 360 deg/s gives the sheet\'s edges, clockwise', () => {
  const { out, s } = edges(0, 90);
  const clk = falls(out, 'a');
  assert.equal(clk.length, 5);
  clk.forEach((t, k) => near(t, 6.25 + 50 * k, 0.11, `CLK fall ${k}`));
  const dt = falls(out, 'b');
  assert.equal(dt.length, 5);
  dt.forEach((t, k) => near(t, 18.75 + 50 * k, 0.11, `DT fall ${k}`));
  rises(out, 'a').forEach((t, k) => near(t, 31.25 + 50 * k, 0.11, `CLK rise ${k}`));
  rises(out, 'b').forEach((t, k) => near(t, 43.75 + 50 * k, 0.11, `DT rise ${k}`));
  assert.equal(rises(out, 'a').length, 5);
  assert.equal(rises(out, 'b').length, 5);
  assert.equal(out.length, 20);
  // At each CLK fall DT is high (open): no DT fall before the CLK one.
  clk.forEach((t, k) => assert.ok(dt[k] > t));
  assert.equal(s.shaft, 90);
  assert.deepEqual(contacts(s, { ...base, target: 90 }), { a: false, b: false });
});

test('encoder: 90 to 0 turns the other way: DT first, CLK 12.5 ms later', () => {
  const { out } = edges(90, 0);
  const dt = falls(out, 'b');
  const clk = falls(out, 'a');
  assert.equal(dt.length, 5);
  dt.forEach((t, k) => near(t, 6.25 + 50 * k, 0.11, `DT fall ${k}`));
  clk.forEach((t, k) => near(t, 18.75 + 50 * k, 0.11, `CLK fall ${k}`));
  clk.forEach((t, k) => assert.ok(dt[k] < t, 'DT is already low at each CLK fall'));
});

test('encoder: 0 to 180 is ten clockwise cycles in half a second; 0 to 270 five the other way; 0 to 355 none', () => {
  const half = edges(0, 180);
  assert.equal(falls(half.out, 'a').length, 10);
  assert.ok(half.out.at(-1)[0] <= 505);
  half.out.filter(([, c, closed]) => c === 'a' && closed).forEach(([t]) => assert.ok(falls(half.out, 'b').some((d) => d > t && d < t + 15)));
  const back = edges(0, 270);
  const dt = falls(back.out, 'b');
  assert.equal(dt.length, 5);
  assert.ok(falls(back.out, 'a').every((t, k) => t > dt[k]));
  assert.equal(edges(0, 355).out.length, 0);
});

test('encoder: bounce 2 ms gives 30 edges on CLK, the first fall still at 6.25 ms', () => {
  const { out } = edges(0, 90, { bounce: 0.002, h: 5e-5 });
  const clk = out.filter(([, c]) => c === 'a');
  assert.equal(clk.length, 30);
  near(clk[0][0], 6.25, 0.1, 'first CLK edge');
  assert.equal(clk[0][2], true);
  // Each transition: new, old, new at 0, b/3 and 2b/3.
  near(clk[1][0] - clk[0][0], 2 / 3, 0.1, 'third of the bounce');
  near(clk[2][0] - clk[0][0], 4 / 3, 0.1, 'two thirds');
  assert.deepEqual(clk.slice(0, 3).map((e) => e[2]), [true, false, true]);
});

test('encoder: a step as long as the move still lands on the target; DC puts it there', () => {
  const p = { ...base, target: 90 };
  assert.equal(advance({ shaft: 0, ageA: QUIET, ageB: QUIET }, 1, p).shaft, 90);
  assert.equal(advance({ shaft: 0, ageA: QUIET, ageB: QUIET }, undefined, p).shaft, 90);
  // Many small steps equal one long one at the end of the move.
  let s = { shaft: 350, ageA: QUIET, ageB: QUIET };
  for (let k = 0; k < 400; k++) s = advance(s, 1e-3, { ...base, target: 18 });
  assert.equal(s.shaft, 18);
});

test('encoder: the element asks for short steps while it moves and for none at rest', () => {
  const p = { ...base, target: 90 };
  assert.equal(neededStep({ shaft: 90, ageA: QUIET, ageB: QUIET }, p), null);
  near(neededStep({ shaft: 0, ageA: QUIET, ageB: QUIET }, p), 5e-4, 1e-12, 'a twenty-fifth of 12.5 ms');
  near(neededStep({ shaft: 0, ageA: QUIET, ageB: QUIET }, { ...p, bounce: 0.002 }), 1e-4, 1e-12, 'a twentieth of the bounce');
  assert.ok(neededStep({ shaft: 90, ageA: 0.001, ageB: QUIET }, { ...p, bounce: 0.002 }) > 0, 'still bouncing at rest');
});
