// The chips after the physics review (C14): what a dissipation limit is judged on over time, and
// the wording of readings that round to their limit.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runCircuit } from '../src/sim/run.js';
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
