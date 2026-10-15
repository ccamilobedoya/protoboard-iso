// Axial package: a body lying between two leads (resistors, rectifier and signal
// diodes). The body sits centred between the two holes, just above the board.
//
// params
//   bodyLength, bodyDiameter  mm
//   shape        'resistor' (bulging ends) | 'plain' | 'box' (a cement resistor: a ceramic
//                box, bodyDiameter wide and `bodyHeight` tall, its leads out of the end centres)
//   print        text printed along the top of a 'box' body ("5W 10ΩJ")
//   color        body colour
//   bands        [{ from, to, color }] colour rings, mm measured from the pin-1 end
//   opacity      for glass bodies
//   standoff     gap between body and board, mm (default 0.8)

import { add, scale, cross, distance, Z } from '../../core/vec.js';
import { box, lathe, textDecal, midpoint } from '../../geometry/primitives.js';
import { MATERIALS } from '../colors.js';
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

// Where current flows (see src/sim/paths.js): up each lead, into the body at its end, to the
// middle of the body.
function axialPaths(a, b, zc, start, end, centre) {
  return [
    { points: [withZ(a, 0), withZ(a, zc), start, centre], body: 2 },
    { points: [withZ(b, 0), withZ(b, zc), end, centre], body: 2 },
  ];
}

// Cement resistor: the resistance wire sits in a ceramic box filled with cement, which takes
// the heat away. It lies on the board; its print reads along the top.
function cement(a, b, { bodyLength: L, bodyDiameter: W, bodyHeight: H = W, color, print, standoff = 0.5 }) {
  const dir = directionBetween(a, b);
  const zc = standoff + H / 2;
  const centre = withZ(midpoint(a, b), zc);
  const body = box({ center: withZ(centre, standoff), u: dir, size: [L, W, H], color, outline: true });
  if (print) {
    const right = dir.x + dir.y >= 0 ? dir : scale(dir, -1); // reads left to right in the front view
    body.decals.push(textDecal({ text: print, at: withZ(centre, standoff + H + 0.01), right, down: cross(right, Z), size: Math.min(2.6, (L * 0.8) / print.length / 0.56), color: MATERIALS.cementPrint, weight: 700 }));
  }
  const start = add(centre, scale(dir, -L / 2));
  const end = add(centre, scale(dir, L / 2));
  const leads = [...lead([withZ(a, 0), withZ(a, zc), start], { radius: 0.4 }), ...lead([withZ(b, 0), withZ(b, zc), end], { radius: 0.4 })];
  // The label's leader lands near one end of the top, not on the print.
  return { primitives: [body, ...leads], body: [body], anchor: add(withZ(centre, standoff + H), scale(dir, L * 0.42)), span: distance(a, b), paths: axialPaths(a, b, zc, start, end, centre) };
}

export default {
  id: 'axial',
  pinCount: 2,
  span: (params) => ({ min: params.bodyLength + 2 * BEND, max: params.bodyLength + 40 }),

  build({ pins: [a, b], params }) {
    if (params.shape === 'box') return cement(a, b, params);
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
    return { primitives: [body, ...leads], body: [body], anchor: withZ(centre, zc + R), span: distance(a, b), paths: axialPaths(a, b, zc, start, end, centre) };
  },
};
