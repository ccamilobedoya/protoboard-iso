// Electrical hazards in review (a part that would be damaged as wired is approved WITH WARNINGS, never
// plain APPROVED and never blocked) and layout again on an existing circuit (a part keeps its holes only
// when its new nets still want them there; the review reads the nets).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tempDir } from '../scripts/tmp.js';
import { autoLayout, specFromCircuit, formatLayout } from '../src/layout.js';
import { review, formatReview, formatHazards } from '../src/review.js';
import { compile, createEngine, controlStates, engineHazards, STATES_MAX } from '../src/sim/index.js';
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
  // Known list: recipes whose defaults are past a limit, at rest, with each control operated or with
  // each output of a board's program high (none today; the maintainer decides about any listed here,
  // each with a comment saying what burns and when).
  const known = new Set([]);
  for (const name of Object.keys(RECIPES)) {
    const r = autoLayout(expandRecipe(name).spec);
    const hazards = r.review.hazards.map((h) => formatIssue(h, 'en'));
    if (known.has(name)) assert.ok(hazards.length, `${name} is on the known list but has no hazard any more: remove it`);
    else assert.deepEqual(hazards, [], name);
    // Every output of a recipe comes on in some state the kit visits (SIM_OUTPUT_NEVER_ON).
    assert.deepEqual(r.review.doubts.filter((d) => d.code === 'SIM_OUTPUT_NEVER_ON').map((d) => formatIssue(d, 'en')), [], name);
  }
});

// ---- with a control operated (sim/index.js checkHazards): one control at a time, the others at rest

test('npn-switch with a 47 Ω collector resistor at 12 V: nothing burns at rest, D1 and R2 burn with S1 pressed', () => {
  const r = autoLayout(expandRecipe('npn-switch', { R2: '47', V1: 12 }).spec);
  assert.equal(r.status, 'warnings');
  assert.equal(r.review.verdict, 'approved-with-warnings');
  assert.deepEqual(r.review.hazardStates, { checked: 1, total: 1, controls: 1, outputs: 0 });
  const d1 = r.review.hazards.find((h) => h.params.part === 'D1');
  assert.equal(d1.code, 'SIM_OVER_CURRENT');
  assert.deepEqual(d1.when, { part: 'S1', field: 'pressed', value: true });
  assert.ok(d1.params.current.value > 0.17 && d1.params.current.value < 0.19, 'about 178 mA');
  assert.ok(r.review.hazards.every((h) => h.when), 'nothing at rest');
  const en = formatLayout(r, 'en', { t, formatIssue });
  assert.match(en, /⚠ warning: D1 carries 178 mA, more than its maximum 30 mA: it burns out, with S1 pressed\.\n/);
  assert.match(en, /⚠ warning: R2 dissipates [\d.]+ W, more than its 250 mW: it overheats, with S1 pressed\.\n/);
  assert.match(en.split('\n').at(-1), /^STATUS: WARNINGS · /);
  const es = formatLayout(r, 'es', { t, formatIssue });
  assert.match(es, /⚠ aviso: Por D1 pasan 178 mA, más que su máximo de 30 mA: se quema, con S1 oprimido\.\n/);
  // The same recipe at its defaults: nothing burns pressed either.
  const fine = autoLayout(expandRecipe('npn-switch').spec);
  assert.equal(fine.status, 'done');
  assert.deepEqual(fine.review.hazards, []);
  assert.deepEqual(fine.review.hazardStates, { checked: 1, total: 1, controls: 1, outputs: 0 });
});

test('a slide switch in its other position: the green LED with a 10 Ω resistor burns only slid to 2', () => {
  const r = autoLayout(expandRecipe('slide-switch-leds', { R2: '10' }).spec);
  assert.equal(r.status, 'warnings');
  const d2 = r.review.hazards.find((h) => h.params.part === 'D2' && h.code === 'SIM_OVER_CURRENT');
  assert.deepEqual(d2.when, { part: 'S1', field: 'slid', value: true });
  assert.match(formatIssue(d2, 'en'), /, with S1 slid to 2 \(COM–2\)\.$/);
  assert.match(formatIssue(d2, 'es'), /, con S1 deslizado a 2 \(COM–2\)\.$/);
});

