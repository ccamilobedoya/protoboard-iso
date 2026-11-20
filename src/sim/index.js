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
import { createRunner } from './program.js';
import { MCUS } from './models.js';
import { deviceOfProgram } from './devices/index.js';


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
//   checkHazards(circuit) → { hazards: [issue…], states: { checked, total, controls, outputs }, checked }
//
// The states, one at a time with everything else at rest (never combinations):
// - controls: a push button (and a rotary encoder's) pressed, a switch in its other position (a
//   rocker, a latching button, a slide switch, a tilt switch tipped), a potentiometer or trimmer at
//   each end of its travel;
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
// those high at rest, which the rest point covers). Sensors that follow the environment, sliders of
// other kinds and supplies are judged as they are. Empty when the circuit cannot be simulated (no
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

const exceeded = (engine, reading) => Object.entries(engine.stresses(reading)).flatMap(([id, list]) => list.filter((s) => s.ratio > 1).map((s) => stressIssue(id, s)));
const hazardKey = (h) => `${h.code} ${h.params.part}`;
// A state on and off: a control set, or a pin held.
export const enterState = (engine, s) => (s.pin ? engine.drive(s.part, s.pin, s.value) : engine.set(s.part, s.field, s.value));
export const leaveState = (engine, s) => (s.pin ? engine.drive(s.part, s.pin, null) : engine.set(s.part, s.field, s.rest));

// The hazards of an engine that has not been started (each state is its own DC point), with the
// control states of controlStates and the program outputs of its rest point; every control and pin
// is left at rest again.
// With `collect`, also `issues`: every issue the simulation gave in those DC points (the one at
// rest, then each state's with its `when`), and `rest`, the reading at rest: for the review's doubts.
export function engineHazards(engine, states, max = STATES_MAX, { collect = false } = {}) {
  const rest = engine.dc();
  if (!rest.ok) return { hazards: [], states: { checked: 0, total: states.length, controls: 0, outputs: 0 }, ok: false, ...(collect && { issues: rest.issues ?? [] }) };
  const outputs = programOutputs(rest);
  const all = [...states, ...outputs.states];
  const hazards = exceeded(engine, rest);
  const issues = [...(rest.issues ?? [])];
  const atRest = new Set(hazards.map(hazardKey));
  const tried = all.slice(0, max);
  for (const s of tried) {
    if (!enterState(engine, s)) continue;
    const reading = engine.dc();
    const when = s.pin ? { part: s.part, pin: s.pin, name: s.name, value: s.value } : { part: s.part, field: s.field, value: s.value };
    if (reading.ok) for (const h of exceeded(engine, reading)) if (!atRest.has(hazardKey(h))) hazards.push({ ...h, when });
    for (const i of reading.issues ?? []) issues.push({ ...i, when });
    leaveState(engine, s);
  }
  const controls = new Set(states.map((s) => `${s.part} ${s.field}`)).size;
  return { hazards, states: { checked: tried.length, total: all.length, controls, outputs: outputs.pins.length }, ok: true, ...(collect && { issues, rest }) };
}

// checkHazards also returns `doubts` (doubtsOf): what the simulation could not tell.
export function checkHazards(circuit) {
  const compiled = compile(circuit);
  if (compiled.fatal) return { hazards: [], states: { checked: 0, total: 0, controls: 0, outputs: 0 }, checked: coverageOf(compiled, null), doubts: doubtsOf(circuit, compiled, null) };
  const engine = createEngine(compiled.program);
  const { rest, issues, ...result } = engineHazards(engine, controlStates(compiled.program, engine), STATES_MAX, { collect: true });
  const doubts = doubtsOf(circuit, compiled, { ...result, issues, rest });
  return { ...result, checked: coverageOf(compiled, result, doubts), doubts };
}

// What the kit could not tell about a circuit, beside what would be damaged: the review's `doubts`
// (review.js), each an issue { severity: 'warning', code, params }. Any of them turns an APPROVED into
// APPROVED WITH WARNINGS, so nobody reads a plain DONE over a circuit the kit did not check:
// - SIM_PART_NOT_SIMULATED: a part wired into the circuit that has no simulation model (it is
//   drawn and its pins are left open in the simulation: what it does, and what it drives, is unknown);
// - every issue about a board's program (PROGRAM_DOUBTS, whatever its severity; SIM_PROGRAM_IGNORED
//   stays a note), SIM_PROGRAM_STUCK (a program that never lets time pass: programStuck) and
//   SIM_PROGRAM_STOPPED (it stopped with an error at rest);
// - every other warning or error the simulation gave at rest or in one of the states the hazard
//   check solves (with its `when`), unless it is one of the hazards; a circuit with a source whose
//   DC point does not solve (SIM_NO_CONVERGENCE) or whose supply is not valid (SIM_BAD_SUPPLY).
// A circuit with no source at all is not a doubt: the Checked line says nothing could be simulated.
const PROGRAM_DOUBTS = new Set(['SIM_PROGRAM_FILE', 'SIM_PROGRAM_OUTSIDE', 'SIM_PROGRAM_TOO_LARGE', 'SIM_PROGRAM_ERROR', 'SIM_PROGRAM_UNSUPPORTED', 'SIM_PROGRAM_LIBRARY', 'SIM_PROGRAM_NO_LOOP', 'SIM_PROGRAM_NOT_IN_KIT']);
// Issues that are never doubts: notes, the part said as not simulated, or a circuit that has no
// source or is not placed (the Checked line and the placement checks say those).
const NOT_DOUBTS = new Set(['SIM_UNSUPPORTED', 'SIM_PROGRAM_IGNORED', 'SIM_NO_SUPPLY', 'SIM_PLACEMENT_ERRORS']);

