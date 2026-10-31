// Where current flows, drawn as the "conductor view": every conductor (a piece of metal strip,
// a lead, the inside of a body, a jumper wire) as one thick line coloured by its voltage, and
// dots moving along it in the direction of conventional current (+ to −, as in Falstad's
// CircuitJS), at a speed proportional to the current. LEDs glow with their current.
//
// Two styles (stage and video, V3; docs/en/stage-and-video.md, "The drawing that tells"):
// - `plan` (the default): everything at board level. A pad at every landing (the hole's dot grown,
//   in the colour of its voltage); a straight line through a part of two pins (a resistor, an LED,
//   a jumper) from pad to pad; a short stub of one pitch per pin towards the body of a part with
//   more pins, so each pin's dots show its current without lines crossing; the internal links a
//   part declares (a push button's pairs, and its bridge while pressed) between its pads; a rail's
//   net name printed beside its pad. Parts beside the board (batteries, boards on Dupont leads,
//   switches on clips) keep their real paths.
// - `real`: the paths of the packages: `build()` may return `paths`, one per pin, each a 3D
//   polyline from the hole (z = 0) to a point inside the part shared by all its pins, with `body`
//   the index where the body starts. Without them, a straight line from the hole to the middle of
//   the holes.
//
// The current in each piece of a strip comes from Kirchhoff's current law: walking along the
// strip, the current between two holes is the sum of what entered at the holes behind.
//
// Two uses: a static image (dots only where current flows, pointing its way, still) and the
// live page (`live`: every piece, drawn hole → part and strip forwards, each tagged with its
// index; page/client/live.js moves and colours them from the running simulation).

import { stripHoles } from '../render/focus.js';
import { decalTextOp } from '../render/scene.js';
import { textDecal } from '../geometry/primitives.js';
import { v3, X, Y, scale } from '../core/vec.js';
import { LED_LIGHT } from '../parts/colors.js';
import { MIN_CURRENT, DOT_PERIOD, voltageColor, dotSpeed, bodyShare, bodyVoltage, centreVoltage, glowOpacity } from './look.js';

export { MIN_CURRENT, VOLTAGE_COLORS, voltageColor, dotSpeed, bodyShare } from './look.js';

export const CONDUCTOR_WIDTH = 3.2; // leads, bodies, wires (px)
export const STRIP_WIDTH = 4.2; // metal strips inside the board: wider, they carry more
export const DOT_WIDTH = 2.4; // narrower than the conductor, so its colour shows around the dots
export const DOT_COLOR = '#ffd21f';
export const HEAT_COLOR = '#ff6a00';
const BODY_PIECES = 6; // per pin, from the lead to the middle of the body
export const PAD_WIDTH = 6; // a landing in the plan: the hole's dot grown (px, a round cap)
const PAD_EDGE = 1.6; // px of the background around a pad
const PAD_EDGE_COLOR = '#fbfaf7'; // the page's veil (CSS gives it the theme's)
const PITCH = 2.54; // mm: the stub of a pin on a part of three or more
export const FLOW_STYLES = ['plan', 'real'];

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

// The plan of a part: each pin from its hole at board level, to the middle of the holes (two
// pins) or one pitch towards the body (more). A part whose body lies beside the board keeps `real`.
function planPaths(part, real, board) {
  const { length: L, width: W } = board.spec.size;
  const end = real[0]?.points.at(-1);
  if (!end || end.x < 0 || end.x > L || end.y < 0 || end.y > W) return real;
  const at = (h) => ({ x: h.pos.x, y: h.pos.y, z: 0 });
  const middle = { ...average(part.holes.map(at)), z: 0 };
  if (part.holes.length === 2) return part.holes.map((h, i) => ({ pin: part.pinNames[i], points: [at(h), middle], body: 1 }));
  // In a row (a TO-92, a regulator, a potentiometer): stubs side by side, across the row, towards
  // the side where the body is. Otherwise towards the middle of the holes.
  const a = at(part.holes[0]);
  const b = at(part.holes.at(-1));
  const along = { x: b.x - a.x, y: b.y - a.y };
  const span = Math.hypot(along.x, along.y);
  const inRow = span > 0 && part.holes.every((h) => Math.abs(((h.pos.x - a.x) * along.y - (h.pos.y - a.y) * along.x) / span) < 0.3);
  let across = null;
  if (inRow) {
    across = { x: -along.y / span, y: along.x / span };
    const side = (end.x - middle.x) * across.x + (end.y - middle.y) * across.y;
    if (side < 0) across = { x: -across.x, y: -across.y };
  }
  return part.holes.map((h, i) => {
    const p = at(h);
    let dir = across;
    let length = PITCH;
    if (!dir) {
      const d = Math.hypot(middle.x - p.x, middle.y - p.y);
      dir = d > 1e-9 ? { x: (middle.x - p.x) / d, y: (middle.y - p.y) / d } : { x: 0, y: -1 };
      length = Math.min(PITCH, 0.45 * d) || PITCH;
    }
    return { pin: part.pinNames[i], points: [p, { x: p.x + dir.x * length, y: p.y + dir.y * length, z: 0 }], body: 1 };
  });
}

