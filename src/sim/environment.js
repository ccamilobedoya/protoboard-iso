// The environment (sensors, S0; docs/en/environment.md): the magnitudes of the world a circuit's
// sensors read (light, temperature, distance…), shared by every part that senses them. A sensor is a
// function from one of these to something electrical; the learner changes the magnitude, never the
// sensor. No imports, so the page bundles it (src/node/bundle.js).
//
//   FIELDS                         the registry: one line per magnitude
//   programValue(program, t)       a program's value at t seconds (pure)
//   createEnvironment(spec, extra) → { at(t), value(f), set(f, v), resume(f), fields(), … }
//   environmentControls(env)       its controls, shaped like ../controls.js's (id 'environment')
//   rangeProblem(field, range)      why a slider / indicator range is not usable (null when it is)
//   environmentIssues(circuit)     what `check` says about the circuit's `environment`
//   envText(field, value, decimal) a value as the page writes it ("300 lx", "25 °C"); null for a switch
//
// A field of the circuit (`environment` at the top level) is a number, or { value?, program?, range? }:
// `range` [min, max] is the span the slider and the indicator show (inside the field's limit; the
// registry's slider range when it is left out). A program changes it with time (toggle, cycle, ramp, keyframes), evaluated each time step as a
// signal generator's wave is (engine.js). A learner's set pauses it at that value; resume starts it
// again from its own beginning at that moment.

// kind 'level': a slider (min…max the slider's range, `limit` what the value may be at all);
// 'switch': off or on (0 or 1), a button.
const SWITCH = { unit: '', min: 0, max: 1, limit: [0, 1], scale: 'linear', default: 0, kind: 'switch' };
export const FIELDS = {
  light: { unit: 'lx', min: 0.1, max: 10000, limit: [0, 1e6], scale: 'log', default: 300, kind: 'level' },
  temperature: { unit: '°C', min: -20, max: 100, limit: [-55, 150], scale: 'linear', step: 1, default: 25, kind: 'level' },
  humidity: { unit: '%RH', min: 0, max: 100, limit: [0, 100], scale: 'linear', step: 1, default: 50, kind: 'level' },
  moisture: { unit: '%', min: 0, max: 100, limit: [0, 100], scale: 'linear', step: 1, default: 30, kind: 'level' },
  water: { unit: 'mm', min: 0, max: 40, limit: [0, 1000], scale: 'linear', step: 1, default: 0, kind: 'level' },
  rain: { ...SWITCH },
  distance: { unit: 'cm', min: 2, max: 400, limit: [0, 1000], scale: 'linear', step: 1, default: 50, kind: 'level' },
  field: { unit: 'G', min: -500, max: 500, limit: [-10000, 10000], scale: 'linear', step: 1, default: 0, kind: 'level' },
  motion: { ...SWITCH },
  touch: { ...SWITCH },
  vibration: { ...SWITCH },
  sound: { unit: 'dB', min: 30, max: 110, limit: [0, 140], scale: 'linear', step: 1, default: 40, kind: 'level' },
  tilt: { ...SWITCH },
  angle: { unit: '°', min: 0, max: 360, limit: [0, 360], scale: 'linear', step: 1, default: 0, kind: 'level' },
  reflectance: { unit: '%', min: 0, max: 100, limit: [0, 100], scale: 'linear', step: 1, default: 80, kind: 'level' },
  beam: { ...SWITCH },
};

export const PROGRAM_KINDS = ['toggle', 'cycle', 'ramp', 'keyframes'];
export const CYCLE_SHAPES = ['sine', 'square', 'triangle'];
export const MAX_POINTS = 1000; // keyframes in one program (src/limits.js, envPoints)

const num = (v) => typeof v === 'number' && Number.isFinite(v);
// Why a range [min, max] cannot be the span of a field's slider and indicator, or null: not two
// numbers going up, a switch (nothing to span), outside the field's limit, or at 0 or below on a log
// scale.
export function rangeProblem(field, range) {
  const f = FIELDS[field];
  if (!f || f.kind === 'switch') return 'switch';
  if (!Array.isArray(range) || range.length !== 2 || !range.every(num) || !(range[0] < range[1])) return 'order';
  if (range[0] < f.limit[0] || range[1] > f.limit[1]) return 'limit';
  if (f.scale === 'log' && !(range[0] > 0)) return 'log';
  return null;
}
const clamp = (field, v) => {
  const [lo, hi] = FIELDS[field].limit;
  return Math.min(hi, Math.max(lo, v));
};
// A switch takes true/false too.
const asNumber = (v) => (typeof v === 'boolean' ? Number(v) : Number(v));

