// The kit first, then a trial (docs/en/simulation.md, "The fix"; docs/en/layout.md, "The answer"):
// the whole loop at the kit's level, with no model involved. A board's program burns a pin only while
// it drives it high: the hazard check finds it ("with D10 high"), the kit computes the fix (one
// resistor in series with the buzzer), a trial of the circuit with it (layout --dry-run) ends DONE
// and writes nothing, the circuit with it ends DONE, and the redesign tried instead (the buzzer from
// 5 V through an NPN driven by D10) ends WARNINGS in a trial: a trial would have caught it. The two
// specs: test/fixtures/kit-first/.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tempDir } from '../scripts/tmp.js';
import { autoLayout, formatLayout } from '../src/layout.js';
import { review, formatReview } from '../src/review.js';
import { checkHazards, compile, createEngine, programOutputs } from '../src/sim/index.js';
import { hazardFix } from '../src/fix.js';
import { expandRecipe } from '../src/recipes/index.js';
import { formatIssue, t } from '../src/index.js';
import { valueText } from '../src/core/units.js';

const root = new URL('../', import.meta.url).pathname;
const fixture = (name) => JSON.parse(readFileSync(join(root, 'test/fixtures/kit-first', name), 'utf8'));
const cli = (args, cwd) => spawnSync(process.execPath, [join(root, 'bin/protoboard-iso.js'), ...args], { cwd, encoding: 'utf8' });
const lastLine = (text) => text.trim().split('\n').at(-1);
const text = (r, lang = 'en') => formatLayout(r, lang, { t, formatIssue });

// The spec with the kit's fix applied as one change: a new resistor (the first free R id) between
// the net and the pin it goes in series with, placed in signal order just before that part.
function withFix(spec, fix) {
  const part = fix.pin.split('.')[0];
  let n = 1;
  while (spec.parts.some((p) => p.id === `R${n}`)) n++;
  const id = `R${n}`;
  const parts = [...spec.parts];
  parts.splice(parts.findIndex((p) => p.id === part), 0, { id, type: 'resistor', value: valueText(fix.value) });
  const nets = spec.nets.map((net) => net.map((ref) => (ref === fix.pin ? `${id}.1` : ref)));
  return { ...spec, parts, nets: [...nets, [`${id}.2`, fix.pin]] };
}

const buzzer = fixture('buzzer-on-pin.json');
const built = autoLayout(buzzer);

test('a board drives a buzzer straight from D10: WARNINGS with D10 high, the pin, its figure and maximum', () => {
  assert.equal(built.status, 'warnings');
  assert.equal(built.review.verdict, 'approved-with-warnings');
  const [h] = built.review.hazards;
  assert.equal(built.review.hazards.length, 1);
  assert.equal(h.params.part, 'U1.D10');
  assert.deepEqual(h.when, { part: 'U1', pin: 'D10', name: 'D10', value: 1 });
  assert.ok(h.params.current.value > 0.085 && h.params.current.value < 0.092, 'about 88 mA');
  assert.equal(h.params.max.value, 0.04);
  assert.match(text(built), /⚠ warning: U1\.D10 carries 88\.\d mA, more than its maximum 40 mA, with D10 high\.\n/);
  assert.match(text(built, 'es'), /⚠ aviso: Por U1\.D10 pasan 88,\d mA, más que su máximo de 40 mA, con D10 en alto\.\n/);
  assert.match(lastLine(text(built)), /^STATUS: WARNINGS · /);
  // The states: the three outputs of the program, D8 high at rest already, D9 and D10 held high.
  assert.deepEqual(built.review.hazardStates, { checked: 2, total: 2, controls: 0, outputs: 3 });
});

test('the kit computes the fix: one resistor in series with BZ1, aimed at half the pin\'s maximum', () => {
  const { fix } = built.review;
  assert.equal(fix.kind, 'add-series');
  assert.equal(fix.with, 'BZ1');
  assert.equal(fix.pin, 'BZ1.1');
  assert.ok(fix.value >= 150 && fix.value <= 270, `${fix.value} Ω`);
  const [b] = fix.brings;
  assert.equal(b.part, 'U1.D10');
  assert.ok(b.value <= 0.02 + 1e-9 && b.value > 0.015, `${b.value} A`);
  const value = valueText(fix.value).replace(/k$/, ' k');
  assert.match(text(built), new RegExp(`\\nTo fix it: a ${value} Ω resistor in series with BZ1 brings U1's D10 to 1\\d(\\.\\d)? mA \\(maximum 40 mA\\)\\.\\n`));
  assert.match(text(built, 'es'), new RegExp(`\\nPara arreglarlo: una resistencia de ${value} Ω en serie con BZ1 deja el pin D10 de U1 en 1\\d(,\\d)? mA \\(máximo 40 mA\\)\\.\\n`));
  // The generic advice is gone; what to do stays.
  assert.match(text(built), /\nKeep it if showing the failure is the point\. Say so to the user before changing anything\.\n/);
  assert.doesNotMatch(text(built), /add or raise a series resistance/);
});

