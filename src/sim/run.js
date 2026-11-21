// What a circuit does over time, run as the page runs it (simulate --run, the MCP simulate tool's
// run_s; docs/en/simulation.md, "A run"): the same engine (engine.js: start, then advance in the
// page's step, ending a step on each element's event, the board's program, pulseIn, the library
// sensors, the timed modules), from switch-on, for a number of simulated seconds, with stimuli: the
// environment's fields, controls set, a button pressed for a while, a field or a control changed at a
// time. Nothing here changes the circuit it is given.
//
//   parseStimuli({ env, set, press, at }) → { stimuli, errors }   the command line's texts, each a list
//   runCircuit(circuit, { seconds, stimuli, budgetMs }) →
//     { ok, run: { seconds, step, steps, asked? }, serial: { count, lines: [{ t, text, board? }] },
//       outputs: [{ id, kind, onShare, changes, frequency, period, duty, intervals: [[on, off]…] }],
//       readings: engine.now() at the end, issues: [issue…] }
//     or { ok: false, errors: [issue…] } for a stimulus that names nothing or is out of range (an
//     input error: the command exits 1) or { ok: false, issues } when the circuit cannot run.
//   prepareRun(circuit, stimuli) → { engine, compiled, issues, events } | { errors }   (also --transient)
//   behaviourOf(circuit, { seconds, maxSteps }) → { outputs, skipped? } | null   layout's line
//
// An output is a part that shows something (an LED, a chip of an RGB LED or a segment of a display, a
// buzzer, a relay, a motor), each op-amp's output (U1.OUT1, high or low) and each pin a board's
// program drives (U1.D13): on while its quantity is
// past ON[kind], each edge interpolated between the two steps around it. `frequency`, `period` and
// `duty` only when it toggles regularly (REGULAR), measured over its last whole periods, the first one
// (the start-up) left out when there are more.

import { compile } from './compile.js';
import { createEngine, MIN_PIECE } from './engine.js';
import { paceOf } from './pace.js';
import { FIELDS } from './environment.js';
import { issue } from './devices/shared.js';
import { LIMITS } from '../limits.js';
import { CIRCUIT_FOLDER } from '../beside.js';

// What "on" is for each kind of output: the quantity of its reading and the level it must reach.
// An LED lit at 5 % of its rated current (1 mA for 20 mA) is visibly on; a passive buzzer takes 1 mA.
const LIT = 0.05;
const ON = {
  led: { level: LIT },
  segment: { level: LIT },
  buzzer: { level: 0.5 },
  'passive-buzzer': { level: 1e-3 },
  relay: { level: 0.5 },
  laser: { level: 0.5 },
  motor: { level: 30 }, // r/min
  pin: { level: 0.5 }, // of the board's logic rail
  output: { level: 0.5 }, // an op-amp's, of its supply
};
const REGULAR = 0.1; // every period within 10 % of their mean: it toggles regularly
const PERIODS = 50; // the last periods measured
const EDGES = 1000; // risings and fallings kept for that
const CHECKS = 200; // times the limits are read during a run (and at its end)
const BUDGET_EVERY = 32; // steps between two looks at the clock

const t0 = () => globalThis.performance?.now?.() ?? Date.now();
const num = (text) => {
  const s = String(text).trim();
  return s === '' ? Number.NaN : Number(s);
};
const SWITCH_WORDS = { on: 1, off: 0, true: 1, false: 0, pressed: 1, released: 0, high: 1, low: 0, '1': 1, '0': 0 };
const bad = (code, params) => issue('error', code, params);

// ── The command line's texts ───────────────────────────────────────────────────────────

// "a=1,b=2" → [[a, "1"], [b, "2"]]; null when a piece has no "=".
function pairs(text) {
  const out = [];
  for (const piece of String(text).split(',')) {
    if (!piece.trim()) continue;
    const at = piece.indexOf('=');
    if (at <= 0) return null;
    out.push([piece.slice(0, at).trim(), piece.slice(at + 1).trim()]);
  }
  return out;
}

