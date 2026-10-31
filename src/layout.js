// A whole circuit placed in one call, from what it connects, without trial and error:
//
//   autoLayout({ board, parts: [{ id, type, … }], nets: [["D1.K", "S1.1"], { pins: ["U1.GND", "T-"], color: "black" }], supplies, … })
//     → { circuit, placed, wires, columns, problems, check, review, ms }
//
// The classic place → route → verify flow of circuit layout tools, cut down to a breadboard
// (docs/en/layout.md explains each step and its numbers):
// 1. Layers (as in Sugiyama-style schematic layout): each part's distance from the source over
//    the nets, so the board reads left to right in signal order; ties keep the order given.
// 2a. Sides: which half of the board (T, rows f–j, or B, rows a–e) each part goes in, from the
//    nets: a two-way partition across the centre channel that cuts as few nets as it can, with a
//    soft balance (src/layout-sides.js, Fiduccia–Mattheyses passes). A chip across the channel
//    has pins on both halves (its pin 1 row is part of the choice); a rail pulls its nets' pins to
//    its half; a button or a board placed by pin 1 is fixed.
// 2b. Placement, one column cursor per half. Each part gets a list of candidates from rules
//    (three in a row; two leads upright on a rail or along a row; a footprint of the package, as a
//    DIP or a button; each lead of a part off the board to a strip of its net, a rail or a fresh
//    strip; a development board by pin 1), on strips that are empty or already of the same net.
//    They are scored (a jumper and the distance to the net for each pin that does not share a
//    strip, the distance from the cursor, the row by the rails, a tall part's way to its rail kept
//    in sight) and tried in that order with the geometry check (occupancy, leads, bodies,
//    crossings, clearance: milliseconds, no drawing); suggest when none passes.
// 3. Jumpers: each net's strips and rails joined as a minimum spanning tree (Kruskal over the
//    pairs of free holes, by length and the bodies a jumper would arch over; a pair the geometry
//    rejects is skipped), in the net's colour (black for a − rail, red for a +, else one per net).
// 4. Verify: the nets built against the nets asked for (nothing missing, nothing shorted) and the
//    lesson review; while it blocks something, lay out again without the place of the part or
//    jumper placed last among those it names (autoLayout, a few tries, the geometry checks of the
//    steps that repeat remembered).

import { suggest } from './query.js';
import { applyOps } from './ops.js';
import { buildCircuit } from './circuit/build.js';
import { problemKey } from './diff.js';
import { review } from './review.js';
import { PART_TYPES } from './parts/types/index.js';
import { PACKAGES } from './parts/packages/index.js';
import { SWITCH_STYLES } from './parts/types/switch.js';
import { resolvePart, pinsOf } from './parts/resolve.js';
import { findPin } from './parts/pin-names.js';
import { checkNets, internalLinks } from './nets.js';
import { assignSides } from './layout-sides.js';
import { BOARDS, railName, boardSides, channelPairs } from './board/board.js';

export { checkNets };
import { strayFields, fieldsOfType } from './parts/fields.js';

const PALETTE = ['orange', 'green', 'yellow', 'blue', 'white', 'violet'];
const TALL = new Set(['TO-220', 'ams1117-module']);
const KNOBS = new Set(['pot-vertical']); // packages with a knob towards the front
const HELD_UP = new Set([...TALL, ...KNOBS]); // bodies held up off the board: leads and jumpers pass below their box
const BESIDE = new Set(['switch', 'module', 'battery']); // bodies off the board: only their holes count
const SPAN = 8; // columns a part may slide past the cursor looking for room
const HEADROOM = SPAN + 12; // columns the elastic board keeps past the circuit while placing
const MAX_TRIED = 16; // a part's best candidates by cost tried with tryOps before suggest
const JUMPER_COST = 10; // mm of wire a candidate pays for each jumper it will need
const CURSOR_COST = 0.5; // mm per column a candidate pays for being away from its half's cursor
const CROSS_WEIGHT = 8; // columns of imbalance a net across the channel is worth (side assignment)
const SIDE_SLACK = 10; // columns one half may hold more than the other before it costs
const PAIRS_PER_GROUP = 40; // jumper hole pairs measured per pair of groups, cheapest first
const JOIN_TRIES = 40; // pairs the geometry may reject before a net's join gives up
const EDGE_ROW_COST = 5; // mm a part lying along the row next to the rails pays
const SHADOW_COST = 25; // mm a hole pays in the shadow of a tall part (see costOf)
const OVER_COST = 12; // mm of extra wire a jumper is worth not to arch over a body
const REACH_MARGIN = 0.6; // mm: half a jumper's end, past the clearance, for a hole to count as reachable
const UNDER_MARGIN = 1; // mm inside a body's box from above for a hole to count as under it
const OVER_MARGIN = 0.3; // mm: a jumper ending at a body's edge does not cross it
const pinKey = (ref) => {
  const m = /^([^.\s]+)\.(\S+)$/.exec(String(ref).trim());
  return m ? `${m[1]}.${m[2].toLowerCase()}` : null;
};

// Whether the segment p–q passes over a box { x0, x1, y0, y1 } shrunk by `margin` (Liang–Barsky):
// a jumper that only ends beside a body does not cross it.
function crosses(p, q, box, margin) {
  const [x0, x1, y0, y1] = [box.x0 + margin, box.x1 - margin, box.y0 + margin, box.y1 - margin];
  if (x0 >= x1 || y0 >= y1) return false;
  const dx = q.x - p.x;
  const dy = q.y - p.y;
  let lo = 0;
  let hi = 1;
  for (const [d, n] of [[-dx, p.x - x0], [dx, x1 - p.x], [-dy, p.y - y0], [dy, y1 - p.y]]) {
    if (d === 0) {
      if (n < 0) return false;
    } else {
      const r = n / d;
      if (d < 0) lo = Math.max(lo, r);
      else hi = Math.min(hi, r);
    }
  }
  return lo < hi;
}

function bodyRight(part) {
  let max = -Infinity;
  for (const prim of part.built?.body ?? []) for (const f of prim.faces) for (const p of f.pts) max = Math.max(max, p.x);
  return max;
}

// Problems that matter to a placement: errors, warnings, and parts closer than the clearance.
const blocking = (issues) => issues.filter((i) => i.severity !== 'info' || i.code === 'TOO_CLOSE');

// Layout again while the review blocks something, each time forbidding the place of the part (or
// jumper) placed last among the ones a blocking item names: the whole layout takes well under a
// second, so this is simpler and more predictable than patching in place. Keeps the best try.
const TRIES = 8;
const REPAIRS = 4; // jumpers the repair may route again with suggest (each one measures drawings)

// Everything a list of parts and nets can get wrong, found in one pass before placing anything:
// names the kit does not know (with the closest ones), repeated ids, nets that name a part or a
// pin that is not there (with the pins it has), parts in no net. Parts come back resolved
// ("7805" → regulator 7805, "KCD1" → rocker switch).
export function validateSpec(spec) {
  const problems = [];
  const parts = [];
  const seen = new Set();
  for (const raw of spec.parts ?? []) {
    if (!raw?.id) {
      problems.push({ severity: 'error', code: 'MISSING_ID', params: { index: parts.length + 1 } });
      continue;
    }
    if (seen.has(raw.id)) problems.push({ severity: 'error', code: 'DUPLICATE_ID', params: { part: raw.id } });
    seen.add(raw.id);
    const r = resolvePart(raw);
    if (r.error) problems.push(r.error);
    else {
      parts.push(r.part);
      for (const field of strayFields(r.part)) problems.push({ severity: 'error', code: 'UNKNOWN_FIELD', params: { part: r.part.id, field, fields: fieldsOfType(r.part.type).join(', ') } });
    }
  }
  const byId = new Map(parts.map((p) => [p.id, p]));
  const inNet = new Set();
  const rails = BOARDS[spec.board ?? 'auto']?.rails.map((r) => r.id);
  const checkRef = (ref, where) => {
    if (railName(ref)) {
      if (rails && !rails.includes(railName(ref))) problems.push({ severity: 'error', code: 'NET_UNKNOWN_RAIL', params: { where, ref: String(ref), board: spec.board ?? 'auto', rails: rails.join(', ') } });
      return;
    }
    const m = /^([^.\s]+)\.(\S+)$/.exec(String(ref).trim());
    if (!m) {
      problems.push({ severity: 'error', code: 'NET_BAD_REF', params: { where, ref: String(ref) } });
      return undefined;
    }
    const part = byId.get(m[1]);
    if (!part) {
      if (!seen.has(m[1])) problems.push({ severity: 'error', code: 'NET_UNKNOWN_PART', params: { where, ref: String(ref), part: m[1], parts: [...seen].join(', ') } });
      return;
    }
    inNet.add(part.id);
    const names = pinsOf(part);
    if (!names.length) return ref;
    const name = findPin(names, m[2]);
    if (name === undefined) problems.push({ severity: 'error', code: 'NET_UNKNOWN_PIN', params: { where, ref: String(ref), part: part.id, pin: m[2], names: names.join(', ') } });
    return name === undefined ? ref : `${part.id}.${name}`;
  };
  // Pin references come back in the part's own names ("D1.K" → "D1.cathode", "U1.GPIO4" → "U1.D4").
  const nets = (spec.nets ?? []).map((n, i) => {
    const pins = (Array.isArray(n) ? n : n?.pins ?? []).map((ref) => checkRef(ref, i + 1) ?? ref);
    return Array.isArray(n) ? pins : { ...n, pins };
  });
  const supplies = spec.supplies?.map((s) => {
    const out = { ...s };
    for (const key of ['positive', 'negative']) if (s[key] != null) out[key] = checkRef(s[key], s.id ?? 'supply') ?? s[key];
    return out;
  });
  for (const p of parts) if (!inNet.has(p.id)) problems.push({ severity: 'warning', code: 'PART_IN_NO_NET', params: { part: p.id } });
  return { parts, nets, ...(supplies && { supplies }), problems, ok: !problems.some((p) => p.severity === 'error') };
}

