// The circuit as electrical nets: board groups joined by jumper wires, each with the part pins on
// it. One answer for "is everything connected as the brief says?", instead of one query per strip.
//
// nets(circuit) → { nets: [{ groups, wires, label, pins: ['R1.1@d20', …] }], floating: […] }

import { buildCircuit } from './circuit/build.js';

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