// Two flat lines on one line (two jumpers along a row, overlapping) cannot be told apart: a line
// of two pins that would lie on one already drawn moves aside, a little (its pads stay on the holes).
const ASIDE = [0.9, -0.9, 1.6, -1.6]; // mm across the line, tried in turn
function setAside(paths, drawn) {
  if (paths.length !== 2 || paths.some((p) => p.points.length !== 2)) return paths;
  const [a, b] = [paths[0].points[0], paths[1].points[0]];
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  if (!(len > 0)) return paths;
  const u = { x: (b.x - a.x) / len, y: (b.y - a.y) / len };
  const on = (shift) => drawn.some(([p, q]) => {
    const off = (r) => Math.abs((r.x - a.x - shift.x) * u.y - (r.y - a.y - shift.y) * u.x);
    if (off(p) > 0.3 || off(q) > 0.3) return false;
    const along = (r) => (r.x - a.x) * u.x + (r.y - a.y) * u.y;
    const [s0, s1] = [along(p), along(q)].sort((m, n) => m - n);
    return Math.min(len, s1) - Math.max(0, s0) > 1;
  });
  const none = { x: 0, y: 0 };
  const shift = on(none) ? (ASIDE.map((k) => ({ x: -u.y * k, y: u.x * k })).find((s) => !on(s)) ?? none) : none;
  drawn.push([a, b].map((p) => ({ x: p.x + shift.x, y: p.y + shift.y })));
  if (shift === none) return paths;
  return paths.map((p) => {
    const [hole, mid] = p.points;
    const moved = [hole, { ...hole, x: hole.x + shift.x, y: hole.y + shift.y }, { ...mid, x: mid.x + shift.x, y: mid.y + shift.y }];
    return { ...p, points: moved, body: moved.length - 1 };
  });
}

