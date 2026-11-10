// The engine: runs a compiled program (compile.js). No dependencies outside src/sim and the
// devices, so the same code runs in Node (simulate, the CLI, the MCP server) and, bundled, in
// the browser page.
//
//   const engine = createEngine(program)
//   engine.dc()                                         → operating point (each part with its
//                                                         `stress`: value against each limit)
//   engine.transient({ stop, step, start, points })     → time series
//                                                       (with emitters it steps this engine:
//                                                       one step of delay, programs held)
// And step by step, for the live page:
//   engine.start('dc' | 'zero', h) → ok    the state at t = 0 (DC values, or switched on with
//                                          capacitors discharged)
//   engine.step(h) → ok                    one time step of h seconds (a failed one changes nothing)
//   engine.advance(h) → ok                 h seconds: one step, or shorter ones where Newton fails;
//                                          a step ends on each element's event inside h (`until()`)
//   engine.read() → { nodes, parts, supplies }   the values now;  engine.time  seconds since start
//   engine.stresses(reading) → { part: [stress…] }   each part against its limits (devices/)
//   engine.timeConstants() → [seconds…]    τ = C·R and L/R of each capacitor and inductor, with R
//                                          the resistance it sees at the DC operating point, and
//                                          an element's own times (a relay's `times`)
//   engine.periods() → [seconds…]          the period of each signal generator (generator.js);
//                                          their sources follow the wave at every time step
// Controls (sliders, the push button):
//   engine.controls() → [{ id, field, min, max, scale, unit, value… }]   what may change (controls.js)
//   engine.set(id, field, value) → ok      change it: the system is rebuilt, its state carried
//                                          over (node voltages by name, capacitor and inductor
//                                          memory, junction voltages, and the keys a device lists
//                                          in `state`: a timed sensor's phase and clock) and
//                                          solved again at once
//   engine.stepHint() → seconds | null     the step a running PWM or tone needs, or an element's
//                                          own `maxStep()` while it is timing
// The environment (environment.js; only when the circuit declares one): its fields are controls with
// the id 'environment'; every part that follows a field changes with it (its device's `sense`).
//   engine.set('environment', field, value) → ok   a value by hand (a program there pauses)
//   engine.resume('environment', field) → ok       a paused program runs again, from its beginning
//   engine.attach(id, field) → ok                  a part that left a field (its own control moved)
//                                                  follows it again
//   engine.environment() → { field: value }        what the sensors see now (the ambient plus what
//                                                  the emitters add);  engine.stimuli() → [seconds…]
//                                                  the span of each running program and of each
//                                                  element with a clock of its own (the page's pace)
//   engine.ambient() → { field: value }            the ambient alone (the circuit, a slider, a program)
//   engine.emissions() → { field: { total, parts: { id: value }, blocked? } }   what each emitter adds
//                                                  now ({} without emitters)
// Programs move with simulated time, before each step (as a generator's wave); dc() and the start
// take them at t = 0. transient() keeps the environment as it is (programs run in the page).
// dc() on a started engine solves the circuit as the sensors last felt it (no fixed point of its own).
// Emitters (a device with `emits` and `emit(entry, reading)`: a laser writes `light`): what one adds
// in a time step reaches the sensors in the next (one step of delay). At the start, after a set and in
// dc() the engine iterates (solve → emissions → the sensors feel them → solve) until the emissions
// settle (EMIT_SETTLED) or EMIT_ROUNDS rounds; a loop that does not settle (a lamp that turns itself
// off) keeps the last round and says SIM_ENV_FEEDBACK. Without emitters none of this runs.
//
// Every result is a **model**: ideal strips, typical part values (models.js).

import { resistor, voltageSource, currentSource, operatingPoint, newton, Stamper, solveInPlace } from './mna.js';
import { GMIN } from './models.js';
import { deviceOfProgram } from './devices/index.js';
import { issue, q, volt, stressIssue } from './devices/shared.js';
import { supplyControls, setSupply, stressLevel } from './controls.js';
import { waveAt, peakOf } from './generator.js';
import { FIELDS, createEnvironment, environmentControls, seenValues, emittedShare, isBlocked } from './environment.js';

const SHORT_CURRENT = 3; // amperes from an unlimited source that mean "short circuit"
const ADVANCE_SPLITS = 4; // advance(h): halvings of a step that failed, at most (h/16)
// advance(h) ends a step on each event inside h (an element's `until()`: a program waking, a timed
// sensor's edge), at most LANDINGS of them; an event closer than LAND_MIN is now. A sketch that wakes
// every microsecond still gets h back in LANDINGS + 1 steps.
const LANDINGS = 1000;
const LAND_MIN = 1e-9;
// What an element changes while Newton iterates (junction limiting, an op-amp's rail edge).
const LIMITING = ['vd', 'vgs', 'vds', 'vbe', 'vbc', 'edge'];
const EMIT_ROUNDS = 8; // solve → emissions → sensors rounds before a loop is called feedback
const EMIT_SETTLED = 1e-3; // relative change of every emission under which they have settled

