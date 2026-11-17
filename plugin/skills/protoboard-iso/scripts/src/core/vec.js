// Small 3D vector helpers. World space is right-handed and measured in millimetres:
// x runs along the breadboard columns, y points to the back of the board, z points up.

export const v3 = (x = 0, y = 0, z = 0) => ({ x, y, z });

export const X = v3(1, 0, 0);
export const Y = v3(0, 1, 0);
export const Z = v3(0, 0, 1);

export const add = (a, b) => v3(a.x + b.x, a.y + b.y, a.z + b.z);
export const sub = (a, b) => v3(a.x - b.x, a.y - b.y, a.z - b.z);
export const scale = (a, k) => v3(a.x * k, a.y * k, a.z * k);
export const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
export const cross = (a, b) =>
  v3(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x);
export const length = (a) => Math.hypot(a.x, a.y, a.z);
export const distance = (a, b) => length(sub(a, b));
export const lerp = (a, b, t) => v3(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, a.z + (b.z - a.z) * t);
export const withZ = (a, z) => v3(a.x, a.y, z);

export function normalize(a) {
  const len = length(a);
  return len > 1e-12 ? scale(a, 1 / len) : v3(0, 0, 0);
}

// Sum of several vectors, each optionally scaled: combine([a, 1], [b, 2]) = a + 2b.
export function combine(...terms) {
  let out = v3();
  for (const [vec, k = 1] of terms) out = add(out, scale(vec, k));
  return out;
}

// Orthonormal basis (u, v, w) with w along `axis`, right-handed (u × v = w).
// `ref` is an optional direction that u should follow as closely as possible.
export function basisFromAxis(axis, ref) {
  const w = normalize(axis);
  let u;
  if (ref) u = normalize(sub(ref, scale(w, dot(ref, w))));
  if (!u || length(u) < 1e-9) {
    const helper = Math.abs(w.z) < 0.9 ? Z : X;
    u = normalize(cross(helper, w));
  }
  const v = cross(w, u);
  return { u, v, w };
}
