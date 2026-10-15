// Battery beside the board: an open holder of round cells (AA, AAA, 18650), a 9 V block in
// its snap clip, or a flat LiPo pouch. It lies on the table next to one edge of the board,
// and a red and a black lead run from it to the two holes (pins "+" and "-").
//
// The cells of a holder lie side by side, turned alternately, as they are wired in series:
// the first has its + end towards the board (the red lead), the next one its − end, and so
// on. Each cell shows a "+" at its positive end and its voltage.
//
// params: shape ('cell' | 'block' | 'pouch'), cells, diameter and length (one cell, mm),
//         size ([along, across, height] of a block or pouch), wrap ({ body, accent, print }),
//         text (printed on each cell or on the block, e.g. "1.5V"),
//         side ('left' | 'right' | 'back' | 'front'; default: the side edge nearest the leads),
//         offset (mm along that edge), switch ('on' | 'off': a holder with a slide switch)
//
// Unlike the other packages it needs the board (where the edges are), so build() takes it.
// Anything below the board top on the far side of the board is drawn before the board (the
// `under` layer, see src/index.js), so the board hides what it should.

import { v3, add, sub, scale, cross, dot, distance, normalize, X, Y, Z } from '../../core/vec.js';
import { box, lathe, rectDecal, textDecal, tube, midpoint } from '../../geometry/primitives.js';
import { MATERIALS, WIRE_COLORS } from '../colors.js';
import { lead, withZ } from './common.js';

const GAP = 10; // mm between the board edge and the battery
const LABEL_ROOM = 16; // on the left, where the rail labels ("+5 V", "GND") are printed
const TIP = 1.5; // bare end of a lead above its hole
const FLOOR = 1.5;
const WALL = 1.2;
const END = 1.6;
const CONTACT = 2.5; // room for the spring or plate at each end of a cell
const BETWEEN = 0.6; // gap between cells

// Size of the battery on the table: [along u (towards the board), across, height].
function dimensions(params) {
  if (params.shape === 'cell') {
    const { cells: n, diameter: D, length: Lc } = params;
    return [Lc + 2 * (END + CONTACT), n * D + (n - 1) * BETWEEN + 2 * WALL, FLOOR + D * 0.7];
  }
  const [a, b, c] = params.size;
  return params.shape === 'block' ? [a + 7, b, c] : [a, b, c];
}

// Where it lies: centre (on the table), u (towards the board) and v (across).
function placement(board, pins, params, [len, wid]) {
  const { length: L, width: W, height: H } = board.spec.size;
  const mean = midpoint(pins[0], pins[1]);
  const side = params.side ?? (mean.x < L / 2 ? 'left' : 'right');
  const alongY = side === 'left' || side === 'right';
  const edge = alongY ? W : L;
  const m = alongY ? mean.y : mean.x;
  const s = (edge >= wid ? Math.min(edge - wid / 2, Math.max(wid / 2, m)) : edge / 2) + Number(params.offset ?? 0);
  const gap = side === 'left' ? LABEL_ROOM : GAP;
  const d = gap + len / 2;
  const centre = { left: v3(-d, s, -H), right: v3(L + d, s, -H), back: v3(s, W + d, -H), front: v3(s, -d, -H) }[side] ?? v3(-d, s, -H);
  const u = { left: X, right: scale(X, -1), back: scale(Y, -1), front: Y }[side] ?? X;
  return { centre, u, v: cross(Z, u), H, gap };
}

// Text laid on a horizontal face, reading left to right in the front view. Flat marks use
// v = Z × u so their normal points up whichever way the leads made v turn.
function flatText(text, at, along, size, color) {
  const right = dot(along, v3(1, 1, 0)) >= 0 ? along : scale(along, -1);
  return textDecal({ text, at, right, down: cross(right, Z), size, color, weight: 700 });
}

function bezier(p0, p1, p2, p3, steps) {
  const out = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const a = (1 - t) ** 3;
    const b = 3 * (1 - t) ** 2 * t;
    const c = 3 * (1 - t) * t * t;
    const d = t ** 3;
    out.push(v3(a * p0.x + b * p1.x + c * p2.x + d * p3.x, a * p0.y + b * p1.y + c * p2.y + d * p3.y, a * p0.z + b * p1.z + c * p2.z + d * p3.z));
  }
  return out;
}

// A lead from the battery to a hole: out of the battery, up over the board edge (already
// above the board top when it crosses it), then an arc down into the hole.
function cable(exit, hole, u, color, gap) {
  const start = add(exit, scale(u, 1.5));
  const edge = withZ(add(exit, scale(u, gap + 1)), 3);
  const d = distance(start, edge);
  const rise = bezier(start, add(start, scale(u, d * 0.45)), sub(edge, scale(u, d * 0.35)), edge, 10);
  const top = withZ(hole, TIP);
  const span = distance(withZ(edge, 0), withZ(hole, 0));
  const h = Math.min(14, 3 + span * 0.25);
  const arc = bezier(edge, add(edge, add(scale(u, Math.min(span * 0.3, 8)), scale(Z, h))), withZ(hole, TIP + h), top, Math.max(8, Math.min(24, Math.round(span / 4))));
  const line = [exit, ...rise, ...arc.slice(1)];
  const insulation = tube({ points: line, radius: 0.6, color, segments: 8, caps: 'ends' });
  // The way current goes, from the hole back to the battery (src/sim/paths.js).
  const path = [withZ(hole, 0), ...line.slice().reverse()];
  return { primitives: [...insulation, ...lead([withZ(hole, 0), top], { radius: 0.3, color: MATERIALS.tinned })], path };
}

