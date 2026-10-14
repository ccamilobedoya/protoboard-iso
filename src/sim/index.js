// Simulator: from a circuit file to node voltages and part currents.
//
//   simulate(circuit, { analysis: 'dc' })                                   → operating point
//   simulate(circuit, { analysis: 'transient', stop, step, start, points })  → time series
//
// The circuit says where the power comes from in `supplies` (a bench supply on the rails or
// a battery). Every result is a **model**: ideal strips, typical part values (models.js).
// Parts the simulator does not know yet (integrated circuits) are left unconnected and
// reported. Runs in Node and in the browser.

import { buildCircuit } from '../circuit/build.js';
import {
  WIRE_RESISTANCE,
  DIODES,
  ledModel,
  MOSFETS,
  MOSFET_DEFAULT,
  BJTS,
  BJT_DEFAULT,
  RESISTOR_POWER,
  CERAMIC_VOLTAGE,
  BATTERY_CELL_RESISTANCE,
} from './models.js';
import { resistor, capacitor, voltageSource, currentSource, junction, mosfet, bjt, operatingPoint, newton } from './mna.js';

const issue = (severity, code, params) => ({ severity, code, params });
const q = (value, unit) => ({ value, unit }); // a quantity, formatted per language by formatIssue
const BUTTON_CONTACT = 0.1; // closed tactile switch, ohms (datasheets: ≤ 100 mΩ)
const SHORT_CURRENT = 3; // amperes from an unlimited source that mean "short circuit"

// ── Netlist → elements ──────────────────────────────────────────────────────────────

function resolveSupplyNode(board, ref) {
  if (ref == null) return null;
  const hole = board.find(String(ref));
  if (hole) return hole.node;
  for (const h of board.holes.values()) if (h.node === String(ref)) return h.node;
  return null;
}

function supplyList(circuit) {
  return (Array.isArray(circuit.supplies) ? circuit.supplies : []).map((s, i) => {
    const kind = s.kind ?? 'bench';
    const voltage = Number(s.voltage);
    const cells = Math.max(1, Math.round(voltage / 1.5));
    return {
      id: s.id ?? `V${i + 1}`,
      kind,
      voltage,
      positive: s.positive ?? 'T+',
      negative: s.negative ?? 'T-',
      currentLimit: s.currentLimit === undefined ? null : Number(s.currentLimit),
      internalResistance: Number(s.internalResistance ?? (kind === 'battery' ? cells * BATTERY_CELL_RESISTANCE : 0)),
    };
  });
}

