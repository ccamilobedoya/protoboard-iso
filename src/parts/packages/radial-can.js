// Radial electrolytic capacitor: an aluminium can in a printed sleeve, standing on two
// leads. The light stripe faces the negative lead, as on real parts.
//
// params: diameter, height, leadSpacing (mm), sleeve, stripe, standoff,
//         print (value printed down the sleeve, "100µF 25V")

import { add, scale, cross, Z } from '../../core/vec.js';
import { lathe, rectDecal, textDecal, midpoint } from '../../geometry/primitives.js';
import { MATERIALS } from '../colors.js';
import { tone } from '../../render/shading.js';
import { lead, directionBetween, withZ } from './common.js';

const P = 2.54;
const STRIPE_HALF_ANGLE = 32;

export default {
  id: 'radial-can',
  pinCount: 2,
  span: (params) => ({ min: P * 0.99, max: Math.max(params.leadSpacing, P) + 2 * P + 0.01 }),

  build({ pins: [plus, minus], params }) {
    const { diameter: D, height: H, leadSpacing, sleeve = MATERIALS.capSleeve, stripe = MATERIALS.capStripe, standoff = 0.4, print } = params;
    const R = D / 2;
    const dir = directionBetween(plus, minus);
    const base = withZ(midpoint(plus, minus), standoff);

    const profile = [
      [0, 0],
      [R - 0.4, 0],
      [R, 0.35],
      [R, H - 0.45],
      [R - 0.4, H],
      [0, H],
    ];
    const body = lathe({
      profile,
      origin: base,
      axis: Z,
      ref: dir,
      segments: 28,
      color: sleeve,
      colorAt: ({ angle, cap, h }) => {
        if (cap) return h > H / 2 ? MATERIALS.aluminium : sleeve;
        const fromMinus = Math.min(angle, 360 - angle);
        return fromMinus < STRIPE_HALF_ANGLE ? stripe : null;
      },
    });

    const top = withZ(base, standoff + H);
    const across = cross(Z, dir);
    const vent = tone(MATERIALS.aluminium, 0.78);
    body.decals.push(rectDecal({ center: top, u: dir, v: across, width: D * 0.62, height: 0.28, color: vent }));
    body.decals.push(rectDecal({ center: top, u: dir, v: across, width: 0.28, height: D * 0.62, color: vent }));

    // "−" marks printed down the stripe, on the side of the negative lead.
    const side = cross(Z, dir);
    for (const f of [0.3, 0.5, 0.7]) {
      const at = add(withZ(base, standoff + H * f), scale(dir, R + 0.02));
      body.decals.push(textDecal({ text: '−', at, right: side, down: scale(Z, -1), size: Math.min(2.2, D * 0.35), color: sleeve, weight: 700 }));
    }

    // The value, printed up the sleeve and repeated around it as on real parts (never over the
    // stripe). Each copy shows only when it faces the viewer squarely: the isometric views look
    // at 45° to the board, so with copies near the diagonals each view shows exactly one.
    if (print) {
      const size = Math.min(D * 0.26, (H * 0.8) / (print.length * 0.56));
      for (const turn of [65, 135, 225, 295]) {
        const a = (turn * Math.PI) / 180;
        const out = add(scale(dir, Math.cos(a)), scale(side, Math.sin(a)));
        const at = add(withZ(base, standoff + H * 0.5), scale(out, R + 0.02));
        body.decals.push({ ...textDecal({ text: print, at, right: Z, down: cross(Z, out), size, color: stripe, weight: 700 }), minFacing: 0.6 });
      }
    }

    const half = leadSpacing / 2;
    const leads = [
      ...lead([withZ(plus, 0), add(base, scale(dir, -half))]),
      ...lead([withZ(minus, 0), add(base, scale(dir, half))]),
    ];
    return { primitives: [body, ...leads], body: [body], anchor: top };
  },
};