// What --env, --set, --press and --at say (each a list of texts, as given). The values stay texts
// here: what they mean depends on the circuit (runCircuit checks them).
export function parseStimuli({ env = [], set = [], press = [], at = [] } = {}) {
  const stimuli = { env: [], set: [], press: [], at: [] };
  const errors = [];
  for (const text of env) {
    const list = pairs(text);
    if (!list?.length) errors.push(bad('RUN_BAD_STIMULUS', { option: '--env', value: String(text).slice(0, 60), form: 'light=0.5,distance=10' }));
    else for (const [field, value] of list) stimuli.env.push({ field, value });
  }
  for (const text of set) {
    const list = pairs(text);
    if (!list?.length) errors.push(bad('RUN_BAD_STIMULUS', { option: '--set', value: String(text).slice(0, 60), form: 'RV1=0.8,SW1=on' }));
    else for (const [name, value] of list) stimuli.set.push({ name, value });
  }
  for (const text of press) {
    for (const piece of String(text).split(',')) {
      const m = /^\s*([^@\s]+)\s*@\s*([^+\s]+)\s*\+\s*(\S+)\s*$/.exec(piece);
      const [start, duration] = m ? [num(m[2]), num(m[3])] : [];
      if (!m || !(start >= 0) || !(duration > 0)) errors.push(bad('RUN_BAD_STIMULUS', { option: '--press', value: piece.trim().slice(0, 60), form: 'SW1@0.5+0.2' }));
      else stimuli.press.push({ name: m[1], at: start, duration });
    }
  }
  for (const text of at) {
    const m = /^\s*([^:\s]+)\s*:(.*)$/.exec(String(text));
    const time = m ? num(m[1]) : Number.NaN;
    const list = m ? pairs(m[2]) : null;
    if (!(time >= 0) || !list?.length) errors.push(bad('RUN_BAD_STIMULUS', { option: '--at', value: String(text).slice(0, 60), form: '1.0:light=0.5' }));
    else for (const [name, value] of list) stimuli.at.push({ time, name, value });
  }
  return { stimuli, errors };
}

// The MCP tool's arguments in the same shape: `environment` an object (or a text), `set` an object
// (or a text), `press` and `at` lists of texts or of objects ({ part, at, duration } and
// { time, field | part, value }).
export function stimuliFromArgs({ environment, set, press, at } = {}) {
  const asText = (o) => (o && typeof o === 'object' && !Array.isArray(o) ? Object.entries(o).map(([k, v]) => `${k}=${v}`).join(',') : o);
  const list = (v) => (v == null ? [] : Array.isArray(v) ? v : [v]);
  return parseStimuli({
    env: list(asText(environment)).filter((x) => x !== ''),
    set: list(asText(set)).filter((x) => x !== ''),
    press: list(press).map((p) => (p && typeof p === 'object' ? `${p.part}@${p.at}+${p.duration}` : p)),
    at: list(at).map((a) => (a && typeof a === 'object' ? `${a.time}:${a.field ?? a.part}=${a.value}` : a)),
  });
}

// ── Checking them against the circuit ─────────────────────────────────────────────────

// A field's value from a text: a number inside the field's range, or on/off for a switch.
function fieldValue(field, text) {
  const f = FIELDS[field];
  const word = SWITCH_WORDS[String(text).trim().toLowerCase()];
  const v = f.kind === 'switch' && word !== undefined ? word : num(text);
  if (!Number.isFinite(v) || v < f.min || v > f.max) return { error: bad('RUN_ENV_RANGE', { field, value: String(text).slice(0, 40), min: f.min, max: f.max, unit: f.unit }) };
  return { value: v };
}
const unknownField = (field) => bad('ENV_UNKNOWN_FIELD', { field: String(field).slice(0, 40), fields: Object.keys(FIELDS).join(', ') });

