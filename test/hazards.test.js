// Electrical hazards in review (a part that would be damaged as wired is approved WITH WARNINGS, never
// plain APPROVED and never blocked) and layout again on an existing circuit (a part keeps its holes only
// when its new nets still want them there; the review reads the nets).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { autoLayout, specFromCircuit, formatLayout } from '../src/layout.js';
import { review, formatReview } from '../src/review.js';
import { RECIPES, expandRecipe } from '../src/recipes/index.js';
import { applyOps } from '../src/ops.js';
import { formatIssue, t } from '../src/index.js';

const led = (resistor) => ({
  parts: [...(resistor ? [{ id: 'R1', type: 'resistor', value: resistor }] : []), { id: 'D1', part: 'LED', color: 'red' }],
  supplies: [{ id: 'V1', kind: 'bench', voltage: 9, positive: 'T+', negative: 'T-' }],
  nets: resistor ? [['T+', 'R1.1'], ['R1.2', 'D1.anode'], ['D1.cathode', 'T-']] : [['T+', 'D1.anode'], ['D1.cathode', 'T-']],
});
const root = new URL('../', import.meta.url).pathname;

test('a LED straight across 9 V: layout ends WARNINGS, review is approved with warnings naming D1, value and limit', () => {
  const r = autoLayout(led(null));
  assert.equal(r.status, 'warnings');
  assert.equal(r.review.verdict, 'approved-with-warnings');
  assert.equal(r.review.blocking.length, 0);
  const h = r.review.hazards[0];
  assert.deepEqual(h.parts, ['D1']);
  assert.equal(h.code, 'SIM_OVER_CURRENT');
  assert.ok(h.params.current.value > 0.7 && h.params.current.value < 0.72, 'about 708 mA');
  assert.equal(h.params.max.value, 0.03);
  const text = formatLayout(r, 'en', { t, formatIssue });
  assert.match(text, /APPROVED WITH WARNINGS/);
  assert.match(text, /708 mA, more than its maximum 30 mA/);
  assert.match(text.split('\n').at(-1), /^STATUS: WARNINGS · /);
  const es = formatReview(review(r.circuit), 'es', { t, formatIssue });
  assert.match(es, /^APROBADO CON AVISOS/);
  assert.match(es, /708 mA.*30 mA/);
});

test('with a series resistor it is plain APPROVED and DONE', () => {
  const r = autoLayout(led('470'));
  assert.equal(r.status, 'done');
  assert.equal(review(r.circuit).verdict, 'approved');
  assert.deepEqual(review(r.circuit).hazards, []);
});

test('a real blocking item and a hazard together: CHANGES, and the hazard is still listed', () => {
  const c = autoLayout(led(null)).circuit;
  const asked = { ...c, spec: { ...c.spec, nets: [...c.spec.nets, ['D1.anode', 'D1.cathode']] } };
  const r = review(asked);
  assert.equal(r.verdict, 'changes');
  assert.ok(r.blocking.length);
  assert.equal(r.hazards.length, 1);
  assert.match(formatReview(r, 'en', { t, formatIssue }), /As wired, this would damage/);
});

test('every profile reports the hazard; hidden results still report it to the assistant', () => {
  const c = autoLayout({ ...led(null), page: { simulation: false } }).circuit;
  for (const profile of ['lesson', 'draft']) assert.equal(review(c, { profile }).verdict, 'approved-with-warnings', profile);
});

test('a circuit that cannot be simulated has no hazards', () => {
  const r = autoLayout({ parts: [{ id: 'R1', type: 'resistor', value: '1k' }, { id: 'R2', type: 'resistor', value: '1k' }], nets: [['R1.1', 'R2.1']] });
  assert.deepEqual(review(r.circuit).hazards, []);
});