// The holder and its cells are cut in slices across their length (about 10 mm each): the
// painter's algorithm sorts whole pieces by their centre, and a long cell sorted as one piece
// would be painted over the walls that hide its ends and its lower half. Slice by slice, each
// piece of cell is sorted against the floor and wall pieces right next to it.
function cellHolder(c, u, v, params, [len, wid, hgt]) {
  const { cells: n, diameter: D, length: Lc, wrap, text } = params;
  const R = D / 2;
  // The end walls hold the contacts and stand as tall as the cells, as on real holders:
  // seen from above at 35° (isometric), a lower wall lets the + button peek over its edge.
  const endHeight = FLOOR + D;
  const inner = len / 2 - END;
  const slices = Math.max(3, Math.round((2 * inner) / 10));
  const cut = (k) => -inner + (2 * inner * k) / slices;
  const at = (along, across, z = 0) => add(add(add(c, scale(u, along)), scale(v, across)), scale(Z, z));
  // End walls (and the floor, below) in one piece per cell, for the same reason.
  const out = [];
  for (const k of [1, -1]) {
    for (let i = 0; i < n; i++) out.push(box({ center: at(k * (len / 2 - END / 2), wid / 2 - (i + 0.5) * (wid / n)), u, size: [END, wid / n, endHeight], color: MATERIALS.holder }));
  }
  for (let k = 0; k < slices; k++) {
    const mid = (cut(k) + cut(k + 1)) / 2;
    const size = cut(k + 1) - cut(k);
    for (let i = 0; i < n; i++) out.push(box({ center: at(mid, wid / 2 - (i + 0.5) * (wid / n)), u, size: [size, wid / n, FLOOR], color: MATERIALS.holder }));
    for (const side of [1, -1]) out.push(box({ center: at(mid, side * (wid / 2 - WALL / 2)), u, size: [size, WALL, hgt], color: MATERIALS.holder }));
  }
  const ink = wrap.print ?? MATERIALS.cellPrint;
  // One solid from the − end to the tip of the + button: the button is part of the cell's
  // length (50.5 mm for an AA), so it never reaches past the contacts.
  const NUB = 1.0;
  const body = Lc - NUB;
  const accentFrom = Lc * 0.72;
  const radiusAt = (h) => (h > body ? R * 0.32 : h < 0.5 ? R - 0.5 + h : h > body - 0.5 ? R - 0.5 + (body - h) : R);
  const colorOf = (h) => (h > body ? MATERIALS.nickel : h > accentFrom ? wrap.accent : wrap.body);
  for (let i = 0; i < n; i++) {
    const across = wid / 2 - WALL - R - i * (D + BETWEEN);
    const sign = i % 2 === 0 ? 1 : -1; // + end towards the board for the first cell
    const dir = scale(u, sign);
    const origin = at(-sign * (Lc / 2), across, FLOOR + R); // the − end
    // h along the cell (0 at −, Lc at the tip of +) ↔ position along u.
    const hOf = (along) => (along * sign + Lc / 2);
    const marks = [
      { h: body - 4, text: '+', size: Math.min(4, D * 0.3), color: wrap.accent === wrap.body ? ink : MATERIALS.holder },
      ...(text ? [{ h: Lc * 0.4, text, size: Math.min(3, D * 0.22), color: ink }] : []),
    ];
    for (let k = 0; k < slices; k++) {
      let [h0, h1] = [hOf(cut(k)), hOf(cut(k + 1))].sort((a, b) => a - b);
      h0 = Math.max(0, h0);
      h1 = Math.min(Lc, h1);
      if (h1 - h0 < 1e-6) continue;
      // Profile of this piece: the real outline between h0 and h1, closed on the axis.
      const knots = [0, 0.5, body - 0.5, body, Lc].filter((h) => h > h0 + 1e-9 && h < h1 - 1e-9);
      const profile = [[0, h0], [h0 === 0 ? R - 0.5 : radiusAt(h0), h0]];
      for (const h of knots) {
        if (Math.abs(h - body) < 1e-9) profile.push([R - 0.5, h], [R * 0.32, h]);
        else profile.push([radiusAt(h), h]);
      }
      profile.push([h1 >= Lc ? R * 0.32 : radiusAt(h1 - 1e-9), h1], [0, h1]);
      const piece = lathe({
        profile,
        origin,
        axis: dir,
        ref: Z,
        segments: 18,
        color: wrap.body,
        cuts: [accentFrom].filter((h) => h > h0 && h < h1),
        colorAt: ({ h, cap }) => (cap ? (h <= 1e-9 || h > body - 1e-9 ? MATERIALS.nickel : colorOf(h)) : colorOf(h)),
      });
      for (const m of marks) {
        if (m.h < h0 || m.h >= h1) continue;
        // Centred in its slice, so the next slice never paints over half of it.
        const h = m.text === '+' ? m.h : (h0 + h1) / 2;
        const top = add(add(origin, scale(dir, h)), scale(Z, R + 0.02));
        piece.decals.push(flatText(m.text, top, u, m.size, m.color));
      }
      out.push(piece);
    }
  }
  if (params.switch) {
    const on = params.switch !== 'off';
    const base = at(-(len / 2 - END / 2), 0, endHeight);
    const sw = box({ center: base, u, size: [END + 2, 8, 2.2], color: '#3a3a3f', outline: true });
    sw.decals.push(flatText(on ? 'ON' : 'OFF', add(add(base, scale(v, on ? -2 : 2)), scale(Z, 2.21)), v, 1.6, MATERIALS.slider));
    const slider = box({ center: add(add(base, scale(v, on ? 2 : -2)), scale(Z, 2.2)), u, size: [1.6, 2.4, 1.4], color: MATERIALS.slider, outline: true });
    out.push(sw, slider);
  }
  return { prims: out, face: at(len / 2 + 0.1, 0, FLOOR + R), half: wid / 2 - WALL - 1 };
}