// previous: the circuit as it is (layout again on an existing target). Each part and jumper first
// tries the holes it already has, so a change moves only what it must and a learner's build stays
// as it is.
//
// A development board that covers a whole strip of a pin in a net on one board (a DevKit with nets
// on both headers: LAYOUT_PIN_COVERED) goes on a double board when the spec does not name one: two
// boards side by side, the DevKit across the joint with a free strip under each header
// (LAYOUT_DOUBLE_BOARD; docs/en/layout.md, "Two boards").
export function autoLayout(spec, options = {}) {
  const single = layoutSpec(spec, options);
  const covered = single.problems?.find((p) => p.code === 'LAYOUT_PIN_COVERED');
  if (!covered || (spec.board ?? 'auto') !== 'auto') return single;
  const { spec: twin, renamed } = onDoubleBoard(spec);
  const double = layoutSpec(twin, options);
  if (double.problems.some((p) => p.code === 'LAYOUT_PIN_COVERED')) return single;
  const notes = [{ severity: 'info', code: 'LAYOUT_DOUBLE_BOARD', params: covered.params }];
  if (renamed.length) notes.push({ severity: 'info', code: 'LAYOUT_DOUBLE_RAILS', params: { rails: renamed.join(', ') } });
  return { ...double, notes: [...notes, ...double.notes], tries: single.tries + double.tries, ms: single.ms + double.ms };
}

// The spec on the double board: T+ and T- (the rails taken off it) become its back pair, U+ and U-.
const DOUBLE_RAILS = { 'T+': 'U+', 'T-': 'U-' };
function onDoubleBoard(spec) {
  const renamed = new Set();
  const rename = (ref) => {
    const to = DOUBLE_RAILS[railName(ref)];
    if (!to) return ref;
    renamed.add(`${railName(ref)} → ${to}`);
    return to;
  };
  const nets = spec.nets?.map((n) => (Array.isArray(n) ? n.map(rename) : n && { ...n, pins: n.pins?.map(rename) }));
  const supplies = spec.supplies?.map((s) => ({ ...s, ...(s.positive != null && { positive: rename(s.positive) }), ...(s.negative != null && { negative: rename(s.negative) }) }));
  const netLabels = spec.netLabels && Object.fromEntries(Object.entries(spec.netLabels).map(([k, v]) => [rename(k), v]));
  const twin = { ...spec, board: 'double', ...(nets && { nets }), ...(supplies && { supplies }), ...(netLabels && { netLabels }) };
  return { spec: twin, renamed: [...renamed].sort() };
}

function layoutSpec(spec, { profile = 'lesson', checkOnly = false, previous = null } = {}) {
  const started = Date.now();
  const valid = validateSpec(spec);
  if (checkOnly || !valid.ok) return { status: valid.ok ? 'spec_ok' : 'fix_spec', invalid: !valid.ok, checked: true, parts: valid.parts, nets: valid.nets, problems: valid.problems, ms: Date.now() - started };
  const asked = {
    ...(spec.recipe && { recipe: spec.recipe }),
    nets: valid.nets,
    ...(valid.supplies?.some((s) => pinKey(s.positive) || pinKey(s.negative)) && { supplies: valid.supplies }),
  };
  const notes = [];
  spec = { ...spec, parts: valid.parts, nets: groundToRail(valid.nets, valid.parts, valid.supplies, notes, BOARDS[spec.board ?? 'auto']), ...(valid.supplies && { supplies: valid.supplies }) };
  const forbid = new Set(); // "id pins" keys
  // Every try starts from an empty board and decides the same way until it meets a place forbidden
  // since: the geometry checks of the steps before are remembered, not built again.
  const memo = new Map();
  const boxes = new Map();
  const troubled = new Map(); // part → tries in which it was hidden by a jumper or hid one
  let best = null;
  let tries = 0;
  for (let attempt = 0; attempt < TRIES; attempt++) {
    tries++;
    const r = layoutOnce(spec, { profile, forbid, previous, memo, boxes });
    const score = (x) => (x.check.ok ? 0 : 100) + x.problems.length * 10 + x.review.blocking.length;
    if (!best || score(r) < score(best)) best = r;
    if (r.check.ok && r.review.verdict === 'approved' && !r.problems.length) break;
    // A board covering a pin's strip is no place problem another try can fix.
    if (r.problems.some((p) => p.code === 'LAYOUT_PIN_COVERED')) break;
    const rank = new Map(r.sequence.map((id, i) => [id, i]));
    const partOf = (id) => r.circuit.parts.find((p) => p.id === id);
    const latest = (ids) => ids.filter((v) => rank.has(v)).sort((x, y) => rank.get(y) - rank.get(x))[0];
    let added = false;
    let board = null;
    // `link`: the jumper's two groups are not to be joined directly at all (the net joins them
    // some other way), not only through those two holes.
    const strike = (victim, link = false) => {
      const part = victim && partOf(victim);
      if (!part) return;
      const keys = [forbidKey(part)];
      if (part.type === 'wire' && link) {
        board ??= buildCircuit(r.circuit).board;
        keys.push(linkKey(...part.pins.map((id) => board.find(id)?.node)));
      }
      for (const key of keys) {
        if (forbid.has(key)) continue;
        forbid.add(key);
        added = true;
      }
    };
    for (const b of r.review.blocking) {
      let victim = latest(Object.values(b.params ?? {}).map(String));
      // A jumper that hides a part or is hidden by one: the first time the jumper moves; the second
      // time (the same part in such trouble in a try before) the part moves, since moving jumpers
      // did not help (its strips have no free hole in sight, or every way round crosses it); after
      // that the link itself goes, so the net joins those groups some other way.
      let link = false;
      if (b.code === 'PART_HIDDEN' && partOf(victim)?.type === 'wire') {
        const wire = victim;
        const involved = [b.params.part, b.params.by].filter((id) => partOf(id) && partOf(id).type !== 'wire');
        const times = Math.max(0, ...involved.map((id) => troubled.get(id) ?? 0));
        for (const id of involved) troubled.set(id, (troubled.get(id) ?? 0) + 1);
        if (times === 1) victim = latest(involved.filter((id) => troubled.get(id) > 1)) ?? victim;
        // A jumper over a part: the way it goes is the trouble, so its link goes at once.
        link = victim === wire && (times >= 2 || partOf(b.params.by)?.type === 'wire');
      }
      strike(victim, link);
    }
    // A net left apart: the part placed last on the strips no jumper could join moves.
    for (const p of r.problems) if (p.code === 'LAYOUT_WIRE_FAILED') strike(latest(p.parts ?? []));
    if (!added) break;
  }
  // A covered pin: no jumper reaches it, so the repair (seconds of suggest) cannot help.
  if (!(best.check.ok && best.review.verdict === 'approved' && !best.problems.length) && !best.problems.some((p) => p.code === 'LAYOUT_PIN_COVERED')) best = repair(best, spec, { profile });
  // Kept in the circuit: what was asked (not the conventions added to it) and which wires are
  // layout's own jumpers, so layout can run again on it and review can check the connections.
  const ids = new Set(spec.parts.map((p) => p.id));
  const circuit = { ...best.circuit, spec: { ...asked, wires: best.circuit.parts.filter((p) => p.type === 'wire' && !ids.has(p.id)).map((p) => p.id) } };
  // One verdict for the whole answer: the nets, the placement problems and the review together,
  // so a caller that reads only the last line cannot take "review approved" for done.
  const status = best.check.ok && best.review.verdict === 'approved' && !best.problems.length ? 'done' : 'changes';
  return { ...best, circuit, notes: [...notes, ...(best.notes ?? [])], status, tries, ms: Date.now() - started };
}

