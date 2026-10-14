// Focus: a veil dims the whole drawing, then the parts being explained (and the metal strips
// under their leads) are drawn again on top. They show even where another part covers them,
// like an X-ray. The same pieces serve a static image (`focus: ['R1']`) and the interactive
// page, where every part has its copy ready and a click decides which ones are shown.
//
// Layers, in drawing order: veil → strips → spotlight (→ flow, see src/sim/flow.js).

export const VEIL_OPACITY = 0.8;

// The veil covers far more than the frame: pages pan and zoom out.
export function veilOps(frame) {
  const m = Math.max(frame.width, frame.height) * 4;
  return [{ kind: 'rect', x: frame.x - m, y: frame.y - m, width: frame.width + 2 * m, height: frame.height + 2 * m, rx: 0, fill: '#ffffff', fillOpacity: VEIL_OPACITY, stroke: 'none', strokeWidth: 0 }];
}

// Holes of a connected group in the order the metal runs: rows a→e in a strip, columns along a rail.
export function stripHoles(board, node) {
  const holes = [...board.holes.values()].filter((h) => h.node === node);
  return /^\d+:/.test(node) ? holes.sort((a, b) => a.row.localeCompare(b.row)) : holes.sort((a, b) => a.col - b.col);
}

// The metal clip under the holes of each group: a bar from end to end and a dot per hole.
export function stripOps(scene, board, nodes) {
  const ops = [];
  for (const node of nodes) {
    const points = stripHoles(board, node).map((h) => scene.camera.project(h.pos));
    if (points.length < 2) continue;
    const [a, b] = [points[0], points.at(-1)];
    const data = { node };
    ops.push({ kind: 'line', x1: a.x, y1: a.y, x2: b.x, y2: b.y, stroke: '#8d96a0', strokeWidth: 6, linecap: 'round', cls: 'strip', data });
    ops.push({ kind: 'line', x1: a.x, y1: a.y, x2: b.x, y2: b.y, stroke: '#d9dee4', strokeWidth: 3.4, linecap: 'round', cls: 'strip', data });
    for (const p of points) ops.push({ kind: 'circle', cx: p.x, cy: p.y, r: 1.1, fill: '#5f6b76', cls: 'strip', data });
  }
  return ops;
}

// Copies of the parts (bodies, leads, labels) in painting order; `ids` null = every part.
export function spotlightOps(scene, ids = null) {
  const keep = (op) => op.part && (!ids || ids.has(op.part));
  return [...scene.layers.under.filter(keep), ...scene.layers.parts.filter(keep), ...scene.layers.labels.filter(keep)].map((op) => ({ ...op }));
}

// The nodes under the leads of some parts.
export function nodesOf(built, ids) {
  return [...new Set(built.parts.filter((p) => ids.has(p.id)).flatMap((p) => p.holes.map((h) => h.node)))];
}

// Static focus: dim everything except `ids` (a list of part ids) and their strips.
export function focusLayers(scene, built, ids) {
  const set = new Set(ids);
  return { veil: veilOps(scene.frame), strips: stripOps(scene, built.board, nodesOf(built, set)), spotlight: spotlightOps(scene, set) };
}
