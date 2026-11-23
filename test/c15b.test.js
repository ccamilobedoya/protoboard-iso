// The last round before the release (C15b), each test written from a reproduction: a run's step, the
// warnings a run keeps, a tune's notes, a supply past what it gives, the flyback advice, a logic input
// over its supply, the chips' drive figures, layout's readings and the small texts.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runCircuit, RUN_STEPS, behaviourOf } from '../src/sim/run.js';
import { autoLayout } from './layout-generous.js';
import { expandRecipe } from '../src/recipes/index.js';
import { formatIssue } from '../src/index.js';
import { formatRun } from '../src/sim/format.js';

const laid = new Map();
const recipe = (name, values) => {
  const key = JSON.stringify([name, values ?? null]);
  if (!laid.has(key)) laid.set(key, autoLayout(expandRecipe(name, values).spec).circuit);
  return laid.get(key);
};
const output = (r, id) => r.outputs.find((o) => o.id === id);
const codes = (r) => r.issues.map((i) => i.code);
const text = (r) => formatRun(r, 'en', { formatIssue });

// ── 1. A run's step lets it finish ───────────────────────────────────────────────────────

// regulator-7805's decoupling capacitors make the page step 100 ps: a run of 1 s was 1.7 million steps
// and stopped at 173 µs. Now its steps are 1 s / 20000 and the run says what it steps over.
test('a run of the 7805 regulator finishes in its length over RUN_STEPS steps and names the time constant it steps over', () => {
  const r = runCircuit(recipe('regulator-7805'), { seconds: 1 });
  assert.ok(r.ok);
  assert.equal(r.run.ran, 1);
  assert.equal(r.run.steps, RUN_STEPS);
  assert.ok(Math.abs(r.run.step - 1 / RUN_STEPS) < 1e-12);
  assert.ok(!codes(r).includes('RUN_BUDGET'), codes(r).join());
  const lines = text(r).split('\n');
  assert.match(lines[0], /1 s in steps of 50 µs \(20000 steps\)/);
  const over = r.issues.filter((i) => /^RUN_STEP_OVER/.test(i.code));
  assert.equal(over.length, 1);
  assert.match(formatIssue(over[0], 'en'), /steps of 50 µs are longer than 2 of the circuit's time constants, the slowest C1's of 33 ns/);
});

// relay-npn with a press used to stall near 0.5 s (steps of 1 µs): the same run now ends, the relay
// following the press.
test('relay-npn pressed for a second in a run of 3 s gets to its end, the relay closed while pressed', () => {
  const r = runCircuit(recipe('relay-npn'), { seconds: 3, stimuli: { press: [{ name: 'S1', at: 0.5, duration: 1 }] } });
  assert.equal(r.run.ran, 3);
  assert.ok(r.run.steps <= RUN_STEPS + 2, String(r.run.steps));
  const [[on, off]] = output(r, 'K1').intervals;
  assert.ok(on > 0.5 && on < 0.52 && Math.abs(off - 1.5) < 0.01, JSON.stringify(output(r, 'K1').intervals));
});

// A 555 with small capacitors: at 10 nF it runs at 1.44 / (21 kΩ · 10 nF) = 6.86 kHz, a period of
// 146 µs, faster than steps of 150 µs. The run measures it again in a shorter run whose step follows
// it, says so, and the figure is the formula's within 3 %.
test('a 555 faster than the run\'s step is measured again in a shorter run, within 3 % of its formula', () => {
  const formula = 1.44 / (21e3 * 10e-9);
  const r = runCircuit(recipe('555-astable', { C1: '10n' }), { seconds: 3 });
  const d1 = output(r, 'D1');
  assert.ok(d1.measured && d1.measured.seconds < 3, JSON.stringify(d1));
  assert.ok(Math.abs(d1.frequency / formula - 1) < 0.03, `${d1.frequency} Hz against ${formula}`);
  assert.match(text(r), /D1 \(LED\): 6\.\d+ kHz, on 51 % of the time \(period 1\d\d µs\), measured in the first \d+ ms in steps of [\d.]+ [nµ]s/);
  // With no shorter run allowed, it gives no figure and says how short a run measures it.
  const bare = runCircuit(recipe('555-astable', { C1: '10n' }), { seconds: 3, remeasure: 0 });
  assert.equal(output(bare, 'D1').frequency, null);
  assert.equal(output(bare, 'D1').fast, true);
  const note = bare.issues.find((i) => i.code === 'RUN_TOO_FAST');
  assert.match(formatIssue(note, 'en'), /D1: changes faster than this run's steps of 150 µs can follow, so the run gives no frequency or duty for it\. A --run of [\d.]+ m?s or shorter/);
  assert.match(text(bare), /D1 \(LED\): changes faster than this run's steps follow; on about 5\d % of the time, no frequency/);
});

// The recipe's own 555 (6.86 Hz) at steps of 150 µs: within 3 % of the formula, and the same as before
// the step changed (6.736 Hz in the page's 22 µs steps).
test('555-astable over 3 s: within 3 % of 1.44 / ((R1 + 2 R2) C1) at the run\'s step', () => {
  const r = runCircuit(recipe('555-astable'), { seconds: 3 });
  const f = output(r, 'D1').frequency;
  assert.ok(Math.abs(f / (1.44 / (21e3 * 10e-6)) - 1) < 0.03, String(f));
  assert.ok(Math.abs(f / 6.736 - 1) < 0.005, String(f));
});

// The Behaviour line is a run of 2 s: the same step, the same figures.
test('layout\'s Behaviour line and a run of the same length give the same figures for a fast 555', () => {
  const c = recipe('555-astable', { C1: '100n' });
  const b = behaviourOf(c);
  const r = runCircuit(c, { seconds: 2 });
  assert.equal(output(b, 'D1').frequency, output(r, 'D1').frequency);
  assert.equal(output(b, 'D1').duty, output(r, 'D1').duty);
});

// A run of the same circuit gets to its end whatever its length: the count of steps does not grow.
test('motor-npn: runs of 0.5, 3 and 30 s take the same count of steps', () => {
  for (const seconds of [0.5, 3, 30]) {
    const r = runCircuit(recipe('motor-npn'), { seconds, budgetMs: 60_000 });
    assert.equal(r.run.ran, seconds);
    assert.equal(r.run.steps, RUN_STEPS, `${seconds} s: ${r.run.steps}`);
  }
});
