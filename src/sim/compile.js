// Compile (Node only): a circuit file → a *program*, plain JSON the engine runs (engine.js).
// Everything that needs the board, the part types or the part tables happens here, once: which
// group each lead is in, the supplies and where they are clipped, each part's device and its
// parameters. The program can go into a page as it is, so the browser runs the same simulation.
//
//   compile(circuit) → { program } | { fatal: true, issues }
//
// program = {
//   v: 1,
//   ground:   name of the group at 0 V (the first supply's −)
//   nodes:    every other group, in index order (board groups, then supply groups)
//   members:  group → ids of the parts with a lead in it (for the floating warning)
//   supplies: [{ id, kind, part?, voltage, internalResistance, p, n, currentLimit, battery?, generator?, off? }]
//   devices:  [{ id, type, kind, pins: [{ name, node }], params, senses?, follows?, env?, emits? } | { id, kind, pins, unsupported: true }]
//   issues:   what compiling found (default models, parts not simulated, a battery switched off)
//   environment?: { spec, fields }   only when the circuit declares one (environment.js): its fields
//                 as cleanEnvironment gives them, and every field the program has (those named, those
//                 a part follows, those an emitter writes and the switch that blocks each)
// }
// A sensor (a device with `senses`) reads the environment in params() with c.env(field): the value
// at t = 0, or undefined when the part has its own value (`"light": 50` on the part wins) or the
// circuit declares no environment. Its record then says which fields it asked about (`senses`),
// which it follows (`follows`) and their values (`env`), for the engine to change it as they move.
// An emitter (a device with `emits`: a laser writes `light`) carries the fields it writes (`emits`)
// only in a circuit that declares an environment; in one without, it is told (ENV_EMITTER_ALONE).

import { supplyRails } from '../board/board.js';
import { buildCircuit } from '../circuit/build.js';
import { BATTERY_CELL_RESISTANCE, GENERATOR_RESISTANCE } from './models.js';
import { batteryModel } from '../parts/batteries.js';
import { WAVEFORMS, waveAt } from './generator.js';
import { deviceFor } from './devices/index.js';
import { issue } from './devices/shared.js';
import { translateSketch } from './sketch.js';
import { LIMITS } from '../limits.js';
import { readBeside } from '../beside.js';
import { FIELDS, cleanEnvironment, createEnvironment } from './environment.js';

// A board's program (docs/en/microcontrollers.md, M2): the sketch's text in "program", or the name
// of a .ino file beside the circuit (read by beside.js, inside the circuit's folder only);
// translated once here, run by the page and by simulate.
const SKETCH_SEVERITY = { SIM_PROGRAM_ERROR: 'warning', SIM_PROGRAM_NO_LOOP: 'warning', SIM_PROGRAM_UNSUPPORTED: 'warning', SIM_PROGRAM_LIBRARY: 'info', SIM_PROGRAM_TOO_LARGE: 'warning', SIM_PROGRAM_NOT_IN_KIT: 'warning' };
function sketchOf(circuit, part, issues) {
  const given = part.raw.program;
  if (given == null || given === '') return null;
  let text = String(given);
  if (/\.ino$/i.test(text.trim()) && !text.includes('\n')) {
    const name = text.trim();
    const read = readBeside(circuit, name, LIMITS.sketchChars);
    if (read.error === 'outside') {
      issues.push(issue('warning', 'SIM_PROGRAM_OUTSIDE', { part: part.id, file: name }));
      return null;
    }
    if (read.error === 'size') {
      issues.push(issue('warning', 'SIM_PROGRAM_TOO_LARGE', { part: part.id, size: read.size, limit: LIMITS.sketchChars }));
      return null;
    }
    if (read.error) {
      issues.push(issue('warning', 'SIM_PROGRAM_FILE', { part: part.id, file: name }));
      return null;
    }
    text = read.text;
  }
  const r = translateSketch(text);
  for (const i of r.issues) issues.push(issue(SKETCH_SEVERITY[i.code] ?? 'warning', i.code, { part: part.id, line: i.line, ...(i.name && { name: i.name }), ...(i.message && { message: i.message }), ...(i.limit && { size: i.size, limit: i.limit }) }));
  return r.js;
}

