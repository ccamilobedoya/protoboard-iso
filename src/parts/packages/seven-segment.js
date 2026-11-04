// Single-digit 7-segment display, 0.56" (14.22 mm digit; 5161AS / 5161BS, the same case as
// Kingbright's SC56-11): a black case 12.6 mm wide, 19.0 mm along its pins and 8.0 mm tall, its
// ten pins in two rows of five at 2.54 mm, the rows 15.24 mm (0.6") apart. It straddles the
// channel like a wide DIP: pin 1 in rows b–e, the other row six holes behind (f–i), so the
// digit reads upright from the side of pin 1, pins 1–5 along its bottom edge from the left and
// 6–10 back along the top.
//
// The face: the eight segments in their milky diffuser, a figure 8 leaning 10° with the decimal
// point at its bottom right, as the datasheet draws it (segment width and gaps from that drawing's
// proportions). Each segment is also given as a face (`segments`) for the light of the simulation.
//
// params: count (10), rowSpacing (6 holes), marking

import { add, sub, scale, normalize, length, dot, Z } from '../../core/vec.js';
import { box, polygonDecal, textDecal } from '../../geometry/primitives.js';
import { MATERIALS } from '../colors.js';
import { lead, withZ } from './common.js';
import { devboardHoles } from './devboard.js';

const P = 2.54;
const SIZE = [12.6, 19.0, 8.0]; // along the rows, across them, height (mm)
const STANDOFF = 0.4;
// The digit on the face, mm from the face's middle: height, width, stroke, gap between segments,
// lean; its middle a little left of the face's, leaving the decimal point room on the right.
const DIGIT = { h: 14.22, w: 7.4, t: 1.5, gap: 0.3, lean: Math.tan((10 * Math.PI) / 180), dx: -0.8 };

// A segment as a hexagon from (x1, y1) to (x2, y2) (horizontal or vertical), `t` thick.
function bar(x1, y1, x2, y2) {
  const { t, gap } = DIGIT;
  const h = t / 2;
  if (y1 === y2) {
    const [a, b] = [x1 + gap, x2 - gap];
    return [[a, y1], [a + h, y1 - h], [b - h, y1 - h], [b, y1], [b - h, y1 + h], [a + h, y1 + h]];
  }
  const [a, b] = [y1 + gap, y2 - gap];
  return [[x1, a], [x1 + h, a + h], [x1 + h, b - h], [x1, b], [x1 - h, b - h], [x1 - h, a + h]];
}

// Each segment's outline in face units (x right, y up), leaned and moved to the digit's place.
export function segmentOutlines() {
  const { h, w, lean, dx } = DIGIT;
  const [l, r, top, mid, bottom] = [-w / 2, w / 2, h / 2, 0, -h / 2];
  const shapes = {
    a: bar(l, top, r, top),
    b: bar(r, mid, r, top),
    c: bar(r, bottom, r, mid),
    d: bar(l, bottom, r, bottom),
    e: bar(l, bottom, l, mid),
    f: bar(l, mid, l, top),
    g: bar(l, mid, r, mid),
  };
  // The decimal point: a small square right of the bottom corner.
  const [px, py, s] = [r + 1.5, bottom, 0.75];
  shapes.DP = [[px - s, py - s], [px + s, py - s], [px + s, py + s], [px - s, py + s]];
  return Object.fromEntries(Object.entries(shapes).map(([k, pts]) => [k, pts.map(([x, y]) => [x + y * lean + dx, y])]));
}

const spacing = (params) => params.rowSpacing ?? 6;

export default {
  id: '7seg-056',
  pinCount: 10,

  expandPin1(board, pin1, params) {
    return devboardHoles(board, pin1, { count: 10, rowSpacing: spacing(params) });
  },

  pin1Help(board, params) {
    const rows = board.spec.rows.filter((r) => [...Array(board.spec.columns).keys()].some((c) => this.expandPin1(board, `${r.id}${c + 1}`, params)));
    return { code: 'BAD_PIN1_MODULE', params: { spacing: spacing(params), rows: rows.map((r) => r.id).sort().join(', ') } };
  },

  footprints(board, params) {
    const out = [];
    for (let c = 1; c <= board.spec.columns; c++) {
      for (const row of board.spec.rows) {
        const holes = this.expandPin1(board, `${row.id}${c}`, params);
        if (holes) out.push(holes);
      }
    }
    return out;
  },

  // Two rows of five, 2.54 mm along and 15.24 mm across, counted as a DIP counts them.
  validate(pos, part) {
    const across = sub(pos[9], pos[0]);
    const along = sub(pos[1], pos[0]);
    let ok = Math.abs(length(along) - P) < 0.05 && Math.abs(length(across) - spacing(part.def.params) * P) < 0.05 && Math.abs(dot(normalize(along), normalize(across))) < 0.01;
    for (let i = 0; ok && i < 5; i++) ok = length(sub(pos[i], add(pos[0], scale(along, i)))) < 0.05 && length(sub(pos[9 - i], add(pos[i], across))) < 0.05;
    return ok ? [] : [{ severity: 'warning', code: 'MODULE_SHAPE', params: { part: part.id, spacing: spacing(part.def.params) } }];
  },

  build({ pins, params }) {
    const u = normalize(withZ(sub(pins[4], pins[0]), 0)); // along the bottom edge, left to right
    const v = normalize(withZ(sub(pins[9], pins[0]), 0)); // up the digit, towards the other row
    const middle = withZ(scale(pins.reduce((s, p) => add(s, p), { x: 0, y: 0, z: 0 }), 1 / pins.length), STANDOFF);
    const [L, W, H] = SIZE;
    const body = box({ center: middle, u, size: [L, W, H], color: MATERIALS.displayBody, colors: { top: MATERIALS.displayFace }, outline: true });
    const top = withZ(middle, STANDOFF + H);
    // Points on the face a hair above it, so a lit segment's light sorts over its decal.
    const onFace = (x, y, lift = 0) => add(add(withZ(top, top.z + lift), scale(u, x)), scale(v, y));
    const segments = Object.entries(segmentOutlines()).map(([pin, pts]) => ({ pin, face: pts.map(([x, y]) => onFace(x, y, 0.01)) }));
    for (const s of segments) body.decals.push(polygonDecal({ pts: s.face, normal: Z, color: MATERIALS.segmentOff }));
    if (params.marking) body.decals.push(textDecal({ text: params.marking, at: onFace(0, -W / 2 + 1.2), right: u, down: scale(v, -1), size: 1.0, color: MATERIALS.chipMark, weight: 700, upright: true }));
    const leads = pins.flatMap((p) => lead([withZ(p, 0), withZ(p, STANDOFF + 0.2)], { radius: 0.25, color: MATERIALS.tinned }));
    // Current: up each pin and under the case to its middle (src/sim/paths.js).
    const inside = withZ(middle, STANDOFF + 1);
    const paths = pins.map((p) => ({ points: [withZ(p, 0), withZ(p, STANDOFF + 0.2), inside], body: 1 }));
    // How to tell its pins apart (src/pinout.js): the decimal point's edge, the bottom one, has pins 1–5.
    const mark = { kind: 'dp', at: onFace(0, -W / 2) };
    return { primitives: [body, ...leads], body: [body], anchor: onFace(0, W / 2 - 0.5), paths, segments, mark };
  },
};
