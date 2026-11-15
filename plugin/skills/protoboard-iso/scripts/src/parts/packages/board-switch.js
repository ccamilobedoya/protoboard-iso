// Switches small enough to stand in the breadboard's holes.
//
//   slide-ss12   SS-12D00 slide switch, SPDT (Vimex SS-12D00 drawing): a nickel-plated steel frame
//                8.5 mm along its pins, 3.5 mm across and 3.5 mm tall, its three flat pins (0.5 ×
//                0.3 mm) 2.5 mm apart in a row, 3.7 mm long (they go into three neighbouring holes
//                of a row, 2.54 mm); a 1.5 × 1.5 mm knob 3 mm over the frame ("G3"), sliding 2.0 mm
//                in its slot. The knob carries the slider under it: on the side of pin 1 it joins
//                the middle pin to pin 1, slid over to pin 2's side it joins it to pin 2.
//   tilt-sw520   SW-520D ball tilt switch (Bailin Electronics sheet): a can 5.2 mm across and
//                11.5 mm long in black heat-shrink tube, two leads 0.6 mm thick, 2.4 mm apart and
//                8 mm long out of one end (two neighbouring holes, 2.54 mm). It stands on them,
//                its can upright: the two balls inside fall onto the leads' end and close it.
//
// mark (src/pinout.js): the slide switch's knob (`slide`: the middle pin is the common, joined to the
// end on the knob's side; the knob moves, so the sentence names no side); the tilt switch's two leads
// are alike, `either`.
//
// The slide switch's knob is drawn at both places (`pose`: 'off' at pin 1, 'on' at pin 2), the one
// its position does not have hidden: the live page shows the one its control has now
// (page/client/live.js), so sliding it in the card or on the drawing moves the knob.
//
// params: slid (the slide switch's knob on pin 2's side)

import { add, scale, cross, Z } from '../../core/vec.js';
import { box, lathe, rectDecal, midpoint } from '../../geometry/primitives.js';
import { MATERIALS } from '../colors.js';
import { lead, directionBetween, withZ } from './common.js';
import { inlineRule } from './to220.js';

const P = 2.54;
// SS-12D00 (mm): frame along the pins, across, tall; the knob's side, its height over the frame, and
// its centre's distance from the middle at either end of its 2.0 mm travel; where the frame sits.
const FRAME = [8.5, 3.5, 3.5];
const KNOB = { side: 1.5, height: 3, offset: 1.0 };
// Its pins seldom go in all the way (a breadboard's contacts grip their flat 0.5 mm): a millimetre shows.
const SLIDE_STANDOFF = 1;

export const slide = {
  id: 'slide-ss12',
  pinCount: 3,
  inline: inlineRule,

  build({ pins, params }) {
    const dir = directionBetween(pins[0], pins[2]);
    const across = cross(Z, dir);
    const base = withZ(pins[1], SLIDE_STANDOFF);
    const [L, W, H] = FRAME;
    const frame = box({ center: base, u: dir, size: [L, W, H], color: MATERIALS.slideFrame, colors: { bottom: MATERIALS.slideBase }, outline: true });
    const top = withZ(base, SLIDE_STANDOFF + H);
    // The slot the knob runs in (3.6 × 1.64 mm), dark on the frame's top.
    frame.decals.push(rectDecal({ center: withZ(top, SLIDE_STANDOFF + H + 0.01), u: dir, v: across, width: 3.6, height: 1.64, color: MATERIALS.slideSlot }));
    const knob = (side) => {
      const k = box({ center: add(top, scale(dir, side * KNOB.offset)), u: dir, size: [KNOB.side, KNOB.side, KNOB.height], color: MATERIALS.slideKnob, outline: true });
      k.pose = side < 0 ? 'off' : 'on';
      k.hidden = Boolean(params.slid) !== (side > 0);
      k.on = frame;
      return k;
    };
    const knobs = [knob(-1), knob(1)];
    const leads = pins.flatMap((p) => lead([withZ(p, 0), withZ(p, SLIDE_STANDOFF)], { radius: 0.22, color: MATERIALS.tinned }));
    // The frame rests on its pins: painted after them, whatever their centres say.
    frame.on = leads;
    // Current: up each pin to the slider in the frame (src/sim/paths.js).
    const inside = withZ(base, SLIDE_STANDOFF + 1);
    const paths = pins.map((p) => ({ points: [withZ(p, 0), withZ(p, SLIDE_STANDOFF), inside], body: 1 }));
    // How to tell its pins apart (src/pinout.js): the knob, on the side of the end pin it joins.
    const mark = { kind: 'slide', at: add(top, scale(dir, (params.slid ? 1 : -1) * KNOB.offset)) };
    return { primitives: [frame, ...knobs, ...leads], body: [frame], anchor: withZ(top, SLIDE_STANDOFF + H + KNOB.height), paths, mark };
  },
};

// SW-520D (mm): the can's radius and length, how high its lead end stands over the board, and how far
// apart the leads leave it.
const CAN = { radius: 2.6, length: 11.5, standoff: 3, leads: 2.4 };

export const tilt = {
  id: 'tilt-sw520',
  pinCount: 2,
  // Its two leads, 2.4 mm apart, go into two neighbouring holes.
  span: () => ({ min: P * 0.99, max: P * 1.01 }),

  build({ pins: [a, b] }) {
    const dir = directionBetween(a, b);
    const base = withZ(midpoint(a, b), CAN.standoff);
    const { radius: R, length: Lc } = CAN;
    // The tube: a resin end where the leads come out, the can rounded a little at the far end.
    const profile = [[0, 0], [R - 0.3, 0], [R, 0.3], [R, Lc - 0.5], [R - 0.5, Lc], [0, Lc]];
    const can = lathe({ profile, origin: base, axis: Z, ref: dir, segments: 18, color: MATERIALS.tiltTube });
    const end = lathe({ profile: [[0, -0.6], [1.8, -0.6], [1.8, 0], [0, 0]], origin: base, axis: Z, ref: dir, segments: 14, color: MATERIALS.tiltResin });
    const foot = (k) => add(base, scale(dir, (k * CAN.leads) / 2));
    const legs = [a, b].map((p, k) => [withZ(p, 0), withZ(p, 1.2), withZ(foot(k ? 1 : -1), CAN.standoff - 0.6)]);
    const leads = legs.flatMap((points) => lead(points, { radius: 0.3, color: MATERIALS.tinned }));
    // Current: up each lead into the can, to the balls by its lead end (src/sim/paths.js).
    const inside = withZ(base, CAN.standoff + 2);
    const paths = legs.map((points) => ({ points: [...points, inside], body: 2 }));
    const top = withZ(base, CAN.standoff + Lc);
    return { primitives: [end, can, ...leads], body: [can], anchor: top, paths, mark: { kind: 'either', at: top } };
  },
};
