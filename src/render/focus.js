// Focus: a veil dims the whole drawing, then the parts being explained (and the metal strips
// under their leads) are drawn again on top. They show even where another part covers them,
// like an X-ray. The same pieces serve a static image (`focus: ['R1']`) and the interactive
// page, where every part has its copy ready and a click decides which ones are shown.
//
// Layers, in drawing order: veil → strips → coords → spotlight (→ flow, see src/sim/flow.js).

import { v3 } from '../core/vec.js';

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

// The coordinates of some holes, highlighted where the board prints them: the column number
// above and below the grid, the row letter at both ends (rail holes only have a column). Each
// tag is a dark pill with the number in white, upright on screen so it reads at any zoom, and
// carries data-col or data-row so a page can show only the tapped part's.
export const COORD_FILL = '#2b3a4a';
export function coordOps(scene, board, holes) {
  const { spec, xOf, yOf } = board;
  const ys = spec.rows.map((r) => r.y);
  const numberRows = [Math.min(...ys) - 0.8, Math.max(...ys) + 0.8].map(yOf);
  const at = (x, y) => scene.camera.project(v3(x, y, 0));
  const a = at(xOf(1), numberRows[0]);
  const b = at(xOf(2), numberRows[0]);
  const size = Math.hypot(b.x - a.x, b.y - a.y) * 0.62; // one pitch on screen, so neighbours never overlap
  const tag = (text, p, data) => {
    const width = size * (0.6 * text.length + 0.5);
    const height = size * 1.35;
    return [
      { kind: 'rect', x: p.x - width / 2, y: p.y - height / 2, width, height, rx: height / 2, fill: COORD_FILL, stroke: '#ffffff', strokeWidth: size * 0.12, cls: 'coord', data },
      { kind: 'text', text, x: p.x, y: p.y, size, weight: 700, anchor: 'middle', fill: '#ffffff', cls: 'coord', data },
    ];
  };
  const cols = [...new Set(holes.map((h) => h.col))].sort((m, n) => m - n);
  const rows = [...new Set(holes.filter((h) => h.kind === 'main').map((h) => h.row))].sort();
  const ops = [];
  for (const col of cols) for (const y of numberRows) ops.push(...tag(String(col), at(xOf(col), y), { col }));
  for (const row of rows) {
    const y = yOf(spec.rows.find((r) => r.id === row).y);
    for (const x of [xOf(1) - 1.9, xOf(spec.columns) + 1.9]) ops.push(...tag(row, at(x, y), { row }));
  }
  return ops;
}

// Copies of the parts (bodies and leads) in painting order; `ids` null = every part.
export function spotlightOps(scene, ids = null) {
  const keep = (op) => op.part && (!ids || ids.has(op.part));
  return [...scene.layers.under.filter(keep), ...scene.layers.parts.filter(keep)].map((op) => ({ ...op }));
}

// Copies of their labels: a layer of their own, above the current layer, so a label is never
// covered by the conductors and dots.
export function spotlabelOps(scene, ids = null) {
  return scene.layers.labels.filter((op) => op.part && (!ids || ids.has(op.part))).map((op) => ({ ...op }));
}

// The nodes under the leads of some parts.
export function nodesOf(built, ids) {
  return [...new Set(built.parts.filter((p) => ids.has(p.id)).flatMap((p) => p.holes.map((h) => h.node)))];
}

// Static focus: dim everything except `ids` (a list of part ids) and their strips.
export function focusLayers(scene, built, ids) {
  const set = new Set(ids);
  const holes = built.parts.filter((p) => set.has(p.id)).flatMap((p) => p.holes);
  return { veil: veilOps(scene.frame), strips: stripOps(scene, built.board, nodesOf(built, set)), coords: coordOps(scene, built.board, holes), spotlight: spotlightOps(scene, set), spotlabels: spotlabelOps(scene, set) };
}
