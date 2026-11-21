// What a place hides, measured while layout places a part or a jumper (src/layout.js).
//
// The review blocks a part hidden in every view it looks from (PART_HIDDEN in front and back,
// under 70 % visible: review.js). Layout used to learn that only after a whole try (every part,
// every jumper, the review's two drawings), and then moved one place per try: a large circuit spent
// all its tries on it. So each place is measured as it is chosen, the way the inspector measures a
// drawing (src/inspect.js: the parts painted far to near, each pixel owned by the last part painted
// there, a part's visible share = the pixels it owns over the pixels it paints), but only for the
// part, the parts it overlaps on screen and what is over those, in a frame around them, at a small
// scale, with no colours: a few milliseconds where the drawing takes a second.
//
// Measured against the inspector on a circuit of ten LEDs with their resistors and fifteen jumpers:
// every part's best view within 3 points.

import { createCamera } from './core/camera.js';

const SEEN_SHARE = 0.75; // the review blocks under 70 % in every view; jumpers come later and cover a little more
const SCALE = 2; // px per mm (the drawings use 5)
const VIEWS = ['front', 'back'];
const cameras = Object.fromEntries(VIEWS.map((v) => [v, createCamera({ view: v, scale: SCALE })]));

// The box of all a built part draws (body, leads, its wire), in mm.
const reachBoxes = new WeakMap();
export function reachOf(part) {
  if (!reachBoxes.has(part)) {
    const box = { x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity, z0: Infinity, z1: -Infinity };
    const grow = (q) => {
      box.x0 = Math.min(box.x0, q.x);
      box.x1 = Math.max(box.x1, q.x);
      box.y0 = Math.min(box.y0, q.y);
      box.y1 = Math.max(box.y1, q.y);
      box.z0 = Math.min(box.z0, q.z);
      box.z1 = Math.max(box.z1, q.z);
    };
    for (const list of [part.built?.primitives, part.built?.body]) for (const prim of list ?? []) for (const f of prim.faces) for (const q of f.pts) grow(q);
    for (const path of Array.isArray(part.built?.paths) ? part.built.paths : []) for (const q of path.points ?? []) grow(q);
    for (const h of part.holes ?? []) if (h) grow(h.pos);
    reachBoxes.set(part, box);
  }
  return reachBoxes.get(part);
}

// A built part as each view draws it: its screen box, and its primitives' faces that face the
// camera, projected, with each primitive's mean depth (the painter's order, as render/scene.js).
const drawn = new WeakMap();
function drawingOf(part, view) {
  if (!drawn.has(part)) drawn.set(part, {});
  const cache = drawn.get(part);
  if (!cache[view]) {
    const camera = cameras[view];
    const prims = [];
    const box = { x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity };
    for (const prim of part.built?.primitives ?? []) {
      let sum = 0;
      let count = 0;
      const faces = [];
      for (const face of prim.faces) {
        const pts = face.pts.map((p) => camera.project(p));
        for (const p of pts) {
          sum += p.depth;
          count++;
        }
        if (!camera.faces(face.normal)) continue;
        for (const p of pts) {
          box.x0 = Math.min(box.x0, p.x);
          box.x1 = Math.max(box.x1, p.x);
          box.y0 = Math.min(box.y0, p.y);
          box.y1 = Math.max(box.y1, p.y);
        }
        faces.push({ pts, depth: pts.reduce((t, q) => t + q.depth, 0) / pts.length });
      }
      // Far to near inside the primitive, as render/scene.js paints its faces.
      if (faces.length) prims.push({ depth: count ? sum / count : 0, faces: faces.sort((a, b) => b.depth - a.depth).map((f) => f.pts) });
    }
    cache[view] = { prims, box };
  }
  return cache[view];
}

const meet = (a, b) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;

