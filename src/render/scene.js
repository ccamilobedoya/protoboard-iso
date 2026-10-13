// Builds the scene: a display list of everything that will be drawn, in screen
// coordinates, in painting order, and tagged with the part it belongs to. The SVG writer
// (svg.js), the inspector (../inspect.js) and the annotation layers (../annotate.js) all
// read this same list, so what is measured is exactly what is drawn.
//
// Painter's algorithm: drop the faces that look away from the camera, then paint from the
// farthest to the nearest.
//   base:   primitives painted first, in order (the breadboard)
//   items:  primitives sorted by depth (parts, leads, wires); primitive.part = part id
//   labels: [{ x, y, text, part }] anchors in screen space, laid out as callouts
//
// Op kinds: polygon { pts, fill, stroke, strokeWidth, opacity }, text { text, size, matrix
// | x/y, box, px }, line, circle, rect. Each op may carry `part`.

import { shade, darker } from './shading.js';

export function createBounds() {
  const b = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  b.add = (x, y) => {
    if (x < b.minX) b.minX = x;
    if (y < b.minY) b.minY = y;
    if (x > b.maxX) b.maxX = x;
    if (y > b.maxY) b.maxY = y;
  };
  b.addBox = (box) => {
    b.add(box.x, box.y);
    b.add(box.x + box.width, box.y + box.height);
  };
  b.empty = () => !Number.isFinite(b.minX);
  return b;
}

function centroidDepth(primitive, camera) {
  let sum = 0;
  let count = 0;
  for (const face of primitive.faces) {
    for (const p of face.pts) {
      sum += camera.project(p).depth;
      count++;
    }
  }
  return count ? sum / count : 0;
}

// Screen box of a text drawn with an SVG matrix (local units: font units).
function textBox(text, size, anchor, m) {
  const w = String(text).length * size * 0.56;
  const x0 = anchor === 'end' ? -w : anchor === 'start' ? 0 : -w / 2;
  const corners = [
    [x0, -size / 2],
    [x0 + w, -size / 2],
    [x0 + w, size / 2],
    [x0, size / 2],
  ].map(([u, v]) => ({ x: m[0] * u + m[2] * v + m[4], y: m[1] * u + m[3] * v + m[5] }));
  const xs = corners.map((c) => c.x);
  const ys = corners.map((c) => c.y);
  return { x: Math.min(...xs), y: Math.min(...ys), width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) };
}

function paintPrimitive(primitive, camera, bounds, out) {
  const part = primitive.part;
  const visible = [];
  for (const face of primitive.faces) {
    if (!camera.faces(face.normal)) continue;
    const pts = face.pts.map((p) => camera.project(p));
    const depth = pts.reduce((s, p) => s + p.depth, 0) / pts.length;
    visible.push({ face, pts, depth });
  }
  visible.sort((a, b) => b.depth - a.depth);

  for (const { face, pts } of visible) {
    const fill = shade(face.color, face.normal, camera);
    for (const p of pts) bounds.add(p.x, p.y);
    out.push({
      kind: 'polygon',
      pts,
      fill,
      stroke: primitive.outline ? darker(fill, 0.35) : fill,
      strokeWidth: primitive.outline ? 0.6 : 0.35,
      opacity: face.opacity !== undefined && face.opacity < 1 ? face.opacity : undefined,
      part,
    });
  }

  for (const decal of primitive.decals ?? []) {
    if (!camera.faces(decal.normal)) continue;
    if (decal.kind === 'polygon') {
      out.push({
        kind: 'polygon',
        pts: decal.pts.map((p) => camera.project(p)),
        fill: shade(decal.color, decal.normal, camera),
        opacity: decal.opacity,
        part,
        role: decal.role,
      });
    } else if (decal.kind === 'text') {
      const o = camera.project(decal.at);
      const r = camera.projectDir(decal.right);
      const d = camera.projectDir(decal.down);
      const matrix = [r.x, r.y, d.x, d.y, o.x, o.y];
      const box = textBox(decal.text, decal.size, decal.anchor, matrix);
      bounds.addBox(box);
      out.push({
        kind: 'text',
        text: String(decal.text),
        size: decal.size,
        weight: decal.weight,
        anchor: decal.anchor,
        fill: decal.color,
        matrix,
        box,
        px: decal.size * Math.hypot(d.x, d.y), // on-screen letter height
        part,
        role: decal.role,
      });
    }
  }
}

