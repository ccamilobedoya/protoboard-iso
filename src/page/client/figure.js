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
// 555's two comparators, its latch and its output; a resistor's film on its ceramic core warming with
// its share of its power rating, the voltage it takes over it and its current under it; a
// capacitor's plates with charges that follow its voltage and its current beside them; an inductor's
// coil with field lines that follow its current and the current under it; a diode's or a Zener's P and
// N layers with a depletion zone thin when it conducts and wider in reverse, Vf over it, its current
// under it and its state (conducting, blocking, in breakdown); a bridge's four diodes with the pair that
// conducts lit and its current beside them. Arrows never cross what they
// explain: they run beside the layers, under the channel, the film, the coil. Didactic, not to scale.

import { DOT_COLOR, HEAT_COLOR, VOLTAGE_COLORS, heatOpacity } from '../../sim/look.js';
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
  return t;
};

// Under a microampere nothing flows (as the dots, sim/look.js MIN_CURRENT).
const flowing = (i) => Math.abs(i ?? 0) >= 1e-6;

// The voltage a horizontal two-lead part takes, on a dimension line over it (from x 24 to 76), with
// its + and − ends.
function across(g, v, f) {
  if (v == null) return;
  make(g, 'path', { class: 'dim', d: 'M24 28H76M24 24V32M76 24V32' });
  label(g, 50, 22, f(Math.abs(v), 'V'), 'note');
  if (Math.abs(v) < 1e-3) return;
  label(g, 20, 31, v > 0 ? '+' : '−', 'note', 'end', FIGURE.text);
  label(g, 80, 31, v > 0 ? '−' : '+', 'note', 'start', FIGURE.text);
}

// A bridge's diamond: + at the top, − at the bottom, the AC pins at the sides; its four diodes, each
// pointing up to + (the anode's pin first).
const CORNERS = { '+': [50, 16], AC2: [84, 50], '-': [50, 84], AC1: [16, 50] };
const LEGS = [['AC1', '+'], ['AC2', '+'], ['-', 'AC1'], ['-', 'AC2']];

// A diode's or a Zener's PN junction, its anode's p side on the left: the depletion zone between the
// layers thin when forward biased (Vf over it) and wider in reverse, against Vz for a Zener (else 20 V),
// warmer as the current (a Zener: the current or the power) nears its rating; the current under it.
function junction(g, r, data, { t, f }) {
  const [a, k] = data.ids;
  const v = r?.voltage ?? 0;
  const i = r?.current ?? 0;
  make(g, 'path', { class: 'lead', d: 'M4 50H16M84 50H96' });
  make(g, 'rect', { class: 'layer p', x: 20, y: 36, width: 30, height: 28 });
  make(g, 'rect', { class: 'layer n', x: 50, y: 36, width: 30, height: 28 });
  const width = v > 0 ? 12 * Math.max(0.15, 1 - v / 0.75) : 12 + 16 * Math.min(1, Math.sqrt(-v / (data.vz || 20)));
  make(g, 'rect', { class: 'depletion', x: fixed(50 - width / 2), y: 36, width: fixed(width), height: 28 });
  const ratio = Math.max(data.maxCurrent > 0 ? Math.abs(i) / data.maxCurrent : 0, data.maxPower > 0 ? Math.abs(r?.power ?? 0) / data.maxPower : 0);
  make(g, 'rect', { x: 20, y: 36, width: 60, height: 28, fill: HEAT_COLOR, opacity: fixed(heatOpacity(ratio)) });
  make(g, 'rect', { class: 'metal', x: 16, y: 35, width: 4, height: 30 });
  make(g, 'rect', { class: 'metal', x: 80, y: 35, width: 4, height: 30 });
  label(g, 29, 54, 'P', 'layer-name', 'middle', FIGURE.text);
  label(g, 71, 54, 'N', 'layer-name', 'middle', FIGURE.text);
  label(g, 9, 45, a, 'pin-name', 'middle', FIGURE.text);
  label(g, 91, 45, k, 'pin-name', 'middle', FIGURE.text);
  if (r) across(g, v, f);
  // Conventional current from A to K when it is positive; a Zener in breakdown, from K to A.
  if (flowing(i)) {
    shaft(g, i > 0 ? 24 : 76, 74, i > 0 ? 76 : 24, 74, widthOf(i));
    label(g, i > 0 ? 82 : 18, 77, 'I', 'current', i > 0 ? 'start' : 'end', FIGURE.small);
  }
  const state = i > 0 && flowing(i) ? 'conducting' : data.vz && flowing(i) ? 'breakdown' : 'blocking';
  const volts = { conducting: 'Vf', blocking: 'Vr', breakdown: 'Vz' }[state];
  label(g, 50, 103, r ? [`${volts} ${f(Math.abs(v), 'V')}`, flowing(i) && `I ${f(Math.abs(i), 'A')}`].filter(Boolean).join(' · ') : '', 'note');
  label(g, 50, 114, r ? t(`page.tour.inside.diode.${state}`) : '', 'state');
}

