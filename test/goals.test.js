// Goals in a recipe's values (docs/en/recipes.md, "Goals"): a result asked for instead of a value,
// solved with the kit's simulator into standard values. The series against IEC 60063, the picking,
// the LED against the plain formula, the 555 against the datasheet's formula and the page's pace,
// the errors, the advisory, and that a goal is never kept or solved again.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { E_SERIES, standardValues, nearestStandard, parseValue } from '../src/core/units.js';
import { snapE24 } from '../src/sim/controls.js';
import { expandRecipe, resolveRecipe } from '../src/recipes/index.js';
import { parseGoal } from '../src/recipes/goals.js';
import { choose, TIE } from '../src/recipes/solve.js';
import { ESTIMATES } from '../src/recipes/estimates.js';
import { autoLayout, formatLayout, specFromCircuit, specProblems } from '../src/layout.js';
import { simulate, compile } from '../src/sim/index.js';
import { cycles } from '../src/sim/cycle.js';
import { t, formatIssue } from '../src/index.js';

const layoutOf = (name, values, extra = {}, options = {}) => {
  const r = resolveRecipe({ recipe: name, values, ...extra });
  assert.deepEqual(r.problems, [], JSON.stringify(r.problems));
  return autoLayout(r.spec, options);
};
const lines = (r, lang = 'en') => formatLayout(r, lang, { t, formatIssue }).split('\n');
const line = (r, start, lang) => lines(r, lang).find((l) => l.startsWith(start));
const part = (r, id) => r.circuit.parts.find((p) => p.id === id);

test('the E-series tables are IEC 60063: E6, E12 and E24, one decade each', () => {
  assert.deepEqual(E_SERIES.E6, [1.0, 1.5, 2.2, 3.3, 4.7, 6.8]);
  assert.deepEqual(E_SERIES.E12, [1.0, 1.2, 1.5, 1.8, 2.2, 2.7, 3.3, 3.9, 4.7, 5.6, 6.8, 8.2]);
  assert.deepEqual(E_SERIES.E24, [1.0, 1.1, 1.2, 1.3, 1.5, 1.6, 1.8, 2.0, 2.2, 2.4, 2.7, 3.0, 3.3, 3.6, 3.9, 4.3, 4.7, 5.1, 5.6, 6.2, 6.8, 7.5, 8.2, 9.1]);
  // Each smaller series is part of the next.
  for (const v of E_SERIES.E6) assert.ok(E_SERIES.E12.includes(v) && E_SERIES.E24.includes(v), String(v));
  assert.equal(standardValues('E24', 10, 1e6).length, 5 * 24 + 1);
  assert.deepEqual(standardValues('E6', 1e-6, 1e-4).slice(0, 7), [1e-6, 1.5e-6, 2.2e-6, 3.3e-6, 4.7e-6, 6.8e-6, 1e-5]);
  assert.deepEqual(standardValues('E24', 430, 560), [430, 470, 510, 560]);
});

test('the nearest standard value, from either side and across a decade; the slider snaps with the same table', () => {
  assert.equal(nearestStandard(4600), 4700); // from below
  assert.equal(nearestStandard(4800), 4700); // from above
  assert.equal(nearestStandard(9.6), 10); // up into the next decade
  assert.equal(nearestStandard(0.97), 1);
  assert.equal(nearestStandard(2600, 'E6'), 2200);
  assert.equal(nearestStandard(2800, 'E6'), 3300);
  assert.equal(nearestStandard(8e-6, 'E6'), 6.8e-6);
  for (const v of [0.97, 333, 4600, 47e3 * 1.04, 1.23e6]) assert.equal(snapE24(v), nearestStandard(v, 'E24'), String(v));
});

test('picking: the nearest result wins; between results equally near (within TIE), one with no hazard', () => {
  const at = (result, hazard = false, value = result) => ({ value, result, hazard });
  assert.equal(choose([at(9), at(10.4), at(12)], 10).result, 10.4); // 4 % over beats 10 % under
  assert.equal(choose([at(9.7), at(10.4)], 10).result, 9.7); // 3 % under beats 4 % over
  // 3 % over with a hazard against 3.5 % under without: equally near (half a point apart), the safe one.
  assert.equal(choose([at(10.3, true), at(9.65)], 10).result, 9.65);
  // More than TIE apart: the nearest, hazard or not (the goal is obeyed and the hazard said).
  assert.equal(TIE, 0.01);
  assert.equal(choose([at(10.3, true), at(9.5)], 10).result, 10.3);
  // The advisory: only at or under the target.
  assert.equal(choose([at(19.7), at(21.5), at(18.3)], 20, { under: true }).result, 19.7);
  assert.equal(choose([at(21.5)], 20, { under: true }), null);
});

