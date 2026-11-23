// The chips after the physics review (C14): what a dissipation limit is judged on over time, and
// the wording of readings that round to their limit.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runCircuit } from '../src/sim/run.js'; // its runs take under a second since C15b's step
import { simulate } from '../src/sim/index.js';
import { formatIssue } from '../src/index.js';

const example = (name) => JSON.parse(readFileSync(new URL(`../examples/${name}`, import.meta.url), 'utf8'));

// The LM386 example driven hard (0.4 V instead of 50 mV at 1 kHz): it clips. Its dissipation peaks near
// 2.5 W at instants but averages about 0.56 W, under its 1.25 W (LM386 datasheet, N package): a thermal
// limit is judged on the average, so the chip is not flagged; the 8 Ω load (1 W) averages over it and is.
test('power over a run and a transient is the average, not the peak: a clipped LM386 is not flagged, its overloaded load is', () => {
  const c = example('lm386-amplifier.json');
  c.supplies = c.supplies.map((s) => (s.kind === 'generator' ? { ...s, amplitude: 0.4 } : s));
  const run = runCircuit(c, { seconds: 0.05 });
  const power = run.issues.filter((i) => i.code === 'SIM_OVER_POWER');
  assert.ok(!power.some((i) => i.params.part === 'U1'), JSON.stringify(power));
  const load = power.find((i) => i.params.part === 'R1');
  assert.ok(load, JSON.stringify(run.issues.map((i) => i.code)));
  assert.match(formatIssue(load, 'en'), /dissipates 1\.\d+ W, more than its 1 W: it overheats, on average over the run, from/);
  const t = simulate(c, { analysis: 'transient', stop: 0.01, step: 5e-6 });
  const u1 = t.parts.U1.power;
  const mean = u1.reduce((a, b) => a + b, 0) / u1.length;
  assert.ok(Math.max(...u1) > 1.25 && mean < 1.25, `peak ${Math.max(...u1)} mean ${mean}`);
  assert.ok(!t.issues.some((i) => i.code === 'SIM_OVER_POWER' && i.params.part === 'U1'), JSON.stringify(t.issues.map((i) => [i.code, i.params.part])));
  assert.ok(t.issues.some((i) => i.code === 'SIM_OVER_POWER' && i.params.part === 'R1'));
});

// Item 7: the LM386's supply messages name the variant whose figures they quote (TI LM386
// datasheet: N-1 and N-3 4 V to 12 V, 15 V absolute; N-4 5 V to 18 V, 22 V absolute).
test("the LM386's supply messages name the LM386N-1 and N-3, and what the N-4 takes", () => {
  const at = (v) => {
    const c = example('lm386-amplifier.json');
    c.supplies = c.supplies.map((s) => (s.kind === 'generator' ? s : { ...s, voltage: v }));
    return simulate(c).issues.filter((i) => i.params.part === 'U1' && /^SIM_IC_SUPPLY/.test(i.code));
  };
  const past = at(13);
  assert.deepEqual(past.map((i) => i.code), ['SIM_IC_SUPPLY_RANGE']);
  assert.match(formatIssue(past[0], 'en'), /outside the 4 V to 12 V its datasheet gives for the LM386N-1 and N-3 \(the N-4 goes from 5 V to 18 V\)/);
  assert.match(formatIssue(past[0], 'es'), /para el LM386N-1 y el N-3 \(el N-4 va de 5 V a 18 V\)/);
  const over = at(16).find((i) => i.code === 'SIM_IC_SUPPLY');
  assert.match(formatIssue(over, 'en'), /runs from 16 V, more than the 15 V of the LM386N-1 and N-3 \(the N-4 takes up to 22 V\): it can be damaged/);
  assert.match(formatIssue(over, 'es'), /más que los 15 V del LM386N-1 y el N-3/);
});

// Item 7: a reading that rounds equal to its limit shows more figures, until the two differ.
test('a reading that rounds to its limit is shown with one more figure', () => {
  const issue = (value) => ({ severity: 'warning', code: 'SIM_OVER_CURRENT', params: { part: 'U1.A', current: { value, unit: 'A' }, max: { value: 0.05, unit: 'A' } } });
  assert.match(formatIssue(issue(0.05004), 'en'), /carries 50\.04 mA, more than its maximum 50 mA/);
  assert.match(formatIssue(issue(0.05004), 'es'), /50,04 mA, más que su máximo de 50 mA/);
  assert.match(formatIssue(issue(0.0500004), 'en'), /50\.0004 mA, more than its maximum 50 mA/);
  assert.match(formatIssue(issue(0.0712), 'en'), /carries 71\.2 mA, more than its maximum 50 mA/);
});

// Item 7: the PC817's catalog line says its transfer ratio is one value of a range a part's rank narrows.
test("the PC817's catalog line says the transfer ratio is one value of 50 % to 600 %, fixed by the rank within a factor of two", async () => {
  const { t } = await import('../src/index.js');
  assert.match(t('en', 'catalog.model.optocoupler'), /170 % of the LED's current \(one value from the datasheet's 50 % to 600 %, the middle of it; a real part's rank, A to D, fixes it within a factor of two\)/);
  assert.match(t('es', 'catalog.model.optocoupler'), /la clase de una pieza real, de A a D, lo fija dentro de un factor de dos/);
});