// Elements, node indices and islands, from the program. Ground is index −1.
function prepare(program) {
  const issues = [...program.issues];
  const index = new Map([[program.ground, -1]]);
  const names = [];
  const nodeIndex = (name) => {
    if (!index.has(name)) {
      index.set(name, names.length);
      names.push(name);
    }
    return index.get(name);
  };
  for (const name of program.nodes) nodeIndex(name);
  // Supplies change while solving (current limit), so each engine has its own copies.
  const supplies = program.supplies.map((s) => ({ ...s }));
  let internal = 0;
  const inner = (label) => nodeIndex(`~${label}#${internal++}`);

  const elements = [];
  const parts = [];
  const emitters = []; // the parts that write the environment (only in a circuit that declares one)
  const owned = new Map(); // part id → its elements, in the order it added them (state carry-over)
  const carried = new Map(); // part id → the keys of its elements to carry over: STATE and the device's own `state`
  // Each part: its device adds the elements and keeps what its reading needs (devices/).
  for (const d of program.devices) {
    const entry = { id: d.id, kind: d.kind, pins: d.pins.map((p) => ({ name: p.name, node: p.node, index: nodeIndex(p.node) })) };
    if (d.unsupported) entry.unsupported = true;
    else {
      // A sensor: the fields it could follow, the ones it follows and their values (compile.js).
      if (d.senses) entry.world = { senses: d.senses, follows: d.follows ?? [], env: d.env ?? {} };
      const device = deviceOfProgram(d);
      const h = {
        id: d.id,
        pin: (name) => entry.pins.find((p) => p.name === name).index,
        at: (i) => entry.pins[i].index,
        inner: () => inner(d.id),
        // A node by name, shared with the program (a board's own ground when no pin of it is wired).
        node: (name) => nodeIndex(name),
        add: (el) => {
          elements.push(el);
          owned.set(d.id, [...(owned.get(d.id) ?? []), el]);
          return el;
        },
        supplies,
      };
      Object.assign(entry, d.params, { device }, device.elements(d.params, h));
      if (device.state) carried.set(d.id, [...STATE, ...device.state]);
      if (d.emits && program.environment && device.emit) {
        entry.emits = d.emits;
        emitters.push(entry);
      }
    }
    parts.push(entry);
  }

  for (const s of supplies) {
    s.pIndex = index.get(s.p);
    s.nIndex = index.get(s.n);
    s.top = s.internalResistance > 0 ? inner(s.id) : s.pIndex;
    s.series = s.internalResistance > 0 ? resistor(s.top, s.pIndex, s.internalResistance) : null;
    s.mode = 'CV';
  }

  // Islands: parts of the circuit with no DC path to ground. Another supply's island gets
  // its own reference (a 0 V link to ground, carrying no current); anything else floats.
  const parent = new Map();
  const find = (a) => {
    while (parent.get(a) !== a) a = parent.get(a);
    return a;
  };
  const union = (a, b) => parent.set(find(a), find(b));
  for (let i = -1; i < names.length; i++) parent.set(i, i);
  for (const el of elements) for (const [a, b] of el.links) union(a, b);
  for (const s of supplies) {
    if (s.off) continue;
    union(s.top, s.nIndex);
    if (s.series) union(s.top, s.pIndex);
  }
  const tied = [];
  for (const s of supplies.slice(1)) {
    if (find(s.nIndex) !== find(-1)) {
      tied.push(s.nIndex);
      union(s.nIndex, -1);
      issues.push(issue('info', 'SIM_SEPARATE_CIRCUIT', { supply: s.id }));
    }
  }
  const floating = new Set(names.filter((name, i) => find(i) !== find(-1) && !name.startsWith('~')));
  // In DC, each floating island is anchored to ground at one node. No direct current can flow in
  // it, so nothing changes, but its matrix rows are no longer left with only GMIN, which an
  // inductor (a 1 MΩ⁻¹ short in DC) makes numerically singular. In a transient the anchor is
  // off: a capacitor may couple the island to the rest.
  const anchors = new Map();
  for (let i = 0; i < names.length; i++) if (find(i) !== find(-1) && !anchors.has(find(i))) anchors.set(find(i), dcAnchor(i));

  // Voltage sources and regulators last: their current unknowns go after every node voltage.
  const nodeCount = names.length;
  let row = nodeCount;
  for (const el of elements) if (el.needsRow) el.branch = row++;
  for (const s of supplies) if (!s.off) s.source = voltageSource(s.top, s.nIndex, row++, s.voltage);
  const references = tied.map((n) => voltageSource(n, -1, row++, 0));
  const all = [...elements, ...supplies.filter((s) => !s.off).flatMap((s) => [s.source, s.series].filter(Boolean)), ...references, ...anchors.values()];
  return { issues, members: program.members, supplies, parts, emitters, owned, carried, names, index, ground: program.ground, floating, system: { size: row, nodeCount, elements: all } };
}

// Signal generators: their sources at time t (DC and the start are t = 0).
function setTime(prep, t) {
  for (const s of prep.supplies) if (s.generator && s.source && s.mode === 'CV') s.source.voltage = waveAt(s.generator, t);
}

// 1 S from a node to ground, in DC only (no time step): see the floating islands in prepare().
function dcAnchor(node) {
  return {
    nodes: [node],
    links: [],
    stamp(st, x, ctx) {
      if (!ctx.h) st.add(node, node, 1);
      return false;
    },
    currents: () => [0],
  };
}

// ── Reading results ─────────────────────────────────────────────────────────────────

