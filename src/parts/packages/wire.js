// Jumper wire between two holes.
//   style 'arc'  flexible jumper that loops over the board (default)
//   style 'flat' pre-cut jumper lying flat on the board
//
// params: color, style, height (arc height in mm; default from the span)

import { lerp, distance, withZ } from '../../core/vec.js';
import { tube } from '../../geometry/primitives.js';
import { MATERIALS } from '../colors.js';
import { lead } from './common.js';

const TIP = 1.5; // bare metal visible above the hole, mm
const FLAT_HEIGHT = 0.8; // axis height of a flat jumper

export default {
  id: 'wire',
  pinCount: 2,
  span: () => ({ min: 0.1, max: 400 }),

  build({ pins: [a, b], params }) {
    const { color, style = 'arc' } = params;
    const span = distance(a, b);
    const tipHeight = style === 'flat' ? FLAT_HEIGHT : TIP;
    const tips = [a, b].flatMap((p) => lead([withZ(p, 0), withZ(p, tipHeight)], { radius: 0.32, color: MATERIALS.tinned }));

    let path;
    if (style === 'flat') {
      path = [withZ(a, FLAT_HEIGHT), withZ(b, FLAT_HEIGHT)];
    } else {
      const h = params.height ?? Math.min(18, Math.max(3, span * 0.3));
      const steps = Math.max(8, Math.min(24, Math.round(span / 3)));
      path = [];
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const s = (1 - Math.cos(Math.PI * t)) / 2; // vertical at both ends
        const p = lerp(a, b, s);
        path.push(withZ(p, TIP + h * Math.sin(Math.PI * t)));
      }
    }
    const insulation = tube({ points: path, radius: 0.7, color, segments: 10, caps: 'ends' });
    const peak = path.reduce((best, p) => (p.z > best.z ? p : best), path[0]);
    return { primitives: [...insulation, ...tips], body: [], anchor: peak };
  },
};