test('a goal value: a number in its unit, the unit optional; anything else is NaN', () => {
  assert.equal(parseGoal('15mA', 'A'), 0.015);
  assert.equal(parseGoal('15 mA', 'A'), 0.015);
  assert.equal(parseGoal('15m', 'A'), 0.015);
  assert.equal(parseGoal(0.015, 'A'), 0.015);
  assert.equal(parseGoal('1Hz', 'Hz'), 1);
  assert.equal(parseGoal('1.5 kHz', 'Hz'), 1500);
  for (const bad of ['abc', '15mV', '1Hz', '', '-5mA', '0']) assert.ok(Number.isNaN(parseGoal(bad, 'A')), bad);
  for (const bad of [0, -1, Number.NaN, null, {}]) assert.ok(Number.isNaN(parseGoal(bad, 'A')), String(bad));
});

test('led-resistor: the chosen R is within one E24 step of (V − Vf) / I, and its figure is a fresh simulate of what was stored', () => {
  // Vf of a typical red 5 mm LED from its datasheet: 2.0 V at 20 mA (solved apart from the kit's model).
  const VF = 2.0;
  const series = standardValues('E24', 10, 1e6);
  for (const V of [5, 9, 12]) {
    for (const I of [0.01, 0.015, 0.02]) {
      const r = layoutOf('led-resistor', { V1: V, D1: { current: I } });
      assert.equal(r.status, 'done', `${V} V ${I} A`);
      const [s] = r.solved;
      const R = s.chosen.R1;
      const formula = nearestStandard((V - VF) / I);
      assert.ok(Math.abs(series.indexOf(R) - series.indexOf(formula)) <= 1, `${V} V ${I * 1e3} mA: ${R} Ω against ${formula} Ω`);
      assert.equal(parseValue(part(r, 'R1').value), R);
      assert.deepEqual(r.circuit.spec.recipe.values, { V1: V, R1: part(r, 'R1').value }, 'the value chosen is stored, not the goal');
      const fresh = Math.abs(simulate(r.circuit).parts.D1.current);
      assert.ok(Math.abs(fresh / s.result - 1) < 1e-6, `${fresh} against ${s.result}`);
    }
  }
});

test('the Solved line, in both languages: value, simulated figure, how far and on which side, the neighbours', () => {
  const r = layoutOf('led-resistor', { V1: 9, D1: { current: '15mA' } });
  assert.match(line(r, 'Solved:'), /^Solved: R1 = 470 Ω \(E24\) for D1 at 15 mA: 15\.\d mA simulated, \d+ % over \(next values: 430 Ω 16\.\d mA · 510 Ω 14\.\d mA\)$/);
  const es = layoutOf('led-resistor', { V1: 9, D1: { current: '15mA' } }, {}, { lang: 'es' });
  assert.match(line(es, 'Resuelto:', 'es'), /^Resuelto: R1 = 470 Ω \(E24\) para D1 a 15 mA: 15,\d mA simulados, \d+ % por encima \(valores vecinos: 430 Ω 16,\d mA · 510 Ω 14,\d mA\)$/);
  // Before the readings, and no advisory beside it.
  const all = lines(r);
  assert.ok(all.findIndex((l) => l.startsWith('Solved:')) < all.findIndex((l) => l.startsWith('Readings')));
  assert.equal(r.advice, undefined);
  // A state the goal is about is named.
  assert.match(line(layoutOf('npn-switch', { D1: { current: '15mA' } }), 'Solved:'), /for D1 at 15 mA \(S1 pressed\):/);
});

test('15 V at 20 mA: the nearest value is obeyed even though R1 overheats, because no value equally near is safe; one equally near and safe is preferred', () => {
  const r = layoutOf('led-resistor', { V1: 15, D1: { current: '20mA' } });
  const [s] = r.solved;
  // 680 Ω gives 19.3 mA (3.6 % under) and 253 mW in R1; 620 Ω gives 21.1 mA (5.5 % over, 276 mW).
  // Equally near means within TIE (1 percentage point) of the nearest: 620 Ω is 1.9 points further.
  assert.equal(s.chosen.R1, 680);
  assert.equal(s.hazard, true);
  const [lower] = s.neighbours.filter((n) => n.values.R1 === 620);
  assert.ok(Math.abs(lower.result / 0.02 - 1) - Math.abs(s.error) > TIE, 'not equally near');
  assert.equal(r.status, 'warnings');
  assert.ok(r.review.hazards.some((h) => h.params.part === 'R1' && h.code === 'SIM_OVER_POWER'));
  assert.match(line(r, 'Solved:'), /^Solved: R1 = 680 Ω/);
  // 11.7 V at 26 mA: 360 Ω is nearest (3.8 % over) but overheats R1; 390 Ω is 4.0 % under, within a
  // point of it, and overheats nothing: that one.
  const safe = layoutOf('led-resistor', { V1: 11.7, D1: { current: '26mA' } });
  assert.equal(safe.solved[0].chosen.R1, 390);
  const nearest = safe.solved[0].neighbours.find((n) => n.values.R1 === 360);
  assert.ok(Math.abs(nearest.result / 0.026 - 1) < Math.abs(safe.solved[0].error), '360 Ω is nearer');
  assert.ok(Math.abs(safe.solved[0].error) - Math.abs(nearest.result / 0.026 - 1) <= TIE, 'but equally near');
  assert.equal(safe.status, 'done');
});

