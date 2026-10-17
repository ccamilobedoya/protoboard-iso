// Breadboard model: where every hole is in world space and which holes are connected.
//
// Hole names
//   main grid: row letter + column number, "a1" … "j63"
//   rails:     rail id + column it lines up with, "T+3", "B-12"
//
// Node names (groups of holes connected inside the board)
//   "12:a-e"  column 12, rows a to e
//   "T+"      the whole top + rail ("T+:L" / "T+:R" when the rails are split)

import { v3 } from '../core/vec.js';
import bb830 from './boards/bb830.js';
import bb400 from './boards/bb400.js';
import { joined } from './boards/joined.js';

// Joined boards give a layout room to spread out (several real boards side by side).
export const BOARDS = { bb830, bb400, bb400x2: joined(bb400, 2), bb400x3: joined(bb400, 3), bb830x2: joined(bb830, 2) };

// Rail holes of one board: groups of `group` with `gap` empty positions between them.
function railPattern(spec, offset = 0) {
  const { firstColumn, group, gap, groups } = spec.railHoles;
  const cols = [];
  for (let g = 0; g < groups; g++) {
    for (let k = 0; k < group; k++) cols.push(offset + firstColumn + g * (group + gap) + k);
  }
  return cols;
}

// Joined boards: per seam, the rail columns the bridge jumper takes (the last rail hole before
// the seam and the first after it). Those holes are the bridge's, not free.
export function railBridges(spec) {
  const seg = spec.segments;
  if (!seg) return [];
  const out = [];
  for (let k = 1; k < seg.count; k++) out.push({ from: railPattern(spec, (k - 1) * seg.columns).at(-1), to: railPattern(spec, k * seg.columns)[0], seam: k });
  return out;
}

export function railColumns(spec) {
  const seg = spec.segments;
  if (!seg) return railPattern(spec);
  const taken = new Set(railBridges(spec).flatMap((b) => [b.from, b.to]));
  const cols = [];
  for (let k = 0; k < seg.count; k++) cols.push(...railPattern(spec, k * seg.columns));
  return cols.filter((c) => !taken.has(c));
}

// The rail holes of each joined board (one list per board), for drawing the rail lines.
export function railSegments(spec) {
  const seg = spec.segments;
  if (!seg) return [railPattern(spec)];
  return Array.from({ length: seg.count }, (_, k) => railPattern(spec, k * seg.columns));
}

// The two rows on either side of the centre channel, by position (not by name or list order):
// `back` is the row just behind it in the picture, `front` the row just in front.
export function channelRows(spec) {
  const back = spec.rows.filter((r) => r.y <= spec.channel.from).sort((a, b) => b.y - a.y)[0];
  const front = spec.rows.filter((r) => r.y >= spec.channel.to).sort((a, b) => a.y - b.y)[0];
  return { back: back.id, front: front.id };
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
  const strips = spec.strips.map((s) => {
    const ys = s.rows.map((r) => yOfRow.get(r));
    const mid = (Math.min(...ys) + Math.max(...ys)) / 2;
    const other = spec.strips.filter((o) => o !== s).flatMap((o) => o.rows.map((r) => yOfRow.get(r)));
    const otherMid = other.length ? (Math.min(...other) + Math.max(...other)) / 2 : mid;
    const rails = spec.rails.filter((r) => Math.abs(r.y - mid) < Math.abs(r.y - otherMid)).map((r) => r.id);
    return { rows: `${s.rows[0]}–${s.rows.at(-1)}`, rails };
  });
  const joinedAt = spec.segments ? Array.from({ length: spec.segments.count - 1 }, (_, k) => (k + 1) * spec.segments.columns) : [];
  return { id: spec.id, columns: spec.columns, strips, rails: spec.rails.map((r) => r.id), railColumns: ranges.map(([a, b]) => (a === b ? `${a}` : `${a}–${b}`)).join(', '), split: spec.split ?? null, joinedAt, bridges: railBridges(spec).map((b) => `${b.from}–${b.to}`) };
}

// The holes nearest to a name that is not on the board, in the same row or rail: what was
// probably meant ("B-7" → "B-6, B-8"). Empty when the name is not a hole name at all.
export function nearestHoles(board, name, count = 2) {
  const m = /^([a-zA-Z][+-]?)(\d+)$/.exec(String(name ?? '').trim());
  if (!m) return [];
  const row = /[+-]$/.test(m[1]) ? m[1].toUpperCase() : m[1].toLowerCase();
  const col = Number(m[2]);
  return [...board.holes.values()]
    .filter((h) => h.row === row)
    .sort((a, b) => Math.abs(a.col - col) - Math.abs(b.col - col) || a.col - b.col)
    .slice(0, count)
    .map((h) => h.id);
}

export function createBoard(specOrId = 'bb830') {
  const spec = typeof specOrId === 'string' ? BOARDS[specOrId] : specOrId;
  if (!spec) throw new Error(`Unknown board "${specOrId}". Known boards: ${Object.keys(BOARDS).join(', ')}`);

  const P = spec.pitch;
  const { length, width } = spec.size;
  const pageRows = [...spec.rows.map((r) => r.y), ...spec.rails.map((r) => r.y)];
  const top = Math.min(...pageRows);
  const bottom = Math.max(...pageRows);
  // Joined boards repeat one board's margins in each segment, so the pitch is not uniform
  // across a seam (as on the bench: two boards' edges sit between their last and first columns).
  const seg = spec.segments ?? { count: 1, columns: spec.columns, length };
  const marginX = (seg.length - (seg.columns - 1) * P) / 2;
  const marginY = (width - (bottom - top) * P) / 2;

  // World position of a column / page row on the board surface (z = 0).
  const xOf = (col) => {
    const k = Math.min(seg.count - 1, Math.floor((col - 1) / seg.columns));
    return k * seg.length + marginX + (col - 1 - k * seg.columns) * P;
  };
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

  return { spec, pitch: P, holes, find, xOf, yOf, railColumns: railCols, railSegments: railSegments(spec), railBridges: railBridges(spec) };
}