// A control by what a person writes: "RV1" (its only control, or the one a person moves: pressed,
// on, position) or "RV1.position".
const PREFERRED = ['pressed', 'on', 'position', 'tipped'];
function findControl(controls, name) {
  const [id, field] = String(name).split('.');
  const own = controls.filter((c) => c.id !== 'environment' && c.id.toLowerCase() === id.toLowerCase());
  if (!own.length) return { error: bad('RUN_UNKNOWN_CONTROL', { name: String(name).slice(0, 40), parts: [...new Set(controls.filter((c) => c.id !== 'environment').map((c) => c.id))].join(', ') || '—' }) };
  const found = field ? own.find((c) => c.field === field) : own.length === 1 ? own[0] : (PREFERRED.map((f) => own.find((c) => c.field === f)).find(Boolean) ?? null);
  if (!found) return { error: bad('RUN_UNKNOWN_FIELD', { part: own[0].id, field: field ?? '—', fields: own.map((c) => c.field).join(', ') }) };
  return { control: found };
}
function controlValue(control, text) {
  const name = `${control.id}.${control.field}`;
  if (control.scale === 'momentary' || control.scale === 'toggle') {
    const word = SWITCH_WORDS[String(text).trim().toLowerCase()];
    return word === undefined ? { error: bad('RUN_BAD_VALUE', { name, value: String(text).slice(0, 40), want: 'on / off' }) } : { value: Boolean(word) };
  }
  const v = num(text);
  const [lo, hi] = control.limit ?? [control.min, control.max];
  if (!Number.isFinite(v) || v < lo || v > hi) return { error: bad('RUN_BAD_VALUE', { name, value: String(text).slice(0, 40), want: `${lo} … ${hi}${control.unit ? ` ${control.unit}` : ''}` }) };
  return { value: v };
}

// The circuit with the run's environment (a copy), its engine with the controls set, and the timed
// events (each { time, apply(engine) → ok }), or the input errors.
export function prepareRun(circuit, stimuli = {}, given = null) {
  const { env = [], set = [], press = [], at = [] } = stimuli;
  const errors = [];
  const issues = [];
  // The fields the run names: set at the start, or changed later.
  const environment = { ...(circuit.environment ?? {}) };
  const named = new Set();
  const start = {};
  for (const e of env) {
    if (!Object.hasOwn(FIELDS, e.field)) errors.push(unknownField(e.field));
    else {
      const r = fieldValue(e.field, e.value);
      if (r.error) errors.push(r.error);
      else {
        start[e.field] = r.value;
        named.add(e.field);
      }
    }
  }
  const later = at.filter((a) => Object.hasOwn(FIELDS, a.name));
  for (const a of later) named.add(a.name);
  if (errors.length) return { errors };
  for (const field of named) {
    const was = environment[field];
    const range = was && typeof was === 'object' ? was.range : undefined;
    // A value given replaces the field's (and its program); a field only changed later keeps its own.
    if (field in start) environment[field] = range ? { value: start[field], range } : start[field];
    else if (was === undefined) environment[field] = FIELDS[field].default;
  }
  const declared = named.size > 0 || circuit.environment !== undefined;
  // `given`: the circuit compiled already (layout's line), used when the run changes no field.
  // The copy keeps the circuit's folder (a hidden key), where a board's .ino file is read from.
  const copy = declared ? Object.defineProperty({ ...circuit, environment }, CIRCUIT_FOLDER, { value: circuit[CIRCUIT_FOLDER], enumerable: false }) : circuit;
  const compiled = given && !named.size ? given : compile(copy);
  if (compiled.fatal) return { fatal: true, issues: compiled.issues };
  const engine = createEngine(compiled.program);
  // A sensor that reads its field by a value of its own follows the field the run sets (the run says
  // so); a field nothing reads is said too.
  for (const field of named) {
    const sensors = compiled.program.devices.filter((d) => !d.unsupported && d.senses?.includes(field));
    if (!sensors.length) issues.push(issue('warning', 'RUN_ENV_UNUSED', { field }));
    for (const d of sensors) {
      if (d.follows?.includes(field)) continue;
      if (engine.attach(d.id, field)) issues.push(issue('info', 'RUN_ENV_ATTACHED', { part: d.id, field }));
    }
  }
  const controls = engine.controls();
  for (const s of set) {
    const c = findControl(controls, s.name);
    const v = c.error ? c : controlValue(c.control, s.value);
    if (v.error) errors.push(v.error);
    else if (!engine.set(c.control.id, c.control.field, v.value)) errors.push(bad('RUN_BAD_VALUE', { name: s.name, value: String(s.value), want: '—' }));
  }
  const events = [];
  for (const p of press) {
    const c = findControl(controls, p.name);
    if (c.error) {
      errors.push(c.error);
      continue;
    }
    if (c.control.scale !== 'momentary' && c.control.scale !== 'toggle') {
      errors.push(bad('RUN_NOT_A_BUTTON', { name: p.name, field: c.control.field }));
      continue;
    }
    const { id, field, value: rest } = c.control;
    events.push({ time: p.at, apply: (e) => e.set(id, field, !rest) }, { time: p.at + p.duration, apply: (e) => e.set(id, field, Boolean(rest)) });
  }
  for (const a of at) {
    if (Object.hasOwn(FIELDS, a.name)) {
      const r = fieldValue(a.name, a.value);
      if (r.error) errors.push(r.error);
      else events.push({ time: a.time, apply: (e) => e.set('environment', a.name, r.value) });
      continue;
    }
    const c = findControl(controls, a.name);
    const v = c.error ? c : controlValue(c.control, a.value);
    if (v.error) errors.push(v.error);
    else events.push({ time: a.time, apply: (e) => e.set(c.control.id, c.control.field, v.value) });
  }
  if (errors.length) return { errors };
  events.sort((a, b) => a.time - b.time);
  return { engine, compiled, issues, events };
}

