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
import { SWITCH_STYLES } from './parts/types/switch.js';
import { applyOps } from './ops.js';
import { evaluate, diffEvaluations } from './diff.js';
import { PROFILES } from './review.js';
import { nearestBody, coveredHoles } from './circuit/checks.js';
import { distance, sub } from './core/vec.js';
import { nearestHoles, boardLayout } from './board/board.js';

const ID_PREFIX = { resistor: 'R', capacitor: 'C', potentiometer: 'RV', diode: 'D', led: 'D', mosfet: 'Q', bjt: 'Q', ic: 'U', button: 'S', switch: 'S', wire: 'W', battery: 'BT', zener: 'D', bridge: 'BR', module: 'U', regulator: 'U', inductor: 'L', thermistor: 'RT', ldr: 'LDR', buzzer: 'BZ', header: 'J' };
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
  if (!hole) return { hole: String(holeName), exists: false, nearest: nearestHoles(state.board, holeName) };
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
      // An unused rail of joined boards: the middle of the first board, not the seam.
      const seg = state.board.spec.segments;
      const pool = usedHoles.length ? usedHoles : seg ? holes.filter((h) => h.pos.x <= seg.length) : holes;
      for (const h of pool) pts.push(h.pos);
    }
  }
  if (!pts.length) return null;
  return { x: pts.reduce((s, p) => s + p.x, 0) / pts.length, y: pts.reduce((s, p) => s + p.y, 0) / pts.length, z: 0 };
}

