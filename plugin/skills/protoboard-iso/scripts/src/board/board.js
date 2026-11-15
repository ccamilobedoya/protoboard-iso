// Breadboard model: where every hole is in world space and which holes are connected.
//
// Hole names
//   main grid: row letter + column number, "a1" … "j63" ("a1" … "t30" on a double board)
//   rails:     rail id + column it lines up with, "T+3", "B-12" ("U+3" on a double board)
//
// Node names (groups of holes connected inside the board)
//   "12:a-e"  column 12, rows a to e
//   "T+"      the whole top + rail ("T+:L" / "T+:R" when the rails are split)
//
// Double board (`double`, `bb830x2`): two boards clipped together along their long edge, with the
// rail strips between them taken off (most boards have detachable rail strips), so a development
// board can straddle the joint with a free strip under each header. From back to front:
//   U- U+ t…p | o…k · junction · j…f | e…a B- B+
// The back board's rows continue the alphabet away from the front (its a…j become k…t), its rails
// are U- and U+ (T is gone: those were the rails taken off). `junction`: the empty pitches between
// rows j and k (see doubleBoard).

import { v3 } from '../core/vec.js';
import bb830 from './boards/bb830.js';
import bb400 from './boards/bb400.js';
import { LIMITS } from '../limits.js';

// `auto`: the cross-section of a bb400 (rows a–j, four rails, the centre channel) and as many
// columns as the circuit uses, in steps of six so the rails end on a full group of five.
const auto = { ...bb400, id: 'auto', name: { en: 'Elastic breadboard (as long as the circuit needs)', es: 'Protoboard elástica (tan larga como la pida el circuito)' }, elastic: true };

// Back-board row of each row of the base board: a…j → k…t.
const BACK_ROW = (id) => String.fromCharCode(id.charCodeAt(0) + 10);

// Two copies of a single board (rows a–j, rails T and B), the back one's front rails and the front
// one's back rails taken off, joined along the long edge.
//
// junction: empty pitches between rows j and k. The kit's single board is 54.6 mm wide with row j
// 2 pitches from the inner rail; assuming the main block ends half way, 1 pitch past its outer row,
// two blocks butted together put k 2 pitches behind j: one empty pitch, the default. That keeps every
// row on one 0.1" lattice, and a DevKit 0.9", 1.0" or 1.1" wide (9, 10, 11 holes) has a placement
// across the joint with a free row on each header's strip (2 empty pitches would leave none for
// 0.9"). Real boards may differ: measure yours.
export function doubleBoard(base, { id, name, junction = 1 } = {}) {
  const shift = 12 + junction; // pitches the front board lies in front of the back one
  const lastBack = Math.max(...base.rows.map((r) => r.y)); // row k: the back board's row a
  const rails = base.rails.filter((r) => r.id.startsWith('T')).map((r) => ({ ...r, id: `U${r.id.slice(1)}` }));
  const front = base.rails.filter((r) => r.id.startsWith('B')).map((r) => ({ ...r, y: r.y + shift }));
  const sides = { 'a-e': 'K', 'f-j': 'U' };
  return {
    ...base,
    id,
    name,
    size: { ...base.size, width: base.size.width + shift * base.pitch },
    rows: [...base.rows.map((r) => ({ id: BACK_ROW(r.id), y: r.y })), ...base.rows.map((r) => ({ ...r, y: r.y + shift }))],
    strips: [...base.strips, ...base.strips.map((s) => ({ id: `${BACK_ROW(s.rows[0])}-${BACK_ROW(s.rows.at(-1))}`, rows: s.rows.map(BACK_ROW), side: sides[s.id] }))],
    channel: { from: base.channel.from + shift, to: base.channel.to + shift },
    channels: [base.channel, { from: base.channel.from + shift, to: base.channel.to + shift }],
    junction: { from: lastBack, to: lastBack + 1 + junction, gap: junction },
    rails: [...rails, ...front],
    supplyRails: ['U+', 'U-'],
  };
}

const double = doubleBoard(auto, { id: 'double', name: { en: 'Two elastic breadboards side by side (inner rails removed)', es: 'Dos protoboards elásticas lado a lado (sin los rieles del medio)' } });
const bb830x2 = doubleBoard(bb830, { id: 'bb830x2', name: { en: 'Two full-size breadboards side by side (inner rails removed)', es: 'Dos protoboards grandes lado a lado (sin los rieles del medio)' } });

export const BOARDS = { bb830, bb400, auto, double, bb830x2 };

// Every rail id any board has ("T+", "U-"…), for reading a reference before a board is chosen.
export const RAIL_IDS = [...new Set(Object.values(BOARDS).flatMap((b) => b.rails.map((r) => r.id)))];
// The rail a reference names (any case), or null.
export const railName = (ref) => RAIL_IDS.find((r) => r === String(ref).trim().toUpperCase()) ?? null;