function supplyReading(s, x, ctx) {
  if (s.off) return { voltage: volt(x, s.pIndex) - volt(x, s.nIndex), current: 0, power: 0, mode: 'OFF' };
  if (s.generator) {
    const current = -s.source.currents(x, ctx)[0];
    const v = volt(x, s.pIndex) - volt(x, s.nIndex);
    return { voltage: v, current, power: v * current, mode: 'GEN', peak: peakOf(s.generator) };
  }
  if (s.mode === 'CC') {
    const v = volt(x, s.pIndex) - volt(x, s.nIndex);
    return { voltage: v, current: s.cc.current, power: v * s.cc.current, mode: 'CC' };
  }
  const current = -s.source.currents(x, ctx)[0]; // delivered out of +
  const v = volt(x, s.pIndex) - volt(x, s.nIndex);
  return { voltage: v, current, power: v * current, mode: 'CV' };
}

function partReading(entry, x, ctx, floating) {
  const pins = Object.fromEntries(entry.pins.map((p) => [p.name, floating.has(p.node) ? null : volt(x, p.index)]));
  const out = { kind: entry.kind, pins };
  const h = { x, ctx, volt: (i) => volt(x, i), supplyReading: (s) => supplyReading(s, x, ctx) };
  if (entry.device) Object.assign(out, entry.device.read(entry, h));
  else out.unsupported = true;
  if (entry.pins.some((p) => floating.has(p.node))) out.floating = true;
  // Which field of the environment it follows now, at which value, or its own value (lines.js).
  if (entry.world) out.env = entry.world.senses.map((field) => (entry.world.follows.includes(field) ? { field, follows: true, value: entry.world.env[field] } : { field, follows: false }));
  out.pinCurrents = pinCurrents(entry, out, h);
  return out;
}

// Current into the part at each pin (amperes, positive = into the part). Kirchhoff: they add
// up to zero. The current-flow layer reads these.
function pinCurrents(entry, out, h) {
  const names = entry.pins.map((p) => p.name);
  if (out.unsupported) return Object.fromEntries(names.map((n) => [n, 0]));
  if (entry.device.pinCurrents) return entry.device.pinCurrents(entry, out, h);
  if (out.currents) return { ...out.currents };
  return { [names[0]]: out.current ?? 0, [names[1]]: -(out.current ?? 0) };
}

function readAll(prep, x, ctx) {
  const nodes = {};
  for (const [name, i] of prep.index) if (!name.startsWith('~')) nodes[name] = prep.floating.has(name) ? null : volt(x, i);
  const parts = Object.fromEntries(prep.parts.map((p) => [p.id, partReading(p, x, ctx, prep.floating)]));
  const supplies = Object.fromEntries(prep.supplies.map((s) => [s.id, { kind: s.kind, ...supplyReading(s, x, ctx) }]));
  return { nodes, parts, supplies };
}

// Warnings a learner should see: limits exceeded (each device's stresses), a supply in
// current limit, floating nodes. Batteries (sources) after every other part.
export function partStresses(entry, reading) {
  return entry.device?.limits ? entry.device.limits(entry, reading) : [];
}

function limitIssues(prep, reading) {
  const out = [];
  const say = (p) => {
    for (const item of partStresses(p, reading.parts[p.id])) {
      if (item.note) out.push(item.note);
      else if (item.ratio > 1) out.push(stressIssue(p.id, item));
    }
  };
  for (const p of prep.parts) if (!p.device?.source && !reading.parts[p.id].floating) say(p);
  for (const p of prep.parts) if (p.device?.source) say(p);
  for (const s of prep.supplies) {
    if (s.part) continue; // drawn batteries: above
    const r = reading.supplies[s.id];
    if (r.mode === 'CC') out.push(issue('warning', 'SIM_SUPPLY_LIMITED', { supply: s.id, limit: q(s.currentLimit, 'A'), voltage: q(r.voltage, 'V') }));
    else if (r.current > SHORT_CURRENT) out.push(issue('warning', 'SIM_SHORT_CIRCUIT', { supply: s.id, current: q(r.current, 'A') }));
  }
  const floating = [...prep.floating].filter((n) => prep.members[n]);
  if (floating.length) out.push(issue('warning', 'SIM_FLOATING', { nodes: floating.join(', '), parts: [...new Set(floating.flatMap((n) => prep.members[n]))].join(', ') }));
  return out;
}

// Bench supplies with a current limit: if a solution asks for more, the supply becomes a
// current source at its limit (constant current, CC) and the answer is solved again.
function solveWithLimits(prep, x0, ctx) {
  let result = operatingPoint(prep.system, x0, ctx);
  for (let round = 0; round < 4 && result.ok; round++) {
    let changed = false;
    for (const s of prep.supplies) {
      if (s.currentLimit == null || s.mode === 'CC') continue;
      const delivered = -s.source.currents(result.x, ctx)[0];
      if (delivered > s.currentLimit * (1 + 1e-6)) {
        s.mode = 'CC';
        const i = prep.system.elements.indexOf(s.source);
        // Keep the branch row alive with a 0 A current through a dummy equation.
        s.cc = currentSource(s.source.nodes[0], s.source.nodes[1], s.currentLimit);
        prep.system.elements[i] = {
          ...s.cc,
          stamp(st, x, c) {
            st.add(s.source.branch, s.source.branch, 1);
            return s.cc.stamp(st, x, c);
          },
        };
        changed = true;
      }
    }
    if (!changed) break;
    result = operatingPoint(prep.system, result.x, ctx);
  }
  return result;
}