test('a trial (layout --dry-run) of the spec with the kit\'s fix ends DONE and writes nothing; applied, it ends DONE', () => {
  const fixed = withFix(buzzer, built.review.fix);
  const dir = tempDir('pbiso-kit-first-');
  writeFileSync(join(dir, 'fixed.json'), JSON.stringify(fixed));
  const trial = cli(['layout', 'circuits/two-leds', 'fixed.json', '--dry-run'], dir);
  assert.equal(trial.status, 0, trial.stdout + trial.stderr);
  assert.match(lastLine(trial.stdout), /^STATUS: DONE · /);
  assert.match(trial.stdout, /\nTrial: nothing was saved\.\nSTATUS: DONE/);
  assert.doesNotMatch(trial.stdout, /⚠/);
  assert.ok(!existsSync(join(dir, 'circuits')), 'nothing written: not even the folder');
  const real = cli(['layout', 'circuits/two-leds', 'fixed.json'], dir);
  assert.equal(real.status, 0, real.stdout + real.stderr);
  assert.match(lastLine(real.stdout), /^STATUS: DONE · /);
  assert.match(real.stdout, /\nChecked: at rest, 3 program outputs\. Not checked: peaks while switching, combinations of program outputs\.\n/);
  assert.ok(existsSync(join(dir, 'circuits/two-leds/circuit.json')));
  // The same answer, but the trial's line and the page's.
  const strip = (s, drop) => s.replace(/^Laid out .*$/m, '').split('\n').filter((l) => !drop.test(l)).join('\n');
  assert.equal(strip(trial.stdout, /^Trial: /), strip(real.stdout, /^Page: /));
});

test('the redesign tried instead (a transistor driving the buzzer from 5 V) ends WARNINGS in a trial: the buzzer burns with D10 high', () => {
  const dir = tempDir('pbiso-kit-first-');
  writeFileSync(join(dir, 'npn.json'), JSON.stringify(fixture('buzzer-npn.json')));
  const r = cli(['layout', 'circuits/npn', 'npn.json', '--dry-run'], dir);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(lastLine(r.stdout), /^STATUS: WARNINGS · /);
  assert.match(r.stdout, /⚠ warning: BZ1 dissipates 1\.\d+ W, more than its 500 mW: it overheats, with D10 high\.\n/);
  assert.match(r.stdout, /\nTrial: nothing was saved\.\nSTATUS: WARNINGS/);
  assert.ok(!existsSync(join(dir, 'circuits')));
});

test('a trial on an existing circuit leaves its file and its history as they were, in both languages', () => {
  const dir = tempDir('pbiso-kit-first-');
  writeFileSync(join(dir, 'spec.json'), JSON.stringify(buzzer));
  writeFileSync(join(dir, 'fixed.json'), JSON.stringify(withFix(buzzer, built.review.fix)));
  assert.equal(cli(['layout', 'circuits/two-leds', 'spec.json'], dir).status, 0);
  const file = join(dir, 'circuits/two-leds/circuit.json');
  const history = join(dir, 'circuits/two-leds/history.jsonl');
  const before = [readFileSync(file), readFileSync(history)];
  for (const lang of ['en', 'es']) {
    const r = cli(['layout', 'circuits/two-leds', 'fixed.json', '--dry-run', '--lang', lang], dir);
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.match(r.stdout, lang === 'en' ? /\nTrial: nothing was saved\.\nSTATUS: DONE/ : /\nEnsayo: no se guardó nada\.\nSTATUS: DONE/);
  }
  assert.deepEqual([readFileSync(file), readFileSync(history)], before);
});

test('led-resistor asked for 50 mA: the fix is the value of R1 itself, at the LED\'s rated 20 mA', () => {
  const r = autoLayout(expandRecipe('led-resistor', { D1: { current: '50mA' } }).spec);
  assert.equal(r.status, 'warnings');
  const { fix } = r.review;
  assert.equal(fix.kind, 'set');
  assert.equal(fix.part, 'R1');
  assert.ok(fix.brings[0].value <= 0.02 + 1e-9 && fix.brings[0].value > 0.017, `${fix.brings[0].value} A`);
  assert.match(text(r), /\nTo fix it: R1 = \d+ Ω brings D1 to 1\d(\.\d)? mA \(maximum 30 mA\)\.\n/);
  assert.match(text(r, 'es'), /\nPara arreglarlo: R1 = \d+ Ω deja a D1 en 1\d(,\d)? mA \(máximo 30 mA\)\.\n/);
});