// Pins that are ground by name: GND, GND2, VSS, 0V.
const GROUND_PIN = /^(GND\d*|VSS|0V)$/i;

// Convention of every breadboard: ground lives on a − rail. A net with a ground pin (or a supply's
// negative) and no rail gets the − rail the other nets use, else B−. One short jumper per strip
// then joins it, instead of a chain of jumpers along the board.
//
// On a double board (two boards side by side, a development board across the joint) ground goes
// on both outer − rails, B- and U-, when no net names a − rail, so each board's parts reach ground
// on their own side; and the net takes the board's other ground pins (a DevKit's GND2 for GND,
// joined inside it), so each rail is joined to the ground pin of its own header with a short
// jumper, never across the board.
function groundToRail(nets, parts, supplies, notes, board) {
  const negatives = new Set((supplies ?? []).map((s) => pinKey(s.negative)).filter(Boolean));
  const pinsOfNet = (n) => (Array.isArray(n) ? n : n.pins);
  const named = nets.flatMap(pinsOfNet).map(railName).find((r) => r?.endsWith('-'));
  const double = Boolean(board?.junction);
  const rails = named ? [named] : double ? board.rails.filter((r) => r.polarity === '-').map((r) => r.id).sort() : ['B-'];
  const partners = (ref) => {
    if (!double) return [];
    const [id, pin] = [String(ref).split('.')[0], String(ref).split('.').slice(1).join('.')];
    const part = parts.find((p) => p.id === id);
    const group = part && (PART_TYPES[part.type]?.resolve(part).internal ?? []).find((g) => g.some((n) => n.toLowerCase() === pin.toLowerCase()));
    return (group ?? []).filter((n) => n.toLowerCase() !== pin.toLowerCase()).map((n) => `${id}.${n}`);
  };
  const told = new Set(); // ground pins whose partners a note already named
  return nets.map((n, i) => {
    const pins = pinsOfNet(n);
    if (pins.some(railName)) return n;
    const ground = pins.find((ref) => negatives.has(pinKey(ref)) || GROUND_PIN.test(String(ref).split('.').slice(1).join('.')));
    if (!ground) return n;
    if (rails.length > 1) notes.push({ severity: 'info', code: 'LAYOUT_GROUND_TO_RAILS', params: { net: i + 1, pin: ground, rails: rails.join(', ') } });
    else notes.push({ severity: 'info', code: 'LAYOUT_GROUND_TO_RAIL', params: { net: i + 1, pin: ground, rail: rails[0] } });
    const more = [...new Set(pins.filter((ref) => ref === ground || GROUND_PIN.test(String(ref).split('.').slice(1).join('.'))).flatMap(partners))].filter((ref) => !pins.some((p) => pinKey(p) === pinKey(ref)));
    if (more.length && !told.has(pinKey(ground))) notes.push({ severity: 'info', code: 'LAYOUT_GROUND_PARTNERS', params: { pin: ground, pins: more.join(', ') } });
    told.add(pinKey(ground));
    const out = [...pins, ...more, ...rails];
    return Array.isArray(n) ? out : { ...n, pins: out };
  });
}

// What the relayout loop could not fix, tried once more on the best try, jumper by jumper: a net
// left apart and a jumper named by a blocking item are routed again with suggest (which measures
// what a wire hides in both views, and may go through a free strip: VIA_WIRE). A repair is kept
// only when the nets stay right and nothing new blocks.
function repair(best, spec, { profile }) {
  let { circuit, problems, check, review: verdict } = best;
  const notes = [];
  const score = (c, v, p) => (c.ok ? 0 : 100) + p.length * 10 + v.blocking.length;
  const nets = spec.nets.map((n) => (Array.isArray(n) ? { pins: n } : n));
  let left = REPAIRS;
  const attempt = (remove, between, color, fixed) => {
    if (left-- <= 0) return false;
    const base = remove ? applyOps(circuit, [{ op: 'remove', part: remove }]).circuit : circuit;
    const s = suggest(base, { type: 'wire', ...(color && { color }) }, { between, profile, limit: 1, candidates: 8, maxCandidates: 24, via: false });
    const ops = s.placements?.[0]?.ops;
    if (!ops) return false;
    const r = applyOps(base, ops);
    if (r.errors.length) return false;
    const c = checkNets(r.circuit, nets);
    const v = review(r.circuit, { profile, views: ['front', 'back'] });
    const p = problems.filter((x) => x !== fixed);
    if (score(c, v, p) >= score(check, verdict, problems)) return false;
    ({ circuit, check, review: verdict, problems } = { circuit: r.circuit, check: c, review: v, problems: p });
    notes.push({ severity: 'info', code: 'LAYOUT_REPAIRED', params: { from: between[0], to: between[1] } });
    return true;
  };
  for (const p of problems.filter((x) => x.code === 'LAYOUT_WIRE_FAILED')) attempt(null, [p.params.from, p.params.to], null, p);
  const wiresOf = (b) => (b.parts ?? []).map((id) => circuit.parts.find((q) => q.id === id)).filter((q) => q?.type === 'wire');
  for (const b of [...verdict.blocking]) {
    for (const w of wiresOf(b)) {
      if (!circuit.parts.includes(w)) continue;
      const built = buildCircuit(circuit).parts.find((q) => q.id === w.id);
      if (built?.holes?.length !== 2) continue;
      attempt(w.id, built.holes.map((h) => h.node), w.color, null);
    }
  }
  return { ...best, circuit, problems, check, review: verdict, notes };
}

// The spec of a circuit already laid out, for layout again: its parts (without holes and without
// layout's jumpers, or without any wire when it has no spec: the nets say what they join), the nets
// and supplies it was laid out with, and its settings; anything given replaces what is there. The
// recipe it came from stays only while its parts and nets do.
export function specFromCircuit(circuit, given = {}) {
  const jumpers = new Set(circuit.spec?.wires ?? []);
  const parts = (circuit.parts ?? []).filter((p) => (circuit.spec ? !jumpers.has(p.id) : p.type !== 'wire')).map(({ pins, pin1, ...rest }) => rest);
  const pick = (k) => given[k] ?? circuit[k];
  return Object.fromEntries(
    Object.entries({
      parts: given.parts ?? parts,
      nets: given.nets ?? circuit.spec?.nets,
      recipe: given.recipe ?? (given.parts || given.nets ? undefined : circuit.spec?.recipe),
      supplies: given.supplies ?? circuit.spec?.supplies ?? circuit.supplies,
      board: pick('board'),
      clearance: pick('clearance'),
      title: pick('title'),
      lang: pick('lang'),
      netLabels: pick('netLabels'),
      page: pick('page'),
    }).filter(([, v]) => v !== undefined),
  );
}

const linkKey = (a, b) => `link ${[a, b].sort().join(' ')}`;
const forbidKey = (part) => (part.type === 'wire' ? `wire ${[...part.pins].sort().join(' ')}` : `${part.id} ${JSON.stringify(part.pins ?? part.pin1)}`);

// Asked nets that share a pin or a rail are one electrical net (as checkNets reads them): a lead
// may go into any rail of its electrical net, and the sides are decided over them. Each net gets
// `enet`, its electrical net ({ id, pins, rails }).
function electricalNets(nets) {
  const parent = nets.map((_, i) => i);
  const find = (i) => {
    while (parent[i] !== i) i = parent[i] = parent[parent[i]];
    return i;
  };
  const owner = new Map();
  const keysOf = (n) => [...n.refs.map(pinKey).filter(Boolean), ...n.rails];
  nets.forEach((n, i) => {
    for (const k of keysOf(n)) {
      if (owner.has(k)) parent[find(i)] = find(owner.get(k));
      else owner.set(k, i);
    }
  });
  const groups = new Map();
  nets.forEach((n, i) => {
    const r = find(i);
    if (!groups.has(r)) groups.set(r, { id: groups.size, pins: [], rails: [] });
    const g = groups.get(r);
    for (const k of n.refs.map(pinKey).filter(Boolean)) if (!g.pins.includes(k)) g.pins.push(k);
    for (const rail of n.rails) if (!g.rails.includes(rail)) g.rails.push(rail);
    n.enet = g;
  });
  return [...groups.values()];
}

