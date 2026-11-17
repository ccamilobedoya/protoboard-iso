// The standard values that reach a recipe's goal (goals.js), found with the kit's own simulator so
// the figure layout reports is the one `simulate` and the page show (docs/en/recipes.md, "Goals").
//
//   solveGoals(circuit, goals) → { solved: [{ id, goal, target, values, result, error, chosen, … }], unsolved: [goal] }
//   adviseGoals(circuit, goals) → [{ id, goal, value, rated, knob, suggest }]: parts above their rating
//
// A one-knob DC goal sweeps the knob's series in its range (engine.set on a resistor, under a
// millisecond each). A goal with an estimate (estimates.js), as one measured over time, is ranked
// by it first and only its best candidates are measured. Knobs are moved in their declared order:
// the first alone, and the next one too only when the first cannot reach the goal in its range.
// The value chosen is the one whose result is nearest to the goal; between results equally near
// (TIE), one that overstresses nothing: the hazard review's own check (sim/index.js checkHazards: at
// rest and with each control operated), not only the goal's state. A goal that overstresses a part
// is obeyed (the hazard review says so); a goal no standard value reaches gets the nearest one,
// marked out of reach.

import { parseValue, standardValues, valueText } from '../core/units.js';
import { compile, createEngine, checkHazards, controlStates, engineHazards } from '../sim/index.js';
import { periodOf } from '../sim/cycle.js';
import { ESTIMATES } from './estimates.js';
import { QUANTITIES } from './goals.js';

// Two results are equally near when their relative errors differ by at most this (one percentage
// point; an E24 step is about ten).
export const TIE = 0.01;
// The series a knob takes by its type, and the decades it is searched in unless the goal says.
const SERIES = { resistor: 'E24', capacitor: 'E6' };
const RANGES = { resistor: [10, 1e6], capacitor: [1e-9, 1e-3] };
// A goal measured over time: candidates measured (the estimate's best and its neighbours), steps per
// expected period (within a few tenths of a percent of the page's pace, ~50 ms each) and the
// longest run, in expected periods.
const MEASURED_MORE = 2;
const STEPS_PER_PERIOD = 500;
const PERIODS_MAX = 12;

const err = (result, target) => result / target - 1;

// The knobs of a goal: each one's part, series, range and current value.
function knobsOf(circuit, goal) {
  return goal.set.map((id) => {
    const part = circuit.parts.find((p) => p.id === id);
    const series = SERIES[part?.type];
    if (!series) throw new Error(`goal ${goal.id}.${goal.goal}: ${id} is not a resistor or a capacitor`);
    const [lo, hi] = goal.range?.[id] ? goal.range[id].map(parseValue) : RANGES[part.type];
    return { id, type: part.type, series, lo, hi, list: standardValues(series, lo, hi), current: parseValue(part.value) };
  });
}

const withValues = (circuit, values) => ({ ...circuit, parts: circuit.parts.map((p) => (values[p.id] != null ? { ...p, value: valueText(values[p.id]) } : p)) });

// A started engine for the circuit with these values (base units, by id) and the goal's state.
function engineFor(circuit, values, goal, h) {
  const compiled = compile(withValues(circuit, values));
  if (compiled.fatal) return null;
  const e = createEngine(compiled.program);
  if (!e.start(goal.measure === 'cycle' && circuit.page?.start === 'zero' ? 'zero' : 'dc', h)) return null;
  for (const [id, fields] of Object.entries(goal.when ?? {})) for (const [field, v] of Object.entries(fields)) e.set(id, field, v);
  return { e, program: compiled.program };
}

// Whether the circuit with these values would damage a part, as the review says it.
const damages = (circuit, values) => checkHazards(withValues(circuit, values)).hazards.length > 0;
const readingOf = (reading, goal) => Math.abs(reading?.parts[goal.id]?.[goal.reading] ?? NaN);

// Every value of a one-knob DC goal, simulated: [{ value, result, hazard }] in the series' order.
// A resistor is changed in place (sweepResistor); anything else is compiled again with its new value.
function sweep(circuit, goal, knob) {
  const start = engineFor(circuit, {}, goal);
  if (!start) return null;
  const read = (e) => readingOf(e.read(), goal);
  if (knob.type === 'resistor') {
    const fallback = (value) => {
      const run = engineFor(circuit, { [knob.id]: value }, goal);
      return run && { result: read(run.e), hazard: damages(circuit, { [knob.id]: value }) };
    };
    return sweepResistor(start.e, createEngine(compile(circuit).program), knob.id, knob.list, read, { fallback });
  }
  const out = [];
  for (const value of knob.list) {
    const run = engineFor(circuit, { [knob.id]: value }, goal);
    if (run) out.push({ value, result: read(run.e), hazard: damages(circuit, { [knob.id]: value }) });
  }
  return out.filter((c) => Number.isFinite(c.result));
}

