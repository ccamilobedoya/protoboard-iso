// Simulator: from a circuit file to node voltages and part currents.
//
//   simulate(circuit, { analysis: 'dc' })                                   → operating point
//   simulate(circuit, { analysis: 'transient', stop, step, start, points })  → time series
//
// Power comes from the circuit's `supplies` (a bench supply on the rails, or a battery that is
// not drawn) and from every `battery` part (drawn beside the board, see src/parts/batteries.js).
// Both become the same thing: an ideal voltage source behind an internal resistance.
// Every result is a **model**: ideal strips, typical part values (models.js).
// Parts the simulator does not know yet (integrated circuits) are left unconnected and reported.
//
// Two steps: compile.js turns the circuit into a program (plain JSON, Node only), engine.js runs
// it (no dependencies: the page bundles it, see docs/en/live-simulation.md).

import { compile } from './compile.js';
import { createEngine } from './engine.js';
import { lookupModule } from '../parts/modules.js';
import { FIELDS, createEnvironment, environmentControls } from './environment.js';
import { stressIssue, issue } from './devices/shared.js';
import { deviceOfProgram } from './devices/index.js';
import { buildCircuit } from '../circuit/build.js';
import { checkButtonPins, checkFlyback } from '../circuit/checks.js';
import { CIRCUIT_FOLDER } from '../beside.js';
import { outputsOf, outputOn, runCircuit, runsByItself, BEHAVIOUR_STEPS, restingStates } from './run.js';

export { restingStates };

// The DC point of a circuit with two resting states (restingStates): it is the balance between them,
// so the answer says so (SIM_TWO_STATES, a warning: the readings shown are not a state the real
// circuit rests in) and carries each state (`states`: what is on and off in it, and its reading).
export function withStates(circuit, result) {
  if (!result?.ok || result.analysis !== 'dc') return result;
  const two = restingStates(circuit);
  if (!two) return result;
  const words = (s) => {
    const parts = Object.entries(s.reading.parts ?? {}).filter(([, p]) => p.kind === 'Q' || p.kind === 'M');
    const on = [...parts.filter(([, p]) => p.region !== 'off').map(([id]) => id), ...s.on];
    const off = [...parts.filter(([, p]) => p.region === 'off').map(([id]) => id), ...outputsOf(compile(circuit).program).filter((o) => !s.on.includes(o.id)).map((o) => o.id)];
    return { on: on.join(', ') || '—', off: off.join(', ') || '—' };
  };
  const [a, b] = two.states.map(words);
  const states = two.states.map((s) => ({ on: s.on, nodes: s.nodes, parts: s.reading.parts, supplies: s.reading.supplies }));
  return { ...result, states, issues: [...(result.issues ?? []), issue('warning', 'SIM_TWO_STATES', { on1: a.on, off1: a.off, on2: b.on, off2: b.off })] };
}

// Findings about the wiring itself that `check` and the hazard check report (not placement checks):
// each is a doubt of the review (doubtsOf), never a blocking item (circuit/checks.js DOUBT_CODES).
export function wiringIssues(circuit) {
  const built = buildCircuit(circuit);
  if (!built.board) return [];
  const compiled = compile(circuit);
  return [...checkButtonPins(built.parts, built.netlist, { netLabels: circuit.netLabels }), ...(compiled.fatal ? [] : checkFlyback(compiled.program))];
}


export { compile, createEngine };

export function simulate(circuit, options = {}) {
  const { analysis = 'dc' } = options;
  const compiled = compile(circuit);
  if (compiled.fatal) return { analysis, model: true, ok: false, issues: compiled.issues };
  const engine = createEngine(compiled.program);
  return analysis === 'transient' ? engine.transient(options) : engine.dc();
}

// The parts that would be damaged as wired: the DC operating point (the one `simulate` prints
// without --transient) at rest, with each control a learner operates by hand and with each output of
// a board's program driven high, every stress past its limit (ratio above 1, what the simulator calls
// exceeded) as the warning `simulate` gives for it.
//
//   checkHazards(circuit) → { hazards: [issue…], doubts: [issue…], states: { checked, total, controls, outputs, environment? }, checked }
//
// The states, one at a time with everything else at rest (never combinations):
// - controls: a push button (and a rotary encoder's) pressed, a switch in its other position (a
//   rocker, a latching button, a slide switch, a tilt switch tipped), a potentiometer or trimmer at
//   each end of its travel;
// - environment: each field a sensor of the circuit follows (a circuit that declares an environment)
//   at the bottom and at the top of its range, one field at a time (`environment` counts the fields);
// - program outputs: each pin a board's program has made an output by the time it first waits
//   (setup() and loop() up to its first delay: the pin modes of the DC point, so `pinMode`, and the
//   `digitalWrite`, `tone`, `analogWrite` and `ledcWrite` that make a pin an output there), held
//   high with engine.drive while the program runs on. A pin already high at rest adds nothing; a
//   pin the program first makes an output later is not in them.
// A hazard found only in one of them carries `when`: `{ part, field, value }` for a control,
// `{ part, pin, name, value: 1 }` for a pin ("with D10 high"); one that is there at rest is reported
// once, at rest. At most STATES_MAX states are solved, controls first (in the order of the parts),
// then pins: `states.checked` below `states.total` says the rest were not. `controls` counts the
// controls (a potentiometer's two ends are one control), `outputs` the program's output pins (also
// those high at rest, which the rest point covers). Sliders of other kinds and supplies are judged as
// they are. `doubts`: the warnings of DOUBTS (a relay driven but not pulled in) that are no damage,
// each once with its `when`, as the hazards have. Empty when the circuit cannot be simulated (no
// source, placement errors, no convergence). Not a transient: a PWM pin, a tone, a 555 or a generator
// is judged at its DC point, and a peak while something switches is not found here. `checked` says
// all of this for the answer's "Checked" line (coverageOf).
export const STATES_MAX = 24;
const OPERATED = { SW: ['pressed'], ENC: ['pressed'], SWT: null, POT: ['position'] };

// The states to solve for a compiled program, from its engine's controls at rest.
export function controlStates(program, engine) {
  const kinds = new Map(program.devices.filter((d) => !d.unsupported).map((d) => [d.id, d.kind]));
  const out = [];
  for (const c of engine.controls()) {
    const kind = kinds.get(c.id);
    if (!(kind in OPERATED) || (OPERATED[kind] && !OPERATED[kind].includes(c.field))) continue;
    if (kind === 'POT') {
      for (const end of [0, 1]) if (c.value !== end) out.push({ part: c.id, field: c.field, value: end, rest: c.value });
    } else if (c.scale === 'momentary' || c.scale === 'toggle') out.push({ part: c.id, field: c.field, value: !c.value, rest: c.value });
  }
  return [...out, ...environmentStates(program, engine)];
}