// The box a body covers seen from above.
function footprintOf(part) {
  const box = { x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity };
  for (const prim of part.built?.body ?? []) for (const f of prim.faces) for (const q of f.pts) {
    box.x0 = Math.min(box.x0, q.x);
    box.x1 = Math.max(box.x1, q.x);
    box.y0 = Math.min(box.y0, q.y);
    box.y1 = Math.max(box.y1, q.y);
  }
  return box;
}

function layoutOnce(spec, { profile, forbid, previous, memo = new Map(), boxes = new Map() }) {
  // A part's box from above, by its holes (the same part in the same holes has the same body).
  const boxOf = (p) => {
    const key = `${p.id} ${p.holes.map((h) => h?.id).join(' ')}`;
    if (!boxes.has(key)) boxes.set(key, footprintOf(p));
    return boxes.get(key);
  };
  const before0 = new Map((previous?.parts ?? []).map((p) => [p.id, p]));
  const started = Date.now();
  const problems = [];
  let circuit = Object.fromEntries(
    Object.entries({ version: 1, lang: spec.lang, title: spec.title, board: spec.board ?? 'auto', clearance: spec.clearance ?? 1, netLabels: spec.netLabels, page: spec.page, parts: [] }).filter(([, v]) => v !== undefined),
  );
  const nets = (spec.nets ?? []).map((n, index) => {
    const raw = Array.isArray(n) ? { pins: n } : n;
    const pins = (raw.pins ?? []).map(String);
    return { index, pins, color: raw.color, rails: pins.map(railName).filter(Boolean), refs: pins.filter((p) => !railName(p)) };
  });
  const netOf = new Map();
  for (const net of nets) for (const ref of net.refs) if (pinKey(ref)) netOf.set(pinKey(ref), net);
  const enets = electricalNets(nets);
  const enetOf = new Map();
  for (const e of enets) for (const k of e.pins) enetOf.set(k, e);
  let colour = 0;
  const colourOf = (net) => net.color ?? (net.rails.some((r) => r.endsWith('-')) ? 'black' : net.rails.some((r) => r.endsWith('+')) ? 'red' : (net.auto ??= PALETTE[colour++ % PALETTE.length]));

  // State, rebuilt after each change (geometry only: fast).
  let built = buildCircuit(circuit, { headroom: HEADROOM });
  let baseline = new Set(blocking(built.issues).map(problemKey));
  const used = () => new Set(built.parts.flatMap((p) => p.holes.map((h) => h?.id)));
  const holeOf = (ref) => {
    for (const p of built.parts) {
      const i = p.pinNames.findIndex((n) => `${p.id}.${n.toLowerCase()}` === pinKey(ref));
      if (i >= 0) return p.holes[i];
    }
    return null;
  };
  // Apply the ops if they add no blocking problem; true when applied.
  const tryOps = (ops) => {
    const key = `${JSON.stringify(circuit.parts)}|${JSON.stringify(ops)}`;
    if (!memo.has(key)) memo.set(key, check(ops));
    const r = memo.get(key);
    if (!r) return false;
    ({ circuit, built, baseline } = r);
    return true;
  };
  const check = (ops) => {
    const r = applyOps(circuit, ops);
    if (r.errors.length) return null;
    const next = buildCircuit(r.circuit, { headroom: HEADROOM });
    if (next.issues.some((i) => i.severity === 'error')) return null;
    const after = blocking(next.issues);
    if (after.some((i) => !baseline.has(problemKey(i)) && !(i.code === 'FLOATING_PIN'))) return null;
    return { circuit: r.circuit, built: next, baseline: new Set(after.map(problemKey)) };
  };
  // What is on each strip (node → electrical net id, or "x…" for a pin in no net) and where each
  // electrical net already has holes, from the parts placed so far.
  const occupancy = () => {
    const occ = new Map();
    const at = new Map();
    for (const p of built.parts) {
      if (p.type === 'wire') continue;
      p.holes.forEach((h, i) => {
        if (!h) return;
        const key = `${p.id}.${String(p.pinNames[i]).toLowerCase()}`;
        const e = enetOf.get(key);
        if (h.kind === 'main' && !occ.has(h.node)) occ.set(h.node, e ? e.id : `x${key}`);
        if (e) {
          if (!at.has(e.id)) at.set(e.id, []);
          at.get(e.id).push(h);
        }
      });
    }
    return { occ, at };
  };
  const railY = new Map();
  for (const h of built.board.holes.values()) if (h.kind === 'rail' && !railY.has(h.row)) railY.set(h.row, h.pos.y);
  const P = built.board.pitch;
  // The board's halves (src/board/board.js, boardSides): T and B, plus K and U on a double board.
  const halfInfo = boardSides(built.board.spec);
  const halfOfRow = (row) => halfInfo.ofRow.get(row);
  const across = {};
  for (const { back, front } of channelPairs(built.board.spec)) [across[halfOfRow(back)], across[halfOfRow(front)]] = [halfOfRow(front), halfOfRow(back)];

  // 1. Layers: breadth-first from the source over the nets (rails do not join stages).
  const parts = (spec.parts ?? []).filter((p) => {
    if (PART_TYPES[p.type] && p.id) return true;
    problems.push({ severity: 'error', code: PART_TYPES[p.type] ? 'MISSING_ID' : 'UNKNOWN_TYPE', params: { part: p.id ?? '?', type: String(p.type), index: 0, options: Object.keys(PART_TYPES).join(', ') } });
    return false;
  });
  const neighbours = new Map(parts.map((p) => [p.id, new Set()]));
  for (const net of nets) {
    const ids = [...new Set(net.refs.map((r) => r.split('.')[0]))].filter((id) => neighbours.has(id));
    for (const a of ids) for (const b of ids) if (a !== b) neighbours.get(a).add(b);
  }
  const sourceRef = spec.supplies?.map((s) => s.positive).find((r) => pinKey(r));
  const source = sourceRef?.split('.')[0] ?? parts[0]?.id;
  const layer = new Map([[source, 0]]);
  for (let queue = [source]; queue.length; ) {
    const id = queue.shift();
    for (const n of [...(neighbours.get(id) ?? [])].sort((a, b) => parts.findIndex((p) => p.id === a) - parts.findIndex((p) => p.id === b))) {
      if (!layer.has(n)) {
        layer.set(n, layer.get(id) + 1);
        queue.push(n);
      }
    }
  }
  const given = new Map(parts.map((p, i) => [p.id, i]));
  const order = [...parts].sort((a, b) => (layer.get(a.id) ?? Infinity) - (layer.get(b.id) ?? Infinity) || given.get(a.id) - given.get(b.id));

  // What each part is: its pins and the rule that places it.
  const infos = new Map();
  for (const part of order) {
    const type = PART_TYPES[part.type];
    const named = [...netOf.keys()].filter((k) => k.split('.')[0] === part.id).map((k) => k.split('.')[1]);
    const def = type.resolve(part);
    const beside = def.error?.code === 'MODULE_PINS';
    const pkg = PACKAGES[def.package];
    let pinNames = def.error ? named : def.pinNames ?? type.pins ?? named;
    if (beside && part.type === 'switch') {
      const style = SWITCH_STYLES[part.style ?? 'rocker'];
      const partners = style.on.filter((pair) => pair.some((n) => named.includes(n.toLowerCase()))).flat();
      pinNames = style.pins.filter((n) => named.includes(n.toLowerCase()) || partners.includes(n));
    }
    const kind = beside ? 'beside' : part.type === 'module' && pkg?.expandPin1 ? 'board' : pkg?.inline && pinNames.length === 3 ? 'inline' : pkg?.span && pinNames.length === 2 ? 'span' : pkg?.footprints ? 'footprints' : 'other';
    infos.set(part.id, { part, def, pkg, pinNames, named, kind, straddles: false });
  }
  const keyOf = (part, pin) => `${part.id}.${String(pin).toLowerCase()}`;
  // A three-in-a-row part whose every pin joins exactly one lead of a part beside the board (a
  // potentiometer on an UNO's 5V, A0 and GND) comes right after it: the leads land side by side for
  // it (step 2b), and nothing placed in between takes those strips.
  for (let i = 0; i < order.length; i++) {
    const p = infos.get(order[i].id);
    if (p.kind !== 'beside') continue;
    const leads = (e) => p.pinNames.filter((pin) => enetOf.get(keyOf(p.part, pin)) === e).length;
    const j = order.findIndex((q, k) => k > i + 1 && infos.get(q.id).kind === 'inline' && infos.get(q.id).pinNames.every((n) => leads(enetOf.get(keyOf(q, n))) === 1));
    if (j > 0) order.splice(i + 1, 0, ...order.splice(j, 1));
  }

  // A board over the channel hides the holes between its two rows of pins and under its PCB: how
  // many free holes each pin in a net keeps on its strip outside the board and its overhang.
  const spareOf = (info, holes) => {
    const y = new Map(built.board.spec.rows.map((r) => [r.id, r.y]));
    const over = Math.max(0, ((info.def.params.size?.[1] ?? 0) / P - info.def.params.rowSpacing) / 2); // PCB past its pins, in rows
    const span = holes.map((id) => y.get(built.board.find(id).row));
    const [lo, hi] = [Math.min(...span), Math.max(...span)];
    const taken = used();
    return info.named.map((n) => {
      const h = built.board.find(holes[info.pinNames.findIndex((x) => x.toLowerCase() === n)]);
      return h ? [...built.board.holes.values()].filter((o) => o.node === h.node && (y.get(o.row) < lo - over || y.get(o.row) > hi + over) && !taken.has(o.id)).length : 0;
    });
  };
  // Pin 1 where every pin in a net keeps free holes on its strip, most first (a DevKit with pin 1
  // in row a hides the rest of those strips; in row c it leaves row a).
  const pin1Options = (info, columns) => {
    const options = [];
    for (const c of columns) {
      for (const row of built.board.spec.rows) {
        const holes = info.pkg.expandPin1(built.board, `${row.id}${c}`, info.def.params);
        if (!holes) continue;
        const spare = spareOf(info, holes);
        options.push({ pin1: `${row.id}${c}`, holes, score: Math.min(2, ...spare) * 100 + spare.reduce((a, b) => a + b, 0) });
      }
    }
    return options.sort((a, b) => b.score - a.score);
  };

  // 2a. Sides: which half each part goes in, from the nets (src/layout-sides.js).
  const elements = [];
  for (const part of order) {
    const info = infos.get(part.id);
    const inNet = (pin) => enetOf.has(keyOf(part, pin));
    if (info.kind === 'beside') {
      // A board lying behind the board (the default) or in front: its leads land on the near half,
      // so they arch over as little of the board as they can.
      const lean = part.type === 'module' ? (part.side === 'front' ? halfInfo.order[0] : halfInfo.back) : undefined;
      for (const pin of info.pinNames) if (inNet(pin)) elements.push({ id: keyOf(part, pin), weight: 2, pins: [{ key: keyOf(part, pin), rel: 0 }], lean });
      continue;
    }
    let halves = null;
    let fixed = null;
    if (info.kind === 'board') {
      const best = pin1Options(info, Array.from({ length: SPAN }, (_, k) => 2 + k))[0];
      halves = best?.holes.map((id) => halfOfRow(built.board.find(id).row));
      fixed = halves?.[0];
    } else if (info.kind === 'footprints') {
      const fp = info.pkg.footprints(built.board, info.def.params)[0];
      const hs = fp?.map((id) => built.board.find(id));
      if (hs?.every((h) => h?.kind === 'main')) halves = hs.map((h) => halfOfRow(h.row));
      if (halves && !info.pkg.expandPin1) fixed = halves[0]; // a button: pin 1 always in the back row
    }
    info.straddles = Boolean(halves && new Set(halves).size > 1);
    if (!info.straddles) fixed = null;
    // A board's pins lie on the sides its rows are on (across the joint of a double board too).
    const pins = info.pinNames.map((pin, i) => ({ key: keyOf(part, pin), ...(info.kind === 'board' && info.straddles ? { at: halves[i] } : { rel: info.straddles && halves[i] !== halves[0] ? 1 : 0 }) })).filter((p) => enetOf.has(p.key));
    const toRail = info.pinNames.some((pin) => enetOf.get(keyOf(part, pin))?.rails.length);
    const k = info.kind === 'span' ? Math.max(2, Math.ceil(info.pkg.span(info.def.params).min / P - 1e-6)) : 0;
    const weight = info.kind === 'span' ? (toRail ? 2 : k + 2) : info.kind === 'inline' ? 4 : info.pinNames.length + 2;
    // A potentiometer's knob faces the front: on the front half it covers the strips' way to the
    // front rails, on the back half only the channel.
    const lean = KNOBS.has(info.def.package) ? 'T' : undefined;
    elements.push({ id: part.id, weight, pins, fixed, straddles: info.straddles, lean });
  }
  const railHalves = (e) => new Set(e.rails.map((r) => r[0]));
  const sides = assignSides({
    elements,
    sides: halfInfo.order,
    across,
    nets: enets.map((e) => ({ pins: e.pins, anchor: railHalves(e).size === 1 ? [...railHalves(e)][0] : null })),
    slack: SIDE_SLACK,
    crossWeight: CROSS_WEIGHT,
  });

  // 2b. Placement: scored candidates, one column cursor per half.
  const placed = [];
  const cursor = Object.fromEntries(halfInfo.order.map((half) => [half, 2]));
  const farthest = () => Math.max(...Object.values(cursor));
  const covered = new Set(); // strips of pins a board covers: no jumper reaches them
  const overBoard = new Set(); // boards across the channel: the holes under their PCB are out of reach
  for (const part of order) {
    const info = infos.get(part.id);
    const { def, pkg, pinNames, kind } = info;
    const s = sides.get(part.id) ?? halfInfo.order[0];
    const cur = info.straddles || kind === 'board' ? farthest() : cursor[s];
    const netOfPin = (pin) => enetOf.get(keyOf(part, pin)) ?? null;
    // A rail of the pin's electrical net on a half, its own net's rails first.
    const railOn = (pin, half) => (netOfPin(pin) ? [...(netOf.get(keyOf(part, pin))?.rails ?? []), ...netOfPin(pin).rails].find((r) => r[0] === half) ?? null : null);
    const taken = used();
    const { occ, at } = occupancy();
    const holeAt = (id) => built.board.find(id);
    // A hole a pin may take: a rail of its net, or a strip empty or already of its net.
    const compat = (h, e) => (h.kind === 'rail' ? Boolean(e?.rails.includes(h.row)) : !occ.has(h.node) || (e != null && occ.get(h.node) === e.id));
    // Holes well inside the box of a body already on the board: a lead there would go through it
    // (the geometry check would say so, at the price of building the circuit). Not under a body
    // held up off the board (a knob, a regulator's tab): leads pass below those.
    const under = new Set();
    for (const p of built.parts) {
      if (p.type === 'wire' || (BESIDE.has(p.type) && !overBoard.has(p.id)) || !p.built?.body?.length || HELD_UP.has(infos.get(p.id)?.def.package)) continue;
      const box = boxOf(p);
      for (const h of built.board.holes.values()) if (h.pos.x > box.x0 + UNDER_MARGIN && h.pos.x < box.x1 - UNDER_MARGIN && h.pos.y > box.y0 + UNDER_MARGIN && h.pos.y < box.y1 - UNDER_MARGIN) under.add(h.id);
    }
    const valid = (ids) => {
      const seen = new Map();
      for (let i = 0; i < ids.length; i++) {
        const h = holeAt(ids[i]);
        if (!h || taken.has(h.id) || under.has(h.id) || ids.indexOf(ids[i]) !== i) return false;
        const e = netOfPin(pinNames[i]);
        if (!compat(h, e)) return false;
        const node = h.kind === 'rail' ? h.row : h.node;
        const mine = e ? e.id : `x${i}`;
        if (seen.has(node) && seen.get(node) !== mine) return false;
        seen.set(node, mine);
      }
      return true;
    };
    // Estimated wire a pin's hole costs: nothing on a strip or rail of its net, else one more jumper
    // and the distance to the nearest hole (or rail) of its net already placed; the first pin of a
    // net costs nothing.
    const pinCost = (pin, h) => {
      const e = netOfPin(pin);
      if (!e || h.kind === 'rail') return 0;
      const there = at.get(e.id) ?? [];
      if (there.some((o) => o.node === h.node)) return 0;
      let d = Infinity;
      for (const o of there) d = Math.min(d, Math.hypot(o.pos.x - h.pos.x, o.pos.y - h.pos.y));
      for (const r of e.rails) if (railY.has(r)) d = Math.min(d, Math.abs(railY.get(r) - h.pos.y));
      return Number.isFinite(d) ? JUMPER_COST + d : 0;
    };
    // A tall part (TO-220, a regulator module) hides the holes between it and its rails in the
    // view that looks at it from its own side, so a strip of it that needs a jumper to a rail has
    // it seen only from the other view: a part standing between it and the rail on that strip, or
    // on the next strip on the side that view looks past (measured: the one before it for the back
    // half), hides that jumper in both views. Such a strip "enclosed" costs SHADOW_COST.
    const railStrips = (holes, pins) =>
      holes.flatMap((h, i) => {
        const e = enetOf.get(pins[i]);
        if (h?.kind !== 'main' || !e?.rails.some((r) => r[0] === halfOfRow(h.row))) return [];
        const half = halfOfRow(h.row);
        const out = halfInfo.outward[half];
        return [{ col: h.col, half, rows: new Set(out.slice(0, out.indexOf(h.row))) }];
      });
    const tallStrips = built.parts.filter((p) => TALL.has(infos.get(p.id)?.def.package)).flatMap((p) => railStrips(p.holes, p.pinNames.map((n) => `${p.id}.${String(n).toLowerCase()}`)));
    const partHoles = built.parts.filter((p) => p.type !== 'wire').flatMap((p) => p.holes.filter(Boolean));
    const behind = (h, st, col) => h.col === col && (h.kind === 'main' ? st.rows.has(h.row) : h.row[0] === st.half);
    const enclosed = (st, holes) => holes.some((h) => behind(h, st, st.col) || behind(h, st, st.col + (halfInfo.behind.has(st.half) ? -1 : 1)));
    const costOf = (ids) => {
      let c = 0;
      let min = Infinity;
      const hs = ids.map(holeAt);
      hs.forEach((h, i) => {
        c += pinCost(pinNames[i], h);
        min = Math.min(min, h.col);
      });
      for (const st of tallStrips) if (!enclosed(st, partHoles) && enclosed(st, [...partHoles, ...hs])) c += SHADOW_COST;
      if (TALL.has(def.package)) for (const st of railStrips(hs, pinNames.map((n) => keyOf(part, n)))) if (enclosed(st, partHoles)) c += SHADOW_COST;
      // The row next to the rails is kept for parts standing on a rail when another row will do.
      const edge = kind === 'span' && halfInfo.rails[s].length && ids.some((id) => holeAt(id).row === halfInfo.outward[s][0]) && !ids.some((id) => holeAt(id).kind === 'rail') ? EDGE_ROW_COST : 0;
      return c + edge + CURSOR_COST * Math.abs(min - cur);
    };
    // Columns worth trying on a half: the cursor's window, and the columns where the part's nets
    // already are (to share their strips).
    const anchors = (half) => {
      const cols = new Set(Array.from({ length: SPAN }, (_, k) => cur + k));
      for (const pin of pinNames) for (const h of at.get(netOfPin(pin)?.id) ?? []) if (h.kind === 'main' && halfOfRow(h.row) === half) cols.add(h.col);
      return [...cols].filter((c) => c >= 1);
    };
    const candidates = [];
    const seenCandidate = new Set();
    const add = (ids) => {
      const key = ids.join(' ');
      if (seenCandidate.has(key) || !valid(ids)) return;
      seenCandidate.add(key);
      candidates.push(ids);
    };
    let pin1s = []; // boards placed by pin 1

    if (kind === 'beside') {
      // Each lead on its own half (side assignment): a free hole of a strip its net already has,
      // else a rail of its net on that half, else a fresh strip at that half's cursor, two columns
      // apart, from the channel outwards. Variants: one row further out, one column later.
      const rowsOf = (half) => halfInfo.outward[half].slice().reverse();
      // Leads that are each the only other pin of one pin of a three-in-a-row part still to come
      // (a potentiometer on 5V, A0 and GND) land on three strips side by side in that part's pin
      // order, so the part shares all three and needs no jumper (whose ends would sit behind it).
      const trio = [];
      for (const other of infos.values()) {
        if (trio.length || other.kind !== 'inline' || other.part.id === part.id) continue;
        const leads = other.pinNames.map((n) => {
          const e = enetOf.get(keyOf(other.part, n));
          const mine = e ? pinNames.filter((pin) => netOfPin(pin) === e) : [];
          return mine.length === 1 && !(at.get(e.id) ?? []).length ? mine[0] : null;
        });
        if (leads.every(Boolean) && new Set(leads).size === 3 && new Set(leads.map((pin) => sides.get(keyOf(part, pin)) ?? s)).size === 1) trio.push(...leads);
      }
      const order = trio.length ? pinNames.flatMap((pin) => (trio.includes(pin) ? (pin === pinNames.find((x) => trio.includes(x)) ? trio : []) : [pin])) : pinNames;
      for (const [depth, shift] of [[0, 0], [1, 0], [0, 1], [2, 0], [1, 1]]) {
        const chosen = new Map();
        const next = Object.fromEntries(Object.entries(cursor).map(([half, c]) => [half, c + shift]));
        const reserved = new Set();
        const reservedNodes = new Set();
        for (const pin of order) {
          const e = netOfPin(pin);
          const ls = sides.get(keyOf(part, pin)) ?? s;
          const there = (at.get(e?.id) ?? []).filter((h) => h.kind === 'main');
          let id = null;
          for (const h of [...there.filter((x) => halfOfRow(x.row) === ls), ...there.filter((x) => halfOfRow(x.row) !== ls)]) {
            id = rowsOf(halfOfRow(h.row)).slice(depth).map((r) => `${r}${h.col}`).find((x) => !taken.has(x) && !reserved.has(x));
            if (id) break;
          }
          const rail = !id && e && railOn(pin, ls);
          for (let c = next[ls]; rail && !id && c <= built.board.spec.columns; c++) if (holeAt(`${rail}${c}`) && !taken.has(`${rail}${c}`) && !reserved.has(`${rail}${c}`)) id = `${rail}${c}`;
          // A trio lands behind its part (next to the rails), so the leads arch over less of it.
          const row = trio.includes(pin) ? halfInfo.outward[ls][depth] : rowsOf(ls)[depth];
          for (let c = next[ls]; !id && c <= built.board.spec.columns; c++) {
            const h = holeAt(`${row}${c}`);
            if (h && !taken.has(h.id) && !occ.has(h.node) && !reservedNodes.has(h.node)) {
              id = h.id;
              next[ls] = c + (trio.includes(pin) && pin !== trio[2] ? 1 : 2);
            }
          }
          if (!id) break;
          chosen.set(pin, id);
          reserved.add(id);
          reservedNodes.add(holeAt(id).node);
        }
        if (chosen.size === pinNames.length) add(pinNames.map((pin) => chosen.get(pin)));
      }
    } else if (kind === 'board') {
      pin1s = pin1Options(info, Array.from({ length: SPAN }, (_, k) => cur + k)).slice(0, 6).map((o) => o.pin1);
    } else if (kind === 'inline') {
      // Three in a row on fresh strips or strips of their nets; tall ones in row b/g, where every
      // hole of their strips stays usable.
      const row = halfInfo.ascending[s][TALL.has(def.package) ? 3 : 2];
      const starts = new Set();
      for (const c of anchors(s)) for (const k of [0, 1, 2]) starts.add(c - k);
      for (const c of [...starts].sort((a, b) => a - b)) add([0, 1, 2].map((k) => `${row}${c + k}`));
    } else if (kind === 'span') {
      const { min, max } = pkg.span(def.params);
      const k = Math.max(2, Math.ceil(min / P - 1e-6));
      const kmax = Math.max(k, Math.min(k + 3, Math.floor(max / P + 1e-6)));
      // Upright from the row next to a rail of its net, the lead in the rail.
      if (max >= 2 * P) {
        for (let r = 0; r < 2; r++) {
          const rail = railOn(pinNames[r], s);
          if (!rail) continue;
          for (const c of anchors(s)) {
            const ids = [];
            ids[r] = `${rail}${c}`;
            ids[1 - r] = `${halfInfo.outward[s][0]}${c}`;
            add(ids);
          }
        }
      }
      // Along a row, k to k + 3 holes long, either way round.
      for (const row of halfInfo.outward[s]) {
        for (const a of anchors(s)) {
          for (let d = k; d <= kmax; d++) {
            for (const dir of [1, -1]) {
              add([`${row}${a}`, `${row}${a + dir * d}`]);
              add([`${row}${a + dir * d}`, `${row}${a}`]);
            }
          }
        }
      }
    } else if (kind === 'footprints') {
      // Every spot the package allows (a DIP across the channel with pin 1 on its half, a button, a
      // bridge along a row of its half), scored like the rest.
      for (const fp of pkg.footprints(built.board, def.params)) {
        const hs = fp.map(holeAt);
        if (hs.some((h) => !h || h.kind !== 'main')) continue;
        if (info.straddles ? halfOfRow(hs[0].row) !== s : hs.some((h) => h.row !== halfInfo.ascending[s][3])) continue; // in one row: b or g, as tall parts
        add(fp);
      }
    }

    // Where it is now, first (layout again on an existing circuit).
    const was = before0.get(part.id);
    // The cheapest first; then, in case every cheap one is in a crowd (a large capacitor beside the
    // parts it would share strips with), the cheapest from the cursor on and the cheapest at each
    // column and row from there.
    const scored = candidates.map((ids, i) => ({ ids, c: costOf(ids), i, at: Math.min(...ids.map((id) => holeAt(id).col)) })).sort((p, q) => p.c - q.c || p.i - q.i);
    const ahead = scored.slice(MAX_TRIED).filter((x) => x.at >= cur);
    const spread = new Map();
    for (const x of ahead.slice(MAX_TRIED / 2)) {
      const key = `${x.at} ${holeAt(x.ids[0]).row}`;
      if (!spread.has(key)) spread.set(key, x);
    }
    const ordered = [...scored.slice(0, MAX_TRIED), ...ahead.slice(0, MAX_TRIED / 2), ...[...spread.values()].sort((p, q) => p.at - q.at).slice(0, MAX_TRIED)].map((x) => x.ids);
    if (was?.type === part.type && was.pins && !was.pin1) {
      const now = Array.isArray(was.pins) ? (was.pins.length === pinNames.length ? was.pins : null) : pinNames.every((n) => was.pins[n]) ? Object.fromEntries(pinNames.map((n) => [n, was.pins[n]])) : null;
      if (now) ordered.unshift(now);
    }
    let done = null;
    if (was?.type === part.type && was.pin1) {
      // Chips and boards placed by pin 1: the same pin 1 (and row spacing) as before.
      const op = { op: 'add', part: { ...part, pin1: was.pin1, ...(was.rowSpacing !== undefined && part.rowSpacing === undefined && { rowSpacing: was.rowSpacing }) } };
      if (!forbid.has(forbidKey(op.part)) && tryOps([op])) done = built.parts.find((p) => p.id === part.id).holes.map((h) => h?.id);
    }
    for (const pin1 of done ? [] : pin1s) {
      const op = { op: 'add', part: { ...part, pin1 } };
      if (!forbid.has(forbidKey(op.part)) && tryOps([op])) done = built.parts.find((p) => p.id === part.id).holes.map((h) => h?.id);
      if (done) break;
    }
    // A body over its own strips (a large electrolytic) can leave a pin that needs a jumper with no
    // free hole in reach (clear of it by the clearance and a jumper's end): that place is no good.
    const reachable = (pinMap) => {
      if (BESIDE.has(part.type) || HELD_UP.has(def.package)) return true;
      const me = built.parts.find((p) => p.id === part.id);
      const box = boxOf(me);
      const now = used();
      const m = -((circuit.clearance ?? 1) + REACH_MARGIN);
      return pinNames.every((n, i) => {
        const h = holeAt(pinMap[i]);
        const e = netOfPin(n);
        const alone = !e || (e.pins.length < 2 && !e.rails.length) || h?.kind !== 'main' || occ.get(h.node) === e.id;
        return alone || [...built.board.holes.values()].some((o) => o.node === h.node && !now.has(o.id) && !(o.pos.x > box.x0 + m && o.pos.x < box.x1 - m && o.pos.y > box.y0 + m && o.pos.y < box.y1 - m));
      });
    };
    for (const pins of done ? [] : ordered) {
      const pinMap = Array.isArray(pins) ? pins : pinNames.map((n) => pins[n]);
      const op = { op: 'add', part: { ...part, pins: kind === 'beside' ? Object.fromEntries(pinNames.map((n, i) => [n, pinMap[i]])) : pinMap } };
      if (forbid.has(forbidKey(op.part))) continue;
      const before = { circuit, built, baseline };
      if (tryOps([op])) {
        if (reachable(pinMap)) {
          done = pinMap;
          break;
        }
        ({ circuit, built, baseline } = before);
      }
    }
    if (!done) {
      // No rule fits (a crowded spot, a part kind without a rule): suggest, near the cursor.
      // Its places in `forbid` are skipped, as for the rules.
      const r = suggest(circuit, part, { near: `${halfInfo.ascending[s][2]}${cur + 2}`, limit: 3, candidates: 6, maxCandidates: 24, room: false, via: false });
      const allowed = (p) => !p.ops.some((o) => o.op === 'add' && o.part?.id === part.id && forbid.has(forbidKey(o.part)));
      const best = r.placements?.find((p) => allowed(p) && tryOps(p.ops));
      if (best) done = best.pins;
      else {
        problems.push({ severity: 'warning', code: 'LAYOUT_PART_FAILED', params: { part: part.id }, reasons: r.hint?.reasons ?? (r.error ? [{ code: r.error.code, count: 1, example: r.error }] : []) });
        continue;
      }
    }
    const pinsOf = Object.fromEntries(pinNames.map((n, i) => [n, done[i]]));
    const shared = pinNames.filter((n, i) => {
      const h = holeAt(done[i]);
      return h?.kind === 'main' && netOfPin(n) && occ.get(h.node) === netOfPin(n).id;
    });
    placed.push({ id: part.id, type: part.type, pins: pinsOf, rails: pinNames.filter((n, i) => railName(String(done[i]).replace(/\d+$/, ''))), shared });
    const me = built.parts.find((p) => p.id === part.id);
    if (kind === 'board') {
      overBoard.add(part.id);
      // A pin whose strip the board covers whole: no jumper can reach it.
      const spare = spareOf(info, me.holes.map((h) => h.id));
      info.named.forEach((n, i) => {
        const net = netOf.get(keyOf(part, n));
        if (spare[i] > 0 || !net || net.refs.length + net.rails.length < 2) return;
        const hole = me.holes[pinNames.findIndex((x) => x.toLowerCase() === n)];
        covered.add(hole.node);
        problems.push({ severity: 'warning', code: 'LAYOUT_PIN_COVERED', params: { part: part.id, pin: pinNames.find((x) => x.toLowerCase() === n), hole: hole.id } });
      });
    }
    if (BESIDE.has(part.type)) {
      for (const h of me.holes) if (h?.kind === 'main') cursor[halfOfRow(h.row)] = Math.max(cursor[halfOfRow(h.row)], h.col + 2);
    } else {
      let col = Math.max(...me.holes.map((h) => h.col));
      const x = bodyRight(me);
      if (Number.isFinite(x)) col = Math.max(col, Math.ceil((x - built.board.xOf(1)) / P + 1));
      const halves = new Set(me.holes.filter((h) => h?.kind === 'main').map((h) => halfOfRow(h.row)));
      for (const half of halves.size ? halves : [s]) cursor[half] = Math.max(cursor[half], col + 2);
      if (info.straddles || kind === 'board') {
        const max = farthest();
        for (const half of Object.keys(cursor)) cursor[half] = max;
      }
    }
  }

  // 3. Jumpers: each net's groups joined as a minimum spanning tree (Kruskal over the pair costs,
  // a pair the geometry rejects skipped).
  let wires = 0;
  const joinedRoots = () => {
    const parent = new Map();
    const find = (x) => {
      if (!parent.has(x)) parent.set(x, x);
      while (parent.get(x) !== x) x = parent.get(x);
      return x;
    };
    for (const w of built.parts.filter((p) => p.type === 'wire' && p.holes.length === 2)) parent.set(find(w.holes[0].node), find(w.holes[1].node));
    for (const [a, b] of internalLinks(built)) if (find(a) !== find(b)) parent.set(find(a), find(b));
    return find;
  };
  // A jumper arches over what lies between its holes and hides it in the drawing (a chip under
  // three jumpers is barely seen): each body its line crosses, seen from above, costs as much as
  // OVER_COST mm more of wire, so a short way round wins and crossing stays the last resort.
  const footprints = () => built.parts.filter((p) => p.type !== 'wire' && !BESIDE.has(p.type) && p.built?.body?.length).map(boxOf);
  // Holes under a board's PCB: out of reach for a jumper.
  const hidden = new Set();
  for (const p of built.parts.filter((q) => overBoard.has(q.id))) {
    const box = footprintOf(p);
    for (const h of built.board.holes.values()) if (h.pos.x > box.x0 + OVER_MARGIN && h.pos.x < box.x1 - OVER_MARGIN && h.pos.y > box.y0 + OVER_MARGIN && h.pos.y < box.y1 - OVER_MARGIN) hidden.add(h.id);
  }
  const pairs = (a, b, near, taken, bodies) => {
    const holesOf = (node) => [...built.board.holes.values()].filter((h) => h.node === node && !taken.has(h.id) && !hidden.has(h.id) && (h.kind === 'main' || !near || Math.abs(h.col - near) <= 6));
    const out = [];
    for (const x of holesOf(a)) for (const y of holesOf(b)) {
      const dx = Math.abs(x.col - y.col);
      const len = Math.hypot(x.pos.x - y.pos.x, x.pos.y - y.pos.y);
      if (len < 2 * P) continue; // too short to see
      const over = bodies.filter((box) => crosses(x.pos, y.pos, box, OVER_MARGIN)).length;
      out.push({ x, y, cost: len + (dx === 0 ? 0 : 1) + over * OVER_COST });
    }
    return out.sort((p, q) => p.cost - q.cost);
  };
  const jumpers = []; // { id, net, a, b }
  // Jumpers the circuit already had between two groups, tried first (layout again).
  const oldJumpers = (previous?.parts ?? []).filter((p) => p.type === 'wire' && Array.isArray(p.pins) && (!previous.spec || previous.spec.wires?.includes(p.id)));
  const kept = (a, b, taken) =>
    oldJumpers
      .map((w) => w.pins.map((id) => built.board.find(id)))
      .filter(([x, y]) => x && y && !taken.has(x.id) && !taken.has(y.id) && ((x.node === a && y.node === b) || (x.node === b && y.node === a)))
      .map(([x, y]) => ({ x, y, cost: -1 }));
  const nextWireId = () => {
    const ids = new Set(circuit.parts.map((p) => p.id));
    for (let n = 1; ; n++) if (!ids.has(`W${n}`)) return `W${n}`;
  };
  const rejected = new Set(); // pairs of holes the geometry refused: not tried again
  for (const net of nets) {
    const groups = [];
    for (const ref of net.refs) {
      const h = holeOf(ref);
      if (h && !covered.has(h.node) && !groups.some((g) => g.node === h.node)) groups.push({ node: h.node, col: h.col });
    }
    for (const r of net.rails) if (!groups.some((g) => g.node === r)) groups.push({ node: r, col: null });
    if (groups.length < 2) continue;
    groups.sort((p, q) => (p.col ?? Infinity) - (q.col ?? Infinity));
    // Kruskal: the cheapest pair of holes between two groups not yet joined, again and again; the
    // pairs are measured afresh each round, since every jumper takes two holes.
    for (;;) {
      const find = joinedRoots();
      if (new Set(groups.map((g) => find(g.node))).size < 2) break;
      const taken = used();
      const bodies = footprints();
      const edges = [];
      for (let i = 0; i < groups.length; i++) {
        for (let j = i + 1; j < groups.length; j++) {
          const [a, b] = [groups[i], groups[j]];
          if (find(a.node) === find(b.node)) continue;
          for (const p of [...kept(a.node, b.node, taken), ...pairs(a.node, b.node, a.col ?? b.col, taken, bodies).slice(0, PAIRS_PER_GROUP)]) edges.push({ ...p, a, b });
        }
      }
      edges.sort((p, q) => p.cost - q.cost);
      let joined = false;
      let failed = 0;
      for (const { x, y, a, b } of edges) {
        const key = `${x.id} ${y.id}`;
        if (rejected.has(key) || forbid.has(forbidKey({ type: 'wire', pins: [x.id, y.id] })) || forbid.has(linkKey(x.node, y.node))) continue;
        const id = nextWireId();
        if (tryOps([{ op: 'add', part: { id, type: 'wire', color: colourOf(net), pins: [x.id, y.id] } }])) {
          jumpers.push({ id, net, a: a.node, b: b.node });
          wires++;
          joined = true;
          break;
        }
        rejected.add(key);
        if (++failed >= JOIN_TRIES) break;
      }
      if (!joined) break;
    }
    // What is still apart: each piece named with the nearest group by column of the largest piece
    // (where the repair goes).
    const find = joinedRoots();
    const pieces = new Map();
    for (const g of groups) {
      if (!pieces.has(find(g.node))) pieces.set(find(g.node), []);
      pieces.get(find(g.node)).push(g);
    }
    if (pieces.size < 2) continue;
    const main = [...pieces.values()].sort((p, q) => q.length - p.length)[0];
    for (const piece of pieces.values()) {
      if (piece === main) continue;
      const g = piece[0];
      const near = [...main].sort((p, q) => Math.abs((p.col ?? g.col ?? 0) - (g.col ?? 0)) - Math.abs((q.col ?? g.col ?? 0) - (g.col ?? 0)))[0];
      const on = built.parts.filter((q) => q.type !== 'wire' && q.holes.some((h) => h && (h.node === g.node || h.node === near.node))).map((q) => q.id);
      problems.push({ severity: 'warning', code: 'LAYOUT_WIRE_FAILED', params: { from: g.node, to: near.node }, parts: on });
    }
  }

  // Supplies: a pin reference becomes a free hole of that pin's strip.
  if (spec.supplies?.length) {
    const taken = used();
    const resolve = (ref) => {
      if (ref == null || railName(ref)) return ref == null ? ref : railName(ref);
      const hole = holeOf(ref);
      if (!hole) return ref;
      const spare = [...built.board.holes.values()].find((h) => h.node === hole.node && !taken.has(h.id));
      if (spare) taken.add(spare.id);
      return spare?.id ?? hole.id;
    };
    const r = applyOps(circuit, [{ op: 'circuit', supplies: spec.supplies.map((s) => ({ ...s, positive: resolve(s.positive), negative: resolve(s.negative) })) }]);
    if (r.errors.length) problems.push(...r.errors);
    else circuit = r.circuit;
  }

  const verdict = review(circuit, { profile, views: ['front', 'back'] });

  const columns = buildCircuit(circuit).board?.spec.columns;
  const sequence = circuit.parts.map((p) => p.id); // placement order: parts, then jumpers
  return { circuit, placed, wires, columns, problems, sequence, check: checkNets(circuit, nets), review: verdict, ms: Date.now() - started };
}

