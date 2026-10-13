// Placement checks. They only look at geometry and connectivity, so they run in
// microseconds and catch most mistakes before anyone looks at the picture.
//
// Each issue is { severity: 'error' | 'warning' | 'info', code, params }. Messages live
// in ../i18n so the same issue reads well in every language.

import { distance, sub, length, dot, normalize } from '../core/vec.js';

const issue = (severity, code, params) => ({ severity, code, params });
const mm = (n) => Math.round(n * 10) / 10;

export function nodeParams(node) {
  const strip = /^(\d+):(.+)$/.exec(node);
  if (strip) return { key: 'node.strip', params: { col: strip[1], rows: strip[2].replace('-', '–') } };
  return { key: 'node.rail', params: { rail: node } };
}

export function checkOccupancy(parts) {
  const out = [];
  const used = new Map();
  for (const part of parts) {
    part.holes.forEach((hole, i) => {
      const who = `${part.id}.${part.pinNames[i]}`;
      if (used.has(hole.id)) out.push(issue('error', 'HOLE_OCCUPIED', { hole: hole.id, first: used.get(hole.id), second: who }));
      else used.set(hole.id, who);
    });
  }
  return out;
}

export function checkLeads(part, pitch) {
  const pkg = part.pkg;
  const pos = part.holes.map((h) => h.pos);
  if (pkg.span) {
    const { min, max } = pkg.span(part.def.params);
    const span = distance(pos[0], pos.at(-1));
    if (span < min - 1e-6) return [issue('warning', 'SPAN_TOO_SHORT', { part: part.id, span: mm(span), min: mm(min), holes: Math.ceil(min / pitch - 1e-6) })];
    if (span > max + 1e-6) return [issue('warning', 'SPAN_TOO_LONG', { part: part.id, span: mm(span), max: mm(max) })];
  }
  if (pkg.inline) {
    const step = pkg.inline.pitch * pitch;
    const first = sub(pos[1], pos[0]);
    let ok = Math.abs(length(first) - step) < 0.01;
    for (let i = 1; ok && i + 1 < pos.length; i++) {
      const next = sub(pos[i + 1], pos[i]);
      ok = Math.abs(length(next) - step) < 0.01 && dot(normalize(first), normalize(next)) > 0.999;
    }
    if (!ok) return [issue('warning', 'NOT_INLINE', { part: part.id, count: pos.length })];
  }
  return [];
}

export function checkConnections(parts, netlist, { netLabels = {} } = {}) {
  const out = [];
  for (const part of parts) {
    const byNode = new Map();
    part.holes.forEach((hole, i) => {
      if (!byNode.has(hole.node)) byNode.set(hole.node, []);
      byNode.get(hole.node).push(part.pinNames[i]);
    });
    for (const [node, pins] of byNode) {
      if (pins.length > 1) out.push(issue('warning', 'PINS_SAME_NODE', { part: part.id, pins: pins.join(', '), node }));
    }
  }
  for (const [node, members] of Object.entries(netlist.nodes)) {
    const supplied = netLabels[node.split(':')[0]] !== undefined;
    if (members.length === 1 && !supplied) {
      const [{ part, pin }] = members;
      out.push(issue('info', 'FLOATING_PIN', { part, pin, node }));
    }
  }
  return out;
}

function bounds(primitives) {
  const b = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
  for (const prim of primitives) {
    for (const face of prim.faces) {
      for (const p of face.pts) {
        [p.x, p.y, p.z].forEach((c, i) => {
          if (c < b.min[i]) b.min[i] = c;
          if (c > b.max[i]) b.max[i] = c;
        });
      }
    }
  }
  return b;
}

// Bodies that overlap in space. Boxes are axis-aligned, so diagonal parts are checked
// generously; a small margin keeps touching parts from being reported.
// With `clearance` (mm), bodies closer than that on the board are reported too: useful
// for teaching layouts, where parts packed tightly are hard to see and to build.
export function checkCollisions(parts, { margin = 0.15, clearance = 0 } = {}) {
  const boxes = parts.filter((p) => p.built?.body?.length).map((p) => ({ id: p.id, b: bounds(p.built.body) }));
  const out = [];
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i].b;
      const c = boxes[j].b;
      const overlap = [0, 1, 2].every((k) => a.min[k] + margin < c.max[k] - margin && c.min[k] + margin < a.max[k] - margin);
      if (overlap) {
        out.push(issue('warning', 'COLLISION', { first: boxes[i].id, second: boxes[j].id }));
        continue;
      }
      if (clearance > 0) {
        const gap = Math.hypot(...[0, 1].map((k) => Math.max(0, a.min[k] - c.max[k], c.min[k] - a.max[k])));
        if (gap < clearance) out.push(issue('info', 'TOO_CLOSE', { first: boxes[i].id, second: boxes[j].id, gap: mm(gap), clearance }));
      }
    }
  }
  return out;
}
