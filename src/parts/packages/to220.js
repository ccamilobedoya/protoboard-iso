// TO-220: plastic body with a metal tab and three leads 2.54 mm apart (power MOSFETs,
// voltage regulators, power transistors).
//
// Orientation follows the real convention: looking at the printed face with the leads
// down, pin 1 is on the left. So the order of the three holes decides which way the
// part faces; no extra setting is needed.
//
// params: marking (text on the body), standoff (mm between board and body, default 4)

import { add, scale, cross, Z } from '../../core/vec.js';
import { prism, circleDecal, textDecal } from '../../geometry/primitives.js';
import { MATERIALS } from '../colors.js';
import { lead, directionBetween, withZ } from './common.js';

export const inlineRule = { count: 3, pitch: 1 };

export default {
  id: 'TO-220',
  pinCount: 3,
  inline: inlineRule,

  build({ pins, params }) {
    const { marking = '', standoff: z0 = 4 } = params;
    const dir = directionBetween(pins[0], pins[2]);
    const back = cross(Z, dir);
    const front = scale(back, -1);
    const centre = withZ(pins[1], z0);

    const rect = (v0, v1) => [[-5, v0], [5, v0], [5, v1], [-5, v1]];
    const plastic = prism({ profile: rect(-2.3, 0.9), origin: centre, u: dir, height: 9.2, color: MATERIALS.epoxyBlack, outline: true });
    // The tab is split at the top of the plastic so each piece sorts cleanly against it.
    const tabLow = prism({ profile: rect(0.9, 2.2), origin: centre, u: dir, height: 9.2, color: MATERIALS.tab, outline: true });
    const tab = prism({ profile: rect(0.9, 2.2), origin: withZ(centre, z0 + 9.2), u: dir, height: 6.4, color: MATERIALS.tab, outline: true });

    const holeCentre = (v) => add(withZ(centre, z0 + 12.8), scale(back, v));
    tab.decals.push(circleDecal({ center: holeCentre(0.89), u: dir, v: Z, radius: 1.8, color: '#3a3a3c' }));
    tab.decals.push(circleDecal({ center: holeCentre(2.21), u: Z, v: dir, radius: 1.8, color: '#3a3a3c' }));

    if (marking) {
      const at = add(withZ(centre, z0 + 5.2), scale(front, 2.31));
      plastic.decals.push(textDecal({ text: marking, at, right: dir, down: scale(Z, -1), size: 1.25, color: MATERIALS.print, weight: 700 }));
    }

    const leads = pins.flatMap((p) => lead([withZ(p, 0), withZ(p, z0)], { radius: 0.4, color: MATERIALS.tinned }));
    // Current goes up each lead into the middle of the plastic (src/sim/paths.js).
    const inside = withZ(centre, z0 + 4.6);
    const paths = pins.map((p) => ({ points: [withZ(p, 0), withZ(p, z0), inside], body: 1 }));
    return { primitives: [plastic, tabLow, tab, ...leads], body: [plastic, tabLow, tab], anchor: withZ(centre, z0 + 15.6), paths };
  },
};
