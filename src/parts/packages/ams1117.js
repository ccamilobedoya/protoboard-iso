// AMS1117 regulator module: a small blue board (8.6 × 12.33 mm) standing up on three
// right-angle pins, VIN · OUT · GND in a row.
//
// Each pin goes up from its hole, bends 90° and runs through a black plastic spacer into the
// board, so the board stands a few millimetres to one side of the row. The printed side
// (VIN OUT GND, read left to right) faces that way: with the holes in increasing columns it
// faces the front view. The parts are on the other side, towards the spacer: the SOT-223 chip
// with its big tab (the output), four ceramic capacitors, the power LED and its resistor.
//
// params: marking (text printed at the top of the printed side, default "3.3V")

import { add, scale, cross, Z } from '../../core/vec.js';
import { box, rectDecal, textDecal } from '../../geometry/primitives.js';
import { MATERIALS } from '../colors.js';
import { lead, directionBetween, withZ } from './common.js';

const P = 2.54;
const WIDTH = 8.6; // along the row
const HEIGHT = 12.33;
const T = 1.0; // board thickness
const BEND = 3.8; // height of the horizontal part of each pin, mm above the board
const BOTTOM = BEND - 2.6; // the board's lower edge
const SPACER = [1.2, 3.7]; // the plastic spacer, from…to the row, mm
const FACE = 3.8; // the board's parts side, mm from the row

export default {
  id: 'ams1117-module',
  pinCount: 3,
  inline: { count: 3, pitch: 1 },

  build({ pins, params }) {
    const { marking = '3.3V' } = params;
    const dir = directionBetween(pins[0], pins[2]);
    const out = scale(cross(Z, dir), -1); // towards the printed side
    const row = withZ(pins[1], 0);
    const at = (d, z, s = 0) => add(add(withZ(row, z), scale(out, d)), scale(dir, s));

    // The board, standing: its parts side towards the row, the printed side away from it.
    const pcbBox = box({ center: at(FACE + T / 2, BOTTOM), u: dir, w: Z, size: [WIDTH, T, HEIGHT], color: MATERIALS.pcbBlue, outline: true });
    const printed = (text, s, z, size) => pcbBox.decals.push(textDecal({ text, at: at(FACE + T + 0.01, z, s), right: dir, down: scale(Z, -1), size, color: MATERIALS.pcbPrint, weight: 700 }));
    ['VIN', 'OUT', 'GND'].forEach((name, i) => printed(name, (i - 1) * P, BEND + 2.3, 0.95));
    printed(marking, 0, BOTTOM + HEIGHT - 2.2, 1.6);
    // A pad round each pin on the printed side, where it is soldered.
    for (let i = -1; i <= 1; i++) pcbBox.decals.push(rectDecal({ center: at(FACE + T + 0.01, BEND, i * P), u: dir, v: Z, width: 1.5, height: 1.5, color: MATERIALS.tinned }));

    // The spacer on the horizontal part of the pins.
    // Like the parts, it is on the board's parts side: hidden by the board from the printed side,
    // painted after it from the other (a large board sorted by its centre would cover it).
    const partsSide = scale(out, -1);
    const spacer = Object.assign(box({ center: at((SPACER[0] + SPACER[1]) / 2, BEND - 1.25), u: dir, w: Z, size: [3 * P, SPACER[1] - SPACER[0], 2.5], color: MATERIALS.headerBlack, outline: true }), { on: pcbBox, side: partsSide });

    // Parts on the side towards the row (seen from the back view), each lying on the board.
    const onFace = (s, z, [w, h], depth, color) => {
      // Seen only from that side (`side`), and there painted after the board (`on`).
      const b = box({ center: at(FACE - depth / 2, z - h / 2, s), u: dir, w: Z, size: [w, depth, h], color, outline: true });
      return Object.assign(b, { on: pcbBox, side: partsSide });
    };
    const chip = onFace(0, BOTTOM + 10.6, [6.5, 3.5], 1.6, MATERIALS.chip); // SOT-223
    const tab = onFace(0, BOTTOM + 12.0, [3.0, 1.2], 0.6, MATERIALS.tinned); // its big tab: OUT
    chip.decals.push(textDecal({ text: 'AMS1117', at: at(FACE - 1.61, BOTTOM + 8.85), right: scale(dir, -1), down: scale(Z, -1), size: 0.7, color: MATERIALS.print, weight: 700 }));
    const caps = [-2.9, -1.0, 1.0, 2.9].map((s) => onFace(s, BOTTOM + 6.6, [1.0, 2.0], 0.8, MATERIALS.smdCap));
    const led = onFace(-2.6, BOTTOM + 4.4, [1.6, 0.8], 0.6, MATERIALS.smdLed);
    const res = onFace(2.6, BOTTOM + 4.4, [1.6, 0.8], 0.45, MATERIALS.chip);

    // Pins: up from the hole and bent towards the board; inside the spacer and the board they
    // are hidden, and the soldered tip shows on the printed side.
    const leads = pins.flatMap((p) => {
      const top = withZ(p, BEND);
      const along = (d) => add(top, scale(out, d));
      // The bend into the spacer is painted after it (seen only from that side); the soldered tip
      // after the board, on the printed side.
      const leg = lead([withZ(p, 0), top], { radius: 0.32, color: MATERIALS.tinned });
      const bend = lead([top, along(SPACER[0] + 0.1)], { radius: 0.32, color: MATERIALS.tinned }).map((t) => Object.assign(t, { on: spacer, side: partsSide }));
      const tip = lead([along(FACE + T), along(FACE + T + 0.6)], { radius: 0.32, color: MATERIALS.tinned }).map((t) => Object.assign(t, { on: pcbBox, side: out }));
      return [...leg, ...bend, ...tip];
    });
    // Current goes up each pin and along it into the board (src/sim/paths.js).
    const inside = at(FACE + T / 2, BOTTOM + 7);
    const paths = pins.map((p) => ({ points: [withZ(p, 0), withZ(p, BEND), add(withZ(p, BEND), scale(out, FACE)), inside], body: 2 }));

    const parts = [chip, tab, ...caps, led, res];
    return { primitives: [pcbBox, spacer, ...parts, ...leads], body: [pcbBox, spacer, chip], anchor: at(FACE + T / 2, BOTTOM + HEIGHT), paths };
  },
};
