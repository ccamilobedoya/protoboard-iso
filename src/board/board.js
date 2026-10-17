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

// `auto`: the cross-section of a bb400 (rows a–j, four rails, the centre channel) and as many
// columns as the circuit uses, in steps of six so the rails end on a full group of five.
const auto = { ...bb400, id: 'auto', name: { en: 'Elastic breadboard (as long as the circuit needs)', es: 'Protoboard elástica (tan larga como la pida el circuito)' }, elastic: true };

export const BOARDS = { bb830, bb400, auto };

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
      const m = /^(?:[a-jA-J]|[TtBb][+-])(\d+)$/.exec(v.trim());
      if (m) max = Math.max(max, Number(m[1]));
    } else if (Array.isArray(v)) v.forEach(visit);
    else if (v && typeof v === 'object') Object.values(v).forEach(visit);
  };
  for (const part of circuit?.parts ?? []) visit(part?.pins);
  for (const s of circuit?.supplies ?? []) visit([s?.positive, s?.negative]);
  return max;
}

// An elastic board grown to at least `columns` (never shorter than its base).
function grown(spec, columns) {
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
  return { id: spec.id, columns: spec.columns, strips, rails: spec.rails.map((r) => r.id), railColumns: ranges.map(([a, b]) => (a === b ? `${a}` : `${a}–${b}`)).join(', '), split: spec.split ?? null, elastic: Boolean(spec.elastic) };
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
