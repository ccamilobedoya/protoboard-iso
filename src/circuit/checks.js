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
  if (pkg.validate) {
    const found = pkg.validate(pos, part);
    if (found.length) return found;
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

// A part's description has two formats: a plain string (shown as it is, whatever the
// language) or one text per language. The second should cover every language of the kit, so
// the page shows it in any of them; a missing one is reported.
export function checkDescriptions(parts, languages) {
  const out = [];
  for (const part of parts) {
    const d = part.raw.description;
    if (d == null || typeof d !== 'object') continue;
    const have = Object.keys(d).filter((k) => String(d[k] ?? '').trim());
    const missing = languages.filter((l) => !have.includes(l));
    if (missing.length) out.push({ severity: 'info', code: 'DESCRIPTION_LANGUAGE', params: { part: part.id, missing: missing.join(', '), example: `{ ${languages.map((l) => `"${l}": "…"`).join(', ')} }` } });
  }
  return out;
}

export function checkConnections(parts, netlist, { netLabels = {} } = {}) {
  const out = [];
  for (const part of parts) {
    const byNode = new Map();
    part.holes.forEach((hole, i) => {
      if (!byNode.has(hole.node)) byNode.set(hole.node, []);
      byNode.get(hole.node).push(part.pinNames[i]);
    });
    // Pins joined inside the part (a button's 1–2) may share a group; pins of different
    // groups may not.
    const internal = part.def.internal ?? [];
    const groupOf = (pin) => internal.findIndex((g) => g.includes(pin));
    for (const [node, pins] of byNode) {
      if (pins.length < 2) continue;
      const groups = new Set(pins.map((pin) => (groupOf(pin) >= 0 ? `g${groupOf(pin)}` : pin)));
      if (groups.size < 2) continue;
      const code = part.type === 'button' ? 'SWITCH_BYPASSED' : 'PINS_SAME_NODE';
      out.push(issue('warning', code, { part: part.id, pins: pins.join(', '), node }));
    }
  }
  const byId = new Map(parts.map((p) => [p.id, p]));
  const connectedThroughPart = (partId, pin) => {
    const part = byId.get(partId);
    const group = (part?.def.internal ?? []).find((g) => g.includes(pin));
    if (!group) return false;
    return group.some((mate) => {
      if (mate === pin) return false;
      const node = part.holes[part.pinNames.indexOf(mate)]?.node;
      return (netlist.nodes[node]?.length ?? 0) > 1 || netLabels[node?.split(':')[0]] !== undefined;
    });
  };
  for (const [node, members] of Object.entries(netlist.nodes)) {
    const supplied = netLabels[node.split(':')[0]] !== undefined;
    if (members.length === 1 && !supplied && !connectedThroughPart(members[0].part, members[0].pin)) {
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
