// Geometric building blocks. Every part on the board is assembled from these.
//
// A primitive is a convex (or nearly convex) solid:
//   { faces: [{ pts: [v3…], normal: v3, color, opacity? }], decals: [...], outline? }
// Faces carry their outward normal so the renderer can drop the ones facing away
// (back-face culling) and shade the rest. Decals are flat marks and text laid on a
// face; they are drawn right after the faces of their own primitive.
//
// All sizes are millimetres in world space.

import { v3, add, sub, scale, cross, normalize, dot, length, combine, basisFromAxis, Z } from '../core/vec.js';

const TAU = Math.PI * 2;

function signedArea(profile) {
  let area = 0;
  for (let i = 0; i < profile.length; i++) {
    const [x1, y1] = profile[i];
    const [x2, y2] = profile[(i + 1) % profile.length];
    area += x1 * y2 - x2 * y1;
  }
  return area / 2;
}

// Extrudes a convex 2D profile along w.
//   profile: [[pu, pv], …] in millimetres, in the plane spanned by u and v
//   origin:  world position of the profile's (0, 0) at the bottom of the extrusion
//   u, w:    world directions; v = w × u completes the basis
export function prism({ profile, origin, u, w = Z, height, color, colors = {}, outline, opacity }) {
  const { u: bu, v: bv, w: bw } = basisFromAxis(w, u);
  const ring = signedArea(profile) < 0 ? [...profile].reverse() : profile;
  const at = (pu, pv, h) => combine([origin, 1], [bu, pu], [bv, pv], [bw, h]);
  const bottom = ring.map(([pu, pv]) => at(pu, pv, 0));
  const top = ring.map(([pu, pv]) => at(pu, pv, height));
  const faces = [];
  for (let i = 0; i < ring.length; i++) {
    const j = (i + 1) % ring.length;
    const normal = normalize(cross(sub(bottom[j], bottom[i]), bw));
    faces.push({ pts: [bottom[i], bottom[j], top[j], top[i]], normal, color: colors.side ?? color, opacity });
  }
  faces.push({ pts: [...top], normal: bw, color: colors.top ?? color, opacity });
  faces.push({ pts: [...bottom].reverse(), normal: scale(bw, -1), color: colors.bottom ?? color, opacity });
  return { faces, decals: [], outline, basis: { u: bu, v: bv, w: bw }, at };
}

// Axis-aligned box helper built on prism: centred on `center` in u and v, from
// `center` upwards along w.
export function box({ center, u, w = Z, size: [su, sv, sw], ...rest }) {
  const hu = su / 2;
  const hv = sv / 2;
  return prism({
    profile: [[-hu, -hv], [hu, -hv], [hu, hv], [-hu, hv]],
    origin: center,
    u,
    w,
    height: sw,
    ...rest,
  });
}

// Inserts profile points at the given heights so colour bands get their own faces.
function splitProfile(profile, cuts) {
  if (!cuts.length) return profile;
  const out = [profile[0]];
  for (let i = 1; i < profile.length; i++) {
    const [r1, h1] = profile[i - 1];
    const [r2, h2] = profile[i];
    const lo = Math.min(h1, h2);
    const hi = Math.max(h1, h2);
    const inside = cuts.filter((h) => h > lo + 1e-6 && h < hi - 1e-6).sort((a, b) => (h2 > h1 ? a - b : b - a));
    for (const h of inside) {
      const t = (h - h1) / (h2 - h1);
      out.push([r1 + (r2 - r1) * t, h]);
    }
    out.push(profile[i]);
  }
  return out;
}