// A program's value at t seconds of its own time (t < 0 counts as 0). The shapes of `cycle` are the
// signal generator's (generator.js): a sine starts in the middle rising, a square high for the first
// half, a triangle at the bottom.
export function programValue(program, t) {
  const time = Math.max(0, Number(t) || 0);
  const p = program ?? {};
  switch (p.kind) {
    case 'toggle': {
      const period = p.on + p.off;
      if (!(period > 0)) return p.high;
      return time % period < p.on ? p.high : p.low;
    }
    case 'cycle': {
      const u = p.period > 0 ? (time / p.period) % 1 : 0;
      const [mid, amp] = [(p.min + p.max) / 2, (p.max - p.min) / 2];
      if (p.shape === 'square') return u < 0.5 ? p.max : p.min;
      if (p.shape === 'triangle') return mid + amp * (u < 0.5 ? 4 * u - 1 : 3 - 4 * u);
      return mid + amp * Math.sin(2 * Math.PI * u);
    }
    case 'ramp':
      if (!(p.seconds > 0) || time >= p.seconds) return p.to;
      return p.from + ((p.to - p.from) * time) / p.seconds;
    case 'keyframes': {
      const pts = p.points ?? [];
      if (!pts.length) return NaN;
      const span = pts.at(-1)[0];
      const k = p.loop && span > 0 ? time % span : time;
      if (k <= pts[0][0]) return pts[0][1];
      for (let i = 1; i < pts.length; i++) {
        const [[t0, v0], [t1, v1]] = [pts[i - 1], pts[i]];
        if (k <= t1) return t1 > t0 ? v0 + ((v1 - v0) * (k - t0)) / (t1 - t0) : v1;
      }
      return pts.at(-1)[1];
    }
    default:
      return NaN;
  }
}

// How long a program takes to show what it does (s): the page's step and pace follow it when
// nothing else in the circuit changes with time (sim/pace.js).
export function programSpan(p) {
  if (p.kind === 'toggle') return p.on + p.off;
  if (p.kind === 'cycle') return p.period;
  if (p.kind === 'ramp') return p.seconds;
  return p.points?.at(-1)?.[0] ?? 0;
}

// What is wrong with a program, as [code, params] pairs ([] when it can run).
function programProblems(field, p) {
  const bad = (what) => [['ENV_BAD_PROGRAM', { field, what }]];
  if (!p || typeof p !== 'object' || Array.isArray(p) || !PROGRAM_KINDS.includes(p.kind)) return bad(`kind (${PROGRAM_KINDS.join(', ')})`);
  const values = [];
  if (p.kind === 'toggle') {
    if (![p.high, p.low, p.on, p.off].every(num) || p.on < 0 || p.off < 0 || !(p.on + p.off > 0)) return bad('toggle: high, low, on, off (seconds ≥ 0)');
    values.push(p.high, p.low);
  } else if (p.kind === 'cycle') {
    if (!CYCLE_SHAPES.includes(p.shape ?? 'sine') || ![p.period, p.min, p.max].every(num) || !(p.period > 0)) return bad('cycle: shape, period > 0, min, max');
    values.push(p.min, p.max);
  } else if (p.kind === 'ramp') {
    if (![p.from, p.to, p.seconds].every(num) || p.seconds < 0) return bad('ramp: from, to, seconds ≥ 0');
    values.push(p.from, p.to);
  } else {
    if (!Array.isArray(p.points) || !p.points.length) return bad('keyframes: points [[t, v], …]');
    if (p.points.length > MAX_POINTS) return [['ENV_TOO_LARGE', { field, size: p.points.length, limit: MAX_POINTS }]];
    let last = -Infinity;
    for (const pt of p.points) {
      if (!Array.isArray(pt) || pt.length !== 2 || !pt.every(num) || pt[0] < last || pt[0] < 0) return bad('keyframes: points [[t, v], …], times from 0 going up');
      last = pt[0];
      values.push(pt[1]);
    }
    if (p.loop != null && typeof p.loop !== 'boolean') return bad('keyframes: loop true or false');
  }
  const [lo, hi] = FIELDS[field].limit;
  const out = values.find((v) => v < lo || v > hi);
  return out === undefined ? [] : [['ENV_OUT_OF_RANGE', { field, value: String(out), lo: String(lo), hi: String(hi) }]];
}

