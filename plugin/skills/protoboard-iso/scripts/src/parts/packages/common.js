// Helpers shared by the packages.

import { withZ, normalize, sub, length, X } from '../../core/vec.js';
import { tube } from '../../geometry/primitives.js';
import { MATERIALS } from '../colors.js';

// A component lead: a thin tinned wire through the given points.
export function lead(points, { radius = 0.3, color = MATERIALS.lead } = {}) {
  return tube({ points, radius, color, segments: 6, caps: 'all' });
}

// Horizontal direction from hole a to hole b (x axis if they coincide).
export function directionBetween(a, b) {
  const d = sub(withZ(b, 0), withZ(a, 0));
  return length(d) > 1e-9 ? normalize(d) : X;
}

export { withZ };