// Every value of the resistor `id`, set in place on `engine` (read(engine) is the result) and on
// `check`, an engine of the same program never started, for the hazard review's own check (at rest,
// with each control operated, with each program output high). Shared by the goals and the fix of a
// hazard (src/fix.js). `hazards: false` leaves `hazard` out (the fix checks only the values it
// picks); `fallback(value)` → { result, hazard } | null when a value cannot be set in place.
export function sweepResistor(engine, check, id, list, read, { hazards = true, fallback = null } = {}) {
  const states = hazards ? controlStates(check.program(), check) : null;
  const out = [];
  for (const value of list) {
    if (!engine.set(id, 'resistance', value)) {
      const other = fallback?.(value);
      if (other) out.push({ value, ...other });
      continue;
    }
    const result = read(engine);
    if (!hazards) out.push({ value, result });
    else if (check.set(id, 'resistance', value)) out.push({ value, result, hazard: engineHazards(check, states).hazards.length > 0 });
    else out.push({ value, result, hazard: fallback?.(value)?.hazard ?? true });
  }
  return out.filter((c) => Number.isFinite(c.result));
}

// The nearest of the candidates to the target; between candidates equally near (TIE), one with no
// hazard first. `under`: only results at or below the target (the advisory's rated value).
export function choose(candidates, target, { under = false } = {}) {
  const pool = under ? candidates.filter((c) => c.result <= target * (1 + 1e-9)) : candidates;
  if (!pool.length) return null;
  const best = Math.min(...pool.map((c) => Math.abs(err(c.result, target))));
  const near = pool.filter((c) => Math.abs(err(c.result, target)) <= best + TIE);
  const safe = near.filter((c) => !c.hazard);
  const from = safe.length ? safe : near;
  return from.reduce((a, b) => (Math.abs(err(b.result, target)) < Math.abs(err(a.result, target)) ? b : a));
}

// The figure a measured goal reads, with these values: the frequency of `of`'s cycle.
function measureCycle(circuit, goal, values, expected) {
  const h = 1 / expected / STEPS_PER_PERIOD;
  const run = engineFor(circuit, values, goal, h);
  if (!run) return null;
  const period = periodOf(run.e, goal.of, h, PERIODS_MAX * STEPS_PER_PERIOD);
  return period > 0 ? { result: 1 / period, hazard: damages(circuit, values) } : null;
}

// Every combination of the moving knobs' values (the others at their current value).
function grid(knobs, moving) {
  let out = [Object.fromEntries(knobs.map((k) => [k.id, k.current]))];
  for (const k of moving) out = out.flatMap((base) => k.list.map((v) => ({ ...base, [k.id]: v })));
  return out;
}

// A goal ranked by its estimate and measured by the simulator, knob after knob.
function solveEstimated(circuit, goal, knobs) {
  const estimate = ESTIMATES[goal.estimate];
  if (!estimate) throw new Error(`goal ${goal.id}.${goal.goal}: no estimate "${goal.estimate}"`);
  const fixed = Object.fromEntries(Object.values(estimate.roles).map((id) => [id, parseValue(circuit.parts.find((p) => p.id === id)?.value)]));
  const estimateOf = (values) => estimate.value(Object.fromEntries(Object.entries(estimate.roles).map(([role, id]) => [role, values[id] ?? fixed[id]])));
  for (let k = 1; k <= knobs.length; k++) {
    const moving = knobs.slice(0, k);
    const options = grid(knobs, moving).map((values) => ({ values, estimate: estimateOf(values) }));
    const estimates = options.map((o) => o.estimate);
    const reachable = goal.target >= Math.min(...estimates) && goal.target <= Math.max(...estimates);
    if (!reachable && k < knobs.length) continue;
    // The estimate's best; between options equally near, the one that moves the later knobs least.
    const best = Math.min(...options.map((o) => Math.abs(err(o.estimate, goal.target))));
    const moved = (o) => moving.slice(1).reduce((s, kn) => s + Math.abs(Math.log(o.values[kn.id] / kn.current)), 0);
    const pick = options.filter((o) => Math.abs(err(o.estimate, goal.target)) <= best + TIE).sort((a, b) => moved(a) - moved(b))[0];
    // Measured: the pick and its neighbours along the first knob, then on while the nearest is at the edge.
    const first = knobs[0];
    const index = first.list.indexOf(pick.values[first.id]);
    const measured = new Map();
    const at = (i) => {
      if (i < 0 || i >= first.list.length) return null;
      if (!measured.has(i)) {
        const values = { ...pick.values, [first.id]: first.list[i] };
        const m = measureCycle(circuit, goal, values, estimateOf(values));
        measured.set(i, m && { ...m, values, index: i });
      }
      return measured.get(i);
    };
    at(index - 1);
    at(index);
    at(index + 1);
    for (let more = 0; more < MEASURED_MORE; more++) {
      const c = choose([...measured.values()].filter(Boolean), goal.target);
      if (!c) break;
      const lo = Math.min(...measured.keys());
      const hi = Math.max(...measured.keys());
      if (c.index === lo && lo > 0) at(lo - 1);
      else if (c.index === hi && hi < first.list.length - 1) at(hi + 1);
      else break;
    }
    const chosen = choose([...measured.values()].filter(Boolean), goal.target);
    if (!chosen) return null;
    const neighbours = [at(chosen.index - 1), at(chosen.index + 1)].filter(Boolean);
    return record(circuit, goal, knobs, moving, chosen, neighbours, reachable, { kept: Object.values(estimate.roles).filter((id) => !moving.some((kn) => kn.id === id)), fixed });
  }
  return null;
}