// Surface of revolution (Anatomy calls it a lathe).
//   profile: [[r, h], …] going from the bottom of the axis, outwards, up the side and
//            back to the axis at the top. r = radius, h = height along the axis.
//   axis:    world direction of the axis; origin is where h = 0
//   ref:     world direction where angle 0 lies (for marks such as a capacitor stripe)
//   colorAt: optional ({ h, angle, cap }) → colour, angle in degrees from ref
//   cuts:    extra heights where the surface must be split (colour band edges)
export function lathe({ profile, origin, axis = Z, ref, segments = 24, color, colorAt, cuts = [], opacity }) {
  const { u, v, w } = basisFromAxis(axis, ref);
  const rows = splitProfile(profile, cuts);
  const ringPoint = (r, h, k) => {
    const theta = (k / segments) * TAU;
    return combine([origin, 1], [w, h], [u, r * Math.cos(theta)], [v, r * Math.sin(theta)]);
  };
  const faces = [];
  const paint = (h, angle, cap) => (colorAt ? colorAt({ h, angle, cap }) ?? color : color);

  for (let i = 0; i + 1 < rows.length; i++) {
    const [r1, h1] = rows[i];
    const [r2, h2] = rows[i + 1];
    const dr = r2 - r1;
    const dh = h2 - h1;
    if (Math.abs(dr) < 1e-9 && Math.abs(dh) < 1e-9) continue;
    const len = Math.hypot(dr, dh);
    const nr = dh / len;
    const nh = -dr / len;
    const flatCap = Math.abs(dh) < 1e-9 && (r1 < 1e-9 || r2 < 1e-9);
    if (flatCap) {
      const r = Math.max(r1, r2);
      const pts = [];
      for (let k = 0; k < segments; k++) pts.push(ringPoint(r, h1, k));
      faces.push({ pts, normal: scale(w, Math.sign(nh)), color: paint(h1, 0, true), opacity });
      continue;
    }
    for (let k = 0; k < segments; k++) {
      const mid = ((k + 0.5) / segments) * TAU;
      const radial = combine([u, Math.cos(mid)], [v, Math.sin(mid)]);
      const normal = normalize(combine([radial, nr], [w, nh]));
      const pts = [ringPoint(r1, h1, k), ringPoint(r1, h1, k + 1), ringPoint(r2, h2, k + 1), ringPoint(r2, h2, k)];
      const unique = pts.filter((p, idx) => idx === 0 || length(sub(p, pts[idx - 1])) > 1e-9);
      const angle = ((mid / TAU) * 360 + 360) % 360;
      faces.push({ pts: unique, normal, color: paint((h1 + h2) / 2, angle, false), opacity });
    }
  }
  return { faces, decals: [], basis: { u, v, w } };
}

// A round rod with flat ends between two points.
/** @public a primitive for packages, like the others in this file */
export function cylinder({ from, to, radius, segments = 12, ...rest }) {
  const axis = sub(to, from);
  const h = length(axis);
  return lathe({ profile: [[0, 0], [radius, 0], [radius, h], [0, h]], origin: from, axis, segments, ...rest });
}

// A wire or a component lead following a polyline. Each segment is its own primitive so
// the painter can sort it against the parts around it.
//   caps: 'all' closes every segment (good for thin leads with sharp bends),
//         'ends' only the first and last (smooth for jumper wire arcs).
export function tube({ points, radius, color, segments = 8, caps = 'all', opacity }) {
  const out = [];
  for (let i = 0; i + 1 < points.length; i++) {
    const from = points[i];
    const to = points[i + 1];
    const h = length(sub(to, from));
    if (h < 1e-6) continue;
    const startCap = caps === 'all' || i === 0;
    const endCap = caps === 'all' || i + 2 === points.length;
    const profile = [
      ...(startCap ? [[0, 0]] : []),
      [radius, 0],
      [radius, h],
      ...(endCap ? [[0, h]] : []),
    ];
    out.push(lathe({ profile, origin: from, axis: sub(to, from), segments, color, opacity }));
  }
  return out;
}

// Flat polygon decal lying on a face. `normal` decides when it is visible.
export function polygonDecal({ pts, normal, color, opacity }) {
  return { kind: 'polygon', pts, normal, color, opacity };
}

// Circle decal: centre, plane axes (unit vectors) and radius.
export function circleDecal({ center, u, v, radius, color, segments = 20 }) {
  const pts = [];
  for (let k = 0; k < segments; k++) {
    const t = (k / segments) * TAU;
    pts.push(combine([center, 1], [u, radius * Math.cos(t)], [v, radius * Math.sin(t)]));
  }
  return { kind: 'polygon', pts, normal: normalize(cross(u, v)), color };
}

// Rectangle decal centred on `center`, sides along u and v.
export function rectDecal({ center, u, v, width, height, color, opacity }) {
  const hu = scale(normalize(u), width / 2);
  const hv = scale(normalize(v), height / 2);
  const pts = [
    combine([center, 1], [hu, -1], [hv, -1]),
    combine([center, 1], [hu, 1], [hv, -1]),
    combine([center, 1], [hu, 1], [hv, 1]),
    combine([center, 1], [hu, -1], [hv, 1]),
  ];
  return { kind: 'polygon', pts, normal: normalize(cross(u, v)), color, opacity };
}

// Text printed on a plane. `right` is the reading direction and `down` points from the
// top of the letters to their bottom, both unit vectors on the plane. The text is
// visible from the side the face looks at: normal = down × right.
export function textDecal({ text, at, right, down, size, color, anchor = 'middle', weight = 400 }) {
  return { kind: 'text', text, at, right, down, size, color, anchor, weight, normal: normalize(cross(down, right)) };
}

export const midpoint = (a, b) => scale(add(a, b), 0.5);
/** @public helpers for packages */
export const horizontal = (d) => normalize(v3(d.x, d.y, 0));
/** @public */
export { dot };
