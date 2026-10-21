// A whole circuit placed in one call, from what it connects, without trial and error:
//
//   autoLayout({ board, parts: [{ id, type, … }], nets: [["D1.K", "S1.1"], { pins: ["U1.GND", "T-"], color: "black" }], supplies, … })
//     → { circuit, placed, wires, columns, problems, check, review, ms }
//
// The classic place → route → verify flow of circuit layout tools, cut down to a breadboard:
// 1. Layers (as in Sugiyama-style schematic layout): each part's distance from the source over
//    the nets, so the board reads left to right in signal order; ties keep the order given.
// 2. Detailed placement by rules, each candidate checked by geometry only (occupancy, leads,
//    bodies, crossings, clearance: milliseconds, no drawing):
//    - three in a row (TO-220, TO-92, a regulator module) on fresh strips; tall ones in rows b/g,
//      where every hole of their strips stays usable (measured: in c–e and h–j the holes on one
//      side end up behind them in one view);
//    - two leads with a rail on one net: upright from the row next to that rail, on the strip of
//      the part before it in the net when that has room, else on a fresh strip;
//    - two leads otherwise: along a row, from the strip of the part before it in the net;
//    - off the board (switch, Arduino): each lead to the strip of its net, or a fresh one;
//    - anything else (DIP chips, buttons) or when no rule fits: suggest, near the cursor.
//    A column cursor moves past each part, so stages do not pile up; the elastic board (`auto`)
//    grows with it.
// 3. Jumpers join each net's strips and rails: the shortest pair of holes that passes the same
//    geometric check, in the net's colour (black for a − rail, red for a +, else one per net).
// 4. Verify: the nets built against the nets asked for (nothing missing, nothing shorted) and the
//    lesson review; while it blocks something, lay out again without the place of the part or
//    jumper placed last among those it names (autoLayout, a few tries).

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
import { checkNets } from './nets.js';

export { checkNets };
import { strayFields, fieldsOfType } from './parts/fields.js';

