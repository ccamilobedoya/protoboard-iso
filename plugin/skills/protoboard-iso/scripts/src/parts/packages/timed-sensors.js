// Two modules that stand in the breadboard on three straight pins, their boards upright: the
// HC-SR501 PIR motion module and the TTP223 capacitive touch module. The pins run up from the holes
// through a black header strip and into the board's bottom edge; the board's plane holds the row of
// pins, so its two faces look out and back.
//
// PIR (about 32 × 24 mm, reseller sheets): a green board with the white Fresnel dome, 23 mm across,
// on the front, with the sensitivity and delay trimmers and the H/L jumper beside it; the BISS0001
// chip and the printed pin names (VCC OUT GND) on the back. `mark`: the printed face is the back.
//
// Touch (about 15 × 15 mm, reseller photos): a blue board whose front is the sensing pad, a ring with
// a finger on it, the printed names (I/O VCC GND) and the chip's name under the header; the small
// chip and the indicator LED on the back. `mark`: the printed face is the pad's.
//
// The front looks towards the front view when the pins go to increasing columns, like the AMS1117
// module's printed face. Seen from the other side, the parts on the other face show.
//
// params: pir: none. touch: none.

import { add, scale, cross, Z } from '../../core/vec.js';
import { box, lathe, rectDecal, circleDecal, textDecal } from '../../geometry/primitives.js';
import { MATERIALS } from '../colors.js';
import { lead, directionBetween, withZ } from './common.js';

const P = 2.54;

// Shared frame: `at(d, z, s)` is d mm out from the row, z mm up, s mm along it from the middle pin.
function frame(pins) {
  const dir = directionBetween(pins[0], pins[2]);
  const out = scale(cross(Z, dir), -1); // towards the front face
  const row = withZ(pins[1], 0);
  const at = (d, z, s = 0) => add(add(withZ(row, z), scale(out, d)), scale(dir, s));
  return { dir, out, at };
}

// The pins and their strip of plastic: straight up to the board's bottom edge, a millimetre into it.
function header({ pins, at, dir, board, lift }) {
  const strip = box({ center: at(0, 0.4), u: dir, w: Z, size: [3 * P, 2.5, 2.0], color: MATERIALS.headerBlack, outline: true });
  const leads = pins.flatMap((p) => lead([withZ(p, 0), withZ(p, lift + 1)], { radius: 0.32, color: MATERIALS.tinned }));
  const paths = pins.map((p) => ({ points: [withZ(p, 0), withZ(p, lift), withZ(p, lift + 3)], body: 1 }));
  return { strip, leads, paths, board };
}

// A part lying on one face of the board: seen only from that side, and there painted after the board
// (a large board sorted by its centre would cover it).
const onFace = (b, board, side) => Object.assign(b, { on: board, side });

const PIR_W = 32;
const PIR_H = 24;
const PIR_T = 1.2;
const PIR_LIFT = 3.5;
const DOME_R = 11.5;
const DOME_AT = -3; // the dome's centre, mm from the middle pin along the row