// The environment's fields a sensor of the circuit follows (a circuit that declares an environment),
// each at the bottom and at the top of its range (the circuit's `range` for it, else the registry's),
// one field at a time: a sensor at the end of its range is where a circuit that works at the middle
// stops working (a dark room, a hot day). A value equal to the one at rest adds nothing.
export function environmentStates(program, engine) {
  const followed = new Set((program.devices ?? []).filter((d) => !d.unsupported).flatMap((d) => d.follows ?? []));
  const out = [];
  for (const c of engine.controls()) {
    if (c.id !== 'environment' || !followed.has(c.field) || !Number.isFinite(c.min) || !Number.isFinite(c.max)) continue;
    for (const [end, value] of [['min', c.min], ['max', c.max]]) if (value !== c.value) out.push({ part: 'environment', field: c.field, value, end, rest: c.value, ...(c.programmed && { programmed: true }) });
  }
  return out;
}

// The output pins of each board that runs a program, from the reading at rest: { pins: [{ part, pin }],
// states: the ones low at rest, each to be held high }. A pin's name in the text is "D10", or "U1.D10"
// when more than one board runs a program.
export function programOutputs(reading) {
  const boards = Object.entries(reading?.parts ?? {}).filter(([, r]) => r?.kind === 'MCU' && r.program);
  const pins = [];
  const states = [];
  for (const [id, r] of boards) {
    for (const x of r.pins ?? []) {
      if (x.mode !== 'output') continue;
      pins.push({ part: id, pin: x.name });
      if (!x.level) states.push({ part: id, pin: x.name, name: boards.length > 1 ? `${id}.${x.name}` : x.name, value: 1 });
    }
  }
  return { pins, states };
}

// The warnings and errors of a reading that may be doubts of the review (doubtsOf): everything the
// simulation says is wrong or unknown (a relay driven but not pulled in, a pin over its rail, a
// module under its supply, a program's issues…), except notes and NOT_DOUBTS; the hazards are taken
// out by engineHazards. Once each (by code and part), at rest or in the first state that shows it.
// Issues that are never doubts: the part said as not simulated (SIM_PART_NOT_SIMULATED says it), a
// note on a program, a circuit that has no source or is not placed (the Checked line and the
// placement checks say those).
const NOT_DOUBTS = new Set(['SIM_UNSUPPORTED', 'SIM_PROGRAM_IGNORED', 'SIM_NO_SUPPLY', 'SIM_PLACEMENT_ERRORS']);
// Issues of a board's program: doubts whatever their severity (a library not simulated is a note).
const PROGRAM_DOUBTS = new Set(['SIM_PROGRAM_FILE', 'SIM_PROGRAM_FOLDER', 'SIM_PROGRAM_NOT_SKETCH', 'SIM_PROGRAM_OUTSIDE', 'SIM_PROGRAM_TOO_LARGE', 'SIM_PROGRAM_ERROR', 'SIM_PROGRAM_UNSUPPORTED', 'SIM_PROGRAM_LIBRARY', 'SIM_PROGRAM_NO_LOOP', 'SIM_PROGRAM_NOT_IN_KIT', 'SIM_PROGRAM_ARRAY_DIMENSIONS']);
const warningsOf = (reading) => (reading.issues ?? []).filter((i) => (PROGRAM_DOUBTS.has(i.code) || i.severity === 'warning' || i.severity === 'error') && !NOT_DOUBTS.has(i.code));
// One doubt per code and part (its readings change from state to state), and per call or file a
// program's issue names; an issue that names no part, by all its params.
// Doubts that can show in several states: the quantity whose highest value is the one reported.
const STRONGEST = { SIM_RELAY_UNDERDRIVEN: 'current', SIM_PIN_OVERVOLTAGE: 'voltage' };
const DEPENDS = 0.05; // stronger in a state by more than this share: the state is named [assumed]
const doubtKey = (i) => (i.params?.part != null ? `${i.code} ${i.params.part} ${i.params.name ?? i.params.file ?? i.params.pin ?? ''} ${i.params.line ?? ''}` : `${i.code} ${JSON.stringify(i.params ?? {})}`);
const exceededAll = (engine, reading) => Object.entries(engine.stresses(reading)).flatMap(([id, list]) => list.filter((s) => s.ratio > 1).map((s) => stressIssue(id, s)));
const hazardKey = (h) => `${h.code} ${h.params.part}`;
const hazardStrength = (h) => Math.abs(Object.values(h.params ?? {}).find((v) => v && typeof v === 'object' && typeof v.value === 'number')?.value ?? 0);
// The combinations of a run (run.js `combinations`) as states: each board's outputs held as seen
// (the ones high, the rest low), those equal to the rest point left out. "with D2 and D5 high".
// A combination with clocked chips (run.js `chips`) holds each chip in the state it latched then
// (engine.hold): "with U2 holding QA…QH 11111111".
const sameChips = (rest, chips) => Object.entries(chips ?? {}).every(([id, c]) => JSON.stringify(rest.parts?.[id]?.logic) === JSON.stringify(c.logic));
function chipState(rest, c) {
  if (!c.chips || sameChips(rest, c.chips)) return null;
  const held = Object.entries(c.chips).map(([id, x]) => `${id} ${x.label}`).join(', ');
  return { part: c.part ?? Object.keys(c.chips)[0], chips: Object.fromEntries(Object.entries(c.chips).map(([id, x]) => [id, x.logic])), held, value: 1, combination: true };
}
function combinationStates(rest, combinations) {
  const many = Object.values(rest.parts ?? {}).filter((r) => r?.kind === 'MCU' && r.program).length > 1;
  const out = [];
  for (const c of combinations) {
    const board = rest.parts?.[c.part];
    if (!board) {
      const s = chipState(rest, c);
      if (s) out.push(s);
      continue;
    }
    const outputs = (board.pins ?? []).filter((x) => x.mode === 'output').map((x) => x.name);
    const now = outputs.filter((n) => board.pins.find((x) => x.name === n).level);
    // All low, or as at rest: the rest point covers it (a hazard there has no pin to name), unless a
    // clocked chip holds something else then.
    const chipsHeld = chipState(rest, c);
    const pinsAsRest = !c.high.length || (now.length === c.high.length && now.every((n) => c.high.includes(n)));
    if (pinsAsRest && !chipsHeld) continue;
    const name = c.high.map((n) => (many ? `${c.part}.${n}` : n)).join(' + ');
    // A pin the program makes an output only later is one of them too.
    const pins = [...new Set([...outputs, ...c.high])];
    out.push({ part: c.part, pins: pins.map((n) => [n, c.high.includes(n) ? 1 : 0]), ...(c.high.length && { pin: c.high[0], name }), ...(chipsHeld && { chips: chipsHeld.chips, held: chipsHeld.held }), value: 1, combination: true });
  }
  return out;
}