function resolveSupplyNode(board, ref) {
  if (ref == null) return null;
  const hole = board.find(String(ref));
  if (hole) return hole.node;
  for (const h of board.holes.values()) if (h.node === String(ref)) return h.node;
  return null;
}

// A battery in `supplies` may be described like a battery part (format, chemistry, cells,
// charge) or only by its voltage (then 0.25 Ω per 1.5 V of cells, as alkaline AA cells).
// A signal generator (kind "generator"): waveform, frequency (Hz), amplitude (peak volts), offset
// (volts) and its output resistance (default GENERATOR_RESISTANCE); its `voltage` is the one at
// t = 0, and the engine moves it with time (generator.js).
const BATTERY_FIELDS = ['format', 'chemistry', 'cells', 'charge', 'capacity'];

function supplyList(circuit, board) {
  const [positive, negative] = supplyRails(board?.spec);
  return (Array.isArray(circuit.supplies) ? circuit.supplies : []).map((s, i) => {
    const kind = s.kind ?? 'bench';
    const common = { id: s.id ?? `V${i + 1}`, kind, positive: s.positive ?? positive, negative: s.negative ?? negative, currentLimit: s.currentLimit === undefined ? null : Number(s.currentLimit) };
    if (kind === 'generator') {
      const generator = { waveform: s.waveform ?? 'sine', frequency: Number(s.frequency), amplitude: Number(s.amplitude ?? 1), offset: Number(s.offset ?? 0) };
      const ok = WAVEFORMS.includes(generator.waveform) && generator.frequency > 0 && generator.amplitude >= 0 && Number.isFinite(generator.offset);
      return { ...common, generator, voltage: ok ? waveAt(generator, 0) : NaN, internalResistance: Number(s.resistance ?? s.internalResistance ?? GENERATOR_RESISTANCE) };
    }
    if (kind === 'battery' && BATTERY_FIELDS.some((f) => s[f] !== undefined)) {
      const model = batteryModel(s);
      if (model.error) return { ...common, voltage: NaN };
      return { ...common, voltage: model.emf, internalResistance: model.resistance, battery: model };
    }
    const voltage = Number(s.voltage);
    const cells = Math.max(1, Math.round(voltage / 1.5));
    return { ...common, voltage, internalResistance: Number(s.internalResistance ?? (kind === 'battery' ? cells * BATTERY_CELL_RESISTANCE : 0)) };
  });
}

// A battery part as a supply: its leads are its two holes; switched off it is no source at all.
function batterySupply(part) {
  const e = part.def.electrical;
  return { id: part.id, kind: 'battery', part: part.id, voltage: e.emf, internalResistance: e.resistance, positive: part.holes[0].id, negative: part.holes[1].id, currentLimit: null, battery: e, off: !e.on };
}

