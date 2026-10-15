// Where current flows, drawn as the "conductor view": every conductor (a piece of metal strip,
// a lead, the inside of a body, a jumper wire) as one thick line coloured by its voltage, and
// dots moving along it in the direction of conventional current (+ to −, as in Falstad's
// CircuitJS), at a speed proportional to the current.
//
// Paths come from the packages: `build()` may return `paths`, one per pin, each a 3D polyline
// from the hole (z = 0) to a point inside the part shared by all its pins, with `body` the index
// where the body starts. Without them, a straight line from the hole to the middle of the holes.
//
// The current in each piece of a strip comes from Kirchhoff's current law: walking along the
// strip, the current between two holes is the sum of what entered at the holes behind.

import { stripHoles } from '../render/focus.js';

export const MIN_CURRENT = 1e-6; // below a microampere nothing moves
export const DOT_PERIOD = 9; // one dot every 9 px
export const MAX_SPEED = 60; // px/s of the largest current in the circuit (proportional scale)
export const CONDUCTOR_WIDTH = 3.2; // leads, bodies, wires (px)
export const STRIP_WIDTH = 4.2; // metal strips inside the board: wider, they carry more
export const DOT_WIDTH = 2.4; // narrower than the conductor, so its colour shows around the dots
export const DOT_COLOR = '#ffd21f';
export const FLOATING_COLOR = '#d9d7d2';

// Voltage colours, v / vmax from −1 to 1: the colours of the rails (red +, blue −), which also
// read with colour blindness; grey at 0 V.
export const VOLTAGE_COLORS = { negative: '#1f5fbf', zero: '#a3a19c', positive: '#d62828' };
// Inside a body the voltage changes along a steep S curve (tanh, this steepness): most of the
// change happens in the middle of the part, so it reads as "the drop is here", still shaded.
export const BODY_STEEPNESS = 7;
const BODY_PIECES = 6; // per pin, from the lead to the middle of the body

const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const hex = (c) => '#' + c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');

export function voltageColor(v, vmax) {
  const p = VOLTAGE_COLORS;
  if (v == null || !Number.isFinite(v)) return FLOATING_COLOR;
  const t = vmax > 0 ? Math.max(-1, Math.min(1, v / vmax)) : 0;
  const zero = rgb(p.zero);
  const end = rgb(t >= 0 ? p.positive : p.negative);
  return hex(zero.map((z, i) => z + (end[i] - z) * Math.abs(t)));
}

// Dot speed in px/s. Proportional: half the current, half the speed (the peak is the largest
// current in the circuit). Logarithmic: microamperes crawl and amperes race.
export function dotSpeed(current, peak, scale = 'linear') {
  const a = Math.abs(current);
  if (a < MIN_CURRENT) return 0;
  if (scale === 'log') return Math.min(150, 12 + 22 * Math.log10(a / MIN_CURRENT));
  return peak > 0 ? (MAX_SPEED * a) / peak : 0;
}

const average = (points) => ({
  x: points.reduce((s, p) => s + p.x, 0) / points.length,
  y: points.reduce((s, p) => s + p.y, 0) / points.length,
  z: points.reduce((s, p) => s + p.z, 0) / points.length,
});

// One path per pin, from the package or the straight fallback.
export function partPaths(part) {
  if (Array.isArray(part.built.paths) && part.built.paths.length === part.holes.length) {
    return part.built.paths.map((p, i) => ({ pin: part.pinNames[i], points: p.points, body: p.body }));
  }
  const centre = { ...average(part.holes.map((h) => h.pos)), z: 0 };
  return part.holes.map((h, i) => ({ pin: part.pinNames[i], points: [{ ...h.pos, z: 0 }, centre], body: 1 }));
}

// Where each supply lead touches the board: the hole given, or the first hole of its group.
function supplyHoles(board, circuit) {
  return (Array.isArray(circuit.supplies) ? circuit.supplies : []).map((s, i) => {
    const pick = (ref, fallback) => {
      const r = String(ref ?? fallback);
      return board.find(r) ?? stripHoles(board, r)[0] ?? null;
    };
    return { id: s.id ?? `V${i + 1}`, positive: pick(s.positive, 'T+'), negative: pick(s.negative, 'T-') };
  });
}

// Share of the way from a lead's voltage to the middle of the body, t from 0 (lead) to 1 (middle):
// the first half of an S curve across the whole body, scaled so the middle gets exactly 1.
export function bodyShare(t) {
  const s = (u) => Math.tanh(BODY_STEEPNESS * (u - 0.5));
  return (s(t / 2) - s(0)) / (s(0.5) - s(0));
}

const segmentLength = (a, b) => Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
const lerp3 = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t });

// A polyline cut in n pieces of equal length.
function split(points, n) {
  const lengths = points.slice(1).map((p, i) => segmentLength(points[i], p));
  const total = lengths.reduce((a, b) => a + b, 0);
  if (!(total > 0) || n <= 1) return [points];
  const pieces = [];
  let piece = [points[0]];
  let walked = 0;
  let next = total / n;
  for (let i = 0; i < lengths.length; i++) {
    const a = points[i];
    const b = points[i + 1];
    while (pieces.length < n - 1 && walked + lengths[i] >= next - 1e-12) {
      const cut = lerp3(a, b, (next - walked) / lengths[i]);
      piece.push(cut);
      pieces.push(piece);
      piece = [cut];
      next += total / n;
    }
    walked += lengths[i];
    piece.push(b);
  }
  pieces.push(piece);
  return pieces;
}