// ── Emitters ────────────────────────────────────────────────────────────────────────

// What the emitters add now, from each one's reading ({ field: { total, parts } }): a level sums
// them, a switch is on when any is.
function measure(prep, readingOf) {
  const out = {};
  for (const p of prep.emitters) {
    const r = readingOf(p);
    const given = r && !r.floating ? (p.device.emit(p, r) ?? {}) : {};
    for (const field of p.emits) {
      const v = Number.isFinite(given[field]) ? given[field] : 0;
      const e = (out[field] ??= { total: 0, parts: {} });
      e.parts[p.id] = v;
      e.total = FIELDS[field].kind === 'switch' ? Math.max(e.total, v ? 1 : 0) : e.total + v;
    }
  }
  return out;
}

// The fields whose emissions changed from `a` to `b` by more than EMIT_SETTLED (relative), part by part.
function unsettled(a, b) {
  const fields = new Set([...Object.keys(a), ...Object.keys(b)]);
  return [...fields].filter((field) => {
    const ids = new Set([...Object.keys(a[field]?.parts ?? {}), ...Object.keys(b[field]?.parts ?? {})]);
    return [...ids].some((id) => {
      const [u, v] = [a[field]?.parts[id] ?? 0, b[field]?.parts[id] ?? 0];
      return Math.abs(u - v) > Math.max(1e-9, EMIT_SETTLED * Math.max(Math.abs(u), Math.abs(v)));
    });
  });
}

// The note of a loop that did not settle: which emitters, which field, which sensors follow it.
function feedbackIssue(program, prep, fields) {
  const field = fields[0];
  const emitters = prep.emitters.filter((p) => p.emits.includes(field)).map((p) => p.id);
  const sensors = program.devices.filter((d) => d.follows?.includes(field)).map((d) => d.id);
  return issue('warning', 'SIM_ENV_FEEDBACK', { field, emitters: emitters.join(', '), sensors: sensors.join(', ') || '—', rounds: EMIT_ROUNDS });
}

// ── The engine ──────────────────────────────────────────────────────────────────────

