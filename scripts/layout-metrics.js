// What a layout result measures, for comparing the algorithm before and after a change
// (scripts/layout-bench.js, docs/en/layout.md "Changing the algorithm"). Pure and deterministic:
// everything comes from the circuit's holes, none from the clock (only `ms` is copied, and the
// bench leaves it out of comparisons).
import { buildCircuit } from '../src/circuit/build.js';
import { boardSides } from '../src/board/board.js';

const round1 = (v) => Math.round(v * 10) / 10;

export function layoutMetrics(result) {
  const built = buildCircuit(result.circuit);
  const spec = built.board.spec;
  // Holes by half of the board: T (rows f–j) and B (rows a–e); on a double board also K (k–o)
  // and U (p–t).
  const sides = boardSides(spec);
  const halfOf = (h) => (h.kind === 'rail' ? 'rail' : (sides.ofRow.get(h.row) ?? null));

  const holes = { T: 0, B: 0, ...Object.fromEntries(sides.order.filter((s) => s !== 'T' && s !== 'B').map((s) => [s, 0])), rail: 0 };
  const cols = [];
  let wireLength = 0;
  let jumpers = 0;
  let parts = 0;
  for (const p of built.parts) {
    const hs = (p.holes ?? []).filter(Boolean);
    if (p.type === 'wire') {
      jumpers++;
      if (hs.length >= 2) wireLength += Math.hypot(...['x', 'y', 'z'].map((k) => hs[0].pos[k] - hs[1].pos[k]));
    } else parts++;
    for (const h of hs) {
      const half = halfOf(h);
      if (!half) continue;
      holes[half]++;
      if (h.col != null) cols.push(h.col);
    }
  }

  const pinHalf = (ref) => {
    const m = /^([^.\s]+)\.(\S+)$/.exec(String(ref).trim());
    const part = m && built.parts.find((p) => p.id === m[1]);
    const i = part?.pinNames?.findIndex((n) => String(n).toLowerCase() === m[2].toLowerCase());
    const h = i >= 0 ? part.holes?.[i] : null;
    return h ? halfOf(h) : null;
  };
  // Nets with pins on more than one half (across a channel, or the joint of a double board).
  let channelCrossings = 0;
  for (const n of result.circuit.spec?.nets ?? []) {
    const halves = new Set((Array.isArray(n) ? n : n?.pins ?? []).map(pinHalf).filter((h) => h && h !== 'rail'));
    if (halves.size > 1) channelCrossings++;
  }

  const min = cols.length ? Math.min(...cols) : 0;
  const max = cols.length ? Math.max(...cols) : 0;
  return {
    status: result.status,
    parts,
    jumpers,
    wireLength: round1(wireLength),
    columns: { min, max, span: cols.length ? max - min + 1 : 0 },
    boardColumns: result.columns,
    holes,
    channelCrossings,
    tries: result.tries,
    ms: result.ms,
    blocking: result.review?.blocking?.length ?? 0,
    problems: result.problems?.length ?? 0,
  };
}