// ── Watching the outputs ──────────────────────────────────────────────────────────────

// The outputs of a compiled circuit: { id, part, kind, value(reading) }; a board's pins are added as
// its program makes them outputs (pinOutputs). Also the hazard check's (sim/index.js litOutputs).
export function outputsOf(program) {
  const out = [];
  for (const d of program.devices ?? []) {
    if (d.unsupported) continue;
    if (d.kind === 'LED') out.push({ id: d.id, part: d.id, kind: 'led', value: (r) => r.brightness });
    else if (d.kind === 'LEDS') {
      const kind = d.type === 'seven-segment' ? 'segment' : 'led';
      for (const c of d.params?.channels ?? []) out.push({ id: `${d.id}.${c.pin}`, part: d.id, kind, value: (r) => r.channels?.[c.pin]?.brightness });
    } else if (d.kind === 'BZA') out.push({ id: d.id, part: d.id, kind: 'buzzer', value: (r) => (r.sounding ? 1 : 0) });
    else if (d.type === 'buzzer') out.push({ id: d.id, part: d.id, kind: 'buzzer', on: ON['passive-buzzer'], value: (r) => Math.abs(r.current ?? 0) });
    else if (d.kind === 'RLY') out.push({ id: d.id, part: d.id, kind: 'relay', value: (r) => (r.closed ? 1 : 0) });
    else if (d.kind === 'MOT') out.push({ id: d.id, part: d.id, kind: 'motor', value: (r) => Math.abs(r.rpm ?? 0) });
    // A laser module is on from where it glows (devices/laser.js: dim, then lasing).
    else if (d.kind === 'LSR') out.push({ id: d.id, part: d.id, kind: 'laser', value: (r) => (r.state === 'dim' || r.state === 'lasing' ? 1 : 0) });
    // An op-amp's output, high or low against its supply: what toggles in a relaxation oscillator.
    else if (d.kind === 'OPA' && !d.params?.model?.openCollector) {
      d.params.channels.forEach((ch) => {
        if (ch.used) out.push({ id: `${d.id}.${ch.out}`, part: d.id, kind: 'output', value: (r) => (r.supply > 0 ? (r.amps.find((a) => a.name === ch.name)?.vout ?? 0) / r.supply : undefined) });
      });
    }
  }
  return out;
}

// Whether an output is on in one reading of its part (the same levels a run uses).
export const outputOn = (o, reading) => {
  const v = reading && !reading.floating ? o.value(reading) : undefined;
  return typeof v === 'number' && Number.isFinite(v) && v >= (o.on ?? ON[o.kind]).level;
};

