// The bench (a video about one part, F3; docs/en/component-focus.md): the part on its pedestal as on
// a test bench. Each pin's stub runs down to a pad in a row under the part; the pad takes the colour of
// the pin's voltage (the current layer's scale), and under it the pin, its voltage, the current into it
// and what it is joined to in the circuit ("→ R1 1 kΩ", page.js). The circuit keeps running hidden:
// a `set` on a part not shown (the base resistor) changes the pads as it changes the circuit. With the
// current layer on, dots run along each stub at the speed the current layer gives that current.
//
// Drawn like the pinout (pinout.js): in the drawing, in a layer under the part's copy, laid out in
// screen px inside the free area, again on every tick (the readings move). The stubs never cross: the
// pads are in the order of the pins on screen, each stub goes down from its tip to one level and then
// straight to its pad, and two pins at one x get stubs apart (the higher tip moves, as in the pinout).
// F0's findings: a reading under a millivolt is 0 V; a chip's back row sends its stubs from under the body.

import { voltageColor, dotSpeed, DOT_COLOR } from '../../sim/look.js';
import { CHAR, fixed, make, screenOf, layerOf, tipsOf } from './pinout.js';

// Sizes in px at the format's width (1080 portrait, 1920 landscape); `many`: a part of more than 4 pins.
export const BENCH = { gap: 40, drop: 80, pad: 34, pitch: 230, margin: 40, apart: 10, line: 4, dot: 7, period: 20, name: 26, volts: 38, voltsMany: 28, small: 22, min: 9, floor: 1e-3 };

// Where each pad goes and how its stub runs, in px: `tips` [{ x, y }] of the part's pins.
export function layoutPads(tips, free, u) {
  const n = tips.length;
  const order = tips.map((p, i) => ({ i, x: p.x, y: p.y })).sort((a, b) => a.x - b.x || a.y - b.y);
  // Stubs apart at one x, the higher tip moving (it is first of the two in the order).
  const xs = new Array(n);
  for (let j = n - 1; j >= 0; j--) xs[j] = j === n - 1 ? order[j].x : Math.min(order[j].x, xs[j + 1] - BENCH.apart * u);
  const level = Math.max(...tips.map((p) => p.y)) + BENCH.gap * u;
  const y = level + BENCH.drop * u;
  const width = free.x1 - free.x0 - 2 * BENCH.margin * u;
  const pitch = Math.min(BENCH.pitch * u, width / n);
  const mid = tips.reduce((s, p) => s + p.x, 0) / n;
  const half = (pitch * (n - 1)) / 2;
  const centre = Math.min(Math.max(mid, free.x0 + BENCH.margin * u + pitch / 2 + half), free.x1 - BENCH.margin * u - pitch / 2 - half);
  const pads = new Array(n);
  order.forEach((p, j) => {
    const x = centre - half + pitch * j;
    pads[p.i] = { x, y, pitch, points: [[tips[p.i].x, tips[p.i].y], [xs[j], tips[p.i].y], [xs[j], level], [x, y - (BENCH.pad * u) / 2]] };
  });
  return pads;
}

// The first `share` of a polyline's length.
function partOf(points, share) {
  const lengths = points.slice(1).map((q, i) => Math.hypot(q[0] - points[i][0], q[1] - points[i][1]));
  let left = lengths.reduce((s, l) => s + l, 0) * share;
  const out = [points[0]];
  for (const [i, l] of lengths.entries()) {
    const [a, b] = [points[i], points[i + 1]];
    if (left >= l) {
      out.push(b);
      left -= l;
      continue;
    }
    if (l > 0) out.push([a[0] + ((b[0] - a[0]) * left) / l, a[1] + ((b[1] - a[1]) * left) / l]);
    break;
  }
  return out;
}