// A board's pin that drives a clocked chip's input but was never high in any combination the run saw
// (a clock pulsed inside shiftOut, high and low again within one step): held high alone, judged only on
// that chip's pins, so every input a board drives is judged at both its levels. Only the chip's pins:
// held alone, a pin can make states its program never reaches elsewhere (an H-bridge's leg).
function chipInputStates(program, rest, combinations) {
  const chips = (program.devices ?? []).filter((d) => !d.unsupported && deviceOfProgram(d)?.holds);
  // Nodes joined by jumpers (devices of kind W) are one net.
  const parent = new Map();
  const find = (n) => (parent.has(n) && parent.get(n) !== n ? find(parent.get(n)) : n);
  for (const w of program.devices ?? []) if (w.kind === 'W' && w.pins?.length === 2) {
    const [a, b] = w.pins.map((p) => find(p.node));
    if (a !== b) parent.set(a, b);
  }
  const out = [];
  for (const board of (program.devices ?? []).filter((d) => d.kind === 'MCU' && !d.unsupported)) {
    const pins = rest.parts?.[board.id]?.pins ?? [];
    const seen = new Set(combinations.filter((c) => c.part === board.id).flatMap((c) => c.high));
    for (const x of pins) {
      if (x.mode !== 'output' || seen.has(x.name) || x.level) continue;
      const node = board.pins.find((p) => p.name === x.name)?.node;
      const chip = chips.find((c) => c.pins.some((p) => find(p.node) === find(node)));
      if (!node || !chip) continue;
      out.push({ part: board.id, pins: [[x.name, 1]], pin: x.name, name: x.name, value: 1, only: (h) => String(h.params.part).startsWith(`${chip.id}.`) });
    }
  }
  return out;
}

// A state on and off: a control set, or a pin held (a combination: several pins).
const holdChips = (engine, s, release) => Object.entries(s.chips ?? {}).every(([id, logic]) => engine.hold(id, release ? null : logic));
export const enterState = (engine, s) => holdChips(engine, s, false) && (s.pins ? s.pins.every(([pin, v]) => engine.drive(s.part, pin, v)) : s.pin ? engine.drive(s.part, s.pin, s.value) : s.chips ? true : engine.set(s.part, s.field, s.value));
export function leaveState(engine, s) {
  holdChips(engine, s, true);
  if (s.pins) return s.pins.every(([pin]) => engine.drive(s.part, pin, null));
  if (s.chips) return true;
  if (s.pin) return engine.drive(s.part, s.pin, null);
  const ok = engine.set(s.part, s.field, s.rest);
  if (s.programmed) engine.resume(s.part, s.field); // an environment program runs again, as before
  return ok;
}

// The hazards of an engine that has not been started (each state is its own DC point), with the
// control states of controlStates and the program outputs of its rest point; every control and pin
// is left at rest again.
// `doubts`: the warnings of those DC points that are no hazard (warningsOf), each once, with the `when`
// of the state it was first found in. With `collect`, also `rest`, the reading at rest (doubtsOf
// reads each board's program there).
export function engineHazards(engine, states, max = STATES_MAX, { collect = false, combinations = null } = {}) {
  const rest = engine.dc();
  if (!rest.ok) return { hazards: [], doubts: collect ? warningsOf(rest) : [], states: { checked: 0, total: states.length, controls: 0, outputs: 0 }, ok: false };
  // A part wired to nothing (left out by a layout that stopped at its budget) is open: no hazard.
  const compiledProgram = engine.program();
  const open = new Set((compiledProgram.devices ?? []).filter((d) => !d.unsupported && d.kind !== 'W' && !wired(compiledProgram, d)).map((d) => d.id));
  const exceeded = (eng, reading) => exceededAll(eng, reading).filter((h) => !open.has(String(h.params.part).split('.')[0]));
  const lit = litTracker(compiledProgram);
  lit.see(rest);
  const outputs = programOutputs(rest);
  // A program that runs: its outputs as the run saw them together (each combination once), not each
  // output alone (an H-bridge's sketch never turns on both transistors of one leg).
  const pinStates = combinations ? [...combinationStates(rest, combinations), ...chipInputStates(compiledProgram, rest, combinations)] : outputs.states;
  const all = [...states, ...pinStates];
  // A hazard at rest on a board's pin the program sets high there names that state ("with D9 high, as
  // the program first sets it"): the figure is that state's, not one of a run.
  const highAtRest = (h) => {
    const [board, pin] = String(h.params.part).split('.');
    const x = pin && rest.parts?.[board]?.kind === 'MCU' && rest.parts[board].program ? rest.parts[board].pins?.find((p) => p.name === pin && p.mode === 'output') : null;
    return x && (x.pwm ? x.pwm.duty > 0 : x.level) ? { part: board, pin, name: pin, value: 1, rest: true } : null;
  };
  const hazards = exceeded(engine, rest).map((h) => {
    const when = highAtRest(h);
    return when ? { ...h, when } : h;
  });
  const atRest = new Set(hazards.map(hazardKey));
  // What is wrong or unknown without damaging anything (a relay driven too weakly to pull in), once
  // each, at rest or in the first state that shows it.
  const doubts = warningsOf(rest);
  const doubted = new Set(doubts.map(doubtKey));
  const tried = all.slice(0, max);
  for (const s of tried) {
    const eng = s.engine ?? engine; // an environment state of a circuit that declares none runs on its own engine
    if (!enterState(eng, s)) continue;
    const reading = eng.dc();
    const when = s.held ? { part: s.part, held: s.held, chips: s.chips, ...(s.pins && { pins: s.pins }), ...(s.pin && { pin: s.pin, name: s.name }), value: s.value } : s.pin ? { part: s.part, pin: s.pin, name: s.name, value: s.value } : { part: s.part, field: s.field, value: s.value, ...(s.end && { end: s.end }) };
    if (reading.ok) {
      if (!s.only) lit.see(reading);
      for (const h of exceeded(eng, reading)) {
        if (atRest.has(hazardKey(h)) || (s.only && !s.only(h))) continue;
        // In a combination, a pin's own hazard names that pin (U1.D10 with D9 + D10 high: D10).
        const own = s.pins && String(h.params.part).startsWith(`${s.part}.`) ? String(h.params.part).slice(s.part.length + 1) : null;
        const found = { ...h, when: own && s.pins.some(([p, v]) => p === own && v) ? { ...when, pin: own } : when };
        // The same hazard in several states (a chip's supply current as more LEDs latch on): the strongest.
        const at = hazards.findIndex((x) => hazardKey(x) === hazardKey(found));
        if (at < 0) hazards.push(found);
        else if (hazardStrength(found) > hazardStrength(hazards[at])) hazards[at] = found;
      }
      for (const d of s.only ? [] : warningsOf(reading)) {
        if (!doubted.has(doubtKey(d))) {
          doubted.add(doubtKey(d));
          doubts.push({ ...d, when });
        } else if (STRONGEST[d.code]) {
          // Seen in several states: the one that tells the most (a relay's weak drive: the highest coil current).
          // A state is named only when the finding depends on it: stronger there by more than DEPENDS
          // (an RX pin at 4.04 V instead of 4.03 V is not "with the temperature at its minimum").
          const at = doubts.findIndex((x) => doubtKey(x) === doubtKey(d));
          if (d.params[STRONGEST[d.code]].value > doubts[at].params[STRONGEST[d.code]].value * (1 + DEPENDS)) doubts[at] = { ...d, when };
        }
      }
    }
    leaveState(eng, s);
  }
  const fields = new Set(states.filter((s) => s.part === 'environment').map((s) => s.field)).size;
  const controls = new Set(states.filter((s) => s.part !== 'environment').map((s) => `${s.part} ${s.field}`)).size;
  // The fields visited at both ends, by name, for the Checked line ("light at both ends").
  const environmentFields = [...new Set(tried.filter((s) => s.part === 'environment').map((s) => s.field))];
  return { hazards, doubts: doubts.filter((d) => !hazards.some((h) => hazardKey(h) === hazardKey(d))), states: { checked: tried.length, total: all.length, controls, outputs: outputs.pins.length, ...(fields && { environment: fields }), ...(combinations && { combined: true }) }, ok: true, ...(environmentFields.length && { environmentFields }), ...(collect && { rest, lit }) };
}

