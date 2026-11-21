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
import { outputsOf, outputOn, runCircuit, runsByItself, BEHAVIOUR_STEPS } from './run.js';

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
const PROGRAM_DOUBTS = new Set(['SIM_PROGRAM_FILE', 'SIM_PROGRAM_OUTSIDE', 'SIM_PROGRAM_TOO_LARGE', 'SIM_PROGRAM_ERROR', 'SIM_PROGRAM_UNSUPPORTED', 'SIM_PROGRAM_LIBRARY', 'SIM_PROGRAM_NO_LOOP', 'SIM_PROGRAM_NOT_IN_KIT', 'SIM_PROGRAM_ARRAY_DIMENSIONS']);
const warningsOf = (reading) => (reading.issues ?? []).filter((i) => (PROGRAM_DOUBTS.has(i.code) || i.severity === 'warning' || i.severity === 'error') && !NOT_DOUBTS.has(i.code));
// One doubt per code and part (its readings change from state to state), and per call or file a
// program's issue names; an issue that names no part, by all its params.
// Doubts that can show in several states: the quantity whose highest value is the one reported.
const STRONGEST = { SIM_RELAY_UNDERDRIVEN: 'current', SIM_PIN_OVERVOLTAGE: 'voltage' };
const doubtKey = (i) => (i.params?.part != null ? `${i.code} ${i.params.part} ${i.params.name ?? i.params.file ?? i.params.pin ?? ''} ${i.params.line ?? ''}` : `${i.code} ${JSON.stringify(i.params ?? {})}`);
const exceededAll = (engine, reading) => Object.entries(engine.stresses(reading)).flatMap(([id, list]) => list.filter((s) => s.ratio > 1).map((s) => stressIssue(id, s)));
const hazardKey = (h) => `${h.code} ${h.params.part}`;
// The combinations of a run (run.js `combinations`) as states: each board's outputs held as seen
// (the ones high, the rest low), those equal to the rest point left out. "with D2 and D5 high".
function combinationStates(rest, combinations) {
  const many = Object.values(rest.parts ?? {}).filter((r) => r?.kind === 'MCU' && r.program).length > 1;
  const out = [];
  for (const c of combinations) {
    const board = rest.parts?.[c.part];
    if (!board) continue;
    const outputs = (board.pins ?? []).filter((x) => x.mode === 'output' && !x.pwm).map((x) => x.name);
    const now = outputs.filter((n) => board.pins.find((x) => x.name === n).level);
    // All low, or as at rest: the rest point covers it (a hazard there has no pin to name).
    if (!c.high.length || (now.length === c.high.length && now.every((n) => c.high.includes(n)))) continue;
    const name = c.high.map((n) => (many ? `${c.part}.${n}` : n)).join(' + ');
    out.push({ part: c.part, pins: outputs.map((n) => [n, c.high.includes(n) ? 1 : 0]), pin: c.high[0], name, value: 1, combination: true });
  }
  return out;
}