// Scanline fill of a polygon at cell centres (even-odd), as render/coverage.js. A frame's origin is
// whole cells, so a polygon's runs of cells are the same in every frame, moved: they are found once
// per polygon on the whole grid (rows and columns of cell centres) and cut to each frame.
const runsOf = new WeakMap();
function runs(pts) {
  let out = runsOf.get(pts);
  if (out) return out;
  out = [];
  let minY = Infinity;
  let maxY = -Infinity;
  for (const p of pts) {
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
  }
  const xs = [];
  for (let r = Math.ceil(minY - 0.5); r <= Math.floor(maxY - 0.5); r++) {
    const y = r + 0.5;
    xs.length = 0;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % pts.length];
      if ((a.y <= y && b.y > y) || (b.y <= y && a.y > y)) xs.push(a.x + ((y - a.y) / (b.y - a.y)) * (b.x - a.x));
    }
    xs.sort((p, q) => p - q);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const c0 = Math.ceil(xs[k] - 0.5);
      const c1 = Math.floor(xs[k + 1] - 0.5);
      if (c0 <= c1) out.push(r, c0, c1);
    }
  }
  runsOf.set(pts, out);
  return out;
}
function fill(pts, frame, visit) {
  const list = runs(pts);
  for (let k = 0; k < list.length; k += 3) {
    const r = list[k] - frame.y;
    if (r < 0 || r >= frame.rows) continue;
    const c0 = Math.max(0, list[k + 1] - frame.x);
    const c1 = Math.min(frame.cols - 1, list[k + 2] - frame.x);
    for (let c = c0; c <= c1; c++) visit(r * frame.cols + c);
  }
}

// In one view: the share of each part in `asked` it shows, with `me` drawn and without it.
function sharesIn(view, parts, me, asked) {
  const box = { x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity };
  for (const p of asked) {
    const b = drawingOf(p, view).box;
    box.x0 = Math.min(box.x0, b.x0);
    box.x1 = Math.max(box.x1, b.x1);
    box.y0 = Math.min(box.y0, b.y0);
    box.y1 = Math.max(box.y1, b.y1);
  }
  if (!Number.isFinite(box.x0)) return null;
  const frame = { x: Math.floor(box.x0) - 1, y: Math.floor(box.y0) - 1 };
  frame.cols = Math.ceil(box.x1 - frame.x) + 2;
  frame.rows = Math.ceil(box.y1 - frame.y) + 2;
  const index = new Map(parts.map((p, i) => [p, i]));
  const withMe = new Int16Array(frame.cols * frame.rows).fill(-1);
  const without = new Int16Array(frame.cols * frame.rows).fill(-1);
  const order = [];
  for (const p of parts) if (meet(drawingOf(p, view).box, box)) for (const prim of drawingOf(p, view).prims) order.push({ p, prim });
  order.sort((a, b) => b.prim.depth - a.prim.depth);
  // Each asked part's own pixels (its footprint), gathered while it is painted.
  const mine = new Map(asked.map((p) => [p, { mark: new Uint8Array(frame.cols * frame.rows), cells: [] }]));
  for (const { p, prim } of order) {
    const id = index.get(p);
    const own = mine.get(p);
    for (const pts of prim.faces) {
      fill(pts, frame, (i) => {
        withMe[i] = id;
        if (p !== me) without[i] = id;
        if (own && !own.mark[i]) {
          own.mark[i] = 1;
          own.cells.push(i);
        }
      });
    }
  }
  // How many of them it owns in each picture.
  const out = new Map();
  for (const [p, { cells }] of mine) {
    if (!cells.length) continue;
    const id = index.get(p);
    let a = 0;
    let b = 0;
    for (const i of cells) {
      if (withMe[i] === id) a++;
      if (without[i] === id) b++;
    }
    out.set(p, { now: a / cells.length, was: b / cells.length });
  }
  return out;
}

// How much placing `me` (already in `parts`) hides: how far under SEEN_SHARE it leaves itself, plus
// for each part it covers more than before and leaves under the line, how far under. 0 when nothing.
export function hiddenBy(parts, me) {
  const drawnParts = parts.filter((p) => p.built?.primitives?.length);
  if (!me?.built?.primitives?.length) return 0;
  const overlaps = (a, b) => VIEWS.some((v) => meet(drawingOf(a, v).box, drawingOf(b, v).box));
  const near = drawnParts.filter((p) => p !== me && overlaps(p, me));
  if (!near.length) return 0;
  const best = new Map(); // part → { now, was }: its best view
  for (const view of VIEWS) {
    const shares = sharesIn(view, drawnParts, me, [me, ...near]);
    for (const [p, s] of shares ?? []) {
      const b = best.get(p) ?? { now: 0, was: 0 };
      best.set(p, { now: Math.max(b.now, s.now), was: Math.max(b.was, s.was) });
    }
  }
  let damage = Math.max(0, SEEN_SHARE - (best.get(me)?.now ?? 1));
  for (const p of near) {
    const s = best.get(p);
    if (s && s.now < SEEN_SHARE && s.now < s.was - 0.01) damage += Math.min(s.was, SEEN_SHARE) - s.now;
  }
  return damage;
}
