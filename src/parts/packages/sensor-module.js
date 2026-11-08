// LM393 sensor module (src/parts/types/sensor-modules.js): a small blue board standing upright on its
// pins in one row of the breadboard, the pins in a black header strip along its lower edge. The board
// is 15 mm wide with three pins, 18 mm with four, and about 30 mm tall (resellers' drawings of the
// 3-pin LDR and SW-420 boards and the 4-pin rain and soil comparators, 1.6 mm FR-4). Its front face, the
// one that faces the front view with the holes in increasing columns, carries the printed pin names at
// its lower edge, the two LEDs (power and DO), the LM393 (SOIC-8) and the blue trimmer (3362, 6.6 mm;
// the KY-024's 3296W is 9.5 × 4.8 mm and 10 mm tall). The sensing element stands on its upper edge,
// drawn as the part number's glyph: a comb of two interleaved tracks (rain), a fork of two prongs
// (soil), a photoresistor's disc (light), a U-shaped slot (optical slot), the two lenses of a TCRT5000 in
// their black case (line follower), a clear and a dark IR can (obstacle), a Hall chip on its legs
// (KY-024) and the SW-420's can lying along the edge. Not to scale beyond the board itself.
//
// params: print (the pin names as printed, in pin order), glyph, part (the part number, printed on top)
// mark (src/pinout.js): the printed face, `face`, which way it faces.

import { add, scale, cross, Z } from '../../core/vec.js';
import { box, lathe, cylinder, rectDecal, textDecal, circleDecal, midpoint } from '../../geometry/primitives.js';
import { MATERIALS } from '../colors.js';
import { lead, directionBetween, withZ } from './common.js';

const P = 2.54;
const T = 1.6; // board thickness
const STRIP = { from: 0.6, height: 2.5, depth: 2.5 }; // the header's black strip, mm over the board
const BOTTOM = STRIP.from + STRIP.height; // the board's lower edge
const HEIGHT = 30;
const widthOf = (n) => (n <= 3 ? 15 : 18);

