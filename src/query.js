// Questions about a circuit that an assistant should not answer by reasoning: what is in
// a hole, what a connected group holds, which holes are free, and where a new part can go.
//
//   queryAt(circuit, 'c12')            → hole, node, who is in it, the rest of its group
//   queryNode(circuit, '9:a-e' | 'c9') → every hole of the group, used and free
//   queryFree(circuit, { near, limit, emptyNodes })
//   suggest(circuit, part, { connect | between, near, limit, views })
//        → valid placements for a new part, best first, each ready to apply as an `add`.
//
// suggest works in two passes: a fast geometric pass over every candidate set of holes
// (lead rules, free holes, the right groups), then a measured pass on the best few with
// the same evaluation as a dry run (placement issues, visibility, label problems). It never
// proposes a placement that introduces an error or a warning.

import { buildCircuit } from './circuit/build.js';
import { PART_TYPES } from './parts/types/index.js';
import { PACKAGES } from './parts/packages/index.js';
import { applyOps } from './ops.js';
import { evaluate, diffEvaluations } from './diff.js';
import { PROFILES } from './review.js';
import { nearestBody } from './circuit/checks.js';
import { distance, sub } from './core/vec.js';

const ID_PREFIX = { resistor: 'R', capacitor: 'C', potentiometer: 'RV', diode: 'D', led: 'D', mosfet: 'Q', bjt: 'Q', ic: 'U', button: 'S', wire: 'W', battery: 'BT', zener: 'D', bridge: 'BR', module: 'U', regulator: 'U', inductor: 'L', thermistor: 'RT', ldr: 'LDR', buzzer: 'BZ', header: 'J' };
const round = (n, d = 2) => Math.round(n * 10 ** d) / 10 ** d;

function stateOf(circuit) {
  const result = buildCircuit(circuit);
  if (!result.board) throw new Error('The circuit has no valid board.');
  const used = new Map();
  for (const part of result.parts) part.holes.forEach((h, i) => used.set(h.id, { part: part.id, pin: part.pinNames[i] }));
  const nodeHoles = new Map();
  for (const hole of result.board.holes.values()) {
    if (!nodeHoles.has(hole.node)) nodeHoles.set(hole.node, []);
    nodeHoles.get(hole.node).push(hole);
  }
  return { ...result, used, nodeHoles };
}

// A node can be named directly ("9:a-e", "T+"), by any of its holes ("c9") or by a pin of a
// part already placed ("R1.2", "U1.OUT"): the group that pin is in.
export function resolveNode(state, ref) {
  if (ref == null) return null;
  const hole = state.board.find(String(ref));
  if (hole) return hole.node;
  const name = String(ref).trim();
  for (const candidate of [name, name.toLowerCase(), name.toUpperCase()]) if (state.nodeHoles.has(candidate)) return candidate;
  const pin = /^([^.\s]+)\.([^.\s]+)$/.exec(name);
  const part = pin && state.parts.find((p) => p.id === pin[1]);
  if (part) {
    const i = part.pinNames.findIndex((n) => n.toLowerCase() === pin[2].toLowerCase());
    if (i >= 0) return part.holes[i].node;
  }
  return null;
}

function nodeSummary(state, node) {
  const holes = state.nodeHoles.get(node) ?? [];
  return {
    node,
    holes: holes.map((h) => h.id),
    used: holes.filter((h) => state.used.has(h.id)).map((h) => ({ hole: h.id, ...state.used.get(h.id) })),
    free: holes.filter((h) => !state.used.has(h.id)).map((h) => h.id),
  };
}

export function queryAt(circuit, holeName) {
  const state = stateOf(circuit);
  const hole = state.board.find(String(holeName));
  if (!hole) return { hole: String(holeName), exists: false };
  return { hole: hole.id, exists: true, node: hole.node, occupant: state.used.get(hole.id) ?? null, group: nodeSummary(state, hole.node) };
}

export function queryNode(circuit, ref) {
  const state = stateOf(circuit);
  const node = resolveNode(state, ref);
  if (!node) return { node: String(ref), exists: false };
  const label = circuit.netLabels?.[node.split(':')[0]] ?? null;
  return { exists: true, label, ...nodeSummary(state, node) };
}