function tracker(o) {
  return { ...o, level: (o.on ?? ON[o.kind]).level, last: null, lit: false, since: 0, onTime: 0, changes: 0, intervals: [], kept: 0, rises: [], falls: [] };
}
// A sample (t, v): an edge between the last sample and this one, interpolated at the level.
function observe(w, t, v) {
  if (typeof v !== 'number' || !Number.isFinite(v)) return;
  const now = v >= w.level;
  if (w.last && now !== w.lit) {
    const [ta, a] = w.last;
    // A pin changes when its program runs, at the start of the step that shows it (the step before
    // ended on the program's event). Anything else that jumps across its level in one step (an LED a
    // pin drives) changes in the middle of the step, so its rises and falls keep the same delay and
    // its duty is the pin's; what moves slowly through it, where it crosses it.
    const jump = Math.min(a, v) < w.level / 2 && Math.max(a, v) > 2 * w.level;
    const at = w.kind === 'pin' ? ta : jump ? (ta + t) / 2 : v !== a ? ta + ((w.level - a) / (v - a)) * (t - ta) : t;
    edge(w, Math.min(t, Math.max(ta, at)), now);
  } else if (!w.last && now) {
    w.lit = true;
    w.since = t;
    w.rises.push(t);
  }
  w.last = [t, v];
}
function edge(w, at, on) {
  w.changes++;
  w.lit = on;
  if (on) {
    w.since = at;
    w.rises.push(at);
    if (w.rises.length > EDGES) w.rises.shift();
  } else {
    w.onTime += at - w.since;
    span(w, [w.since, at]);
    w.falls.push(at);
    if (w.falls.length > EDGES) w.falls.shift();
  }
}
// The spans lit: the first half of the cap, then the last ones.
function span(w, s) {
  w.kept++;
  const half = LIMITS.runIntervals / 2;
  if (w.intervals.length < LIMITS.runIntervals) w.intervals.push(s);
  else {
    w.intervals.splice(half, 1);
    w.intervals.push(s);
  }
}

// Frequency, period and duty from the last whole periods, rise to rise and fall to fall, when they
// agree (REGULAR). Being on at the start counts as a rise at 0; the first period of each kind is left
// out when there are more (a capacitor charging from 0 V makes the first one longer).
function rhythm(w) {
  const pairs = (list) => {
    const out = list.slice(1).map((t, k) => [list[k], t]);
    return (out.length >= 2 ? out.slice(1) : out).slice(-PERIODS);
  };
  const ups = pairs(w.rises);
  const downs = pairs(w.falls);
  const lengths = [...ups, ...downs].map(([a, c]) => c - a);
  if (lengths.length < 2) return null;
  const mean = lengths.reduce((s, x) => s + x, 0) / lengths.length;
  if (!(mean > 0) || lengths.some((x) => Math.abs(x - mean) > REGULAR * mean)) return null;
  // The time on in each period: from a rise to the fall inside it, or a period less the time off.
  const on = [
    ...ups.map(([a, c]) => w.falls.find((t) => t > a && t < c)).map((fall, k) => (fall == null ? null : fall - ups[k][0])),
    ...downs.map(([a, c]) => w.rises.find((t) => t > a && t < c)).map((rise, k) => (rise == null ? null : downs[k][1] - downs[k][0] - (rise - downs[k][0]))),
  ].filter((x) => x != null);
  const duty = on.length ? on.reduce((s, x) => s + x, 0) / on.length / mean : null;
  return { frequency: 1 / mean, period: mean, duty };
}

// ── The run ────────────────────────────────────────────────────────────────────────────

