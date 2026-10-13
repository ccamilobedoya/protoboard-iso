// Axial package: a body lying between two leads (resistors, rectifier and signal
// diodes). The body sits centred between the two holes, just above the board.
//
// params
//   bodyLength, bodyDiameter  mm
//   shape        'resistor' (bulging ends) | 'plain'
//   color        body colour
//   bands        [{ from, to, color }] colour rings, mm measured from the pin-1 end
//   opacity      for glass bodies
//   standoff     gap between body and board, mm (default 0.8)

import { add, scale, distance, Z } from '../../core/vec.js';
import { lathe, midpoint } from '../../geometry/primitives.js';
import { lead, directionBetween, withZ } from './common.js';

const BEND = 1.0; // room each lead needs to bend down next to the body, mm

function profileFor(shape, R, L) {
  if (shape === 'resistor') {
    return [
      [0, 0],
      [0.75 * R, 0],
      [R, 0.3],
      [R, 1.5],
      [0.86 * R, 1.95],
      [0.86 * R, L - 1.95],
      [R, L - 1.5],
      [R, L - 0.3],
      [0.75 * R, L],
      [0, L],
    ];
  }
  return [
    [0, 0],
    [0.85 * R, 0],
    [R, 0.25],
    [R, L - 0.25],
    [0.85 * R, L],
    [0, L],
  ];
}

export default {
  id: 'axial',
  pinCount: 2,
  span: (params) => ({ min: params.bodyLength + 2 * BEND, max: params.bodyLength + 40 }),

  build({ pins: [a, b], params }) {
    const { bodyLength: L, bodyDiameter, shape = 'plain', color, bands = [], opacity, standoff = 0.8 } = params;
    const R = bodyDiameter / 2;
    const dir = directionBetween(a, b);
    const zc = R + standoff;
    const centre = withZ(midpoint(a, b), zc);
    const start = add(centre, scale(dir, -L / 2));
    const end = add(centre, scale(dir, L / 2));

    const body = lathe({
      profile: profileFor(shape, R, L),
      origin: start,
      axis: dir,
      ref: Z,
      segments: 20,
      color,
      opacity,
      cuts: bands.flatMap((band) => [band.from, band.to]),
      colorAt: ({ h, cap }) => (cap ? null : bands.find((band) => h > band.from && h < band.to)?.color),
    });

    const leads = [...lead([withZ(a, 0), withZ(a, zc), start]), ...lead([withZ(b, 0), withZ(b, zc), end])];
    return { primitives: [body, ...leads], body: [body], anchor: withZ(centre, zc + R), span: distance(a, b) };
  },
};