export default {
  id: 'sensor-module',
  pinCount: null, // from the part number: 3 or 4
  inline: { pitch: 1 },

  // Four pins: every spot of four neighbouring holes along a row, either way round (three go inline).
  footprints(board, params) {
    const n = params.print?.length ?? 4;
    const out = [];
    for (const row of board.spec.rows) {
      for (let c = 1; c <= board.spec.columns; c++) {
        for (const sign of [1, -1]) {
          const cols = Array.from({ length: n }, (_, k) => c + sign * k);
          if (cols.every((k) => k >= 1 && k <= board.spec.columns)) out.push(cols.map((k) => `${row.id}${k}`));
        }
      }
    }
    return out;
  },

  build({ pins, params }) {
    const n = pins.length;
    const print = params.print ?? pins.map((_, i) => String(i + 1));
    const W = widthOf(n);
    const dir = directionBetween(pins[0], pins[n - 1]);
    const out = scale(cross(Z, dir), -1); // the printed face
    const row = withZ(midpoint(pins[0], pins[n - 1]), 0);
    // A point `d` mm out of the row (towards the printed face), at height z, `s` mm along the row.
    const at = (d, z, s = 0) => add(add(withZ(row, z), scale(out, d)), scale(dir, s));
    const front = T / 2;

    const strip = box({ center: at(0, STRIP.from), u: dir, w: Z, size: [n * P, STRIP.depth, STRIP.height], color: MATERIALS.headerBlack, outline: true });
    const pcb = box({ center: at(0, BOTTOM), u: dir, w: Z, size: [W, T, HEIGHT], color: MATERIALS.pcbBlue, outline: true });
    pcb.on = strip;
    const decal = (d) => pcb.decals.push(d);
    const face = (z, s = 0) => at(front + 0.01, z, s);
    // The pin names along the lower edge, each over its pin, and the part number near the top.
    const first = -((n - 1) * P) / 2;
    print.forEach((name, i) => {
      decal(rectDecal({ center: face(BOTTOM + 1.3, first + i * P), u: dir, v: Z, width: 1.6, height: 1.6, color: MATERIALS.tinned }));
      decal(textDecal({ text: name, at: face(BOTTOM + 3.6, first + i * P), right: dir, down: scale(Z, -1), size: n > 3 ? 1.0 : 1.1, color: MATERIALS.pcbPrint, weight: 700 }));
    });
    decal(textDecal({ text: params.part ?? '', at: face(BOTTOM + HEIGHT - 2.4), right: dir, down: scale(Z, -1), size: 1.3, color: MATERIALS.pcbPrint, weight: 700 }));

    // Parts on the printed face: seen only from that side, and painted after the board there.
    const onFace = (s, z, [w, h], depth, color) => Object.assign(box({ center: at(front + depth / 2, z - h / 2, s), u: dir, w: Z, size: [w, depth, h], color, outline: true }), { on: pcb, side: out });
    const leds = [-W / 2 + 3, W / 2 - 3].map((s) => onFace(s, BOTTOM + 8.2, [1.6, 0.9], 0.6, MATERIALS.smdLed));
    leds.forEach((l, i) => l.decals.push(textDecal({ text: i ? 'D0' : 'PWR', at: at(front + 0.01, BOTTOM + 9.6, i ? W / 2 - 3 : -W / 2 + 3), right: dir, down: scale(Z, -1), size: 0.8, color: MATERIALS.pcbPrint })));
    const chip = onFace(0, BOTTOM + 15.5, [4.9, 3.9], 1.5, MATERIALS.chip);
    chip.decals.push(textDecal({ text: 'LM393', at: at(front + 1.51, BOTTOM + 13.6), right: dir, down: scale(Z, -1), size: 0.75, color: MATERIALS.chipMark, weight: 700 }));
    const big = params.glyph === 'hall';
    const [tw, th, td] = big ? [9.5, 10, 4.8] : [6.6, 6.6, 4.5];
    const trimmer = onFace(0, BOTTOM + 25.2, [tw, th], td, MATERIALS.trimmer);
    // Its screw: a cross on a light knob (3362), a brass screw at one end (3296W).
    const screw = big ? at(front + td + 0.01, BOTTOM + 23.2, tw / 2 - 1.6) : at(front + td + 0.01, BOTTOM + 21.9);
    trimmer.decals.push(circleDecal({ center: screw, u: dir, v: Z, radius: big ? 1.1 : 2.2, color: big ? MATERIALS.brass : MATERIALS.trimmerKnob }));
    trimmer.decals.push(rectDecal({ center: add(screw, scale(out, 0.01)), u: dir, v: Z, width: big ? 1.8 : 3.4, height: 0.5, color: MATERIALS.screwSlot }));
    const resistors = [-W / 2 + 3, W / 2 - 3].map((s) => onFace(s, BOTTOM + 13.4, [1.6, 0.8], 0.45, MATERIALS.chip));

    // The pins: up from the hole into the strip; they are soldered into the board above it.
    const leads = pins.flatMap((p) => lead([withZ(p, 0), withZ(p, STRIP.from + 0.2)], { radius: 0.32, color: MATERIALS.tinned }));
    const top = BOTTOM + HEIGHT;
    const element = glyph(params.glyph, at, dir, out, top, W, pcb);
    // Current goes up each pin into the board (src/sim/paths.js).
    const inside = at(0, BOTTOM + 6);
    const paths = pins.map((p) => ({ points: [withZ(p, 0), withZ(p, BOTTOM + 1.3), inside], body: 1 }));
    const mark = { kind: 'face', at: face(BOTTOM + 3.6), normal: out };
    return { primitives: [strip, pcb, ...leds, ...resistors, chip, trimmer, ...element, ...leads], body: [strip, pcb, ...element.slice(0, 1)], anchor: at(0, top + 9), paths, mark };
  },
};