export function doubtsOf(circuit, compiled, result) {
  const out = [];
  const seen = new Set();
  const add = (i) => {
    const key = `${i.code} ${JSON.stringify(i.params)}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ ...i, severity: 'warning' });
  };
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
  const hazards = new Set((result?.hazards ?? []).map(hazardKey));
  const doubt = (i) => (i.severity === 'warning' || i.severity === 'error') && !NOT_DOUBTS.has(i.code) && !hazards.has(hazardKey(i));
  // The program's own issues first (compile's, also when the DC point does not solve), then the rest.
  const issues = [...(program.issues ?? []), ...(result?.issues ?? [])];
  for (const i of issues) if (PROGRAM_DOUBTS.has(i.code) && !i.when) add(i);
  for (const [id, r] of Object.entries(result?.rest?.parts ?? {})) {
    if (r?.kind !== 'MCU' || !r.program) continue;
    if (r.program.error) add(issue('warning', 'SIM_PROGRAM_STOPPED', { part: id, message: String(r.program.error).slice(0, 80) }));
    else if (programStuck(program, id, r)) add(issue('warning', 'SIM_PROGRAM_STUCK', { part: id }));
  }
  for (const i of issues) if (!PROGRAM_DOUBTS.has(i.code) && doubt(i) && !(i.code === 'SIM_FLOATING' && outside(program, i))) add(i);
  return out;
}

// Floating nodes (SIM_FLOATING) that are outside the circuit: no part on them that is simulated has
// a pin on a node that is not floating (parts set on the board and wired to nothing, a part not
// simulated and what only it touches: its own doubt says it). A node such as a MOSFET's gate left
// open, whose part is wired in by its other pins, is inside: a doubt.
function outside(program, i) {
  const floating = new Set(String(i.params.nodes ?? '').split(', '));
  const devices = new Map((program.devices ?? []).map((d) => [d.id, d]));
  return [...floating].every((n) => (program.members?.[n] ?? []).every((id) => {
    const d = devices.get(id);
    return !d || d.unsupported || d.pins.every((pin) => floating.has(pin.node));
  }));
}

// A device with a pin on a node another part or a supply is on: wired into the circuit.
function wired(program, d) {
  const supplied = new Set((program.supplies ?? []).flatMap((s) => [s.p, s.n]));
  return d.pins.some((pin) => supplied.has(pin.node) || (program.members?.[pin.node] ?? []).some((id) => id !== d.id));
}

// Whether a board's program never lets time pass: setup() or one call of loop() runs on without
// returning and without waiting (a delay, pulseIn), so the simulation's time never reaches what
// comes after (`void loop() { while (1) {} }`). Asked of a runner of its own (program.js, the one
// place that runs a program), its pins reading the voltages at rest; its loop() is followed by one
// second of wait (a fixed text around the translated sketch), so a loop() that returns, with or
// without a delay, lets time pass. The runner stops each advance after its budget of turns, so
// this is bounded: PROBE_ADVANCES advances at most.
const PROBE_ADVANCES = 8;
const probeOf = (js) => `const __sketch = (function () {\n${js}\n})();\nreturn { setup: __sketch.setup, loop: function* () { yield* __sketch.loop(); yield 1; } };`;
function programStuck(program, id, reading) {
  const d = program.devices.find((x) => x.id === id && x.kind === 'MCU' && !x.unsupported);
  const js = d?.params?.sketch;
  if (!js) return false;
  const model = { ...MCUS[d.params.family], ...d.params.model };
  const gpioOf = new Map((d.params.gpios ?? []).map((g) => [g.gpio, g.name]));
  const byName = new Map((reading.pins ?? []).map((p) => [p.name, p]));
  const vdd = reading.vdd ?? model.vdd;
  const read = (gpio) => {
    const pin = byName.get(gpioOf.get(Math.trunc(Number(gpio))));
    return pin && Number.isFinite(pin.voltage) && vdd > 0 ? { volts: pin.voltage, vdd } : null;
  };
  const runner = createRunner(probeOf(js), { family: d.params.family, states: {}, read, ask: () => null, i2c: {}, vil: model.vil, vih: model.vih, adcBits: model.adcBits, adcFull: model.adcFull, adcRef: model.adcRef });
  let dt = 0;
  for (let k = 0; k < PROBE_ADVANCES; k++) {
    runner.advance(dt);
    if (runner.error) return false;
    const next = runner.until();
    if (next == null) return true;
    dt = next;
  }
  return false;
}

// What the hazard check covered and what it could not, for the answer's "Checked" line (review.js):
// { rest, controls, outputs, notChecked: [code…], skipped?, unsimulated? }. The codes, only those
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
  const { controls, outputs, checked, total } = result.states;
  const notChecked = [];
  const switches = outputs > 0 || devices.some((d) => d.kind === 'TMR' || (d.kind === 'MCU' && d.params?.sketch)) || (program.supplies ?? []).some((s) => s.generator && !s.off);
  if (switches) notChecked.push('switching');
  if (controls + outputs >= 2) notChecked.push('combinations');
  if (devices.some((d) => d.follows?.length || senses(d))) notChecked.push('environment');
  if (checked < total) notChecked.push('limit');
  const unsimulated = devices.filter((d) => d.unsupported).map((d) => d.id);
  if (unsimulated.length) notChecked.push('unsimulated');
  const programs = [...new Set(doubts.filter((d) => d.code.startsWith('SIM_PROGRAM_')).map((d) => String(d.params.part)))];
  if (programs.length) notChecked.push('program');
  return { rest: true, controls, outputs, notChecked, ...(checked < total && { skipped: total - checked }), ...(unsimulated.length && { unsimulated }), ...(programs.length && { programs }) };
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
