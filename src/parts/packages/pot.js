// Potentiometer standing on three leads in a row (the common breadboard type), with its
// knob towards the front. Same convention as TO-220: pin 1 on the left seen from the knob.
// The white mark on the knob shows the wiper position.
//
// params: position (0…1, default 0.5: middle), color (body), knob (knob colour)

import { add, scale, cross, Z } from '../../core/vec.js';
import { prism, lathe, rectDecal } from '../../geometry/primitives.js';
import { MATERIALS } from '../colors.js';
import { lead, directionBetween, withZ } from './common.js';
import { inlineRule } from './to220.js';

const WIDTH = 9.6;
const FRONT = -1.4; // body front face, mm towards the front from the pins
const BACK = 3.6;
const HEIGHT = 10;
const STANDOFF = 0.6;
const KNOB_R = 3;
const KNOB_LEN = 6;
const TRAVEL = 270; // degrees of rotation from end to end

export default {
  id: 'pot-vertical',
  pinCount: 3,
  inline: inlineRule,

  build({ pins, params }) {
    const { position = 0.5, color = MATERIALS.potBody, knob = MATERIALS.knob } = params;
    const dir = directionBetween(pins[0], pins[2]);
    const back = cross(Z, dir);
    const front = scale(back, -1);
    const centre = withZ(pins[1], STANDOFF);
    const body = prism({
      profile: [[-WIDTH / 2, FRONT], [WIDTH / 2, FRONT], [WIDTH / 2, BACK], [-WIDTH / 2, BACK]],
      origin: centre,
      u: dir,
      height: HEIGHT,
      color,
      outline: true,
    });
    const axisAt = add(withZ(centre, STANDOFF + HEIGHT * 0.55), scale(front, -FRONT));
    const shaft = lathe({
      profile: [[0, 0], [KNOB_R, 0], [KNOB_R, KNOB_LEN - 0.4], [KNOB_R - 0.4, KNOB_LEN], [0, KNOB_LEN]],
      origin: axisAt,
      axis: front,
      ref: Z,
      segments: 24,
      color: knob,
    });
    // Mark: 0 at the far left of the travel, 1 at the far right, 0.5 straight up.
    const a = ((Math.min(1, Math.max(0, position)) - 0.5) * TRAVEL * Math.PI) / 180;
    const pointer = add(scale(dir, Math.sin(a)), scale(Z, Math.cos(a)));
    const face = add(axisAt, scale(front, KNOB_LEN + 0.01));
    shaft.decals.push(rectDecal({ center: add(face, scale(pointer, KNOB_R * 0.5)), u: pointer, v: cross(front, pointer), width: KNOB_R * 0.9, height: 0.6, color: MATERIALS.knobMark }));

    const leads = pins.flatMap((p) => lead([withZ(p, 0), withZ(p, STANDOFF)], { radius: 0.35, color: MATERIALS.tinned }));
    return { primitives: [body, shaft, ...leads], body: [body, shaft], anchor: withZ(centre, STANDOFF + HEIGHT) };
  },
};
