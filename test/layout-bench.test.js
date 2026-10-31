// scripts/layout-metrics.js and scripts/layout-bench.js without running the whole bench: the
// metrics of one small recipe make sense, a bench note is stripped from a spec, and a run is
// compared with a baseline.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { autoLayout } from '../src/layout.js';
import { expandRecipe } from '../src/recipes/index.js';
import { benchSpec, compareRuns } from '../scripts/layout-bench.js';
import { layoutMetrics } from '../scripts/layout-metrics.js';

test('layout metrics: a small recipe measures parts, jumpers, wire, columns and holes', () => {
  const r = autoLayout(expandRecipe('led-resistor').spec);
  const m = layoutMetrics(r);
  const wires = r.circuit.parts.filter((p) => p.type === 'wire').length;
  assert.equal(m.status, 'done');
  assert.equal(m.jumpers, wires);
  assert.equal(m.parts, r.circuit.parts.length - wires);
  assert.ok(m.wireLength > 0);
  assert.ok(m.columns.min >= 1 && m.columns.max >= m.columns.min);
  assert.equal(m.columns.span, m.columns.max - m.columns.min + 1);
  assert.equal(m.boardColumns, r.columns);
  const holesUsed = r.circuit.parts.reduce((n, p) => n + (p.type === 'wire' ? 2 : 0), 0);
  assert.ok(m.holes.T + m.holes.B + m.holes.rail >= holesUsed);
  assert.ok(Number.isInteger(m.channelCrossings) && m.channelCrossings >= 0);
  assert.equal(m.blocking, 0);
  assert.equal(m.problems, 0);
  assert.deepEqual(layoutMetrics(r), m, 'deterministic');
});

test('layout bench: the bench note is removed before laying out and gives the expected status', () => {
  const raw = { parts: [{ id: 'R1', type: 'resistor', value: '1k' }], nets: [['R1.1', 'T+']], bench: { expect: 'Changes', why: 'x' } };
  const { spec, expect, why } = benchSpec(raw);
  assert.equal('bench' in spec, false);
  assert.equal(expect, 'changes');
  assert.equal(why, 'x');
  assert.equal(benchSpec({ parts: [] }).expect, null);
});

test('layout bench: a run is compared with the baseline, with sign, totals, new and missing cases', () => {
  const m = (over) => ({ status: 'done', jumpers: 2, wireLength: 10, columns: { span: 8 }, holes: { T: 4, B: 0, rail: 2 }, channelCrossings: 0, tries: 1, ...over });
  const before = { a: m({}), b: m({}), gone: m({}) };
  const now = { a: m({ jumpers: 3, wireLength: 12.5 }), b: m({}), fresh: m({}) };
  const out = compareRuns(now, before).join('\n');
  assert.match(out, /a: jumpers 2 → 3 \(\+1\) · wireLength 10 → 12.5 \(\+2.5\)/);
  assert.doesNotMatch(out, /\n {2}b:/);
  assert.match(out, /\+ fresh: new case/);
  assert.match(out, /- gone: missing/);
  assert.match(out, /totals: jumpers 6 → 7/);
  assert.equal(compareRuns(before, before).length, 1, 'no deltas: only the totals line');
});
