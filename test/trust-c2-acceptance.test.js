// Acceptance tests for session C2 ("hazards and does-not-work the simulator misses"), items B1-B11.
// Written from the contract alone, through the CLI (child process) and the exports of src/. Where the
// contract leaves a string open, the test asserts the stable part (issue code, part id, flag).
//
// Facts about the kit these tests rely on:
//   - 7805 pins: VIN, GND, OUT. Battery pins: + and -. Electrolytic capacitor pins: + and -.
//   - LED pins: anode, cathode. Button: 4 pins, 1-2 joined inside and 3-4 joined inside (catalog button).
//   - Relay: A1/A2 coil, COM/NO/NC. Motor: + and -. Supplies are spec.supplies: {id, kind:'bench', voltage, positive, negative}.
//   - `review --json` has verdict, hazards[], fix ({kind, value, ...} or null) and noFix; `check --json` has issues[];
//     `simulate --json` has ok, parts{id:{current,...}} and issues[]; `apply --ops` takes {op:'circuit', environment:{light:0}}.
//   - A fresh target is a folder made by `layout <target> <spec.json>`; recipes by `layout <target> --recipe <name>`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tempDir } from '../scripts/tmp.js';
import { RECIPES, expandRecipe } from '../src/recipes/index.js';
import { autoLayout } from '../src/layout.js';
import { review } from '../src/index.js';

const root = new URL('../', import.meta.url).pathname;
const dir = tempDir('c2-acc-');
const run = (args, extra = {}) => spawnSync(process.execPath, [join(root, 'bin/protoboard-iso.js'), ...args], { cwd: dir, encoding: 'utf8', timeout: 120000, ...extra });
const json = (r) => { try { return JSON.parse(r.stdout); } catch { assert.fail(`no JSON on stdout (exit ${r.status}): ${r.stdout.slice(0, 300)} ${r.stderr.slice(0, 300)}`); } };

// Lay a spec out into a target folder; returns the target path.
let n = 0;
function build(spec, { ops } = {}) {
  const name = `c${++n}`;
  writeFileSync(join(dir, `${name}.spec.json`), JSON.stringify(spec));
  const l = run(['layout', name, `${name}.spec.json`]);
  assert.equal(l.status, 0, `layout failed: ${l.stdout} ${l.stderr}`);
  if (ops) assert.equal(run(['apply', name, '--ops', JSON.stringify(ops)]).status, 0, 'apply failed');
  return name;
}
const reviewJson = (target) => json(run(['review', target, '--json']));
const simJson = (target) => json(run(['simulate', target, '--json']));
const checkJson = (target) => json(run(['check', target, '--json']));
const hasCode = (list, code, part) => (list ?? []).some((h) => h.code === code && (!part || (h.parts ?? [h.params?.part]).includes(part)));
const light0 = [{ op: 'circuit', environment: { light: 0 } }];
const bench = (v, positive = 'T+', negative = 'T-') => [{ id: 'V1', kind: 'bench', voltage: v, positive, negative }];

// ---------------------------------------------------------------- B1
const reg = (reversed) => ({
  parts: [{ id: 'BT1', type: 'battery', format: '9V' }, { id: 'U1', part: '7805' }],
  nets: reversed ? [['BT1.-', 'U1.VIN'], ['BT1.+', 'U1.GND']] : [['BT1.+', 'U1.VIN'], ['BT1.-', 'U1.GND']],
});

test('B1 · a battery reversed into a 7805: SIM_REVERSE_VOLTAGE naming U1, approved-with-warnings', () => {
  const r = reviewJson(build(reg(true)));
  assert.ok(hasCode(r.hazards, 'SIM_REVERSE_VOLTAGE', 'U1'), `hazards: ${JSON.stringify(r.hazards)}`);
  assert.equal(r.verdict, 'approved-with-warnings');
});

test('B1 · the same 7805 circuit the right way round: no SIM_REVERSE_VOLTAGE', () => {
  const r = reviewJson(build(reg(false)));
  assert.ok(!hasCode(r.hazards, 'SIM_REVERSE_VOLTAGE'), `hazards: ${JSON.stringify(r.hazards)}`);
});

