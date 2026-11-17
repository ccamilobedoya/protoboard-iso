// Through-hole RGB LED, 5 mm, four leads in a row: R, the common (the longest), G, B, as the usual
// datasheets draw them (YSL-R596CR3G4B5C-C10, China Young Sun LED; generic common-cathode and
// common-anode parts). The dome and flange of the 5 mm LED (./led.js: 5.0 mm dome, 5.8 mm flange,
// 8.6 mm tall) in a milky diffusing epoxy; the leads leave the flange close together (about
// 1.27 mm apart, inside its 5 mm) and are bent out to four neighbouring holes, 2.54 mm. The common is
// the longest lead: pushed in as far as the others, its extra length shows as a bend outwards.
//
// The flange is drawn round: where its flat is differs between makers (by R on some, by B on
// others), so the kit tells the leads apart by the longest one, never by a flat it cannot vouch for.
//
// params: common ('cathode' | 'anode'), standoff (mm between board and flange, default 3)

import { add, scale, cross, Z } from '../../core/vec.js';
import { lathe } from '../../geometry/primitives.js';
import { MATERIALS } from '../colors.js';
import { lead, directionBetween, withZ } from './common.js';

const FOOT = 1.27; // between leads where they leave the flange

// The dome above the flange (./led.js's 5 mm profile) and the flange, a round disc under it.
function domeProfile() {
  const pts = [[0, 1.0], [2.5, 1.0], [2.5, 5.6]];
  for (let i = 1; i <= 6; i++) {
    const t = (i / 6) * (Math.PI / 2);
    pts.push([2.5 * Math.cos(t), 5.6 + 2.5 * Math.sin(t)]);
  }
  return pts;
}
const FLANGE = [[0, 0], [2.9, 0], [2.9, 1.0], [0, 1.0]];

export default {
  id: 'led-rgb',
  pinCount: 4,
  inline: { count: 4, pitch: 1 },

  // Four neighbouring holes along a row, either way round.
  footprints(board) {
    const out = [];
    for (const row of board.spec.rows) {
      for (let c = 1; c <= board.spec.columns; c++) {
        for (const sign of [1, -1]) {
          const cols = [0, 1, 2, 3].map((k) => c + sign * k);
          if (cols.every((k) => k >= 1 && k <= board.spec.columns)) out.push(cols.map((k) => `${row.id}${k}`));
        }
      }
    }
    return out;
  },

  build({ pins, params }) {
    const { standoff = 3 } = params;
    const dir = directionBetween(pins[0], pins[3]);
    const side = cross(Z, dir);
    const centre = scale(add(pins[1], pins[2]), 0.5);
    const base = withZ(centre, standoff);
    const color = MATERIALS.rgbLens;
    const flange = lathe({ profile: FLANGE, origin: base, axis: Z, ref: dir, segments: 22, color, opacity: 0.95 });
    const dome = lathe({ profile: domeProfile(), origin: base, axis: Z, ref: dir, segments: 22, color, opacity: 0.92 });
    const leads = [];
    const paths = [];
    // Current goes up each lead to its chip, low in the dome, and they meet at the common's post.
    const chip = withZ(base, standoff + 3);
    pins.forEach((p, i) => {
      const foot = add(base, scale(dir, (i - 1.5) * FOOT));
      const up = withZ(p, 0.8);
      // The common's extra length: a bend out to the side, halfway up.
      const points = i === 1
        ? [withZ(p, 0), up, add(withZ(p, standoff * 0.55), scale(side, 0.9)), foot]
        : [withZ(p, 0), up, foot];
      leads.push(...lead(points, { radius: 0.22 }));
      paths.push({ points: [...points, chip], body: points.length - 1 });
    });
    // Where it lights (src/sim/paths.js): the dome, as an LED's; the halo mixes the three chips.
    const light = { base: withZ(base, standoff + 1.0), radius: 2.5, height: 7.1, skirt: { radius: 2.9, depth: 1.0 } };
    // How to tell its leads apart (src/pinout.js): the longest lead, the common, second in the row.
    const mark = { kind: 'longest', at: withZ(pins[1], 0.8) };
    return { primitives: [flange, dome, ...leads], body: [flange, dome], anchor: withZ(base, standoff + 8.1), paths, light, mark };
  },
};