export function runCircuit(circuit, { seconds, stimuli = {}, budgetMs = LIMITS.runMs, maxSteps = Number.POSITIVE_INFINITY, minStep = 0, checks = CHECKS, compiled = null, extremesUntil = Number.POSITIVE_INFINITY } = {}) {
  const asked = Number(seconds);
  if (!(asked > 0)) return { ok: false, errors: [bad('RUN_BAD_TIME', { value: String(seconds).slice(0, 40), max: LIMITS.runSeconds })] };
  const prepared = prepareRun(circuit, stimuli, compiled);
  if (prepared.errors) return { ok: false, errors: prepared.errors };
  if (prepared.fatal) return { ok: false, issues: prepared.issues };
  const { engine, issues, events } = prepared;
  const total = Math.min(asked, LIMITS.runSeconds);
  if (asked > total) issues.push(issue('warning', 'RUN_CAPPED', { asked, max: LIMITS.runSeconds }));
  for (const e of events) if (e.time >= total) issues.push(issue('warning', 'RUN_EVENT_LATE', { time: e.time, seconds: total }));

  // The page's step (sim/pace.js); with nothing that changes by itself, short enough for the events.
  const pace = paceOf(engine.timeConstants(), engine.periods(), Boolean(engine.hasProgram()), engine.stimuli());
  const h = Math.max(minStep, pace.h > 0 ? pace.h : Math.min(0.01, total / 200));
  const start = circuit.page?.start === 'zero' ? 'zero' : 'dc';
  if (!engine.start(start, h)) return { ok: false, issues: [...issues, issue('error', 'SIM_NO_CONVERGENCE', {})] };

  const program = engine.program();
  const watches = outputsOf(program).map(tracker);
  const boards = program.devices.filter((d) => d.kind === 'MCU' && !d.unsupported && d.params?.sketch).map((d) => d.id);
  const pins = new Map(); // "U1.D13" → its tracker, once the program has made it an output
  const ids = new Set([...watches.map((w) => w.part), ...boards]);
  const serial = { count: 0, head: [], tail: [], seen: Object.fromEntries(boards.map((id) => [id, 0])) };
  const flags = new Map(); // a program's error or stuck, once each
  const extremes = new Map(); // "U1.D18" → the sample farthest outside its rail
  const sample = () => {
    const t = engine.time;
    const r = engine.readParts(ids);
    for (const w of watches) observe(w, t, r[w.part] && !r[w.part].floating ? w.value(r[w.part]) : undefined);
    for (const id of boards) {
      const board = r[id];
      if (!board) continue;
      for (const x of board.pins ?? []) {
        const key = `${id}.${x.name}`;
        // The farthest each pin goes outside 0…its logic rail, and when (sim/index.js: a pin over its
        // voltage while something switches, an echo pulse at 5 V on a 3.3 V board).
        const over = Math.max(x.voltage - board.vdd, -x.voltage);
        if (t <= extremesUntil && Number.isFinite(over) && board.vdd > 0 && over > (extremes.get(key)?.over ?? 0)) extremes.set(key, { part: id, pin: x.name, voltage: x.voltage, vdd: board.vdd, time: t, over });
        if (x.mode !== 'output' && !pins.has(key)) continue;
        if (!pins.has(key)) pins.set(key, tracker({ id: key, part: id, kind: 'pin' }));
        observe(pins.get(key), t, x.mode === 'output' && board.vdd > 0 ? x.voltage / board.vdd : 0);
      }
      const pr = board.program;
      if (pr?.error && !flags.has(`e${id}`)) flags.set(`e${id}`, issue('warning', 'SIM_PROGRAM_STOPPED', { part: id, message: String(pr.error).slice(0, 80) }));
      if (pr?.stuck && !flags.has(`s${id}`)) flags.set(`s${id}`, issue('warning', 'SIM_PROGRAM_STUCK', { part: id }));
    }
    const printed = engine.serial();
    for (const id of boards) {
      const s = printed[id];
      if (!s || s.printed <= serial.seen[id]) continue;
      const fresh = s.printed - serial.seen[id];
      serial.seen[id] = s.printed;
      serial.count += fresh;
      const from = Math.max(0, s.lines.length - fresh);
      for (let k = from; k < s.lines.length; k++) keepLine(serial, { t: s.stamps[k] ?? t, text: s.lines[k], ...(boards.length > 1 && { board: id }) });
    }
  };
  sample();
  engine.onStep = sample;

  const warnings = new Map();
  const look = () => {
    const now = engine.now();
    for (const w of now?.issues ?? []) if (w.severity !== 'info') warnings.set(`${w.code}:${w.params?.part ?? w.params?.supply ?? ''}`, w);
    return now;
  };
  const began = t0();
  let steps = 0;
  let next = 0;
  let nextCheck = checks > 0 ? total / checks : Number.POSITIVE_INFINITY;
  const applyDue = () => {
    while (next < events.length && events[next].time <= engine.time + 1e-12) {
      if (events[next].time < total) events[next].apply(engine);
      next++;
    }
  };
  applyDue();
  while (engine.time < total - 1e-9) {
    const hint = engine.stepHint();
    let piece = Math.min(h, hint > 0 ? Math.max(MIN_PIECE, hint) : Infinity, total - engine.time);
    if (next < events.length && events[next].time > engine.time) piece = Math.min(piece, events[next].time - engine.time);
    if (!engine.advance(piece)) {
      issues.push(issue('error', 'SIM_NO_CONVERGENCE_AT', { time: { value: engine.time, unit: 's' } }));
      break;
    }
    steps++;
    applyDue();
    if (engine.time >= nextCheck) {
      look();
      nextCheck += total / checks;
    }
    // A bound in steps gives the same answer on any machine (layout's line); the clock is the backstop.
    if (steps >= maxSteps && engine.time < total - 1e-9) {
      issues.push(issue('warning', 'RUN_STEPS', { time: { value: engine.time, unit: 's' }, seconds: { value: total, unit: 's' }, steps: maxSteps }));
      break;
    }
    if (steps % BUDGET_EVERY === 0 && t0() - began > budgetMs) {
      issues.push(issue('warning', 'RUN_BUDGET', { time: { value: engine.time, unit: 's' }, seconds: { value: total, unit: 's' }, budget: { value: budgetMs / 1000, unit: 's' } }));
      break;
    }
  }
  engine.onStep = null;
  const end = Math.abs(engine.time - total) < 1e-9 ? total : engine.time;
  const readings = look();
  const outputs = [...watches, ...pins.values()].map((w) => summary(w, end));
  const lines = [...serial.head, ...serial.tail];
  return {
    ok: !issues.some((i) => i.severity === 'error'),
    run: { seconds: end, step: h, steps, start, ...(asked !== end && { asked }) },
    serial: { count: serial.count, lines, ...(lines.length < serial.count && { kept: lines.length }) },
    outputs,
    boards: boards.length,
    pinExtremes: [...extremes.values()],
    readings,
    issues: [...(readings?.issues ?? []).filter((i) => i.severity === 'info'), ...issues, ...flags.values(), ...warnings.values()],
  };
}

