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

// A text printed flat on a surface (textDecal), as drawn from this camera: the board's print, and
// the copies of it that other layers light up (coordinates, a rail's net name in the current layer).
export function decalTextOp(camera, decal) {
  const o = camera.project(decal.at);
  const r = camera.projectDir(decal.right);
  const d = camera.projectDir(decal.down);
  const matrix = [r.x, r.y, d.x, d.y, o.x, o.y];
  return {
    kind: 'text',
    text: String(decal.text),
    size: decal.size,
    weight: decal.weight,
    anchor: decal.anchor,
    fill: decal.color,
    matrix,
    box: textBox(decal.text, decal.size, decal.anchor, matrix),
    px: decal.size * Math.hypot(d.x, d.y), // on-screen letter height
  };
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
    if (!camera.faces(decal.normal, decal.minFacing)) continue;
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
      const op = decalTextOp(camera, decal);
      bounds.addBox(op.box);
      out.push({ ...op, part, role: decal.role });
    }
  }
}

// Labels are callouts in rows above the highest part, so the text never covers a
// component. Leaders are vertical whenever possible: the label box sits right above its
// part (it spans the anchor's x), and parallel leaders never cross. A label then needs a
// row where (1) it does not overlap a label of the same row, (2) no label of a lower row
// covers its leader, and (3) it does not cover the leader of a label already placed in a
// higher row. Only when no row allows that does it fall back to a slanted leader, choosing
// the row with the fewest crossings. Printed rail labels are kept clear.
const LABEL_GAP = 8; // between labels in a row, px
const ROW_GAP = 5; // between rows, px
const CLEARANCE = 22; // between the highest part and the first row, px
const MAX_ROWS = 10;
const INSET = 7; // a vertical leader enters the box at least this far from its edge, px

function crosses(a, b) {
  const d = (p, q, r) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  const d1 = d(b.from, b.to, a.from);
  const d2 = d(b.from, b.to, a.to);
  const d3 = d(a.from, a.to, b.from);
  const d4 = d(a.from, a.to, b.to);
  return d1 * d2 < 0 && d3 * d4 < 0;
}

// `obstacles` are screen boxes labels must not cover (the printed rail labels).
// Two passes: first every label that can have a vertical leader gets one; then the rest
// take slanted leaders in the row with the fewest crossings, knowing every vertical one.
function layoutLabels(labels, top, obstacles = []) {
  const placed = [];
  const overlapsBox = (x, y, width, height, o, gap) => x < o.x + o.width + gap && o.x - gap < x + width && y < o.y + o.height + 3 && o.y - 3 < y + height;
  const measure = (label) => {
    const size = label.size ?? 11;
    return { size, width: label.text.length * size * 0.58 + 12, height: size + 9 };
  };
  const rowY = (r, height) => top - CLEARANCE - height - r * (height + ROW_GAP);
  const fits = (x, y, row, width, height) =>
    !obstacles.some((o) => overlapsBox(x, y, width, height, o, LABEL_GAP)) &&
    !placed.some((p) => p.row === row && overlapsBox(x, y, width, height, p, LABEL_GAP)) &&
    // Not covering the vertical leader of a label placed higher up.
    !placed.some((p) => p.row > row && p.vertical && p.anchor.x > x - 3 && p.anchor.x < x + width + 3);
  const crossCount = (leader) => placed.filter((p) => crosses(leader, p.leader)).length;
  const place = (label, m, c) =>
    placed.push({ x: c.x, y: c.y, width: m.width, height: m.height, row: c.row, vertical: c.vertical, leader: c.leader, size: m.size, anchor: { x: label.x, y: label.y }, text: label.text, part: label.part });

  const pending = [];
  for (const label of [...labels].sort((a, b) => a.x - b.x)) {
    const m = measure(label);
    let choice = null;
    for (let row = 0; row < MAX_ROWS && !choice; row++) {
      // No lower label may sit on this leader.
      if (placed.some((p) => p.row < row && label.x > p.x - 3 && label.x < p.x + p.width + 3)) continue;
      const y = rowY(row, m.height);
      const leader = { from: { x: label.x, y: y + m.height }, to: { x: label.x, y: label.y } };
      if (crossCount(leader)) continue;
      const centred = label.x - m.width / 2;
      for (let step = 0; step <= m.width && !choice; step += 2) {
        for (const x of step ? [centred + step, centred - step] : [centred]) {
          if (x < label.x - m.width + INSET || x > label.x - INSET || !fits(x, y, row, m.width, m.height)) continue;
          choice = { row, x, y, vertical: true, leader };
          break;
        }
      }
    }
    if (choice) place(label, m, choice);
    else pending.push(label);
  }

  for (const label of pending) {
    const m = measure(label);
    let choice = null;
    for (let row = 0; row < MAX_ROWS; row++) {
      const y = rowY(row, m.height);
      const wanted = label.x - m.width / 2;
      for (let step = 0; step <= m.width * 2; step += 4) {
        for (const x of step ? [wanted + step, wanted - step] : [wanted]) {
          if (!fits(x, y, row, m.width, m.height)) continue;
          const leader = { from: { x: x + m.width / 2, y: y + m.height }, to: { x: label.x, y: label.y } };
          const cost = crossCount(leader) * 20 + row * 2 + Math.abs(x - wanted) / m.width;
          if (!choice || cost < choice.cost) choice = { row, x, y, vertical: false, leader, cost };
        }
      }
    }
    if (!choice) {
      const y = rowY(MAX_ROWS, m.height);
      choice = { row: MAX_ROWS, x: label.x - m.width / 2, y, vertical: true, leader: { from: { x: label.x, y: y + m.height }, to: { x: label.x, y: label.y } } };
    }
    place(label, m, choice);
  }
  return placed;
}

