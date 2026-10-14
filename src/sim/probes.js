// "Where does this value come from?" Drawn on demand in the page, one group per result tag:
//
//   voltage of a group  red probe (+) on the hole it is read at, black probe (−) where the
//                       supply's ground is clipped, both strips lit, a dashed lead between
//   current of a part   arrows along its leads in the conventional direction: up the lead
//                       where it goes in, down the one where it comes out (Ic: in at the
//                       collector, out at the emitter)
//
// Each operation carries data-probe = "node:<group>" or "part:<id>", the key its tag has.

import { stripOps, stripHoles } from '../render/focus.js';
import { anchorHole } from './overlay.js';
import { MIN_CURRENT } from './flow.js';

const RED = '#d63a3a';
const BLACK = '#26292d';
const ARROW = '#b5452a';

// Where the reference (−) lead of the first supply touches the board.
export function groundHole(built, circuit) {
  const s = Array.isArray(circuit.supplies) ? circuit.supplies[0] : null;
  if (!s) return null;
  const ref = String(s.negative ?? 'T-');
  return built.board.find(ref) ?? stripHoles(built.board, ref)[0] ?? null;
}

function probe(point, color, sign, data) {
  return [
    { kind: 'line', x1: point.x, y1: point.y, x2: point.x, y2: point.y - 14, stroke: color, strokeWidth: 2.2, linecap: 'round', data },
    { kind: 'circle', cx: point.x, cy: point.y, r: 2.4, fill: color, stroke: '#ffffff', strokeWidth: 0.8, data },
    { kind: 'circle', cx: point.x, cy: point.y - 18, r: 5.5, fill: color, stroke: '#ffffff', strokeWidth: 1, data },
    { kind: 'text', text: sign, size: 8, x: point.x, y: point.y - 18, anchor: 'middle', fill: '#ffffff', weight: 700, px: 8, data },
  ];
}

function arrow(a, b, data) {
  // Shorten both ends a little so the arrow sits between the holes.
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const s = { x: a.x + ux * 1, y: a.y + uy * 1 };
  const e = { x: b.x - ux * 1, y: b.y - uy * 1 };
  const head = [
    e,
    { x: e.x - ux * 9 - uy * 5, y: e.y - uy * 9 + ux * 5 },
    { x: e.x - ux * 9 + uy * 5, y: e.y - uy * 9 - ux * 5 },
  ];
  return [
    { kind: 'line', x1: s.x, y1: s.y, x2: e.x - ux * 7, y2: e.y - uy * 7, stroke: '#ffffff', strokeWidth: 5, linecap: 'round', data },
    { kind: 'line', x1: s.x, y1: s.y, x2: e.x - ux * 7, y2: e.y - uy * 7, stroke: ARROW, strokeWidth: 2.8, linecap: 'round', data },
    { kind: 'polygon', pts: head, fill: ARROW, stroke: '#ffffff', strokeWidth: 0.8, data },
  ];
}

// Which pins a current tag is about: [pin name, +1 in | −1 out] (conventional current).
function currentPins(reading) {
  if (reading.kind === 'Q') return reading.currents.C >= 0 ? [['C', 1], ['E', -1]] : [['E', 1], ['C', -1]];
  if (reading.kind === 'M') return reading.currents.D >= 0 ? [['D', 1], ['S', -1]] : [['S', 1], ['D', -1]];
  return Object.entries(reading.pinCurrents ?? {})
    .filter(([, i]) => Math.abs(i) >= MIN_CURRENT)
    .map(([name, i]) => [name, Math.sign(i)]);
}

// An arrow along a lead: up from the hole where the current goes in, down to the hole where
// it comes out. Leads are short, so the arrow is the length of a lead above the board.
const LEAD = 6; // mm

export function probeOps(scene, built, sim, circuit) {
  if (!sim?.ok) return [];
  const ops = [];
  const ground = groundHole(built, circuit);
  for (const node of Object.keys(built.netlist.nodes)) {
    if (sim.nodes[node] == null || !ground) continue;
    const data = { probe: `node:${node}` };
    const hole = anchorHole(scene, built, node);
    const lit = (list, color) => list.map((op) => ({ ...op, data, ...(op.kind === 'line' && op.strokeWidth > 4 && { stroke: color }) }));
    ops.push(...lit(stripOps(scene, built.board, [node]), RED), ...lit(stripOps(scene, built.board, [ground.node]), BLACK));
    const a = scene.camera.project(hole.pos);
    const b = scene.camera.project(ground.pos);
    ops.push({ kind: 'line', x1: a.x, y1: a.y - 18, x2: b.x, y2: b.y - 18, stroke: '#3d3c39', strokeWidth: 1.3, dash: '4 3', data });
    ops.push(...probe(b, BLACK, '−', data), ...probe(a, RED, '+', data));
  }
  for (const part of built.parts) {
    const reading = sim.parts[part.id];
    if (part.def.electrical?.kind === 'W' || !reading?.pinCurrents || reading.floating) continue;
    const data = { probe: `part:${part.id}` };
    for (const [name, way] of currentPins(reading)) {
      const hole = part.holes[part.pinNames.indexOf(name)];
      if (!hole) continue;
      const low = scene.camera.project(hole.pos);
      const high = scene.camera.project({ ...hole.pos, z: hole.pos.z + LEAD });
      ops.push(...(way > 0 ? arrow(low, high, data) : arrow(high, low, data)));
    }
  }
  return ops;
}
