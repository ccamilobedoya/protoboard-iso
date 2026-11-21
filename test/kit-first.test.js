// The kit first, then a trial (docs/en/simulation.md, "The fix"; docs/en/layout.md, "The answer"):
// the whole loop at the kit's level, with no model involved. A board's program burns a pin only while
// it drives it high: the hazard check finds it in the combination the sketch reaches ("with D9 + D10 high", C8a), the kit computes the fix (one
// resistor in series with the buzzer) and applies it when asked (layout --fix: one call, one
// revision, undo brings the warning back); the same change written by hand ends DONE in a trial
// (layout --dry-run, which writes nothing) and applied, whatever order the parts are listed in; and
// the redesign tried instead (the buzzer from 5 V through an NPN driven by D10) ends WARNINGS in a
// trial: a trial would have caught it. The two specs: test/fixtures/kit-first/.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
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

// The spec with the kit's fix written by hand as one change: a new resistor (the first free R id)
// between the net and the pin it goes in series with, listed just before that part (signal order)
// or, as anyone would add it, at the end: the layout must not depend on it.
function withFix(spec, fix, { atEnd = false } = {}) {
  const part = fix.pin.split('.')[0];
  let n = 1;
  while (spec.parts.some((p) => p.id === `R${n}`)) n++;
  const id = `R${n}`;
  const parts = [...spec.parts];
  const resistor = { id, type: 'resistor', value: valueText(fix.value) };
  if (atEnd) parts.push(resistor);
  else parts.splice(parts.findIndex((p) => p.id === part), 0, resistor);
  const nets = spec.nets.flatMap((net) => (net.includes(fix.pin) ? [net.map((ref) => (ref === fix.pin ? `${id}.1` : ref)), [`${id}.2`, fix.pin]] : [net]));
  return { ...spec, parts, nets };
}

const buzzer = fixture('buzzer-on-pin.json');
const built = autoLayout(buzzer);
// The buzzer circuit laid out through the CLI once (`layout <folder> spec.json`); each test that
// starts from it gets its own copy of the folder, under the name it uses.
let made = null;
function laidOut(dir, name) {
  if (!made) {
    made = tempDir('pbiso-kit-first-made-');
    writeFileSync(join(made, 'spec.json'), JSON.stringify(buzzer));
    assert.equal(cli(['layout', 'circuits/c', 'spec.json'], made).status, 0);
  }
  writeFileSync(join(dir, 'spec.json'), JSON.stringify(buzzer));
  cpSync(join(made, 'circuits/c'), join(dir, 'circuits', name), { recursive: true });
}

