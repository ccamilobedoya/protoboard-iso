// Where current flows, drawn as the "conductor view": every conductor (a piece of metal strip,
// a lead, the inside of a body, a jumper wire) as one thick line coloured by its voltage, and
// dots moving along it in the direction of conventional current (+ to −, as in Falstad's
// CircuitJS), at a speed proportional to the current. LEDs glow with their current.
//
// Paths come from the packages: `build()` may return `paths`, one per pin, each a 3D polyline
// from the hole (z = 0) to a point inside the part shared by all its pins, with `body` the index
// where the body starts. Without them, a straight line from the hole to the middle of the holes.
//
// The current in each piece of a strip comes from Kirchhoff's current law: walking along the
// strip, the current between two holes is the sum of what entered at the holes behind.
//
// Two uses: a static image (dots only where current flows, pointing its way, still) and the
// live page (`live`: every piece, drawn hole → part and strip forwards, each tagged with its
// index; page/client/live.js moves and colours them from the running simulation).

import { stripHoles } from '../render/focus.js';
import { LED_LIGHT } from '../parts/colors.js';
import { MIN_CURRENT, DOT_PERIOD, voltageColor, dotSpeed, bodyShare, bodyVoltage, centreVoltage, glowOpacity } from './look.js';

export { MIN_CURRENT, DOT_PERIOD, MAX_SPEED, VOLTAGE_COLORS, FLOATING_COLOR, voltageColor, dotSpeed, bodyShare } from './look.js';

export const CONDUCTOR_WIDTH = 3.2; // leads, bodies, wires (px)
export const STRIP_WIDTH = 4.2; // metal strips inside the board: wider, they carry more
export const DOT_WIDTH = 2.4; // narrower than the conductor, so its colour shows around the dots
export const DOT_COLOR = '#ffd21f';
export const HEAT_COLOR = '#ff6a00';
const BODY_PIECES = 6; // per pin, from the lead to the middle of the body

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

// The circuit's conductors in board coordinates (mm), each with what it refers to:
//   wires:  [{ points, ref, voltage }]   ref { node } | { part, pin } | { part, pin, share } (a body piece)
//   dots:   [{ points, ref, current }]   ref { part, pin } (current into the part, hole → middle)
//                                        | { node, k } (k-th piece of the strip in use, forwards)
//   strips: { node: [[tap…] per hole in use, from the first to the one before the last] }
//           tap { part, pin } (enters the strip: −pin current) | { supply, sign } (± supply current)
//   lights: [{ part, at, color }]  LEDs, glowing at the chip;  hot: [{ part, at }] parts that heat
//   vmax:   the voltage the colour scale ends at
// `all`: every piece, even with no current (the live page); otherwise only those with current.
export function conductorPieces(built, sim, circuit, { all = false } = {}) {
  const empty = { wires: [], dots: [], strips: {}, lights: [], hot: [], vmax: 0 };
  if (!sim?.ok) return empty;
  const { wires, dots, strips, lights, hot } = empty;
  const taps = new Map(); // hole id → taps entering the strip there
  const tapAt = (hole, tap) => taps.set(hole.id, [...(taps.get(hole.id) ?? []), tap]);
  const entering = (tap) => (tap.part ? -(sim.parts[tap.part]?.floating ? 0 : sim.parts[tap.part]?.pinCurrents?.[tap.pin] ?? 0) : tap.sign * (sim.supplies[tap.supply]?.current ?? 0));

  for (const part of built.parts) {
    const reading = sim.parts[part.id];
    if (!reading?.pinCurrents) continue;
    const paths = partPaths(part);
    const centre = centreVoltage(reading.pins);
    paths.forEach((path, k) => {
      tapAt(part.holes[k], { part: part.id, pin: path.pin });
      const v = reading.pins?.[path.pin] ?? null;
      const lead = path.points.slice(0, path.body + 1);
      const body = path.points.slice(path.body);
      if (lead.length > 1) wires.push({ points: lead, ref: { part: part.id, pin: path.pin }, voltage: v });
      if (body.length > 1) {
        split(body, BODY_PIECES).forEach((points, j) => {
          const share = bodyShare((j + 0.5) / BODY_PIECES);
          wires.push({ points, ref: { part: part.id, pin: path.pin, share }, voltage: bodyVoltage(v, centre, share) });
        });
      }
      const i = reading.floating ? 0 : reading.pinCurrents[path.pin] ?? 0;
      if (all || Math.abs(i) >= MIN_CURRENT) dots.push({ points: path.points, ref: { part: part.id, pin: path.pin }, current: i });
    });
    const middle = paths[0].points.at(-1);
    if (reading.kind === 'LED') lights.push({ part: part.id, at: middle, light: part.built.light, color: LED_LIGHT[part.def.electrical.color] ?? LED_LIGHT.red, brightness: reading.brightness });
    if (typeof reading.power === 'number' && ['R', 'REG', 'Q', 'M', 'D', 'BR'].includes(reading.kind)) hot.push({ part: part.id, at: middle });
  }
  const nodes = new Set(Object.keys(built.netlist.nodes));
  for (const s of supplyHoles(built.board, circuit)) {
    if (!sim.supplies[s.id] || !s.positive || !s.negative) continue;
    tapAt(s.positive, { supply: s.id, sign: 1 });
    tapAt(s.negative, { supply: s.id, sign: -1 });
    nodes.add(s.positive.node).add(s.negative.node);
  }
  for (const node of nodes) {
    const holes = stripHoles(built.board, node);
    const inUse = holes.map((h, k) => (taps.has(h.id) ? k : -1)).filter((k) => k >= 0);
    if (inUse.length < 2) continue;
    // The metal between the first and the last hole in use, then the current piece by piece.
    const first = inUse[0];
    const last = inUse.at(-1);
    wires.push({ points: holes.slice(first, last + 1).map((h) => ({ ...h.pos, z: 0 })), ref: { node }, voltage: sim.nodes[node] ?? null });
    strips[node] = holes.slice(first, last).map((h) => taps.get(h.id) ?? []);
    let running = 0;
    for (let k = first; k < last; k++) {
      running += (taps.get(holes[k].id) ?? []).reduce((sum, tap) => sum + entering(tap), 0);
      if (all || Math.abs(running) >= MIN_CURRENT) dots.push({ points: [{ ...holes[k].pos, z: 0 }, { ...holes[k + 1].pos, z: 0 }], ref: { node, k: k - first }, current: running });
    }
  }
  const volts = [...Object.values(sim.nodes), ...Object.values(sim.supplies).map((s) => s.voltage)].filter((v) => Number.isFinite(v));
  return { wires, dots, strips, lights, hot, vmax: Math.max(0, ...volts.map(Math.abs)) };
}

