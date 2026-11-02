// The figure beside a part on its pedestal (a video about one part, F4; docs/en/component-focus.md):
// its schematic symbol (`symbol`) or a teaching diagram of what goes on inside it (`inside`), in the
// room the free area leaves beside the part, on the side with more of it. One at a time: showing one
// takes the other away. Both only when a step asks for them.
//
// The symbol is data (src/parts/symbols.js: strokes and the terminal of each pin in a box of 100).
// With it (M22), each real pin gets the symbol's name for it (B, C, E; a chip's number): at the start of
// its row when the pinout shows it, else under its tip. The symbol and the part say which leg is which
// with identifiers, not lines (lines between them were noise over the pinout and the bench, the
// maintainer found).
//
// The inside view (M23) is drawn on every tick from the engine's reading: a bipolar transistor's
// three layers with its base and collector currents as arrows outside them, as wide as the current,
// and their figures and its region on lines under it; a MOSFET's channel opening with its gate
// voltage, its current as an arrow under it; an LED's chip and lens glowing with its brightness; a
// 555's two comparators, its latch and its output. Arrows never cross what they explain: they run
// beside the layers, under the channel. Didactic, not to scale.

import { DOT_COLOR } from '../../sim/look.js';
import { PINOUT, fixed, make, screenOf, layerOf, tipsOf } from './pinout.js';
import { partsRect } from './view.js';

// Sizes in px at the format's width; times in ms.
export const FIGURE = { size: 300, margin: 44, min: 130, line: 2.4, text: 11, small: 8, id: 26 };

// Where the figure goes on screen, px: a slot beside the part, `w`×`h` units scaled; on its right (the
// direction chosen for the pedestal), on its left only when the right is too narrow for it; above it
// when it is clearly larger there (a phone).
export function figureSlot(part, free, u, w, h) {
  const margin = FIGURE.margin * u;
  const right = free.x1 - part.right - margin;
  const left = part.left - free.x0 - margin;
  // Above the part, centred on it, when the figure is larger there than on either side (a phone).
  const above = part.top - free.y0 - margin;
  const side = Math.min(FIGURE.size * u, Math.max(right, left)) / Math.max(w, h);
  const top = Math.min(FIGURE.size * u, above, free.x1 - free.x0) / Math.max(w, h);
  if (top > side * 1.15) {
    const scale = Math.min(FIGURE.size * u, above, free.x1 - free.x0) / Math.max(w, h);
    const x = Math.min(Math.max((part.left + part.right) / 2 - (w * scale) / 2, free.x0), free.x1 - w * scale);
    return { x, y: part.top - margin - h * scale, scale };
  }
  const onRight = right >= FIGURE.min * u || right >= left;
  const room = onRight ? right : left;
  const scale = Math.min(FIGURE.size * u, Math.max(FIGURE.min * u, room)) / Math.max(w, h);
  const width = w * scale;
  const height = h * scale;
  const x = onRight ? part.right + margin + Math.max(0, (right - width) / 2) : part.left - margin - width - Math.max(0, (left - width) / 2);
  const mid = (part.top + part.bottom) / 2;
  const y = Math.min(Math.max(mid - height / 2, free.y0), free.y1 - height);
  return { x, y, scale };
}

// Arrow along a line, its shaft `w` units wide (a current's width), pointing to (x2, y2).
function shaft(g, x1, y1, x2, y2, w) {
  const a = Math.atan2(y2 - y1, x2 - x1);
  const head = Math.max(5, w * 2);
  const bx = x2 - head * Math.cos(a);
  const by = y2 - head * Math.sin(a);
  make(g, 'path', { class: 'flowing', d: `M${fixed(x1)} ${fixed(y1)}L${fixed(bx)} ${fixed(by)}`, 'stroke-width': fixed(w), stroke: DOT_COLOR });
  const p = (da) => `${fixed(x2 - head * Math.cos(a + da))} ${fixed(y2 - head * Math.sin(a + da))}`;
  make(g, 'path', { d: `M${fixed(x2)} ${fixed(y2)}L${p(0.5)}L${p(-0.5)}Z`, fill: DOT_COLOR });
}
// A current's width: one unit at a microampere, eight at a tenth of an ampere (log).
const widthOf = (i) => 1.5 + 3.5 * Math.min(1, Math.max(0, Math.log10(Math.abs(i ?? 0) / 1e-6) / 5));
const label = (g, x, y, text, cls = 'note', anchor = 'middle', size = FIGURE.small) => {
  const t = make(g, 'text', { class: cls, x: fixed(x), y: fixed(y), 'font-size': fixed(size), 'text-anchor': anchor });
  t.textContent = text;
};