// The outputs of a circuit (sim/run.js outputsOf: an LED, each chip of an RGB LED or segment of a
// display, a buzzer, a relay, a motor, a laser) and whether each came on in a reading seen so far,
// with each relay's highest coil current (what SIM_OUTPUT_NEVER_ON says for it).
// An LED (a chip, a segment) counts as on here from where it glows at all, not from where it is
// plainly lit (the run's 5 %): 0.2 µA of 20 mA. The doubt is for a part that stays dark, and a goal of
// 1 µA is a dim LED, not a dark one [assumed].
const GLOWS = { led: { level: 1e-5 }, segment: { level: 1e-5 } };
function litTracker(program) {
  const devices = new Map(program.devices.map((d) => [d.id, d]));
  // A chip of an RGB LED or a segment counts when its own pin is wired (a display's unused point is not).
  const own = (o) => o.id === o.part || pinWired(program, devices.get(o.part), o.id.slice(o.part.length + 1));
  const watched = outputsOf(program).filter((o) => o.kind !== 'output' && wired(program, devices.get(o.part)) && own(o));
  const on = new Set();
  const coil = new Map();
  return {
    watched,
    on,
    coil,
    see(reading) {
      for (const o of watched) {
        const r = reading.parts?.[o.part];
        if (outputOn(GLOWS[o.kind] ? { ...o, on: GLOWS[o.kind] } : o, r)) on.add(o.id);
        if (o.kind === 'relay' && r) coil.set(o.part, Math.max(coil.get(o.part) ?? 0, Math.abs(r.current ?? 0)));
      }
    },
  };
}

// The outputs that hang from a part with no simulation model: { output part → [unsupported ids] }.
// From each output's pins the search walks the nodes through the parts current flows through
// (two-terminal parts, wires, switches, transistors, relays), never past a supply's rail (or a strip
// jumpered to one) and never
// through a chip, a board or a module (each drives its own pins); an output that reaches a pin of a
// part not simulated this way depends on what that part does, which the kit cannot tell (its pins are
// left open). Outputs anything else feeds keep their own findings (SIM_OUTPUT_NEVER_ON).
const CARRIES = new Set(['R', 'C', 'L', 'D', 'LED', 'LEDS', 'W', 'SW', 'SWT', 'POT', 'Q', 'M', 'RLY', 'BZA', 'MOT', 'LSR', 'BR', 'HDR']);
export function hangingOutputs(program) {
  const devices = program.devices ?? [];
  const missing = devices.filter((d) => d.unsupported && wired(program, d));
  const out = new Map();
  if (!missing.length) return out;
  const onNode = new Map();
  for (const d of devices) for (const pin of d.pins ?? []) onNode.set(pin.node, [...(onNode.get(pin.node) ?? []), d]);
  // A supply's rails, and the strips jumpered to them (a chip's supply pin is not what it drives).
  const rails = new Set();
  const toRail = (program.supplies ?? []).flatMap((s) => [s.p, s.n]);
  while (toRail.length) {
    const node = toRail.pop();
    if (rails.has(node)) continue;
    rails.add(node);
    for (const d of onNode.get(node) ?? []) if (d.kind === 'W') for (const pin of d.pins) toRail.push(pin.node);
  }
  const parts = [...new Set(outputsOf(program).filter((o) => o.kind !== 'output').map((o) => o.part))];
  for (const part of parts) {
    const own = devices.find((d) => d.id === part);
    const found = new Set();
    const seen = new Set();
    const queue = (own?.pins ?? []).map((p) => p.node);
    while (queue.length) {
      const node = queue.pop();
      if (seen.has(node) || rails.has(node)) continue;
      seen.add(node);
      for (const d of onNode.get(node) ?? []) {
        if (d.unsupported) found.add(d.id);
        else if (d.id === part || CARRIES.has(d.kind)) for (const pin of d.pins ?? []) queue.push(pin.node);
      }
    }
    if (found.size) out.set(part, [...found]);
  }
  return out;
}