export const pirModule = {
  id: 'pir-module',
  pinCount: 3,
  inline: { count: 3, pitch: 1 },

  build({ pins }) {
    const { dir, out, at } = frame(pins);
    const back = scale(out, -1);
    const board = box({ center: at(0, PIR_LIFT), u: dir, w: Z, size: [PIR_W, PIR_T, PIR_H], color: MATERIALS.pcbGreen, outline: true });
    const mid = PIR_LIFT + PIR_H / 2;

    // The Fresnel dome: a short wall, then a flattened hemisphere, white and faceted.
    const profile = [[0, 0], [DOME_R, 0], [DOME_R, 2.5]];
    for (let i = 1; i <= 6; i++) {
      const a = (i / 6) * (Math.PI / 2);
      profile.push([DOME_R * Math.cos(a), 2.5 + 8.5 * Math.sin(a)]);
    }
    const dome = onFace(lathe({ profile, origin: at(PIR_T / 2, mid, DOME_AT), axis: out, ref: Z, segments: 24, color: MATERIALS.domeWhite, colorAt: ({ h }) => (Math.floor(h / 1.4) % 2 ? MATERIALS.domeFacet : MATERIALS.domeWhite), cuts: [1.4, 2.8, 4.2, 5.6, 7, 8.4, 9.8] }), board, out);

    // The two trimmers (delay Tx, sensitivity) and the H/L jumper, beside the dome.
    const trimmer = (z) => {
      const b = onFace(box({ center: at(PIR_T / 2 + 2.2, z, 12.2), u: dir, w: Z, size: [6.5, 4.4, 6], color: MATERIALS.trimmer, outline: true }), board, out);
      b.decals.push(rectDecal({ center: at(PIR_T / 2 + 4.41, z + 3, 12.2), u: dir, v: Z, width: 3.4, height: 0.7, color: MATERIALS.screwSlot }));
      return b;
    };
    const timeTrimmer = trimmer(PIR_LIFT + 4);
    const sensTrimmer = trimmer(PIR_LIFT + 11);
    const jumperBase = onFace(box({ center: at(PIR_T / 2 + 1.25, PIR_LIFT + 18.2, 12.2), u: dir, w: Z, size: [7.6, 2.5, 2.5], color: MATERIALS.headerBlack, outline: true }), board, out);
    const jumperCap = onFace(box({ center: at(PIR_T / 2 + 2.5, PIR_LIFT + 18.2, 13.5), u: dir, w: Z, size: [5, 2.4, 2.8], color: MATERIALS.jumperCap, outline: true }), board, out);

    // The back: the BISS0001 chip and the printed pin names.
    const chip = onFace(box({ center: at(-PIR_T / 2 - 0.8, mid + 2, -3), u: dir, w: Z, size: [10, 1.6, 4.4], color: MATERIALS.chip, outline: true }), board, back);
    chip.decals.push(textDecal({ text: 'BISS0001', at: at(-PIR_T / 2 - 1.61, mid + 4.2, -3), right: scale(dir, -1), down: scale(Z, -1), size: 0.9, color: MATERIALS.print, weight: 700 }));
    ['VCC', 'OUT', 'GND'].forEach((name, i) => board.decals.push(textDecal({ text: name, at: at(-PIR_T / 2 - 0.01, PIR_LIFT + 2.2, (i - 1) * P), right: scale(dir, -1), down: scale(Z, -1), size: 1.0, color: MATERIALS.pcbPrint, weight: 700 })));
    board.decals.push(textDecal({ text: 'H  L', at: at(PIR_T / 2 + 0.01, PIR_LIFT + 21.5, 12.2), right: dir, down: scale(Z, -1), size: 0.9, color: MATERIALS.pcbPrint, weight: 700 }));

    const { strip, leads, paths } = header({ pins, at, dir, board, lift: PIR_LIFT });
    // How to tell its pins apart (src/pinout.js): the printed face, the back.
    const mark = { kind: 'face', at: at(-PIR_T / 2, PIR_LIFT + 2.2), normal: back };
    return { primitives: [board, strip, dome, timeTrimmer, sensTrimmer, jumperBase, jumperCap, chip, ...leads], body: [board, strip, dome], anchor: at(PIR_T / 2 + 11.5, mid, DOME_AT), paths, mark };
  },
};

const TOUCH_W = 15;
const TOUCH_H = 15;
const TOUCH_T = 1.2;
const TOUCH_LIFT = 3.5;

export const touchModule = {
  id: 'touch-module',
  pinCount: 3,
  inline: { count: 3, pitch: 1 },

  build({ pins }) {
    const { dir, out, at } = frame(pins);
    const back = scale(out, -1);
    const board = box({ center: at(0, TOUCH_LIFT), u: dir, w: Z, size: [TOUCH_W, TOUCH_T, TOUCH_H], color: MATERIALS.pcbBlue, outline: true });
    const front = TOUCH_T / 2 + 0.01;
    const centre = TOUCH_LIFT + 8.6;

    // The sensing pad: a ring of copper under the mask, and a finger drawn on it.
    const pad = (d, radius, color) => board.decals.push(circleDecal({ center: at(d, centre, 0), u: dir, v: Z, radius, color, segments: 28 }));
    pad(front, 5.4, MATERIALS.padRing);
    pad(front + 0.002, 4.5, MATERIALS.pcbBlue);
    pad(front + 0.004, 1.5, MATERIALS.padRing);
    board.decals.push(rectDecal({ center: at(front + 0.004, centre - 2.5, 0), u: dir, v: Z, width: 2.2, height: 3.4, color: MATERIALS.padRing }));
    ['I/O', 'VCC', 'GND'].forEach((name, i) => board.decals.push(textDecal({ text: name, at: at(front, TOUCH_LIFT + 1.4, (i - 1) * P), right: dir, down: scale(Z, -1), size: 0.85, color: MATERIALS.pcbPrint, weight: 700 })));

    // The back: the chip and the indicator LED.
    const chip = onFace(box({ center: at(-TOUCH_T / 2 - 0.4, centre, 2.5), u: dir, w: Z, size: [3, 0.8, 1.6], color: MATERIALS.chip, outline: true }), board, back);
    const led = onFace(box({ center: at(-TOUCH_T / 2 - 0.3, centre + 2.4, -3.5), u: dir, w: Z, size: [1.6, 0.6, 0.8], color: MATERIALS.smdLed, outline: true }), board, back);

    const { strip, leads, paths } = header({ pins, at, dir, board, lift: TOUCH_LIFT });
    // The printed face is the pad's, the front.
    const mark = { kind: 'face', at: at(TOUCH_T / 2, centre), normal: out };
    return { primitives: [board, strip, chip, led, ...leads], body: [board, strip], anchor: at(TOUCH_T / 2, TOUCH_LIFT + TOUCH_H), paths, mark };
  },
};