test('a board drives a buzzer straight from D10: WARNINGS with D10 high, the pin, its figure and maximum', () => {
  assert.equal(built.status, 'warnings');
  assert.equal(built.review.verdict, 'approved-with-warnings');
  const [h] = built.review.hazards;
  assert.equal(built.review.hazards.length, 1);
  assert.equal(h.params.part, 'U1.D10');
  assert.deepEqual(h.when, { part: 'U1', pin: 'D10', name: 'D9 + D10', value: 1 });
  assert.ok(h.params.current.value > 0.085 && h.params.current.value < 0.092, 'about 88 mA');
  assert.equal(h.params.max.value, 0.04);
  assert.match(text(built), /⚠ warning: U1\.D10 carries 88\.\d mA, more than its maximum 40 mA: the pin can be damaged, with D9 \+ D10 high\.\n/);
  assert.match(text(built, 'es'), /⚠ aviso: Por U1\.D10 pasan 88,\d mA, más que su máximo de 40 mA: el pin se puede dañar, con D9 \+ D10 en alto\.\n/);
  assert.match(lastLine(text(built)), /^STATUS: WARNINGS · /);
  // The states: the three outputs of the program, D8 high at rest already, D9 and D10 held high.
  // Since C8a the program runs, so its outputs are visited as its run combined them: D8 alone (as at
  // rest), then D9 with D10 (the tone): one state.
  assert.deepEqual(built.review.hazardStates, { checked: 1, total: 1, controls: 0, outputs: 3, combined: true });
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

// The fix's own line, as layout --fix prints it ("R3 = 200 Ω in series with BZ1").
const appliedText = (fix, lang = 'en') => {
  const value = `${valueText(fix.value).replace(/k$/, ' k').replace('.', lang === 'es' ? ',' : '.')} Ω`;
  return lang === 'es' ? `Arreglo aplicado: R3 = ${value} en serie con BZ1.` : `Applied the fix: R3 = ${value} in series with BZ1.`;
};

test('layout --fix applies the kit\'s own fix in one call: DONE, one revision, the line saying what; undo brings the warning back', () => {
  const dir = tempDir('pbiso-kit-first-');
  laidOut(dir, 'two-leds');
  const r = cli(['layout', 'circuits/two-leds', '--fix'], dir);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(lastLine(r.stdout), /^STATUS: DONE · /);
  assert.ok(r.stdout.includes(`\n${appliedText(built.review.fix)}\n`), r.stdout);
  assert.doesNotMatch(r.stdout, /⚠/);
  assert.match(r.stdout, /\nChecked: at rest, 3 program outputs\. Not checked: peaks while switching\.\n/);
  const circuit = JSON.parse(readFileSync(join(dir, 'circuits/two-leds/circuit.json'), 'utf8'));
  const R3 = circuit.parts.find((p) => p.id === 'R3');
  assert.equal(R3.type, 'resistor');
  assert.equal(R3.value, valueText(built.review.fix.value));
  assert.deepEqual(circuit.spec.nets.filter((n) => n.includes('R3.1') || n.includes('R3.2')), [['U1.D10', 'R3.1'], ['R3.2', 'BZ1.1']]);
  const history = cli(['history', 'circuits/two-leds'], dir).stdout.trim().split('\n');
  assert.equal(history.length, 2, 'one revision more');
  assert.match(history.at(-1), /^rev 1 · .* layout \(layout --fix\)/);
  assert.equal(cli(['undo', 'circuits/two-leds'], dir).status, 0);
  const back = cli(['review', 'circuits/two-leds'], dir);
  assert.match(back.stdout, /⚠ warning: U1\.D10 carries 88\.\d mA/);
  assert.match(back.stdout, /\nTo fix it: a /);
  // In Spanish, the same line in its words.
  const es = cli(['layout', 'circuits/two-leds', '--fix', '--dry-run', '--lang', 'es'], dir);
  assert.equal(es.status, 0, es.stdout + es.stderr);
  assert.ok(es.stdout.includes(`\n${appliedText(built.review.fix, 'es')}\nEnsayo: no se guardó nada.\nSTATUS: DONE · `), es.stdout);
});

test('layout --fix --dry-run is a trial of the fix: the same answer, nothing written', () => {
  const dir = tempDir('pbiso-kit-first-');
  laidOut(dir, 'two-leds');
  const files = ['circuit.json', 'history.jsonl'].map((f) => join(dir, 'circuits/two-leds', f));
  const before = files.map((f) => readFileSync(f));
  const r = cli(['layout', 'circuits/two-leds', '--fix', '--dry-run'], dir);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.ok(r.stdout.includes(`\n${appliedText(built.review.fix)}\nTrial: nothing was saved.\nSTATUS: DONE · `), r.stdout);
  assert.deepEqual(files.map((f) => readFileSync(f)), before);
});

test('led-resistor asked for 50 mA, then layout --fix: R1 gets the kit\'s value, DONE', () => {
  const dir = tempDir('pbiso-kit-first-');
  const made = cli(['layout', 'circuits/led', '--recipe', 'led-resistor', '--values', '{"D1":{"current":"50mA"}}'], dir);
  assert.match(lastLine(made.stdout), /^STATUS: WARNINGS · /);
  const value = /To fix it: R1 = (\d+) Ω/.exec(made.stdout)?.[1];
  assert.ok(value, made.stdout);
  for (const lang of ['en', 'es']) {
    const r = cli(['layout', 'circuits/led', '--fix', '--lang', lang, ...(lang === 'en' ? ['--dry-run'] : [])], dir);
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.ok(r.stdout.includes(lang === 'en' ? `\nApplied the fix: R1 = ${value} Ω.\n` : `\nArreglo aplicado: R1 = ${value} Ω.\n`), r.stdout);
    assert.match(lastLine(r.stdout), /^STATUS: DONE · /);
  }
  const circuit = JSON.parse(readFileSync(join(dir, 'circuits/led/circuit.json'), 'utf8'));
  assert.equal(circuit.parts.find((p) => p.id === 'R1').value, value);
  assert.equal(circuit.spec.recipe.values.R1, value, 'the recipe keeps the value chosen');
});

test('layout --fix where there is nothing to do: no hazard (exit 0), no computed fix, a circuit not made by layout, a spec given too', () => {
  const dir = tempDir('pbiso-kit-first-');
  const files = (name) => ['circuit.json', 'history.jsonl'].filter((f) => existsSync(join(dir, 'circuits', name, f))).map((f) => readFileSync(join(dir, 'circuits', name, f)));
  assert.equal(cli(['layout', 'circuits/led', '--recipe', 'led-resistor'], dir).status, 0);
  writeFileSync(join(dir, 'cap.json'), JSON.stringify({ parts: [{ id: 'C1', type: 'capacitor', value: '100u', kind: 'electrolytic', voltage: 16 }], nets: [['C1.+', 'T+'], ['C1.-', 'T-']], supplies: [{ id: 'V1', voltage: 25, positive: 'T+', negative: 'T-' }] }));
  assert.equal(cli(['layout', 'circuits/cap', 'cap.json'], dir).status, 0);
  mkdirSync(join(dir, 'circuits/hand'), { recursive: true });
  writeFileSync(join(dir, 'circuits/hand/circuit.json'), JSON.stringify({ version: 1, board: 'bb400', parts: [{ id: 'R1', type: 'resistor', value: '1k', pins: ['a1', 'a5'] }] }));
  const cases = [
    { name: 'led', args: [], exit: 0, en: /Nothing to fix: as wired, no part of circuits\/led would be damaged\. Nothing was changed\./, es: /Nada que arreglar: tal como está conectado, ningún componente de circuits\/led se dañaría\. No se cambió nada\./ },
    { name: 'cap', args: [], exit: 1, en: /The kit has no computed fix for this\./, es: /El kit no tiene un arreglo calculado para esto\./ },
    { name: 'hand', args: [], exit: 1, en: /circuits\/hand was not made by layout \(it has no spec\): the fix is applied only to circuits made by layout\./, es: /circuits\/hand no se hizo con layout \(no tiene spec\): el arreglo solo se aplica a circuitos hechos con layout\./ },
    { name: 'cap', args: ['cap.json'], exit: 1, en: /Give the fix or a spec \(or values\), not both/, es: /Da el arreglo o un spec \(o valores\), no ambos/ },
    { name: 'led', args: ['--values', '{"R1":"1k"}'], exit: 1, en: /Give the fix or a spec \(or values\), not both/, es: /Da el arreglo o un spec \(o valores\), no ambos/ },
  ];
  for (const c of cases) {
    const before = files(c.name);
    for (const lang of ['en', 'es']) {
      const r = cli(['layout', `circuits/${c.name}`, ...c.args, '--fix', '--lang', lang], dir);
      assert.equal(r.status, c.exit, `${c.name} ${lang}: ${r.stdout}${r.stderr}`);
      assert.match(r.stdout, c[lang]);
      assert.doesNotMatch(r.stdout, /STATUS: (DONE|CHANGES)/);
    }
    assert.deepEqual(files(c.name), before, `${c.name}: nothing changed`);
  }
});

// The hand-written route (when the kit has no computed fix it is the one left): the same change in
// a spec, tried first, in both orders of the parts (R3 just before BZ1, or at the end), as a new
// circuit and on the circuit already built.
for (const atEnd of [false, true]) {
  test(`the fix written by hand, R3 listed ${atEnd ? 'at the end' : 'before BZ1'}: a trial ends DONE and writes nothing; applied, new or on the circuit built, it ends DONE`, () => {
    const fixed = withFix(buzzer, built.review.fix, { atEnd });
    const dir = tempDir('pbiso-kit-first-');
    writeFileSync(join(dir, 'fixed.json'), JSON.stringify(fixed));
    writeFileSync(join(dir, 'spec.json'), JSON.stringify(buzzer));
    const trial = cli(['layout', 'circuits/two-leds', 'fixed.json', '--dry-run'], dir);
    assert.equal(trial.status, 0, trial.stdout + trial.stderr);
    assert.match(trial.stdout, /\nTrial: nothing was saved\.\nSTATUS: DONE/);
    assert.doesNotMatch(trial.stdout, /⚠/);
    assert.ok(!existsSync(join(dir, 'circuits')), 'nothing written: not even the folder');
    const real = cli(['layout', 'circuits/two-leds', 'fixed.json'], dir);
    assert.equal(real.status, 0, real.stdout + real.stderr);
    assert.match(lastLine(real.stdout), /^STATUS: DONE · /);
    assert.match(real.stdout, /\nChecked: at rest, 3 program outputs\. Not checked: peaks while switching\.\n/);
    // The same answer, but the trial's line and the page's.
    const strip = (s, drop) => s.replace(/^Laid out .*$/m, '').split('\n').filter((l) => !drop.test(l)).join('\n');
    assert.equal(strip(trial.stdout, /^Trial: /), strip(real.stdout, /^Page: /));
    // On the circuit as first built (with the warning), as one change.
    laidOut(dir, 'built');
    const before = JSON.parse(readFileSync(join(dir, 'circuits/built/circuit.json'), 'utf8'));
    const again = cli(['layout', 'circuits/built', 'fixed.json'], dir);
    assert.equal(again.status, 0, again.stdout + again.stderr);
    assert.match(lastLine(again.stdout), /^STATUS: DONE · /);
    const after = JSON.parse(readFileSync(join(dir, 'circuits/built/circuit.json'), 'utf8'));
    // The parts away from the change keep their holes.
    const holes = (c, id) => JSON.stringify(c.parts.find((p) => p.id === id)?.pins);
    for (const id of ['U1', 'R1', 'D1']) assert.equal(holes(after, id), holes(before, id), id);
  });
}

test('the redesign tried instead (a transistor driving the buzzer from 5 V) ends WARNINGS in a trial: the buzzer burns with D10 high', () => {
  const dir = tempDir('pbiso-kit-first-');
  writeFileSync(join(dir, 'npn.json'), JSON.stringify(fixture('buzzer-npn.json')));
  const r = cli(['layout', 'circuits/npn', 'npn.json', '--dry-run'], dir);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(lastLine(r.stdout), /^STATUS: WARNINGS · /);
  assert.match(r.stdout, /⚠ warning: BZ1 dissipates 1\.\d+ W, more than its 500 mW: it overheats, with D9 \+ D10 high\.\n/);
  assert.match(r.stdout, /\nTrial: nothing was saved\.\nSTATUS: WARNINGS/);
  assert.ok(!existsSync(join(dir, 'circuits')));
});

test('a trial on an existing circuit leaves its file and its history as they were, in both languages', () => {
  const dir = tempDir('pbiso-kit-first-');
  writeFileSync(join(dir, 'fixed.json'), JSON.stringify(withFix(buzzer, built.review.fix)));
  laidOut(dir, 'two-leds');
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
  assert.deepEqual(r.checked, { rest: true, controls: 0, outputs: 3, notChecked: ['switching'] });
  assert.match(formatReview(r, 'en', { t, formatIssue }), /\nChecked: at rest, 3 program outputs\. Not checked: peaks while switching\.\n/);
  assert.match(formatReview(r, 'es', { t, formatIssue }), /\nRevisado: en reposo, 3 salidas del programa\. No revisado: picos al conmutar\.\n/);
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

test('a trial that ends CHANGES says nothing was created, in both languages; a real layout keeps its wording', () => {
  const left = { ...built, status: 'changes', problems: [{ severity: 'warning', code: 'LAYOUT_WIRE_FAILED', params: { from: '12:a-e', to: '11:f-j' } }] };
  assert.equal(lastLine(text({ ...left, trial: true })), 'STATUS: CHANGES · as tried, the circuit would be left with 1 items marked ✖ above (nothing was created). Try another idea in a trial, or apply this one and fix only those.');
  assert.equal(lastLine(text({ ...left, trial: true }, 'es')), 'STATUS: CHANGES · tal como se ensayó, el circuito quedaría con 1 puntos marcados con ✖ arriba (no se creó nada). Ensaya otra idea, o aplica esta y arregla solo esos.');
  assert.match(lastLine(text(left)), /^STATUS: CHANGES · the circuit was created, with 1 items/);
});