test('50 mA asked of an LED rated 30 mA at most: obeyed, built, STATUS WARNINGS naming D1, with the Solved line', () => {
  const r = layoutOf('led-resistor', { D1: { current: '50mA' } });
  assert.equal(r.status, 'warnings');
  assert.ok(r.review.hazards.some((h) => h.params.part === 'D1' && h.code === 'SIM_OVER_CURRENT'));
  assert.ok(Math.abs(r.solved[0].error) < 0.05);
  const text = lines(r);
  assert.ok(text.some((l) => l.startsWith('Solved: R1 = ')));
  assert.match(text.at(-1), /^STATUS: WARNINGS/);
});

test('a goal no standard value reaches: the nearest one in range, and the line says it is out of reach', () => {
  const r = layoutOf('led-resistor', { D1: { current: '1uA' } });
  const [s] = r.solved;
  assert.equal(s.chosen.R1, 1e6);
  assert.equal(s.reachable, false);
  assert.equal(r.status, 'done');
  assert.match(line(r, 'Solved:'), /, out of reach \(R1 from 10 Ω to 1 MΩ\): the nearest standard value \(next values: 910 kΩ /);
  const es = layoutOf('led-resistor', { D1: { current: '2A' } }, {}, { lang: 'es' });
  assert.equal(es.solved[0].chosen.R1, 10);
  assert.match(line(es, 'Resuelto:', 'es'), /fuera de alcance \(R1 de 10 Ω a 1 MΩ\): el valor estándar más cercano/);
});

test('555 at 1 Hz and at 10 Hz: within 4 % of the datasheet formula, and the figure within 1.5 % of the page pace', () => {
  for (const [goal, want] of [['1Hz', 1], ['10Hz', 10]]) {
    const r = layoutOf('555-astable', { U1: { frequency: goal } });
    assert.equal(r.status, 'done', goal);
    const [s] = r.solved;
    assert.deepEqual(s.values.map((v) => v.id), ['R2'], 'R2 alone reaches it: C1 stays');
    assert.deepEqual(s.kept.map((v) => v.id), ['R1', 'C1']);
    const values = Object.fromEntries(['R1', 'R2', 'C1'].map((id) => [id, parseValue(part(r, id).value)]));
    const textbook = ESTIMATES['555-astable'].value({ ra: values.R1, rb: values.R2, c: values.C1 });
    assert.ok(Math.abs(s.result / textbook - 1) < 0.04, `${s.result} Hz against the formula's ${textbook}`);
    assert.ok(Math.abs(s.result / want - 1) < 0.1, `${s.result} Hz for ${want}`);
    const page = 1 / cycles(compile(r.circuit).program, { parts: ['D1'], start: 'zero' }).before.D1.period;
    assert.ok(Math.abs(s.result / page - 1) < 0.015, `${s.result} Hz against the page's ${page}`);
    assert.match(line(r, 'Solved:'), /^Solved: R2 = [\d.]+ kΩ \(E24; unchanged: R1 = 1 kΩ, C1 = 10 µF\) for U1 at \d+ Hz: [\d.]+ Hz simulated, /);
  }
  // A frequency under 1 Hz reads in Hz with decimals (a beginner reads Hz), in both languages.
  const one = layoutOf('555-astable', { U1: { frequency: '1Hz' } });
  assert.match(line(one, 'Solved:'), /\(next values: 62 kΩ 1\.12 Hz · 75 kΩ 0\.93 Hz\)/);
  assert.match(formatLayout(one, 'es', { t, formatIssue }), /\(valores vecinos: 62 kΩ 1,12 Hz · 75 kΩ 0,93 Hz\)/);
  assert.doesNotMatch(formatLayout(one, 'en', { t, formatIssue }), /mHz/);
  // Out of R2's reach with C1 as it is: C1 moves too (R2 first, then C1).
  const slow = layoutOf('555-astable', { U1: { frequency: '0.05Hz' } });
  assert.deepEqual(slow.solved[0].values.map((v) => v.id), ['R2', 'C1']);
  assert.ok(Math.abs(slow.solved[0].error) < 0.1);
});

test('FIX_SPEC, in both languages, nothing built: a goal the recipe lacks, a goal that cannot be read, a goal and a value for one knob', () => {
  const cases = [
    [{ R1: { current: '15mA' } }, 'RECIPE_GOAL_UNKNOWN', /R1 has no value field or goal "current" in recipe led-resistor \(its fields: value, tolerance, power; the recipe's goals: D1\.current, as \{"D1":\{"current":"15mA"\}\}\)/, /R1 no tiene el campo ni la meta «current» en la receta led-resistor \(sus campos: value, tolerance, power; las metas de la receta: D1\.current, como/],
    [{ D1: { current: 'abc' } }, 'RECIPE_GOAL_VALUE', /D1\.current = abc cannot be read: give a number in A, such as 15mA\./, /D1\.current = abc no se puede leer: da un número en A, como 15mA\./],
    [{ D1: { current: '15mV' } }, 'RECIPE_GOAL_VALUE', /give a number in A/, /da un número en A/],
    [{ R1: '470', D1: { current: '15mA' } }, 'RECIPE_GOAL_AND_VALUE', /D1\.current chooses R1, and R1 is given too: give one of them \(the goal or the value\)\./, /D1\.current elige R1, y R1 también viene dado: da solo uno de los dos/],
  ];
  for (const [values, code, en, es] of cases) {
    const r = resolveRecipe({ recipe: 'led-resistor', values });
    assert.deepEqual(r.problems.map((p) => p.code), [code], JSON.stringify(values));
    assert.equal(r.spec, undefined, 'nothing to lay out');
    const [enText, esText] = ['en', 'es'].map((lang) => formatLayout(specProblems(r.problems), lang, { t, formatIssue }));
    assert.match(enText, en);
    assert.match(esText, es);
    assert.match(enText.split('\n').at(-1), /^STATUS: FIX_SPEC/);
  }
  // A goal-only entry given a plain value, and a goal on a recipe that has none of its own.
  assert.deepEqual(expandRecipe('555-astable', { U1: '1Hz' }).problems.map((p) => p.code), ['RECIPE_GOAL_UNKNOWN']);
  assert.deepEqual(expandRecipe('divider', { R1: { current: '1mA' } }).problems.map((p) => p.code), ['RECIPE_VALUE_FIELD']);
});

test('the advisory: printed above the rating with nothing changed, absent under it, with a goal, and with results hidden', () => {
  const nine = layoutOf('led-resistor', { V1: 9 });
  assert.equal(nine.status, 'done');
  assert.equal(part(nine, 'R1').value, '330', 'nothing is changed');
  const [a] = nine.advice;
  assert.ok(a.value > a.rated && a.suggest.result <= a.rated);
  assert.match(line(nine, 'Worth checking:'), /^Worth checking: D1 is at 10\d % of its rated 20 mA with R1 = 330 Ω; R1 = \d+ Ω would give 1\d\.\d mA\.$/);
  const es = layoutOf('led-resistor', { V1: 9 }, {}, { lang: 'es' });
  assert.match(line(es, 'Para revisar:', 'es'), /^Para revisar: D1 queda al 10\d % de su nominal de 20 mA con R1 = 330 Ω; con R1 = \d+ Ω daría 1\d,\d mA\.$/);
  assert.match(lines(nine).at(-1), /^STATUS: DONE/);
  assert.equal(layoutOf('led-resistor', { V1: 5 }).advice, undefined);
  assert.equal(layoutOf('led-resistor', { V1: 9, D1: { current: '25mA' } }).advice, undefined, 'a goal given: the Solved line says it');
  for (const page of [{ results: false }, { simulation: false }]) {
    const hidden = layoutOf('led-resistor', { V1: 9 }, { page });
    assert.equal(hidden.advice, undefined, JSON.stringify(page));
    assert.equal(line(hidden, 'Worth checking:'), undefined);
  }
});

test('a goal is not kept: a later layout gives its own values and solves nothing again', () => {
  const r = layoutOf('led-resistor', { V1: 9, D1: { current: '15mA' } });
  assert.equal(part(r, 'R1').value, '470');
  assert.equal(JSON.stringify(r.circuit).includes('current'), false, 'no goal in what is stored');
  // Laid out again as it is: R1 stays 470, nothing solved.
  const again = autoLayout(specFromCircuit(r.circuit), { previous: r.circuit });
  assert.equal(part(again, 'R1').value, '470');
  assert.equal(again.solved, undefined);
  // Laid out again with the recipe and a new supply: the values given, as usual; R1 is not moved for it.
  const later = autoLayout(specFromCircuit(r.circuit, resolveRecipe({ recipe: 'led-resistor', values: { V1: 12, R1: '470' } }).spec), { previous: r.circuit });
  assert.equal(part(later, 'R1').value, '470');
  assert.equal(later.solved, undefined);
});