// The sensing element on the board's upper edge (z = top), by the part number's glyph.
function glyph(kind, at, dir, out, top, W, pcb) {
  const onTop = (b) => Object.assign(b, { on: pcb });
  if (kind === 'comb' || kind === 'fork') {
    // A rain comb: a plate with two interleaved gold combs; a soil fork: two gold prongs.
    if (kind === 'comb') {
      const plate = onTop(box({ center: at(0, top), u: dir, w: Z, size: [W, 1.0, 10], color: MATERIALS.pcbBlack, outline: true }));
      const teeth = 5;
      for (let k = 0; k < teeth; k++) {
        const s = -W / 2 + 1.6 + (k * (W - 3.2)) / (teeth - 1);
        plate.decals.push(rectDecal({ center: at(0.51, top + (k % 2 ? 5.4 : 4.6), s), u: dir, v: Z, width: 0.7, height: 7.6, color: MATERIALS.combGold }));
      }
      plate.decals.push(rectDecal({ center: at(0.51, top + 9.2), u: dir, v: Z, width: W - 2, height: 0.6, color: MATERIALS.combGold }));
      plate.decals.push(rectDecal({ center: at(0.51, top + 0.8), u: dir, v: Z, width: W - 2, height: 0.6, color: MATERIALS.combGold }));
      return [plate];
    }
    const prongs = [-W / 4, W / 4].map((s) => onTop(box({ center: at(0, top, s), u: dir, w: Z, size: [3.2, 1.0, 14], color: MATERIALS.combGold, outline: true })));
    const bar = onTop(box({ center: at(0, top), u: dir, w: Z, size: [W, 1.0, 2.5], color: MATERIALS.pcbBlue, outline: true }));
    return [bar, ...prongs];
  }
  if (kind === 'ldr') {
    // A photoresistor's disc facing the front on two short legs, its zigzag track on the face.
    const centre = at(0.6, top + 4.6);
    const disc = lathe({ profile: [[0, 0], [2.5, 0], [2.5, 1.8], [0, 1.8]], origin: centre, axis: out, ref: dir, segments: 18, color: MATERIALS.ldrBody });
    const face = (s, z) => add(add(centre, scale(out, 1.81)), add(scale(dir, s), scale(Z, z)));
    for (let k = -2; k <= 2; k++) disc.decals.push(rectDecal({ center: face(0, k * 0.8), u: dir, v: Z, width: 3.2, height: 0.35, color: MATERIALS.ldrTrack }));
    const legs = [-1, 1].flatMap((k) => lead([at(0, top, k * 1.3), at(0.6, top + 2.2, k * 1.3)], { radius: 0.25, color: MATERIALS.tinned }));
    return [onTop(disc), ...legs];
  }
  if (kind === 'slot') {
    // The black U: a base and two uprights, the slot between them across the board's plane.
    const base = onTop(box({ center: at(0, top), u: dir, w: Z, size: [12, 6, 2.5], color: MATERIALS.chip, outline: true }));
    const posts = [-1, 1].map((k) => onTop(box({ center: at(0, top + 2.5, k * 4.1), u: dir, w: Z, size: [3.8, 6, 8.5], color: MATERIALS.chip, outline: true })));
    return [base, ...posts];
  }
  if (kind === 'tcrt' || kind === 'ir-pair') {
    // Two IR cans looking up: the emitter's clear lens and the receiver's dark one; a TCRT5000's in its
    // black case.
    const cans = [-1, 1].map((k) => cylinder({ from: at(0, top + (kind === 'tcrt' ? 1.5 : 2.2), k * 2.75), to: at(0, top + (kind === 'tcrt' ? 7 : 8.5), k * 2.75), radius: 2.4, segments: 14, color: k < 0 ? MATERIALS.irClear : MATERIALS.irDark }));
    if (kind === 'ir-pair') {
      const legs = [-1, 1].flatMap((k) => lead([at(0, top, k * 2.75), at(0, top + 2.2, k * 2.75)], { radius: 0.25, color: MATERIALS.tinned }));
      return [...cans.map(onTop), ...legs];
    }
    const body = onTop(box({ center: at(0, top), u: dir, w: Z, size: [10.2, 5.8, 6.5], color: MATERIALS.chip, outline: true }));
    return [body, ...cans.map((c) => Object.assign(c, { on: body }))];
  }
  if (kind === 'hall') {
    // An A3144 (TO-92 flat, 4 × 1.5 × 3 mm) on its three legs, its face to the front.
    const chip = onTop(box({ center: at(0, top + 4), u: dir, w: Z, size: [4.1, 1.6, 3.1], color: MATERIALS.chip, outline: true }));
    chip.decals.push(textDecal({ text: '3144', at: at(0.81, top + 5.6), right: dir, down: scale(Z, -1), size: 0.7, color: MATERIALS.chipMark }));
    const legs = [-1, 0, 1].flatMap((k) => lead([at(0, top, k * 1.27), at(0, top + 4, k * 1.27)], { radius: 0.22, color: MATERIALS.tinned }));
    return [chip, ...legs];
  }
  // SW-420: its can (about 4.5 mm across, 11 mm long) lying along the upper edge.
  const can = cylinder({ from: at(0, top + 2.4, -5.5), to: at(0, top + 2.4, 5.5), radius: 2.25, segments: 16, color: MATERIALS.tiltTube });
  return [onTop(can)];
}
