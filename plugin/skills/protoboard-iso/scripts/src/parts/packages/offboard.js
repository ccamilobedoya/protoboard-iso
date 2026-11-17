// What boards lying beside the breadboard share (uno.js, despi.js): text printed flat on their
// PCB, and the Dupont lead from one of their pins to a hole.

import { v3, add, scale, distance, X, Y, Z } from '../../core/vec.js';
import { box, textDecal, tube } from '../../geometry/primitives.js';
import { MATERIALS } from '../colors.js';
import { withZ } from './common.js';

export const HOUSING = 9; // Dupont housing length, mm

// Text lying on the PCB, reading left to right in the front view (turned round if needed, the
// anchor swapped so it still starts where it should).
export function flat(text, at, right, size, color, anchor = 'middle') {
  const flip = right.x + right.y < 0;
  const r = flip ? scale(right, -1) : right;
  const side = flip ? { start: 'end', end: 'start', middle: 'middle' }[anchor] : anchor;
  return textDecal({ text, at, right: r, down: v3(r.y, -r.x, 0), size, color, weight: 700, anchor: side });
}

// A Dupont lead: a housing on the pin at `from` pointing along `dir` (up for a female header, out
// of the board for a right-angle male pin), an arc, and a housing pushed into `hole`. `on`: what
// the first housing rests on (painted after it).
export function dupontLead({ from, dir = Z, hole, color, on }) {
  const out = [];
  const a = add(from, scale(dir, HOUSING));
  const b = withZ(hole, HOUSING);
  const housing = box({ center: from, u: Math.abs(dir.x) > 0.9 ? Y : X, w: dir, size: [2.4, 2.4, HOUSING], color: MATERIALS.headerBlack, outline: true });
  if (on) housing.on = on;
  out.push(housing);
  // Pushed all the way in: the housing rests on the board, centred on its hole (lifted, the
  // isometric view would show it shifted back from the hole).
  out.push(box({ center: withZ(hole, 0), u: X, size: [2.4, 2.4, HOUSING], color: MATERIALS.headerBlack, outline: true }));
  out.push(...tube({ points: leadArc(a, dir, b), radius: 0.65, color, segments: 8, caps: 'ends' }));
  return out;
}

// The wire of a lead: a cubic arc leaving `a` along `dir` and coming down into `b` from above.
export function leadArc(a, dir, b) {
  const h = 6 + distance(a, b) * 0.22;
  const p1 = add(a, scale(dir, h));
  const p2 = add(b, scale(Z, h));
  const pts = [];
  for (let k = 0; k <= 20; k++) {
    const t = k / 20;
    const c0 = (1 - t) ** 3;
    const c1 = 3 * (1 - t) ** 2 * t;
    const c2 = 3 * (1 - t) * t * t;
    const c3 = t ** 3;
    pts.push(v3(c0 * a.x + c1 * p1.x + c2 * p2.x + c3 * b.x, c0 * a.y + c1 * p1.y + c2 * p2.y + c3 * b.y, c0 * a.z + c1 * p1.z + c2 * p2.z + c3 * b.z));
  }
  return pts;
}

// A lead from a part on the table to a hole, its far end a Dupont male pin pushed into the hole:
// the wire leaves `from` along `dir` (what holds it there, a clip or a sleeve, is the caller's).
// Returns the primitives and the wire's points (for current paths).
export function wireToHole({ from, dir, hole, color }) {
  const b = withZ(hole, HOUSING);
  const points = leadArc(from, dir, b);
  const primitives = [box({ center: withZ(hole, 0), u: X, size: [2.4, 2.4, HOUSING], color: MATERIALS.headerBlack, outline: true }), ...tube({ points, radius: 0.65, color, segments: 8, caps: 'ends' })];
  return { primitives, points: [...points, withZ(hole, 0)] };
}
