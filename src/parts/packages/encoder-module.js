// KY-040 rotary encoder module: a dark green board, 19 × 26 mm, standing upright on its five pins in
// one row of the breadboard (CLK, DT, SW, +, GND), the pins in a black header strip along its lower
// edge. The EC11 encoder sits on the printed face, its steel body 12 × 12 mm and about 6.5 mm deep,
// with a 7 mm bushing and a 6 mm shaft that goes 20 mm out of the body, towards the front; three
// small chip resistors (the 10 kΩ pull-ups) and the printed pin names are between it and the header.
// Sizes are the module's, rounded.
//
// params: print (the pin names as printed, in pin order), part (printed on top)
// mark (src/pinout.js): the printed face, `face`, which way it faces.

import { add, scale, cross, Z } from '../../core/vec.js';
import { box, cylinder, rectDecal, textDecal } from '../../geometry/primitives.js';
import { MATERIALS } from '../colors.js';
import { lead, directionBetween, withZ } from './common.js';

const P = 2.54;
const T = 1.6; // board thickness
const STRIP = { from: 0.6, height: 2.5, depth: 2.5 };
const BOTTOM = STRIP.from + STRIP.height;
const WIDTH = 19;
const HEIGHT = 26;
const BODY = { size: 12, depth: 6.5 };
const BUSHING = { radius: 3.5, length: 6 };
const SHAFT = { radius: 3, length: 20 };

export default {
  id: 'encoder-module',
  pinCount: 5,
  inline: { pitch: 1 },

  // Five neighbouring holes along a row, either way round.
  footprints(board) {
    const out = [];
    for (const row of board.spec.rows) {
      for (let c = 1; c <= board.spec.columns; c++) {
        for (const sign of [1, -1]) {
          const cols = Array.from({ length: 5 }, (_, k) => c + sign * k);
          if (cols.every((k) => k >= 1 && k <= board.spec.columns)) out.push(cols.map((k) => `${row.id}${k}`));
        }
      }
    }
    return out;
  },

  build({ pins, params }) {
    const n = pins.length;
    const print = params.print ?? pins.map((_, i) => String(i + 1));
    const dir = directionBetween(pins[0], pins[n - 1]);
    const out = scale(cross(Z, dir), -1); // the printed face
    const row = withZ(pins[Math.floor(n / 2)], 0);
    const at = (d, z, s = 0) => add(add(withZ(row, z), scale(out, d)), scale(dir, s));
    const front = T / 2;

    const strip = box({ center: at(0, STRIP.from), u: dir, w: Z, size: [n * P, STRIP.depth, STRIP.height], color: MATERIALS.headerBlack, outline: true });
    const pcb = box({ center: at(0, BOTTOM), u: dir, w: Z, size: [WIDTH, T, HEIGHT], color: MATERIALS.encoderBoard, outline: true });
    pcb.on = strip;
    const face = (z, s = 0) => at(front + 0.01, z, s);
    const first = -((n - 1) * P) / 2;
    print.forEach((name, i) => {
      pcb.decals.push(rectDecal({ center: face(BOTTOM + 1.3, first + i * P), u: dir, v: Z, width: 1.6, height: 1.6, color: MATERIALS.tinned }));
      pcb.decals.push(textDecal({ text: name, at: face(BOTTOM + 3.6, first + i * P), right: dir, down: scale(Z, -1), size: 1.0, color: MATERIALS.pcbPrint, weight: 700 }));
    });
    pcb.decals.push(textDecal({ text: params.part ?? '', at: face(BOTTOM + HEIGHT - 1.6), right: dir, down: scale(Z, -1), size: 1.2, color: MATERIALS.pcbPrint, weight: 700 }));

    // Parts on the printed face: seen only from that side, and painted after the board there.
    const onFace = (s, z, [w, h], depth, color) => Object.assign(box({ center: at(front + depth / 2, z - h / 2, s), u: dir, w: Z, size: [w, depth, h], color, outline: true }), { on: pcb, side: out });
    const pullups = [0, 1, 2].map((k) => onFace(first + k * P, BOTTOM + 7.5, [1.6, 0.8], 0.45, MATERIALS.chip));
    const bodyZ = BOTTOM + 8.5 + BODY.size; // the top of the encoder's body
    const body = onFace(0, bodyZ, [BODY.size, BODY.size], BODY.depth, MATERIALS.encoderBody);
    const centreZ = bodyZ - BODY.size / 2;
    const frontFace = front + BODY.depth;
    const bushing = Object.assign(cylinder({ from: at(frontFace, centreZ), to: at(frontFace + BUSHING.length, centreZ), radius: BUSHING.radius, segments: 16, color: MATERIALS.encoderBody }), { on: body });
    const shaft = Object.assign(cylinder({ from: at(frontFace + BUSHING.length, centreZ), to: at(frontFace + SHAFT.length, centreZ), radius: SHAFT.radius, segments: 14, color: MATERIALS.encoderShaft }), { on: body });

    const leads = pins.flatMap((p) => lead([withZ(p, 0), withZ(p, STRIP.from + 0.2)], { radius: 0.32, color: MATERIALS.tinned }));
    const inside = at(0, BOTTOM + 6);
    const paths = pins.map((p) => ({ points: [withZ(p, 0), withZ(p, BOTTOM + 1.3), inside], body: 1 }));
    const mark = { kind: 'face', at: face(BOTTOM + 3.6), normal: out };
    return { primitives: [strip, pcb, ...pullups, body, bushing, shaft, ...leads], body: [strip, pcb, body], anchor: at(frontFace, centreZ + 9), paths, mark };
  },
};
