// 6 × 6 mm tactile push button with four legs, sitting across the centre channel.
// Pin order: 1, 2, 3, 4. Pins 1–2 are always connected inside, and so are 3–4 (each pair
// spans the channel); pressing the button joins 1–2 with 3–4.
//
// params: color (cap colour), height (cap top above the board, mm; default 5)

import { add, sub, scale, normalize, length, dot, Z } from '../../core/vec.js';
import { box, lathe } from '../../geometry/primitives.js';
import { MATERIALS } from '../colors.js';
import { lead, withZ } from './common.js';
import { channelRows } from '../../board/board.js';

const BODY = 6;
const BASE = 3.5;

export default {
  id: 'tactile-6x6',
  pinCount: 4,

  // The four legs must form a rectangle: 1→2 is the long side (6.5 mm, 2 or 3 holes),
  // 1→3 the short side (4.5 mm, 1 or 2 holes), and 4 = 2 + (3 − 1).
  validate(pos, part) {
    const [p1, p2, p3, p4] = pos;
    const long = sub(p2, p1);
    const short = sub(p3, p1);
    const ok =
      length(long) > 4.9 && length(long) < 7.8 && length(short) > 2.4 && length(short) < 5.2 &&
      Math.abs(dot(normalize(long), normalize(short))) < 0.01 && length(sub(p4, add(p2, short))) < 0.05;
    return ok ? [] : [{ severity: 'warning', code: 'BUTTON_SHAPE', params: { part: part.id } }];
  },

  // Every free spot across the centre channel: legs in the two rows next to it, two
  // columns apart, in both orientations.
  footprints(board) {
    const { back: top, front: bottom } = channelRows(board.spec);
    const out = [];
    for (let c = 1; c + 2 <= board.spec.columns; c++) {
      out.push([`${top}${c}`, `${bottom}${c}`, `${top}${c + 2}`, `${bottom}${c + 2}`]);
      out.push([`${top}${c + 2}`, `${bottom}${c + 2}`, `${top}${c}`, `${bottom}${c}`]);
    }
    return out;
  },

  build({ pins, params }) {
    const { color = MATERIALS.switchBase, height = 5 } = params;
    const centre = withZ(scale(pins.reduce((s, p) => add(s, p), { x: 0, y: 0, z: 0 }), 1 / 4), 0.3);
    const u = normalize(withZ(sub(pins[2], pins[0]), 0));
    const base = box({ center: centre, u, size: [BODY, BODY, BASE], color: MATERIALS.switchBase, outline: true });
    const plate = box({ center: withZ(centre, 0.3 + BASE), u, size: [BODY, BODY, 0.35], color: MATERIALS.switchPlate, outline: true });
    const capBottom = 0.3 + BASE + 0.35;
    const cap = lathe({ profile: [[0, 0], [1.75, 0], [1.75, height - capBottom - 0.2], [1.5, height - capBottom], [0, height - capBottom]], origin: withZ(centre, capBottom), axis: Z, segments: 20, color });

    // Legs come out of the sides facing the channel and bend down into the holes.
    const across = normalize(withZ(sub(pins[1], pins[0]), 0));
    const legs = pins.map((p) => {
      const rel = sub(withZ(p, 0), withZ(centre, 0));
      const side = Math.sign(dot(rel, across)) * (BODY / 2);
      const edge = add(withZ(p, 1.2), scale(across, side - dot(rel, across)));
      return [withZ(p, 0), withZ(p, 1.2), edge];
    });
    const leads = legs.flatMap((leg) => lead(leg, { radius: 0.3, color: MATERIALS.tinned }));
    // Current goes up each leg and meets inside the base, where the contacts are (src/sim/paths.js).
    const inside = withZ(centre, 0.3 + BASE / 2);
    const paths = legs.map((leg) => ({ points: [...leg, inside], body: leg.length - 1 }));
    return { primitives: [base, plate, cap, ...leads], body: [base, plate, cap], anchor: withZ(centre, height), paths };
  },
};