// An output that never comes on (SIM_OUTPUT_NEVER_ON): a part whose job is to show or move something,
// wired into a circuit with a source, that is off in every state the hazard check solved (at rest,
// each control, each end of the environment, each program output) and, for a circuit that changes by
// itself (a board's program, a 555, a generator, an oscillator), through the bounded run of layout's
// Behaviour line. One doubt per part; a part with several outputs (an RGB LED, a display) names the
// ones that never came on when others did. A relay says its highest coil current and its pull-in.
const NEVER_ON_SECONDS = 2;
// A slow oscillation: the plain part of the run covers NEVER_ON_PERIODS of its period, taken as
// PERIOD_PER_TAU times the longest time constant (a 555 astable's period is 0.7 to 1.4 of its timing
// capacitor's τ), at most NEVER_ON_MAX simulated seconds [assumed].
const NEVER_ON_PERIODS = 2;
const PERIOD_PER_TAU = 2;
const NEVER_ON_MAX = 30;
// The scripted run's pieces: each state held this long (a touch module registers after 220 ms), then
// released for the gap; at most NEVER_ON_STATES of them, after the plain seconds above [assumed].
const NEVER_ON_HOLD = 0.5;
const NEVER_ON_GAP = 0.2;
const NEVER_ON_STATES = 24;
// An output that hangs from a part not simulated (hangingOutputs) is not judged: that part's own doubt
// names it.
function neverOn(circuit, compiled, engine, states, lit, extra = extraStates(circuit, engine, states)) {
  const hanging = hangingOutputs(compiled.program);
  const dark = () => lit.watched.filter((o) => !lit.on.has(o.id) && !hanging.has(o.part));
  if (!dark().length) return [];
  // More states, for this question only (they add no hazard): every field of a declared environment
  // (a beam a laser crosses, which no sensor follows) and every control the page offers (a module's
  // trimmer), at each end.
  // Each program output alone too (the hazard check visits the run's combinations): a sketch that
  // reaches its seventh segment after the run's seconds still lights it.
  const singles = programOutputs(engine.dc()).states;
  for (const s of [...extra, ...singles]) {
    if (!enterState(engine, s)) continue;
    const reading = engine.dc();
    if (reading.ok) lit.see(reading);
    leaveState(engine, s);
  }
  // A passive buzzer is on when it sounds (its run's `sound`), not when a steady current clicks it.
  const see = (run) => {
    for (const o of run?.outputs ?? []) if (o.sound ? o.sound.onShare > 0 || o.sound.changes > 0 : o.onShare > 0 || o.changes > 0) lit.on.add(o.id);
  };
  if (dark().length) see(visitRun(circuit, compiled, engine, states, extra, true));
  // A circuit that oscillates slowly (a 555 at 0.3 Hz clocking a CD4017) may light an output later than
  // the plain seconds: the plain part grows, while outputs are still dark, to two periods of the slowest
  // oscillation the time constants suggest, then doubles while outputs keep coming on for the first time
  // late in it, up to NEVER_ON_MAX. When that bound (or the run's own steps or time) comes first with an
  // output still dark and others still coming on, the kit cannot tell: no doubt, and the Checked line
  // says the run was too short (lit.short).
  if (dark().length && runsByItself(compiled.program)) {
    const taus = engine.timeConstants().filter((x) => Number.isFinite(x) && x > 0 && x < NEVER_ON_MAX);
    // A time constant over NEVER_ON_MAX is a reservoir (a large capacitor), not a rhythm [assumed].
    const wanted = NEVER_ON_PERIODS * PERIOD_PER_TAU * Math.max(0, ...taus);
    const target = Math.min(NEVER_ON_MAX, wanted);
    let plain = NEVER_ON_SECONDS;
    let run = visitRun(circuit, compiled, engine, states, extra, true, plain);
    const late = (r, span) => (r?.outputs ?? []).some((o) => o.intervals?.[0] && o.intervals[0][0] > span / 2);
    const cut = (r) => (r?.issues ?? []).some((i) => i.code === 'RUN_STEPS' || i.code === 'RUN_BUDGET');
    let open = target > plain || late(run, plain);
    while (dark().length && open && plain < NEVER_ON_MAX && !cut(run)) {
      plain = Math.min(NEVER_ON_MAX, Math.max(2 * plain, target));
      run = visitRun(circuit, compiled, engine, states, extra, true, plain);
      see(run);
      open = late(run, plain);
    }
    if (dark().length && (cut(run) || plain < wanted || (open && plain >= NEVER_ON_MAX))) {
      lit.short = true;
      return [];
    }
  }
  const out = [];
  const left = dark();
  // Whole parts that never came on, in one doubt (eight LEDs behind a chip not simulated are one
  // finding); a relay, and a part some of whose outputs did come on, each in its own.
  const whole = [];
  for (const part of [...new Set(left.map((o) => o.part))]) {
    const own = lit.watched.filter((o) => o.part === part);
    const off = left.filter((o) => o.part === part);
    const kind = own[0].kind;
    if (kind === 'relay') {
      const d = compiled.program.devices.find((x) => x.id === part);
      out.push(issue('warning', 'SIM_OUTPUT_NEVER_ON', { part, kind, variant: 'relay', current: { value: lit.coil.get(part) ?? 0, unit: 'A' }, needs: { value: d.params.model.pullIn, unit: 'A' } }));
    } else if (own[0].passive) out.push(issue('warning', 'SIM_OUTPUT_NEVER_ON', { part, kind, variant: 'passive' }));
    else if (own.length > 1 && off.length < own.length) out.push(issue('warning', 'SIM_OUTPUT_NEVER_ON', { part, kind, variant: 'channels', channels: off.map((o) => o.id.slice(part.length + 1)).join(', ') }));
    else whole.push(part);
  }
  if (whole.length) out.unshift(issue('warning', 'SIM_OUTPUT_NEVER_ON', { part: whole.join(', '), ...(whole.length > 1 && { variant: 'many' }) }));
  return out;
}

// The run of the review: the plain first seconds (a program, a 555, an oscillator), then each state
// in turn, held and released (a touch module in toggle mode, a PIR's hold time, a shaft turned to the
// middle of its range: things a DC point cannot show). Null when nothing calls for one: the circuit
// does not change by itself and `always` is false (no output left dark). Kept for the same circuit
// as a simulation sees it (wires merged, parts in order), so layout's tries pay for it once.
const RUNS = new Map();
const RUNS_KEPT = 16;
function visitRun(circuit, compiled, engine, states, extra, always, plain = NEVER_ON_SECONDS) {
  const program = compiled.program;
  const timed = (program.devices ?? []).some((d) => !d.unsupported && deviceOfProgram(d)?.state);
  if (!runsByItself(program) && !always) return null;
  const all = [...states, ...extra];
  // Each field also at the middle of its range: the two ends of a shaft's angle are one position.
  const middles = [];
  for (const c of engine.controls()) {
    if (!all.some((s) => s.part === c.id && s.field === c.field)) continue;
    const middle = (c.min + c.max) / 2;
    if (c.scale !== 'momentary' && c.scale !== 'toggle' && Number.isFinite(middle) && middle !== c.value) middles.push({ part: c.id, field: c.field, value: middle, rest: c.value });
  }
  const steps = [...all, ...middles].filter((s) => !s.pin && !s.engine).slice(0, NEVER_ON_STATES);
  if (!runsByItself(program) && !timed && !steps.length) return null;
  const at = [];
  steps.forEach((s, k) => {
    const time = plain + k * (NEVER_ON_HOLD + NEVER_ON_GAP);
    const name = s.part === 'environment' ? s.field : `${s.part}.${s.field}`;
    at.push({ time, name, value: String(s.value) }, { time: time + NEVER_ON_HOLD, name, value: String(s.rest) });
  });
  const seconds = plain + steps.length * (NEVER_ON_HOLD + NEVER_ON_GAP);
  const key = `${electricalKey(program)} ${plain} ${JSON.stringify(at)}`;
  if (RUNS.has(key)) return RUNS.get(key);
  // Until `visited` the run is in the hazard check's own states (the plain seconds, then `states`): a
  // pin's extremes are read there; the rest only answers whether an output comes on.
  const visited = plain + steps.filter((s) => states.includes(s)).length * (NEVER_ON_HOLD + NEVER_ON_GAP);
  const run = runCircuit(circuit, { seconds, stimuli: { at }, maxSteps: BEHAVIOUR_STEPS * 2, checks: 0, compiled, extremesUntil: visited, remeasure: 0 });
  RUNS.set(key, run);
  if (RUNS.size > RUNS_KEPT) RUNS.delete(RUNS.keys().next().value);
  return run;
}