function record(circuit, goal, knobs, moving, chosen, neighbours, reachable, { kept = [], fixed = {} } = {}) {
  const values = Object.fromEntries(moving.map((kn) => [kn.id, chosen.values[kn.id]]));
  return {
    id: goal.id,
    goal: goal.goal,
    target: goal.target,
    unit: goal.unit,
    ...(goal.when && { when: goal.when }),
    values: moving.map((kn) => ({ id: kn.id, value: chosen.values[kn.id], series: kn.series, type: kn.type })),
    ...(kept.length && { kept: kept.map((id) => ({ id, value: fixed[id] ?? knobs.find((kn) => kn.id === id)?.current, type: circuit.parts.find((p) => p.id === id)?.type })) }),
    result: chosen.result,
    error: err(chosen.result, goal.target),
    hazard: chosen.hazard,
    reachable,
    ...(!reachable && { range: moving.map((kn) => ({ id: kn.id, lo: kn.lo, hi: kn.hi, type: kn.type })) }),
    neighbours: neighbours.map((n) => ({ values: Object.fromEntries(moving.map((kn) => [kn.id, n.values[kn.id]])), result: n.result })),
    measure: goal.measure === 'cycle' ? 'cycle' : 'dc',
    chosen: values,
  };
}

// One goal: its record, or null when the circuit cannot be simulated.
function solveGoal(circuit, goal) {
  const knobs = knobsOf(circuit, goal);
  if (goal.estimate) return solveEstimated(circuit, goal, knobs);
  const knob = knobs[0];
  const all = sweep(circuit, goal, knob);
  if (!all?.length) return null;
  const chosen = choose(all, goal.target);
  const results = all.map((c) => c.result);
  const reachable = goal.target >= Math.min(...results) * (1 - 1e-9) && goal.target <= Math.max(...results) * (1 + 1e-9);
  const i = all.indexOf(chosen);
  const wrap = (c) => c && { ...c, values: { [knob.id]: c.value } };
  return record(circuit, goal, knobs, [knob], wrap(chosen), [all[i - 1], all[i + 1]].filter(Boolean).map(wrap), reachable);
}

// The goals asked of a circuit laid out from a recipe, each solved: its record, with `chosen`, the
// values in base units ({ R1: 470 }; layout writes them as text); a goal that cannot be simulated
// is left unsolved.
export function solveGoals(circuit, goals) {
  const solved = [];
  const unsolved = [];
  for (const goal of goals) {
    const r = solveGoal(circuit, goal);
    if (r) solved.push(r);
    else unsolved.push(goal);
  }
  return { solved, unsolved };
}

// The advisory (never an adjustment): each one-knob DC goal of the recipe whose part runs above its
// rated value as built, with the standard value whose result is nearest to the rating without
// passing it. Empty when nothing is above its rating.
export function adviseGoals(circuit, goals) {
  const out = [];
  for (const goal of goals) {
    const ratedField = QUANTITIES[goal.goal]?.rated;
    if (!ratedField || goal.estimate || goal.set.length !== 1 || !goal.reading) continue;
    const start = engineFor(circuit, {}, goal);
    if (!start) continue;
    const rated = start.program.devices.find((d) => d.id === goal.id)?.params?.model?.[ratedField];
    const value = readingOf(start.e.read(), goal);
    if (!(rated > 0) || !(value > rated * (1 + 1e-6))) continue;
    const [knob] = knobsOf(circuit, goal);
    const all = sweep(circuit, goal, knob);
    const suggest = all && choose(all, rated, { under: true });
    if (!suggest) continue;
    out.push({ id: goal.id, goal: goal.goal, unit: goal.unit, value, rated, ...(goal.when && { when: goal.when }), knob: { id: knob.id, value: knob.current, type: knob.type }, suggest: { value: suggest.value, result: suggest.result } });
  }
  return out;
}
