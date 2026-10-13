// Ceramic disc capacitor: a flat rounded disc standing on two leads, with its value code
// ("104") printed on both faces.
//
// params: diameter, thickness, color, code, standoff

import { add, scale, cross, Z } from '../../core/vec.js';
import { lathe, textDecal, midpoint } from '../../geometry/primitives.js';
import { MATERIALS } from '../colors.js';
import { tone } from '../../render/shading.js';
import { lead, directionBetween, withZ } from './common.js';

const P = 2.54;

export default {
  id: 'disc',
  pinCount: 2,
  span: () => ({ min: P * 0.99, max: 3 * P * 1.01 }),

  build({ pins: [a, b], params }) {
    const { diameter: D = 5, thickness: T = 2.2, color = MATERIALS.ceramic, code, standoff = 2.5 } = params;
    const R = D / 2;
    const dir = directionBetween(a, b);
    const normal = cross(dir, Z); // the disc faces look along ±normal
    const centre = withZ(midpoint(a, b), standoff + R);
    const origin = add(centre, scale(normal, -T / 2));
    const profile = [
      [0, 0],
      [R - 0.5, 0],
      [R, 0.6],
      [R, T - 0.6],
      [R - 0.5, T],
      [0, T],
    ];
    const body = lathe({ profile, origin, axis: normal, ref: Z, segments: 24, color });

    if (code) {
      const ink = tone(color, 0.45);
      const down = scale(Z, -1);
      const front = add(centre, scale(normal, T / 2 + 0.01));
      const back = add(centre, scale(normal, -T / 2 - 0.01));
      body.decals.push(textDecal({ text: code, at: front, right: dir, down, size: 1.5, color: ink, weight: 700 }));
      body.decals.push(textDecal({ text: code, at: back, right: scale(dir, -1), down, size: 1.5, color: ink, weight: 700 }));
    }

    // Leads stop where they meet the underside of the disc.
    const offset = 1.27;
    const footZ = standoff + R - Math.sqrt(R * R - offset * offset) + 0.1;
    const leads = [
      ...lead([withZ(a, 0), withZ(add(centre, scale(dir, -offset)), footZ)]),
      ...lead([withZ(b, 0), withZ(add(centre, scale(dir, offset)), footZ)]),
    ];
    return { primitives: [body, ...leads], body: [body], anchor: withZ(centre, standoff + D) };
  },
};
