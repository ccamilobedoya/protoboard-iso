// Every recipe laid out once with its defaults, and every check that reads a whole sweep of the
// recipes reads this one. Each check was in its own file (recipes, hazards, recipe-visibility,
// trust-c1/c2/c4 acceptance), and each laid the sixty recipes out again: the same circuits, in
// separate processes. The assertions are theirs, unchanged; the layout is shared.
//
// After an intended change of a placement or of the drawing, write the visibility figures again:
//   PROTOBOARD_WRITE=1 node --test test/recipe-sweep.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { formatLayout, specFromCircuit } from '../src/layout.js';
import { autoLayout } from './layout-generous.js';
import { simulate } from '../src/sim/index.js';
import { RECIPES, expandRecipe, resolveRecipe } from '../src/recipes/index.js';
import { formatIssue, inspectCircuit, t } from '../src/index.js';
import { review } from '../src/review.js';
import { review as reviewOfIndex } from '../src/index.js';

const NAMES = Object.keys(RECIPES);
const laid = new Map();
// A recipe's layout, made once (autoLayout of its spec with its defaults, as `layout --recipe` does).
const layoutOf = (name) => {
  if (!laid.has(name)) {
    const { spec, problems } = expandRecipe(name);
    assert.deepEqual(problems, [], `${name}: ${JSON.stringify(problems)}`);
    laid.set(name, autoLayout(spec, { lang: 'en' }));
  }
  return laid.get(name);
};
// Each check that hands the circuit to the kit gets its own copy, as when it laid it out itself.
const circuitOf = (name) => structuredClone(layoutOf(name).circuit);
const why = (r) => [...r.problems, ...r.review.blocking].map((b) => formatIssue(b, 'en')).join('\n') + JSON.stringify(r.check);

// ---- recipes.test.js: ready in one layout call, with its defaults
for (const name of NAMES) {
  test(`recipe ${name}: ready in one layout call, with its defaults`, () => {
    const r = layoutOf(name);
    assert.equal(r.status, 'done', why(r));
    assert.deepEqual(r.circuit.spec.recipe, { name });
  });
}

// ---- hazards.test.js
test('recipes with their defaults: none would damage a part', () => {
  // Known list: recipes whose defaults are past a limit, at rest, with each control operated or with
  // each output of a board's program high (none today; the maintainer decides about any listed here,
  // each with a comment saying what burns and when).
  const known = new Set([]);
  for (const name of NAMES) {
    const r = layoutOf(name);
    const hazards = r.review.hazards.map((h) => formatIssue(h, 'en'));
    if (known.has(name)) assert.ok(hazards.length, `${name} is on the known list but has no hazard any more: remove it`);
    else assert.deepEqual(hazards, [], name);
    // Every output of a recipe comes on in some state the kit visits (SIM_OUTPUT_NEVER_ON).
    assert.deepEqual(r.review.doubts.filter((d) => d.code === 'SIM_OUTPUT_NEVER_ON').map((d) => formatIssue(d, 'en')), [], name);
  }
});

// ---- recipe-visibility.test.js: the review's verdict and every part's visible share in both views,
// for every recipe as layout places it, stay what they were: the raster that measures them
// (src/render/coverage.js) and the builds the review reuses (src/circuit/build.js) were made lighter
// for long boards, never different.
const VISIBILITY = new URL('./fixtures/recipe-visibility.json', import.meta.url);
test('every recipe keeps its review verdict and every visible share in both views', () => {
  const now = {};
  for (const name of NAMES) {
    const circuit = circuitOf(name);
    const v = review(circuit, { views: ['front', 'back'] });
    const visible = {};
    for (const view of ['front', 'back']) for (const p of inspectCircuit(circuit, { view }).parts) visible[`${p.id}@${view}`] = Math.round(p.visible * 1e4) / 1e4;
    now[name] = { verdict: v.verdict, blocking: v.blocking.map((b) => b.code), visible };
  }
  if (process.env.PROTOBOARD_WRITE === '1') writeFileSync(VISIBILITY, `${JSON.stringify(now, null, 1)}\n`);
  const stored = JSON.parse(readFileSync(VISIBILITY, 'utf8'));
  assert.deepEqual(Object.keys(now).sort(), Object.keys(stored).sort(), 'one entry per recipe');
  for (const name of Object.keys(stored)) assert.deepEqual(now[name], stored[name], name);
});