function centreOf(state, refs) {
  const pts = [];
  for (const ref of refs) {
    if (ref == null) continue;
    const hole = state.board.find(String(ref));
    if (hole) pts.push(hole.pos);
    else if (/^\d+$/.test(String(ref))) pts.push({ x: state.board.xOf(Number(ref)), y: state.board.spec.size.width / 2, z: 0 });
    else {
      const node = resolveNode(state, ref);
      const holes = node ? state.nodeHoles.get(node) : [];
      // For a rail, the centre of its used holes is more useful than the middle of the board.
      const usedHoles = holes.filter((h) => state.used.has(h.id));
      for (const h of usedHoles.length ? usedHoles : holes) pts.push(h.pos);
    }
  }
  if (!pts.length) return null;
  return { x: pts.reduce((s, p) => s + p.x, 0) / pts.length, y: pts.reduce((s, p) => s + p.y, 0) / pts.length, z: 0 };
}

// near: a hole ("c12"), a node ("9:a-e") or a column number ("20").
export function queryFree(circuit, { near, limit = 20, emptyNodes = false } = {}) {
  const state = stateOf(circuit);
  const centre = centreOf(state, [near]);
  const nodeUsed = (node) => (state.nodeHoles.get(node) ?? []).some((h) => state.used.has(h.id));
  const holes = [...state.board.holes.values()]
    .filter((h) => !state.used.has(h.id) && (!emptyNodes || !nodeUsed(h.node)))
    .map((h) => ({ hole: h.id, node: h.node, emptyNode: !nodeUsed(h.node), distance: centre ? round(distance(h.pos, centre), 1) : null }));
  if (centre) holes.sort((a, b) => a.distance - b.distance);
  return { near: near ?? null, total: holes.length, holes: holes.slice(0, limit) };
}

function nextId(circuit, type) {
  const prefix = ID_PREFIX[type] ?? 'X';
  const taken = new Set((circuit.parts ?? []).map((p) => p.id));
  for (let n = 1; ; n++) if (!taken.has(`${prefix}${n}`)) return `${prefix}${n}`;
}

