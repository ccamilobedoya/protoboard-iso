// The engine: runs a compiled program (compile.js). No dependencies outside src/sim and the
// devices, so the same code runs in Node (simulate, the CLI, the MCP server) and, bundled, in
// the browser page.
//
//   const engine = createEngine(program)
//   engine.dc()                                         → operating point
//   engine.transient({ stop, step, start, points })     → time series
//
// Every result is a **model**: ideal strips, typical part values (models.js).

import { resistor, voltageSource, currentSource, operatingPoint, newton } from './mna.js';
import { DEVICE_BY_TYPE } from './devices/index.js';
import { issue, q, volt, stressIssue } from './devices/shared.js';

const SHORT_CURRENT = 3; // amperes from an unlimited source that mean "short circuit"

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
  // Each part: its device adds the elements and keeps what its reading needs (devices/).
  for (const d of program.devices) {
    const entry = { id: d.id, kind: d.kind, pins: d.pins.map((p) => ({ name: p.name, node: p.node, index: nodeIndex(p.node) })) };
    if (d.unsupported) entry.unsupported = true;
    else {
      const device = DEVICE_BY_TYPE[d.type];
      const h = {
        id: d.id,
        pin: (name) => entry.pins.find((p) => p.name === name).index,
        at: (i) => entry.pins[i].index,
        inner: () => inner(d.id),
        add: (el) => {
          elements.push(el);
          return el;
        },
        supplies,
      };
      Object.assign(entry, d.params, { device }, device.elements(d.params, h));
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
  return { issues, members: program.members, supplies, parts, names, index, ground: program.ground, floating, system: { size: row, nodeCount, elements: all } };
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

// ── The engine ──────────────────────────────────────────────────────────────────────

export function createEngine(program) {
  const prep = prepare(program);
  return {
    dc: () => dc(prep),
    transient: (options) => transient(prep, options),
  };
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
  // Elements with a memory (capacitors, inductors): they take each accepted step.
  const caps = prep.system.elements.filter((el) => 'accept' in el);
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
    for (const c of caps) c.accept(x, {});
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
    for (const c of caps) c.accept(x, ctx);
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