// Where a supply's leads go when it does not say: the back pair of rails (T+ and T-; U+ and U- on
// a double board, where the T rails are the ones taken off).
export const supplyRails = (spec) => spec?.supplyRails ?? ['T+', 'T-'];

// A hole name split in row (lower case) or rail (upper case) and column, or null: "C10" → c, 10.
export function parseHole(name) {
  const m = /^([a-zA-Z][+-]?)(\d+)$/.exec(String(name ?? '').trim());
  if (!m) return null;
  return { row: /[+-]$/.test(m[1]) ? m[1].toUpperCase() : m[1].toLowerCase(), col: Number(m[2]) };
}

// The halves of a board, as layout reads them: each strip's side (named after the rails beside it
// on a single board: T, B; on a double board also K and U), front to back; its rows from the outer
// edge (its rails, or the junction) inwards and from back to front; the rails on each side; and
// the sides whose rails lie behind them.
export function boardSides(spec) {
  const strips = [...spec.strips].sort((a, b) => Math.max(...rowYs(spec, b)) - Math.max(...rowYs(spec, a)));
  const order = strips.map((s) => s.side);
  const ofRow = new Map(strips.flatMap((s) => s.rows.map((r) => [r, s.side])));
  const yOf = new Map(spec.rows.map((r) => [r.id, r.y]));
  const outward = {};
  const ascending = {};
  const rails = {};
  const behind = new Set();
  for (const s of strips) {
    const own = spec.rails.filter((r) => r.id[0] === s.side);
    rails[s.side] = own.map((r) => r.id);
    const edge = own.length ? own.reduce((sum, r) => sum + r.y, 0) / own.length : (spec.junction.from + spec.junction.to) / 2;
    outward[s.side] = [...s.rows].sort((a, b) => Math.abs(yOf.get(a) - edge) - Math.abs(yOf.get(b) - edge));
    ascending[s.side] = [...s.rows].sort((a, b) => yOf.get(a) - yOf.get(b));
    if (own.length && edge < Math.min(...rowYs(spec, s))) behind.add(s.side);
  }
  return { order, ofRow, outward, ascending, rails, behind, back: order.at(-1) };
}
const rowYs = (spec, strip) => strip.rows.map((id) => spec.rows.find((r) => r.id === id).y);

export function railColumns(spec) {
  const { firstColumn, group, gap, groups } = spec.railHoles;
  const cols = [];
  for (let g = 0; g < groups; g++) {
    for (let k = 0; k < group; k++) cols.push(firstColumn + g * (group + gap) + k);
  }
  return cols;
}

// The highest column a circuit names (pins, supplies), 0 when none: what an elastic board must reach.
export function columnsUsed(circuit) {
  let max = 0;
  const visit = (v) => {
    if (typeof v === 'string') {
      const h = parseHole(v);
      if (h) max = Math.max(max, h.col);
    } else if (Array.isArray(v)) v.forEach(visit);
    else if (v && typeof v === 'object') Object.values(v).forEach(visit);
  };
  for (const part of circuit?.parts ?? []) visit(part?.pins);
  for (const s of circuit?.supplies ?? []) visit([s?.positive, s?.negative]);
  return max;
}

// An elastic board grown to at least `columns` (never shorter than its base), up to the cap
// (src/limits.js): a hole named far past it must not take the machine's memory.
function grown(spec, wanted) {
  const columns = Math.min(wanted, LIMITS.boardColumns);
  if (!spec.elastic || !(columns > spec.columns)) return spec;
  const { firstColumn, group, gap } = spec.railHoles;
  const cols = Math.ceil(columns / (group + gap)) * (group + gap);
  return {
    ...spec,
    columns: cols,
    size: { ...spec.size, length: spec.size.length + (cols - spec.columns) * spec.pitch },
    railHoles: { ...spec.railHoles, groups: Math.floor((cols - firstColumn + 1 + gap) / (group + gap)) },
  };
}

// The two rows on either side of a channel, by position (not by name or list order): `back` is
// the row just behind it in the picture, `front` the row just in front. One pair per channel
// (a double board has two; the junction between its boards is no channel), front board first.
export function channelPairs(spec) {
  return (spec.channels ?? [spec.channel]).map((ch) => {
    const back = spec.rows.filter((r) => r.y <= ch.from).sort((a, b) => b.y - a.y)[0];
    const front = spec.rows.filter((r) => r.y >= ch.to).sort((a, b) => a.y - b.y)[0];
    return { back: back.id, front: front.id };
  }).sort((p, q) => spec.rows.find((r) => r.id === q.front).y - spec.rows.find((r) => r.id === p.front).y);
}

// Where the board prints its coordinates (page rows for the column numbers, offset in mm of the
// row letters past the first and last columns): draw-board.js prints them, render/focus.js lights
// them. A double board numbers the columns along its two outer edges; at the joint the two
// boards' numbers would overlap.
export function printRows(spec) {
  const ys = spec.rows.map((r) => r.y);
  return { numbers: [Math.min(...ys) - 0.8, Math.max(...ys) + 0.8], letterOffset: 1.9 };
}