// The circuit's `environment`, checked: unknown fields, values out of their limit, programs that
// cannot run, ranges the slider cannot span. Each issue is an error for `check`; the simulation leaves such a field out (or clamps
// its value) and runs.
export function environmentIssues(circuit) {
  const spec = circuit?.environment;
  if (spec == null) return [];
  const error = (code, params) => ({ severity: 'error', code, params });
  if (typeof spec !== 'object' || Array.isArray(spec)) return [error('ENV_SHAPE', { field: '—' })];
  const out = [];
  for (const [field, entry] of Object.entries(spec)) {
    if (!Object.hasOwn(FIELDS, field)) {
      out.push(error('ENV_UNKNOWN_FIELD', { field: field.slice(0, 40), fields: Object.keys(FIELDS).join(', ') }));
      continue;
    }
    const [lo, hi] = FIELDS[field].limit;
    const scalar = num(entry) || typeof entry === 'boolean';
    const object = Boolean(entry) && typeof entry === 'object' && !Array.isArray(entry);
    if (!scalar && !(object && Object.keys(entry).every((k) => ['value', 'program', 'range'].includes(k)) && (entry.value == null || num(entry.value) || typeof entry.value === 'boolean'))) {
      out.push(error('ENV_SHAPE', { field }));
      continue;
    }
    const given = scalar ? entry : entry.value;
    const v = asNumber(given);
    if (given != null && (v < lo || v > hi)) out.push(error('ENV_OUT_OF_RANGE', { field, value: String(given), lo: String(lo), hi: String(hi) }));
    if (object && entry.program != null) for (const [code, params] of programProblems(field, entry.program)) out.push(error(code, params));
    if (object && entry.range != null && rangeProblem(field, entry.range)) out.push(error('ENV_BAD_RANGE', { field, range: JSON.stringify(entry.range).slice(0, 40), lo: String(lo), hi: String(hi) }));
  }
  return out;
}

// The spec as the simulation takes it (compile.js): known fields only, each { value } or
// { value, program?, range? } with a program that can run (then `value` is the program's at t = 0),
// values inside their limits, a range the slider can span.
export function cleanEnvironment(spec) {
  const out = {};
  if (!spec || typeof spec !== 'object' || Array.isArray(spec)) return out;
  for (const [field, entry] of Object.entries(spec)) {
    if (!Object.hasOwn(FIELDS, field)) continue;
    const object = entry && typeof entry === 'object' && !Array.isArray(entry);
    const given = object ? entry.value : entry;
    const program = object && entry.program != null && !programProblems(field, entry.program).some(([code]) => code !== 'ENV_OUT_OF_RANGE') ? entry.program : null;
    // With a program, its value at t = 0 (a `value` beside it is not used); else the value given.
    const start = program ? programValue(program, 0) : given != null ? asNumber(given) : NaN;
    const value = Number.isFinite(start) ? clamp(field, start) : FIELDS[field].default;
    const range = object && entry.range != null && !rangeProblem(field, entry.range) ? [...entry.range] : null;
    out[field] = { value, ...(program && { program }), ...(range && { range }) };
  }
  return out;
}

