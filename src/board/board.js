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

export const BOARDS = { bb830, bb400 };

export function railColumns(spec) {
  const { firstColumn, group, gap, groups } = spec.railHoles;
  const cols = [];
  for (let g = 0; g < groups; g++) {
    for (let k = 0; k < group; k++) cols.push(firstColumn + g * (group + gap) + k);
  }
  return cols;
}

export function createBoard(specOrId = 'bb830') {
  const spec = typeof specOrId === 'string' ? BOARDS[specOrId] : specOrId;
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
