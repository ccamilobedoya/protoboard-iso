// Goals: a result a recipe offers instead of a value (docs/en/recipes.md, "Goals"). A value entry
// declares, as data, which goal its part offers, which value(s) the kit may move to reach it, what
// to read from the simulator and under which state:
//
//   D1: { field: 'color', goals: { current: { set: 'R1', reading: 'current' } } }
//   U1: { goals: { frequency: { set: ['R2', 'C1'], measure: 'cycle', of: 'D1', estimate: '555-astable' } } }
//
//   set       the knob, or knobs in the order they are moved (the first alone, then with the next…)
//   reading   a field of the part's DC reading (`current`), read with `when` set
//   measure   'cycle': the frequency of `of`'s cycle, measured over time (needs `estimate`)
//   estimate  a closed form of estimates.js, to rank the candidates before measuring them
//   when      controls set first ({ S1: { pressed: true } }, { RV1: { position: 1 } }): the state
//             the goal is about (a button held, a potentiometer at its worst-case end)
//   range     { R1: ['100', '100k'] }: the decades a knob is searched in, when not its type's
//
// This module only reads them (no simulator): expandRecipe takes the goals out of the values here;
// solve.js finds the standard values that reach them.

import { parseValue } from '../core/units.js';

// What each goal is, by its name: its unit, an example a message can show, and the field of the
// part's model that holds its rated value (the advisory, when a part runs above it).
export const QUANTITIES = {
  current: { unit: 'A', example: '15mA', rated: 'ratedCurrent' },
  frequency: { unit: 'Hz', example: '1Hz' },
};

const asList = (x) => (Array.isArray(x) ? x : [x]);

// Every goal a recipe declares, in the order of its values: [{ id, goal, set: [ids], unit, example, … }].
export function goalsOf(recipe) {
  return Object.entries(recipe.values).flatMap(([id, rule]) => Object.entries(rule.goals ?? {}).map(([goal, g]) => ({ id, goal, ...structuredClone(g), set: asList(g.set), unit: QUANTITIES[goal]?.unit, example: QUANTITIES[goal]?.example })));
}

// "15mA", "15 mA", 0.015 → 0.015 for a goal in A; NaN for anything else ("abc", "15mV", 0, -1).
// The unit may be left out; another unit is refused rather than read as this one.
const NUMBER = /^(?:\d+(?:[.,]\d+)?\s*[pnuµμmkKM]?|\d+[pnuµμmkKMR]\d+)$/;
export function parseGoal(input, unit) {
  if (typeof input === 'number') return Number.isFinite(input) && input > 0 ? input : NaN;
  if (typeof input !== 'string') return NaN;
  let text = input.trim();
  if (unit && text.toLowerCase().endsWith(unit.toLowerCase())) text = text.slice(0, -unit.length).trim();
  if (!NUMBER.test(text)) return NaN;
  const v = parseValue(text);
  return v > 0 ? v : NaN;
}

// The goals asked in a recipe's values, taken out of them: { goals: [...], values, problems }.
// `values` keeps what is not a goal (an entry left empty goes). Problems: a goal value that cannot
// be read, and a goal whose knob is also given a value (or moved by another goal) in the same call.
export function takeGoals(recipe, values) {
  const goals = [];
  const rest = {};
  const problems = [];
  for (const [id, given] of Object.entries(values ?? {})) {
    const declared = recipe.values[id]?.goals;
    if (!declared || !given || typeof given !== 'object') {
      rest[id] = given;
      continue;
    }
    const fields = {};
    for (const [field, v] of Object.entries(given)) {
      const g = declared[field];
      if (!g) {
        fields[field] = v;
        continue;
      }
      const { unit, example } = QUANTITIES[field] ?? {};
      const target = parseGoal(v, unit);
      if (Number.isNaN(target)) problems.push({ severity: 'error', code: 'RECIPE_GOAL_VALUE', params: { id, goal: field, value: String(v), unit: unit ?? '', example: example ?? '' } });
      else goals.push({ id, goal: field, target, ...structuredClone(g), set: asList(g.set), unit });
    }
    if (Object.keys(fields).length) rest[id] = fields;
  }
  const moved = new Map();
  for (const g of goals) {
    for (const knob of g.set) {
      const field = recipe.values[knob]?.field ?? 'value';
      const v = rest[knob];
      const explicit = v !== undefined && (typeof v !== 'object' || v === null || field in v);
      if (explicit) problems.push({ severity: 'error', code: 'RECIPE_GOAL_AND_VALUE', params: { id: g.id, goal: g.goal, knob } });
      else if (moved.has(knob)) problems.push({ severity: 'error', code: 'RECIPE_GOALS_SHARE', params: { id: g.id, goal: g.goal, knob, other: moved.get(knob) } });
      moved.set(knob, `${g.id}.${g.goal}`);
    }
  }
  return { goals, values: rest, problems };
}

// The goals of a recipe as one short list for a message: "D1.current, U1.frequency".
export const goalNames = (recipe) => goalsOf(recipe).map((g) => `${g.id}.${g.goal}`).join(', ');

// The first goal of a recipe as it is asked: {"D1":{"current":"15mA"}}.
export function goalExample(recipe) {
  const g = goalsOf(recipe)[0];
  return g ? JSON.stringify({ [g.id]: { [g.goal]: g.example } }) : '';
}
