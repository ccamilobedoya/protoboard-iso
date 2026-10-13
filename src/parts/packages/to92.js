// TO-92: small D-shaped plastic body with three leads (small transistors, small MOSFETs,
// some regulators and sensors). The leads are bent out to the 2.54 mm grid.
// Same convention as TO-220: flat printed face towards you, leads down, pin 1 left.
//
// params: marking, standoff (default 3)

import { add, scale, cross, Z } from '../../core/vec.js';
import { prism, textDecal } from '../../geometry/primitives.js';
import { MATERIALS } from '../colors.js';
import { lead, directionBetween, withZ } from './common.js';
import { inlineRule } from './to220.js';

const RADIUS = 2.35;
const FLAT = -1.25; // the flat face, measured towards the back
const HEIGHT = 4.8;

function dProfile() {
  const start = Math.asin(FLAT / RADIUS);
  const end = Math.PI - start;
  const steps = 14;
  const pts = [];
  for (let i = 0; i <= steps; i++) {
    const t = start + ((end - start) * i) / steps;
    pts.push([RADIUS * Math.cos(t), RADIUS * Math.sin(t)]);
  }
  return pts;
}

export default {
  id: 'TO-92',
  pinCount: 3,
  inline: inlineRule,

  build({ pins, params }) {
    const { marking = '', standoff: z0 = 3 } = params;
    const dir = directionBetween(pins[0], pins[2]);
    const front = scale(cross(Z, dir), -1);
    const centre = withZ(pins[1], z0);
    const body = prism({ profile: dProfile(), origin: centre, u: dir, height: HEIGHT, color: MATERIALS.epoxyBlack });
    if (marking) {
      const at = add(withZ(centre, z0 + HEIGHT / 2), scale(front, -FLAT + 0.01));
      body.decals.push(textDecal({ text: marking, at, right: dir, down: scale(Z, -1), size: 0.7, color: MATERIALS.print, weight: 700 }));
    }
    const leads = pins.flatMap((p) => lead([withZ(p, 0), withZ(p, z0)], { radius: 0.25, color: MATERIALS.tinned }));
    return { primitives: [body, ...leads], body: [body], anchor: withZ(centre, z0 + HEIGHT) };
  },
};