// Candidate hole sets for the package, before any measuring.
function geometricCandidates(state, { pkg, params, pinNames, wanted, centre, window }) {
  const P = state.board.pitch;
  const holes = [...state.board.holes.values()].filter((h) => !state.used.has(h.id));
  const nodeUsed = (node) => (state.nodeHoles.get(node) ?? []).some((h) => state.used.has(h.id));
  // Holes a pin may use: the free holes of its group, or free holes of empty groups nearby.
  const optionsFor = (pin) => {
    const node = wanted[pin];
    if (node) return holes.filter((h) => h.node === node);
    return holes.filter((h) => !nodeUsed(h.node) && (!centre || distance(h.pos, centre) <= window));
  };
  const out = [];
  const valid = (set) => {
    const nodes = set.map((h) => h.node);
    if (new Set(set.map((h) => h.id)).size !== set.length) return false;
    // Pins without a wanted group must not share a group with any other pin.
    return pinNames.every((pin, i) => wanted[pin] || nodes.filter((n) => n === nodes[i]).length === 1);
  };
  const axisPenalty = (a, b) => {
    const d = sub(b.pos, a.pos);
    return Math.abs(d.x) < 1e-6 || Math.abs(d.y) < 1e-6 ? 0 : 2;
  };

  if (pkg.footprints) {
    // Packages that list their own possible positions (buttons, DIP chips).
    const byName = new Map(holes.map((h) => [h.id, h]));
    for (const names of pkg.footprints(state.board, params)) {
      const set = names.map((n) => byName.get(n));
      if (set.some((h) => !h)) continue;
      if (!pinNames.every((pin, i) => (wanted[pin] ? set[i].node === wanted[pin] : !nodeUsed(set[i].node)))) continue;
      if (new Set(set.map((h) => h.node)).size !== set.length) continue;
      const mid = { x: set.reduce((s, h) => s + h.pos.x, 0) / set.length, y: set.reduce((s, h) => s + h.pos.y, 0) / set.length, z: 0 };
      if (centre && distance(mid, centre) > window * 2) continue;
      // Prefer the orientation that reads from the front (pin 1 in the front row, on the left).
      const facing = set[0].pos.y <= set.at(-1).pos.y && set[0].pos.x <= set[1].pos.x ? 0 : 0.5;
      out.push({ holes: set, pre: facing + (centre ? (0.15 * distance(mid, centre)) / P : 0) });
    }
  } else if (pinNames.length === 2 && pkg.span) {
    const { min, max } = pkg.span(params);
    const ideal = Math.max(P, Math.ceil(min / P - 1e-6) * P);
    for (const a of optionsFor(pinNames[0])) {
      for (const b of optionsFor(pinNames[1])) {
        const span = distance(a.pos, b.pos);
        if (span < min - 1e-6 || span > max + 1e-6) continue;
        if (!valid([a, b])) continue;
        const mid = { x: (a.pos.x + b.pos.x) / 2, y: (a.pos.y + b.pos.y) / 2, z: 0 };
        const pre = Math.abs(span - ideal) / P + axisPenalty(a, b) + (centre ? (0.15 * distance(mid, centre)) / P : 0);
        out.push({ holes: [a, b], pre });
      }
    }
  } else if (pkg.inline) {
    // Leads in a straight line, neighbouring holes: along a row (each lead in its own strip).
    const step = pkg.inline.pitch * P;
    const byPos = new Map(holes.map((h) => [`${round(h.pos.x, 2)},${round(h.pos.y, 2)}`, h]));
    for (const first of holes) {
      for (const dir of [{ x: 1, y: 0 }, { x: -1, y: 0 }]) {
        const set = [first];
        for (let k = 1; k < pinNames.length; k++) {
          const h = byPos.get(`${round(first.pos.x + dir.x * step * k, 2)},${round(first.pos.y, 2)}`);
          if (!h) break;
          set.push(h);
        }
        if (set.length !== pinNames.length) continue;
        if (!pinNames.every((pin, i) => !wanted[pin] || set[i].node === wanted[pin])) continue;
        if (!pinNames.every((pin, i) => wanted[pin] || !nodeUsed(set[i].node))) continue;
        if (!valid(set)) continue;
        const mid = set[Math.floor(set.length / 2)].pos;
        // Prefer the printed face towards the front view (pin 1 on the left, +x).
        const pre = (dir.x < 0 ? 0.5 : 0) + (centre ? (0.15 * distance(mid, centre)) / P : 0);
        out.push({ holes: set, pre });
      }
    }
  }
  return out.sort((a, b) => a.pre - b.pre);
}