// A compiled circuit as the simulation sees it, whatever the holes: wires merged into one node, each
// node named by where it first appears in the parts' order.
function electricalKey(program) {
  const parent = new Map();
  const find = (x) => {
    while (parent.has(x) && parent.get(x) !== x) x = parent.get(x);
    return x;
  };
  for (const d of program.devices ?? []) if (d.kind === 'W' && d.pins?.length === 2) {
    const [a, b] = [find(d.pins[0].node), find(d.pins[1].node)];
    if (a !== b) parent.set(a, b);
  }
  const names = new Map();
  const name = (n) => {
    const root = find(n);
    if (!names.has(root)) names.set(root, names.size);
    return names.get(root);
  };
  const devices = (program.devices ?? []).filter((d) => d.kind !== 'W').map((d) => [d.id, d.kind, d.type, d.unsupported ?? false, d.params ?? null, d.pins.map((p) => [p.name, name(p.node)])]);
  const supplies = (program.supplies ?? []).map((x) => ({ ...x, p: name(x.p), n: name(x.n) }));
  return JSON.stringify([devices, supplies, program.environment ?? null]);
}

// A board's pin outside 0…its rail at some moment of the review's run (SIM_PIN_OVERVOLTAGE with the
// time: a 5 V echo pulse on a 3.3 V board's pin is low at rest); 0.3 V of margin as the DC check.
const PIN_MARGIN = 0.3;
function pinPeaks(run) {
  return (run?.pinExtremes ?? []).filter((x) => x.over > PIN_MARGIN).map((x) => issue('warning', 'SIM_PIN_OVERVOLTAGE', { part: x.part, pin: x.pin, voltage: { value: x.voltage, unit: 'V' }, max: { value: x.vdd, unit: 'V' }, time: { value: x.time, unit: 's' }, variant: 'run' }));
}

// The states neverOn adds: the fields of a declared environment the hazard check did not visit, and
// the controls of page.controls, each at its ends (a switch: its other position).
function extraStates(circuit, engine, states) {
  const done = new Set(states.map((s) => `${s.part} ${s.field}`));
  const offered = new Set((circuit.page?.controls ?? []).map((c) => (c?.environment != null ? `environment ${c.environment}` : `${c?.part ?? c?.supply} ${c?.field}`)));
  const out = [];
  for (const c of engine.controls()) {
    const key = `${c.id} ${c.field}`;
    if (done.has(key) || c.programmed || !(c.id === 'environment' ? circuit.environment && Object.hasOwn(circuit.environment, c.field) : offered.has(key))) continue;
    if (c.scale === 'momentary' || c.scale === 'toggle') out.push({ part: c.id, field: c.field, value: !c.value, rest: c.value });
    else for (const value of [c.min, c.max]) if (Number.isFinite(value) && value !== c.value) out.push({ part: c.id, field: c.field, value, rest: c.value });
  }
  return out;
}

// A circuit that declares no environment still has sensors that read one (an LDR's light, a
// thermistor's temperature, each by its own value): the field is visited at both ends of its range all
// the same. The circuit is compiled again with an empty environment declared, so its sensors follow
// the registry's default range, and these states run on that engine (`engine` of the state); a sensor
// with a value of its own is left as it is. Nothing here changes the reading at rest.
function undeclaredEnvironmentStates(circuit, program) {
  if (program.environment || !(program.devices ?? []).some(senses)) return [];
  // The folder is not an own enumerable key (node/workspace.js): a spread would lose it, and a
  // board's program named by file ("weather.ino") would not be found in these states.
  const again = compile(Object.defineProperty({ ...circuit, environment: {} }, CIRCUIT_FOLDER, { value: circuit[CIRCUIT_FOLDER], enumerable: false }));
  if (again.fatal) return [];
  const engine = createEngine(again.program);
  return environmentStates(again.program, engine).map((s) => ({ ...s, engine }));
}

// checkHazards' `doubts` (doubtsOf): what the kit could not tell, the one list the review shows.
export function checkHazards(circuit) {
  const compiled = compile(circuit);
  if (compiled.fatal) return { hazards: [], states: { checked: 0, total: 0, controls: 0, outputs: 0 }, checked: coverageOf(compiled, null), doubts: doubtsOf(circuit, compiled, null) };
  const engine = createEngine(compiled.program);
  const states = controlStates(compiled.program, engine);
  // A board's program that runs: the review's run first, for the combinations of outputs it reaches.
  const programmed = (compiled.program.devices ?? []).some((d) => d.kind === 'MCU' && !d.unsupported && d.params?.sketch);
  // A clocked chip (a 74HC595, a CD4017) latches states a DC point never shows: the run is visited too.
  const clocked = (compiled.program.devices ?? []).some((d) => !d.unsupported && deviceOfProgram(d)?.holds);
  const runFirst = programmed || clocked ? visitRun(circuit, compiled, engine, states, extraStates(circuit, engine, states), !programmed) : null;
  const runs = runFirst?.ok && !(runFirst.issues ?? []).some((i) => i.code === 'SIM_PROGRAM_STOPPED' || i.code === 'SIM_PROGRAM_STUCK') && !(compiled.program.issues ?? []).some((i) => PROGRAM_DOUBTS.has(i.code) && i.severity !== 'info');
  const { rest, lit, ...result } = engineHazards(engine, [...states, ...undeclaredEnvironmentStates(circuit, compiled.program)], STATES_MAX, { collect: true, ...(runs && runFirst.combinations?.length && { combinations: runFirst.combinations }) });
  const dark = result.ok ? neverOn(circuit, compiled, engine, states, lit) : [];
  if (lit?.short) result.shortRun = true;
  // A board's pins over the run: the highest voltage each sees, beside the DC states' (a pin seen over
  // its rail at a DC state keeps that finding unless the run sees it higher).
  if (result.ok && programmed) {
    for (const peak of pinPeaks(runFirst)) {
      const at = result.doubts.findIndex((d) => doubtKey(d) === doubtKey(peak));
      if (at < 0) result.doubts.push(peak);
      else if (Math.abs(peak.params.voltage.value) > Math.abs(result.doubts[at].params.voltage.value) * (1 + DEPENDS)) result.doubts[at] = peak;
    }
  }
  // A bus line over its chip's VDDIO in a DC state, which a program that runs no longer holds there by
  // the end of its run (a sketch that turns the board's pull-ups off after Wire.begin(): the static
  // solve stops inside begin()): the run is the circuit as it is.
  if (result.ok && runs) {
    // (A run keeps one warning per code and part: the part is what is matched.)
    const still = new Set((runFirst.issues ?? []).filter((i) => i.code === 'SIM_PIN_OVER_VDDIO').map((i) => i.params.part));
    result.doubts = result.doubts.filter((d) => d.code !== 'SIM_PIN_OVER_VDDIO' || still.has(d.params.part));
  }
  const doubts = doubtsOf(circuit, compiled, { ...result, rest, dark });
  return { ...result, checked: coverageOf(compiled, result, doubts), doubts };
}