export function compile(circuit) {
  const built = buildCircuit(circuit);
  const issues = [];
  if (!built.board) return { issues: built.issues, fatal: true };
  if (built.issues.some((i) => i.severity === 'error')) {
    return { issues: [issue('error', 'SIM_PLACEMENT_ERRORS', {})], fatal: true };
  }
  // Drawn batteries after the circuit's supplies: the first supply's − is ground (0 V).
  const supplies = [...supplyList(circuit, built.board), ...built.parts.filter((p) => p.def.electrical?.kind === 'BAT').map(batterySupply)];
  // A microcontroller board on USB is a source of its own (devices/mcu.js): with no other, ground
  // is its GND (a pin's group, or a node of its own when no GND pin is wired).
  const boards = built.parts.filter((p) => p.def.electrical?.kind === 'MCU' && p.raw.usb !== false);
  if (!supplies.length && !boards.length) return { issues: [issue('error', 'SIM_NO_SUPPLY', {})], fatal: true };
  for (const s of supplies) {
    s.p = resolveSupplyNode(built.board, s.positive);
    s.n = resolveSupplyNode(built.board, s.negative);
    if (!s.p || !s.n || s.p === s.n || !(Number.isFinite(s.voltage) && (s.voltage >= 0 || s.generator))) {
      return { issues: [issue('error', 'SIM_BAD_SUPPLY', { supply: s.id })], fatal: true };
    }
    delete s.positive;
    delete s.negative;
  }

  // Node order: ground, then the board groups with a lead, then the groups the supplies touch.
  const boardGround = (p) => {
    const i = p.pinNames.findIndex((name) => /^GND\d*$/.test(name));
    return i >= 0 ? p.holes[i].node : `~${p.id}:GND`;
  };
  const ground = supplies.length ? supplies[0].n : boardGround(boards[0]);
  const nodes = [];
  const seen = new Set([ground]);
  const add = (name) => {
    if (!seen.has(name)) {
      seen.add(name);
      nodes.push(name);
    }
  };
  for (const name of Object.keys(built.netlist.nodes)) add(name);
  for (const s of supplies) {
    add(s.p);
    add(s.n);
  }
  const members = Object.fromEntries(Object.entries(built.netlist.nodes).map(([node, list]) => [node, list.map((m) => m.part)]));

  // The environment at t = 0, when the circuit declares one (environment.js).
  const declared = circuit.environment != null && typeof circuit.environment === 'object' && !Array.isArray(circuit.environment);
  const spec = declared ? cleanEnvironment(circuit.environment) : null;
  const world = declared ? createEnvironment(spec) : null;
  const followed = new Set();
  const written = new Set(); // fields an emitter writes, and the switches that block them
  const devices = built.parts.map((part) => {
    const kind = part.def.electrical?.kind;
    const pins = part.pinNames.map((name, i) => ({ name, node: part.holes[i].node }));
    const device = deviceFor(part);
    if (!device) {
      issues.push(issue('info', 'SIM_UNSUPPORTED', { part: part.id }));
      return { id: part.id, kind, pins, unsupported: true };
    }
    const sketch = kind === 'MCU' ? sketchOf(circuit, part, issues) : null;
    const asked = [];
    const follows = [];
    const env = (field) => {
      if (!world || !device.senses?.includes(field)) return undefined;
      if (!asked.includes(field)) asked.push(field);
      if (part.raw[device.ownField?.[field] ?? field] !== undefined) return undefined;
      if (!follows.includes(field)) follows.push(field);
      followed.add(field);
      return world.value(field);
    };
    const record = { id: part.id, type: part.type, kind, pins, params: device.params(part, { issues, members, sketch, env }) };
    if (asked.length) record.senses = asked;
    if (follows.length) Object.assign(record, { follows, env: Object.fromEntries(follows.map((f) => [f, world.value(f)])) });
    const emits = emitsOf(device);
    if (emits.length && declared) {
      record.emits = emits;
      for (const f of emits) for (const g of [f, FIELDS[f].blockedBy].filter(Boolean)) written.add(g);
    } else if (emits.length) issues.push(issue('info', 'ENV_EMITTER_ALONE', { part: part.id, field: emits.join(', ') }));
    return record;
  });
  const environment = declared ? { environment: { spec, fields: [...new Set([...Object.keys(spec), ...followed, ...written])] } } : {};
  return { program: { v: 1, ground, nodes, members, supplies, devices, issues, ...environment } };
}

// The fields a device writes, those of the registry only (environment.js).
const emitsOf = (device) => (device?.emits ?? []).filter((f) => Object.hasOwn(FIELDS, f));

// What `check` says about the emitters of a built circuit (src/index.js): one in a circuit without an
// environment writes nowhere (ENV_EMITTER_ALONE, as compile says it to the simulation).
export function emitterIssues(circuit, parts = []) {
  const declared = circuit?.environment != null && typeof circuit.environment === 'object' && !Array.isArray(circuit.environment);
  if (declared) return [];
  return parts.flatMap((part) => {
    const emits = emitsOf(deviceFor(part));
    return emits.length ? [issue('info', 'ENV_EMITTER_ALONE', { part: part.id, field: emits.join(', ') })] : [];
  });
}