export function createEngine(source) {
  // Controls change the program, so each engine works on its own copy.
  const program = JSON.parse(JSON.stringify(source));
  let prep = prepare(program);
  let lastH = 1e-3;
  // Stepping state. A step's memory (capacitor voltage, inductor current) is accepted at the
  // start of the next one, so read() between steps still sees the current through a capacitor.
  let x = null;
  let ctx = {};
  let pending = null;
  let time = 0;
  // LED brightness summed over the steps since the page last asked (glow()): a PWM switches faster
  // than the page paints, and the eye sees the average.
  let glowSum = new Map();
  let glowTime = 0;
  const memories = () => prep.system.elements.filter((el) => 'accept' in el);
  // The soonest event of an element (`until()`, seconds from now), or null. The step before is
  // accepted first, as step() does: an element's clock must be the one of now.
  function nextEvent() {
    if (!x) return null;
    if (pending) for (const el of memories()) el.accept(x, pending);
    pending = null;
    let soon = null;
    for (const el of prep.system.elements) {
      const u = el.until?.();
      if (u > 0 && (soon === null || u < soon)) soon = u;
    }
    return soon;
  }
  const env = program.environment ? createEnvironment(program.environment.spec, program.environment.fields) : null;
  // Emitters: what they add now (`emitted`, measured after each solve) and what the sensors last felt
  // (`used`: the emission of the step before, or of the last round of a fixed point). `feedback`: the
  // note of a fixed point that did not settle.
  let emitted = {};
  let used = {};
  let feedback = null;
  const emitting = () => Boolean(env) && prep.emitters.length > 0;
  const seen = (ambient) => (emitting() ? seenValues(ambient, used) : ambient);
  const withFeedback = (r) => (feedback && r.issues ? { ...r, issues: [...r.issues, feedback] } : r);
  // Each emitter's reading says what it adds and whether that is blocked (its card's line).
  const mark = (reading) => {
    if (!emitting() || !reading) return reading;
    const ambient = env.values();
    for (const p of prep.emitters) {
      const r = reading.parts[p.id];
      if (!r) continue;
      r.emission = Object.fromEntries(p.emits.map((field) => [field, { value: emitted[field]?.parts[p.id] ?? 0, blocked: isBlocked(field, ambient), ...(FIELDS[field].blockedBy && { blockedBy: FIELDS[field].blockedBy }) }]));
    }
    return reading;
  };
  // The fixed point in DC, before any start (no live state to keep): solve, measure, let the sensors
  // feel it, solve again (a new prepare only when one of them changed), until it settles.
  function settleDC() {
    feedback = null;
    let result = null;
    for (let round = 0; round < EMIT_ROUNDS; round++) {
      if (feel(program, seenValues(env.values(), used))) prep = prepare(program);
      result = dc(prep);
      if (!result.ok) return result;
      const m = measure(prep, (p) => result.parts[p.id]);
      const moved = unsettled(used, m);
      emitted = m;
      if (!moved.length) {
        mark(result);
        return result;
      }
      if (round === EMIT_ROUNDS - 1) {
        feedback = feedbackIssue(program, prep, moved);
        break;
      }
      used = m;
    }
    mark(result);
    return withFeedback(result);
  }
  // After a rebuild of a running engine: the same rounds, each one a rebuild with the state carried.
  function settleLive() {
    if (!emitting()) return true;
    if (!x) {
      settleDC();
      return true;
    }
    feedback = null;
    for (let round = 0; round < EMIT_ROUNDS; round++) {
      const m = measure(prep, (p) => partReading(p, x, ctx, prep.floating));
      const moved = unsettled(used, m);
      emitted = m;
      if (!moved.length) return true;
      if (round === EMIT_ROUNDS - 1) {
        feedback = feedbackIssue(program, prep, moved);
        return true;
      }
      used = m;
      if (feel(program, seenValues(env.values(), used)) && !rebuild()) return false;
    }
    return true;
  }
  const rebuildSettled = () => rebuild() && settleLive();
  // The program changed (a control, the environment): prepared again with the state carried over
  // and, unless `solve` is false (a step solves it next), solved at once (a very short step, as at
  // t = 0): a paused circuit shows the change too.
  function rebuild(solve = true) {
    const old = prep;
    prep = prepare(program);
    setTime(prep, time);
    if (!x) return true;
    // The memories hold the state at this instant; the new elements take it over.
    if (pending) for (const el of old.system.elements) if ('accept' in el) el.accept(x, pending);
    carryState(old, prep);
    const start = new Array(prep.system.size).fill(0);
    for (const [name, i] of prep.index) {
      const j = old.index.get(name);
      if (i >= 0 && j != null && j >= 0) start[i] = x[j];
    }
    if (!solve) {
      x = start;
      pending = null;
      return true;
    }
    const now = { h: lastH * 1e-6 };
    const r = solveWithLimits(prep, start, now);
    if (!r.ok) return false;
    x = r.x;
    ctx = now;
    pending = null;
    return true;
  }
  // A circuit with emitters starts at its fixed point: dc(), environment() and a set before any start
  // already see the emitters' light.
  if (emitting()) settleDC();
  // A transient with emitters steps this engine (its start, its step with the programs held), so the
  // emitters reach the sensors one step later as in the page; without emitters, the fixed prep's loop.
  const drive = {
    prep: () => prep,
    begin: (start, h) => (api.start(start, h) ? null : 'SIM_NO_CONVERGENCE'),
    step: (t, h) => api.step(h, true),
    read: (c) => readAll(prep, x, c),
  };
  const api = {
    dc: () => (!emitting() ? dc(prep) : x ? mark(withFeedback(dc(prep))) : settleDC()),
    transient: (options) => (emitting() ? transient(prep, options, drive) : transient(prep, options)),
    start(mode = 'dc', h = 1e-3) {
      lastH = h;
      const ambient = env ? env.rewind() : null;
      // With emitters, the start is solved again until what they add settles (one round without them).
      for (let round = 0; ; round++) {
        if (env) feel(program, seen(ambient));
        prep = prepare(program);
        setTime(prep, 0);
        x = new Array(prep.system.size).fill(0);
        if (mode === 'dc') {
          const r = solveWithLimits(prep, x, {});
          if (!r.ok) return false;
          x = r.x;
          for (const el of memories()) el.accept(x, {});
        }
        // t = 0: memories hold their starting values (a very short step pins them there).
        ctx = { h: h * 1e-6 };
        const first = settle(prep, solveWithLimits(prep, x, ctx), ctx);
        if (!first.ok) return false;
        x = first.x;
        pending = null;
        time = 0;
        if (!emitting()) return true;
        const m = measure(prep, (p) => partReading(p, x, ctx, prep.floating));
        const moved = unsettled(used, m);
        emitted = m;
        feedback = null;
        if (!moved.length) return true;
        if (round === EMIT_ROUNDS - 1) {
          feedback = feedbackIssue(program, prep, moved);
          return true;
        }
        used = m;
      }
    },
    // `hold`: the environment's programs stay where they are (a transient, as before emitters).
    step(h, hold = false) {
      if (!x) return false;
      if (pending) for (const el of memories()) el.accept(x, pending);
      pending = null;
      const next = { h };
      lastH = h;
      setTime(prep, time + h);
      // The environment's programs at the end of the step: the parts that follow them change first,
      // with what the emitters added in the step before (one step of delay).
      if (emitting()) used = emitted;
      if (env && feel(program, seen(hold ? env.values() : env.at(time + h)))) {
        rebuild(false);
        setTime(prep, time + h);
      }
      // A failed step leaves everything as the last accepted one did: the sources at its time, and
      // the junctions' limiting voltages too, so a retry starts from that step and not from the
      // failed iterations.
      const before = prep.system.elements.map((el) => LIMITING.filter((key) => key in el).map((key) => [key, el[key]]));
      const r = newton(prep.system, x, next);
      if (!r.ok) {
        setTime(prep, time);
        prep.system.elements.forEach((el, k) => {
          for (const [key, value] of before[k]) el[key] = value;
        });
        return false;
      }
      x = r.x;
      ctx = next;
      pending = next;
      time += h;
      if (emitting()) emitted = measure(prep, (p) => partReading(p, x, ctx, prep.floating));
      for (const p of prep.parts) {
        if ((p.kind !== 'LED' && p.kind !== 'LEDS') || p.unsupported) continue;
        const r = partReading(p, x, ctx, prep.floating);
        glowSum.set(p.id, (glowSum.get(p.id) ?? 0) + (r.brightness ?? 0) * h);
        // A part of several LEDs: each chip's too, as "<part>.<pin>" (the page mixes and lights them).
        for (const [pin, c] of Object.entries(r.channels ?? {})) glowSum.set(`${p.id}.${pin}`, (glowSum.get(`${p.id}.${pin}`) ?? 0) + c.brightness * h);
      }
      glowTime += h;
      return true;
    },
    // One step of h, as step(); when Newton fails, the same h in two halves (each split again, down
    // to a sixteenth). The step that follows is h again: a hard instant (diodes switching) costs a
    // few more steps there and slows nothing after it. false when even the shortest piece fails.
    advance(h, depth = ADVANCE_SPLITS, land = true) {
      // Events inside h (a program waking from delayMicroseconds, a sensor's edge) end steps of
      // their own, so what reads them sees them at their time (pulseIn, docs/en/microcontrollers.md).
      for (let k = 0; land && k < LANDINGS; k++) {
        const soon = nextEvent();
        if (!(soon > LAND_MIN && soon < h - LAND_MIN)) break;
        if (!this.advance(soon, ADVANCE_SPLITS, false)) return false;
        h -= soon;
      }
      if (this.step(h)) return true;
      return depth > 0 && this.advance(h / 2, depth - 1, false) && this.advance(h / 2, depth - 1, false);
    },
    read: () => (x ? mark(readAll(prep, x, ctx)) : null),
    get time() {
      return time;
    },
    stresses(reading) {
      const out = {};
      for (const p of prep.parts) {
        const r = reading.parts[p.id];
        if (!r || r.floating) continue;
        const list = partStresses(p, r).filter((s) => !s.note);
        if (list.length) out[p.id] = list;
      }
      return out;
    },
    timeConstants: () => timeConstants(prep),
    // A board runs a program: the page steps in real time even with no C, L or generator.
    hasProgram: () => prep.system.elements.some((el) => el.settle),
    // The step a running PWM or tone needs (a twentieth of its period), or null.
    // An element with timers asks for a step of its own with `maxStep()` (seconds, or null when
    // nothing is timing): a timed sensor's phase ends within it.
    stepHint() {
      const periods = prep.system.elements.map((el) => el.runner?.fastest?.()).filter((p) => p > 0);
      const steps = prep.system.elements.map((el) => el.maxStep?.()).filter((s) => s > 0);
      const hints = [...periods.map((p) => p / 20), ...steps];
      return hints.length ? Math.min(...hints) : null;
    },
    // Each LED's brightness averaged over the steps since the last call ({ id: brightness }; a chip
    // of a part of several, { "D1.R": brightness }), or null when no step ran.
    glow() {
      if (!glowTime) return null;
      const out = Object.fromEntries([...glowSum].map(([id, sum]) => [id, sum / glowTime]));
      glowSum = new Map();
      glowTime = 0;
      return out;
    },
    periods: () => program.supplies.filter((s) => s.generator && !s.off).map((s) => 1 / s.generator.frequency),
    // An environment's field an emitter writes carries `emitted`: what of it reaches the sensors now.
    controls() {
      const written = new Set(emitting() ? prep.emitters.flatMap((p) => p.emits) : []);
      const ambient = env?.values();
      return [...controlsOf(program), ...environmentControls(env).map((c) => (written.has(c.field) ? { ...c, emitted: emittedShare(c.field, used[c.field], ambient) } : c))];
    },
    // The program as the controls left it (a copy): what the page exports to Falstad.
    program: () => JSON.parse(JSON.stringify(program)),
    set(id, field, value) {
      if (id === 'environment') {
        if (!env?.set(field, value)) return false;
        return feel(program, seen(env.values())) ? rebuildSettled() : true;
      }
      if (!changeProgram(program, id, field, value)) return false;
      return rebuildSettled();
    },
    resume(id, field) {
      if (id !== 'environment' || !env?.resume(field)) return false;
      return feel(program, seen(env.values())) ? rebuildSettled() : true;
    },
    attach(id, field) {
      const d = program.devices.find((dev) => dev.id === id && !dev.unsupported);
      if (!env || !d?.senses?.includes(field)) return false;
      if (d.follows?.includes(field)) return true;
      d.follows = [...(d.follows ?? []), field];
      d.env = { ...d.env, [field]: undefined };
      if (!env.fields().includes(field)) env.set(field, env.value(field));
      feel(program, seen(env.values()));
      return rebuildSettled();
    },
    environment: () => (env ? seen(env.values()) : {}),
    ambient: () => (env ? env.values() : {}),
    emissions() {
      if (!emitting()) return {};
      const ambient = env.values();
      return Object.fromEntries(Object.entries(emitted).map(([field, e]) => [field, { total: e.total, parts: { ...e.parts }, ...(FIELDS[field].blockedBy && { blocked: isBlocked(field, ambient) }) }]));
    },
    // The page's real-time pace: the span of each environment program and the shortest time of each
    // element that keeps its own clock (`span()`, seconds: a timed sensor's), as one list.
    stimuli: () => [...(env ? env.spans() : []), ...prep.system.elements.map((el) => el.span?.()).filter((s) => s > 0)],
  };
  return api;
}

