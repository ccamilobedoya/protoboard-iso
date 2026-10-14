// Multi-turn trimmer potentiometer (Bourns 3296W and its clones): a blue box standing on
// three leads in a row, 2.54 mm apart, with a brass adjusting screw on top. The value is
// printed as a code ("103" = 10 × 10³ Ω = 10 kΩ). Pin 1 on the left seen from the printed
// face, like TO-220.
//
// params: code (value code), color (body)

import { add, scale, cross, Z } from '../../core/vec.js';
import { box, lathe, rectDecal, textDecal } from '../../geometry/primitives.js';
import { MATERIALS } from '../colors.js';
import { lead, directionBetween, withZ } from './common.js';
import { inlineRule } from './to220.js';

const WIDTH = 9.5; // along the leads
const DEPTH = 4.8;
const HEIGHT = 10;
const STANDOFF = 0.5;

export default {
  id: 'trimmer-3296',
  pinCount: 3,
  inline: inlineRule,

  build({ pins, params }) {
    const { code = '', color = MATERIALS.trimmer } = params;
    const dir = directionBetween(pins[0], pins[2]);
    const front = scale(cross(Z, dir), -1);
    const centre = withZ(pins[1], STANDOFF);
    const body = box({ center: centre, u: dir, size: [WIDTH, DEPTH, HEIGHT], color, outline: true });
    const faceAt = (along, z) => add(add(withZ(centre, STANDOFF + z), scale(dir, along)), scale(front, DEPTH / 2 + 0.01));
    body.decals.push(textDecal({ text: '3296', at: faceAt(0, HEIGHT * 0.65), right: dir, down: scale(Z, -1), size: 1.6, color: MATERIALS.print, weight: 700 }));
    if (code) body.decals.push(textDecal({ text: code, at: faceAt(0, HEIGHT * 0.35), right: dir, down: scale(Z, -1), size: 1.8, color: MATERIALS.print, weight: 700 }));
    // The adjusting screw sits on top, towards pin 1.
    const screwAt = add(withZ(centre, STANDOFF + HEIGHT), scale(dir, -WIDTH / 2 + 1.9));
    const screw = lathe({ profile: [[0, 0], [1.2, 0], [1.2, 0.7], [0, 0.7]], origin: screwAt, axis: Z, ref: dir, segments: 16, color: MATERIALS.brass });
    screw.decals.push(rectDecal({ center: withZ(screwAt, screwAt.z + 0.71), u: dir, v: cross(Z, dir), width: 2.0, height: 0.35, color: MATERIALS.screwSlot }));
    const leads = pins.flatMap((p) => lead([withZ(p, 0), withZ(p, STANDOFF)], { radius: 0.3, color: MATERIALS.tinned }));
    return { primitives: [body, screw, ...leads], body: [body, screw], anchor: withZ(centre, STANDOFF + HEIGHT + 0.7) };
  },
};