test('recipes with their defaults: none would damage a part', () => {
  // Known list: recipes whose defaults are past a limit (none today; the owner decides about any listed here).
  const known = new Set([]);
  for (const name of Object.keys(RECIPES)) {
    const r = autoLayout(expandRecipe(name).spec);
    const hazards = r.review.hazards.map((h) => formatIssue(h, 'en'));
    if (known.has(name)) assert.ok(hazards.length, `${name} is on the known list but has no hazard any more: remove it`);
    else assert.deepEqual(hazards, [], name);
  }
});

test('cli: layout and review exit 0 with the warnings status, CHANGES is still 2', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pbiso-'));
  const file = join(dir, 'spec.json');
  writeFileSync(file, JSON.stringify(led(null)));
  const cli = (...args) => spawnSync(process.execPath, [join(root, 'bin/protoboard-iso.js'), ...args], { cwd: dir, encoding: 'utf8' });
  const made = cli('layout', 'led', file);
  assert.equal(made.status, 0, made.stdout + made.stderr);
  assert.match(made.stdout, /STATUS: WARNINGS/);
  const rev = cli('review', 'led');
  assert.equal(rev.status, 0);
  assert.match(rev.stdout, /^APPROVED WITH WARNINGS/);
});

// ---- layout again

test('layout again: a part keeps its holes only where its new nets want them (LED + LED in series)', () => {
  const first = autoLayout(expandRecipe('led-resistor', { V1: 9 }).spec);
  assert.equal(first.status, 'done');
  const next = {
    parts: [{ id: 'R1', type: 'resistor', value: '1k' }, { id: 'D1', part: 'LED', color: 'red' }, { id: 'D2', part: 'LED', color: 'red' }],
    supplies: [{ id: 'V1', kind: 'bench', voltage: 9, positive: 'T+', negative: 'T-' }],
    nets: [['T+', 'R1.1'], ['R1.2', 'D1.anode'], ['D1.cathode', 'D2.anode'], ['D2.cathode', 'T-']],
  };
  const r = autoLayout(next, { previous: first.circuit });
  assert.equal(r.status, 'done', formatLayout(r, 'en', { t, formatIssue }));
  assert.equal(r.check.ok, true);
  const text = formatLayout(r, 'en', { t, formatIssue });
  assert.doesNotMatch(text, /✖/);
  // The same as laying it out on a fresh target.
  assert.equal(autoLayout(next).status, 'done');
});

const railOf = (ref) => /^[TBUK][+-]$/.test(String(ref));
test('layout again, property: with one net changed, never a short together with DONE or APPROVED; DONE means the nets are clean', () => {
  let tried = 0;
  for (const name of Object.keys(RECIPES)) {
    const first = autoLayout(expandRecipe(name).spec);
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

test('undo after layout again restores the first layout exactly', async () => {
  const { mkdtempSync: mk } = await import('node:fs');
  const { readFileSync } = await import('node:fs');
  const { createTarget, relayoutTarget, undoTarget } = await import('../src/node/workspace.js');
  const dir = join(mk(join(tmpdir(), 'pbiso-')), 'c');
  const first = autoLayout(expandRecipe('led-resistor', { V1: 9 }).spec);
  createTarget(dir, first.circuit, { outputs: false });
  const before = JSON.parse(readFileSync(join(dir, 'circuit.json'), 'utf8'));
  const next = autoLayout(
    { parts: [{ id: 'R1', type: 'resistor', value: '1k' }, { id: 'D1', part: 'LED', color: 'red' }, { id: 'D2', part: 'LED', color: 'red' }], supplies: first.circuit.supplies, nets: [['T+', 'R1.1'], ['R1.2', 'D1.anode'], ['D1.cathode', 'D2.anode'], ['D2.cathode', 'T-']] },
    { previous: first.circuit },
  );
  relayoutTarget(dir, next.circuit, { outputs: false });
  undoTarget(dir, { outputs: false });
  const after = JSON.parse(readFileSync(join(dir, 'circuit.json'), 'utf8'));
  const strip = ({ revision, ...rest }) => rest;
  assert.deepEqual(strip(after), strip(before));
  assert.ok(applyOps);
});