// The inside views, each in a box of 100 × 112 units, from the part's reading (`r`) and the data.
const INSIDE = {
  bjt(g, r, data, { t, f }) {
    // The three layers in the middle; the collector's current down their right side, the base's in from
    // the left: beside the layers, never over their letters.
    const [outer, middle] = data.pnp ? ['P', 'N'] : ['N', 'P'];
    make(g, 'rect', { class: `layer ${outer.toLowerCase()}`, x: 32, y: 10, width: 40, height: 30 });
    make(g, 'rect', { class: `layer ${middle.toLowerCase()}`, x: 32, y: 40, width: 40, height: 14 });
    make(g, 'rect', { class: `layer ${outer.toLowerCase()}`, x: 32, y: 54, width: 40, height: 30 });
    for (const [y, text] of [[29, outer], [51, middle], [73, outer]]) label(g, 52, y, text, 'layer-name', 'middle', FIGURE.text);
    label(g, 52, 7, 'C', 'pin-name', 'middle', FIGURE.small);
    label(g, 52, 92, 'E', 'pin-name', 'middle', FIGURE.small);
    label(g, 8, 58, 'B', 'pin-name', 'middle', FIGURE.small);
    const ic = r?.pinCurrents?.C ?? 0;
    const ib = r?.pinCurrents?.B ?? 0;
    const flowing = (i) => Math.abs(i) >= 1e-6;
    // Conventional current: into the collector and the base, out of the emitter (an NPN; a PNP the other way).
    if (flowing(ic)) {
      shaft(g, 84, ic > 0 ? 12 : 82, 84, ic > 0 ? 82 : 12, widthOf(ic));
      label(g, 92, 50, 'Ic', 'current', 'start', FIGURE.small);
    }
    if (flowing(ib)) {
      shaft(g, ib > 0 ? 2 : 30, 47, ib > 0 ? 30 : 2, 47, widthOf(ib));
      label(g, 16, 41, 'Ib', 'current', 'middle', FIGURE.small);
    }
    const figures = [flowing(ib) && `Ib ${f(Math.abs(ib), 'A')}`, flowing(ic) && `Ic ${f(Math.abs(ic), 'A')}`].filter(Boolean).join(' · ');
    label(g, 52, 103, figures, 'note', 'middle', FIGURE.small);
    label(g, 52, 114, r?.region ? t(`sim.region.bjt.${r.region}`) : '', 'state');
  },
  mosfet(g, r, data, { t, f }) {
    // The channel is what changes: nothing is drawn over it. The current runs under the device.
    const [body, island] = data.p ? ['n', 'p'] : ['p', 'n'];
    make(g, 'rect', { class: `layer ${body}`, x: 8, y: 44, width: 84, height: 36 });
    make(g, 'rect', { class: `layer ${island}`, x: 12, y: 44, width: 22, height: 14 });
    make(g, 'rect', { class: `layer ${island}`, x: 66, y: 44, width: 22, height: 14 });
    make(g, 'rect', { class: 'oxide', x: 30, y: 38, width: 40, height: 5 });
    make(g, 'rect', { class: 'metal', x: 30, y: 28, width: 40, height: 10 });
    for (const [x, y, text] of [[23, 38, 'S'], [50, 22, 'G'], [77, 38, 'D']]) label(g, x, y, text, 'pin-name', 'middle', FIGURE.text);
    const on = r?.region && r.region !== 'off';
    make(g, 'rect', { class: `channel ${island}`, x: 34, y: 44, width: 32, height: 5, opacity: on ? 1 : 0 });
    const id = r?.pinCurrents?.D ?? 0;
    const flowing = on && Math.abs(id) >= 1e-6;
    if (flowing) {
      shaft(g, id > 0 ? 80 : 20, 88, id > 0 ? 20 : 80, 88, widthOf(id));
      label(g, 88, 91, 'Id', 'current', 'start', FIGURE.small);
    }
    const vgs = r?.vgs != null ? `Vgs ${f(Math.abs(r.vgs) < 1e-3 ? 0 : r.vgs, 'V')}` : '';
    label(g, 50, 103, [vgs, flowing && `Id ${f(Math.abs(id), 'A')}`].filter(Boolean).join(' · '), 'note');
    label(g, 50, 114, r?.region ? t(`sim.region.mosfet.${r.region}`) : '', 'state');
  },
  led(g, r, data, { f }) {
    // The light stays inside the lens: the chip and the whole lens glow with the brightness.
    const k = Math.max(0, Math.min(1, r?.brightness ?? 0));
    make(g, 'path', { d: 'M22 84V44A28 28 0 0 1 78 44V84Z', fill: data.color, opacity: fixed(0.06 + 0.45 * Math.sqrt(k)) });
    make(g, 'path', { class: 'lens', d: 'M22 84V44A28 28 0 0 1 78 44V84Z' });
    make(g, 'rect', { class: 'chip', x: 42, y: 70, width: 16, height: 8, fill: data.color, opacity: fixed(0.35 + 0.65 * k) });
    make(g, 'path', { class: 'lead', d: 'M38 84V96M62 84V96' });
    label(g, 30, 95, 'A', 'pin-name', 'middle', FIGURE.text);
    label(g, 70, 95, 'K', 'pin-name', 'middle', FIGURE.text);
    label(g, 50, 110, r?.current != null ? f(Math.abs(r.current), 'A') : '', 'state');
  },
  timer(g, r, data, { t }) {
    // The upper comparator ends a cycle (THR over the control level), the lower one starts it (TRIG
    // under half of it); the latch holds the output; the discharge transistor empties C while it is low.
    const ctrl = r?.vctrl ?? 0;
    const ends = r ? r.vthr > ctrl : false;
    const starts = r ? r.vtrig < ctrl / 2 : false;
    const high = r?.state === 'high';
    make(g, 'path', { class: `comparator${ends ? ' active' : ''}`, d: 'M10 8V40L38 24Z' });
    make(g, 'path', { class: `comparator${starts ? ' active' : ''}`, d: 'M10 52V84L38 68Z' });
    label(g, 6, 20, 'THR', 'pin-name', 'end', FIGURE.small);
    label(g, 6, 64, 'TRIG', 'pin-name', 'end', FIGURE.small);
    make(g, 'path', { class: 'lead', d: 'M38 24H50V36M38 68H50V56' });
    make(g, 'rect', { class: `latch${high ? ' active' : ''}`, x: 50, y: 34, width: 22, height: 24 });
    label(g, 61, 50, 'Q', 'pin-name', 'middle', FIGURE.text);
    make(g, 'path', { class: 'lead', d: 'M72 46H94' });
    make(g, 'circle', { class: `out${high ? ' active' : ''}`, cx: 94, cy: 46, r: 4 });
    label(g, 92, 38, 'OUT', 'pin-name', 'end', FIGURE.small);
    label(g, 50, 98, t(high ? 'page.tour.inside.high' : 'page.tour.inside.low'), 'state');
    label(g, 50, 110, t(high ? 'page.tour.inside.charging' : 'page.tour.inside.discharging'), 'note');
  },
};

