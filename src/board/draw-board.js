// 3D model of the breadboard: plastic block, centre channel, rail lines, holes and the
// printed row letters and column numbers.
//
// options
//   netLabels  { 'T+': '+5 V' } text printed beside a rail
//   highlight  Map node → colour: tint every hole group in use (annotation layer 'nodes')
//   allNumbers number every column instead of 1, 5, 10… (annotation layer 'grid')

import { v3, X, Y, scale } from '../core/vec.js';
import { prism, rectDecal, textDecal } from '../geometry/primitives.js';

const DOWN = scale(Y, -1); // printed text reads along +x with its bottom towards the front

export function drawBoard(board, { netLabels = {}, highlight = new Map(), allNumbers = false } = {}) {
  const { spec, pitch: P, xOf, yOf } = board;
  const { length: L, width: W, height: H } = spec.size;
  const c = spec.colors;

  const body = prism({
    profile: [[0, 0], [L, 0], [L, W], [0, W]],
    origin: v3(0, 0, -H),
    u: X,
    height: H,
    color: c.body,
    outline: true,
  });

  const decals = body.decals;
  const onTop = (x, y) => v3(x, y, 0);
  const firstCol = 1;
  const lastCol = spec.columns;

  const channelY = (yOf(spec.channel.from) + yOf(spec.channel.to)) / 2;
  decals.push(rectDecal({ center: onTop(L / 2, channelY), u: X, v: Y, width: L - 2 * P, height: P, color: c.channel }));

  // Joined boards: each board has its own rail lines, edge marks and row letters; a seam line
  // between boards, and a jumper bridging each rail across it.
  const seg = spec.segments ?? { count: 1, columns: spec.columns, length: L };
  const ends = Array.from({ length: seg.count }, (_, k) => [k * seg.columns + 1, (k + 1) * seg.columns]);
  for (let k = 1; k < seg.count; k++) {
    decals.push(rectDecal({ center: onTop(k * seg.length, W / 2), u: X, v: Y, width: 0.5, height: W, color: c.channel }));
  }
  for (const rail of spec.rails) {
    const y = yOf(rail.y + rail.line * 0.6);
    const color = rail.polarity === '+' ? c.plus : c.minus;
    for (const cols of board.railSegments) {
      const railStart = xOf(cols[0]) - P;
      const railEnd = xOf(cols.at(-1)) + P;
      decals.push(rectDecal({ center: onTop((railStart + railEnd) / 2, y), u: X, v: Y, width: railEnd - railStart, height: 0.45, color }));
    }
    const symbol = rail.polarity === '+' ? '+' : '−';
    for (const [a, b] of ends) {
      for (const x of [xOf(a) - 1.9, xOf(b) + 1.9]) {
        decals.push(textDecal({ text: symbol, at: onTop(x, yOf(rail.y)), right: X, down: DOWN, size: 2.2, color, weight: 700 }));
      }
    }
    // The bridge: a flat jumper in the rail's colour, plugged in at both ends.
    for (const bridge of board.railBridges) {
      const x0 = xOf(bridge.from);
      const x1 = xOf(bridge.to);
      const yRail = yOf(rail.y);
      decals.push({ ...rectDecal({ center: onTop((x0 + x1) / 2, yRail), u: X, v: Y, width: x1 - x0, height: 0.9, color }), role: 'bridge' });
      for (const x of [x0, x1]) decals.push(rectDecal({ center: onTop(x, yRail), u: X, v: Y, width: 1.3, height: 1.3, color: c.hole }));
    }
    if (netLabels[rail.id]) {
      decals.push({
        ...textDecal({ text: netLabels[rail.id], at: onTop(-1.5, yOf(rail.y)), right: X, down: DOWN, size: 2.4, color, anchor: 'end', weight: 700 }),
        role: 'net-label',
      });
    }
  }

  // Connected groups in use, tinted under their holes.
  for (const [node, color] of highlight) {
    const holes = [...board.holes.values()].filter((h) => h.node === node);
    if (!holes.length) continue;
    const xs = holes.map((h) => h.pos.x);
    const ys = holes.map((h) => h.pos.y);
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
    const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
    decals.push({
      ...rectDecal({ center: onTop(cx, cy), u: X, v: Y, width: Math.max(...xs) - Math.min(...xs) + 2.0, height: Math.max(...ys) - Math.min(...ys) + 2.0, color, opacity: 0.4 }),
      role: 'node',
    });
  }

  for (const hole of board.holes.values()) {
    decals.push(rectDecal({ center: hole.pos, u: X, v: Y, width: 1.1, height: 1.1, color: c.hole }));
  }

  const rowYs = spec.rows.map((r) => r.y);
  const numberRows = [Math.min(...rowYs) - 0.8, Math.max(...rowYs) + 0.8];
  for (let col = firstCol; col <= lastCol; col++) {
    if (!allNumbers && col !== 1 && col % 5 !== 0) continue;
    for (const py of numberRows) {
      decals.push(textDecal({ text: String(col), at: onTop(xOf(col), yOf(py)), right: X, down: DOWN, size: allNumbers ? 1.15 : 1.4, color: c.print }));
    }
  }
  for (const row of spec.rows) {
    for (const x of ends.flatMap(([a, b]) => [xOf(a) - 1.9, xOf(b) + 1.9])) {
      decals.push(textDecal({ text: row.id, at: onTop(x, yOf(row.y)), right: X, down: DOWN, size: 1.5, color: c.print }));
    }
  }

  return body;
}