test('no single resistor clears it: a 16 V capacitor straight across 25 V says the kit has no computed fix', () => {
  // No current flows into a capacitor in DC, so a resistor in series changes nothing across it.
  const r = autoLayout({
    parts: [{ id: 'C1', type: 'capacitor', value: '100u', kind: 'electrolytic', voltage: 16 }],
    nets: [['C1.+', 'T+'], ['C1.-', 'T-']],
    supplies: [{ id: 'V1', voltage: 25, positive: 'T+', negative: 'T-' }],
  });
  assert.equal(r.status, 'warnings');
  assert.equal(r.review.fix, null);
  assert.equal(r.review.noFix, true);
  assert.match(text(r), /\nThe kit has no computed fix for this\.\n/);
  assert.match(text(r, 'es'), /\nEl kit no tiene un arreglo calculado para esto\.\n/);
  assert.deepEqual(hazardFix(r.circuit, []), {});
});

test('a fix that only moves the damage is not a fix: the resistor in series with a buzzer across 5 V must not burn itself', () => {
  // With D10 high the buzzer (16 Ω) is across 5 V. A ¼ W resistor in series under about 64 Ω would
  // overheat itself: the nearest value to the aim (half the buzzer's 500 mW) is not the fix, a
  // larger one that clears every hazard in every state is.
  const npn = autoLayout(fixture('buzzer-npn.json'));
  assert.equal(npn.status, 'warnings');
  const { fix } = npn.review;
  assert.equal(fix.kind, 'add-series');
  assert.equal(fix.with, 'BZ1');
  assert.ok(fix.value >= 56 && fix.value <= 100, `${fix.value} Ω`);
  assert.ok(fix.brings[0].value < 0.25, `${fix.brings[0].value} W`);
});

test('the program outputs: pins already high at rest add no state; a review prints the Checked line', () => {
  const compiled = compile(built.circuit);
  const engine = createEngine(compiled.program);
  const outputs = programOutputs(engine.dc());
  assert.deepEqual(outputs.pins.map((p) => p.pin), ['D8', 'D9', 'D10']);
  assert.deepEqual(outputs.states.map((s) => s.pin), ['D9', 'D10'], 'D8 is high at rest');
  const r = review(built.circuit);
  assert.deepEqual(r.checked, { rest: true, controls: 0, outputs: 3, notChecked: ['switching', 'combinations'] });
  assert.match(formatReview(r, 'en', { t, formatIssue }), /\nChecked: at rest, 3 program outputs\. Not checked: peaks while switching, combinations of program outputs\.\n/);
  assert.match(formatReview(r, 'es', { t, formatIssue }), /\nRevisado: en reposo, 3 salidas del programa\. No revisado: picos al conmutar, combinaciones de salidas del programa\.\n/);
});

test('the Checked line says only what applies: controls, combinations, environment, no source', () => {
  const line = (r, lang = 'en') => text(r, lang).split('\n').find((l) => /^(Checked|Revisado):/.test(l));
  assert.equal(line(autoLayout(expandRecipe('led-resistor').spec)), 'Checked: at rest. Not checked: nothing that applies to this circuit.');
  assert.equal(line(autoLayout(expandRecipe('npn-switch').spec)), 'Checked: at rest, 1 control. Not checked: nothing that applies to this circuit.');
  assert.equal(line(autoLayout(expandRecipe('slide-switch-leds').spec), 'es'), 'Revisado: en reposo, 1 control. No revisado: nada que aplique a este circuito.');
  assert.match(line(autoLayout(expandRecipe('555-astable').spec)), /Not checked: peaks while switching\.$/);
  assert.match(line(autoLayout(expandRecipe('ldr-night-light').spec)), /what the sensors read from the environment/);
  const none = checkHazards({ parts: [{ id: 'R1', type: 'resistor', value: '1k', pins: ['a1', 'a5'] }] });
  assert.deepEqual(none.checked, { rest: false, controls: 0, outputs: 0, notChecked: ['no-source'] });
  assert.match(formatReview(review({ parts: [{ id: 'R1', type: 'resistor', value: '1k', pins: ['a1', 'a5'] }] }), 'en', { t, formatIssue }), /\nChecked: nothing\. Not checked: nothing could be simulated: no source\.\n/);
});