// `reading()`: the engine's last reading; `look()`: { vmax, peak, speed, scale } of the current layer;
// `f(value, unit)`: a figure in the page's language; `now()`: the director's time (ms).
export function setupBench(page, { reading, look, f, now }) {
  let on = null; // { id, k } the part on the bench, `k` the share of its stubs drawn (M21)
  const layers = new WeakMap();
  const phase = new Map(); // pin index → the dots' offset, px
  let last = null;

  function draw() {
    const t = now();
    const dt = last == null ? 0 : Math.max(0, t - last) / 1000;
    last = t;
    for (const s of page.svgs) layers.get(s)?.replaceChildren();
    const pinout = on && page.data.pinouts?.[page.state.view]?.[on.id];
    const screen = pinout && screenOf(page);
    if (!screen) return;
    const g = layerOf(page, 'bench', layers);
    const { k, at, u, free } = screen;
    const many = pinout.pins.length > 4;
    const tips = tipsOf(page, on.id, pinout.pins, screen);
    const pads = layoutPads(tips, free, u);
    const r = reading();
    const part = r?.parts?.[on.id];
    const { vmax, peak, speed, scale, flowing } = look();
    const s = Math.max(u, 0.5);
    for (const [i, pin] of pinout.pins.entries()) {
      const pad = pads[i];
      const raw = part?.pins?.[pin.name] ?? r?.nodes?.[pin.node];
      const v = typeof raw === 'number' ? (Math.abs(raw) < BENCH.floor ? 0 : raw) : null;
      const current = part && !part.floating ? part.pinCurrents?.[pin.name] ?? 0 : 0;
      const colour = voltageColor(v, vmax);
      const one = make(g, 'g', { 'data-bench': `${on.id}.${pin.name}` });
      const d = (points) => points.map(([x, y], n) => `${n ? 'L' : 'M'}${at(x, y).join(' ')}`).join('');
      make(one, 'path', { class: 'stub', d: d(partOf(pad.points, on.k)), stroke: colour, 'stroke-width': BENCH.line * s * k });
      if (on.k < 1) continue;
      // The dots: current into the pin runs from its pad up the stub (against the path's way).
      if (flowing) {
        phase.set(i, ((phase.get(i) ?? 0) + Math.sign(current) * dotSpeed(current, peak, speed) * scale * 2 * s * dt) % (BENCH.period * s));
        make(one, 'path', { class: 'dots', d: d(pad.points), stroke: DOT_COLOR, 'stroke-width': BENCH.dot * s * k, 'stroke-dasharray': `0 ${fixed(BENCH.period * s * k)}`, 'stroke-dashoffset': fixed((phase.get(i) ?? 0) * k) });
      }
      const half = (BENCH.pad * s) / 2;
      const [px, py] = at(pad.x - half, pad.y - half);
      make(one, 'rect', { class: 'pad', x: px, y: py, width: fixed(2 * half * k), height: fixed(2 * half * k), rx: fixed(4 * s * k), fill: colour });
      // Under the pad: the pin, its voltage, the current into it, what it is joined to; each line fitted
      // to nine tenths of the pads' pitch, so neighbours never touch.
      const lines = [
        ['name', many ? `${i + 1} ${pin.name}` : pin.name, BENCH.name],
        ['volts', v == null ? '—' : f(v, 'V'), many ? BENCH.voltsMany : BENCH.volts],
        ...(Math.abs(current) >= 1e-6 ? [['amps', f(Math.abs(current), 'A'), BENCH.small]] : []),
        ...(pin.to ? [['to', pin.to, BENCH.small]] : []),
      ];
      let y = pad.y + half + BENCH.small * s * 0.6;
      for (const [cls, words, px] of lines) {
        const size = Math.max(BENCH.min, Math.min(px * s, (pad.pitch * 0.9) / Math.max(1, words.length * CHAR)));
        y += size * 1.15;
        const [tx, ty] = at(pad.x, y);
        const text = make(one, 'text', { class: cls, x: tx, y: ty, 'font-size': fixed(size * k), 'text-anchor': 'middle' });
        text.textContent = words;
      }
    }
  }

  return {
    // The bench of a part, on (`k` of its stubs drawn, M21) or off.
    show(id) {
      on = { id, k: 0 };
      return (k) => {
        if (on?.id === id) on.k = k;
        draw();
      };
    },
    clear() {
      on = null;
      phase.clear();
      draw();
    },
    get part() {
      return on?.id ?? null;
    },
    draw,
  };
}
