// Through-hole LED, 5 mm or 3 mm: flange, cylinder and dome, standing on its two leads.
// The leads come out 2.54 mm apart and may be spread up to three holes.
//
// params: size (5 | 3), color, standoff (mm between board and flange, default 3)

import { add, scale, Z } from '../../core/vec.js';
import { lathe, midpoint } from '../../geometry/primitives.js';
import { lead, directionBetween, withZ } from './common.js';

const P = 2.54;

function ledProfile(k) {
  const pts = [
    [0, 0],
    [2.9 * k, 0],
    [2.9 * k, 1.0 * k],
    [2.5 * k, 1.0 * k],
    [2.5 * k, 5.6 * k],
  ];
  const steps = 6;
  for (let i = 1; i <= steps; i++) {
    const t = (i / steps) * (Math.PI / 2);
    pts.push([2.5 * k * Math.cos(t), (5.6 + 2.5 * Math.sin(t)) * k]);
  }
  return pts;
}

export default {
  id: 'led',
  pinCount: 2,
  span: () => ({ min: P * 0.99, max: 3 * P * 1.01 }),

  build({ pins: [anode, cathode], params }) {
    const { size = 5, color, standoff = 3 } = params;
    const k = size / 5;
    const dir = directionBetween(anode, cathode);
    const base = withZ(midpoint(anode, cathode), standoff);
    const body = lathe({ profile: ledProfile(k), origin: base, axis: Z, ref: dir, segments: 22, color, opacity: 0.95 });
    const footA = add(base, scale(dir, -1.27 * k));
    const footK = add(base, scale(dir, 1.27 * k));
    const leads = [
      ...lead([withZ(anode, 0), withZ(anode, 1.2), footA], { radius: 0.25 }),
      ...lead([withZ(cathode, 0), withZ(cathode, 1.2), footK], { radius: 0.25 }),
    ];
    return { primitives: [body, ...leads], body: [body], anchor: withZ(base, standoff + 8.1 * k) };
  },
};
