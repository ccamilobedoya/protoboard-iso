// Current flow, drawn as moving dots: along the metal strips inside the board and through
// every part, at a speed that grows with the current. Dots follow the electrons (from − to +)
// by default; a page can reverse them to show conventional current.
//
// The current in each piece of a strip comes from Kirchhoff's current law: walking along the
// strip, the current between two holes is the sum of what entered at the holes behind.

import { stripHoles } from '../render/focus.js';

export const MIN_CURRENT = 1e-6; // below a microampere nothing moves
export const DOT_PERIOD = 9; // one dot every 9 px

// Dot speed in px/s: logarithmic, so microamperes and amperes both read as "slow" and "fast".
export function dotSpeed(current) {
  const a = Math.abs(current);
  if (a < MIN_CURRENT) return 0;
  return Math.min(150, 12 + 22 * Math.log10(a / MIN_CURRENT));
}

const average = (points) => ({
  x: points.reduce((s, p) => s + p.x, 0) / points.length,
  y: points.reduce((s, p) => s + p.y, 0) / points.length,
  z: points.reduce((s, p) => s + p.z, 0) / points.length,
});

// Where each supply lead touches the board: the hole given, or the first hole of its group.
function supplyHoles(board, circuit) {
  return (Array.isArray(circuit.supplies) ? circuit.supplies : []).map((s, i) => {
    const pick = (ref, fallback) => {
      const r = String(ref ?? fallback);
      return board.find(r) ?? stripHoles(board, r)[0] ?? null;
    };
    return { id: s.id ?? `V${i + 1}`, positive: pick(s.positive, 'T+'), negative: pick(s.negative, 'T-') };
  });
}

// Segments with their conventional current (A, from `from` to `to`), in board coordinates.
export function flowSegments(built, sim, circuit) {
  if (!sim?.ok) return [];
  const segments = [];
  const entering = new Map(); // hole id → current entering the strip there
  const add = (hole, i) => entering.set(hole.id, (entering.get(hole.id) ?? 0) + i);

  for (const part of built.parts) {
    const reading = sim.parts[part.id];
    if (!reading?.pinCurrents || reading.floating) continue;
    const centre = average(part.holes.map((h) => h.pos));
    part.holes.forEach((hole, k) => {
      const i = reading.pinCurrents[part.pinNames[k]] ?? 0;
      add(hole, -i);
      segments.push({ from: hole.pos, to: centre, current: i, part: part.id });
    });
  }
  const nodes = new Set(Object.keys(built.netlist.nodes));
  for (const s of supplyHoles(built.board, circuit)) {
    const reading = sim.supplies[s.id];
    if (!reading || !s.positive || !s.negative) continue;
    add(s.positive, reading.current);
    add(s.negative, -reading.current);
    nodes.add(s.positive.node).add(s.negative.node);
  }
  for (const node of nodes) {
    const holes = stripHoles(built.board, node);
    let running = 0;
    for (let k = 0; k < holes.length - 1; k++) {
      running += entering.get(holes[k].id) ?? 0;
      segments.push({ from: holes[k].pos, to: holes[k + 1].pos, current: running, node });
    }
  }
  return segments.filter((s) => Math.abs(s.current) >= MIN_CURRENT);
}

// The same segments as drawing operations: dots move from x1,y1 to x2,y2, in the direction
// electrons go (against the conventional current).
export function flowOps(scene, built, sim, circuit) {
  return flowSegments(built, sim, circuit).map((s) => {
    const a = scene.camera.project(s.from);
    const b = scene.camera.project(s.to);
    const [p, q] = s.current > 0 ? [b, a] : [a, b];
    const seconds = DOT_PERIOD / dotSpeed(s.current);
    return {
      kind: 'line',
      x1: p.x,
      y1: p.y,
      x2: q.x,
      y2: q.y,
      stroke: '#e8590c',
      strokeWidth: 2.6,
      linecap: 'round',
      dash: `0 ${DOT_PERIOD}`,
      cls: 'electrons',
      style: `animation-duration:${seconds.toFixed(3)}s`,
      ...(s.part && { part: s.part }),
      data: s.part ? { flow: s.part } : { node: s.node },
    };
  });
}