// The circuit's conductors in board coordinates (mm):
//   wires: [{ points, voltage, part | node }]   coloured lines (voltage null = floating)
//   dots:  [{ points, current, part | node }]  conventional current from points[0] to the end
//   vmax:  the voltage the colour scale ends at
export function conductorPieces(built, sim, circuit) {
  if (!sim?.ok) return { wires: [], dots: [], vmax: 0 };
  const wires = [];
  const dots = [];
  const entering = new Map(); // hole id → current entering the strip there
  const used = new Set(); // holes with something in them
  const add = (hole, i) => {
    entering.set(hole.id, (entering.get(hole.id) ?? 0) + i);
    used.add(hole.id);
  };

  for (const part of built.parts) {
    const reading = sim.parts[part.id];
    if (!reading?.pinCurrents) continue;
    const paths = partPaths(part);
    const pinVolts = paths.map((p) => reading.pins?.[p.pin] ?? null);
    const known = pinVolts.filter((v) => v != null);
    const centre = known.length ? known.reduce((a, b) => a + b, 0) / known.length : null;
    paths.forEach((path, k) => {
      const hole = part.holes[k];
      const i = reading.floating ? 0 : reading.pinCurrents[path.pin] ?? 0;
      add(hole, -i);
      const v = pinVolts[k];
      const lead = path.points.slice(0, path.body + 1);
      const body = path.points.slice(path.body);
      if (lead.length > 1) wires.push({ points: lead, voltage: v, part: part.id });
      if (body.length > 1) {
        split(body, BODY_PIECES).forEach((points, j) => wires.push({ points, voltage: v == null || centre == null ? null : v + (centre - v) * bodyShare((j + 0.5) / BODY_PIECES), part: part.id }));
      }
      if (Math.abs(i) >= MIN_CURRENT) dots.push({ points: path.points, current: i, part: part.id });
    });
  }
  const nodes = new Set(Object.keys(built.netlist.nodes));
  for (const s of supplyHoles(built.board, circuit)) {
    const reading = sim.supplies[s.id];
    if (!reading || !s.positive || !s.negative) continue;
    add(s.positive, reading.current);
    add(s.negative, -reading.current);
    nodes.add(s.positive.node).add(s.negative.node);
  }
  for (const node of nodes) {
    const holes = stripHoles(built.board, node);
    const inUse = holes.map((h, k) => (used.has(h.id) ? k : -1)).filter((k) => k >= 0);
    if (inUse.length < 2) continue;
    const voltage = sim.nodes[node] ?? null;
    // The metal between the first and the last hole in use, then the current piece by piece.
    const first = inUse[0];
    const last = inUse.at(-1);
    wires.push({ points: holes.slice(first, last + 1).map((h) => ({ ...h.pos, z: 0 })), voltage, node });
    let running = 0;
    for (let k = first; k < last; k++) {
      running += entering.get(holes[k].id) ?? 0;
      if (Math.abs(running) >= MIN_CURRENT) dots.push({ points: [{ ...holes[k].pos, z: 0 }, { ...holes[k + 1].pos, z: 0 }], current: running, node });
    }
  }
  const volts = [...Object.values(sim.nodes), ...Object.values(sim.supplies).map((s) => s.voltage)].filter((v) => Number.isFinite(v));
  const vmax = Math.max(0, ...volts.map(Math.abs));
  return { wires, dots, vmax };
}

const pathData = (pts) => pts.map((p, i) => `${i ? 'L' : 'M'}${Math.round(p.x * 100) / 100} ${Math.round(p.y * 100) / 100}`).join(' ');

// The pieces as drawing operations for the `flow` layer: coloured conductors, then the dots.
// Each dot path carries both speeds (--lin, --log) so a page can switch scale with CSS alone.
export function flowOps(scene, built, sim, circuit) {
  const { wires, dots, vmax } = conductorPieces(built, sim, circuit);
  const project = (points) => points.map((p) => scene.camera.project(p));
  const tag = (piece) => ({ ...(piece.part && { part: piece.part }), data: piece.part ? { flow: piece.part } : { node: piece.node } });
  const peak = Math.max(0, ...dots.map((d) => Math.abs(d.current)));
  const seconds = (speed) => (speed > 0.2 ? (DOT_PERIOD / speed).toFixed(3) : '99999');
  return [
    ...wires.map((w) => ({ kind: 'path', d: pathData(project(w.points)), stroke: voltageColor(w.voltage, vmax), strokeWidth: w.node ? STRIP_WIDTH : CONDUCTOR_WIDTH, cls: 'conductor', ...tag(w) })),
    ...dots.map((piece) => {
      const points = project(piece.current > 0 ? piece.points : piece.points.slice().reverse());
      return {
        kind: 'path',
        d: pathData(points),
        stroke: DOT_COLOR,
        strokeWidth: DOT_WIDTH,
        dash: `0 ${DOT_PERIOD}`,
        cls: 'dots',
        style: `--lin:${seconds(dotSpeed(piece.current, peak))}s;--log:${seconds(dotSpeed(piece.current, peak, 'log'))}s`,
        ...tag(piece),
      };
    }),
  ];
}
