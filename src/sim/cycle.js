// How long a cycle lasts, before and after a change (stage and video; docs/en/making-a-video.md,
// "The payoff shows"): a circuit run as the page runs it (its pace, sim/pace.js), a control set, and
// the cycles measured on the readings. A video about "what if R1 were bigger" must show at least
// one whole cycle after the set; this says how many seconds of video one takes, so whoever writes the
// timeline can hold the shot that long (scripts/render-frames.js --parts --what-if, and the
// recording's own check). The physics is the simulation's; nothing here changes it.
//
//   cycles(program, { sets: [{ id, field, value }], start, parts }) →
//     { perSecond, before: { [id]: cycle }, after: { [id]: cycle } }
//   cycle: { period, on?, off? } in simulated s (on/off for an LED: the time lit and dark), null when
//   no two cycles were seen within the time allowed.

import { createEngine } from './engine.js';
import { paceOf } from './pace.js';

const MAX_STEPS = 200_000; // per side: a slow circuit stops there and says it saw no cycle
const CYCLES = 3; // risings to see (two whole cycles)

// The rising and falling times of `v` through the level halfway between its extremes.
function edges(samples) {
  let lo = Infinity;
  let hi = -Infinity;
  for (const [, v] of samples) {
    lo = Math.min(lo, v);
    hi = Math.max(hi, v);
  }
  if (!(hi - lo > 1e-6 * Math.max(1, Math.abs(hi)))) return { up: [], down: [] };
  const mid = (lo + hi) / 2;
  const up = [];
  const down = [];
  for (let k = 1; k < samples.length; k++) {
    const [t0, a] = samples[k - 1];
    const [t1, b] = samples[k];
    const at = t0 + ((mid - a) / (b - a || 1)) * (t1 - t0);
    if (a < mid && b >= mid) up.push(at);
    else if (a >= mid && b < mid) down.push(at);
  }
  return { up, down };
}

// The last whole cycle of a part's samples: its period and, given `lit`, the time high and low.
function cycleOf(samples, lit) {
  const { up, down } = edges(samples);
  if (up.length < 2) return null;
  const end = up.at(-1);
  const start = up.at(-2);
  const period = end - start;
  if (!lit) return { period };
  const fall = down.find((t) => t > start && t < end);
  return fall == null ? { period } : { period, on: fall - start, off: end - fall };
}

// Run until every watched reading has shown CYCLES risings since `from`, or the steps run out.
function run(engine, h, watch, from) {
  const samples = Object.fromEntries(watch.map((w) => [w.key, []]));
  const seen = () => watch.every((w) => edges(samples[w.key]).up.length >= CYCLES);
  for (let n = 0; n < MAX_STEPS; n++) {
    let ok = engine.step(h);
    for (let k = 0; !ok && k < 4; k++) ok = engine.step(h / 2 ** (k + 1));
    if (!ok) break;
    const r = engine.read();
    for (const w of watch) {
      const v = r.parts[w.id]?.[w.field];
      if (typeof v === 'number') samples[w.key].push([engine.time - from, v]);
    }
    if (n % 500 === 499 && seen()) break;
  }
  return Object.fromEntries(watch.map((w) => [w.id, cycleOf(samples[w.key], w.field === 'brightness')]));
}

// `parts`: the ids to measure (default: every LED by its brightness and every capacitor by its voltage).
export function cycles(program, { sets = [], start = 'dc', parts = null } = {}) {
  const engine = createEngine(program);
  const program_ = Boolean(engine.hasProgram?.());
  const pace = paceOf(engine.timeConstants(), engine.periods(), program_);
  if (!(pace.h > 0)) return { perSecond: 0, before: {}, after: {} };
  let h = pace.h;
  engine.start(start, h);
  const kinds = Object.fromEntries((program.devices ?? []).map((d) => [d.id, d.type]));
  const first = engine.read();
  const ids = parts ?? Object.keys(first.parts).filter((id) => kinds[id] === 'led' || kinds[id] === 'capacitor');
  const watch = ids.map((id) => {
    const r = first.parts[id] ?? {};
    const field = typeof r.brightness === 'number' ? 'brightness' : 'voltage';
    return { id, field, key: `${id}|${field}` };
  });
  const before = run(engine, h, watch, engine.time);
  for (const s of sets) engine.set(s.id, s.field, s.value);
  // As the page does after a set: the same speed of time, a step never too long for the new constants.
  const now = paceOf(engine.timeConstants(), engine.periods(), program_);
  if (now.h > 0) h = now.periodic ? now.h : Math.min(h, now.h);
  const after = run(engine, h, watch, engine.time);
  return { perSecond: pace.perSecond, before, after };
}

const known = new Map(); // a program and its sets → cycles: pages of one circuit are made again and again

// The cycles a comparing oscilloscope announces (a timeline's probe with `compare`): for each set
// that changes a number while such a probe is on, the probed part's period before the first set and
// after each, in simulated s, as { [step index]: { before, after } }. Node only in practice (it runs
// the circuit for a few seconds of simulated time); the page shows the figure once the set's control
// has arrived (page/client/live.js).
export function compareCycles(program, steps, start = 'dc') {
  const out = {};
  const sets = [];
  let probe = null;
  steps.forEach((s, k) => {
    if (s.do === 'probe') probe = s.off ? null : s.compare && s.part ? s : null;
    if (s.do !== 'set' || typeof s.value !== 'number') return;
    sets.push({ id: s.part, field: s.field, value: s.value });
    if (!probe) return;
    const key = JSON.stringify([program, sets, probe.part, start]);
    if (!known.has(key)) known.set(key, cycles(program, { sets: sets.slice(), start, parts: [probe.part] }));
    const r = known.get(key);
    const before = r.before[probe.part]?.period;
    const after = r.after[probe.part]?.period;
    if (before > 0 && after > 0) out[k] = { before, after };
  });
  return out;
}