// The parts that follow a field take its new value (their device's `sense`, else its `set`): true
// when one of them changed.
function feel(program, values) {
  let changed = false;
  for (const d of program.devices) {
    if (!d.follows?.length) continue;
    const device = deviceOfProgram(d);
    for (const field of d.follows) {
      const v = values[field];
      if (v === undefined || d.env[field] === v) continue;
      const params = (device.sense ?? device.set)(d.params, field, v);
      if (!params) continue;
      d.params = params;
      d.env[field] = v;
      changed = true;
    }
  }
  return changed;
}

// What may change, from each device's and supply's controls (devices/*, controls.js). A drawn
// battery answers by its part id.
function controlsOf(program) {
  const out = [];
  const add = (id, list) => {
    for (const [field, c] of Object.entries(list ?? {})) out.push({ id, field, ...c });
  };
  for (const d of program.devices) {
    const device = !d.unsupported && deviceOfProgram(d);
    if (device?.controls) add(d.id, device.controls(d.params));
  }
  for (const s of program.supplies) if (!s.off) add(s.part ?? s.id, supplyControls(s));
  return out;
}

// A control's new value in the program (devices: their pure `set`; supplies: controls.js).
function changeProgram(program, id, field, value) {
  const control = controlsOf(program).find((c) => c.id === id && c.field === field);
  if (!control) return false;
  if (control.scale === 'momentary' || control.scale === 'toggle') value = Boolean(value);
  else {
    value = Number(value);
    if (!Number.isFinite(value)) return false;
    // The slider's range is a suggestion (a lesson may widen it); `limit` is what makes sense.
    const [lo, hi] = control.limit ?? [control.min, control.max];
    value = Math.min(hi, Math.max(lo, value));
  }
  const d = program.devices.find((dev) => dev.id === id && !dev.unsupported);
  const device = d && deviceOfProgram(d);
  if (device?.controls?.(d.params)?.[field]) {
    const params = device.set(d.params, field, value);
    if (!params) return false;
    d.params = params;
    // Its own control moved: the part leaves the field of the environment it was following.
    if (d.follows) {
      const left = d.follows.filter((f) => (device.ownField?.[f] ?? f) === field);
      d.follows = d.follows.filter((f) => !left.includes(f));
      for (const f of left) delete d.env[f];
    }
    return true;
  }
  const s = program.supplies.find((sup) => (sup.part ?? sup.id) === id);
  return Boolean(s) && setSupply(s, field, value);
}