// What an assistant needs to know before naming holes: the columns, which rows form each strip
// and which rails lie on its side, and the columns where the rails have holes (they come in
// groups, with gaps: "B-7" does not exist on a bb400).
export function boardLayout(board) {
  const { spec } = board;
  const ranges = [];
  for (const col of board.railColumns) {
    const last = ranges.at(-1);
    if (last && col === last[1] + 1) last[1] = col;
    else ranges.push([col, col]);
  }
  const yOfRow = new Map(spec.rows.map((r) => [r.id, r.y]));
  // A rail is beside the strip nearest to it.
  const midOf = (s) => {
    const ys = s.rows.map((r) => yOfRow.get(r));
    return (Math.min(...ys) + Math.max(...ys)) / 2;
  };
  const nearest = (rail) => spec.strips.reduce((best, s) => (Math.abs(midOf(s) - rail.y) < Math.abs(midOf(best) - rail.y) ? s : best));
  const strips = spec.strips.map((s) => ({ rows: `${s.rows[0]}–${s.rows.at(-1)}`, rails: spec.rails.filter((r) => nearest(r) === s).map((r) => r.id) }));
  const between = (from, to) => {
    const back = spec.rows.filter((r) => r.y <= from).sort((a, b) => b.y - a.y)[0];
    const front = spec.rows.filter((r) => r.y >= to).sort((a, b) => a.y - b.y)[0];
    return `${front.id}–${back.id}`;
  };
  return {
    id: spec.id,
    columns: spec.columns,
    strips,
    rails: spec.rails.map((r) => r.id),
    railColumns: ranges.map(([a, b]) => (a === b ? `${a}` : `${a}–${b}`)).join(', '),
    split: spec.split ?? null,
    ...(spec.junction && { junction: between(spec.junction.from, spec.junction.to) }),
    elastic: Boolean(spec.elastic),
  };
}

// The holes nearest to a name that is not on the board, in the same row or rail: what was
// probably meant ("B-7" → "B-6, B-8"). Empty when the name is not a hole name at all.
export function nearestHoles(board, name, count = 2) {
  const h = parseHole(name);
  if (!h) return [];
  const { row, col } = h;
  return [...board.holes.values()]
    .filter((h) => h.row === row)
    .sort((a, b) => Math.abs(a.col - col) - Math.abs(b.col - col) || a.col - b.col)
    .slice(0, count)
    .map((h) => h.id);
}

export function createBoard(specOrId = 'bb830', { columns } = {}) {
  const base = typeof specOrId === 'string' ? BOARDS[specOrId] : specOrId;
  const spec = base && grown(base, columns);
  if (!spec) throw new Error(`Unknown board "${specOrId}". Known boards: ${Object.keys(BOARDS).join(', ')}`);

  const P = spec.pitch;
  const { length, width } = spec.size;
  const pageRows = [...spec.rows.map((r) => r.y), ...spec.rails.map((r) => r.y)];
  const top = Math.min(...pageRows);
  const bottom = Math.max(...pageRows);
  const marginX = (length - (spec.columns - 1) * P) / 2;
  const marginY = (width - (bottom - top) * P) / 2;

  // World position of a column / page row on the board surface (z = 0).
  const xOf = (col) => marginX + (col - 1) * P;
  const yOf = (pageY) => width - marginY - (pageY - top) * P;

  const holes = new Map();
  const stripOfRow = new Map();
  for (const strip of spec.strips) for (const row of strip.rows) stripOfRow.set(row, strip.id);

  for (const row of spec.rows) {
    for (let col = 1; col <= spec.columns; col++) {
      const id = `${row.id}${col}`;
      holes.set(id, { id, col, row: row.id, kind: 'main', pos: v3(xOf(col), yOf(row.y), 0), node: `${col}:${stripOfRow.get(row.id)}` });
    }
  }
  const railCols = railColumns(spec);
  for (const rail of spec.rails) {
    for (const col of railCols) {
      const id = `${rail.id}${col}`;
      const half = spec.split == null ? '' : col <= spec.split ? ':L' : ':R';
      holes.set(id, { id, col, row: rail.id, kind: 'rail', rail, pos: v3(xOf(col), yOf(rail.y), 0), node: `${rail.id}${half}` });
    }
  }

  // Accept "C10", "c10", "t+3": rows are lower case, rails upper case.
  function find(name) {
    if (typeof name !== 'string') return undefined;
    const raw = name.trim();
    return holes.get(raw) ?? holes.get(raw.toLowerCase()) ?? holes.get(raw.toUpperCase());
  }

  return { spec, pitch: P, holes, find, xOf, yOf, railColumns: railCols };
}
