// Orthographic camera. With the default elevation it is a true isometric view.
//
// The camera sits at `azimuth` degrees around the board and looks down at `elevation`
// degrees. Everything is computed from three vectors in world space:
//   right   (R): screen +x
//   up      (U): screen up (SVG y grows downwards, so screen y = -p·U)
//   forward (F): from the camera into the scene; p·F is the depth (bigger = farther)
// Because the projection is linear, the same geometry renders from any view: only the
// camera changes, never the parts.

import { v3, dot, normalize, combine, Z } from './vec.js';

const DEG = Math.PI / 180;

export const ISO_ELEVATION = Math.atan(Math.SQRT1_2) / DEG; // 35.264°

// Named views. `front` looks from the front-right corner (the side of row j and the
// bottom rails), `back` from the opposite corner.
export const VIEWS = {
  front: { azimuth: -45 },
  back: { azimuth: 135 },
  'front-left': { azimuth: 45 },
  'back-right': { azimuth: -135 },
};

export function createCamera({ view = 'front', azimuth, elevation = ISO_ELEVATION, scale = 5 } = {}) {
  const preset = VIEWS[view];
  if (azimuth === undefined) {
    if (!preset) throw new Error(`Unknown view "${view}". Use one of: ${Object.keys(VIEWS).join(', ')}`);
    azimuth = preset.azimuth;
  }
  const a = azimuth * DEG;
  const e = elevation * DEG;
  const sa = Math.sin(a);
  const ca = Math.cos(a);
  const se = Math.sin(e);
  const ce = Math.cos(e);

  const right = v3(ca, -sa, 0);
  const forward = v3(sa * ce, ca * ce, -se);
  const up = v3(sa * se, ca * se, ce);
  const toViewer = v3(-forward.x, -forward.y, -forward.z);

  // Key light from the upper left of the picture, slightly towards the viewer.
  const light = normalize(combine([right, -0.45], [Z, 0.8], [toViewer, 0.45]));

  return {
    azimuth,
    elevation,
    scale,
    right,
    up,
    forward,
    toViewer,
    light,
    project(p) {
      return { x: dot(p, right) * scale, y: -dot(p, up) * scale, depth: dot(p, forward) };
    },
    // Screen image of a direction (no translation). Used to lay text and flat marks
    // onto a 3D plane with an SVG matrix.
    projectDir(d) {
      return { x: dot(d, right) * scale, y: -dot(d, up) * scale };
    },
    // min: how squarely it must face the viewer (cosine), for marks repeated around a part.
    faces(normal, min = 1e-6) {
      return dot(normal, toViewer) > min;
    },
  };
}