// What an element remembers between steps or Newton iterations: capacitor voltage, inductor
// current, junction and transistor voltages. Matched by part and by the order the part added
// its elements (a pressed button adds its contact last, after the poles). A device with memory of
// its own (a timed sensor's phase and clock) lists the keys of its elements in `state` and they
// are carried too; a key an element does not define from the start is not carried.
const STATE = ['vprev', 'iprev', 'vd', 'vgs', 'vds', 'vbe', 'vbc', 'q', 'closed', 'wait', 'angle', 'mode', 'level', 'pull', 'runner'];
function carryState(old, prep) {
  for (const [id, list] of prep.owned) {
    const before = old.owned.get(id) ?? [];
    list.forEach((el, k) => {
      const was = before[k];
      if (was) for (const key of prep.carried.get(id) ?? STATE) if (key in was && key in el) el[key] = was[key];
    });
  }
}

// Each capacitor and inductor against the rest of the circuit, linearised at the DC operating
// point: inject 1 A between its two nodes (the element itself left out) and read the voltage,
// which is the resistance it sees. τ = C·R for a capacitor, L/R for an inductor.
function timeConstants(prep) {
  const r = solveWithLimits(prep, new Array(prep.system.size).fill(0), {});
  if (!r.ok) return [];
  const out = [];
  for (const own of prep.system.elements.filter((el) => el.memory)) {
    const st = new Stamper(prep.system.size);
    for (let i = 0; i < prep.system.nodeCount; i++) st.add(i, i, GMIN);
    for (const el of prep.system.elements) if (el !== own) el.stamp(st, r.x, {});
    // Only the matrix matters: the sources' and the linearisation's constants are dropped.
    st.b.fill(0);
    const [a, b] = own.nodes;
    st.rhs(a, 1);
    st.rhs(b, -1);
    const y = solveInPlace(st.A, st.b);
    if (!y) continue;
    const resistance = (a >= 0 ? y[a] : 0) - (b >= 0 ? y[b] : 0);
    if (!(resistance > 0) || !Number.isFinite(resistance) || resistance > 1e9) continue;
    out.push(own.memory.kind === 'C' ? own.memory.value * resistance : own.memory.value / resistance);
  }
  // An element's own time (a relay's coil L/R and its armature's travel): it changes by itself even
  // while the circuit around it, at rest, leaves its coil open.
  for (const el of prep.system.elements) if (el.times) out.push(...el.times);
  return out;
}

// Programs (a board's sketch, devices/mcu.js) start at t = 0 from the voltages there: run them
// (setup, then loop until it waits) and solve again while they change a pin. A relay's armature
// (`rest`) takes the place its coil's current gives it there, the same way.
function settle(prep, r, ctx) {
  const programs = prep.system.elements.filter((el) => el.settle || el.rest);
  for (let round = 0; round < 5 && r.ok && programs.length; round++) {
    let changed = false;
    for (const el of programs) if (el.settle ? el.settle(r.x) : el.rest(r.x)) changed = true;
    if (!changed) break;
    r = solveWithLimits(prep, r.x, ctx);
  }
  return r;
}