// The links inside a part, between its pads: each pole of a switch (pins of one metal piece), and
// the bridge between its first two poles while it is pressed. [{ from, to, pin, bridge }]
function partLinks(part) {
  const poles = part.def.electrical?.poles;
  if (!Array.isArray(poles)) return [];
  const hole = (pin) => part.holes[part.pinNames.indexOf(pin)];
  const out = [];
  for (const pole of poles) for (let k = 1; k < pole.length; k++) out.push({ from: hole(pole[k - 1]), to: hole(pole[k]), pin: pole[0] });
  if (poles.length > 1) out.push({ from: hole(poles[0][0]), to: hole(poles[1][0]), pin: poles[0][0], bridge: true });
  return out.filter((l) => l.from && l.to);
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

// Pieces of one polyline (each starting where the last ended) as one list of points.
const joined = (pieces) => pieces.flatMap((p, k) => (k ? p.slice(1) : p));

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
// In the plan, wires also hold the pads (`pad`, a point: { at }) and the links inside parts
// (`link`; `bridge` with the part's id, drawn while it is pressed); rails: the rail pads, for
// their net names.
// `all`: every piece, even with no current (the live page); otherwise only those with current.
export function conductorPieces(built, sim, circuit, { all = false, style = 'plan' } = {}) {
  const empty = { wires: [], dots: [], strips: {}, lights: [], hot: [], rails: [], vmax: 0 };
  if (!sim?.ok) return empty;
  const { wires, dots, strips, lights, hot, rails } = empty;
  const plan = style === 'plan';
  const pads = new Map(); // hole id → the hole, every landing
  const flat = []; // the plan's lines of two pins drawn so far, for setAside
  const taps = new Map(); // hole id → taps entering the strip there
  const tapAt = (hole, tap) => taps.set(hole.id, [...(taps.get(hole.id) ?? []), tap]);
  const entering = (tap) => (tap.part ? -(sim.parts[tap.part]?.floating ? 0 : sim.parts[tap.part]?.pinCurrents?.[tap.pin] ?? 0) : tap.sign * (sim.supplies[tap.supply]?.current ?? 0));

  for (const part of built.parts) {
    const reading = sim.parts[part.id];
    if (!reading?.pinCurrents) continue;
    const real = partPaths(part);
    const planned = plan ? planPaths(part, real, built.board) : real;
    const paths = plan && planned !== real ? setAside(planned, flat) : planned;
    const centre = centreVoltage(reading.pins);
    if (plan) {
      for (const h of part.holes) pads.set(h.id, h);
      for (const l of partLinks(part)) {
        const ref = { part: part.id, pin: l.pin };
        if (l.bridge && !all && !reading.pressed) continue;
        wires.push({ points: [l.from, l.to].map((h) => ({ ...h.pos, z: 0 })), ref, voltage: reading.pins?.[l.pin] ?? null, link: true, ...(l.bridge && { bridge: part.id }) });
      }
    }
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
    const middle = real[0].points.at(-1);
    if (reading.kind === 'LED') lights.push({ part: part.id, at: middle, light: part.built.light, color: LED_LIGHT[part.def.electrical.color] ?? LED_LIGHT.red, brightness: reading.brightness });
    if (typeof reading.power === 'number' && ['R', 'REG', 'Q', 'M', 'D', 'BR'].includes(reading.kind)) hot.push({ part: part.id, at: middle });
  }
  const nodes = new Set(Object.keys(built.netlist.nodes));
  for (const s of supplyHoles(built.board, circuit)) {
    if (!sim.supplies[s.id] || !s.positive || !s.negative) continue;
    tapAt(s.positive, { supply: s.id, sign: 1 });
    tapAt(s.negative, { supply: s.id, sign: -1 });
    if (plan) pads.set(s.positive.id, s.positive).set(s.negative.id, s.negative);
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
  for (const h of pads.values()) {
    wires.push({ points: [{ ...h.pos, z: 0 }, { ...h.pos, z: 0 }], ref: { node: h.node }, voltage: sim.nodes[h.node] ?? null, pad: true });
    if (h.kind === 'rail' && !rails.some((r) => r.node === h.node)) rails.push(h);
  }
  // A signal generator's colours end at its peak, not at its value at t = 0.
  const volts = [...Object.values(sim.nodes), ...Object.values(sim.supplies).map((s) => s.peak ?? s.voltage)].filter((v) => Number.isFinite(v));
  return { wires, dots, strips, lights, hot, rails, vmax: Math.max(0, ...volts.map(Math.abs)) };
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
export function liveFlow(built, sim, circuit, style = 'plan') {
  const { wires, dots, strips, lights, hot, vmax } = conductorPieces(built, sim, circuit, { all: true, style });
  return { wires: wires.map((w) => w.ref), dots: dots.map((d) => d.ref), strips, lights: lights.map((l) => l.part), hot: hot.map((h) => h.part), vmax };
}

// The style a circuit asks for: page.flow.style, else the plan.
export const flowStyle = (circuit) => (FLOW_STYLES.includes(circuit?.page?.flow?.style) ? circuit.page.flow.style : 'plan');

// A rail's net name (netLabels) printed flat beside its pad, as the board prints it at its end.
function railName(scene, board, circuit, hole) {
  const text = circuit.netLabels?.[hole.node];
  const rail = board.spec.rails.find((r) => r.id === hole.node);
  if (!text || !rail) return null;
  const color = rail.polarity === '+' ? board.spec.colors.plus : board.spec.colors.minus;
  const decal = textDecal({ text, at: v3(hole.pos.x + 1.6, hole.pos.y, 0), right: X, down: scale(Y, -1), size: 2.4, color, anchor: 'start', weight: 700 });
  const { box, px, ...op } = decalTextOp(scene.camera, decal);
  return { ...op, cls: 'net', data: { net: hole.node } };
}

// How far a 3D polyline is from the camera: the depth of its middle, weighted by length (a lead
// with many points along its bend counts as much as a straight one). Bigger = farther.
function pathDepth(camera, points) {
  if (points.length === 1) return camera.project(points[0]).depth;
  let sum = 0;
  let total = 0;
  for (let k = 1; k < points.length; k++) {
    const length = segmentLength(points[k - 1], points[k]);
    sum += length * camera.project(lerp3(points[k - 1], points[k], 0.5)).depth;
    total += length;
  }
  return total > 0 ? sum / total : camera.project(points[0]).depth;
}

// Closest points of two segments on screen: { d (distance), s, t (where along each, 0…1) }.
function closest(a0, a1, b0, b1) {
  const ux = a1.x - a0.x, uy = a1.y - a0.y, vx = b1.x - b0.x, vy = b1.y - b0.y, wx = a0.x - b0.x, wy = a0.y - b0.y;
  const a = ux * ux + uy * uy, b = ux * vx + uy * vy, c = vx * vx + vy * vy, d = ux * wx + uy * wy, e = vx * wx + vy * wy;
  const den = a * c - b * b;
  const clamp = (x) => Math.min(1, Math.max(0, x));
  let s = den > 1e-12 ? clamp((b * e - c * d) / den) : 0;
  const t = c > 1e-12 ? clamp((b * s + e) / c) : 0;
  s = a > 1e-12 ? clamp((b * t - d) / a) : 0;
  const dx = wx + ux * s - vx * t, dy = wy + uy * s - vy * t;
  return { d: Math.hypot(dx, dy), s, t };
}

// Painting order of lines in 3D, for one view. Two lines can only cover each other where they
// meet on screen (closer than `reach`, their half widths): there, the one farther from the camera
// must be painted first. Those pairs give a partial order (a topological sort); the depth of each
// line's middle decides whatever they leave open, and breaks a cycle (A over B at one crossing, B
// over A at another). A plain sort by the middle fails for long pieces: a jumper crossing a
// resistor over its middle came out under the resistor's nearer half.
//   lines: [{ points: [3D…], group }]   lines of the same group (one part) are never compared
//   → the indices of `lines`, farthest first
export function paintOrder(camera, lines, reach) {
  const proj = lines.map((l) => l.points.map((p) => camera.project(p)));
  const middle = lines.map((l) => pathDepth(camera, l.points));
  const n = lines.length;
  const after = Array.from({ length: n }, () => new Set()); // i → the lines painted over i
  const before = new Array(n).fill(0); // how many lines must come before each one
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (lines[i].group != null && lines[i].group === lines[j].group) continue;
      let vote = 0; // > 0: i is farther (painted first)
      for (let a = 1; a < proj[i].length; a++) {
        for (let b = 1; b < proj[j].length; b++) {
          const pa0 = proj[i][a - 1], pa1 = proj[i][a], pb0 = proj[j][b - 1], pb1 = proj[j][b];
          const m = closest(pa0, pa1, pb0, pb1);
          if (m.d > reach) continue;
          const di = pa0.depth + (pa1.depth - pa0.depth) * m.s;
          const dj = pb0.depth + (pb1.depth - pb0.depth) * m.t;
          if (Math.abs(di - dj) > 1e-6) vote += di > dj ? 1 : -1;
        }
      }
      if (vote > 0 && !after[i].has(j)) {
        after[i].add(j);
        before[j]++;
      } else if (vote < 0 && !after[j].has(i)) {
        after[j].add(i);
        before[i]++;
      }
    }
  }
  const order = [];
  const done = new Array(n).fill(false);
  // Farthest middle first among the lines that are free; if none is free (a cycle), the farthest.
  const pick = (free) => {
    let best = -1;
    for (let k = 0; k < n; k++) if (!done[k] && (!free || before[k] === 0) && (best < 0 || middle[k] > middle[best] + 1e-9)) best = k;
    return best;
  };
  while (order.length < n) {
    let k = pick(true);
    if (k < 0) k = pick(false);
    done[k] = true;
    order.push(k);
    for (const j of after[k]) before[j]--;
  }
  return order;
}

// The lit LEDs alone, for the `lights` layer: drawn over the parts whenever there are simulation
// results (not only in the current layer), so an LED that conducts is seen glowing.
export function lightOps(scene, built, sim, circuit) {
  return conductorPieces(built, sim, circuit).lights.flatMap((l) => litLed(scene, l, `opacity:${glowOpacity(l.brightness).toFixed(2)}`));
}

// The pieces as drawing operations for the `flow` layer, in painting order for this view:
// 1. heat and glow, under everything;
// 2. the metal strips and their dots: they lie inside the board, under every lead and wire (and
//    strips never cross one another);
// 3. each pin of each part (its lead, its body pieces, then its dots), ordered where they cross
//    on screen by which is nearer there (paintOrder): a lead or a jumper in front is drawn over
//    one behind, in the front view and in the back view alike.
// The live page finds the pieces by data-wire / data-seg, so their order in the file is free.
export function flowOps(scene, built, sim, circuit, { live = false, style = 'plan' } = {}) {
  const { wires, dots, lights, hot, rails, vmax } = conductorPieces(built, sim, circuit, { all: live, style });
  const project = (points) => points.map((p) => scene.camera.project(p));
  const tag = (ref) => ({ ...(ref.part && { part: ref.part }), data: ref.part ? { flow: ref.part } : { node: ref.node } });
  const peak = Math.max(0, ...dots.map((d) => Math.abs(d.current)));
  const seconds = (speed) => (speed > 0.2 ? (DOT_PERIOD / speed).toFixed(3) : '99999');
  const under = [];
  if (live) {
    for (const h of hot) {
      const at = scene.camera.project(h.at);
      under.push({ kind: 'circle', cx: at.x, cy: at.y, r: 11, fill: HEAT_COLOR, cls: 'heat', style: 'opacity:0', part: h.part, data: { heat: h.part } });
    }
  }
  for (const l of lights) under.push(...litLed(scene, l, `opacity:${glowOpacity(l.brightness).toFixed(2)}`));

  const strip = { conductors: [], dots: [] };
  const links = [];
  const pads = [];
  const pins = new Map(); // part|pin → { conductors, dots, depth sum, length }
  const pinOf = (ref) => {
    const key = `${ref.part}|${ref.pin}`;
    if (!pins.has(key)) pins.set(key, { part: ref.part, conductors: [], dots: [], points: [] });
    return pins.get(key);
  };
  wires.forEach((w, i) => {
    const d = pathData(project(w.points));
    const width = w.pad ? PAD_WIDTH : w.ref.node ? STRIP_WIDTH : CONDUCTOR_WIDTH;
    const data = { ...tag(w.ref).data, ...(w.bridge && { bridge: w.bridge }), ...(live && { wire: i }) };
    const op = { kind: 'path', d, stroke: voltageColor(w.voltage, vmax), strokeWidth: width, cls: w.pad ? 'conductor pad' : w.link ? 'conductor link' : 'conductor', ...tag(w.ref), data };
    if (w.pad) pads.push({ kind: 'path', d, stroke: PAD_EDGE_COLOR, strokeWidth: PAD_WIDTH + 2 * PAD_EDGE, cls: 'pad-edge' }, op);
    else if (w.link) links.push(op);
    else if (w.ref.node) strip.conductors.push(op);
    else {
      const pin = pinOf(w.ref);
      pin.conductors.push(op);
      pin.points.push(w.points);
    }
  });
  dots.forEach((piece, i) => {
    // A static image points each piece the way its current goes; the live page draws them all
    // hole → part (strips forwards) and moves the dots either way.
    const points = project(live || piece.current > 0 ? piece.points : piece.points.slice().reverse());
    const base = { kind: 'path', d: pathData(points), stroke: DOT_COLOR, strokeWidth: DOT_WIDTH, dash: `0 ${DOT_PERIOD}`, cls: 'dots', ...tag(piece.ref) };
    const op = live ? { ...base, data: { ...base.data, seg: i } } : { ...base, style: `--lin:${seconds(dotSpeed(piece.current, peak))}s;--log:${seconds(dotSpeed(piece.current, peak, 'log'))}s` };
    if (piece.ref.node) strip.dots.push(op);
    else {
      const pin = pinOf(piece.ref);
      pin.dots.push(op);
      if (!pin.points.length) pin.points.push(piece.points);
    }
  });
  // Each pin is one line (its lead and body pieces joined): where two meet on screen, the
  // farther goes first (paintOrder). The pins of one part only touch at its middle.
  const list = [...pins.values()];
  const ordered = paintOrder(scene.camera, list.map((pin) => ({ points: joined(pin.points), group: pin.part })), CONDUCTOR_WIDTH)
    .flatMap((k) => [...list[k].conductors, ...list[k].dots]);
  // Pads over the lines that land on them (a line that crosses another without a pad is not
  // joined to it, as in a schematic), the rails' names beside theirs.
  const names = rails.map((h) => railName(scene, built.board, circuit, h)).filter(Boolean);
  return [...under, ...strip.conductors, ...strip.dots, ...links, ...ordered, ...pads, ...names];
}