// A state on and off: a control set, or a pin held (a combination: several pins).
export const enterState = (engine, s) => (s.pins ? s.pins.every(([pin, v]) => engine.drive(s.part, pin, v)) : s.pin ? engine.drive(s.part, s.pin, s.value) : engine.set(s.part, s.field, s.value));
export function leaveState(engine, s) {
  if (s.pins) return s.pins.every(([pin]) => engine.drive(s.part, pin, null));
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
  const pinStates = combinations ? combinationStates(rest, combinations) : outputs.states;
  const all = [...states, ...pinStates];
  const hazards = exceeded(engine, rest);
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
    const when = s.pin ? { part: s.part, pin: s.pin, name: s.name, value: s.value } : { part: s.part, field: s.field, value: s.value, ...(s.end && { end: s.end }) };
    if (reading.ok) {
      lit.see(reading);
      for (const h of exceeded(eng, reading)) if (!atRest.has(hazardKey(h))) hazards.push({ ...h, when });
      for (const d of warningsOf(reading)) {
        if (!doubted.has(doubtKey(d))) {
          doubted.add(doubtKey(d));
          doubts.push({ ...d, when });
        } else if (STRONGEST[d.code]) {
          // Seen in several states: the one that tells the most (a relay's weak drive: the highest coil current).
          const at = doubts.findIndex((x) => doubtKey(x) === doubtKey(d));
          if (d.params[STRONGEST[d.code]].value > doubts[at].params[STRONGEST[d.code]].value) doubts[at] = { ...d, when };
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

// An output that never comes on (SIM_OUTPUT_NEVER_ON): a part whose job is to show or move something,
// wired into a circuit with a source, that is off in every state the hazard check solved (at rest,
// each control, each end of the environment, each program output) and, for a circuit that changes by
// itself (a board's program, a 555, a generator, an oscillator), through the bounded run of layout's
// Behaviour line. One doubt per part; a part with several outputs (an RGB LED, a display) names the
// ones that never came on when others did. A relay says its highest coil current and its pull-in.
const NEVER_ON_SECONDS = 2;
// The scripted run's pieces: each state held this long (a touch module registers after 220 ms), then
// released for the gap; at most NEVER_ON_STATES of them, after the plain seconds above [assumed].
const NEVER_ON_HOLD = 0.5;
const NEVER_ON_GAP = 0.2;
const NEVER_ON_STATES = 24;
function neverOn(circuit, compiled, engine, states, lit, extra = extraStates(circuit, engine, states)) {
  const dark = () => lit.watched.filter((o) => !lit.on.has(o.id));
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
  if (dark().length) for (const o of visitRun(circuit, compiled, engine, states, extra, true)?.outputs ?? []) if (o.onShare > 0 || o.changes > 0) lit.on.add(o.id);
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
    } else if (own.length > 1 && off.length < own.length) out.push(issue('warning', 'SIM_OUTPUT_NEVER_ON', { part, kind, variant: 'channels', channels: off.map((o) => o.id.slice(part.length + 1)).join(', ') }));
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
function visitRun(circuit, compiled, engine, states, extra, always) {
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
    const time = NEVER_ON_SECONDS + k * (NEVER_ON_HOLD + NEVER_ON_GAP);
    const name = s.part === 'environment' ? s.field : `${s.part}.${s.field}`;
    at.push({ time, name, value: String(s.value) }, { time: time + NEVER_ON_HOLD, name, value: String(s.rest) });
  });
  const seconds = NEVER_ON_SECONDS + steps.length * (NEVER_ON_HOLD + NEVER_ON_GAP);
  const key = `${electricalKey(program)} ${JSON.stringify(at)}`;
  if (RUNS.has(key)) return RUNS.get(key);
  // Until `visited` the run is in the hazard check's own states (the plain seconds, then `states`): a
  // pin's extremes are read there; the rest only answers whether an output comes on.
  const visited = NEVER_ON_SECONDS + steps.filter((s) => states.includes(s)).length * (NEVER_ON_HOLD + NEVER_ON_GAP);
  const run = runCircuit(circuit, { seconds, stimuli: { at }, maxSteps: BEHAVIOUR_STEPS * 2, minStep: seconds / 20000, checks: 0, compiled, extremesUntil: visited });
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
  const runFirst = programmed ? visitRun(circuit, compiled, engine, states, extraStates(circuit, engine, states), false) : null;
  const runs = runFirst?.ok && !(runFirst.issues ?? []).some((i) => i.code === 'SIM_PROGRAM_STOPPED' || i.code === 'SIM_PROGRAM_STUCK') && !(compiled.program.issues ?? []).some((i) => PROGRAM_DOUBTS.has(i.code) && i.severity !== 'info');
  const { rest, lit, ...result } = engineHazards(engine, [...states, ...undeclaredEnvironmentStates(circuit, compiled.program)], STATES_MAX, { collect: true, ...(runs && runFirst.combinations?.length && { combinations: runFirst.combinations }) });
  const dark = result.ok ? neverOn(circuit, compiled, engine, states, lit) : [];
  // A board's pins over the run: the highest voltage each sees, beside the DC states' (a pin seen over
  // its rail at a DC state keeps that finding unless the run sees it higher).
  if (result.ok && programmed) {
    for (const peak of pinPeaks(runFirst)) {
      const at = result.doubts.findIndex((d) => doubtKey(d) === doubtKey(peak));
      if (at < 0) result.doubts.push(peak);
      else if (Math.abs(peak.params.voltage.value) > Math.abs(result.doubts[at].params.voltage.value)) result.doubts[at] = peak;
    }
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
//   drawn and its pins are left open in the simulation: what it does, and what it drives, is unknown);
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
  for (const d of program.devices ?? []) {
    if (!d.unsupported || !wired(program, d)) continue;
    const p = raw.get(d.id);
    add(issue('warning', 'SIM_PART_NOT_SIMULATED', { part: d.id, name: String(p?.part ?? p?.type ?? d.id) }));
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
