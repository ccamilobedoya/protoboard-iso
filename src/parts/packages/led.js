// Through-hole LED, 5 mm or 3 mm: flange, cylinder and dome, standing on its two leads.
// The leads come out 2.54 mm apart and may be spread up to three holes. The flange has a
// flat on the cathode side, as on real LEDs. The anode lead is the longer one: pushed into the
// board as far as the cathode, its extra length shows as a small kink outwards.
//
// params: size (5 | 3), color, standoff (mm between board and flange, default 3)

import { add, scale, Z } from '../../core/vec.js';
import { lathe, prism, midpoint } from '../../geometry/primitives.js';
import { lead, directionBetween, withZ } from './common.js';

const P = 2.54;

// Body above the flange: cylinder and dome.
function ledProfile(k) {
  const pts = [
    [0, 1.0 * k],
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
    // Flange: a circle with a flat cut on the cathode side (towards +dir).
    const R = 2.9 * k;
    const flat = 2.45 * k;
    const start = Math.acos(flat / R);
    const flangeProfile = [];
    for (let i = 0; i <= 18; i++) {
      const t = start + ((2 * Math.PI - 2 * start) * i) / 18;
      flangeProfile.push([R * Math.cos(t), R * Math.sin(t)]);
    }
    const flange = prism({ profile: flangeProfile, origin: base, u: dir, height: 1.0 * k, color, opacity: 0.95 });
    const footA = add(base, scale(dir, -1.27 * k));
    const footK = add(base, scale(dir, 1.27 * k));
    const anodeLead = [withZ(anode, 0), withZ(anode, 0.8), add(withZ(anode, Math.min(1.8, standoff * 0.6)), scale(dir, -0.9)), footA];
    const cathodeLead = [withZ(cathode, 0), withZ(cathode, 1.2), footK];
    const leads = [...lead(anodeLead, { radius: 0.25 }), ...lead(cathodeLead, { radius: 0.25 })];
    // Current goes up the leads and meets at the chip, low in the dome (src/sim/paths.js).
    const chip = withZ(base, standoff + 3 * k);
    const paths = [
      { points: [...anodeLead, chip], body: anodeLead.length - 1 },
      { points: [...cathodeLead, chip], body: cathodeLead.length - 1 },
    ];
    return { primitives: [flange, body, ...leads], body: [flange, body], anchor: withZ(base, standoff + 8.1 * k), paths };
  },
};