// Nothing laid out: the spec has errors found before validating it (a recipe's values).
export const specProblems = (problems) => ({ status: 'fix_spec', invalid: true, checked: true, parts: [], problems, ms: 0 });

export function formatLayout(r, lang, { t, formatIssue }) {
  if (r.checked) {
    const lines = [t(lang, r.invalid ? 'layout.invalid' : 'layout.valid', { parts: r.parts.length })];
    for (const p of r.parts) lines.push(`  ${p.id}: ${p.type}${p.part ? ` ${p.part}` : ''}${p.style ? ` (${p.style})` : ''}${p.value ? ` ${p.value}` : ''}${p.color ? ` ${p.color}` : ''}`);
    if (!r.invalid) for (const [i, n] of (r.nets ?? []).entries()) lines.push(`  ${t(lang, 'layout.net', { net: i + 1 })} ${(Array.isArray(n) ? n : n.pins).join(', ')}`);
    for (const p of r.problems) lines.push(`  ${p.severity === 'error' ? '✖' : '·'} ${formatIssue(p, lang)}`);
    lines.push(`STATUS: ${r.status.toUpperCase()} · ${t(lang, `layout.status.${r.status}`)}`);
    return lines.join('\n');
  }
  const lines = [t(lang, 'layout.header', { placed: r.placed.length, wires: r.wires, ms: r.ms, columns: r.columns ?? '—' })];
  for (const p of r.placed) {
    const how = [p.rails.length ? t(lang, 'layout.rails', { pins: p.rails.join(', ') }) : '', p.shared.length ? t(lang, 'layout.shared', { pins: p.shared.join(', ') }) : ''].filter(Boolean).join(' · ');
    lines.push(`  ${p.id}: ${Object.entries(p.pins).map(([n, h]) => `${n}→${h}`).join(', ')}${how ? ` · ${how}` : ''}`);
  }
  for (const n of r.notes ?? []) lines.push(`  · ${formatIssue(n, lang)}`);
  for (const p of r.problems) {
    lines.push(`  ✖ ${formatIssue(p, lang)}`);
    for (const reason of p.reasons ?? []) lines.push(`      ×${reason.count} ${formatIssue(reason.example, lang)}`);
  }
  if (r.check.ok) lines.push(t(lang, 'layout.netsOk'));
  for (const m of r.check.missing) lines.push(`  ✖ ${t(lang, 'layout.missing', { net: m.net, pins: m.pins.join(', ') })}`);
  for (const s of r.check.shorted) lines.push(`  ✖ ${t(lang, 'layout.shorted', { nets: s.nets.join(' + ') })}`);
  lines.push(t(lang, r.review.verdict === 'approved' ? 'layout.approved' : 'layout.changes', { count: r.review.blocking.length }));
  for (const b of r.review.blocking) lines.push(`  ✖ ${formatIssue(b, lang)}${b.views ? ` [${b.views.join(', ')}]` : ''}`);
  const open = r.problems.length + r.check.missing.length + r.check.shorted.length + r.review.blocking.length;
  lines.push(`STATUS: ${r.status.toUpperCase()} · ${t(lang, `layout.status.${r.status}`, { count: open })}`);
  return lines.join('\n');
}
