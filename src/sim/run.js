// What a circuit does over time, run as the page runs it (simulate --run, the MCP simulate tool's
// run_s; docs/en/simulation.md, "A run"): the same engine (engine.js: start, then advance in the
// page's step, ending a step on each element's event, the board's program, pulseIn, the library
// sensors, the timed modules), from the page's start (its resting point, or everything discharged
// with page.start 'zero') or the one asked, for a number of simulated seconds, with stimuli: the
// environment's fields, controls set, a button pressed for a while, a field or a control changed at a
// time. Nothing here changes the circuit it is given.
//
//   parseStimuli({ env, set, press, at }) → { stimuli, errors }   the command line's texts, each a list
//   runCircuit(circuit, { seconds, stimuli, start?, budgetMs }) →  budgetMs: machine time, LIMITS.runMs by default, at most LIMITS.runMsMax;   start 'zero' | 'dc', else the page's
//     { ok, start, run: { seconds (asked), ran (covered), step, steps, start, page }, serial: { count, lines: [{ t, text, board? }] },
//       outputs: [{ id, kind, onShare, changes, frequency, period, duty, intervals: [[on, off]…],
//         sound?, tone?, measured?: { seconds, step }, fast? }],
//       readings: engine.now() at the end, issues: [issue…] }
//     or { ok: false, errors: [issue…] } for a stimulus that names nothing or is out of range (an
//     input error: the command exits 1) or { ok: false, issues } when the circuit cannot run.
//   prepareRun(circuit, stimuli) → { engine, compiled, issues, events } | { errors }   (also --transient)
//   behaviourOf(circuit, { seconds, maxSteps }) → { outputs, skipped? } | null   layout's line
//
// The step: the page's (sim/pace.js), never under the run's length over RUN_STEPS (layout's Behaviour
// line is a run of 2 s, so the two agree), each step still ending on the events (a program's writes, a
// press, a 555's thresholds: createEngine's `crossings`). A time constant shorter than that step is
// stepped over (RUN_STEP_OVER); an output faster than it is measured again in a shorter run whose step
// follows it (`measured`), or has no figure (`fast`, RUN_TOO_FAST).
//
// An output is a part that shows something (an LED, a chip of an RGB LED or a segment of a display, a
// buzzer, a relay, a motor), each op-amp's output (U1.OUT1, high or low) and each pin a board's
// program drives (U1.D13): on while its quantity is
// past ON[kind], each edge interpolated between the two steps around it. `frequency`, `period` and
// `duty` only when it toggles regularly (REGULAR), measured over its last whole periods, the first one
// (the start-up) left out when there are more.
// A passive buzzer sounds only while its current changes at an audible rate: the fields above are its
// current's (each cycle of a tone is a change), and `sound` is when it is heard, as the same fields
// (onShare, changes, starts, frequency, period, duty, intervals: the beeps), with `tone`, the
// frequency of the cycles inside them. On a steady current it is on above and silent in `sound` (it
// only clicks). An active buzzer sounds on DC: its fields above are already when it sounds.