// part: the new part without pins ({ type, value, … }; id optional).
// connect: { pinName: node or hole }; between: [node, node] for two-lead parts, in pin order.
// profile: also leave out placements that a review with that profile would block (lesson: parts
// too close, labels in trouble), measured in both views.
// At least `candidates` placements are measured, and more (up to `maxCandidates`) while fewer
// than `limit` pass: near the first choices everything may cross another part.
export function suggest(circuit, part, { connect, between, near, limit = 5, candidates = 12, maxCandidates = 48, views, profile, window = 20 } = {}) {
  const policy = profile ? PROFILES[profile] : null;
  if (profile && !policy) return { error: { severity: 'error', code: 'UNKNOWN_PROFILE', params: { profile, options: Object.keys(PROFILES).join(', ') } } };
  views ??= policy?.hiddenEverywhere ? ['front', 'back'] : ['front'];
  const state = stateOf(circuit);
  const type = PART_TYPES[part?.type];
  if (!type) return { error: { severity: 'error', code: 'UNKNOWN_TYPE', params: { part: part?.id ?? '?', type: String(part?.type), options: Object.keys(PART_TYPES).join(', ') } } };
  const def = type.resolve(part);
  if (def.error) return { error: { severity: 'error', ...def.error, params: { part: part.id ?? '?', ...def.error.params } } };
  const pkg = PACKAGES[def.package];
  const pinNames = def.pinNames ?? type.pins;

  const wanted = {};
  const asked = connect ?? (between ? Object.fromEntries(between.map((n, i) => [pinNames[i], n])) : {});
  for (const [pin, ref] of Object.entries(asked)) {
    const name = pinNames.find((p) => p.toLowerCase() === pin.toLowerCase());
    const node = resolveNode(state, ref);
    if (!name) return { error: { severity: 'error', code: 'UNKNOWN_PIN', params: { part: part.id ?? part.type, pin, names: pinNames.join(', ') } } };
    if (!node) return { error: { severity: 'error', code: 'UNKNOWN_HOLE', params: { part: part.id ?? part.type, pin: name, hole: String(ref) } } };
    wanted[name] = node;
  }
  const centre = centreOf(state, near ? [near] : Object.values(asked)) ?? { x: state.board.spec.size.length / 2, y: state.board.spec.size.width / 2, z: 0 };
  const id = part.id ?? nextId(circuit, part.type);

  const pool = geometricCandidates(state, { pkg, params: def.params, pinNames, wanted, centre, window }).slice(0, Math.max(candidates, maxCandidates));
  const before = evaluate(circuit, { views });
  const measured = [];
  let considered = 0;
  for (const candidate of pool) {
    if (considered >= candidates && measured.length >= limit) break;
    considered++;
    const pins = candidate.holes.map((h) => h.id);
    const add = { op: 'add', part: { ...part, id, pins } };
    const { circuit: next, errors } = applyOps(circuit, [add]);
    if (errors.length) continue;
    const after = evaluate(next, { views });
    const diff = diffEvaluations(before, after);
    // Unconnected pins of the new part are expected. Text size depends on the drawing
    // scale, not on the placement (counting it would reward hiding a part's marking).
    const introduced = diff.introduced.filter((p) => !(p.code === 'FLOATING_PIN' && p.params.part === id) && p.code !== 'TEXT_TOO_SMALL');
    if (introduced.some((p) => p.severity !== 'info' || policy?.block.includes(p.code))) continue;
    const minVisible = Math.min(1, ...Object.values(after.visibility));
    const nearest = nearestBody(buildCircuit(next).parts, id);
    const score = candidate.pre + introduced.length + 5 * (1 - minVisible);
    measured.push({
      pins,
      nodes: candidate.holes.map((h) => h.node),
      span: round(distance(candidate.holes[0].pos, candidate.holes.at(-1).pos), 1),
      score: round(score, 2),
      minVisible: round(minVisible, 3),
      nearest,
      fixes: diff.fixed,
      notes: introduced,
      ops: [add],
    });
  }
  measured.sort((a, b) => a.score - b.score);
  const placements = measured.slice(0, limit);
  const hint = placements.length
    ? null
    : { severity: 'warning', code: pkg.inline && Object.values(wanted).some((n) => !n.includes(':')) ? 'NO_PLACEMENT_RAIL' : 'NO_PLACEMENT', params: { part: id, considered } };
  return { id, type: part.type, package: def.package, pinNames, connect: wanted, considered, ...(profile && { profile }), placements, hint };
}

// Several new parts in one call: each takes the best placement given the ones before it, so a
// later part can name an earlier one's pins ("R1.2"). Returns every add in one batch for
// apply_ops, and what could not be placed.
// items: [{ part, between?, connect?, near? }]
export function suggestMany(circuit, items, options = {}) {
  let current = circuit;
  const placed = [];
  const failed = [];
  const ops = [];
  for (const item of items ?? []) {
    const r = suggest(current, item.part, { ...options, between: item.between, connect: item.connect, near: item.near, limit: 1 });
    const best = r.placements?.[0];
    if (!best) {
      failed.push({ id: r.id ?? item.part?.id ?? item.part?.type, problem: r.error ?? r.hint });
      continue;
    }
    placed.push({ id: r.id, type: r.type, pinNames: r.pinNames, pins: best.pins, nodes: best.nodes, minVisible: best.minVisible, nearest: best.nearest, notes: best.notes });
    ops.push(...best.ops);
    current = applyOps(current, best.ops).circuit;
  }
  return { placed, failed, ops, ...(options.profile && { profile: options.profile }) };
}

