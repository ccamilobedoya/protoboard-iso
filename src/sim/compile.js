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
//   devices:  [{ id, type, kind, pins: [{ name, node }], params } | { id, kind, pins, unsupported: true }]
//   issues:   what compiling found (default models, parts not simulated, a battery switched off)
// }

import { buildCircuit } from '../circuit/build.js';
import { BATTERY_CELL_RESISTANCE, GENERATOR_RESISTANCE } from './models.js';
import { batteryModel } from '../parts/batteries.js';
import { WAVEFORMS, waveAt } from './generator.js';
import { deviceFor } from './devices/index.js';
import { issue } from './devices/shared.js';

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

function supplyList(circuit) {
  return (Array.isArray(circuit.supplies) ? circuit.supplies : []).map((s, i) => {
    const kind = s.kind ?? 'bench';
    const common = { id: s.id ?? `V${i + 1}`, kind, positive: s.positive ?? 'T+', negative: s.negative ?? 'T-', currentLimit: s.currentLimit === undefined ? null : Number(s.currentLimit) };
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
  const supplies = [...supplyList(circuit), ...built.parts.filter((p) => p.def.electrical?.kind === 'BAT').map(batterySupply)];
  if (!supplies.length) return { issues: [issue('error', 'SIM_NO_SUPPLY', {})], fatal: true };
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
  const ground = supplies[0].n;
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

  const devices = built.parts.map((part) => {
    const kind = part.def.electrical?.kind;
    const pins = part.pinNames.map((name, i) => ({ name, node: part.holes[i].node }));
    const device = deviceFor(part);
    if (!device) {
      issues.push(issue('info', 'SIM_UNSUPPORTED', { part: part.id }));
      return { id: part.id, kind, pins, unsupported: true };
    }
    return { id: part.id, type: part.type, kind, pins, params: device.params(part, { issues }) };
  });
  return { program: { v: 1, ground, nodes, members, supplies, devices, issues } };
}
