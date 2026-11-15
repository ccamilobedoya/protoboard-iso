// The KY-008 laser module: a black board, 18.5 × 15 mm (reseller drawings), standing in the
// breadboard on three straight pins through a black header strip, its plane holding the row of pins.
// On the front face the brass barrel of the laser head, 6 mm across, points forward (out of the face);
// its lens is the small dark disc at its end, and its 100 Ω resistor sits beside it. The printed pin
// names (S, the middle one blank, −) are on the front, under the barrel.
//
// The front looks towards the front view when the pins go to increasing columns, like the touch
// module's pad (timed-sensors.js).
//
// params: none.

import { add, scale, cross, Z } from '../../core/vec.js';
import { box, lathe, circleDecal, textDecal } from '../../geometry/primitives.js';
import { MATERIALS } from '../colors.js';
import { lead, directionBetween, withZ } from './common.js';

const P = 2.54;
const W = 18.5; // board, along the row of pins
const H = 15; // board, up from the header
const T = 1.2;
const LIFT = 3.5; // the board's bottom edge over the breadboard
const BARREL_R = 3; // 6 mm brass barrel
const BARREL_L = 8; // how far it stands out of the face
const BARREL_Z = LIFT + 9; // its axis, mm up

const onFace = (b, board, side) => Object.assign(b, { on: board, side });

export const laserModule = {
  id: 'laser-module',
  pinCount: 3,
  inline: { count: 3, pitch: 1 },

  build({ pins }) {
    const dir = directionBetween(pins[0], pins[2]);
    const out = scale(cross(Z, dir), -1); // towards the front face
    const row = withZ(pins[1], 0);
    const at = (d, z, s = 0) => add(add(withZ(row, z), scale(out, d)), scale(dir, s));
    const board = box({ center: at(0, LIFT), u: dir, w: Z, size: [W, T, H], color: MATERIALS.pcbBlack, outline: true });
    const front = T / 2;

    // The laser head: a brass barrel along `out`, a darker collar where it meets the board, the lens.
    const barrel = onFace(lathe({ profile: [[0, 0], [BARREL_R, 0], [BARREL_R, BARREL_L], [0, BARREL_L]], origin: at(front, BARREL_Z, 0), axis: out, ref: Z, segments: 20, color: MATERIALS.brass }), board, out);
    barrel.decals.push(circleDecal({ center: at(front + BARREL_L + 0.01, BARREL_Z, 0), u: dir, v: Z, radius: 1.3, color: MATERIALS.chip, segments: 16 }));
    // Its resistor (a small SMD part) beside the barrel.
    const resistor = onFace(box({ center: at(front + 0.35, LIFT + 4.6, 5.5), u: dir, w: Z, size: [2, 0.7, 1.2], color: MATERIALS.chip, outline: true }), board, out);
    ['S', '', '−'].forEach((name, i) => {
      if (name) board.decals.push(textDecal({ text: name, at: at(front + 0.01, LIFT + 1.6, (i - 1) * P), right: dir, down: scale(Z, -1), size: 1.1, color: MATERIALS.pcbPrint, weight: 700 }));
    });
    board.decals.push(textDecal({ text: 'KY-008', at: at(front + 0.01, LIFT + H - 1.6, 0), right: dir, down: scale(Z, -1), size: 0.9, color: MATERIALS.pcbPrint, weight: 700 }));

    const strip = box({ center: at(0, 0.4), u: dir, w: Z, size: [3 * P, 2.5, 2.0], color: MATERIALS.headerBlack, outline: true });
    const leads = pins.flatMap((p) => lead([withZ(p, 0), withZ(p, LIFT + 1)], { radius: 0.32, color: MATERIALS.tinned }));
    const paths = pins.map((p) => ({ points: [withZ(p, 0), withZ(p, LIFT), withZ(p, LIFT + 3)], body: 1 }));
    // How to tell its pins apart (src/pinout.js): the printed face, the barrel's.
    const mark = { kind: 'face', at: at(front, LIFT + 1.6), normal: out };
    return { primitives: [board, strip, barrel, resistor, ...leads], body: [board, strip, barrel], anchor: at(front, LIFT + H), paths, mark };
  },
};