// ---------------------------------------------------------------- B2
const ledReversed = (volts) => ({
  parts: [{ id: 'R1', type: 'resistor', value: '330' }, { id: 'D1', part: 'LED', color: 'red' }],
  nets: [['T+', 'D1.cathode'], ['D1.anode', 'R1.1'], ['R1.2', 'T-']],
  supplies: bench(volts),
});

test('B2 · a red LED reversed with a resistor on 9 V: past its 5 V reverse rating, so the hazard stays', () => {
  // Arbitrated: the contract's first wording ("no hazard for a reversed LED") was wrong for 9 V. The
  // red LED's reverse rating is 5 V and the reversed LED sees about 9 V (no current, so nothing drops
  // across the resistor): the kit warned before this work and still must.
  const r = reviewJson(build(ledReversed(9)));
  assert.ok(hasCode(r.hazards, 'SIM_REVERSE_VOLTAGE', 'D1'), `hazards: ${JSON.stringify(r.hazards)}`);
});

test('B2 guard · a red LED reversed on 4 V (below its 5 V reverse rating): no SIM_REVERSE_VOLTAGE', () => {
  const r = reviewJson(build(ledReversed(4))); // 4 V < 5 V rating
  assert.ok(!hasCode(r.hazards, 'SIM_REVERSE_VOLTAGE'), `hazards: ${JSON.stringify(r.hazards)}`);
});

// ---------------------------------------------------------------- B3
const cap = (reversed) => ({
  parts: [{ id: 'BT1', type: 'battery', format: '9V' }, { id: 'C1', type: 'capacitor', kind: 'electrolytic', value: '100u', voltage: 25 }],
  nets: reversed ? [['BT1.+', 'C1.-'], ['BT1.-', 'C1.+']] : [['BT1.+', 'C1.+'], ['BT1.-', 'C1.-']],
});
const capHazard = (h) => (h ?? []).some((x) => ['SIM_REVERSE_VOLTAGE', 'SIM_CAP_REVERSED'].includes(x.code) && (x.parts ?? []).includes('C1'));

test('B3 · a 100 uF electrolytic reversed across 9 V is a hazard on C1 (9 V > 1 V)', () => {
  const r = reviewJson(build(cap(true)));
  assert.ok(capHazard(r.hazards), `hazards: ${JSON.stringify(r.hazards)}`);
  assert.equal(r.verdict, 'approved-with-warnings');
});

test('B3 · the right way round: no hazard', () => {
  const r = reviewJson(build(cap(false)));
  assert.deepEqual(r.hazards, []);
});

// ---------------------------------------------------------------- B4
test('B4 · LED + 330 ohm on a supply of -9 V, wired so the LED conducts: ok, about 21 mA', () => {
  const t = build({
    parts: [{ id: 'R1', type: 'resistor', value: '330' }, { id: 'D1', part: 'LED', color: 'red' }],
    // positive terminal (T+) sits at -9 V relative to T-, so T- is the more positive node: anode to T-.
    nets: [['T-', 'D1.anode'], ['D1.cathode', 'R1.1'], ['R1.2', 'T+']],
    supplies: bench(-9),
  });
  const s = simJson(t);
  assert.equal(s.ok, true, `issues: ${JSON.stringify(s.issues)}`);
  // (9 V - Vf of a red LED about 1.92 V) / 330 ohm = 21.5 mA; the same circuit on +9 V simulates 21.46 mA; +-10 % = 19.3 .. 23.6 mA
  const i = s.parts.D1.current;
  assert.ok(i > 0.0193 && i < 0.0236, `LED current ${i}`);
});

// ---------------------------------------------------------------- B5 / B6
const NIGHT = (base) => ({
  parts: [{ id: 'R1', type: 'resistor', value: base }, { id: 'LDR1', type: 'ldr', part: 'GL5528' },
    { id: 'R2', type: 'resistor', value: base }, { id: 'Q1', part: '2N2222A' },
    { id: 'K1', type: 'relay' }, { id: 'D1', part: '1N4007' },
    { id: 'R3', type: 'resistor', value: '330' }, { id: 'D2', type: 'led', color: 'red' }],
  nets: [['T+', 'R1.1', 'K1.A1', 'D1.K', 'K1.COM'], ['R1.2', 'LDR1.1', 'R2.1'], ['R2.2', 'Q1.B'], ['K1.A2', 'D1.A', 'Q1.C'],
    ['LDR1.2', 'Q1.E', 'T-'], ['K1.NO', 'R3.1'], ['R3.2', 'D2.A'], ['D2.K', 'T-']],
  supplies: bench(5),
});