import { compile } from './compile.js';
import { serialPortCount } from './program.js';
import { createEngine, MIN_PIECE, clipCounter } from './engine.js';
import { paceOf } from './pace.js';
import { FIELDS } from './environment.js';
import { issue } from './devices/shared.js';
import { deviceOfProgram } from './devices/index.js';
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
const COMBINATIONS = 64; // combinations of a board's outputs kept from a run
// Two changes of a passive buzzer's current closer than this are one sound: a tone of 20 Hz or more at
// any duty from 0 to 100 %; slower changes (a pin toggled at 10 Hz, a button) are clicks [assumed].
const SOUND_GAP = 0.05;
const NOTE_SAME = 0.03; // a cycle within 3 % of a note's period is the same note (a semitone is 6 %)
const NOTE_LULL = 4; // periods of silence inside a sound that end a note
const NOTE_CYCLES = 3; // cycles a note has at least (fewer: the edge of a change)
const NOTES = 32; // notes of a tune kept (the text shows fewer)

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
export function parseStimuli({ env = [], set = [], press = [], at = [], serial = [] } = {}) {
  const stimuli = { env: [], set: [], press: [], at: [], serial: [] };
  const errors = [];
  // --serial "[U1:][Serial2:]text@seconds": text typed to a board (its USB serial unless a port is
  // named), with \n, \r, \t and \\ read; the board and port are resolved by serialTargets.
  for (const text of serial) {
    const m = /^([\s\S]*)@([^@]+)$/.exec(String(text));
    const time = m ? num(m[2]) : Number.NaN;
    if (!m || !(time >= 0)) errors.push(bad('RUN_BAD_STIMULUS', { option: '--serial', value: String(text).slice(0, 60), form: '"U1:1\\n@0.5"' }));
    else stimuli.serial.push({ text: m[1].replace(/\\([nrt\\])/g, (_, c) => ({ n: '\n', r: '\r', t: '\t', '\\': '\\' })[c]), time });
  }
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
export function stimuliFromArgs({ environment, set, press, at, serial } = {}) {
  const asText = (o) => (o && typeof o === 'object' && !Array.isArray(o) ? Object.entries(o).map(([k, v]) => `${k}=${v}`).join(',') : o);
  const list = (v) => (v == null ? [] : Array.isArray(v) ? v : [v]);
  return parseStimuli({
    env: list(asText(environment)).filter((x) => x !== ''),
    set: list(asText(set)).filter((x) => x !== ''),
    press: list(press).map((p) => (p && typeof p === 'object' ? `${p.part}@${p.at}+${p.duration}` : p)),
    at: list(at).map((a) => (a && typeof a === 'object' ? `${a.time}:${a.field ?? a.part}=${a.value}` : a)),
    serial: list(serial),
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
  const { env = [], set = [], press = [], at = [], serial = [] } = stimuli;
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
  const compiled = given && !named.size && !serial.length ? given : compile(copy);
  if (compiled.fatal) return { fatal: true, issues: compiled.issues };
  const typed = serialTargets(compiled.program.devices, serial);
  if (typed.errors.length) return { errors: typed.errors };
  const engine = createEngine(compiled.program, { crossings: true });
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
    // A press that ends after the run is a press held to its end, not a late event (`release`).
    events.push({ time: p.at, apply: (e) => e.set(id, field, !rest) }, { time: p.at + p.duration, release: true, apply: (e) => e.set(id, field, Boolean(rest)) });
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
  // A typed text ends a step at its time (the board takes it then) and is said when it is past the run.
  for (const x of typed.events) events.push({ time: x.time, apply: () => true });
  if (errors.length) return { errors };
  events.sort((a, b) => a.time - b.time);
  return { engine, compiled, issues, events };
}

// The texts --serial types, each to its board's port (devices/mcu.js `serialInput`, program.js
// `typed`): "U1:" names the board (needed when two have a program), "Serial1:"/"Serial2:" the port
// (Serial, the USB one, by default). Set on the compiled devices before the engine is made.
function serialTargets(devices = [], serial = []) {
  const errors = [];
  const events = [];
  const boards = devices.filter((d) => d.kind === 'MCU' && d.params?.sketch);
  for (const x of serial) {
    let text = x.text;
    let board = boards.length === 1 ? boards[0] : null;
    let port = 0;
    for (let k = 0; k < 2; k++) {
      const m = /^([A-Za-z_]\w*):/.exec(text);
      const named = m && boards.find((d) => d.id.toLowerCase() === m[1].toLowerCase());
      const ported = m && /^Serial([12]?)$/.exec(m[1]);
      if (named) board = named;
      else if (ported) port = Number(ported[1] || 0);
      else break;
      text = text.slice(m[0].length);
    }
    if (!board) {
      errors.push(bad('RUN_SERIAL_BOARD', { value: x.text.slice(0, 40), boards: boards.map((d) => d.id).join(', ') || '—' }));
      continue;
    }
    if (port >= serialPortCount(board.params.family)) {
      errors.push(bad('RUN_SERIAL_PORT', { part: board.id, port: `Serial${port}`, count: serialPortCount(board.params.family) }));
      continue;
    }
    board.params = { ...board.params, serialInput: [...(board.params.serialInput ?? []), { port, text, time: x.time }] };
    events.push({ time: x.time });
  }
  return { errors, events };
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
    else if (d.type === 'buzzer') out.push({ id: d.id, part: d.id, kind: 'buzzer', passive: true, on: ON['passive-buzzer'], value: (r) => Math.abs(r.current ?? 0) });
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

// Whether an output is on in one reading of its part (the same levels a run uses). A passive buzzer
// is never on in one reading: a steady current only clicks it, and a sound is a current that changes
// (a run's `sound`).
export const outputOn = (o, reading) => {
  if (o.passive) return false;
  const v = reading && !reading.floating ? o.value(reading) : undefined;
  return typeof v === 'number' && Number.isFinite(v) && v >= (o.on ?? ON[o.kind]).level;
};

function tracker(o) {
  const w = { ...o, level: (o.on ?? ON[o.kind]).level, last: null, lit: false, since: 0, onTime: 0, changes: 0, intervals: [], kept: 0, rises: [], falls: [] };
  if (o.passive) w.sound = { lit: false, since: 0, onTime: 0, changes: 0, intervals: [], kept: 0, rises: [], falls: [], last: null, lastRising: false, cycleRise: null, cycles: 0, cycleTime: 0 };
  return w;
}
// A change of a passive buzzer's current at `at` (rising or not): it sounds from the change before,
// when that one was less than SOUND_GAP ago. The tone: rises counted inside each sound.
function soundChange(s, at, rising) {
  if (!s.lit && s.last != null && at - s.last < SOUND_GAP) {
    edge(s, s.last, true);
    s.cycleRise = s.lastRising ? s.last : null;
  }
  if (s.lit && rising) {
    if (s.cycleRise != null) {
      s.cycles++;
      s.cycleTime += at - s.cycleRise;
      noteCycle(s, s.cycleRise, at);
    }
    s.cycleRise = at;
  }
  s.last = at;
  s.lastRising = rising;
}
// Silent once no change came for SOUND_GAP: the sound ended at the last change.
function soundQuiet(s, t) {
  if (s.lit && t - s.last >= SOUND_GAP) {
    edge(s, s.last, false);
    s.cycleRise = null;
    closeNote(s, s.last);
  }
}
// The notes of a tune: a run of cycles of one period (within NOTE_SAME of the note's mean) is a note;
// a cycle of another period, or a lull of more than NOTE_LULL of its periods, starts the next one.
// Each { start, end, cycles, time }; the first NOTES kept, `notesTotal` counts them all.
function noteCycle(s, from, to) {
  const p = to - from;
  const n = s.note;
  const mean = n ? n.time / n.cycles : 0;
  if (n && Math.abs(p - mean) <= NOTE_SAME * mean) {
    n.cycles++;
    n.time += p;
    n.end = to;
    return;
  }
  // A lull inside one sound (two notes 30 ms apart): the cycle across it belongs to neither.
  if (n && p > NOTE_LULL * mean) {
    closeNote(s, from);
    return;
  }
  closeNote(s, from);
  s.note = { start: from, end: to, cycles: 1, time: p };
}
function closeNote(s, at) {
  const n = s.note;
  s.note = null;
  if (!n || n.cycles < NOTE_CYCLES) return;
  // It lasts to the last change of its sound (half a cycle after its last rise).
  n.end = Math.max(n.end, Math.min(at ?? n.end, n.end + n.time / n.cycles));
  s.notesTotal = (s.notesTotal ?? 0) + 1;
  (s.notes ??= []).length < NOTES && s.notes.push(n);
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
  if (w.sound) soundChange(w.sound, at, on);
  // A board's pin playing a tone (cycles faster than SOUND_GAP): its notes, as a buzzer's.
  if (w.kind === 'pin' && on) {
    if (w.lastRise != null && at - w.lastRise < SOUND_GAP) noteCycle(w, w.lastRise, at);
    else closeNote(w, w.lastRise);
    w.lastRise = at;
  }
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
  return { frequency: 1 / mean, period: mean, duty, periods: Math.max(ups.length, downs.length) };
}

// ── The run ────────────────────────────────────────────────────────────────────────────

// Where a run starts: `start` as asked ('zero': everything discharged, 'dc': its resting point), or
// the page's own start (`page.start`, the resting point unless it says 'zero').
export const pageStart = (circuit) => (circuit.page?.start === 'zero' ? 'zero' : 'dc');
const START_MODES = ['zero', 'dc'];

export function runCircuit(circuit, { seconds, stimuli = {}, start: wanted, budgetMs: givenBudget = LIMITS.runMs, maxSteps = Number.POSITIVE_INFINITY, minStep = 0, checks = CHECKS, compiled = null, extremesUntil = Number.POSITIVE_INFINITY, remeasure = REMEASURES } = {}) {
  const asked = Number(seconds);
  if (!(asked > 0)) return { ok: false, errors: [bad('RUN_BAD_TIME', { value: String(seconds).slice(0, 40), max: LIMITS.runSeconds })] };
  if (wanted != null && !START_MODES.includes(wanted)) return { ok: false, errors: [bad('RUN_BAD_START', { value: String(wanted).slice(0, 40) })] };
  const prepared = prepareRun(circuit, stimuli, compiled);
  if (prepared.errors) return { ok: false, errors: prepared.errors };
  if (prepared.fatal) return { ok: false, issues: prepared.issues };
  const { engine, issues, events, compiled: used } = prepared;
  const total = Math.min(asked, LIMITS.runSeconds);
  if (asked > total) issues.push(issue('warning', 'RUN_CAPPED', { asked, max: LIMITS.runSeconds }));
  // The machine's time it may take: budgetMs, at most LIMITS.runMsMax (said when capped).
  const budgetMs = Math.min(givenBudget, LIMITS.runMsMax);
  if (givenBudget > LIMITS.runMsMax) issues.push(issue('info', 'RUN_BUDGET_CAPPED', { asked: givenBudget / 1000, max: LIMITS.runMsMax / 1000 }));
  // Times as written (0.8, not 0.7999999999999999).
  for (const e of events) if (e.time >= total && !e.release) issues.push(issue('warning', 'RUN_EVENT_LATE', { time: Number(e.time.toPrecision(12)), seconds: total }));

  // The page's step (sim/pace.js; with nothing that changes by itself, short enough for the events),
  // never under the run's length over RUN_STEPS: the page's step follows the fastest thing it can show
  // (a decoupling capacitor's nanoseconds), which a run of seconds cannot afford. The steps still end
  // on every event (a program's writes, a press, the 555's thresholds) and stay stable at any length.
  const pace = paceOf(engine.timeConstants(), engine.periods(), Boolean(engine.hasProgram()), engine.stimuli());
  const own = pace.h > 0 ? pace.h : Math.min(0.01, total / 200);
  const h = Math.max(minStep, own, total / RUN_STEPS);
  // What the step is longer than: one note, naming the slowest of the times it steps over.
  const over = h > own ? engine.timeConstants(true).filter((c) => c.value < h).sort((a, b) => b.value - a.value) : [];
  if (over.length) issues.push(issue('info', over.length > 1 ? 'RUN_STEP_OVER_MANY' : 'RUN_STEP_OVER', { step: { value: h, unit: 's' }, part: over[0].part ?? '—', tau: { value: over[0].value, unit: 's' }, count: over.length }));
  const page = pageStart(circuit);
  const start = wanted ?? page;
  if (!engine.start(start, h)) return { ok: false, issues: [...issues, issue('error', 'SIM_NO_CONVERGENCE', {})] };
  // A circuit with two resting states runs from the first (its DC point is the balance between them,
  // which a real circuit never sits in): the run says which, and the other.
  const two = start === 'dc' ? restingStates(circuit, used) : null;
  const states = two && engine.seed(two.states[0].nodes) ? two.states.map((s) => ({ on: s.on, gains: gainsOf(s.reading) })) : null;

  const program = engine.program();
  const watches = outputsOf(program).map(tracker);
  const boards = program.devices.filter((d) => d.kind === 'MCU' && !d.unsupported && d.params?.sketch).map((d) => d.id);
  const pins = new Map(); // "U1.D13" → its tracker, once the program has made it an output
  // Clocked chips (devices that `holds`): what they latch is part of each combination, so the review
  // visits the states their outputs reach (eight LEDs filled by a 74HC595), not only the board's pins.
  const chips = program.devices.filter((d) => !d.unsupported && deviceOfProgram(d)?.holds).map((d) => d.id);
  const ids = new Set([...watches.map((w) => w.part), ...boards, ...chips]);
  const serial = { count: 0, head: [], tail: [], seen: Object.fromEntries(boards.map((id) => [id, 0])) };
  const flags = new Map(); // a program's error or stuck, once each
  const extremes = new Map(); // "U1.D18" → the sample farthest outside its rail
  // A dissipation limit is thermal: a part over its power at an instant (a clipped amplifier's peaks, a
  // resistor in a PWM) is followed from then on, step by step, and judged on its average power from that
  // moment to the end of the run (`hot`); current and voltage limits stay instantaneous.
  const hot = new Map(); // "SIM_OVER_POWER:R1" → { id, pin, max, since, last, energy, issue }
  const powerOf = (entry, reading) => (engine.stresses({ parts: { [entry.id]: reading } })[entry.id] ?? []).find((s) => s.code === 'SIM_OVER_POWER' && (s.pin ?? null) === entry.pin)?.value ?? 0;
  const combos = new Map(); // "U1 D2,D5 | chips" → { part, high, chips? }: each combination seen
  const sample = () => {
    const t = engine.time;
    if (hot.size) {
      const now = engine.readParts(new Set([...hot.values()].map((e) => e.id)));
      for (const e of hot.values()) {
        if (now[e.id] && !now[e.id].floating) e.energy += powerOf(e, now[e.id]) * (t - e.last);
        e.last = t;
      }
    }
    const r = engine.readParts(ids);
    const latched = chips.filter((id) => r[id]?.logic && !r[id].floating).map((id) => [id, { logic: r[id].logic, label: r[id].label }]);
    const chipKey = latched.map(([id, c]) => `${id}:${JSON.stringify(c.logic)}`).join(' ');
    if (!boards.length && latched.length && combos.size < COMBINATIONS && !combos.has(chipKey)) combos.set(chipKey, { part: null, high: [], chips: Object.fromEntries(latched) });
    for (const w of watches) {
      observe(w, t, r[w.part] && !r[w.part].floating ? w.value(r[w.part]) : undefined);
      if (w.sound) soundQuiet(w.sound, t);
    }
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
        // A pin by what the program writes to it (a pin loaded past its rating sags under the half-rail
        // line, but it is still driven high: its voltage is a reading, not its state).
        // A PWM or a tone too, by the level the program's wave has at this step (a buzzer that loads a
        // tone's pin under the half-rail line is still played).
        observe(pins.get(key), t, x.mode !== 'output' || !(board.vdd > 0) ? 0 : x.level ? 1 : 0);
      }
      // Which of its outputs the program holds high now: each combination once (sim/index.js visits them).
      if (combos.size < COMBINATIONS) {
        // A PWM or tone pin counts as high: the hazard check holds it high, its worst case (as before).
        const high = (board.pins ?? []).filter((x) => x.mode === 'output' && (x.pwm ? x.pwm.duty > 0 : x.level)).map((x) => x.name);
        const key = `${id} ${high.join(',')} ${chipKey}`;
        if (!combos.has(key)) combos.set(key, { part: id, high, ...(latched.length && { chips: Object.fromEntries(latched) }) });
      }
      const pr = board.program;
      if (pr?.error && !flags.has(`e${id}`)) flags.set(`e${id}`, issue('warning', 'SIM_PROGRAM_STOPPED', { part: id, message: String(pr.error).slice(0, 80) }));
      if (pr?.stuck && !flags.has(`s${id}`)) flags.set(`s${id}`, issue('warning', 'SIM_PROGRAM_STUCK', { part: id }));
    }
    readSerial(t);
  };
  // What each board printed since the last look, with the time each line ended.
  const readSerial = (t) => {
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

  // Each warning once, at the strongest reading of its first quantity seen over the run, with the time
  // and, for a board's pin, whether the program held it high or low then: a figure of a run is not the
  // DC point's (a motor's current at start or coasting into a pin set low is not its steady one).
  const warnings = new Map();
  // A warning about a level that must last (LEVELS: a coil under its pull-in current, an input in the
  // uncertain band, a supply out of its range) is a finding only once that level has settled: seen at
  // every look for SETTLE_TAUS of its part's longest time constant, its quantity moving less than
  // SETTLED between the last two looks, or still there at the end of the run. A coil's current that
  // rises through the band on its way to pulling in is not one. A peak that damages at once (a
  // current, a voltage over a maximum) is kept at its strongest, as before.
  const settleOf = new Map();
  for (const c of engine.timeConstants(true)) if (c.part) settleOf.set(c.part, Math.max(settleOf.get(c.part) ?? 0, SETTLE_TAUS * c.value));
  const passing = new Map(); // key → { since, last: quantity } of a level warning not settled yet
  const clips = clipCounter();
  const look = (final = false) => {
    const now = engine.now();
    clips.see(now);
    const present = new Set();
    for (const w of now?.issues ?? []) {
      if (w.severity === 'info') continue;
      if (LEVELS.has(w.code)) {
        const key = `${w.code}:${w.params?.part ?? w.params?.supply ?? ''}`;
        present.add(key);
        const p = passing.get(key);
        const q = strength(w);
        if (!p) passing.set(key, { since: engine.time, last: q });
        else p.settled = engine.time - p.since >= (settleOf.get(String(w.params?.part ?? '').split('.')[0]) ?? 0) && Math.abs(q - p.last) <= SETTLED * Math.abs(q);
        if (p) p.last = q;
        if (!final && !passing.get(key).settled) continue;
      }
      if (w.code === 'SIM_OVER_POWER') {
        const key = `${w.code}:${w.params?.part ?? ''}`;
        if (!hot.has(key)) {
          const [id, ...rest] = String(w.params.part).split('.');
          hot.set(key, { id, pin: rest.length ? rest.join('.') : null, max: w.params.max?.value, since: engine.time, last: engine.time, energy: 0, issue: w });
        }
        continue;
      }
      const key = `${w.code}:${w.params?.part ?? w.params?.supply ?? ''}`;
      const was = warnings.get(key);
      if (was && !(strength(w) > strength(was))) continue;
      const [board, pin] = String(w.params?.part ?? '').split('.');
      // Only a board lists its pins (a chip's "U2.OUT1" names a pin of a part whose pins are volts by name).
      const pins = now.parts?.[board]?.pins;
      const level = pin && Array.isArray(pins) ? pins.find((x) => x.name === pin && x.mode === 'output') : null;
      // "At its strongest in the run, at …" only for a warning with a quantity (a program's warning has none).
      warnings.set(key, strength(w) > 0 ? { ...w, when: { time: engine.time, ...(level && { pin, high: Boolean(level.pwm ? level.pwm.duty > 0 : level.level) }) } } : w);
    }
    for (const key of passing.keys()) if (!present.has(key)) passing.delete(key);
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
      // A run in steps of its length over RUN_STEPS takes as many steps when shorter: only --budget helps.
      issues.push(issue('warning', 'RUN_BUDGET', { time: { value: engine.time, unit: 's' }, seconds: { value: total, unit: 's' }, budget: { value: budgetMs / 1000, unit: 's' }, ...(h > own && { variant: 'floor', count: RUN_STEPS }) }));
      break;
    }
  }
  engine.onStep = null;
  const end = Math.abs(engine.time - total) < 1e-9 ? total : engine.time;
  const readings = look(true);
  // The last step is accepted only by the next, which a run that ends never takes: accepted here, so a
  // program's print at the run's last instant (every 500 ms in a run of 1 s) is in the run.
  engine.acceptLast();
  readSerial(end);
  // Each part over its power at some instant: its average from then to the end, against its maximum.
  for (const [key, e] of hot) {
    const span = end - e.since;
    const average = span > 0 ? e.energy / span : powerOf(e, readings?.parts?.[e.id] ?? {});
    if (average > e.max) warnings.set(key, { ...e.issue, params: { ...e.issue.params, power: { value: average, unit: 'W' } }, when: { average: true, from: e.since, time: end } });
  }
  // An output whose rhythm is faster than a step raised by the floor can follow (fewer than FAST steps
  // in a period, on average) is measured again in a shorter run from the same start, whose step does
  // follow it; what that cannot follow either has no figure (the step's, not its own) and a note.
  let outputs = [...watches, ...pins.values()].map((w) => summary(w, end));
  if (h > own) outputs = outputs.map((o) => unresolved(o, steps, end));
  const fast = outputs.filter((o) => o.fast);
  if (fast.length) {
    const seconds = shorterRun(fast, end, total);
    const again = remeasure > 0 && seconds < end ? runCircuit(circuit, { seconds, stimuli, start, budgetMs: Math.max(1, budgetMs - (t0() - began)), maxSteps, checks: 0, compiled: used, remeasure: remeasure - 1 }) : null;
    const by = new Map((again?.ok ? again.outputs : []).map((o) => [o.id, o]));
    outputs = outputs.map((o) => {
      const f = o.fast ? by.get(o.id) : null;
      if (!f?.period || f.fast) return o;
      const { fast: _, ...rest } = o;
      return { ...rest, frequency: f.frequency, period: f.period, duty: f.duty, periods: f.periods, ...(f.tone && { tone: f.tone }), measured: f.measured ?? { seconds: again.run.ran, step: again.run.step } };
    });
    const left = outputs.filter((o) => o.fast);
    if (left.length) issues.push(issue('info', 'RUN_TOO_FAST', { parts: left.map((o) => o.id).join(', '), step: { value: h, unit: 's' }, seconds: { value: shorterRun(left, end, total), unit: 's' } }));
  }
  const lines = [...serial.head, ...serial.tail];
  return {
    ok: !issues.some((i) => i.severity === 'error'),
    start,
    // `seconds` as asked, `ran` the seconds really covered (less when capped or stopped early).
    run: { seconds: asked, ran: end, step: h, steps, start, page, ...(states && { state: 1, states }) },
    serial: { count: serial.count, lines, ...(lines.length < serial.count && { kept: lines.length }) },
    outputs,
    boards: boards.length,
    pinExtremes: [...extremes.values()],
    combinations: [...combos.values()],
    readings,
    issues: [...(readings?.issues ?? []).filter((i) => i.severity === 'info'), ...issues, ...flags.values(), ...warnings.values(), ...(checks > 0 ? clips.notes() : [])],
  };
}

// A run's steps: at least its length over RUN_STEPS (runCircuit), the same as layout's line.
export const RUN_STEPS = 20000;
// Steps per period, on average, under which a run's rhythm of an output is not its own: a 555 at 100
// steps a period reads 0.6 % slow (backward Euler), at 25 steps 2.6 % [measured, sim/run.js tests].
const FAST = 100;
// Shorter runs that may measure a fast rhythm again, each from what the one before counted (a step that
// beats with the changes counts fewer of them than there are).
const REMEASURES = 2;
// Its period, or, when it toggles but not regularly (a step longer than its changes beats with them),
// two changes' worth of the run.
const periodOf = (o, end) => (o.period > 0 ? o.period : o.changes > 2 ? (2 * end) / o.changes : null);
const stepsPer = (o, steps, end) => (periodOf(o, end) > 0 && end > 0 ? (steps * periodOf(o, end)) / end : Number.POSITIVE_INFINITY);
// A board's pin changes when its program writes it (a step ends there): always measured.
function unresolved(o, steps, end) {
  const of = (x) => x.kind !== 'pin' && stepsPer(x, steps, end) < FAST;
  const sound = o.sound && of(o.sound);
  if (!of(o) && !sound) return o;
  const { periods, ...rest } = o;
  return { ...rest, frequency: null, period: null, duty: null, fast: true, ...(o.tone && of(o) && { tone: null }), ...(sound && { sound: { ...o.sound, frequency: null, period: null, duty: null } }) };
}
// The length of run whose step follows the fastest of them (twice FAST steps in its period as the
// changes counted it), at most the run's: its period may be shorter still, and that run says so.
function shorterRun(fast, end, total) {
  const period = Math.min(...fast.map((o) => periodOf(o, end) ?? end));
  return Math.min(total, Number(((period * RUN_STEPS) / (2 * FAST)).toPrecision(1)));
}

// Warnings about a level that must last, judged on a settled state (runCircuit's look): the others are
// about a peak that damages at once, judged at their strongest.
const LEVELS = new Set(['SIM_RELAY_UNDERDRIVEN', 'SIM_RELAY_COIL', 'SIM_IC_INPUT_LEVEL', 'SIM_IC_SUPPLY_RANGE', 'SIM_MODULE_LOW_SUPPLY', 'SIM_REG_DROPOUT', 'SIM_REG_HOT', 'SIM_REG_HOT_MODULE', 'SIM_LASER_DIM', 'SIM_LASER_POWER', 'SIM_MOTOR_STALL', 'SIM_MOTOR_VOLTAGE', 'SIM_BUZZER_DC', 'SIM_HALL_HIGH_SUPPLY', 'SIM_SUPPLY_LIMITED', 'SIM_BATTERY_CHARGING']);
const SETTLE_TAUS = 5; // of the part's longest time constant, a level held that long has settled
const SETTLED = 0.02; // relative change between two looks under which a level has stopped moving [assumed]

// A warning's first quantity ({ value, unit }), as a size to keep the strongest of a run.
function strength(w) {
  const q = Object.values(w.params ?? {}).find((v) => v && typeof v === 'object' && typeof v.value === 'number');
  return q ? Math.abs(q.value) : 0;
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

const notesOf = (w) => (w.notes ?? []).map((n) => ({ frequency: n.cycles / n.time, start: n.start, length: n.end - n.start }));
const oneNote = (notes) => notes.every((n) => Math.abs(n.frequency / notes[0].frequency - 1) <= NOTE_SAME);
function summary(w, end) {
  const out = spansOf(w, end);
  if (w.kind === 'pin') {
    closeNote(w, w.lit ? end : w.falls.at(-1));
    const notes = notesOf(w);
    // A pin that plays several notes has no one rhythm (the last periods are the last note's).
    if (notes.length < 2 || oneNote(notes)) return out;
    return { ...out, frequency: null, period: null, duty: null, notes, ...(w.notesTotal > notes.length && { notesTotal: w.notesTotal }) };
  }
  if (!w.sound) return out;
  const s = w.sound;
  // A sound still going at the end lasts to its last change, or to the end while it changes.
  if (s.lit && end - s.last >= SOUND_GAP) edge(s, s.last, false);
  closeNote(s, s.lit ? end : s.last);
  const { id, kind, ...sound } = spansOf(s, end);
  // The tone: whole cycles, rise to rise, inside the sounds; one figure only when every note has it.
  const notes = notesOf(s);
  const one = notes.length > 0 && oneNote(notes);
  const tone = s.cycles > 0 && s.cycleTime > 0 && (one || !notes.length) ? { frequency: s.cycles / s.cycleTime, period: s.cycleTime / s.cycles } : null;
  // Several notes: its current has no one rhythm either (the last periods are the last note's).
  if (notes.length > 1 && !one) Object.assign(out, { frequency: null, period: null, duty: null });
  return { ...out, sound: { ...sound, starts: s.kept + (s.lit ? 1 : 0) }, tone, ...(notes.length && { notes, ...(s.notesTotal > notes.length && { notesTotal: s.notesTotal }) }) };
}
function spansOf(w, end) {
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
    ...(r && { periods: r.periods }),
    intervals,
    ...(w.kept + (w.lit ? 1 : 0) > intervals.length && { intervalsTotal: w.kept + (w.lit ? 1 : 0) }),
  };
}

// ── Resting states ───────────────────────────────────────────────────────────────────
// A circuit with two resting states (a transistor latch, a flip-flop): its DC point can be the balance
// between them, both transistors half on, which a real circuit never sits in (any noise tips it). The
// test is a push: every node gets a small capacitance to ground (PARASITIC, what a real node has,
// none in the DC point), the circuit starts at its DC point, one node is pushed by PUSH volts up and
// then down, and it settles. A stable point takes the push back; a balance point runs away from it,
// to a resting state on each side. The pushed nodes are the transistors' bases and gates, where a
// loop of gain closes (one transistor alone has no loop: two at least). The states are then solved
// again without the capacitances (engine.seed), so their readings are the circuit's own.
// A Jacobian's eigenvalues would say the same without stepping, but the system holds voltage sources
// and switches whose rows are not dynamics; the push uses the engine the page runs.
//   restingStates(circuit, compiled?) → null | { states: [{ nodes, reading, on: [output ids] }] }
const PARASITIC = 1e-9; // F on each node [assumed: a breadboard strip and a part's pins, pF to nF]
const PUSH = 0.05; // V
const PUSH_STEP = 1e-6; // s
const PUSH_STEPS = 4000;
const RAN_AWAY = 0.5; // V on some node: it did not come back
const CAME_BACK = PUSH / 10;
const PUSHED_NODES = 4;
// Each transistor of a reading, on or off: what tells two resting states apart.
export const gainsOf = (reading) => Object.entries(reading?.parts ?? {}).filter(([, p]) => p.kind === 'Q' || p.kind === 'M').map(([id, p]) => ({ id, on: p.region !== 'off' }));

export function restingStates(circuit, given = null) {
  const compiled = given ?? compile(circuit);
  if (compiled.fatal) return null;
  const { program } = compiled;
  const devices = (program.devices ?? []).filter((d) => !d.unsupported);
  const gains = devices.filter((d) => d.kind === 'Q' || d.kind === 'M');
  if (gains.length < 2 || runsByItself(program) || devices.some((d) => d.kind === 'MCU' || d.kind === 'TMR' || d.kind === 'OPA')) return null;
  const rails = new Set([program.ground, ...(program.supplies ?? []).flatMap((s) => [s.p, s.n])]);
  const pushed = [...new Set(gains.map((d) => d.pins.find((p) => p.name === 'B' || p.name === 'G')?.node).filter((n) => n && !rails.has(n)))].slice(0, PUSHED_NODES);
  if (!pushed.length) return null;
  const parasitic = (program.nodes ?? []).filter((n) => !rails.has(n)).map((node, k) => ({ id: `~P${k}`, type: 'capacitor', kind: 'C', pins: [{ name: '+', node }, { name: '-', node: program.ground }], params: { capacitance: PARASITIC, polarised: false, maxVoltage: Number.POSITIVE_INFINITY } }));
  const engine = createEngine({ ...program, devices: [...program.devices, ...parasitic] });
  if (!engine.start('dc', PUSH_STEP)) return null;
  const rest = engine.read().nodes;
  const away = (nodes) => Math.max(0, ...Object.keys(rest).map((n) => (nodes[n] == null || rest[n] == null ? 0 : Math.abs(nodes[n] - rest[n]))));
  const found = [];
  for (const node of pushed) {
    for (const sign of [1, -1]) {
      if (!engine.start('dc', PUSH_STEP) || !engine.nudge(node, sign * PUSH)) return null;
      let last = null;
      for (let k = 0; k < PUSH_STEPS; k++) {
        if (!engine.step(PUSH_STEP)) return null;
        const nodes = engine.read().nodes;
        const far = away(nodes);
        if (far < CAME_BACK && k > 10) break;
        // Settled away from the point: nothing moves by more than a microvolt a step.
        if (far > RAN_AWAY && last && away(Object.fromEntries(Object.keys(nodes).map((n) => [n, nodes[n] - (last[n] ?? 0) + (rest[n] ?? 0)]))) < 1e-6) {
          last = nodes;
          break;
        }
        last = nodes;
      }
      if (!last || away(last) <= RAN_AWAY) continue;
      if (!found.some((s) => Math.max(...Object.keys(last).map((n) => Math.abs((s[n] ?? 0) - (last[n] ?? 0)))) < RAN_AWAY)) found.push(last);
    }
    if (found.length >= 2) break;
  }
  if (found.length < 2) return null;
  // Each state solved again on the circuit as it is (no capacitances added), from where it settled.
  const own = createEngine(program);
  const outputs = outputsOf(program);
  const states = [];
  for (const nodes of found.slice(0, 2)) {
    if (!own.start('dc', PUSH_STEP) || !own.seed(nodes)) return null;
    const reading = own.now();
    if (!reading?.ok || away(reading.nodes) <= RAN_AWAY) return null;
    states.push({ nodes: reading.nodes, reading, on: outputs.filter((o) => outputOn(o, reading.parts?.[o.part])).map((o) => o.id) });
  }
  return { states };
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
// circuit that does not run by itself. It is simulate --run of the same length (the same step, a
// fast rhythm measured again in the same shorter run), so the two give the same figures; fewer than
// ABOUT_PERIODS whole periods: `about`. Its limits are read once, at the end (the review judges the
// hazards).
export const BEHAVIOUR_STEPS = 25000;
export function behaviourOf(circuit, { seconds = 2, maxSteps = BEHAVIOUR_STEPS } = {}) {
  const compiled = compile(circuit);
  if (compiled.fatal || !runsByItself(compiled.program)) return null;
  const r = runCircuit(circuit, { seconds, maxSteps, checks: 0, compiled });
  if (!r.ok && r.errors) return null;
  if (!r.ok) return { seconds, skipped: r.issues.find((i) => i.severity === 'error') ?? issue('error', 'SIM_NO_CONVERGENCE', {}) };
  const budget = r.issues.find((i) => i.code === 'RUN_STEPS' || i.code === 'RUN_BUDGET');
  if (budget) return { seconds, skipped: budget };
  const outputs = r.outputs.map((o) => (o.measured && o.periods < ABOUT_PERIODS ? { ...o, about: true } : o));
  // The boards whose program waits for serial input nothing gives it (layout.behaviour.waitsSerial).
  const waits = [...new Set(r.issues.filter((i) => i.code === 'SIM_SERIAL_WAITS').map((i) => String(i.params.part)))];
  return { seconds, start: r.run.start, outputs, ...(waits.length && { serialWaits: waits }) };
}
const ABOUT_PERIODS = 5; // whole periods under which a frequency is said as "about"
