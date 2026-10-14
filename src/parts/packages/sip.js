// KBP bridge rectifier: a flat plastic body standing on four leads in a row (+ ~ ~ −). Its
// leads are 3.8 mm apart, not 2.54, so on a breadboard they bend a little into holes one or
// two apart (1-2-1 or 2-1-2). The bevelled top corner and the printed "+" mark pin 1.
//
// params: marking (part number)

import { add, sub, scale, cross, normalize, length, dot, Z } from '../../core/vec.js';
import { prism, textDecal } from '../../geometry/primitives.js';
import { MATERIALS } from '../colors.js';
import { lead, withZ } from './common.js';

const P = 2.54;
const WIDTH = 14.5; // along the leads
const THICK = 3.6;
const HEIGHT = 10.4;
const STANDOFF = 2;
const PITCH = 3.8; // between leads at the body
const SYMBOLS = ['+', '~', '~', '−'];
const GAPS = [[1, 2, 1], [2, 1, 2]];

export default {
  id: 'kbp',
  pinCount: 4,

  // Four holes in one row, neighbours one or two holes apart.
  validate(pos, part) {
    const steps = pos.slice(1).map((p, i) => sub(p, pos[i]));
    const dir = normalize(steps[0]);
    const ok = steps.every((s) => [P, 2 * P].some((g) => Math.abs(length(s) - g) < 0.05) && dot(normalize(s), dir) > 0.999);
    return ok ? [] : [{ severity: 'warning', code: 'BRIDGE_SHAPE', params: { part: part.id } }];
  },

  // Every spot along a row, both spacings, both ways round.
  footprints(board) {
    const out = [];
    for (const row of board.spec.rows) {
      for (let c = 1; c <= board.spec.columns; c++) {
        for (const gaps of GAPS) {
          for (const sign of [1, -1]) {
            const cols = [c];
            for (const g of gaps) cols.push(cols.at(-1) + sign * g);
            if (cols.every((k) => k >= 1 && k <= board.spec.columns)) out.push(cols.map((k) => `${row.id}${k}`));
          }
        }
      }
    }
    return out;
  },

  build({ pins, params }) {
    const dir = normalize(withZ(sub(pins[3], pins[0]), 0));
    const front = scale(cross(Z, dir), -1);
    const centre = withZ(scale(pins.reduce((s, p) => add(s, p), { x: 0, y: 0, z: 0 }), 1 / 4), STANDOFF);
    // Outline seen from the front, with the bevel over pin 1.
    const w = WIDTH / 2;
    const body = prism({
      profile: [[-w, 0], [w, 0], [w, HEIGHT], [-w + 2.2, HEIGHT], [-w, HEIGHT - 2.2]],
      origin: add(centre, scale(front, -THICK / 2)),
      u: dir,
      w: front,
      height: THICK,
      color: MATERIALS.epoxyBlack,
      outline: true,
    });
    // prism builds in the plane (u, v = w × u): with w towards the front, v is up.
    const face = (along, z) => add(add(withZ(centre, STANDOFF + z), scale(dir, along)), scale(front, THICK / 2 + 0.01));
    if (params.marking) body.decals.push(textDecal({ text: params.marking, at: face(0, HEIGHT * 0.62), right: dir, down: scale(Z, -1), size: 1.5, color: MATERIALS.print, weight: 700 }));
    SYMBOLS.forEach((sym, i) => body.decals.push(textDecal({ text: sym, at: face((i - 1.5) * PITCH, HEIGHT * 0.25), right: dir, down: scale(Z, -1), size: 1.8, color: MATERIALS.print, weight: 700 })));
    const leads = pins.flatMap((p, i) => {
      const foot = add(centre, scale(dir, (i - 1.5) * PITCH));
      return lead([withZ(p, 0), withZ(p, 0.8), withZ(foot, STANDOFF)], { radius: 0.4, color: MATERIALS.tinned });
    });
    return { primitives: [body, ...leads], body: [body], anchor: withZ(centre, STANDOFF + HEIGHT) };
  },
};