test('B5 precondition · night light at light 0: coil 42 mA between release 7.1 mA and pull-in 53.6 mA, contact on NC', () => {
  const s = simJson(build(NIGHT('10k'), { ops: light0 }));
  const k = s.parts.K1;
  assert.equal(k.closed, false);
  // coil current 42 mA (contract: about 42 mA); the model's own thresholds: pullIn 5 V/70 ohm*0.75 = 53.6 mA, dropOut 7.1 mA
  assert.ok(k.current > k.dropOut && k.current < k.pullIn, `coil ${k.current} A, band ${k.dropOut}..${k.pullIn}`);
});

test('B5 · night light at light 0: simulate emits SIM_RELAY_UNDERDRIVEN as a warning', () => {
  const s = simJson(build(NIGHT('10k'), { ops: light0 }));
  const issue = s.issues.find((i) => i.code === 'SIM_RELAY_UNDERDRIVEN');
  assert.ok(issue, `issues: ${JSON.stringify(s.issues)}`);
  assert.equal(issue.severity, 'warning');
});

test('B5 · night light: review reports SIM_RELAY_UNDERDRIVEN somewhere (hazards, doubts or advisory), naming K1', () => {
  const r = reviewJson(build(NIGHT('10k')));
  const text = JSON.stringify(r);
  assert.match(text, /SIM_RELAY_UNDERDRIVEN/, `review: ${text.slice(0, 600)}`);
  assert.match(text, /K1/);
});

test('B5 · with both base/divider resistors at 1k the warning is gone and the contact is on NO in the dark', () => {
  const t = build(NIGHT('1k'), { ops: light0 });
  const s = simJson(t);
  assert.ok(!s.issues.some((i) => i.code === 'SIM_RELAY_UNDERDRIVEN'), JSON.stringify(s.issues));
  // coil current 70.5 mA (5 V across 70 ohm less the saturated transistor) is above the 53.6 mA pull-in: the contact is on NO
  assert.equal(s.parts.K1.closed, true);
  assert.ok(!JSON.stringify(reviewJson(t)).includes('SIM_RELAY_UNDERDRIVEN'));
});

test('B6 · recipe relay-npn: no SIM_RELAY_UNDERDRIVEN in any state (review and simulate)', () => {
  assert.equal(run(['layout', 'rn', '--recipe', 'relay-npn']).status, 0);
  assert.ok(!JSON.stringify(reviewJson('rn')).includes('SIM_RELAY_UNDERDRIVEN'));
  assert.ok(!JSON.stringify(simJson('rn')).includes('SIM_RELAY_UNDERDRIVEN'));
});

// ---------------------------------------------------------------- B7
const btn = (a, b) => ({
  parts: [{ id: 'S1', type: 'button' }, { id: 'R1', type: 'resistor', value: '330' }, { id: 'D1', part: 'LED', color: 'red' }],
  nets: [['T+', `S1.${a}`], [`S1.${b}`, 'R1.1'], ['R1.2', 'D1.anode'], ['D1.cathode', 'T-']],
  supplies: bench(5),
});
const joined = (t) => checkJson(t).issues.filter((i) => i.code === 'BUTTON_PINS_JOINED');

test('B7 · a button with net X on pin 1 and net Y on pin 2 (always joined): BUTTON_PINS_JOINED', () => {
  const found = joined(build(btn(1, 2)));
  assert.ok(found.length >= 1);
  assert.equal(found[0].severity, 'warning');
});

test('B7 guard · a button wired across its two sides (pins 1 and 3), or with both joined pins on one net: none', () => {
  assert.equal(joined(build(btn(1, 3))).length, 0);
  assert.equal(joined(build({ ...btn(1, 3), nets: [['T+', 'S1.1', 'S1.2'], ['S1.3', 'R1.1'], ['R1.2', 'D1.anode'], ['D1.cathode', 'T-']] })).length, 0);
});

