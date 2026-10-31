// Focus: a veil dims the whole drawing, then the parts being explained (and the metal strips
// under their leads) are drawn again on top. They show even where another part covers them,
// like an X-ray. The same pieces serve a static image (`focus: ['R1']`) and the interactive
// page, where every part has its copy ready and a click decides which ones are shown.
//
// Layers, in drawing order: veil → strips → coords → spotlight (→ flow, see src/sim/flow.js).

import { v3, X, Y, scale } from '../core/vec.js';
import { textDecal } from '../geometry/primitives.js';
import { decalTextOp } from './scene.js';

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

// The coordinates of some holes, lit (stage and video, V3): the board's own print, the same glyph,
// size and place, lying on the board, in the accent colour. A column the board does not number gets
// the same print. Drawn on the board, so the parts cover them as they cover the print (nothing is
// drawn over the board to say where a lead is). Each carries data-col or data-row so a page can
// show only the tapped part's. The layout matches draw-board.js.
export const COORD_COLOR = '#1b6ec2';
const DOWN = scale(Y, -1);
export function coordOps(scene, board, holes) {
  const { spec, xOf, yOf } = board;
  const ys = spec.rows.map((r) => r.y);
  const numberRows = [Math.min(...ys) - 0.8, Math.max(...ys) + 0.8].map(yOf);
  const lit = (text, x, y, size, data) => {
    const { box, px, ...op } = decalTextOp(scene.camera, textDecal({ text, at: v3(x, y, 0), right: X, down: DOWN, size, color: COORD_COLOR }));
    return { ...op, cls: 'coord', data };
  };
  const cols = [...new Set(holes.map((h) => h.col))].sort((m, n) => m - n);
  const rows = [...new Set(holes.filter((h) => h.kind === 'main').map((h) => h.row))].sort();
  const ops = [];
  for (const col of cols) for (const y of numberRows) ops.push(lit(String(col), xOf(col), y, 1.4, { col }));
  for (const row of rows) {
    const y = yOf(spec.rows.find((r) => r.id === row).y);
    for (const x of [xOf(1) - 1.9, xOf(spec.columns) + 1.9]) ops.push(lit(row, x, y, 1.5, { row }));
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
