// 3D model of the breadboard: plastic block, centre channel, rail lines, holes and the
// printed row letters and column numbers. A double board is two blocks side by side, each with
// its own channel, the joint between them a line where their edges meet.
//
// options
//   netLabels  { 'T+': '+5 V' } text printed beside a rail
//   highlight  Map node → colour: tint every hole group in use (annotation layer 'nodes')
//   allNumbers number every column instead of 1, 5, 10… (annotation layer 'grid')
//
// Returns the plastic blocks (one, or two on a double board), each with the print that lies on it.

import { v3, X, Y, scale } from '../core/vec.js';
import { prism, rectDecal, textDecal } from '../geometry/primitives.js';
import { printRows } from './board.js';

const DOWN = scale(Y, -1); // printed text reads along +x with its bottom towards the front

export function drawBoard(board, { netLabels = {}, highlight = new Map(), allNumbers = false } = {}) {
  const { spec, pitch: P, xOf, yOf } = board;
  const { length: L, width: W, height: H } = spec.size;
  const c = spec.colors;

  // The blocks, front first (world y grows towards the back); `to` is the far edge in y.
  const joint = spec.junction ? yOf((spec.junction.from + spec.junction.to) / 2) : null;
  const spans = joint == null ? [[0, W]] : [[0, joint], [joint, W]];
  const bodies = spans.map(([y0, y1]) =>
    prism({
      profile: [[0, y0], [L, y0], [L, y1], [0, y1]],
      origin: v3(0, 0, -H),
      u: X,
      height: H,
      color: c.body,
      outline: true,
    }),
  );
  // Print goes on the block it lies on.
  const on = (y) => bodies[spans.findIndex(([, y1], i) => y <= y1 || i === spans.length - 1)].decals;
  const put = (decal, y) => on(y).push(decal);

  const onTop = (x, y) => v3(x, y, 0);
  const firstCol = 1;
  const lastCol = spec.columns;

  for (const ch of spec.channels ?? [spec.channel]) {
    const channelY = (yOf(ch.from) + yOf(ch.to)) / 2;
    put(rectDecal({ center: onTop(L / 2, channelY), u: X, v: Y, width: L - 2 * P, height: P, color: c.channel }), channelY);
  }

  const railCols = board.railColumns;
  const railStart = xOf(railCols[0]) - P;
  const railEnd = xOf(railCols.at(-1)) + P;
  for (const rail of spec.rails) {
    const y = yOf(rail.y + rail.line * 0.6);
    const color = rail.polarity === '+' ? c.plus : c.minus;
    put(rectDecal({ center: onTop((railStart + railEnd) / 2, y), u: X, v: Y, width: railEnd - railStart, height: 0.45, color }), y);
    const symbol = rail.polarity === '+' ? '+' : '−';
    for (const x of [xOf(firstCol) - 1.9, xOf(lastCol) + 1.9]) {
      put(textDecal({ text: symbol, at: onTop(x, yOf(rail.y)), right: X, down: DOWN, size: 2.2, color, weight: 700 }), yOf(rail.y));
    }
    if (netLabels[rail.id]) {
      put(
        {
          ...textDecal({ text: netLabels[rail.id], at: onTop(-1.5, yOf(rail.y)), right: X, down: DOWN, size: 2.4, color, anchor: 'end', weight: 700 }),
          role: 'net-label',
        },
        yOf(rail.y),
      );
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
    put(
      {
        ...rectDecal({ center: onTop(cx, cy), u: X, v: Y, width: Math.max(...xs) - Math.min(...xs) + 2.0, height: Math.max(...ys) - Math.min(...ys) + 2.0, color, opacity: 0.4 }),
        role: 'node',
      },
      cy,
    );
  }

  for (const hole of board.holes.values()) {
    put(rectDecal({ center: hole.pos, u: X, v: Y, width: 1.1, height: 1.1, color: c.hole }), hole.pos.y);
  }

  const { numbers, letterOffset } = printRows(spec);
  for (let col = firstCol; col <= lastCol; col++) {
    if (!allNumbers && col !== 1 && col % 5 !== 0) continue;
    for (const py of numbers) {
      put(textDecal({ text: String(col), at: onTop(xOf(col), yOf(py)), right: X, down: DOWN, size: allNumbers ? 1.15 : 1.4, color: c.print }), yOf(py));
    }
  }
  for (const row of spec.rows) {
    for (const x of [xOf(firstCol) - letterOffset, xOf(lastCol) + letterOffset]) {
      put(textDecal({ text: row.id, at: onTop(x, yOf(row.y)), right: X, down: DOWN, size: 1.5, color: c.print }), yOf(row.y));
    }
  }

  return bodies;
}