for (const recipe of ['button-pullup', 'button-pulldown', 'uno-button']) {
  test(`B7 guard · recipe ${recipe}: no BUTTON_PINS_JOINED`, () => {
    assert.equal(run(['layout', `b7-${recipe}`, '--recipe', recipe]).status, 0);
    assert.equal(joined(`b7-${recipe}`).length, 0);
  });
}

// ---------------------------------------------------------------- B8
test('B8 · motor RE-140RA-2270 on 5 V: over-voltage hazard on M1, and the kit has no computed fix', () => {
  const t = build({ parts: [{ id: 'M1', type: 'motor', part: 'RE-140RA-2270' }], nets: [['T+', 'M1.+'], ['M1.-', 'T-']], supplies: bench(5) });
  const r = reviewJson(t);
  assert.ok(hasCode(r.hazards, 'SIM_MOTOR_VOLTAGE', 'M1'), JSON.stringify(r.hazards)); // 5 V > its 3 V top of range
  // any series resistor that brings 5 V under the 3 V maximum drops the motor under the voltage at which it turns
  assert.equal(r.fix ?? null, null, `fix: ${JSON.stringify(r.fix)}`);
  assert.equal(r.noFix, true);
  assert.match(run(['review', t]).stdout, /no computed fix/i);
});

// ---------------------------------------------------------------- B9
test('B9 · LED on 9 V without a resistor: hazard kept, fix near 360 ohm, consequence on the damage line, no brightness over 1000 %', () => {
  const t = build({ parts: [{ id: 'D1', part: 'LED', color: 'red' }], nets: [['T+', 'D1.anode'], ['D1.cathode', 'T-']], supplies: bench(9) });
  const r = reviewJson(t);
  assert.ok(hasCode(r.hazards, 'SIM_OVER_CURRENT', 'D1'));
  // (9 V - Vf about 1.95 V) / 20 mA = 352 ohm, E24 neighbour 360 ohm; accept 330..390
  assert.equal(r.fix?.kind, 'add-series');
  assert.ok(r.fix.value >= 330 && r.fix.value <= 390, `fix ${r.fix.value}`);
  const text = run(['review', t]).stdout;
  const line = text.split('\n').find((l) => l.includes('D1 carries'));
  assert.ok(line, text);
  assert.match(line, /burn/i, line); // LED: burns out
});

test('B9 · LED on 9 V without a resistor: no brightness over 1000 % in layout, review or simulate text', () => {
  const t = build({ parts: [{ id: 'D1', part: 'LED', color: 'red' }], nets: [['T+', 'D1.anode'], ['D1.cathode', 'T-']], supplies: bench(9) });
  const text = run(['review', t]).stdout;
  const everything = [text, run(['simulate', t]).stdout, run(['layout', t, `${t}.spec.json`]).stdout].join('\n');
  for (const m of everything.matchAll(/(\d[\d.,]*)\s*%/g)) {
    assert.ok(Number(m[1].replace(',', '')) <= 1000, `a percentage over 1000 %: ${m[0]}`);
  }
});

// ---------------------------------------------------------------- B10
// Baseline v0.12.1: all 60 recipes review "approved" with no hazard and no blocking item at rest (recorded 2026-11-20).
const RECIPE_BASELINE_COUNT = 60;
test('B10 · the recipe list is the one the baseline was recorded on', () => {
  assert.equal(Object.keys(RECIPES).length, RECIPE_BASELINE_COUNT);
});
for (const name of Object.keys(RECIPES)) {
  test(`B10 · recipe ${name} gains no hazard (baseline: none) and stays approved`, () => {
    const r = review(autoLayout(expandRecipe(name).spec).circuit);
    assert.deepEqual(r.hazards.map((h) => `${h.code}:${(h.parts ?? []).join(',')}`), []);
    assert.deepEqual(r.blocking, []);
    assert.equal(r.verdict, 'approved');
  });
}

// ---------------------------------------------------------------- B11
test('B11 · the golden simulator output passes (or its changed cases are listed in the report)', () => {
  const g = spawnSync(process.execPath, [join(root, 'scripts/golden.js')], { cwd: root, encoding: 'utf8', timeout: 120000 });
  assert.equal(g.status, 0, `${g.stdout} ${g.stderr}`);
});