// `reading()`, `t`, `f` as the tour has them; `now()`: the director's time (ms).
export function setupFigure(page, { reading, t, f, now }) {
  let on = null; // { id, what: 'symbol' | 'inside', k, t0, ms }
  let placed = null; // { for, x, y, s, line }: where the figure is, in drawing units, since it came
  const layers = new WeakMap(); // under the part's copy, so a pin behind a body keeps its identifier hidden

  // Where the figure goes, in drawing units. The part is measured on screen through the camera as it is
  // now, then laid out in the layout's screen (the frame the texts were set in, pinout.js), so a figure
  // asked for after a drag or a zoom lands where it would have; never against the pinout's rows (above
  // where they begin, lit or not), never past the free area's top.
  function place(wanted, data, screen, tips, w, h) {
    const { at, u, free, toScreen } = screen;
    const svg = page.current();
    const r = svg.getBoundingClientRect();
    const box = page.box;
    const drawn = partsRect(page, [on.id]);
    let part;
    if (drawn && box && r.width > 0) {
      const kNow = Math.max(box[2] / r.width, box[3] / r.height);
      const inDrawing = (x, y) => [box[0] + box[2] / 2 + (x - r.left - r.width / 2) * kNow, box[1] + box[3] / 2 + (y - r.top - r.height / 2) * kNow];
      const a = toScreen(...inDrawing(drawn.left, drawn.top));
      const b = toScreen(...inDrawing(drawn.right, drawn.bottom));
      part = { left: a.x, top: a.y, right: b.x, bottom: b.y };
    } else {
      const xs = tips.map((p) => p.x);
      part = { left: Math.min(...xs) - 30 * u, right: Math.max(...xs) + 30 * u, top: Math.min(...tips.map((p) => p.y)) - 200 * u, bottom: Math.max(...tips.map((p) => p.y)) };
    }
    const slot = figureSlot(part, free, u, w, h);
    const rows = Math.max(...tips.map((p) => p.y)) + PINOUT.gap * u;
    slot.y = Math.max(free.y0, Math.min(slot.y, rows - FIGURE.margin * u * 0.6 - h * slot.scale));
    const [x, y] = at(slot.x, slot.y);
    return { for: wanted, x, y, s: slot.scale * screen.k, line: (FIGURE.line * Math.max(u, 0.5)) / slot.scale };
  }

  function draw() {
    for (const s of page.svgs) layers.get(s)?.replaceChildren();
    page.symbolIds = null;
    const data = on && page.data.pinouts?.[page.state.view]?.[on.id];
    const shape = data && (on.what === 'symbol' ? data.symbol : data.inside);
    const screen = shape && screenOf(page);
    if (!screen) return;
    const g = layerOf(page, 'figure', layers, true);
    const { k, at, u, free } = screen;
    const tips = tipsOf(page, on.id, data.pins, screen);
    const [w, h] = on.what === 'symbol' ? [shape.w, shape.h] : [104, 118];
    // Placed once, when it comes, and kept in the drawing's own units: beside the part as part of the
    // drawing, it moves and scales with the part whatever the camera does after (a drag, a zoom, a frame).
    const wanted = `${page.state.view}|${on.id}|${on.what}`;
    if (placed?.for !== wanted) placed = place(wanted, data, screen, tips, w, h);
    const box = make(g, 'g', { class: on.what, transform: `translate(${placed.x} ${placed.y}) scale(${fixed(placed.s * 1000) / 1000})`, opacity: fixed(Math.min(1, on.k * 1.4)), 'data-figure': on.id });
    const line = placed.line;
    // M22, M23: with either figure the part carries its pins' letters, the ones the symbol and the
    // inside view use (B, C, E; A, K; a chip's numbers): at the start of a pin's row when the pinout shows
    // it (pinout.js reads page.symbolIds), else under its tip, apart (not over a bench's stubs: its pads
    // name the pins).
    const ids = Object.fromEntries(data.pins.filter((p) => p.id).map((p) => [p.name, p.id]));
    page.symbolIds = { [on.id]: ids };
    const size = FIGURE.id * Math.max(u, 0.5);
    const loose = data.pins.map((pin, i) => ({ i, id: ids[pin.name], x: tips[i].x })).filter((p) => p.id && page.benchPart !== on.id && !page.litPins?.has(`${on.id}.${data.pins[p.i].name}`)).sort((a, b) => a.x - b.x);
    const below = Math.max(...tips.map((p) => p.y)) + size * 1.1;
    let last = -Infinity;
    for (const p of loose) {
      const x = Math.max(p.x, last + size * 0.9 * Math.max(1, p.id.length));
      last = x;
      const [tx, ty] = at(x, below);
      const text = make(g, 'text', { class: 'pin-id', 'data-id': `${on.id}.${data.pins[p.i].name}`, x: tx, y: ty, 'font-size': fixed(size * k), 'text-anchor': 'middle', opacity: fixed(Math.min(1, on.k * 1.4)) });
      text.textContent = p.id;
    }
    if (on.what === 'symbol') {
      for (const d of shape.strokes) make(box, 'path', { class: 'stroke', d, 'stroke-width': fixed(line) });
      for (const d of shape.fills) make(box, 'path', { class: 'fill', d });
      for (const x of shape.texts) label(box, x.x, x.y, x.text, x.quiet || x.number ? 'quiet' : 'pin-name', x.anchor, x.small ? FIGURE.small : FIGURE.text);
      return;
    }
    box.setAttribute('data-inside', shape.kind);
    INSIDE[shape.kind]?.(box, reading()?.parts?.[on.id], shape, { t, f });
  }

  return {
    // The figure of a part (`what`: symbol or inside), coming in along its move (`ms`): a function
    // of the share of the move, for a tween.
    show(id, what, ms) {
      on = { id, what, k: 0, t0: now(), ms };
      placed = null; // placed again where it comes now
      return (k) => {
        if (on?.id === id && on.what === what) on.k = k;
        draw();
      };
    },
    clear(what) {
      if (!what || on?.what === what) {
        on = null;
        placed = null;
      }
      draw();
    },
    draw,
  };
}