// A lit LED: a halo of the colour of its light around its dome, drawn over the veil. Its rings
// share data-glow, so the live page fades them together with the LED's current.
function litLed(scene, l, style) {
  const tag = { cls: 'glow', style, part: l.part, data: { glow: l.part } };
  const project = (p) => scene.camera.project(p);
  let c = project(l.at);
  let r = 6;
  if (l.light) {
    // The dome's size on screen: its middle, and how far its rim reaches from there.
    const { base, radius, height } = l.light;
    c = project({ x: base.x, y: base.y, z: base.z + height / 2 });
    const rim = [0, 1, 2, 3].map((k) => project({ x: base.x + radius * Math.cos((k * Math.PI) / 2), y: base.y + radius * Math.sin((k * Math.PI) / 2), z: base.z + height / 2 }));
    const top = project({ ...base, z: base.z + height });
    r = Math.max(...rim.map((p) => Math.hypot(p.x - c.x, p.y - c.y)), Math.abs(c.y - top.y));
  }
  return [0.12, 0.22, 0.38].map((alpha, k) => ({ kind: 'circle', cx: c.x, cy: c.y, r: r * (2.6 - k * 0.55), fill: l.color, fillOpacity: alpha, ...tag }));
}

const pathData = (pts) => pts.map((p, i) => `${i ? 'L' : 'M'}${Math.round(p.x * 100) / 100} ${Math.round(p.y * 100) / 100}`).join(' ');

// What the live page needs to drive the pieces flowOps draws with `live`, in the same order.
export function liveFlow(built, sim, circuit) {
  const { wires, dots, strips, lights, hot, vmax } = conductorPieces(built, sim, circuit, { all: true });
  return { wires: wires.map((w) => w.ref), dots: dots.map((d) => d.ref), strips, lights: lights.map((l) => l.part), hot: hot.map((h) => h.part), vmax };
}

// The pieces as drawing operations for the `flow` layer: heat and glow under everything, then
// the coloured conductors, then the dots.
export function flowOps(scene, built, sim, circuit, { live = false } = {}) {
  const { wires, dots, lights, hot, vmax } = conductorPieces(built, sim, circuit, { all: live });
  const project = (points) => points.map((p) => scene.camera.project(p));
  const tag = (ref) => ({ ...(ref.part && { part: ref.part }), data: ref.part ? { flow: ref.part } : { node: ref.node } });
  const peak = Math.max(0, ...dots.map((d) => Math.abs(d.current)));
  const seconds = (speed) => (speed > 0.2 ? (DOT_PERIOD / speed).toFixed(3) : '99999');
  const ops = [];
  if (live) {
    for (const h of hot) {
      const at = scene.camera.project(h.at);
      ops.push({ kind: 'circle', cx: at.x, cy: at.y, r: 11, fill: HEAT_COLOR, cls: 'heat', style: 'opacity:0', part: h.part, data: { heat: h.part } });
    }
  }
  for (const l of lights) ops.push(...litLed(scene, l, `opacity:${glowOpacity(l.brightness).toFixed(2)}`));
  wires.forEach((w, i) => {
    ops.push({ kind: 'path', d: pathData(project(w.points)), stroke: voltageColor(w.voltage, vmax), strokeWidth: w.ref.node ? STRIP_WIDTH : CONDUCTOR_WIDTH, cls: 'conductor', ...tag(w.ref), ...(live && { data: { ...tag(w.ref).data, wire: i } }) });
  });
  dots.forEach((piece, i) => {
    // A static image points each piece the way its current goes; the live page draws them all
    // hole → part (strips forwards) and moves the dots either way.
    const points = project(live || piece.current > 0 ? piece.points : piece.points.slice().reverse());
    const base = { kind: 'path', d: pathData(points), stroke: DOT_COLOR, strokeWidth: DOT_WIDTH, dash: `0 ${DOT_PERIOD}`, cls: 'dots', ...tag(piece.ref) };
    if (live) ops.push({ ...base, data: { ...base.data, seg: i } });
    else ops.push({ ...base, style: `--lin:${seconds(dotSpeed(piece.current, peak))}s;--log:${seconds(dotSpeed(piece.current, peak, 'log'))}s` });
  });
  return ops;
}