// A primitive that rests on another one (`on`: a chip on a PCB, a metal can on a module; or a
// list, a PCB on its two header strips) is painted after it, whatever their centres say: a large flat PCB sorted by its centre would
// otherwise cover the parts on its far half. Each one moves to just after its support (what
// sorted between them is farther than the support, so also behind the part on it).
//
// A primitive on one face of a board that stands up also names that face (`side`, its normal):
// seen from that face it is painted after the board as above; seen from the other one, before it,
// so the board covers it and only what sticks out beside the board shows.
export function supportsFirst(sorted, camera = null) {
  const list = [...sorted];
  for (let pass = 0; pass < 4; pass++) {
    let moved = false;
    for (let i = 0; i < list.length; i++) {
      const bases = [].concat(list[i].p.on ?? []);
      if (!bases.length) continue;
      if (list[i].p.side && camera && !camera.faces(list[i].p.side)) {
        const j = Math.min(...bases.map((base) => list.findIndex((e) => e.p === base)).filter((k) => k >= 0));
        if (j < i) {
          const [item] = list.splice(i, 1);
          list.splice(j, 0, item);
          moved = true;
        }
        continue;
      }
      const j = Math.max(...bases.map((base) => list.findIndex((e) => e.p === base)));
      if (j > i) {
        const [item] = list.splice(i, 1);
        list.splice(j, 0, item);
        moved = true;
        i--;
      }
    }
    if (!moved) break;
  }
  return list;
}

// fit: 'board' frames the whole board; 'parts' frames only the parts and their labels.
//   under: primitives of parts that lie beside the board on its far side (a battery on the
//          table): painted before the board, so the board hides them where it should
export function buildScene({ camera, base = [], items = [], under = [], labels = [], margin = 24, fit = 'board' }) {
  const bounds = createBounds();
  const focus = createBounds();
  const layers = { under: [], board: [], parts: [], labels: [], annotations: [] };

  const byDepth = (list) => supportsFirst(list.map((p) => ({ p, depth: centroidDepth(p, camera) })).sort((a, b) => b.depth - a.depth), camera);
  for (const { p } of byDepth(under)) paintPrimitive(p, camera, focus, layers.under);
  for (const primitive of base) paintPrimitive(primitive, camera, bounds, layers.board);
  for (const { p } of byDepth(items)) paintPrimitive(p, camera, focus, layers.parts);

  const top = focus.empty() ? bounds.minY : focus.minY;
  const obstacles = layers.board.filter((op) => op.kind === 'text' && op.role === 'net-label').map((op) => op.box);
  const callouts = layoutLabels(labels, top, obstacles);
  for (const c of callouts) {
    focus.add(c.anchor.x, c.anchor.y);
    layers.labels.push({ kind: 'line', x1: c.leader.from.x, y1: c.leader.from.y, x2: c.anchor.x, y2: c.anchor.y, stroke: '#7b8794', strokeWidth: 0.8, part: c.part, role: 'leader' });
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