// The first half of the cap, then the last lines.
function keepLine(serial, line) {
  const half = LIMITS.runSerialLines / 2;
  if (serial.head.length < half) serial.head.push(line);
  else {
    serial.tail.push(line);
    if (serial.tail.length > half) serial.tail.shift();
  }
}

function summary(w, end) {
  const intervals = w.intervals.slice();
  let onTime = w.onTime;
  if (w.lit) {
    intervals.push([w.since, end]);
    onTime += end - w.since;
  }
  const r = rhythm(w);
  return {
    id: w.id,
    kind: w.kind,
    onShare: end > 0 ? Math.min(1, Math.max(0, onTime / end)) : w.lit ? 1 : 0,
    changes: w.changes,
    frequency: r?.frequency ?? null,
    period: r?.period ?? null,
    duty: r?.duty ?? null,
    intervals,
    ...(w.kept + (w.lit ? 1 : 0) > intervals.length && { intervalsTotal: w.kept + (w.lit ? 1 : 0) }),
  };
}

// ── Layout's line ──────────────────────────────────────────────────────────────────────

// Whether a circuit changes by itself over time in a way worth a run in layout's answer: a board that
// runs a program, a 555, a signal generator, or an op-amp beside a capacitor (an oscillator).
export function runsByItself(program) {
  const devices = (program?.devices ?? []).filter((d) => !d.unsupported);
  const has = (k) => devices.some((d) => d.kind === k);
  return devices.some((d) => d.kind === 'MCU' && d.params?.sketch) || has('TMR') || (program.supplies ?? []).some((s) => s.generator && !s.off) || (has('OPA') && has('C'));
}

// The first seconds of a circuit that changes by itself, in a run bounded by a count of steps (the
// same line on any machine; BEHAVIOUR_STEPS costs about as much as the 0.8 s of machine time it
// replaced): { seconds, outputs } or { skipped: { code, params } } when the bound was hit; null for a
// circuit that does not run by itself.
export const BEHAVIOUR_STEPS = 25000;
export function behaviourOf(circuit, { seconds = 2, maxSteps = BEHAVIOUR_STEPS } = {}) {
  const compiled = compile(circuit);
  if (compiled.fatal || !runsByItself(compiled.program)) return null;
  // A step no shorter than a 20 000th of the run: a 555 beside a small capacitor would take the page's
  // tens of microseconds and seconds of the machine; the edges are still found between two steps.
  // Its limits are read once, at the end (the review judges the hazards).
  const r = runCircuit(circuit, { seconds, maxSteps, minStep: seconds / 20000, checks: 0, compiled });
  if (!r.ok && r.errors) return null;
  if (!r.ok) return { seconds, skipped: r.issues.find((i) => i.severity === 'error') ?? issue('error', 'SIM_NO_CONVERGENCE', {}) };
  const budget = r.issues.find((i) => i.code === 'RUN_STEPS' || i.code === 'RUN_BUDGET');
  if (budget) return { seconds, skipped: budget };
  return { seconds, outputs: r.outputs };
}
