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
    // `along`: where a piece is from a (0) to b (1), so a page can draw the wire end to end (a
    // timeline's assemble, M5).
    const tips = [a, b].flatMap((p, k) => lead([withZ(p, 0), withZ(p, tipHeight)], { radius: 0.32, color: MATERIALS.tinned }).map((x) => ({ ...x, along: k })));

    let path;
    let middle;
    if (style === 'flat') {
      path = [withZ(a, FLAT_HEIGHT), withZ(b, FLAT_HEIGHT)];
      middle = withZ(lerp(a, b, 0.5), FLAT_HEIGHT);
    } else {
      const h = params.height ?? Math.min(18, Math.max(3, span * 0.3));
      const steps = Math.max(8, Math.min(24, Math.round(span / 3)));
      const at = (t) => withZ(lerp(a, b, (1 - Math.cos(Math.PI * t)) / 2), TIP + h * Math.sin(Math.PI * t)); // vertical at both ends
      path = [];
      for (let i = 0; i <= steps; i++) path.push(at(i / steps));
      middle = at(0.5);
    }
    const insulation = tube({ points: path, radius: 0.7, color, segments: 10, caps: 'ends' }).map((x, i, all) => ({ ...x, along: (i + 0.5) / all.length }));
    const peak = path.reduce((best, p) => (p.z > best.z ? p : best), path[0]);
    // Current runs along the centre of the wire, from each end to its middle (src/sim/paths.js);
    // a wire has no body, so every point is conductor.
    const t = (i) => i / (path.length - 1);
    const paths = [
      [withZ(a, 0), ...path.filter((p, i) => t(i) < 0.5), middle],
      [withZ(b, 0), ...path.filter((p, i) => t(i) > 0.5).reverse(), middle],
    ].map((points) => ({ points, body: points.length - 1 }));
    return { primitives: [...insulation, ...tips], body: [], anchor: peak, paths };
  },
};
