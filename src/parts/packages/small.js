// Small parts standing on two or more leads: the epoxy bead of an NTC thermistor, a
// photoresistor (LDR), a passive buzzer, and a row of header pins.
//
//   bead     params: color (default black epoxy)
//   ldr      params: none (orange cadmium-sulphide track on a white ceramic disc)
//   buzzer   params: none (12 mm round body, sound hole on top)
//   header   params: count; placed by "pin1" (the other pins follow along the row)

import { add, sub, scale, cross, normalize, Z } from '../../core/vec.js';
import { box, lathe, rectDecal, circleDecal, midpoint } from '../../geometry/primitives.js';
import { MATERIALS } from '../colors.js';
import { lead, directionBetween, withZ } from './common.js';

const P = 2.54;

export const bead = {
  id: 'bead',
  pinCount: 2,
  span: () => ({ min: P * 0.99, max: 2 * P * 1.01 }),

  build({ pins: [a, b], params }) {
    const { color = MATERIALS.epoxyBlack } = params;
    const dir = directionBetween(a, b);
    const base = withZ(midpoint(a, b), 5);
    // A drop: wider low down, rounded on top, with a short neck where the leads go in.
    const profile = [[0, 0], [0.9, 0], [1.6, 0.8], [1.75, 1.6], [1.5, 2.6], [0.9, 3.2], [0, 3.4]];
    const body = lathe({ profile, origin: base, axis: Z, ref: dir, segments: 16, color });
    const leads = [...lead([withZ(a, 0), withZ(a, 2.5), add(base, scale(dir, -0.45))], { radius: 0.22 }), ...lead([withZ(b, 0), withZ(b, 2.5), add(base, scale(dir, 0.45))], { radius: 0.22 })];
    return { primitives: [body, ...leads], body: [body], anchor: withZ(base, 5 + 3.4) };
  },
};

export const ldr = {
  id: 'ldr',
  pinCount: 2,
  span: () => ({ min: P * 0.99, max: 3 * P * 1.01 }),

  build({ pins: [a, b] }) {
    const dir = directionBetween(a, b);
    const across = cross(Z, dir);
    const base = withZ(midpoint(a, b), 4);
    const R = 2.6;
    const H = 2.1;
    const body = lathe({ profile: [[0, 0], [R - 0.3, 0], [R, 0.3], [R, H - 0.3], [R - 0.3, H], [0, H]], origin: base, axis: Z, ref: dir, segments: 20, color: MATERIALS.ldrBody });
    // The zig-zag track of light-sensitive cadmium sulphide, between two comb electrodes.
    const top = withZ(base, 4 + H + 0.01);
    for (let i = -2; i <= 2; i++) body.decals.push(rectDecal({ center: add(top, scale(across, i * 0.75)), u: dir, v: across, width: 3.2, height: 0.32, color: MATERIALS.ldrTrack }));
    for (const k of [-1, 1]) body.decals.push(rectDecal({ center: add(top, scale(dir, k * 1.75)), u: dir, v: across, width: 0.35, height: 3.4, color: MATERIALS.ldrTrack }));
    const leads = [...lead([withZ(a, 0), withZ(a, 1.5), add(base, scale(dir, -1.7))], { radius: 0.22 }), ...lead([withZ(b, 0), withZ(b, 1.5), add(base, scale(dir, 1.7))], { radius: 0.22 })];
    return { primitives: [body, ...leads], body: [body], anchor: withZ(base, 4 + H) };
  },
};

export const buzzer = {
  id: 'buzzer',
  pinCount: 2,
  span: () => ({ min: 2 * P * 0.99, max: 3 * P * 1.01 }),

  build({ pins: [a, b] }) {
    const dir = directionBetween(a, b);
    const base = withZ(midpoint(a, b), 0.5);
    const R = 6;
    const H = 8.5;
    const body = lathe({ profile: [[0, 0], [R - 0.4, 0], [R, 0.4], [R, H - 0.6], [R - 0.6, H], [0, H]], origin: base, axis: Z, ref: dir, segments: 28, color: MATERIALS.buzzer });
    const top = withZ(base, 0.5 + H + 0.01);
    body.decals.push(circleDecal({ center: top, u: dir, v: cross(Z, dir), radius: 1.1, color: '#0d0d0f' }));
    body.decals.push(circleDecal({ center: add(top, scale(dir, -3.4)), u: dir, v: cross(Z, dir), radius: 0.9, color: '#3a3a3f' }));
    const leads = [a, b].flatMap((p) => lead([withZ(p, 0), withZ(p, 0.5)], { radius: 0.3, color: MATERIALS.tinned }));
    return { primitives: [body, ...leads], body: [body], anchor: withZ(base, 0.5 + H) };
  },
};

// Hole names for `count` pins in a row from pin1, towards higher columns.
export function headerHoles(board, pin1, count) {
  const hole = board.find(String(pin1));
  if (!hole || !(count >= 1)) return null;
  const names = [];
  for (let i = 0; i < count; i++) {
    const name = `${hole.row}${hole.col + i}`;
    if (!board.find(name)) return null;
    names.push(name);
  }
  return names;
}

export const header = {
  id: 'header',
  pinCount: null, // from params.count
  inline: { pitch: 1 },

  expandPin1(board, pin1, params) {
    return headerHoles(board, pin1, params.count);
  },

  build({ pins }) {
    const n = pins.length;
    const dir = n > 1 ? normalize(withZ(sub(pins[n - 1], pins[0]), 0)) : directionBetween(pins[0], pins[0]);
    const centre = withZ(scale(pins.reduce((s, p) => add(s, p), { x: 0, y: 0, z: 0 }), 1 / n), 0);
    const strip = box({ center: centre, u: dir, size: [n * P, P, 2.5], color: MATERIALS.chip, outline: true });
    const posts = pins.map((p) => box({ center: withZ(p, 2.5), u: dir, size: [0.64, 0.64, 6], color: MATERIALS.brass, outline: false }));
    return { primitives: [strip, ...posts], body: [strip, ...posts], anchor: withZ(centre, 8.5) };
  },
};