function dc(prep) {
  const ctx = {};
  setTime(prep, 0); // a generator's operating point is the one at t = 0
  const r = settle(prep, solveWithLimits(prep, new Array(prep.system.size).fill(0), ctx), ctx);
  if (!r.ok) return { analysis: 'dc', model: true, ok: false, issues: [...prep.issues, issue('error', 'SIM_NO_CONVERGENCE', {})] };
  const reading = readAll(prep, r.x, ctx);
  // Each part against its limits: { quantity, value, max, unit, ratio, level } (controls.js).
  for (const p of prep.parts) {
    const part = reading.parts[p.id];
    if (part.floating) continue;
    const list = partStresses(p, part).filter((s) => !s.note);
    if (list.length) part.stress = list.map(({ quantity, value, max, unit, ratio, pin }) => ({ quantity, value, max, unit, ratio, level: stressLevel(ratio), ...(pin && { pin }) }));
  }
  return { analysis: 'dc', model: true, ok: true, iterations: r.iterations, ground: prep.ground, ...reading, issues: [...prep.issues, ...limitIssues(prep, reading)] };
}

// Transient: capacitors start discharged (start: 'zero', the supply switched on at t = 0)
// or at their DC values (start: 'dc'). Fixed step; at most `points` samples are kept.
// The stepping of a transient over a fixed `prep` (no emitters: nothing in it is rebuilt). An engine with
// emitters drives the same loop with its own start and step (createEngine), so what the emitters add in a
// step reaches the sensors in the next one, as in the page.
//   begin(start, h) → error code or null;  step(t, h) → ok;  read(ctx) → readAll;  prep() → the prep now
function fixedDrive(prep) {
  // Elements with a memory (capacitors, inductors): they take each accepted step, at the start of the next.
  const caps = prep.system.elements.filter((el) => 'accept' in el);
  let x = null;
  let accepted = null;
  return {
    prep: () => prep,
    begin(start, h) {
      x = new Array(prep.system.size).fill(0);
      setTime(prep, 0);
      if (start === 'dc') {
        const r = solveWithLimits(prep, x, {});
        if (!r.ok) return 'SIM_NO_CONVERGENCE';
        x = r.x;
        for (const c of caps) c.accept(x, {});
      }
      // t = 0: the capacitors hold their starting voltage (a very short step pins them there).
      const first = settle(prep, solveWithLimits(prep, x, { h: h * 1e-6 }), { h: h * 1e-6 });
      if (!first.ok) return 'SIM_NO_CONVERGENCE';
      x = first.x;
      return null;
    },
    step(t, h) {
      const ctx = { h };
      if (accepted) for (const c of caps) c.accept(x, accepted);
      setTime(prep, t);
      const r = newton(prep.system, x, ctx);
      if (!r.ok) return false;
      x = r.x;
      accepted = ctx;
      return true;
    },
    read: (ctx) => readAll(prep, x, ctx),
  };
}

function transient(prep, { stop, step, start = 'zero', points = 400 } = {}, drive = fixedDrive(prep)) {
  stop = Number(stop);
  step = Number(step);
  if (!(stop > 0)) return { analysis: 'transient', model: true, ok: false, issues: [...prep.issues, issue('error', 'SIM_BAD_TIME', {})] };
  if (!(step > 0)) step = stop / 1000;
  const steps = Math.ceil(stop / step - 1e-9);
  if (steps > 2e5) return { analysis: 'transient', model: true, ok: false, issues: [...prep.issues, issue('error', 'SIM_BAD_TIME', {})] };

  const failed = drive.begin(start, step);
  if (failed) return { analysis: 'transient', model: true, ok: false, issues: [...drive.prep().issues, issue('error', failed, {})] };

  const every = Math.max(1, Math.ceil(steps / points));
  const times = [];
  const samples = [];
  const record = (t, ctx) => {
    times.push(t);
    samples.push(drive.read(ctx));
  };
  record(0, { h: step * 1e-6 });
  const ctx = { h: step };
  const warnings = new Map();
  for (let k = 1; k <= steps; k++) {
    if (!drive.step(k * step, step)) return { analysis: 'transient', model: true, ok: false, issues: [...drive.prep().issues, issue('error', 'SIM_NO_CONVERGENCE_AT', { time: q(k * step, 's') })] };
    if (k % every === 0 || k === steps) {
      record(k * step, ctx);
      for (const w of limitIssues(drive.prep(), samples.at(-1))) warnings.set(`${w.code}:${w.params.part ?? w.params.supply ?? ''}`, w);
    }
  }
  prep = drive.prep();

  // Series: one array per node, per supply and per part quantity.
  const series = (pick) => samples.map(pick);
  const nodes = Object.fromEntries(Object.keys(samples[0].nodes).map((n) => [n, series((s) => s.nodes[n])]));
  const supplies = Object.fromEntries(Object.keys(samples[0].supplies).map((id) => [id, { voltage: series((s) => s.supplies[id].voltage), current: series((s) => s.supplies[id].current) }]));
  const parts = Object.fromEntries(
    Object.entries(samples[0].parts).map(([id, p]) => [
      id,
      Object.fromEntries(['voltage', 'current', 'power'].filter((key) => typeof p[key] === 'number').map((key) => [key, series((s) => s.parts[id][key])])),
    ]),
  );
  return { analysis: 'transient', model: true, ok: true, start, step, stop: steps * step, times, ground: prep.ground, nodes, supplies, parts, issues: [...prep.issues, ...warnings.values()] };
}

