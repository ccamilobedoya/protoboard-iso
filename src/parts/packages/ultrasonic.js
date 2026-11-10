// The HC-SR04 ultrasonic module standing in the breadboard on its four straight pins (VCC, TRIG,
// ECHO, GND), its board upright and its two capsules looking out of the front: a blue board of
// 45 × 20 mm, two aluminium cans 16 mm across and 12 mm deep with a mesh face, "T" (the transmitter)
// and "R" (the receiver) printed beside them, the crystal between them, the pin names under them.
// The back carries the chips (the module's own controller, the driver of T and the receiver's
// amplifier). Sizes from the module's datasheet drawing (45 × 20 × 15 mm).
//
// The front looks towards the front view when the pins go to increasing columns, as the PIR's and
// the touch module's (timed-sensors.js). `mark`: the printed face, the front.
//
// params: none.

import { add, scale, cross, Z } from '../../core/vec.js';
import { box, lathe, circleDecal, textDecal } from '../../geometry/primitives.js';
import { MATERIALS } from '../colors.js';
import { lead, directionBetween, withZ } from './common.js';

const P = 2.54;
const W = 45; // board, along the row of pins
const H = 20; // board, up
const T = 1.2; // board thickness
const LIFT = 3.5; // the header strip under the board
const CAN_R = 8; // the capsules: 16 mm across
const CAN_DEPTH = 12;
const CAN_AT = 13; // mm from the middle of the row to each capsule's axis
const CAN_UP = LIFT + 11.5; // the capsules' axis, mm over the board of holes
const ROWS = 4; // tiles of the board, up
const COLS = 6; // and along

export const ultrasonicModule = {
  id: 'ultrasonic-module',
  pinCount: 4,
  inline: { count: 4, pitch: 1 },

  build({ pins }) {
    const dir = directionBetween(pins[0], pins[3]);
    const out = scale(cross(Z, dir), -1); // towards the front face
    const back = scale(out, -1);
    const middle = scale(add(withZ(pins[1], 0), withZ(pins[2], 0)), 0.5);
    const at = (d, z, s = 0) => add(add(withZ(middle, z), scale(out, d)), scale(dir, s));
    // The board in ROWS × COLS tiles: sorted by its centre, one tall board would be painted over a
    // jumper arching in front of its foot; each tile sorts against what is at its own place.
    const tiles = [];
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) tiles.push(box({ center: at(0, LIFT + (r * H) / ROWS, ((c + 0.5) / COLS - 0.5) * W), u: dir, w: Z, size: [W / COLS, T, H / ROWS], color: MATERIALS.pcbBlue }));
    // The print goes on the tile it is on.
    const print = (decal, z, s) => tiles[Math.min(ROWS - 1, Math.max(0, Math.floor(((z - LIFT) / H) * ROWS))) * COLS + Math.min(COLS - 1, Math.max(0, Math.floor((s / W + 0.5) * COLS)))].decals.push(decal);
    const front = T / 2;
    const onFace = (b, side) => Object.assign(b, { on: tiles, side });

    // The capsules: a can with a mesh face, T on the left seen from the front, R on the right.
    const can = (s, letter) => {
      const c = onFace(lathe({ profile: [[0, 0], [CAN_R, 0], [CAN_R, CAN_DEPTH], [0, CAN_DEPTH]], origin: at(front, CAN_UP, s), axis: out, ref: Z, segments: 24, color: MATERIALS.aluminium }), out);
      c.decals.push(circleDecal({ center: at(front + CAN_DEPTH + 0.01, CAN_UP, s), u: dir, v: Z, radius: CAN_R - 1.3, color: MATERIALS.sonarMesh, segments: 24 }));
      print(textDecal({ text: letter, at: at(front + 0.01, LIFT + H - 1.6, s - CAN_R - 1.4), right: dir, down: scale(Z, -1), size: 1.6, color: MATERIALS.pcbPrint, weight: 700 }), LIFT + H - 1.6, s - CAN_R - 1.4);
      return c;
    };
    const transmitter = can(-CAN_AT, 'T');
    const receiver = can(CAN_AT, 'R');
    // The crystal between them, near the top edge, and the pin names over the header.
    const crystal = onFace(box({ center: at(front + 1.8, LIFT + 15.5, 0), u: dir, w: Z, size: [9, 3.6, 3.4], color: MATERIALS.crystal, outline: true }), out);
    ['VCC', 'TRIG', 'ECHO', 'GND'].forEach((name, i) => print(textDecal({ text: name, at: at(front + 0.01, LIFT + 1.6, (i - 1.5) * P), right: dir, down: scale(Z, -1), size: 0.7, color: MATERIALS.pcbPrint, weight: 700 }), LIFT + 1.6, (i - 1.5) * P));
    print(textDecal({ text: 'HC-SR04', at: at(front + 0.01, LIFT + 4.2, 0), right: dir, down: scale(Z, -1), size: 1.1, color: MATERIALS.pcbPrint, weight: 700 }), LIFT + 4.2, 0);

    // The back: three chips in a row.
    const chip = (s, w) => onFace(box({ center: at(-front - 0.8, LIFT + 9, s), u: dir, w: Z, size: [w, 1.6, 4.4], color: MATERIALS.chip, outline: true }), back);
    const chips = [chip(-12, 6), chip(0, 8), chip(12, 6)];

    // The pins and their strip, straight up into the board's bottom edge.
    const strip = box({ center: at(0, 0.4), u: dir, w: Z, size: [4 * P, 2.5, 2.0], color: MATERIALS.headerBlack, outline: true });
    const leads = pins.flatMap((p) => lead([withZ(p, 0), withZ(p, LIFT + 1)], { radius: 0.32, color: MATERIALS.tinned }));
    const paths = pins.map((p) => ({ points: [withZ(p, 0), withZ(p, LIFT), withZ(p, LIFT + 3)], body: 1 }));
    // How to tell its pins apart (src/pinout.js): the printed face, the front.
    const mark = { kind: 'face', at: at(front, LIFT + 1.6), normal: out };
    return {
      primitives: [...tiles, strip, transmitter, receiver, crystal, ...chips, ...leads],
      body: [...tiles, strip, transmitter, receiver],
      anchor: at(front + CAN_DEPTH, LIFT + H, 0),
      paths,
      mark,
    };
  },
};