// The environment at run time. `spec`: as cleanEnvironment gives it (a plain circuit's too);
// `extra`: more fields it has, at their defaults (the ones a sensor follows without the circuit
// naming them). Programs run on the time given to at(t).
export function createEnvironment(spec = {}, extra = []) {
  const clean = cleanEnvironment(spec);
  const state = new Map(); // field → { value, program, range, paused, origin }
  const add = (field) => {
    if (state.has(field) || !Object.hasOwn(FIELDS, field)) return;
    const c = clean[field];
    state.set(field, { value: c?.value ?? FIELDS[field].default, program: c?.program ?? null, range: c?.range ?? null, paused: false, origin: 0 });
  };
  for (const field of Object.keys(clean)) add(field);
  for (const field of extra) add(field);
  let now = 0;
  const running = (s) => s.program && !s.paused;
  const env = {
    // Every field's value at t (programs that run move; the rest stay), as { field: value }.
    at(t) {
      now = Math.max(0, Number(t) || 0);
      for (const [field, s] of state) {
        if (!running(s)) continue;
        // A program that cannot give a number there (a period too short for the clock) keeps the last.
        const v = programValue(s.program, now - s.origin);
        if (Number.isFinite(v)) s.value = clamp(field, v);
      }
      return env.values();
    },
    values: () => Object.fromEntries([...state].map(([field, s]) => [field, s.value])),
    value: (field) => state.get(field)?.value ?? FIELDS[field]?.default,
    // A value by hand: a field the circuit did not name joins the environment; a program pauses.
    set(field, value) {
      if (!Object.hasOwn(FIELDS, field)) return false;
      const v = asNumber(value);
      if (!num(v)) return false;
      add(field);
      const s = state.get(field);
      s.value = clamp(field, FIELDS[field].kind === 'switch' ? (v ? 1 : 0) : v);
      if (s.program) s.paused = true;
      return true;
    },
    // A paused program runs again, from its own beginning at the time of the last at(t).
    resume(field) {
      const s = state.get(field);
      if (!s?.program) return false;
      s.paused = false;
      s.origin = now;
      const v = programValue(s.program, 0);
      if (Number.isFinite(v)) s.value = clamp(field, v);
      return true;
    },
    // Back to t = 0 (the page's Restart): programs that run start again; values set by hand stay.
    rewind() {
      now = 0;
      for (const s of state.values()) if (running(s)) s.origin = 0;
      return env.at(0);
    },
    fields: () => [...state.keys()],
    programmed: (field) => Boolean(state.get(field)?.program),
    // The span the slider and the indicator show: the circuit's range for the field, else the registry's.
    range: (field) => state.get(field)?.range ?? (FIELDS[field] ? [FIELDS[field].min, FIELDS[field].max] : null),
    paused: (field) => Boolean(state.get(field)?.paused),
    // The time each running program takes (s), for the page's pace (sim/pace.js).
    spans: () => [...state.values()].filter(running).map((s) => programSpan(s.program)).filter((x) => x > 0),
  };
  return env;
}

// The environment's controls, as a device's (../controls.js): id 'environment', `field` the field's
// name; `min` and `max` the circuit's range for it (else the registry's), `limit` always the
// registry's; a switch is a toggle. `programmed` and `paused` let the page offer Pause and Resume.
export function environmentControls(env) {
  if (!env) return [];
  return env.fields().map((field) => {
    const f = FIELDS[field];
    const value = env.value(field);
    const own = f.kind === 'switch' ? { scale: 'toggle', value: Boolean(value) } : { scale: f.scale, value, ...(f.step && { step: f.step }) };
    const [min, max] = env.range(field);
    return { id: 'environment', field, min, max, limit: f.limit, unit: f.unit, kind: f.kind, ...own, ...(env.programmed(field) && { programmed: true, paused: env.paused(field) }) };
  });
}

// A value as the page and the card write it: light with up to three figures ("0.1 lx", "48 lx",
// "300 lx", "2.5 klx"), the others to their step ("25 °C", "90°"). A switch has words instead (null).
export function envText(field, value, decimal = '.') {
  const f = FIELDS[field];
  if (!f || f.kind === 'switch' || !Number.isFinite(value)) return null;
  let n;
  let unit = f.unit;
  if (f.scale === 'log') {
    const kilo = Math.abs(value) >= 1000;
    const v = kilo ? value / 1000 : value;
    n = v === 0 ? 0 : Number(v.toPrecision(Math.abs(v) < 1 ? 1 : Math.abs(v) < 100 ? 2 : 3));
    if (kilo) unit = `k${unit}`;
  } else n = Math.round(value / (f.step ?? 1)) * (f.step ?? 1);
  const text = String(Object.is(n, -0) ? 0 : n).replace('.', decimal);
  return unit === '°' ? `${text}°` : `${text} ${unit}`;
}