const RAILS = ['T+', 'T-', 'B+', 'B-'];
const PALETTE = ['orange', 'green', 'yellow', 'blue', 'white', 'violet'];
const TALL = new Set(['TO-220', 'ams1117-module']);
const BESIDE = new Set(['switch', 'module', 'battery']); // bodies off the board: only their holes count
const HALF_ROWS = { T: ['j', 'i', 'h', 'g', 'f'], B: ['a', 'b', 'c', 'd', 'e'] }; // from the rail inwards
const SPAN = 8; // columns a part may slide past the cursor looking for room
const railName = (ref) => RAILS.find((r) => r === String(ref).trim().toUpperCase()) ?? null;
const pinKey = (ref) => {
  const m = /^([^.\s]+)\.(\S+)$/.exec(String(ref).trim());
  return m ? `${m[1]}.${m[2].toLowerCase()}` : null;
};
const halfOfRow = (row) => (HALF_ROWS.T.includes(row) ? 'T' : 'B');

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
  const checkRef = (ref, where) => {
    if (railName(ref)) return;
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
export function autoLayout(spec, { profile = 'lesson', checkOnly = false, previous = null } = {}) {
  const started = Date.now();
  const valid = validateSpec(spec);
  if (checkOnly || !valid.ok) return { status: valid.ok ? 'spec_ok' : 'fix_spec', invalid: !valid.ok, checked: true, parts: valid.parts, problems: valid.problems, ms: Date.now() - started };
  const asked = { nets: valid.nets, ...(valid.supplies?.some((s) => pinKey(s.positive) || pinKey(s.negative)) && { supplies: valid.supplies }) };
  const notes = [];
  spec = { ...spec, parts: valid.parts, nets: groundToRail(valid.nets, valid.parts, valid.supplies, notes), ...(valid.supplies && { supplies: valid.supplies }) };
  const forbid = new Set(); // "id pins" keys
  let best = null;
  let tries = 0;
  for (let attempt = 0; attempt < TRIES; attempt++) {
    tries++;
    const r = layoutOnce(spec, { profile, forbid, previous });
    const score = (x) => (x.check.ok ? 0 : 100) + x.problems.length * 10 + x.review.blocking.length;
    if (!best || score(r) < score(best)) best = r;
    if (r.check.ok && r.review.verdict === 'approved' && !r.problems.length) break;
    const rank = new Map(r.sequence.map((id, i) => [id, i]));
    let added = false;
    for (const b of r.review.blocking) {
      const ids = Object.values(b.params ?? {}).map(String).filter((v) => rank.has(v));
      const victim = ids.sort((x, y) => rank.get(y) - rank.get(x))[0];
      const part = victim && r.circuit.parts.find((p) => p.id === victim);
      if (!part) continue;
      const key = forbidKey(part);
      if (!forbid.has(key)) {
        forbid.add(key);
        added = true;
      }
    }
    if (!added) break;
  }
  if (!(best.check.ok && best.review.verdict === 'approved' && !best.problems.length)) best = repair(best, spec, { profile });
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
function groundToRail(nets, parts, supplies, notes) {
  const negatives = new Set((supplies ?? []).map((s) => pinKey(s.negative)).filter(Boolean));
  const pinsOfNet = (n) => (Array.isArray(n) ? n : n.pins);
  const rail = nets.flatMap(pinsOfNet).map(railName).find((r) => r?.endsWith('-')) ?? 'B-';
  return nets.map((n, i) => {
    const pins = pinsOfNet(n);
    if (pins.some(railName)) return n;
    const ground = pins.find((ref) => negatives.has(pinKey(ref)) || GROUND_PIN.test(String(ref).split('.').slice(1).join('.')));
    if (!ground) return n;
    notes.push({ severity: 'info', code: 'LAYOUT_GROUND_TO_RAIL', params: { net: i + 1, pin: ground, rail } });
    return Array.isArray(n) ? [...pins, rail] : { ...n, pins: [...pins, rail] };
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
  const attempt = (remove, between, color, fixed) => {
    const base = remove ? applyOps(circuit, [{ op: 'remove', part: remove }]).circuit : circuit;
    const s = suggest(base, { type: 'wire', ...(color && { color }) }, { between, profile, limit: 1, via: true });
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
// and supplies it was laid out with, and its settings; anything given replaces what is there.
export function specFromCircuit(circuit, given = {}) {
  const jumpers = new Set(circuit.spec?.wires ?? []);
  const parts = (circuit.parts ?? []).filter((p) => (circuit.spec ? !jumpers.has(p.id) : p.type !== 'wire')).map(({ pins, pin1, ...rest }) => rest);
  const pick = (k) => given[k] ?? circuit[k];
  return Object.fromEntries(
    Object.entries({
      parts: given.parts ?? parts,
      nets: given.nets ?? circuit.spec?.nets,
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

const forbidKey = (part) => (part.type === 'wire' ? `wire ${[...part.pins].sort().join(' ')}` : `${part.id} ${JSON.stringify(part.pins ?? part.pin1)}`);

function layoutOnce(spec, { profile, forbid, previous }) {
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
  let colour = 0;
  const colourOf = (net) => net.color ?? (net.rails.some((r) => r.endsWith('-')) ? 'black' : net.rails.some((r) => r.endsWith('+')) ? 'red' : (net.auto ??= PALETTE[colour++ % PALETTE.length]));

  // State, rebuilt after each change (geometry only: fast).
  let built = buildCircuit(circuit, { headroom: SPAN + 12 });
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
    const r = applyOps(circuit, ops);
    if (r.errors.length) return false;
    const next = buildCircuit(r.circuit, { headroom: SPAN + 12 });
    if (next.issues.some((i) => i.severity === 'error')) return false;
    const after = blocking(next.issues);
    if (after.some((i) => !baseline.has(problemKey(i)) && !(i.code === 'FLOATING_PIN'))) return false;
    circuit = r.circuit;
    built = next;
    baseline = new Set(after.map(problemKey));
    return true;
  };

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

  // 2. Placement.
  const placed = [];
  let cursor = 2;
  const isPlaced = (ref) => placed.some((p) => p.id === ref.split('.')[0]);
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
    const netOfPin = (pin) => netOf.get(`${part.id}.${pin.toLowerCase()}`);
    // The strip of the part before it in a pin's net (a hole it can use there), if any.
    const before = (pin) => {
      const net = netOfPin(pin);
      if (!net) return null;
      for (const ref of net.refs) {
        if (pinKey(ref) === `${part.id}.${pin.toLowerCase()}` || !isPlaced(ref)) continue;
        const h = holeOf(ref);
        if (h?.kind === 'main') return h;
      }
      return null;
    };
    const railOf = (pin) => netOfPin(pin)?.rails[0] ?? null;
    const halfOf = () => {
      for (const pin of pinNames) if (railOf(pin)) return railOf(pin)[0];
      for (const pin of pinNames) if (before(pin)) return halfOfRow(before(pin).row);
      return 'B';
    };
    const half = halfOf();
    const free = (id) => !used().has(id) && built.board.find(id);
    const emptyStrip = (row, col) => {
      const h = built.board.find(`${row}${col}`);
      return h && ![...used()].some((u) => built.board.find(u)?.node === h.node);
    };
    const freeIn = (hole, rows) => rows.map((r) => `${r}${hole.col}`).find((id) => free(id) && built.board.find(id).node === hole.node);
    const candidates = [];
    const add = (pins) => candidates.push(pins);
    const columns = Array.from({ length: SPAN }, (_, k) => cursor + k);

    if (beside) {
      // Each lead to the strip of its net, else to a fresh strip at the cursor.
      let k = 0;
      const pins = {};
      for (const pin of pinNames) {
        const b = before(pin);
        const hole = b && freeIn(b, HALF_ROWS[halfOfRow(b.row)].slice().reverse());
        if (hole) pins[pin] = hole;
        else {
          const col = columns.find((c, i) => i >= k && emptyStrip(half === 'T' ? 'f' : 'e', c));
          k = columns.indexOf(col) + 2;
          pins[pin] = `${half === 'T' ? 'f' : 'e'}${col}`;
        }
      }
      add(pins);
    } else if (pkg?.inline && pinNames.length === 3) {
      const row = TALL.has(def.package) ? (half === 'T' ? 'g' : 'b') : half === 'T' ? 'h' : 'c';
      for (const c of columns) if ([0, 1, 2].every((k) => emptyStrip(row, c + k))) add(pinNames.map((_, k) => `${row}${c + k}`));
    } else if (pkg?.span && pinNames.length === 2) {
      const P = built.board.pitch;
      const { min, max } = pkg.span(def.params);
      const k = Math.max(2, Math.ceil(min / P - 1e-6));
      const toRail = pinNames.map(railOf);
      const r = toRail.findIndex(Boolean);
      if (r >= 0 && max >= 2 * P) {
        // Upright from the row next to that rail; the other lead on its net's strip if it can.
        const rail = toRail[r];
        const near = HALF_ROWS[rail[0]][0];
        const other = 1 - r;
        const b = before(pinNames[other]);
        const cols = [...(b && halfOfRow(b.row) === rail[0] ? [b.col] : []), ...columns];
        for (const c of cols) {
          const pins = [];
          pins[r] = `${rail}${c}`;
          pins[other] = `${near}${c}`;
          if (built.board.find(pins[r]) && free(pins[other]) && (c === b?.col || emptyStrip(near, c))) add(pins);
        }
      }
      // Along a row, from the strip of the part before it.
      const bs = pinNames.map(before);
      const first = bs.findIndex(Boolean);
      const rows = HALF_ROWS[half].slice(1, 4);
      if (first >= 0) {
        const b = bs[first];
        for (const row of HALF_ROWS[halfOfRow(b.row)].slice(1)) {
          for (const d of [k, k + 1, k + 2]) {
            const pins = [];
            pins[first] = `${row}${b.col}`;
            pins[1 - first] = `${row}${b.col + d}`;
            if (b.node === built.board.find(pins[first])?.node && free(pins[first]) && emptyStrip(row, b.col + d)) add(pins);
          }
        }
      }
      for (const row of rows) for (const c of columns) if (emptyStrip(row, c) && emptyStrip(row, c + k)) add([`${row}${c}`, `${row}${c + k}`]);
    }

    // Where it is now, first (layout again on an existing circuit).
    const was = before0.get(part.id);
    if (was?.type === part.type && was.pins && !was.pin1) {
      const now = Array.isArray(was.pins) ? (was.pins.length === pinNames.length ? was.pins : null) : pinNames.every((n) => was.pins[n]) ? Object.fromEntries(pinNames.map((n) => [n, was.pins[n]])) : null;
      if (now) candidates.unshift(now);
    }
    let done = null;
    if (was?.type === part.type && was.pin1) {
      // Chips and boards placed by pin 1: the same pin 1 (and row spacing) as before.
      const op = { op: 'add', part: { ...part, pin1: was.pin1, ...(was.rowSpacing !== undefined && part.rowSpacing === undefined && { rowSpacing: was.rowSpacing }) } };
      if (!forbid.has(forbidKey(op.part)) && tryOps([op])) done = built.parts.find((p) => p.id === part.id).holes.map((h) => h?.id);
    }
    for (const pins of done ? [] : candidates) {
      const pinMap = Array.isArray(pins) ? pins : pinNames.map((n) => pins[n]);
      const op = { op: 'add', part: { ...part, pins: beside ? Object.fromEntries(pinNames.map((n, i) => [n, pinMap[i]])) : pinMap } };
      if (forbid.has(forbidKey(op.part))) continue;
      if (tryOps([op])) {
        done = pinMap;
        break;
      }
    }
    if (!done) {
      // No rule fits (a DIP chip, a button, a crowded spot): suggest, near the cursor.
      const r = suggest(circuit, part, { near: `${half === 'T' ? 'h' : 'c'}${cursor + 2}`, limit: 1, candidates: 6, maxCandidates: 24, room: false, via: false });
      const best = r.placements?.[0];
      if (best && tryOps(best.ops)) done = best.pins;
      else {
        problems.push({ severity: 'warning', code: 'LAYOUT_PART_FAILED', params: { part: part.id }, reasons: r.hint?.reasons ?? (r.error ? [{ code: r.error.code, count: 1, example: r.error }] : []) });
        continue;
      }
    }
    const pinsOf = Object.fromEntries(pinNames.map((n, i) => [n, done[i]]));
    placed.push({ id: part.id, type: part.type, pins: pinsOf, rails: pinNames.filter((n, i) => RAILS.includes(String(done[i]).replace(/\d+$/, ''))), shared: pinNames.filter((n, i) => before(n) && built.board.find(done[i])?.node === before(n)?.node) });
    const me = built.parts.find((p) => p.id === part.id);
    let col = Math.max(...me.holes.map((h) => h.col));
    if (!BESIDE.has(part.type)) {
      const x = bodyRight(me);
      if (Number.isFinite(x)) col = Math.max(col, Math.ceil((x - built.board.xOf(1)) / built.board.pitch + 1));
    }
    cursor = Math.max(cursor, col + 2);
  }

  // 3. Jumpers: each net's groups joined, nearest first, with the shortest pair of holes that passes.
  let wires = 0;
  const joinedRoots = () => {
    const parent = new Map();
    const find = (x) => {
      if (!parent.has(x)) parent.set(x, x);
      while (parent.get(x) !== x) x = parent.get(x);
      return x;
    };
    for (const w of built.parts.filter((p) => p.type === 'wire' && p.holes.length === 2)) parent.set(find(w.holes[0].node), find(w.holes[1].node));
    return find;
  };
  const pairs = (a, b, near) => {
    const holesOf = (node) => [...built.board.holes.values()].filter((h) => h.node === node && !used().has(h.id) && (h.kind === 'main' || !near || Math.abs(h.col - near) <= 6));
    const out = [];
    for (const x of holesOf(a)) for (const y of holesOf(b)) {
      const dx = Math.abs(x.col - y.col);
      const len = Math.hypot(x.pos.x - y.pos.x, x.pos.y - y.pos.y);
      if (len < 2 * built.board.pitch) continue; // too short to see
      out.push({ x, y, cost: len + (dx === 0 ? 0 : 1) });
    }
    return out.sort((p, q) => p.cost - q.cost);
  };
  const jumpers = []; // { id, net, a, b, tried: Set }
  // Jumpers the circuit already had between two groups, tried first (layout again).
  const oldJumpers = (previous?.parts ?? []).filter((p) => p.type === 'wire' && Array.isArray(p.pins) && (!previous.spec || previous.spec.wires?.includes(p.id)));
  const kept = (a, b) =>
    oldJumpers
      .map((w) => w.pins.map((id) => built.board.find(id)))
      .filter(([x, y]) => x && y && !used().has(x.id) && !used().has(y.id) && ((x.node === a && y.node === b) || (x.node === b && y.node === a)))
      .map(([x, y]) => ({ x, y }));
  const join = (net, a, b, skip = new Set()) => {
    const col = (node) => built.board.holes.get([...built.board.holes.keys()].find((k) => built.board.holes.get(k).node === node))?.col;
    for (const { x, y } of [...kept(a, b), ...pairs(a, b, col(a) ?? col(b)).slice(0, 40)]) {
      const key = `${x.id}-${y.id}`;
      if (skip.has(key)) continue;
      const id = nextWireId();
      if (forbid.has(forbidKey({ type: 'wire', pins: [x.id, y.id] }))) continue;
      if (tryOps([{ op: 'add', part: { id, type: 'wire', color: colourOf(net), pins: [x.id, y.id] } }])) {
        jumpers.push({ id, net, a, b, tried: new Set([...skip, key]) });
        wires++;
        return true;
      }
    }
    return false;
  };
  const nextWireId = () => {
    const taken = new Set(circuit.parts.map((p) => p.id));
    for (let n = 1; ; n++) if (!taken.has(`W${n}`)) return `W${n}`;
  };
  for (const net of nets) {
    const groups = [];
    for (const ref of net.refs) {
      const h = holeOf(ref);
      if (h && !groups.some((g) => g.node === h.node)) groups.push({ node: h.node, col: h.col });
    }
    for (const r of net.rails) if (!groups.some((g) => g.node === r)) groups.push({ node: r, col: null });
    if (groups.length < 2) continue;
    groups.sort((p, q) => (p.col ?? Infinity) - (q.col ?? Infinity));
    const joined = [groups[0]];
    for (const g of groups.slice(1)) {
      const find = joinedRoots();
      if (!joined.some((j) => find(j.node) === find(g.node))) {
        const targets = [...joined].sort((p, q) => Math.abs((p.col ?? g.col ?? 0) - (g.col ?? 0)) - Math.abs((q.col ?? g.col ?? 0) - (g.col ?? 0)));
        if (!targets.some((t) => join(net, g.node, t.node))) problems.push({ severity: 'warning', code: 'LAYOUT_WIRE_FAILED', params: { from: g.node, to: targets[0].node } });
      }
      joined.push(g);
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

export function formatLayout(r, lang, { t, formatIssue }) {
  if (r.checked) {
    const lines = [t(lang, r.invalid ? 'layout.invalid' : 'layout.valid', { parts: r.parts.length })];
    for (const p of r.parts) lines.push(`  ${p.id}: ${p.type}${p.part ? ` ${p.part}` : ''}${p.style ? ` (${p.style})` : ''}${p.value ? ` ${p.value}` : ''}`);
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