// The inside views, each in a box of 100 × 112 units, from the part's reading (`r`) and the data
// (src/parts/symbols.js insideOf; a two-lead part's `ids` are the symbol's letters for its pins).
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
  diode(g, r, data, ctx) {
    junction(g, r, data, ctx);
  },
  zener(g, r, data, ctx) {
    junction(g, r, data, ctx);
  },
  bridge(g, r, data, { t, f }) {
    // Each diode's current from the AC pins' (the reading's pinCurrents, into the part): the one an AC
    // pin feeds goes up to +, the one it takes from comes up from −; a blocking diode's leakage left
    // out. The pair conducting lit, their current beside their sides, outside the diamond.
    const [plus, ac1, ac2, minus] = data.ids;
    const i1 = r?.pinCurrents?.AC1 ?? 0;
    const i2 = r?.pinCurrents?.AC2 ?? 0;
    const legs = [Math.max(0, i1), Math.max(0, i2), Math.max(0, -i1), Math.max(0, -i2)];
    const ratio = data.maxCurrent > 0 ? Math.abs(r?.current ?? 0) / data.maxCurrent : 0;
    const diamond = `M${CORNERS['+'].join(' ')}L${CORNERS.AC2.join(' ')}L${CORNERS['-'].join(' ')}L${CORNERS.AC1.join(' ')}Z`;
    make(g, 'path', { d: diamond, fill: HEAT_COLOR, opacity: fixed(heatOpacity(ratio)) });
    make(g, 'path', { class: 'lead', d: `${diamond}M50 4V16M50 84V96M4 50H16M84 50H96` });
    LEGS.forEach(([from, to], n) => {
      const [[ax, ay], [kx, ky]] = [CORNERS[from], CORNERS[to]];
      const len = Math.hypot(kx - ax, ky - ay);
      const [ux, uy] = [(kx - ax) / len, (ky - ay) / len];
      // Outward from the diamond's middle, the side the arrow runs on.
      const [mx, my] = [(ax + kx) / 2, (ay + ky) / 2];
      const out = Math.sign((mx - 50) * -uy + (my - 50) * ux) || 1;
      const p = (along, side) => [mx + ux * along - uy * side * out, my + uy * along + ux * side * out];
      const pt = (q) => `${fixed(q[0])} ${fixed(q[1])}`;
      const on = flowing(legs[n]);
      make(g, 'path', { class: `junction${on ? ' on' : ''}`, d: `M${pt(p(-6, 7))}L${pt(p(-6, -7))}L${pt(p(6, 0))}Z` });
      make(g, 'path', { class: 'lead', d: `M${pt(p(6, 7))}L${pt(p(6, -7))}` });
      if (on) shaft(g, ...p(-9, 13), ...p(9, 13), widthOf(legs[n]));
    });
    label(g, 58, 10, plus, 'pin-name', 'start', FIGURE.text);
    label(g, 58, 96, minus, 'pin-name', 'start', FIGURE.text);
    label(g, 3, 44, ac1, 'pin-name', 'start', FIGURE.text);
    label(g, 97, 44, ac2, 'pin-name', 'end', FIGURE.text);
    const i = r?.current ?? 0;
    label(g, 50, 105, r ? [`Vdc ${f(r.vdc ?? 0, 'V')}`, flowing(i) && `I ${f(Math.abs(i), 'A')}`].filter(Boolean).join(' · ') : '', 'note');
    const pair = !flowing(i1) ? null : i1 > 0 ? [ac1, ac2] : [ac2, ac1];
    label(g, 50, 115, r ? (pair ? t('page.tour.inside.bridge.pair', { from: pair[0], to: pair[1] }) : t('page.tour.inside.bridge.none')) : '', 'state');
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
  resistor(g, r, data, { t, f }) {
    // The film on the ceramic core between its metal caps, cut in a spiral (the grooves) to make its
    // path longer; warmer as the power nears its rating. The voltage it takes on a line over it, the
    // current under it: neither over the film.
    const [a, b] = data.ids;
    make(g, 'path', { class: 'lead', d: 'M4 50H18M82 50H96' });
    make(g, 'rect', { class: 'core', x: 18, y: 41, width: 64, height: 18, rx: 3 });
    make(g, 'rect', { class: 'film', x: 24, y: 41, width: 52, height: 18 });
    const power = Math.abs(r?.power ?? 0);
    const ratio = data.maxPower > 0 ? power / data.maxPower : 0;
    make(g, 'rect', { x: 24, y: 41, width: 52, height: 18, fill: HEAT_COLOR, opacity: fixed(heatOpacity(ratio)) });
    for (let x = 27; x < 72; x += 7) make(g, 'path', { class: 'groove', d: `M${x} 41L${x + 5} 59` });
    make(g, 'rect', { class: 'metal', x: 18, y: 40, width: 6, height: 20 });
    make(g, 'rect', { class: 'metal', x: 76, y: 40, width: 6, height: 20 });
    label(g, 9, 45, a, 'pin-name', 'middle', FIGURE.text);
    label(g, 91, 45, b, 'pin-name', 'middle', FIGURE.text);
    across(g, r?.voltage, f);
    // Conventional current from pin 1 to pin 2 when it is positive.
    const i = r?.current ?? 0;
    if (flowing(i)) {
      shaft(g, i > 0 ? 24 : 76, 72, i > 0 ? 76 : 24, 72, widthOf(i));
      label(g, 82, 75, 'I', 'current', 'start', FIGURE.small);
    }
    label(g, 50, 103, [flowing(i) && `I ${f(Math.abs(i), 'A')}`, r && `P ${f(power, 'W')}`].filter(Boolean).join(' · '), 'note');
    // A share under 1 % says so rather than 0: a resistor far from its rating still takes some power.
    const percent = ratio > 0 && ratio < 0.01 ? '<1' : Math.round(ratio * 100);
    label(g, 50, 114, r && data.maxPower > 0 ? t('page.tour.inside.resistor.rating', { percent }) : '', 'state');
  },
  capacitor(g, r, data, { t, f, look }) {
    // Two plates and the insulator between; on their inner faces as many + and − as the voltage against
    // the circuit's scale (the current layer's, else its rating), the plate at the higher voltage the +
    // one. The current beside the plates, in or out.
    const [a, b] = data.ids;
    make(g, 'path', { class: 'lead', d: 'M50 6V30M50 68V92' });
    make(g, 'rect', { class: 'dielectric', x: 22, y: 35, width: 56, height: 28 });
    make(g, 'rect', { class: 'plate', x: 22, y: 30, width: 56, height: 5 });
    make(g, 'rect', { class: 'plate', x: 22, y: 63, width: 56, height: 5 });
    label(g, 58, 14, a, 'pin-name', 'start', FIGURE.text);
    label(g, 58, 92, b, 'pin-name', 'start', FIGURE.text);
    const v = r?.voltage ?? 0;
    const scale = look?.().vmax || data.maxVoltage || 1;
    const n = Math.abs(v) < 1e-3 ? 0 : Math.max(1, Math.round(7 * Math.min(1, Math.abs(v) / scale)));
    for (let k = 0; k < n; k++) {
      const x = 50 + (k - (n - 1) / 2) * 7;
      label(g, x, 45, v > 0 ? '+' : '−', 'charge', 'middle', FIGURE.text).setAttribute('fill', v > 0 ? VOLTAGE_COLORS.positive : VOLTAGE_COLORS.negative);
      label(g, x, 60, v > 0 ? '−' : '+', 'charge', 'middle', FIGURE.text).setAttribute('fill', v > 0 ? VOLTAGE_COLORS.negative : VOLTAGE_COLORS.positive);
    }
    // Conventional current into pin 1 when it is positive: down beside the plates.
    const i = r?.current ?? 0;
    if (flowing(i)) {
      shaft(g, 88, i > 0 ? 14 : 84, 88, i > 0 ? 84 : 14, widthOf(i));
      label(g, 94, 52, 'I', 'current', 'start', FIGURE.small);
    }
    label(g, 50, 103, r ? [`V ${f(Math.abs(v), 'V')}`, flowing(i) && `I ${f(Math.abs(i), 'A')}`].filter(Boolean).join(' · ') : '', 'note');
    // Charging while the current goes the way of the voltage (or from none), discharging the other way.
    const state = !flowing(i) ? 'holding' : Math.abs(v) < 1e-3 || i * v > 0 ? 'charging' : 'discharging';
    label(g, 50, 114, r ? t(`page.tour.inside.capacitor.${state}`) : '', 'state');
  },
  inductor(g, r, data, { t, f }) {
    // The coil round its core, the leads down to its pins; field lines round it, more of them and
    // stronger with the current against its rating; the current under the coil.
    const [a, b] = data.ids;
    const i = r?.current ?? 0;
    const k = data.maxCurrent > 0 ? Math.min(1, Math.sqrt(Math.abs(i) / data.maxCurrent)) : 0;
    [[42, 16], [45, 22], [48, 28]].forEach(([rx, ry], j) => {
      const o = Math.max(0, Math.min(1, k * 3 - j));
      if (flowing(i) && o > 0) make(g, 'ellipse', { class: 'field', cx: 50, cy: 46, rx, ry, opacity: fixed(o) });
    });
    make(g, 'rect', { class: 'core', x: 12, y: 44, width: 76, height: 9, rx: 2 });
    make(g, 'path', { class: 'coil', d: 'M16 48A6.8 7 0 0 1 29.6 48A6.8 7 0 0 1 43.2 48A6.8 7 0 0 1 56.8 48A6.8 7 0 0 1 70.4 48A6.8 7 0 0 1 84 48' });
    make(g, 'path', { class: 'lead', d: 'M16 48V88M84 48V88' });
    label(g, 7, 90, a, 'pin-name', 'middle', FIGURE.text);
    label(g, 93, 90, b, 'pin-name', 'middle', FIGURE.text);
    // Conventional current from pin 1 to pin 2 when it is positive.
    if (flowing(i)) {
      shaft(g, i > 0 ? 28 : 72, 84, i > 0 ? 72 : 28, 84, widthOf(i));
      label(g, 76, 87, 'I', 'current', 'start', FIGURE.small);
    }
    const v = r?.voltage ?? 0;
    label(g, 50, 103, r ? [flowing(i) && `I ${f(Math.abs(i), 'A')}`, `V ${f(Math.abs(v), 'V')}`].filter(Boolean).join(' · ') : '', 'note');
    // The coil's own voltage (the winding's resistance taken out): with the current, it grows; against
    // it, it falls; none, steady.
    const coil = v - i * (data.dcr ?? 0);
    const state = !flowing(i) ? 'none' : Math.abs(coil) < Math.max(1e-3, 0.01 * Math.abs(v)) ? 'steady' : coil * i > 0 ? 'growing' : 'falling';
    label(g, 50, 114, r ? t(`page.tour.inside.inductor.${state}`) : '', 'state');
  },
};

// `reading()`, `t`, `f` as the tour has them; `look()`: the current layer's scale (bench.js); `now()`:
// the director's time (ms).
export function setupFigure(page, { reading, t, f, now, look }) {
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
      // Apart by a letter's width and a space: two tips close on screen (a chip's pin 4 and the pin 8
      // behind it) would read as one number.
      const x = Math.max(p.x, last + size * (0.6 * p.id.length + 0.8));
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
    INSIDE[shape.kind]?.(box, reading()?.parts?.[on.id], shape, { t, f, look });
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
