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

const RAILS = ['T+', 'T-', 'B+', 'B-'];
const PALETTE = ['orange', 'green', 'yellow', 'blue', 'white', 'violet'];
const TALL = new Set(['TO-220', 'ams1117-module']);
const BESIDE = new Set(['switch', 'module', 'battery']); // bodies off the board: only their holes count
const HALF_ROWS = { T: ['j', 'i', 'h', 'g', 'f'], B: ['a', 'b', 'c', 'd', 'e'] }; // from the rail inwards
const SPAN = 8; // columns a part may slide past the cursor looking for room
const railName = (ref) => RAILS.find((r) => r === String(ref).trim().toUpperCase()) ?? null;
const pinKey = (ref) => {
  const m = /^([^.\s]+)\.([^.\s]+)$/.exec(String(ref).trim());
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

export function autoLayout(spec, { profile = 'lesson' } = {}) {
  const started = Date.now();
  const forbid = new Set(); // "id pins" keys
  let best = null;
  let tries = 0;
  for (let attempt = 0; attempt < TRIES; attempt++) {
    tries++;
    const r = layoutOnce(spec, { profile, forbid });
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
  return { ...best, tries, ms: Date.now() - started };
}

const forbidKey = (part) => (part.type === 'wire' ? `wire ${[...part.pins].sort().join(' ')}` : `${part.id} ${JSON.stringify(part.pins)}`);

function layoutOnce(spec, { profile, forbid }) {
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

    let done = null;
    for (const pins of candidates) {
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
  const join = (net, a, b, skip = new Set()) => {
    const col = (node) => built.board.holes.get([...built.board.holes.keys()].find((k) => built.board.holes.get(k).node === node))?.col;
    for (const { x, y } of pairs(a, b, col(a) ?? col(b)).slice(0, 40)) {
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

// The nets asked for against the circuit built: every pin of a net on one electrical net
// (missing: the pins left out), and no two nets asked for on the same one (shorted).
export function checkNets(circuit, asked) {
  // Nets asked for that share a pin or a rail are one net (a ground bridge: [T-, B-]).
  const nets = [];
  for (const net of asked) {
    const keys = new Set(net.pins.map((p) => railName(p) ?? pinKey(p)));
    const into = nets.find((n) => [...keys].some((k) => n.keys.has(k)));
    if (into) {
      keys.forEach((k) => into.keys.add(k));
      into.pins.push(...net.pins);
    } else nets.push({ index: nets.length, keys, pins: [...net.pins] });
  }
  for (let merged = true; merged; ) {
    merged = false;
    for (let i = 0; i < nets.length && !merged; i++) {
      for (let j = i + 1; j < nets.length && !merged; j++) {
        if ([...nets[j].keys].some((k) => nets[i].keys.has(k))) {
          nets[j].keys.forEach((k) => nets[i].keys.add(k));
          nets[i].pins.push(...nets[j].pins);
          nets.splice(j, 1);
          merged = true;
        }
      }
    }
  }
  nets.forEach((n, i) => (n.index = i));
  const built = buildCircuit(circuit);
  const parent = new Map();
  const find = (x) => {
    if (!parent.has(x)) parent.set(x, x);
    while (parent.get(x) !== x) x = parent.get(x);
    return x;
  };
  for (const w of built.parts.filter((p) => p.type === 'wire' && p.holes.length === 2)) parent.set(find(w.holes[0].node), find(w.holes[1].node));
  const holeOf = new Map();
  for (const p of built.parts) p.pinNames.forEach((n, i) => p.holes[i] && holeOf.set(`${p.id}.${n.toLowerCase()}`, p.holes[i]));
  const rootOf = (ref) => (railName(ref) ? find(railName(ref)) : holeOf.has(pinKey(ref)) ? find(holeOf.get(pinKey(ref)).node) : null);
  const missing = [];
  const owner = new Map();
  const shorted = [];
  for (const net of nets) {
    const roots = net.pins.map((ref) => [ref, rootOf(ref)]);
    const counts = new Map();
    for (const [, r] of roots) if (r) counts.set(r, (counts.get(r) ?? 0) + 1);
    const main = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
    const off = roots.filter(([, r]) => r !== main).map(([ref]) => ref);
    if (off.length) missing.push({ net: net.index + 1, pins: off });
    if (main) {
      if (owner.has(main) && owner.get(main) !== net.index) shorted.push({ nets: [owner.get(main) + 1, net.index + 1] });
      owner.set(main, net.index);
    }
  }
  return { ok: !missing.length && !shorted.length, missing, shorted };
}

// Readable answer for the CLI and the MCP tool.
export function formatLayout(r, lang, { t, formatIssue }) {
  const lines = [t(lang, 'layout.header', { placed: r.placed.length, wires: r.wires, ms: r.ms, columns: r.columns ?? '—' })];
  for (const p of r.placed) {
    const how = [p.rails.length ? t(lang, 'layout.rails', { pins: p.rails.join(', ') }) : '', p.shared.length ? t(lang, 'layout.shared', { pins: p.shared.join(', ') }) : ''].filter(Boolean).join(' · ');
    lines.push(`  ${p.id}: ${Object.entries(p.pins).map(([n, h]) => `${n}→${h}`).join(', ')}${how ? ` · ${how}` : ''}`);
  }
  for (const p of r.problems) {
    lines.push(`  ✖ ${formatIssue(p, lang)}`);
    for (const reason of p.reasons ?? []) lines.push(`      ×${reason.count} ${formatIssue(reason.example, lang)}`);
  }
  if (r.check.ok) lines.push(t(lang, 'layout.netsOk'));
  for (const m of r.check.missing) lines.push(`  ✖ ${t(lang, 'layout.missing', { net: m.net, pins: m.pins.join(', ') })}`);
  for (const s of r.check.shorted) lines.push(`  ✖ ${t(lang, 'layout.shorted', { nets: s.nets.join(' + ') })}`);
  lines.push(t(lang, r.review.verdict === 'approved' ? 'layout.approved' : 'layout.changes', { count: r.review.blocking.length }));
  for (const b of r.review.blocking) lines.push(`  ✖ ${formatIssue(b, lang)}${b.views ? ` [${b.views.join(', ')}]` : ''}`);
  return lines.join('\n');
}