function block(c, u, v, params, [len, wid, hgt]) {
  const [a] = params.size;
  const body = box({ center: add(c, scale(u, -3.5)), u, size: [a, wid, hgt], color: params.wrap.body, outline: true });
  const top = add(add(c, scale(u, -3.5)), scale(Z, hgt + 0.01));
  body.decals.push(rectDecal({ center: add(top, scale(u, -a * 0.12)), u, v: cross(Z, u), width: a * 0.5, height: wid * 0.98, color: params.wrap.accent }));
  if (params.text) body.decals.push(flatText(params.text, add(top, scale(u, a * 0.2)), u, 5, MATERIALS.cellPrint));
  body.decals.push(flatText('+', add(add(top, scale(u, a / 2 - 4)), scale(v, 6)), u, 4, MATERIALS.cellPrint));
  const clip = box({ center: add(c, scale(u, len / 2 - 3.5)), u, size: [7, wid - 4, Math.min(hgt, 12)], color: MATERIALS.holder, outline: true });
  return { prims: [body, clip], face: add(c, add(scale(u, len / 2 + 0.1), scale(Z, 6))), half: 3 };
}

function pouch(c, u, v, params, [len, wid, hgt]) {
  const body = box({ center: c, u, size: [len, wid, hgt], color: params.wrap.body, outline: true });
  const top = add(c, scale(Z, hgt + 0.01));
  body.decals.push(rectDecal({ center: add(top, scale(u, len / 2 - 4)), u, v: cross(Z, u), width: 8, height: wid, color: params.wrap.accent }));
  if (params.text) body.decals.push(flatText(params.text, add(top, scale(u, -4)), u, 3.4, params.wrap.print ?? MATERIALS.holder));
  return { prims: [body], face: add(c, add(scale(u, len / 2 + 0.1), scale(Z, hgt / 2))), half: 1.5 };
}

export default {
  id: 'battery',
  pinCount: 2,
  span: () => ({ min: 2.4, max: 400 }),

  build({ pins: [plus, minus], params, board }) {
    const dims = dimensions(params);
    const { centre, u, v: across, gap } = placement(board, [plus, minus], params, dims);
    // The red lead comes out on the side of the + hole, so the two leads never cross.
    const v = dot(sub(plus, minus), across) >= 0 ? across : scale(across, -1);
    const shape = { cell: cellHolder, block, pouch }[params.shape] ?? cellHolder;
    const { prims, face, half } = shape(centre, normalize(u), v, params, dims);
    // Each lead leaves the battery as close to its hole as the face allows, 3 mm apart at least.
    const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
    const along = (p) => clamp(dot(sub(p, face), v), -half, half);
    let [a, b] = [along(plus), along(minus)];
    if (a - b < 3) {
      const mid = clamp((a + b) / 2, -half + 1.5, half - 1.5);
      [a, b] = [mid + 1.5, mid - 1.5];
    }
    const exit = (k) => add(face, scale(v, k));
    const red = cable(exit(a), plus, u, WIRE_COLORS.red, gap);
    const black = cable(exit(b), minus, u, WIRE_COLORS.black, gap);
    // Inside, current goes through the cells: both leads meet in the middle of the battery.
    const inside = withZ(centre, centre.z + dims[2] / 2);
    const paths = [red.path, black.path].map((path) => ({ points: [...path, inside], body: path.length - 1 }));
    return { primitives: [...prims, ...red.primitives, ...black.primitives], body: prims, anchor: withZ(centre, centre.z + dims[2]), paths };
  },
};