// Everything the analyses need, built once per circuit.
function prepare(circuit) {
  const built = buildCircuit(circuit);
  const issues = [];
  if (!built.board) return { issues: built.issues, fatal: true };
  if (built.issues.some((i) => i.severity === 'error')) {
    return { issues: [issue('error', 'SIM_PLACEMENT_ERRORS', {})], fatal: true };
  }
  const supplies = supplyList(circuit);
  if (!supplies.length) return { issues: [issue('error', 'SIM_NO_SUPPLY', {})], fatal: true };

  // Node indices: netlist nodes, then supply nodes, then internal nodes; ground is −1.
  const index = new Map();
  const names = [];
  const nodeIndex = (name) => {
    if (!index.has(name)) {
      index.set(name, names.length);
      names.push(name);
    }
    return index.get(name);
  };
  for (const s of supplies) {
    s.p = resolveSupplyNode(built.board, s.positive);
    s.n = resolveSupplyNode(built.board, s.negative);
    if (!s.p || !s.n || s.p === s.n || !(Number.isFinite(s.voltage) && s.voltage >= 0)) {
      return { issues: [issue('error', 'SIM_BAD_SUPPLY', { supply: s.id })], fatal: true };
    }
  }
  const ground = supplies[0].n;
  index.set(ground, -1);
  for (const name of Object.keys(built.netlist.nodes)) nodeIndex(name);
  for (const s of supplies) {
    nodeIndex(s.p);
    nodeIndex(s.n);
  }
  let internal = 0;
  const inner = (label) => nodeIndex(`~${label}#${internal++}`);

  const elements = [];
  const parts = [];

  for (const part of built.parts) {
    const e = part.def.electrical;
    const raw = part.raw;
    const pin = (name) => nodeIndex(part.holes[part.pinNames.indexOf(name)].node);
    const at = (i) => nodeIndex(part.holes[i].node);
    const entry = { id: part.id, kind: e?.kind, pins: part.pinNames.map((name, i) => ({ name, node: part.holes[i].node, index: at(i) })) };
    const add = (el) => {
      elements.push(el);
      return el;
    };
    switch (e?.kind) {
      case 'W':
        entry.main = add(resistor(at(0), at(1), WIRE_RESISTANCE));
        break;
      case 'R': {
        entry.main = add(resistor(at(0), at(1), e.resistance));
        entry.maxPower = RESISTOR_POWER[String(raw.power ?? '1/4').replace(/\s*W$/i, '')] ?? 0.25;
        break;
      }
      case 'POT': {
        const r1 = Math.max(e.resistance * e.position, 1e-3);
        const r2 = Math.max(e.resistance * (1 - e.position), 1e-3);
        entry.upper = add(resistor(pin('1'), pin('W'), r1));
        entry.lower = add(resistor(pin('W'), pin('3'), r2));
        break;
      }
      case 'SW': {
        entry.poles = e.poles.map(([a, b]) => ({ a, b, el: add(resistor(pin(a), pin(b), WIRE_RESISTANCE)) }));
        if (e.pressed) entry.main = add(resistor(pin(e.poles[0][0]), pin(e.poles[1][0]), BUTTON_CONTACT));
        entry.contact = [e.poles[0][0], e.poles[1][0]];
        entry.pressed = e.pressed;
        break;
      }
      case 'C': {
        entry.main = add(capacitor(at(0), at(1), e.capacitance));
        entry.polarised = Boolean(e.polarised);
        entry.maxVoltage = e.voltage ?? CERAMIC_VOLTAGE;
        break;
      }
      case 'D':
      case 'LED': {
        const model = e.kind === 'LED' ? ledModel(e.color, raw.model) : { ...(DIODES[e.part] ?? DIODES['1N4148']), ...raw.model };
        if (e.kind === 'D' && !DIODES[e.part]) issues.push(issue('info', 'SIM_DEFAULT_MODEL', { part: part.id, model: '1N4148' }));
        const mid = model.rs > 0 ? inner(part.id) : at(0);
        if (model.rs > 0) add(resistor(at(0), mid, model.rs));
        entry.main = add(junction(mid, at(1), model));
        entry.model = model;
        break;
      }
      case 'M': {
        const known = MOSFETS[e.part];
        if (!known) issues.push(issue('info', 'SIM_DEFAULT_MODEL', { part: part.id, model: 'MOSFET' }));
        const model = { ...MOSFET_DEFAULT, ...(e.channel && { channel: e.channel }), ...known, ...raw.model };
        entry.main = add(mosfet(pin('D'), pin('G'), pin('S'), model));
        entry.model = model;
        break;
      }
      case 'Q': {
        const known = BJTS[e.part];
        if (!known) issues.push(issue('info', 'SIM_DEFAULT_MODEL', { part: part.id, model: 'BJT' }));
        const model = { ...BJT_DEFAULT, ...(e.polarity && { polarity: e.polarity }), ...known, ...raw.model };
        if (model.darlington) {
          const { first, second, r1, r2 } = model.darlington;
          const x = inner(part.id);
          entry.first = add(bjt(pin('C'), pin('B'), x, { ...first, polarity: model.polarity }));
          entry.second = add(bjt(pin('C'), x, pin('E'), { ...second, polarity: model.polarity }));
          entry.r1 = add(resistor(pin('B'), x, r1));
          entry.r2 = add(resistor(x, pin('E'), r2));
        } else {
          entry.main = add(bjt(pin('C'), pin('B'), pin('E'), model));
        }
        entry.model = model;
        break;
      }
      default:
        issues.push(issue('info', 'SIM_UNSUPPORTED', { part: part.id }));
        entry.unsupported = true;
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

  // Voltage sources last: their current unknowns go after every node voltage.
  const nodeCount = names.length;
  let row = nodeCount;
  for (const s of supplies) s.source = voltageSource(s.top, s.nIndex, row++, s.voltage);
  const references = tied.map((n) => voltageSource(n, -1, row++, 0));
  const all = [...elements, ...supplies.flatMap((s) => [s.source, s.series].filter(Boolean)), ...references];
  return { issues, built, supplies, parts, names, index, ground, floating, system: { size: row, nodeCount, elements: all } };
}

// ── Reading results ─────────────────────────────────────────────────────────────────

const volt = (x, i) => (i >= 0 ? x[i] : 0);

function supplyReading(s, x, ctx) {
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
  const two = (el) => {
    const v = volt(x, entry.pins[0].index) - volt(x, entry.pins[1].index);
    const i = el ? el.currents(x, ctx)[0] : 0;
    return { voltage: v, current: i, power: v * i };
  };
  const isFloating = entry.pins.some((p) => floating.has(p.node));
  switch (entry.kind) {
    case 'W':
    case 'R':
    case 'C':
      Object.assign(out, two(entry.main));
      break;
    case 'D':
    case 'LED': {
      Object.assign(out, two(entry.main));
      if (entry.kind === 'LED') out.brightness = Math.max(0, out.current) / entry.model.ratedCurrent;
      break;
    }
    case 'POT': {
      const i1 = entry.upper.currents(x, ctx)[0];
      const i2 = entry.lower.currents(x, ctx)[0];
      const v1 = volt(x, entry.upper.nodes[0]) - volt(x, entry.upper.nodes[1]);
      const v2 = volt(x, entry.lower.nodes[0]) - volt(x, entry.lower.nodes[1]);
      Object.assign(out, { currents: { '1': i1, W: i2 - i1, '3': -i2 }, power: v1 * i1 + v2 * i2 });
      break;
    }
    case 'SW':
      Object.assign(out, { pressed: entry.pressed, current: entry.main ? entry.main.currents(x, ctx)[0] : 0 });
      break;
    case 'M': {
      const [d, g, s] = entry.main.nodes;
      const vgs = volt(x, g) - volt(x, s);
      const vds = volt(x, d) - volt(x, s);
      const id = entry.main.currents(x, ctx)[0];
      const m = entry.model;
      const sign = m.channel === 'p' ? -1 : 1;
      const vov = sign * vgs - Math.abs(m.vth);
      const region = vov <= 0 ? 'off' : sign * vds < vov ? 'linear' : 'saturation';
      Object.assign(out, { currents: { D: id, G: 0, S: -id }, vgs, vds, power: vds * id, region });
      break;
    }
    case 'Q': {
      const c = entry.pins.find((p) => p.name === 'C').index;
      const b = entry.pins.find((p) => p.name === 'B').index;
      const e = entry.pins.find((p) => p.name === 'E').index;
      let ic;
      let ib;
      if (entry.main) [ic, ib] = entry.main.currents(x, ctx);
      else {
        const [c1, b1] = entry.first.currents(x, ctx);
        const [c2] = entry.second.currents(x, ctx);
        ic = c1 + c2;
        ib = b1 + entry.r1.currents(x, ctx)[0];
      }
      const vbe = volt(x, b) - volt(x, e);
      const vce = volt(x, c) - volt(x, e);
      const sign = entry.model.polarity === 'pnp' ? -1 : 1;
      const on = sign * vbe > (entry.model.darlington ? 1.0 : 0.5);
      const region = !on ? 'off' : sign * (vbe - vce) > 0.4 ? 'saturation' : 'active';
      Object.assign(out, { currents: { C: ic, B: ib, E: -(ic + ib) }, vbe, vce, power: vce * ic + vbe * ib, region, beta: ib ? ic / ib : null });
      break;
    }
    default:
      out.unsupported = true;
  }
  if (isFloating) out.floating = true;
  out.pinCurrents = pinCurrents(entry, out, x, ctx);
  return out;
}

// Current into the part at each pin (amperes, positive = into the part). Kirchhoff: they add
// up to zero. The current-flow layer reads these.
function pinCurrents(entry, out, x, ctx) {
  const names = entry.pins.map((p) => p.name);
  if (out.unsupported) return Object.fromEntries(names.map((n) => [n, 0]));
  if (out.currents) return { ...out.currents };
  if (entry.kind === 'SW') {
    const result = Object.fromEntries(names.map((n) => [n, 0]));
    for (const { a, b, el } of entry.poles) {
      const i = el.currents(x, ctx)[0];
      result[a] += i;
      result[b] -= i;
    }
    if (entry.main) {
      const i = entry.main.currents(x, ctx)[0];
      result[entry.contact[0]] += i;
      result[entry.contact[1]] -= i;
    }
    return result;
  }
  return { [names[0]]: out.current ?? 0, [names[1]]: -(out.current ?? 0) };
}

function readAll(prep, x, ctx) {
  const nodes = {};
  for (const [name, i] of prep.index) if (!name.startsWith('~')) nodes[name] = prep.floating.has(name) ? null : volt(x, i);
  const parts = Object.fromEntries(prep.parts.map((p) => [p.id, partReading(p, x, ctx, prep.floating)]));
  const supplies = Object.fromEntries(prep.supplies.map((s) => [s.id, { kind: s.kind, ...supplyReading(s, x, ctx) }]));
  return { nodes, parts, supplies };
}

// Warnings a learner should see: limits exceeded, a supply in current limit, floating nodes.
function limitIssues(prep, reading) {
  const out = [];
  for (const p of prep.parts) {
    const r = reading.parts[p.id];
    if (r.floating) continue;
    if (p.kind === 'R' && p.maxPower && r.power > p.maxPower) {
      out.push(issue('warning', 'SIM_OVER_POWER', { part: p.id, power: q(r.power, 'W'), max: q(p.maxPower, 'W') }));
    }
    if ((p.kind === 'M' || p.kind === 'Q') && p.model.maxPower && r.power > p.model.maxPower) {
      out.push(issue('warning', 'SIM_OVER_POWER', { part: p.id, power: q(r.power, 'W'), max: q(p.model.maxPower, 'W') }));
    }
    if ((p.kind === 'LED' || p.kind === 'D') && r.current > p.model.maxCurrent) {
      out.push(issue('warning', 'SIM_OVER_CURRENT', { part: p.id, current: q(r.current, 'A'), max: q(p.model.maxCurrent, 'A') }));
    }
    if (p.kind === 'LED' && -r.voltage > p.model.maxReverse) {
      out.push(issue('warning', 'SIM_REVERSE_VOLTAGE', { part: p.id, voltage: q(-r.voltage, 'V'), max: q(p.model.maxReverse, 'V') }));
    }
    if (p.kind === 'C') {
      if (p.polarised && r.voltage < -0.5) out.push(issue('warning', 'SIM_CAP_REVERSED', { part: p.id, voltage: q(-r.voltage, 'V') }));
      if (Math.abs(r.voltage) > p.maxVoltage) out.push(issue('warning', 'SIM_CAP_OVER_VOLTAGE', { part: p.id, voltage: q(Math.abs(r.voltage), 'V'), max: q(p.maxVoltage, 'V') }));
    }
  }
  for (const s of prep.supplies) {
    const r = reading.supplies[s.id];
    if (r.mode === 'CC') out.push(issue('warning', 'SIM_SUPPLY_LIMITED', { supply: s.id, limit: q(s.currentLimit, 'A'), voltage: q(r.voltage, 'V') }));
    else if (r.current > SHORT_CURRENT) out.push(issue('warning', 'SIM_SHORT_CIRCUIT', { supply: s.id, current: q(r.current, 'A') }));
  }
  const floating = [...prep.floating].filter((n) => prep.built.netlist.nodes[n]);
  if (floating.length) out.push(issue('warning', 'SIM_FLOATING', { nodes: floating.join(', '), parts: [...new Set(floating.flatMap((n) => prep.built.netlist.nodes[n].map((m) => m.part)))].join(', ') }));
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

// ── Public API ──────────────────────────────────────────────────────────────────────

export function simulate(circuit, options = {}) {
  const { analysis = 'dc' } = options;
  const prep = prepare(circuit);
  if (prep.fatal) return { analysis, model: true, ok: false, issues: prep.issues };
  return analysis === 'transient' ? transient(prep, options) : dc(prep);
}

function dc(prep) {
  const ctx = {};
  const r = solveWithLimits(prep, new Array(prep.system.size).fill(0), ctx);
  if (!r.ok) return { analysis: 'dc', model: true, ok: false, issues: [...prep.issues, issue('error', 'SIM_NO_CONVERGENCE', {})] };
  const reading = readAll(prep, r.x, ctx);
  return { analysis: 'dc', model: true, ok: true, iterations: r.iterations, ground: prep.ground, ...reading, issues: [...prep.issues, ...limitIssues(prep, reading)] };
}

// Transient: capacitors start discharged (start: 'zero', the supply switched on at t = 0)
// or at their DC values (start: 'dc'). Fixed step; at most `points` samples are kept.
function transient(prep, { stop, step, start = 'zero', points = 400 } = {}) {
  const caps = prep.system.elements.filter((el) => 'vprev' in el);
  stop = Number(stop);
  step = Number(step);
  if (!(stop > 0)) return { analysis: 'transient', model: true, ok: false, issues: [...prep.issues, issue('error', 'SIM_BAD_TIME', {})] };
  if (!(step > 0)) step = stop / 1000;
  const steps = Math.ceil(stop / step - 1e-9);
  if (steps > 2e5) return { analysis: 'transient', model: true, ok: false, issues: [...prep.issues, issue('error', 'SIM_BAD_TIME', {})] };

  let x = new Array(prep.system.size).fill(0);
  if (start === 'dc') {
    const r = solveWithLimits(prep, x, {});
    if (!r.ok) return { analysis: 'transient', model: true, ok: false, issues: [...prep.issues, issue('error', 'SIM_NO_CONVERGENCE', {})] };
    x = r.x;
    for (const c of caps) c.accept(x);
  }
  // t = 0: the capacitors hold their starting voltage (a very short step pins them there).
  const first = solveWithLimits(prep, x, { h: step * 1e-6 });
  if (!first.ok) return { analysis: 'transient', model: true, ok: false, issues: [...prep.issues, issue('error', 'SIM_NO_CONVERGENCE', {})] };
  x = first.x;

  const every = Math.max(1, Math.ceil(steps / points));
  const times = [];
  const samples = [];
  const record = (t, ctx) => {
    times.push(t);
    samples.push(readAll(prep, x, ctx));
  };
  record(0, { h: step * 1e-6 });
  const ctx = { h: step };
  const warnings = new Map();
  for (let k = 1; k <= steps; k++) {
    const r = newton(prep.system, x, ctx);
    if (!r.ok) return { analysis: 'transient', model: true, ok: false, issues: [...prep.issues, issue('error', 'SIM_NO_CONVERGENCE_AT', { time: q(k * step, 's') })] };
    x = r.x;
    if (k % every === 0 || k === steps) {
      record(k * step, ctx);
      for (const w of limitIssues(prep, samples.at(-1))) warnings.set(`${w.code}:${w.params.part ?? w.params.supply ?? ''}`, w);
    }
    for (const c of caps) c.accept(x);
  }

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