// What the kit could not tell about a circuit, beside what would be damaged: the review's `doubts`
// (review.js), each an issue { severity: 'warning', code, params, when? }, once each. Any of them
// turns an APPROVED into APPROVED WITH WARNINGS, so nobody reads a plain DONE over a circuit the kit
// did not check. One list, from every source:
// - the wiring findings (wiringIssues: a button whose two joined pins carry the net, BUTTON_PINS_JOINED);
// - SIM_PART_NOT_SIMULATED: a part wired into the circuit that has no simulation model (it is
//   drawn and its pins are left open in the simulation: what it does, and what it drives, is unknown),
//   naming the outputs that hang from it (`drives`, hangingOutputs), which get no SIM_OUTPUT_NEVER_ON;
// - SIM_PROGRAM_STOPPED (a board's program stopped with an error at rest) and SIM_PROGRAM_STUCK (it
//   never lets time pass: the runner's `stuck`, program.js);
// - engineHazards' doubts: every warning or error of the DC point at rest and of each state the
//   hazard check solves (the controls, the environment's ends, the program's outputs), with the
//   `when` of the state it was found in, that is not a hazard: a relay driven but not pulled in, the
//   issues of a board's program (a file not found, a syntax error, a call it does not know), a pin
//   over its rail, a source whose DC point does not solve (SIM_NO_CONVERGENCE)…; a SIM_FLOATING only
//   when it touches the circuit (outside);
// - with a compile that cannot run: SIM_BAD_SUPPLY (a supply that is not valid).
// A circuit with no source at all is not a doubt: the Checked line says nothing could be simulated.
export function doubtsOf(circuit, compiled, result) {
  const out = [];
  const seen = new Set();
  const add = (i) => {
    if (seen.has(doubtKey(i))) return;
    seen.add(doubtKey(i));
    out.push({ ...i, severity: 'warning' });
  };
  for (const i of wiringIssues(circuit)) add(i);
  if (compiled.fatal) {
    for (const i of compiled.issues ?? []) if (i.code === 'SIM_BAD_SUPPLY') add(i);
    return out;
  }
  const { program } = compiled;
  const raw = new Map((circuit.parts ?? []).map((p) => [p.id, p]));
  const hanging = [...hangingOutputs(program)];
  for (const d of program.devices ?? []) {
    if (!d.unsupported || !wired(program, d)) continue;
    const p = raw.get(d.id);
    // The outputs that depend on it, by name: what the kit cannot tell.
    const drives = hanging.filter(([, from]) => from.includes(d.id)).map(([part]) => part);
    add(issue('warning', 'SIM_PART_NOT_SIMULATED', { part: d.id, name: String(p?.part ?? p?.type ?? d.id), ...(drives.length && { variant: 'drives', drives: drives.join(', ') }) }));
  }
  // The program's own issues first (compile's, also when the DC point does not solve), then its run.
  for (const i of program.issues ?? []) if (PROGRAM_DOUBTS.has(i.code)) add(i);
  for (const [id, r] of Object.entries(result?.rest?.parts ?? {})) {
    if (r?.kind !== 'MCU' || !r.program) continue;
    if (r.program.error) add(issue('warning', 'SIM_PROGRAM_STOPPED', { part: id, message: String(r.program.error).slice(0, 80) }));
    else if (r.program.stuck) add(issue('warning', 'SIM_PROGRAM_STUCK', { part: id }));
  }
  // A relay driven past its drop-out current somewhere but never pulled in is SIM_RELAY_UNDERDRIVEN
  // (it may not pull in); one never driven that far anywhere is SIM_OUTPUT_NEVER_ON (it does not).
  const driven = new Set((result?.doubts ?? []).filter((i) => i.code === 'SIM_RELAY_UNDERDRIVEN').map((i) => i.params.part));
  for (const i of result?.doubts ?? []) if (!(i.code === 'SIM_FLOATING' && outside(program, i))) add(i);
  // A program the kit cannot run as written leaves its outputs unvisited: its own doubt says so. A
  // board with no program yet (wired before the sketch is written) has no outputs to visit either.
  const idle = (program.devices ?? []).some((d) => d.kind === 'MCU' && !d.unsupported && !d.params?.sketch);
  const unrun = idle || out.some((i) => i.code.startsWith('SIM_PROGRAM_'));
  for (const i of result?.dark ?? []) if (!unrun && !(i.params.variant === 'relay' && driven.has(i.params.part))) add(i);
  return out;
}

// Floating nodes (SIM_FLOATING) that are outside the circuit: no part on them that is simulated has
// a pin on a node that is not floating (parts set on the board and wired to nothing, a part not
// simulated and what only it touches: its own doubt says it). A node such as a MOSFET's gate left
// open, whose part is wired in by its other pins, is inside: a doubt. A switch's open contact (a
// button's side that nothing else touches) is outside too: it carries nothing until it is closed.
const CONTACTS = new Set(['SW', 'SWT']);
function outside(program, i) {
  const floating = new Set(String(i.params.nodes ?? '').split(', '));
  const devices = new Map((program.devices ?? []).map((d) => [d.id, d]));
  return [...floating].every((n) => (program.members?.[n] ?? []).every((id) => {
    const d = devices.get(id);
    return !d || d.unsupported || CONTACTS.has(d.kind) || d.pins.every((pin) => floating.has(pin.node));
  }));
}

// A device's pin, by name, on a node another part or a supply is on.
function pinWired(program, d, name) {
  const pin = d?.pins.find((p) => p.name === name);
  if (!pin) return false;
  return (program.supplies ?? []).some((s) => s.p === pin.node || s.n === pin.node) || (program.members?.[pin.node] ?? []).some((id) => id !== d.id);
}

// A device with a pin on a node another part or a supply is on: wired into the circuit.
function wired(program, d) {
  const supplied = new Set((program.supplies ?? []).flatMap((s) => [s.p, s.n]));
  return d.pins.some((pin) => supplied.has(pin.node) || (program.members?.[pin.node] ?? []).some((id) => id !== d.id));
}

