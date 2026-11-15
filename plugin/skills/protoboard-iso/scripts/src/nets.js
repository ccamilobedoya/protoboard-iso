// The circuit as electrical nets: board groups joined by jumper wires, each with the part pins on
// it. One answer for "is everything connected as the brief says?", instead of one query per strip.
//
// nets(circuit) → { nets: [{ groups, wires, label, pins: ['R1.1@d20', …] }], floating: […] }

import { buildCircuit } from './circuit/build.js';
import { railName } from './board/board.js';

export function nets(circuit) {
  const built = buildCircuit(circuit);
  const labels = circuit.netLabels ?? {};
  const parent = new Map();
  const find = (x) => {
    while (parent.get(x) !== x) {
      parent.set(x, parent.get(parent.get(x)));
      x = parent.get(x);
    }
    return x;
  };
  const union = (a, b) => parent.set(find(a), find(b));
  for (const node of Object.keys(built.netlist.nodes)) parent.set(node, node);
  const wires = built.parts.filter((p) => p.type === 'wire' && p.holes.length === 2);
  for (const w of wires) union(w.holes[0].node, w.holes[1].node);

  const byRoot = new Map();
  const netOf = (root) => {
    if (!byRoot.has(root)) byRoot.set(root, { groups: [], wires: [], label: null, pins: [] });
    return byRoot.get(root);
  };
  for (const [node, members] of Object.entries(built.netlist.nodes)) {
    const net = netOf(find(node));
    net.groups.push(node);
    const label = labels[node] ?? labels[node.split(':')[0]];
    if (label) net.label = net.label ? `${net.label}, ${label}` : label;
    for (const m of members) if (!wires.some((w) => w.id === m.part)) net.pins.push(`${m.part}.${m.pin}@${m.hole}`);
  }
  for (const w of wires) netOf(find(w.holes[0].node)).wires.push(w.id);

  const list = [...byRoot.values()];
  // Rails first, then by the lowest column, so the order is stable and easy to follow.
  const col = (g) => Number(/\d+/.exec(g)?.[0] ?? 0);
  const rank = (net) => (net.groups.some((g) => !g.includes(':')) ? 0 : 1);
  list.sort((a, b) => rank(a) - rank(b) || Math.min(...a.groups.map(col)) - Math.min(...b.groups.map(col)));
  // A pin alone on its net (and no label) goes nowhere.
  const floating = list.filter((n) => n.pins.length === 1 && !n.label).map((n) => n.pins[0]);
  return { board: built.netlist.board, nets: list, floating };
}

export function formatNets(r, lang, { t }) {
  const lines = [t(lang, 'nets.header', { nets: r.nets.length })];
  r.nets.forEach((n, i) => {
    const groups = n.groups.join(' + ');
    lines.push(`  ${i + 1}. ${groups}${n.label ? ` (${n.label})` : ''}${n.wires.length ? ` · ${n.wires.join(' ')}` : ''} · ${n.pins.join(' ') || '—'}`);
  });
  if (r.floating.length) lines.push(t(lang, 'nets.floating', { pins: r.floating.join(', ') }));
  return lines.join('\n');
}

const pinKey = (ref) => {
  const m = /^([^.\s]+)\.(\S+)$/.exec(String(ref).trim());
  return m ? `${m[1]}.${m[2].toLowerCase()}` : null;
};

// Groups a development board joins inside itself (a DevKit's GND and GND2, an UNO's SDA and A4):
// pairs of the nodes its pins of one internal group are in. Only boards (type module): a button's
// legs are joined too, but checking them is a change of its own.
export function internalLinks(built) {
  const out = [];
  for (const p of built.parts) {
    if (p.type !== 'module') continue;
    for (const group of p.def?.internal ?? []) {
      const nodes = group.map((n) => p.holes[p.pinNames.indexOf(n)]?.node).filter(Boolean);
      for (let k = 1; k < nodes.length; k++) out.push([nodes[0], nodes[k]]);
    }
  }
  return out;
}

// The nets asked for against the circuit built: every pin of a net on one electrical net
// (missing: the pins left out), and no two nets asked for on the same one (shorted).
export function checkNets(circuit, asked) {
  // Nets asked for that share a pin or a rail are one net (a ground bridge: [T-, B-]).
  const nets = [];
  for (const net of asked) {
    const keys = new Set(net.pins.map((p) => railName(p) ?? pinKey(p)));
    const into = nets.find((n) => [...keys].some((k) => n.keys.has(k)));
    if (into) {
      keys.forEach((k) => into.keys.add(k));
      into.pins.push(...net.pins);
    } else nets.push({ index: nets.length, keys, pins: [...net.pins] });
  }
  for (let merged = true; merged; ) {
    merged = false;
    for (let i = 0; i < nets.length && !merged; i++) {
      for (let j = i + 1; j < nets.length && !merged; j++) {
        if ([...nets[j].keys].some((k) => nets[i].keys.has(k))) {
          nets[j].keys.forEach((k) => nets[i].keys.add(k));
          nets[i].pins.push(...nets[j].pins);
          nets.splice(j, 1);
          merged = true;
        }
      }
    }
  }
  nets.forEach((n, i) => (n.index = i));
  const built = buildCircuit(circuit);
  const parent = new Map();
  const find = (x) => {
    if (!parent.has(x)) parent.set(x, x);
    while (parent.get(x) !== x) x = parent.get(x);
    return x;
  };
  for (const w of built.parts.filter((p) => p.type === 'wire' && p.holes.length === 2)) parent.set(find(w.holes[0].node), find(w.holes[1].node));
  for (const [a, b] of internalLinks(built)) if (find(a) !== find(b)) parent.set(find(a), find(b));
  const holeOf = new Map();
  for (const p of built.parts) p.pinNames.forEach((n, i) => p.holes[i] && holeOf.set(`${p.id}.${n.toLowerCase()}`, p.holes[i]));
  const rootOf = (ref) => (railName(ref) ? find(railName(ref)) : holeOf.has(pinKey(ref)) ? find(holeOf.get(pinKey(ref)).node) : null);
  const missing = [];
  const owner = new Map();
  const shorted = [];
  for (const net of nets) {
    const roots = net.pins.map((ref) => [ref, rootOf(ref)]);
    const counts = new Map();
    for (const [, r] of roots) if (r) counts.set(r, (counts.get(r) ?? 0) + 1);
    const main = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
    const off = roots.filter(([, r]) => r !== main).map(([ref]) => ref);
    if (off.length) missing.push({ net: net.index + 1, pins: off });
    if (main) {
      if (owner.has(main) && owner.get(main) !== net.index) shorted.push({ nets: [owner.get(main) + 1, net.index + 1] });
      owner.set(main, net.index);
    }
  }
  return { ok: !missing.length && !shorted.length, missing, shorted };
}

// Readable answer for the CLI and the MCP tool.