// near: a hole ("c12"), a node ("9:a-e") or a column number ("20").
export function queryFree(circuit, { near, limit = 20, emptyNodes = false } = {}) {
  const state = stateOf(circuit);
  const centre = centreOf(state, [near]);
  // A centre that names nothing on the board is an error, not "anywhere".
  if (near != null && !centre) return { near: String(near), exists: false, nearest: nearestHoles(state.board, near), total: 0, holes: [] };
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
function geometricCandidates(state, { pkg, params, pinNames, wanted, centre, window, byName }) {
  const P = state.board.pitch;
  // Holes under another part's body are out: a lead there would go through it.
  const covered = coveredHoles(state.parts, [...state.board.holes.values()]);
  const holes = [...state.board.holes.values()].filter((h) => !state.used.has(h.id) && !covered.has(h.id));
  const nodeUsed = (node) => (state.nodeHoles.get(node) ?? []).some((h) => state.used.has(h.id));
  // Holes a pin may use: the free holes of its group, or free holes of empty groups nearby.
  const optionsFor = (pin) => {
    const node = wanted[pin];
    if (node) return holes.filter((h) => h.node === node);
    // A pin with no group asked for goes to an empty strip, never to a rail (an unused B+ is
    // empty too, and a lead there would join that rail).
    return holes.filter((h) => h.kind === 'main' && !nodeUsed(h.node) && (!centre || distance(h.pos, centre) <= window));
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
  } else if (byName) {
    // Beside the board (a switch, an Arduino): each pin's Dupont lead goes to a hole of its own,
    // in the group asked for or in an empty strip near the centre.
    const nearest = (list, k) => list.map((h) => ({ h, d: centre ? distance(h.pos, centre) : 0 })).sort((a, b) => a.d - b.d).slice(0, k);
    const choices = pinNames.map((pin) => (wanted[pin] ? nearest(optionsFor(pin), 3) : nearest(optionsFor(pin).filter((h) => h.kind === 'main'), 6)));
    const combos = [[]];
    for (const options of choices) {
      const grown = [];
      for (const combo of combos) for (const o of options) if (grown.length < 64) grown.push([...combo, o]);
      combos.splice(0, combos.length, ...grown);
    }
    for (const combo of combos) {
      const set = combo.map((o) => o.h);
      if (!valid(set)) continue;
      out.push({ holes: set, pre: combo.reduce((sum, o) => sum + (0.15 * o.d) / P, 0) });
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

// Problems a change introduces that a placement may not bring: anything above a note, and
// what the profile blocks. The new part's own unconnected pins are expected, and text size
// depends on the drawing scale, not on the placement.
function blockingOf(before, after, id, policy) {
  const introduced = diffEvaluations(before, after).introduced.filter((p) => !(p.code === 'FLOATING_PIN' && p.params.part === id) && p.code !== 'TEXT_TOO_SMALL');
  return { introduced, blocking: introduced.filter((p) => p.severity !== 'info' || policy?.block.includes(p.code)) };
}

const PROBE = '__probe';
const CROWD = 6; // mm
const CROWD_WEIGHT = 0.3;

// Room left for the connections still to come. A strip that holds a lone pin (it still needs
// a connection) and every group named in `reserve` ({ ref: count }, refs as in connect) must
// keep that many free holes where a jumper can still go: not under a body, and a jumper from
// there (tried towards a few free holes around) passes the same evaluation as a placement.
// Only strips near the new part are checked, since it cannot change room elsewhere.
// Returns null when there is room, else the first group that is short.
function roomProblem(next, after, { id, reserve, views, policy }) {
  const state = stateOf(next);
  const me = state.parts.find((p) => p.id === id);
  if (!me) return null;
  const P = state.board.pitch;
  const all = [...state.board.holes.values()];
  const covered = coveredHoles(state.parts, all);
  const needs = new Map();
  for (const [ref, count] of Object.entries(reserve ?? {})) {
    const node = resolveNode(state, ref);
    if (node && Number(count) > 0) needs.set(node, Math.max(needs.get(node) ?? 0, Number(count)));
  }
  const close = (h) => me.holes.some((m) => distance(m.pos, h.pos) <= 6 * P);
  for (const [node, holes] of state.nodeHoles) {
    if (needs.has(node) || holes[0].kind !== 'main' || !holes.some(close)) continue;
    if (holes.filter((h) => state.used.has(h.id)).length === 1) needs.set(node, 1);
  }
  const nodeUsed = (node) => (state.nodeHoles.get(node) ?? []).some((h) => state.used.has(h.id));
  for (const [node, need] of needs) {
    const holes = state.nodeHoles.get(node) ?? [];
    if (holes[0]?.kind !== 'main') continue; // a rail always has room
    const free = holes.filter((h) => !state.used.has(h.id) && !covered.has(h.id));
    let ok = 0;
    for (const start of free) {
      if (ok >= need) break;
      // Probe jumpers towards free holes of empty groups, one per direction, nearest first.
      const targets = all
        .filter((h) => h.node !== node && !state.used.has(h.id) && !covered.has(h.id) && (h.kind !== 'main' || !nodeUsed(h.node)))
        .map((h) => ({ h, d: distance(h.pos, start.pos) }))
        .filter(({ d }) => d >= 2 * P - 1e-6 && d <= 8 * P)
        .sort((a, b) => a.d - b.d);
      const seen = new Set();
      for (const { h } of targets) {
        const dir = `${Math.sign(Math.round(h.pos.x - start.pos.x))},${Math.sign(Math.round(h.pos.y - start.pos.y))}`;
        if (seen.has(dir)) continue;
        seen.add(dir);
        const probe = applyOps(next, [{ op: 'add', part: { type: 'wire', id: PROBE, pins: [start.id, h.id] } }]);
        if (probe.errors.length) continue;
        if (!blockingOf(after, evaluate(probe.circuit, { views }), PROBE, policy).blocking.length) {
          ok++;
          break;
        }
        if (seen.size >= 4) break;
      }
    }
    if (ok < need) return { severity: 'info', code: 'NO_ROOM_LEFT', params: { part: id, node, need, left: ok } };
  }
  return null;
}

const LOOKAHEAD = 6;

// The first later part (one that names a pin of `id`, and nothing still to be placed) that would
// find no place once `id` is where `next` has it: { code: DEPENDENT_BLOCKED, … } or null.
function dependentProblem(next, dependents, { id, profile, views }) {
  const placedIds = new Set((next.parts ?? []).map((p) => p.id));
  for (const dep of dependents) {
    const refs = [...(dep.between ?? []), ...Object.values(dep.connect ?? {})].map((r) => /^([^.\s]+)\./.exec(String(r))?.[1]).filter(Boolean);
    if (!refs.includes(id) || refs.some((other) => !placedIds.has(other))) continue;
    const r = suggest(next, dep.part, { between: dep.between, connect: dep.connect, near: dep.near, profile, views, limit: 1, candidates: 4, maxCandidates: 16, room: false, via: false });
    if (!r.placements?.length) return { severity: 'info', code: 'DEPENDENT_BLOCKED', params: { part: id, other: r.id ?? dep.part?.id ?? dep.part?.type, why: r.hint?.reasons?.[0]?.example?.code ?? r.error?.code ?? '—' } };
  }
  return null;
}

// Why candidates were turned down, most frequent first: { code, count, example }.
function tally(reasons) {
  const byCode = new Map();
  for (const r of reasons) {
    const entry = byCode.get(r.code) ?? { code: r.code, count: 0, example: r };
    entry.count++;
    byCode.set(r.code, entry);
  }
  return [...byCode.values()].sort((a, b) => b.count - a.count).slice(0, 3);
}

// part: the new part without pins ({ type, value, … }; id optional).
// connect: { pinName: node or hole }; between: [node, node] for two-lead parts, in pin order.
// profile: also leave out placements that a review with that profile would block (lesson: parts
// too close, labels in trouble), measured in both views.
// At least `candidates` placements are measured, and more (up to `maxCandidates`) while fewer
// than `limit` pass: near the first choices everything may cross another part.
// room (default true): leave out placements that take the last usable hole of a strip still
// waiting for a connection, or of a group named in `reserve` ({ "U1.OUT": 2 }: two more
// connections will go there). When nothing is left, hint.reasons says why, most frequent first.
export function suggest(circuit, part, { connect, between, near, limit = 5, candidates = 12, maxCandidates = 48, views, profile, window = 20, reserve, room = true, dependents, via = true } = {}) {
  const policy = profile ? PROFILES[profile] : null;
  if (profile && !policy) return { error: { severity: 'error', code: 'UNKNOWN_PROFILE', params: { profile, options: Object.keys(PROFILES).join(', ') } } };
  views ??= policy?.hiddenEverywhere ? ['front', 'back'] : ['front'];
  const state = stateOf(circuit);
  const type = PART_TYPES[part?.type];
  if (!type) return { error: { severity: 'error', code: 'UNKNOWN_TYPE', params: { part: part?.id ?? '?', type: String(part?.type), options: Object.keys(PART_TYPES).join(', ') } } };
  let def = type.resolve(part);
  // Parts beside the board take their pins by name, only the ones in use ("pins": { "1": "e5" }):
  // the pins named in connect, and for a switch the contacts they close.
  const byName = def.error?.code === 'MODULE_PINS' && !!(connect || between);
  if (byName) {
    const style = part.type === 'switch' ? SWITCH_STYLES[part.style ?? 'rocker'] : null;
    let names = connect ? Object.keys(connect) : style ? style.pins.slice(0, between.length) : [];
    if (style) {
      const partners = style.on.filter((pair) => pair.some((n) => names.some((k) => k.toLowerCase() === n.toLowerCase()))).flat();
      names = style.pins.filter((n) => partners.includes(n) || names.some((k) => k.toLowerCase() === n.toLowerCase()));
    }
    if (names.length) def = type.resolve({ ...part, pins: Object.fromEntries(names.map((n) => [n, 'a1'])) });
  }
  if (def.error) return { error: { severity: 'error', ...def.error, params: { part: part.id ?? '?', ...def.error.params } } };
  const pkg = PACKAGES[def.package];
  const pinNames = def.pinNames ?? type.pins;

  const wanted = {};
  // A null in between leaves that pin to a free strip ("from U1.OUT to anywhere free").
  const asked = connect ?? (between ? Object.fromEntries(between.map((n, i) => [pinNames[i], n]).filter(([, n]) => n != null)) : {});
  for (const [pin, ref] of Object.entries(asked)) {
    const name = pinNames.find((p) => p.toLowerCase() === pin.toLowerCase());
    const node = resolveNode(state, ref);
    if (!name) return { error: { severity: 'error', code: 'UNKNOWN_PIN', params: { part: part.id ?? part.type, pin, names: pinNames.join(', ') } } };
    if (!node) {
      const nearest = nearestHoles(state.board, ref);
      return { error: { severity: 'error', code: 'UNKNOWN_HOLE', params: { part: part.id ?? part.type, pin: name, hole: String(ref), ...(nearest.length && { nearest: nearest.join(', ') }) } } };
    }
    wanted[name] = node;
  }
  const firstBoard = state.board.spec.segments?.length ?? state.board.spec.size.length;
  const centre = centreOf(state, near ? [near] : Object.values(asked)) ?? { x: firstBoard / 2, y: state.board.spec.size.width / 2, z: 0 };
  const id = part.id ?? nextId(circuit, part.type);

  const pool = geometricCandidates(state, { pkg, params: def.params, pinNames, wanted, centre, window, byName }).slice(0, Math.max(candidates, maxCandidates));
  const before = evaluate(circuit, { views });
  const reasons = [];
  if (!pool.length) reasons.push(noCandidates(state, { id, pinNames, wanted }));
  // Measure a candidate as a dry run would; null (and a reason) when it brings a problem.
  const measure = (candidate) => {
    const pins = candidate.holes.map((h) => h.id);
    const add = { op: 'add', part: { ...part, id, pins: byName ? Object.fromEntries(pinNames.map((n, i) => [n, pins[i]])) : pins } };
    const { circuit: next, errors } = applyOps(circuit, [add]);
    if (errors.length) {
      reasons.push(errors[0]);
      return null;
    }
    const after = evaluate(next, { views });
    const diff = diffEvaluations(before, after);
    const { introduced, blocking } = blockingOf(before, after, id, policy);
    if (blocking.length) {
      reasons.push(blocking[0]);
      return null;
    }
    const minVisible = Math.min(1, ...Object.values(after.visibility));
    const nearest = nearestBody(buildCircuit(next).parts, id);
    // Crowding: a body closer than CROWD mm to another pays for it, so where the board has room
    // (a joined board) parts spread out instead of piling up next to the last one.
    const crowd = nearest ? CROWD_WEIGHT * Math.max(0, CROWD - nearest.gap) : 0;
    const score = candidate.pre + introduced.length + 5 * (1 - minVisible) + crowd;
    return {
      pins,
      nodes: candidate.holes.map((h) => h.node),
      span: round(distance(candidate.holes[0].pos, candidate.holes.at(-1).pos), 1),
      score: round(score, 2),
      minVisible: round(minVisible, 3),
      nearest,
      fixes: diff.fixed,
      notes: introduced,
      ops: [add],
      next,
      after,
    };
  };
  // Measure in batches, best first; the room check (probe jumpers, slower) runs only on the
  // best of each batch, and a new batch is measured while fewer than `limit` pass it.
  const placements = [];
  let considered = 0;
  let looked = 0;
  let fallback = null;
  while (placements.length < limit && considered < pool.length && !(dependents?.length && looked >= LOOKAHEAD)) {
    const batch = [];
    while (considered < pool.length && (considered < candidates || batch.length < limit - placements.length)) {
      const m = measure(pool[considered++]);
      if (m) batch.push(m);
    }
    batch.sort((a, b) => a.score - b.score);
    for (const m of batch) {
      if (placements.length >= limit) break;
      const short = room ? roomProblem(m.next, m.after, { id, reserve, views, policy }) : null;
      if (short) {
        reasons.push(short);
        continue;
      }
      // Look ahead (from suggestMany): the later parts that hang from this one must still fit.
      // Tried on the best few only, since each try is a small suggest of its own.
        if (dependents?.length) {
        if (looked >= LOOKAHEAD) break;
        looked++;
        const blocked = dependentProblem(m.next, dependents, { id, profile, views });
        if (blocked) {
          reasons.push(blocked);
          fallback ??= m;
          continue;
        }
      }
      placements.push(m);
    }
  }
  // Nothing passed the look-ahead: keep the best that has room, and say what may not fit.
  if (!placements.length && fallback) {
    fallback.notes = [...fallback.notes, ...reasons.filter((r) => r.code === 'DEPENDENT_BLOCKED').slice(0, 1)];
    placements.push(fallback);
  }
  placements.sort((a, b) => a.score - b.score);
  for (const p of placements) {
    delete p.next;
    delete p.after;
  }
  // Nothing fits on the group asked for (a tall regulator beside it, no room left): put the part
  // in a free strip nearby and join it to that group with a jumper, as one would on the bench.
  if (!placements.length && via && !byName) {
    for (const pin of pinNames) {
      const node = wanted[pin];
      if (!node || (state.nodeHoles.get(node) ?? [])[0]?.kind !== 'main') continue;
      const rest = Object.fromEntries(Object.entries(wanted).filter(([k]) => k !== pin));
      const moved = suggest(circuit, part, { connect: rest, near: near ?? node, limit: 3, candidates, maxCandidates, views, profile, window, reserve, room, dependents, via: false });
      for (const p of moved.placements) {
        const far = p.pins[pinNames.indexOf(pin)];
        const next = applyOps(circuit, p.ops).circuit;
        const taken = new Set((next.parts ?? []).map((q) => q.id));
        const wireId = taken.has(`W${id}`) ? nextId(next, 'wire') : `W${id}`;
        const w = suggest(next, { type: 'wire', id: wireId }, { between: [node, far], limit: 1, views, profile, window, room: false, via: false });
        const link = w.placements?.[0];
        if (!link) continue;
        const note = { severity: 'info', code: 'VIA_WIRE', params: { part: id, pin, node, wire: wireId } };
        placements.push({ ...p, ops: [...p.ops, ...link.ops], notes: [note, ...p.notes, ...link.notes], via: { pin, node, wire: wireId } });
        break;
      }
      if (placements.length) break;
    }
  }
  const hint = placements.length
    ? null
    : { severity: 'warning', code: pkg.inline && Object.values(wanted).some((n) => !n.includes(':')) ? 'NO_PLACEMENT_RAIL' : 'NO_PLACEMENT', params: { part: id, considered }, reasons: tally(reasons) };
  return { id, type: part.type, package: def.package, pinNames, connect: wanted, considered, ...(profile && { profile }), placements, hint };
}

// Why there was nothing to measure: a group asked for has no free hole a lead can reach, or
// no set of holes fits the part's leads between the groups asked for.
function noCandidates(state, { id, pinNames, wanted }) {
  const covered = coveredHoles(state.parts, [...state.board.holes.values()]);
  for (const pin of pinNames) {
    const node = wanted[pin];
    if (!node) continue;
    const holes = state.nodeHoles.get(node) ?? [];
    const free = holes.filter((h) => !state.used.has(h.id));
    const reachable = free.filter((h) => !covered.has(h.id));
    if (!reachable.length) return { severity: 'info', code: 'GROUP_FULL', params: { part: id, pin, node, free: free.length, covered: free.length - reachable.length } };
  }
  const rail = Object.values(wanted).find((n) => (state.nodeHoles.get(n) ?? [])[0]?.kind === 'rail');
  // Name the rail's columns only when that is the trouble: a strip asked for has no rail hole
  // within a column of it.
  const strips = Object.values(wanted).filter((n) => (state.nodeHoles.get(n) ?? [])[0]?.kind === 'main');
  const railCols = new Set(state.board.railColumns);
  const missing = strips.some((n) => {
    const col = state.nodeHoles.get(n)[0].col;
    return ![col - 1, col, col + 1].some((c) => railCols.has(c));
  });
  if (rail && missing) return { severity: 'info', code: 'NO_FIT_RAIL', params: { part: id, groups: Object.values(wanted).join(', '), rail, columns: boardLayout(state.board).railColumns } };
  return { severity: 'info', code: 'NO_FIT', params: { part: id, groups: Object.values(wanted).join(', ') || '—' } };
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
  const list = items ?? [];
  // What the later items will connect to ("U1.OUT", "9:a-e"): each needs a hole there, so
  // every placement keeps that room (refs to parts not placed yet resolve once they are).
  const refsOf = (item) => [...(item.between ?? []), ...Object.values(item.connect ?? {})].filter((r) => typeof r === 'string');
  for (const [k, item] of list.entries()) {
    const reserve = { ...options.reserve };
    for (const later of list.slice(k + 1)) for (const ref of refsOf(later)) reserve[ref] = (reserve[ref] ?? 0) + 1;
    // A part that hangs from one that could not be placed waits for it (not "not a hole").
    const missing = refsOf(item).map((ref) => /^([^.\s]+)\./.exec(ref)?.[1]).find((other) => other && failed.some((f) => f.id === other));
    if (missing) {
      failed.push({ id: item.part?.id ?? item.part?.type, problem: { severity: 'info', code: 'DEPENDS_ON_FAILED', params: { part: item.part?.id ?? item.part?.type, other: missing } } });
      continue;
    }
    const r = suggest(current, item.part, { ...options, between: item.between, connect: item.connect, near: item.near, limit: 1, reserve, dependents: list.slice(k + 1) });
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