// What the hazard check covered and what it could not, for the answer's "Checked" line (review.js):
// { rest, controls, outputs, environment?, fields? (the environment's fields visited at both ends),
// notChecked: [code…], skipped?, unsimulated? }. The codes, only those
// that apply to this circuit:
//   switching     something switches in time (a board's program, a 555, a generator): its peaks
//   combinations  two or more controls and outputs: each was operated alone
//   environment   sensors that read the world (an LDR, a thermistor, a PIR…, following the circuit's
//                 environment or set by a value of their own): judged at the value they read now
//   limit         more states than STATES_MAX (`skipped`: how many were not solved)
//   unsimulated   parts drawn but not simulated (`unsimulated`: their ids)
//   program       a board's program the kit could not run as written (`programs`: the boards; the
//                 doubts of doubtsOf say why)
//   short-run     an output still dark when the review's run reached its bound while others were still
//                 coming on for the first time (a slow oscillation): whether it comes on is not told
//   no-source     nothing could be simulated: the circuit has no source
//   no-simulation nothing could be simulated for another reason (the simulator's issues say which)
export function coverageOf(compiled, result, doubts = []) {
  if (compiled.fatal || !result?.ok) {
    const code = (compiled.issues ?? []).some((i) => i.code === 'SIM_NO_SUPPLY') ? 'no-source' : 'no-simulation';
    return { rest: false, controls: 0, outputs: 0, notChecked: [code] };
  }
  const { program } = compiled;
  const devices = program.devices ?? [];
  const { controls, outputs, checked, total, environment = 0 } = result.states;
  const notChecked = [];
  const switches = outputs > 0 || devices.some((d) => d.kind === 'TMR' || (d.kind === 'MCU' && d.params?.sketch)) || (program.supplies ?? []).some((s) => s.generator && !s.off);
  if (switches) notChecked.push('switching');
  // A program's outputs visited as the run combined them count as one: their combinations were seen.
  if (controls + (result.states.combined ? Math.min(outputs, 1) : outputs) + environment >= 2) notChecked.push('combinations');
  if (devices.some((d) => d.follows?.length || senses(d))) notChecked.push('environment');
  if (checked < total) notChecked.push('limit');
  const unsimulated = devices.filter((d) => d.unsupported).map((d) => d.id);
  if (unsimulated.length) notChecked.push('unsimulated');
  const programs = [...new Set(doubts.filter((d) => d.code.startsWith('SIM_PROGRAM_')).map((d) => String(d.params.part)))];
  if (programs.length) notChecked.push('program');
  if (result.shortRun) notChecked.push('short-run');
  return { rest: true, controls, outputs, ...(environment && { environment }), ...(result.environmentFields && { fields: result.environmentFields }), notChecked, ...(checked < total && { skipped: total - checked }), ...(unsimulated.length && { unsimulated }), ...(programs.length && { programs }) };
}

// A part that reads the world by its own value when the circuit declares no environment (an LDR's
// `light`, a thermistor's `temperature`): its device senses a field. Controls a learner operates (a
// tilt switch tipped, an encoder) are states of the hazard check instead.
const senses = (d) => !d.unsupported && !(d.kind in OPERATED) && Boolean(deviceOfProgram(d)?.senses?.length);

// What `check` says about the controls panel (page.controls): each entry must name a part or a
// supply and one of its controls (engine.controls()), or a field of the environment, with a range
// inside what makes sense.
// What the page runs of the simulation. By default, whenever it can (a circuit with a source:
// supplies, a battery part or a microcontroller board on USB), everything: the results always on (the tapped part's values, its
// oscilloscope, limits, lit LEDs) and the current layer offered in the bar, not pressed. Each can
// be turned off on its own (`page.results: false`, `page.flow: false`), or both with
// `page.simulation: false` (a value the learner must predict first).
export function pageSimulation(circuit) {
  const page = circuit?.page ?? {};
  if (page.simulation === false) return { results: false, flow: false };
  const usbBoard = (p) => p?.type === 'module' && p.usb !== false && Boolean(lookupModule(p.part)?.module.gpio);
  const hasSource = Boolean(circuit?.supplies?.length) || (circuit?.parts ?? []).some((p) => p?.type === 'battery' || usbBoard(p));
  // page.flow: a boolean, or { style } (the layer offered, drawn in that style; src/sim/paths.js).
  const flow = page.flow != null && typeof page.flow === 'object' ? hasSource : page.flow;
  return { results: page.results ?? hasSource, flow: flow ?? hasSource };
}

export function pageControlIssues(circuit) {
  const wiring = wiringIssues(circuit);
  return [...wiring, ...controlIssues(circuit)];
}

function controlIssues(circuit) {
  const list = circuit?.page?.controls;
  if (!Array.isArray(list) || !list.length) return [];
  const warn = (code, params = {}) => ({ severity: 'warning', code, params });
  const out = [];
  const live = pageSimulation(circuit);
  if (!live.results && !live.flow) out.push(warn('PAGE_CONTROLS_NOT_LIVE'));
  const compiled = compile(circuit);
  if (compiled.fatal) return [...out, warn('PAGE_CONTROLS_NO_SIM')];
  const controls = createEngine(compiled.program).controls();
  list.forEach((c, i) => {
    // An entry of the environment ({ environment: 'light' }) names a field of it (environment.js).
    const env = c?.environment;
    const id = env != null ? 'environment' : (c?.part ?? c?.supply);
    if (!id || [c.part, c.supply, env].filter((x) => x != null).length !== 1 || (env != null && c.field != null)) return out.push(warn('PAGE_CONTROL_TARGET', { index: i + 1 }));
    if (env != null && !Object.hasOwn(FIELDS, env)) return out.push({ severity: 'error', code: 'ENV_UNKNOWN_FIELD', params: { field: String(env).slice(0, 40), fields: Object.keys(FIELDS).join(', ') } });
    const own = env != null ? environmentControls(createEnvironment(circuit.environment, [env])) : controls.filter((x) => x.id === id);
    const field = env ?? c.field;
    const found = own.find((x) => x.field === field);
    if (!found) return out.push(warn('PAGE_CONTROL_UNKNOWN', { target: id, field: String(c.field), options: own.map((x) => x.field).join(', ') || '—' }));
    if (found.scale === 'momentary' || found.scale === 'toggle') return;
    const [lo, hi] = found.limit ?? [found.min, found.max];
    const min = c.min ?? found.min;
    const max = c.max ?? found.max;
    const scale = c.scale ?? found.scale;
    if (!(min < max) || min < lo || max > hi || (scale === 'log' && !(min > 0))) out.push(warn('PAGE_CONTROL_RANGE', { target: id, field, min: String(min), max: String(max), lo: String(lo), hi: String(hi) }));
  });
  return out;
}