// Labels are callouts in rows above the highest part, so the text never covers a
// component; a thin leader line joins each label to its part. They are packed left to
// right by the x of their part; one that would drift too far moves to the next row up.
const LABEL_GAP = 8; // between labels in a row, px
const ROW_GAP = 5; // between rows, px
const CLEARANCE = 22; // between the highest part and the first row, px

// `obstacles` are screen boxes labels must not cover (the printed rail labels).
function layoutLabels(labels, top, obstacles = []) {
  const rowsRight = [];
  const placed = [];
  for (const label of [...labels].sort((a, b) => a.x - b.x)) {
    const size = label.size ?? 11;
    const width = label.text.length * size * 0.58 + 12;
    const height = size + 9;
    const wanted = label.x - width / 2;
    const rowY = (r) => top - CLEARANCE - height - r * (height + ROW_GAP);
    let row = 0;
    let x = wanted;
    for (; row < 8; row++) {
      x = Math.max(wanted, (rowsRight[row] ?? -Infinity) + LABEL_GAP);
      const y = rowY(row);
      for (let guard = 0; guard < obstacles.length; guard++) {
        const hit = obstacles.find((o) => x < o.x + o.width + 3 && o.x - 3 < x + width && y < o.y + o.height + 3 && o.y - 3 < y + height);
        if (!hit) break;
        x = hit.x + hit.width + LABEL_GAP;
      }
      if (x - wanted <= width * 0.9) break;
    }
    rowsRight[row] = x + width;
    const y = rowY(row);
    placed.push({ x, y, width, height, row, size, anchor: { x: label.x, y: label.y }, text: label.text, part: label.part });
  }
  return placed;
}

// fit: 'board' frames the whole board; 'parts' frames only the parts and their labels.
export function buildScene({ camera, base = [], items = [], labels = [], margin = 24, fit = 'board' }) {
  const bounds = createBounds();
  const focus = createBounds();
  const layers = { board: [], parts: [], labels: [], annotations: [] };

  for (const primitive of base) paintPrimitive(primitive, camera, bounds, layers.board);
  const sorted = items.map((p) => ({ p, depth: centroidDepth(p, camera) })).sort((a, b) => b.depth - a.depth);
  for (const { p } of sorted) paintPrimitive(p, camera, focus, layers.parts);

  const top = focus.empty() ? bounds.minY : focus.minY;
  const obstacles = layers.board.filter((op) => op.kind === 'text' && op.role === 'net-label').map((op) => op.box);
  const callouts = layoutLabels(labels, top, obstacles);
  for (const c of callouts) {
    focus.add(c.anchor.x, c.anchor.y);
    layers.labels.push({ kind: 'line', x1: c.x + c.width / 2, y1: c.y + c.height, x2: c.anchor.x, y2: c.anchor.y, stroke: '#7b8794', strokeWidth: 0.8, part: c.part, role: 'leader' });
    layers.labels.push({ kind: 'circle', cx: c.anchor.x, cy: c.anchor.y, r: 2, fill: '#52606d', stroke: '#ffffff', strokeWidth: 0.8, part: c.part, role: 'leader' });
  }
  for (const c of callouts) {
    focus.addBox(c);
    layers.labels.push({ kind: 'rect', x: c.x, y: c.y, width: c.width, height: c.height, rx: 4, fill: '#ffffff', stroke: '#52606d', strokeWidth: 0.8, part: c.part, role: 'label' });
    layers.labels.push({ kind: 'text', text: c.text, size: c.size, x: c.x + c.width / 2, y: c.y + c.height / 2, anchor: 'middle', fill: '#1f2933', px: c.size, part: c.part, role: 'label' });
  }

  const framed = fit === 'parts' && !focus.empty() ? focus : bounds;
  if (framed === bounds && !focus.empty()) {
    bounds.add(focus.minX, focus.minY);
    bounds.add(focus.maxX, focus.maxY);
  }
  const pad = fit === 'parts' ? margin * 2 : margin;
  const frame = {
    x: Math.floor(framed.minX - pad),
    y: Math.floor(framed.minY - pad),
    width: Math.ceil(framed.maxX - framed.minX + pad * 2),
    height: Math.ceil(framed.maxY - framed.minY + pad * 2),
  };
  return { camera, frame, layers, callouts };
}