// ---- trust-c2-acceptance.test.js, B10
// Baseline v0.12.1: all 60 recipes review "approved" with no hazard and no blocking item at rest (recorded 2026-11-20).
const RECIPE_BASELINE_COUNT = 60;
test('B10 · the recipe list is the one the baseline was recorded on', () => {
  assert.equal(NAMES.length, RECIPE_BASELINE_COUNT);
});
for (const name of NAMES) {
  test(`B10 · recipe ${name} gains no hazard (baseline: none) and stays approved`, () => {
    const r = reviewOfIndex(circuitOf(name));
    assert.deepEqual(r.hazards.map((h) => `${h.code}:${(h.parts ?? []).join(',')}`), []);
    assert.deepEqual(r.blocking, []);
    assert.equal(r.verdict, 'approved');
  });
}

// ---- trust-c1-acceptance.test.js, A4 (the CLI's answer is formatLayout's text; the catalog's list
// of recipes is read through the CLI in that file)
const lastLine = (text) => text.trimEnd().split('\n').at(-1);
const warnLines = (text) => text.split('\n').filter((l) => l.includes('⚠'));
test('A4: every recipe ends DONE, or WARNINGS with its reason (the others are listed)', () => {
  const notDone = [];
  for (const name of NAMES) {
    const text = formatLayout(layoutOf(name), 'en', { t, formatIssue });
    const status = /^STATUS: (\w+)/.exec(lastLine(text))?.[1];
    if (status !== 'DONE') notDone.push({ name, status, why: warnLines(text).join(' | ') });
  }
  if (notDone.length) console.log('A4: recipes not DONE (a human reads these):', JSON.stringify(notDone, null, 1));
  for (const n of notDone) {
    assert.equal(n.status, 'WARNINGS', `${n.name} must be DONE or WARNINGS, not ${n.status}`);
    assert.ok(n.why, `${n.name}: WARNINGS needs its ⚠ reason`);
  }
});

// ---- trust-c4-acceptance.test.js, E8: what `layout --recipe` resolves is the spec laid out above
test('E8: every recipe still lays out to DONE (in process)', () => {
  const failures = [];
  for (const name of NAMES) {
    const { spec, problems } = resolveRecipe({ recipe: name });
    if (problems.length) {
      failures.push(`${name}: recipe problems ${problems.map((p) => p.code).join(',')}`);
      continue;
    }
    assert.deepEqual(spec, expandRecipe(name).spec, `${name}: resolveRecipe gives the recipe's spec`);
    const r = layoutOf(name);
    if (r.status !== 'done') failures.push(`${name}: ${r.status}`);
  }
  assert.deepEqual(failures, []);
});

// ---- recipes.test.js
test('recipes with a source simulate without errors and without stressing a part', () => {
  for (const name of NAMES) {
    const s = simulate(circuitOf(name));
    assert.ok(s.ok, `${name}: ${JSON.stringify(s.issues)}`);
    const over = Object.entries(s.parts).flatMap(([id, p]) => (p.stress ?? []).filter((x) => x.level !== 'fine').map((x) => `${id} ${x.quantity} ${x.level}`));
    assert.deepEqual(over, [], name);
  }
});

// ---- hazards.test.js: layout again with one net changed
const railOf = (ref) => /^[TBUK][+-]$/.test(String(ref));
test('layout again, property: with one net changed, never a short together with DONE or APPROVED; DONE means the nets are clean', () => {
  let tried = 0;
  for (const name of NAMES) {
    const first = { ...layoutOf(name), circuit: circuitOf(name) };
    if (first.status !== 'done') continue;
    const base = specFromCircuit(first.circuit);
    const nets = base.nets.map((n) => (Array.isArray(n) ? { pins: [...n] } : { ...n, pins: [...n.pins] }));
    const withRail = nets.findIndex((n) => n.pins.some(railOf) && n.pins.some((p) => !railOf(p)));
    const without = nets.findIndex((n, i) => i !== withRail && !n.pins.some(railOf));
    if (withRail < 0 || without < 0) continue;
    // Variant: the first pin of the net on a rail joins another net (a pin leaves a rail and lands on another node).
    const variant = nets.map((n) => ({ ...n, pins: [...n.pins] }));
    const moved = variant[withRail].pins.find((p) => !railOf(p));
    variant[withRail].pins = variant[withRail].pins.filter((p) => p !== moved);
    variant[without].pins.push(moved);
    const r = autoLayout(specFromCircuit(first.circuit, { nets: variant }), { previous: first.circuit });
    if (r.checked) continue; // the variant is not a valid spec
    tried++;
    const text = formatLayout(r, 'en', { t, formatIssue });
    if (r.check.shorted.length) {
      assert.equal(r.review.verdict, 'changes', `${name}: a short with a review that approves\n${text}`);
      assert.doesNotMatch(text, /APPROVED/, name);
    }
    if (r.status === 'done') assert.ok(r.check.ok && r.review.verdict === 'approved', `${name}: DONE with open nets\n${text}`);
    if (r.status === 'warnings') assert.ok(r.check.ok, name);
  }
  assert.ok(tried >= 8, `only ${tried} recipes gave a variant`);
});