test('a potentiometer at an end of its travel: a 10 Ω LED resistor burns the LED with the wiper on pin 1', () => {
  const r = autoLayout(expandRecipe('potentiometer-led', { R1: '10', V1: 12 }).spec);
  assert.equal(r.status, 'warnings');
  assert.deepEqual(r.review.hazardStates, { checked: 2, total: 2, controls: 1, outputs: 0 });
  const d1 = r.review.hazards.find((h) => h.params.part === 'D1' && h.code === 'SIM_OVER_CURRENT');
  assert.deepEqual(d1.when, { part: 'RV1', field: 'position', value: 0 });
  assert.match(formatIssue(d1, 'en'), /, with RV1 at the end of its travel on the pin 1 side\.$/);
  assert.match(formatIssue(d1, 'es'), /, con RV1 al final de su recorrido, del lado del pin 1\.$/);
  // The other end puts nothing across the LED: no hazard there.
  assert.ok(!r.review.hazards.some((h) => h.when?.value === 1));
});

test('a hazard at rest is reported once, at rest, even when it is also there with the button pressed', () => {
  const spec = {
    parts: [{ id: 'D1', part: 'LED', color: 'red' }, { id: 'S1', type: 'button' }, { id: 'R1', type: 'resistor', value: '470' }, { id: 'D2', part: 'LED', color: 'green' }],
    supplies: [{ id: 'V1', kind: 'bench', voltage: 9, positive: 'T+', negative: 'T-' }],
    nets: [['T+', 'D1.anode', 'S1.1'], ['D1.cathode', 'T-'], ['S1.3', 'R1.1'], ['R1.2', 'D2.anode'], ['D2.cathode', 'T-']],
  };
  const r = autoLayout(spec);
  assert.equal(r.status, 'warnings');
  assert.equal(r.review.hazards.length, 1);
  assert.equal(r.review.hazards[0].params.part, 'D1');
  assert.equal(r.review.hazards[0].when, undefined);
  assert.doesNotMatch(formatLayout(r, 'en', { t, formatIssue }), /with S1 pressed/);
});

test('the states are capped: past the cap the review says how many were checked, never silence', () => {
  const r = autoLayout(expandRecipe('npn-switch', { R2: '47', V1: 12 }).spec);
  const compiled = compile(r.circuit);
  const engine = createEngine(compiled.program);
  const states = controlStates(compiled.program, engine);
  assert.deepEqual(states, [{ part: 'S1', field: 'pressed', value: true, rest: false }]);
  // With room for no state, the hazard pressed is not found, and the count says so.
  assert.deepEqual(engineHazards(engine, states, 0), { hazards: [], doubts: [], states: { checked: 0, total: 1, controls: 1, outputs: 0 }, ok: true });
  assert.ok(STATES_MAX >= 16);
  const capped = { hazards: [], hazardStates: { checked: STATES_MAX, total: STATES_MAX + 6 } };
  assert.match(formatHazards(capped, 'en', formatIssue, t).join('\n'), new RegExp(`^States checked for damage: ${STATES_MAX} of ${STATES_MAX + 6} \\(one control or program output at a time`));
  assert.match(formatHazards(capped, 'es', formatIssue, t).join('\n'), new RegExp(`^Estados revisados por daño: ${STATES_MAX} de ${STATES_MAX + 6}`));
  // Every state checked: no line.
  assert.deepEqual(formatHazards({ hazards: [], hazardStates: { checked: 1, total: 1 } }, 'en', formatIssue, t), []);
});

test('cli: layout and review exit 0 with the warnings status, CHANGES is still 2', () => {
  const dir = tempDir('pbiso-');
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
  const { tempDir: mk } = await import('../scripts/tmp.js');
  const { readFileSync } = await import('node:fs');
  const { createTarget, relayoutTarget, undoTarget } = await import('../src/node/workspace.js');
  const dir = join(mk('pbiso-'), 'c');
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
