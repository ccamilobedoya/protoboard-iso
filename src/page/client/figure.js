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
// conducts lit and its current beside them; a potentiometer's track in an arc with its wiper where its
// control has it, each part's resistance and current and the voltage at the wiper; an NTC thermistor's
// ceramic bead coloured and shaking with its temperature; a photoresistor's zigzag track under an arrow
// of light per decade of lux, each with its resistance now; a push button's two pieces of metal and
// the dome that pressed joins them, a switch's blade on the contact its position closes (a rocker's
// under its rocker, a latching button's changeovers on their link), the voltage an open contact holds
// and the current through a closed one; a regulator's pass transistor warming with its power, the error
// amplifier and its reference, the headroom against the dropout and the currents in and out; a
// battery's cells filled with their charge, EMF − I·R over them, its current and its warnings; a
// buzzer's coil and steel disc, pulled with the current, with arcs of sound while it changes; an RGB
// LED's three chips in one lens, each with its brightness, the lens in their mixed colour; a 7-segment
// display's figure 8 with each segment lit from its reading and the digit it draws; a slide switch's
// three contacts and the slider its knob puts on COM and one of them; a tilt switch's can with the
// two balls on its leads' ends or rolled away from them; an LM35's thermometer and its 10 mV per °C
// out to VOUT, with its supply's current; a relay's coil and field, its armature pulled onto NO or
// resting on NC, with the kick when its coil is cut off bare; a DC motor's magnets, its armature turned
// to the shaft's angle with an arrow as long as its speed, its brushes, and its supply against its
// back-EMF; a PIR's dome and pyroelectric halves into a comparator, with a bar that drains with the
// time left; a touch module's pad and finger as two plates of a capacitor, into its chip; an LM393 sensor module's divider and trimmer, AO and Vref as two bars against its supply,
// the comparator and DO's LED lit while DO is low; a laser module's chip between its two mirror faces,
// glowing under its threshold and past it sending a beam out of the lens, its current against the
// threshold under it. Arrows
// never cross what they explain: they run beside the layers, under the channel, the film, the coil.
// Didactic, not to scale.

import { DOT_COLOR, HEAT_COLOR, VOLTAGE_COLORS, heatOpacity, mixLight } from '../../sim/look.js';
import { fixed, make, screenOf, layerOf, tipsOf } from './pinout.js';
import { PINOUT } from './pinout-rows.js';
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

// An open contact's gap from x0 to x1 at height y, on a dimension line with the voltage it holds under
// it (a closed one carries its current there instead).
function gap(g, x0, x1, y, v, f) {
  make(g, 'path', { class: 'dim', d: `M${x0} ${y}H${x1}M${x0} ${y - 4}V${y + 4}M${x1} ${y - 4}V${y + 4}` });
  label(g, (x0 + x1) / 2, y + 12, f(Math.abs(v), 'V'), 'note');
}

// A pin's name in a switch's figure: the circuit's pins as the symbol's letters, a pin it leaves
// unwired quieter.
const pinName = (g, x, y, name, wired, anchor, size = FIGURE.small) => label(g, x, y, name, wired ? 'pin-name' : 'quiet', anchor, size);

// A rocker (SPST), cut from the side: the rocker on its pivot, I pressed down on the right when on;
// under it the blade from tab 1's contact, down on tab 2's while on, lifted off it while off; the tabs
// down to their pins.
function rockerInside(g, r, data, { t, f }, on) {
  const wired = (n) => data.ids.includes(n);
  const [yl, yr] = on ? [17, 29] : [29, 17];
  make(g, 'rect', { class: 'core', x: 14, y: 36, width: 72, height: 46, rx: 3 });
  make(g, 'path', { class: 'rocker', d: `M16 ${yl}L84 ${yr}L84 ${yr + 7}L16 ${yl + 7}Z` });
  label(g, 20, yl - 3, 'O', 'quiet', 'middle', FIGURE.small);
  label(g, 80, yr - 3, 'I', 'quiet', 'middle', FIGURE.small);
  make(g, 'circle', { class: 'metal', cx: 50, cy: 36, r: 3 });
  const tip = on ? 65 : 48;
  const atBlade = 65 + ((tip - 65) * (60 - 28)) / (76 - 28);
  const capUnder = yl + 7 + ((yr - yl) * (60 - 16)) / 68;
  make(g, 'rect', { class: 'plunger', x: 58, y: fixed(capUnder), width: 4, height: fixed(Math.max(0, atBlade - 2 - capUnder)) });
  make(g, 'path', { class: 'lead', d: 'M26 70V90M74 70V90' });
  make(g, 'rect', { class: 'metal', x: 20, y: 66, width: 12, height: 4 });
  make(g, 'rect', { class: 'metal', x: 68, y: 66, width: 12, height: 4 });
  make(g, 'path', { class: `blade${on ? ' on' : ''}`, d: `M28 65L76 ${tip}` });
  pinName(g, 16, 91, '1', wired('1'), 'middle', FIGURE.text);
  pinName(g, 84, 91, '2', wired('2'), 'middle', FIGURE.text);
  // Closed, the current from tab 1 to tab 2 (the contact's own sense) under the contacts; open, the
  // voltage the gap holds there.
  const contact = r?.contacts?.[0];
  const i = contact?.current ?? 0;
  const v = r?.pins?.['1'] != null && r?.pins?.['2'] != null ? r.pins['1'] - r.pins['2'] : null;
  if (on && flowing(i)) {
    shaft(g, i > 0 ? 32 : 68, 80, i > 0 ? 68 : 32, 80, widthOf(i));
    label(g, 50, 92, 'I', 'current', 'middle', FIGURE.small);
  } else if (!on && v != null) gap(g, 32, 68, 80, v, f);
  label(g, 50, 103, r && on ? [v != null && `V ${f(Math.abs(v), 'V')}`, flowing(i) && `I ${f(Math.abs(i), 'A')}`].filter(Boolean).join(' · ') : '', 'note');
  label(g, 50, 114, r ? t(`page.tour.inside.switch.${on ? 'on' : 'off'}`) : '', 'state');
}

// A latching button (DPDT), a changeover per row the circuit uses: the common's pivot on the left, its
// blade on NC while released and on NO while latched, both blades on the link from the plunger; the
// current of each closed contact beside its common's lead.
function latchingInside(g, r, data, { t, f }, on) {
  const rows = [...new Set(data.ids.map((n) => n.slice(-1)))].sort();
  const ys = rows.length > 1 ? [30, 72] : [50];
  const down = on ? 4 : 0;
  make(g, 'rect', { class: 'plunger', x: 44, y: down, width: 12, height: 8 });
  make(g, 'path', { class: 'link', d: `M48 ${8 + down}V${ys.at(-1) + (on ? 4.5 : -4.5)}` });
  rows.forEach((row, n) => {
    const y = ys[n];
    const [c, nc, no] = [`C${row}`, `NC${row}`, `NO${row}`];
    make(g, 'path', { class: 'lead', d: `M6 ${y}H27M72 ${y - 11}H96M72 ${y + 11}H96` });
    make(g, 'rect', { class: 'metal', x: 66, y: y - 13, width: 6, height: 4 });
    make(g, 'rect', { class: 'metal', x: 66, y: y + 9, width: 6, height: 4 });
    make(g, 'path', { class: 'blade on', d: `M30 ${y}L66 ${y + (on ? 9 : -9)}` });
    make(g, 'circle', { class: 'metal', cx: 30, cy: y, r: 3 });
    const wired = (name) => data.ids.includes(name);
    pinName(g, 6, y - 5, c, wired(c), 'start');
    pinName(g, 96, y - 14, nc, wired(nc), 'end');
    pinName(g, 96, y + 8, no, wired(no), 'end');
    const i = r?.contacts?.find((k) => k.a === c)?.current ?? 0;
    if (flowing(i)) {
      shaft(g, i > 0 ? 6 : 26, y + 7, i > 0 ? 26 : 6, y + 7, widthOf(i));
      label(g, 6, y + 17, 'I', 'current', 'start', FIGURE.small);
    }
  });
  const figures = (r?.contacts ?? []).map((k) => `${k.a}–${k.b} ${f(Math.abs(k.current), 'A')}`);
  label(g, 50, 103, r ? figures.join(' · ') || `I ${f(0, 'A')}` : '', 'note');
  label(g, 50, 114, r ? t(`page.tour.inside.switch.${on ? 'latched' : 'released'}`) : '', 'state');
}

// A potentiometer's track: an arc of 270° round (50, 50), its pin 1 end at the lower left (−135° from
// up, clockwise), its pin 3 end at the lower right; a point on it at angle `deg` and radius `r`.
const POT = { cx: 50, cy: 50, r: 26, travel: 270 };
const onArc = (deg, r = POT.r) => [POT.cx + r * Math.sin((deg * Math.PI) / 180), POT.cy - r * Math.cos((deg * Math.PI) / 180)];
const arcPath = (from, to, r = POT.r) => {
  const [[x0, y0], [x1, y1]] = [onArc(from, r), onArc(to, r)];
  return `M${fixed(x0)} ${fixed(y0)}A${r} ${r} 0 ${Math.abs(to - from) > 180 ? 1 : 0} ${to > from ? 1 : 0} ${fixed(x1)} ${fixed(y1)}`;
};
// A current along an arc from `from` to `to` (degrees), outside the track: its shaft and its head.
function arcShaft(g, from, to, w) {
  const r = POT.r + 9;
  const head = Math.max(5, w * 2);
  const back = to - (Math.sign(to - from) * head * 180) / (Math.PI * r);
  make(g, 'path', { class: 'flowing', d: arcPath(from, back, r), fill: 'none', 'stroke-width': fixed(w), stroke: DOT_COLOR });
  const [tx, ty] = onArc(to, r);
  const [bx, by] = onArc(back, r);
  const a = Math.atan2(ty - by, tx - bx);
  const p = (da) => `${fixed(tx - head * Math.cos(a + da))} ${fixed(ty - head * Math.sin(a + da))}`;
  make(g, 'path', { d: `M${fixed(tx)} ${fixed(ty)}L${p(0.5)}L${p(-0.5)}Z`, fill: DOT_COLOR });
}

// A sensor's figure in the page's numbers: a temperature to a tenth of a degree, light in lux (under 1,
// to a tenth: formatValue would say "100 mlx").
const decimalOf = (f) => (f(1.5, '').includes(',') ? ',' : '.');
const celsius = (v, f) => `${String(Math.round(v * 10) / 10).replace('.', decimalOf(f))} °C`;
// The way a photoresistor's arrows of light come in: 9 units left for 22 down.
const LIGHT = Math.atan2(22, -9);
const lux = (v, f) => (v >= 1 ? f(v, 'lx') : `${String(Math.round(v * 10) / 10).replace('.', decimalOf(f))} lx`);

// The inside views, each in a box of 100 × 112 units, from the part's reading (`r`) and the data
// (src/parts/symbols.js insideOf; a two-lead part's `ids` are the symbol's letters for its pins).
// The digit a set of lit segments draws (their letters in order), as a display's datasheet shows them.
const DIGITS = { abcdef: 0, bc: 1, abdeg: 2, abcdg: 3, bcfg: 4, acdfg: 5, acdefg: 6, abc: 7, abcdefg: 8, abcdfg: 9 };

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
    label(g, 50, 103, r ? [`Vdc ${f(r.vdc ?? 0, 'V')}`, flowing(i) && `I ${f(Math.abs(i), 'A')}`].filter(Boolean).join(' · ') : '', 'note');
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
  rgb(g, r, data, { t, f }) {
    // Three chips under one lens, each glowing in its colour with its own brightness; the lens tinted
    // with their light mixed (the colour the eye sees), as strong as the brightest. The four leads in
    // the package's order, R, the common (the longest, drawn longer), G, B.
    const chips = data.chips.map((c) => ({ ...c, k: Math.max(0, Math.min(1, r?.channels?.[c.pin]?.brightness ?? 0)) }));
    const top = Math.max(0, ...chips.map((c) => c.k));
    const lens = 'M22 74V34A28 28 0 0 1 78 34V74Z';
    make(g, 'path', { d: lens, fill: mixLight(chips.map((c) => [c.color, c.k])), opacity: fixed(0.06 + 0.45 * Math.sqrt(top)) });
    make(g, 'path', { class: 'lens', d: lens });
    chips.forEach((c, n) => {
      const x = 30 + 14 * n;
      make(g, 'rect', { class: 'chip', x, y: 58, width: 12, height: 8, fill: c.color, opacity: fixed(0.3 + 0.7 * c.k) });
      label(g, x + 6, 53, c.id, 'pin-name', 'middle', FIGURE.small);
    });
    // The leads in the package's order, R, the common (longer), G, B, each letter under its lead.
    const leads = [[29, 'R', 84], [43, 'COM', 88], [57, 'G', 84], [71, 'B', 84]];
    make(g, 'path', { class: 'lead', d: leads.map(([x, , y]) => `M${x} 74V${y}`).join('') });
    for (const [x, pin, y] of leads) label(g, x, y + 8, pin === 'COM' ? data.commonId : pin, 'pin-name', 'middle', FIGURE.small);
    const i = r?.current ?? 0;
    label(g, 50, 106, r && flowing(i) ? `${data.commonId} ${f(Math.abs(i), 'A')}` : '', 'note');
    label(g, 50, 116, r ? (top > 0.002 ? chips.map((c) => `${c.id} ${Math.round(c.k * 100)} %`).join(' · ') : t('page.tour.inside.rgb.off')) : '', 'state');
  },
  segments(g, r, data, { t, f }) {
    // The figure 8 as the display's face shows it, leaning, each segment lit in its colour with its
    // own brightness and its pin's letter beside it outside the digit; the common at the bottom, with
    // the current all the lit segments pass through it, and the digit they draw.
    make(g, 'rect', { class: 'core', x: 14, y: 2, width: 72, height: 88, rx: 3 });
    const lean = 0.18;
    const at = (x, y) => [48 + x + (44 - y) * lean, y];
    const bar = (x1, y1, x2, y2) => {
      const h = 3.2;
      const gap = 1.6;
      const pts = y1 === y2
        ? [[x1 + gap, y1], [x1 + gap + h, y1 - h], [x2 - gap - h, y1 - h], [x2 - gap, y1], [x2 - gap - h, y1 + h], [x1 + gap + h, y1 + h]]
        : [[x1, y1 + gap], [x1 + h, y1 + gap + h], [x1 + h, y2 - gap - h], [x1, y2 - gap], [x1 - h, y2 - gap - h], [x1 - h, y1 + gap + h]];
      return `M${pts.map((p) => at(...p).map(fixed).join(' ')).join('L')}Z`;
    };
    const [L, R, T, M, B] = [-16, 16, 12, 44, 76];
    const shapes = { a: bar(L, T, R, T), b: bar(R, T, R, M), c: bar(R, M, R, B), d: bar(L, B, R, B), e: bar(L, M, L, B), f: bar(L, T, L, M), g: bar(L, M, R, M) };
    const [px, py] = at(R + 7, B);
    shapes.DP = `M${fixed(px - 3)} ${fixed(py - 3)}H${fixed(px + 3)}V${fixed(py + 3)}H${fixed(px - 3)}Z`;
    // Each letter outside its segment: a, d and g above or below it, the sides beside them.
    const spots = { a: [0, T - 6], b: [R + 8, (T + M) / 2], c: [R + 8, (M + B) / 2], d: [0, B + 10], e: [L - 8, (M + B) / 2], f: [L - 8, (T + M) / 2], g: [0, M - 5.5], DP: [R + 7, B - 8] };
    const lit = [];
    for (const c of data.chips) {
      const k = Math.max(0, Math.min(1, r?.channels?.[c.pin]?.brightness ?? 0));
      if (k > 0.002) lit.push(c.id);
      make(g, 'path', { d: shapes[c.pin], fill: c.color, opacity: fixed(0.12 + 0.88 * Math.sqrt(k)) });
      make(g, 'path', { class: 'lens', d: shapes[c.pin] });
      const [x, y] = at(...spots[c.pin]);
      label(g, x, y + 3, c.id, 'pin-name', 'middle', FIGURE.small);
    }
    make(g, 'path', { class: 'lead', d: 'M80 90V98' });
    label(g, 76, 97, data.commonId, 'pin-name', 'end', FIGURE.small);
    const i = r?.current ?? 0;
    label(g, 50, 106, r && flowing(i) ? `${data.commonId} ${f(Math.abs(i), 'A')}` : '', 'note');
    const digit = DIGITS[lit.filter((x) => x !== 'DP').sort().join('')];
    const state = !lit.length ? t('page.tour.inside.segments.off') : digit != null ? t('page.tour.inside.segments.digit', { digit: `${digit}${lit.includes('DP') ? '.' : ''}` }) : t('page.tour.inside.segments.lit', { list: lit.join(' ') });
    label(g, 50, 116, r ? state : '', 'state');
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
  potentiometer(g, r, data, { t, f, control }) {
    // The track in an arc from pin 1 to pin 3 and the wiper on it where its control has it (the circuit
    // file's position until one moves it): the two parts it splits the track in, each one's resistance
    // over it, its current beside it outside the arc; the wiper's own current beside its lead.
    const [a, w, b] = data.ids;
    const position = Math.max(0, Math.min(1, control?.('position') ?? data.position ?? 0.5));
    const start = -POT.travel / 2;
    const end = POT.travel / 2;
    const at = start + POT.travel * position;
    for (const [from, to] of [[start, at], [at, end]]) if (to - from > 0.5) make(g, 'path', { class: 'track', d: arcPath(from, to) });
    const [[x1, y1], [x3, y3]] = [onArc(start), onArc(end)];
    make(g, 'path', { class: 'lead', d: `M${fixed(x1)} ${fixed(y1)}L20 78V88M${fixed(x3)} ${fixed(y3)}L80 78V88M50 50V88` });
    // The wiper: an arm from the shaft to the track, its tip on it.
    const [tx, ty] = onArc(at, POT.r - 1);
    const [ax, ay] = onArc(at, POT.r - 9);
    make(g, 'path', { class: 'wiper', d: `M50 50L${fixed(ax)} ${fixed(ay)}` });
    const side = (da) => onArc(at + da, POT.r - 9).map(fixed).join(' ');
    make(g, 'path', { class: 'wiper-tip', d: `M${fixed(tx)} ${fixed(ty)}L${side(9)}L${side(-9)}Z` });
    make(g, 'circle', { class: 'metal', cx: 50, cy: 50, r: 3.5 });
    label(g, 12, 91, a, 'pin-name', 'middle', FIGURE.text);
    label(g, 88, 91, b, 'pin-name', 'middle', FIGURE.text);
    label(g, 44, 91, w, 'pin-name', 'end', FIGURE.text);
    // Each part's resistance, the one from 1 on the left, the other on the right, over the arc.
    const total = data.resistance ?? 0;
    label(g, 2, 9, `${a}–${w} ${f(total * position, 'Ω')}`, 'note', 'start');
    label(g, 98, 9, `${w}–${b} ${f(total * (1 - position), 'Ω')}`, 'note', 'end');
    // Conventional current: into pin 1 runs along the first part to the wiper; out of pin 3, along the
    // second from it. An arc too short for an arrow gets none.
    const i1 = r?.currents?.['1'] ?? 0;
    const i2 = -(r?.currents?.['3'] ?? 0);
    const gap = 10;
    if (flowing(i1) && at - start > 3 * gap) arcShaft(g, i1 > 0 ? start + gap : at - gap, i1 > 0 ? at - gap : start + gap, widthOf(i1));
    if (flowing(i2) && end - at > 3 * gap) arcShaft(g, i2 > 0 ? at + gap : end - gap, i2 > 0 ? end - gap : at + gap, widthOf(i2));
    const iw = r?.currents?.W ?? 0;
    if (flowing(iw)) shaft(g, 57, iw > 0 ? 86 : 68, 57, iw > 0 ? 68 : 86, widthOf(iw));
    const vw = r?.pins?.W;
    label(g, 50, 103, r ? [vw != null && `V(${w}) ${f(vw, 'V')}`, flowing(iw) && `I(${w}) ${f(Math.abs(iw), 'A')}`].filter(Boolean).join(' · ') : '', 'note');
    label(g, 50, 114, t('page.tour.inside.potentiometer.wiper', { percent: Math.round(position * 100) }), 'state');
  },
  thermistor(g, r, data, { t, f }) {
    // The bead of metal-oxide ceramic between the leads: its colour from cold (blue) to hot (orange)
    // with the temperature, its atoms shaking more as it warms (the slider's −20 to 100 °C); the voltage
    // over it, the current under it, its resistance at that temperature in the state line.
    const [a, b] = data.ids;
    const temperature = r?.sensor?.temperature ?? data.temperature ?? 25;
    const k = Math.max(0, Math.min(1, (temperature + 20) / 120));
    make(g, 'path', { class: 'lead', d: 'M4 50H34M66 50H96' });
    make(g, 'ellipse', { class: 'core', cx: 50, cy: 50, rx: 24, ry: 19 });
    make(g, 'ellipse', { cx: 50, cy: 50, rx: 24, ry: 19, fill: VOLTAGE_COLORS.negative, opacity: fixed(0.4 * (1 - k) ** 2) });
    make(g, 'ellipse', { cx: 50, cy: 50, rx: 24, ry: 19, fill: HEAT_COLOR, opacity: fixed(0.65 * k ** 1.5) });
    make(g, 'rect', { class: 'metal', x: 30, y: 44, width: 4, height: 12 });
    make(g, 'rect', { class: 'metal', x: 66, y: 44, width: 4, height: 12 });
    for (const [x, y] of [[42, 41], [50, 41], [58, 41], [42, 59], [50, 59], [58, 59]]) {
      make(g, 'circle', { class: 'shake', cx: x, cy: y, r: fixed(2.4 + 2.6 * k), opacity: fixed(0.25 + 0.75 * k) });
      make(g, 'circle', { class: 'atom', cx: x, cy: y, r: 1.6 });
    }
    label(g, 9, 45, a, 'pin-name', 'middle', FIGURE.text);
    label(g, 91, 45, b, 'pin-name', 'middle', FIGURE.text);
    across(g, r?.voltage, f);
    const i = r?.current ?? 0;
    if (flowing(i)) {
      shaft(g, i > 0 ? 24 : 76, 80, i > 0 ? 76 : 24, 80, widthOf(i));
      label(g, 82, 83, 'I', 'current', 'start', FIGURE.small);
    }
    label(g, 50, 103, r ? [flowing(i) && `I ${f(Math.abs(i), 'A')}`, `P ${f(Math.abs(r.power ?? 0), 'W')}`].filter(Boolean).join(' · ') : '', 'note');
    const resistance = r?.sensor?.resistance;
    label(g, 50, 114, resistance != null ? t('page.tour.inside.thermistor.at', { resistance: f(resistance, 'Ω'), temperature: celsius(temperature, f) }) : '', 'state');
  },
  ldr(g, r, data, { t, f }) {
    // The ceramic disc with its cadmium-sulphide track in a zigzag between two metal combs, lighter as
    // more light falls on it; an arrow of light for each decade of lux over 0.1 (1 lx one, 10 000 lx
    // five) coming in from above; the current under it, V and I and its resistance with that light.
    const [a, b] = data.ids;
    const light = r?.sensor?.light ?? data.light ?? 100;
    const n = Math.max(0, Math.min(5, Math.round(Math.log10(Math.max(light, 1e-3)) + 1)));
    make(g, 'path', { class: 'lead', d: 'M4 56H30M70 56H96' });
    make(g, 'circle', { class: 'core', cx: 50, cy: 56, r: 26 });
    const track = 'M34 44H64V50H36V56H64V62H36V68H66';
    make(g, 'path', { class: 'cds', d: track });
    make(g, 'path', { class: 'cds lit', d: track, opacity: fixed(n / 5) });
    make(g, 'rect', { class: 'metal', x: 30, y: 40, width: 4, height: 32 });
    make(g, 'rect', { class: 'metal', x: 66, y: 40, width: 4, height: 32 });
    // The arrows in the middle slots of five, from the upper right down onto the disc.
    const first = Math.floor((5 - n) / 2);
    for (let j = first; j < first + n; j++) {
      const x = 30 + j * 10;
      make(g, 'path', { class: 'light', d: `M${x + 9} 4L${x + 1.6} 22.4` });
      const head = (da) => `${fixed(x - 6 * Math.cos(LIGHT + da))} ${fixed(26 - 6 * Math.sin(LIGHT + da))}`;
      make(g, 'path', { class: 'light-head', d: `M${x} 26L${head(0.5)}L${head(-0.5)}Z` });
    }
    label(g, 9, 51, a, 'pin-name', 'middle', FIGURE.text);
    label(g, 91, 51, b, 'pin-name', 'middle', FIGURE.text);
    const i = r?.current ?? 0;
    if (flowing(i)) {
      shaft(g, i > 0 ? 24 : 76, 90, i > 0 ? 76 : 24, 90, widthOf(i));
      label(g, 82, 93, 'I', 'current', 'start', FIGURE.small);
    }
    label(g, 50, 103, r ? [`V ${f(Math.abs(r.voltage ?? 0), 'V')}`, flowing(i) && `I ${f(Math.abs(i), 'A')}`].filter(Boolean).join(' · ') : '', 'note');
    const resistance = r?.sensor?.resistance;
    label(g, 50, 114, resistance != null ? t('page.tour.inside.ldr.at', { resistance: f(resistance, 'Ω'), light: lux(light, f) }) : '', 'state');
  },
  button(g, r, data, { t, f, control }) {
    // Cut from the side: the 1–2 piece on the left and the 3–4 piece on the right, each one metal from
    // pin to pin, their inner arms the contacts; the metal dome over both with the plunger on it.
    // Released, the dome arches clear and the gap holds a voltage; pressed (held, in the page), it snaps
    // flat onto both arms and the current crosses from one piece to the other under them.
    const [a, b, c, d] = data.ids;
    const pressed = Boolean(r?.pressed ?? control?.('pressed') ?? data.pressed);
    make(g, 'rect', { class: 'core', x: 24, y: 40, width: 52, height: 40, rx: 2 });
    make(g, 'path', { class: 'lead', d: 'M15 4V24M15 82V92M85 4V24M85 82V92' });
    make(g, 'rect', { class: 'metal', x: 12, y: 24, width: 6, height: 58 });
    make(g, 'rect', { class: 'metal', x: 82, y: 24, width: 6, height: 58 });
    make(g, 'rect', { class: 'metal', x: 18, y: 64, width: 22, height: 5 });
    make(g, 'rect', { class: 'metal', x: 60, y: 64, width: 22, height: 5 });
    const apex = pressed ? 61 : 47;
    make(g, 'path', { class: `dome${pressed ? ' on' : ''}`, d: pressed ? 'M30 64Q50 58 70 64' : 'M30 60Q50 34 70 60' });
    make(g, 'rect', { class: 'plunger', x: 44, y: apex - 35, width: 12, height: 34 });
    label(g, 7, 12, a, 'pin-name', 'middle', FIGURE.text);
    label(g, 7, 96, b, 'pin-name', 'middle', FIGURE.text);
    label(g, 93, 12, c, 'pin-name', 'middle', FIGURE.text);
    label(g, 93, 96, d, 'pin-name', 'middle', FIGURE.text);
    // Conventional current from the 1–2 piece to the 3–4 one when it is positive (its device's sense).
    const i = r?.current ?? 0;
    const [from, to] = data.contact ?? ['1', '3'];
    const v = r?.pins?.[from] != null && r?.pins?.[to] != null ? r.pins[from] - r.pins[to] : null;
    if (pressed && flowing(i)) {
      shaft(g, i > 0 ? 26 : 74, 76, i > 0 ? 74 : 26, 76, widthOf(i));
      label(g, 50, 89, 'I', 'current', 'middle', FIGURE.small);
    } else if (!pressed && v != null) gap(g, 40, 60, 76, v, f);
    // Open, its voltage is on the gap; closed, the little the contact takes, with the current.
    label(g, 50, 103, r && pressed ? [v != null && `V ${f(Math.abs(v), 'V')}`, flowing(i) && `I ${f(Math.abs(i), 'A')}`].filter(Boolean).join(' · ') : '', 'note');
    label(g, 50, 114, r ? t(`page.tour.inside.button.${pressed ? 'pressed' : 'released'}`, { a, b, c, d }) : '', 'state');
  },
  switch(g, r, data, ctx) {
    // Where its control has it (the reading, else the control, else the circuit file).
    const on = Boolean(r?.on ?? ctx.control?.('on') ?? data.on);
    if (data.style === 'latching') latchingInside(g, r, data, ctx, on);
    else rockerInside(g, r, data, ctx, on);
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
  regulator(g, r, data, { t, f }) {
    // The pass transistor between IN and OUT drops what IN has over OUT, warmer as its power, (Vin −
    // Vout) · I, nears its limit; under it the error amplifier compares a reference with the output (a
    // fixed regulator's own divider; an LM317's reference sits between OUT and ADJ, its divider outside)
    // and drives the transistor. Beside it a bar of the headroom, Vin − Vout, with the dropout marked;
    // the currents in and out over the leads.
    const [inp, out, ref] = data.ids;
    const vin = r?.vin ?? 0;
    const state = !r ? null : vin < 0.5 ? 'off' : r.state;
    make(g, 'path', { class: 'lead', d: 'M4 24H32M56 24H96' });
    make(g, 'rect', { class: 'pass', x: 32, y: 14, width: 24, height: 20, rx: 2 });
    const ratio = data.maxPower > 0 ? Math.abs(r?.power ?? 0) / data.maxPower : 0;
    make(g, 'rect', { x: 32, y: 14, width: 24, height: 20, rx: 2, fill: HEAT_COLOR, opacity: fixed(heatOpacity(ratio)) });
    // The amplifier, pointing up at the transistor it drives; its + input on the reference, its − on
    // the output (through the divider, or straight from OUT for an LM317).
    make(g, 'path', { class: 'lead', d: 'M44 42V34M38 64V70M38 76V84' });
    make(g, 'path', { class: `comparator${state === 'regulating' ? ' active' : ''}`, d: 'M32 64H56L44 42Z' });
    label(g, 38, 62, '+', 'quiet', 'middle', FIGURE.small);
    label(g, 50, 62, '−', 'quiet', 'middle', FIGURE.small);
    make(g, 'path', { class: 'lead', d: 'M32 70H44' });
    make(g, 'rect', { class: 'metal', x: 35, y: 73, width: 6, height: 2.6 });
    label(g, 30, 76, 'Vref', 'note', 'end', FIGURE.small);
    if (data.adjustable) {
      make(g, 'path', { class: 'lead', d: 'M50 64V68H62V24M38 84H50' });
      make(g, 'circle', { class: 'metal', cx: 62, cy: 24, r: 1.8 });
    } else {
      make(g, 'path', { class: 'lead', d: 'M50 64V68H60V50H68M68 24V32M68 46V54M68 68V84M38 84H68' });
      make(g, 'rect', { class: 'film', x: 65, y: 32, width: 6, height: 14 });
      make(g, 'rect', { class: 'film', x: 65, y: 54, width: 6, height: 14 });
      make(g, 'circle', { class: 'metal', cx: 68, cy: 24, r: 1.8 });
      make(g, 'circle', { class: 'metal', cx: 68, cy: 50, r: 1.6 });
    }
    make(g, 'path', { class: 'lead', d: 'M50 84V96' });
    make(g, 'circle', { class: 'metal', cx: 50, cy: 84, r: 1.8 });
    label(g, 4, 37, inp, 'pin-name', 'start', FIGURE.text);
    label(g, 96, 37, out, 'pin-name', 'end', FIGURE.text);
    label(g, 55, 96, ref, 'pin-name', 'start', FIGURE.text);
    // The headroom against three dropouts, the dropout marked: under the mark it is out of regulation.
    const top = 46;
    const height = 34;
    const full = 3 * (data.dropout || 1);
    const k = Math.max(0, Math.min(1, (r?.headroom ?? 0) / full));
    make(g, 'rect', { class: 'gauge', x: 86, y: top, width: 6, height });
    make(g, 'rect', { class: `headroom${state === 'dropout' ? ' low' : ''}`, x: 86, y: fixed(top + height * (1 - k)), width: 6, height: fixed(height * k) });
    make(g, 'path', { class: 'dim', d: `M83 ${fixed(top + (height * 2) / 3)}H95` });
    label(g, 89, 89, 'ΔV', 'note', 'middle', FIGURE.small);
    // Conventional current into IN and out of OUT, over the leads.
    const iin = r?.currents?.IN ?? 0;
    const iout = r?.current ?? 0;
    if (flowing(iin)) {
      shaft(g, iin > 0 ? 4 : 28, 16, iin > 0 ? 28 : 4, 16, widthOf(iin));
      label(g, 4, 9, 'Iin', 'current', 'start', FIGURE.small);
    }
    if (flowing(iout)) {
      shaft(g, iout > 0 ? 60 : 94, 16, iout > 0 ? 94 : 60, 16, widthOf(iout));
      label(g, 96, 9, 'Iout', 'current', 'end', FIGURE.small);
    }
    if (r) label(g, 44, 9, `P ${f(Math.abs(r.power ?? 0), 'W')}`, 'note', 'middle', FIGURE.small);
    label(g, 50, 103, r ? `${f(vin, 'V')} → ${f(r.vout ?? 0, 'V')} · ${f(Math.abs(iout), 'A')}` : '', 'note');
    label(g, 50, 114, state ? t(`page.tour.inside.regulator.${state}`) : '', 'state');
  },
  battery(g, r, data, { t, f }) {
    // Its cells in series (up to six drawn), each filled with the charge left from its − end; behind
    // them the internal resistance, before the + lead. Over the cells their EMF, over the resistance the
    // voltage it takes (I·R), so V at the leads is EMF − I·R; the current under them, inside from − to +
    // while it gives energy; a warning line from the reading (a short, too much current, an alkaline
    // being charged).
    const [plus, minus] = data.ids;
    const n = Math.max(1, data.series ?? 1);
    const drawn = Math.min(n, 6);
    const pitch = 62 / drawn;
    const charge = r?.charge ?? data.charge;
    const k = Math.max(0, Math.min(1, charge ?? 1));
    make(g, 'path', { class: 'lead', d: 'M4 40H10M72 40H76M86 40H96' });
    for (let j = 0; j < drawn; j++) {
      const x = 10 + j * pitch;
      const w = pitch - 3;
      make(g, 'rect', { class: 'cell', x: fixed(x), y: 30, width: fixed(w), height: 20, rx: 2 });
      make(g, 'rect', { class: 'soc', x: fixed(x + 1.5), y: 31.5, width: fixed(Math.max(0, (w - 3) * k)), height: 17, rx: 1 });
      make(g, 'rect', { class: 'metal', x: fixed(x + w), y: 36, width: 2, height: 8 });
      if (j < drawn - 1) make(g, 'path', { class: 'lead', d: `M${fixed(x + w + 2)} 40H${fixed(x + pitch)}` });
    }
    make(g, 'rect', { class: 'film', x: 76, y: 36, width: 10, height: 8 });
    label(g, 81, 56, 'R', 'quiet', 'middle', FIGURE.small);
    label(g, 6, 34, minus, 'pin-name', 'middle', FIGURE.text);
    label(g, 94, 34, plus, 'pin-name', 'middle', FIGURE.text);
    const chem = data.chemistry ? t(`page.tour.inside.battery.chem.${data.chemistry}`) : '';
    label(g, 50, 7, [n > 1 ? `${n} × ${chem}` : chem, charge != null && `${Math.round(k * 100)} %`].filter(Boolean).join(' · '), 'note');
    const on = r?.on !== false;
    if (r && on && r.emf != null) {
      make(g, 'path', { class: 'dim', d: 'M10 24H72M10 20V28M72 20V28M76 24H86M76 20V28M86 20V28' });
      label(g, 41, 18, `EMF ${f(r.emf, 'V')}`, 'note');
      label(g, 84, 18, f(Math.abs(r.drop ?? 0), 'V'), 'note');
    }
    // Conventional current inside the battery: from − to + while it gives energy (out of +), the other
    // way while something charges it.
    const i = r?.current ?? 0;
    if (on && flowing(i)) {
      shaft(g, i > 0 ? 12 : 84, 62, i > 0 ? 84 : 12, 62, widthOf(i));
      label(g, i > 0 ? 88 : 8, 65, 'I', 'current', i > 0 ? 'start' : 'end', FIGURE.small);
    }
    // Its warnings, as the simulator's: a short (under half an ohm outside it), more than it is meant
    // for, an alkaline cell charged.
    const short = i > 0.1 && Math.abs(r?.voltage ?? 0) / i < 0.5;
    const warning = !r || !on ? null : short ? t('page.tour.inside.battery.short') : data.maxCurrent > 0 && Math.abs(i) > data.maxCurrent ? t('page.tour.inside.battery.over', { max: f(data.maxCurrent, 'A') }) : i < -1e-3 && !data.rechargeable ? t('page.tour.inside.battery.reverse') : null;
    if (warning) label(g, 50, 84, warning, 'warning', 'middle', FIGURE.small);
    label(g, 50, 103, r && on ? [`V ${f(r.voltage ?? 0, 'V')}`, flowing(i) && `I ${f(Math.abs(i), 'A')}`].filter(Boolean).join(' · ') : '', 'note');
    const state = !on ? 'off' : !flowing(i) ? 'idle' : i > 0 ? 'discharging' : 'charging';
    label(g, 50, 114, r ? t(`page.tour.inside.battery.${state}`) : '', 'state');
  },
  relay(g, r, data, { t, f }) {
    // A relay cut open: its coil round an iron core, the field lines round it as many and as strong as
    // its current against the pull-in current; the armature, a lever on its hinge at COM that the core
    // pulls to it, its blade resting on NC and pulled up onto NO; each fixed contact down to its pin.
    // The coil's current beside A1's lead, the contact's beside COM's; under it the coil's voltage and
    // current (with its kick when it is cut off with nothing across it).
    const name = Object.fromEntries((data.names ?? []).map((n, i) => [n, data.ids[i]]));
    const wired = (n) => Boolean(name[n]);
    const i = r?.current ?? 0;
    const closed = Boolean(r?.closed);
    const k = data.pullIn > 0 ? Math.min(1, Math.sqrt(Math.abs(i) / data.pullIn)) : 0;
    [[14, 24], [18, 28], [22, 32]].forEach(([rx, ry], j) => {
      const o = Math.max(0, Math.min(1, k * 3 - j));
      if (flowing(i) && o > 0) make(g, 'ellipse', { class: 'field', cx: 24, cy: 55, rx, ry, opacity: fixed(o) });
    });
    make(g, 'rect', { class: 'core', x: 14, y: 36, width: 20, height: 38, rx: 2 });
    make(g, 'path', { class: 'winding', d: 'M12 40H36M12 45H36M12 50H36M12 55H36M12 60H36M12 65H36M12 70H36' });
    make(g, 'rect', { class: 'metal', x: 14, y: 76, width: 30, height: 4 });
    make(g, 'path', { class: 'lead', d: 'M24 36V31H8V83M30 74V83M48 76V83' });
    // The lever about its hinge (48, 74): pulled, its upright leans to the core and its blade's tip
    // rises onto NO; released, the other way, onto NC.
    const turn = closed ? -5 : 5;
    const tip = (deg) => {
      const a = (deg * Math.PI) / 180;
      return [48 + 36 * Math.cos(a) + 36 * Math.sin(a), 74 + 36 * Math.sin(a) - 36 * Math.cos(a)];
    };
    const [no, nc] = [tip(-5), tip(5)];
    make(g, 'rect', { class: 'metal', x: fixed(no[0] - 4), y: fixed(no[1] - 4.5), width: 8, height: 3 });
    make(g, 'rect', { class: 'metal', x: fixed(nc[0] - 4), y: fixed(nc[1] + 1.5), width: 8, height: 3 });
    make(g, 'path', { class: 'lead', d: `M${fixed(no[0] + 4)} ${fixed(no[1] - 3)}H94V83M${fixed(nc[0])} ${fixed(nc[1] + 4.5)}V54H72V83` });
    const lever = make(g, 'g', { transform: `rotate(${turn} 48 74)` });
    make(lever, 'path', { class: `blade${closed ? ' on' : ''}`, d: 'M48 74V38H84' });
    make(g, 'circle', { class: 'metal', cx: 48, cy: 74, r: 2.6 });
    for (const [n, x] of [['A1', 8], ['A2', 30], ['COM', 48], ['NC', 72], ['NO', 94]]) pinName(g, x, 93, name[n] ?? n, wired(n), 'middle', n === 'COM' ? FIGURE.small : FIGURE.text);
    // Conventional current into A1 runs up its lead; into COM, up COM's.
    if (flowing(i)) shaft(g, 3, i > 0 ? 82 : 58, 3, i > 0 ? 58 : 82, widthOf(i));
    const ic = r?.currents?.COM ?? 0;
    if (flowing(ic)) shaft(g, 54, ic > 0 ? 84 : 74, 54, ic > 0 ? 74 : 84, widthOf(ic));
    const kick = (r?.kick ?? 0) > (data.nominal ?? 5);
    label(g, 50, 103, r ? [`V ${f(Math.abs(r.voltage) < 1e-3 ? 0 : r.voltage, 'V')}`, `I ${f(flowing(i) ? Math.abs(i) : 0, 'A')}`].join(' · ') : '', kick ? 'warning' : 'note');
    label(g, 50, 114, r ? t(`page.tour.inside.relay.${kick ? 'kick' : r.state}`) : '', 'state');
  },
  motor(g, r, data, { t, f }) {
    // A DC motor cut across: the two magnets, N and S; the armature's three poles, turned to the shaft's
    // angle now, the arrow round it as long as its speed against its no-load speed at the top of its
    // range; the commutator under it with its two brushes, down to + and −. At the top, the supply's
    // voltage against the back-EMF k·ω the turning makes: their difference is what drives the current.
    const [plus, minus] = data.ids;
    const angle = r?.angle ?? 0;
    const omega = r?.omega ?? 0;
    const top = data.maxVoltage || 6;
    make(g, 'rect', { class: 'magnet', x: 8, y: 22, width: 13, height: 52 });
    make(g, 'rect', { class: 'magnet', x: 79, y: 22, width: 13, height: 52 });
    label(g, 14.5, 52, 'N', 'layer-name', 'middle', FIGURE.text);
    label(g, 85.5, 52, 'S', 'layer-name', 'middle', FIGURE.text);
    make(g, 'circle', { class: 'core', cx: 50, cy: 48, r: 20 });
    const at = (a, rad, cx = 50, cy = 48) => [cx + rad * Math.cos(a), cy + rad * Math.sin(a)];
    for (let j = 0; j < 3; j++) {
      const a = angle + (j * 2 * Math.PI) / 3;
      const [x, y] = at(a, 13);
      make(g, 'path', { class: 'blade', d: `M50 48L${fixed(x)} ${fixed(y)}` });
      make(g, 'circle', { class: 'winding', cx: fixed(x), cy: fixed(y), r: 3.6 });
    }
    // The rotation arrow, round the armature: its length by the speed, its way by the sign.
    const share = data.fullSpeed > 0 ? Math.min(1, Math.abs(omega) / data.fullSpeed) : 0;
    if (share > 0.01) {
      const span = Math.max(0.3, share * 1.6 * Math.PI);
      const sign = omega > 0 ? 1 : -1;
      const a0 = -Math.PI / 2 - (sign * span) / 2;
      const a1 = a0 + sign * span;
      const [x0, y0] = at(a0, 25);
      const [x1, y1] = at(a1, 25);
      make(g, 'path', { class: 'wiper', fill: 'none', d: `M${fixed(x0)} ${fixed(y0)}A25 25 0 ${span > Math.PI ? 1 : 0} ${sign > 0 ? 1 : 0} ${fixed(x1)} ${fixed(y1)}` });
      const back = at(a1 - sign * 0.28, 25);
      const [ox, oy] = [(back[0] - 50) / 25, (back[1] - 48) / 25];
      make(g, 'path', { class: 'wiper-tip', d: `M${fixed(x1)} ${fixed(y1)}L${fixed(back[0] + 3.5 * ox)} ${fixed(back[1] + 3.5 * oy)}L${fixed(back[0] - 3.5 * ox)} ${fixed(back[1] - 3.5 * oy)}Z` });
    }
    // The commutator, its three segments turning with the armature, between its two brushes.
    make(g, 'circle', { class: 'core', cx: 50, cy: 81, r: 5 });
    for (let j = 0; j < 3; j++) {
      const [x, y] = at(angle + (j * 2 * Math.PI) / 3, 5, 50, 81);
      make(g, 'path', { class: 'dim', d: `M50 81L${fixed(x)} ${fixed(y)}` });
    }
    make(g, 'rect', { class: 'metal', x: 41, y: 78, width: 3.5, height: 6 });
    make(g, 'rect', { class: 'metal', x: 55.5, y: 78, width: 3.5, height: 6 });
    make(g, 'path', { class: 'lead', d: 'M41 81H30V84M59 81H70V84' });
    label(g, 30, 93, plus, 'pin-name', 'middle', FIGURE.text);
    label(g, 70, 93, minus, 'pin-name', 'middle', FIGURE.text);
    // Conventional current into + runs up its lead, beside it.
    const i = r?.current ?? 0;
    if (flowing(i)) shaft(g, 22, i > 0 ? 93 : 82, 22, i > 0 ? 82 : 93, widthOf(i));
    // The supply against the back-EMF, bars of the voltage at the top of its range.
    if (r) {
      const bar = (y, v, cls) => make(g, 'rect', { class: cls, x: 22, y, width: fixed(Math.max(0.5, Math.min(1, Math.abs(v) / top) * 60)), height: 3.5 });
      make(g, 'rect', { class: 'gauge', x: 22, y: 4, width: 60, height: 3.5 });
      make(g, 'rect', { class: 'gauge', x: 22, y: 11, width: 60, height: 3.5 });
      bar(4, r.voltage, 'headroom');
      bar(11, r.emf, 'soc');
      label(g, 19, 8, 'V', 'note', 'end', FIGURE.small);
      label(g, 19, 15, 'E', 'note', 'end', FIGURE.small);
    }
    label(g, 50, 103, r ? [`${Math.round(r.rpm)} r/min`, `I ${f(Math.abs(i), 'A')}`, `E ${f(r.emf, 'V')}`].join(' · ') : '', r?.state === 'stalled' ? 'warning' : 'note');
    label(g, 50, 114, r ? t(`page.tour.inside.motor.${r.state}`) : '', 'state');
  },
  buzzer(g, r, data, { t, f, memo }) {
    // A passive magnetic buzzer cut through: its coil round a pole piece inside a ring magnet, the thin
    // steel disc over them pulled down as the current grows. It sounds only while the current changes:
    // the change from one reading to the next (kept in `memo`, fading) is its drive, an arc of sound
    // over the disc per third of its rated current; on steady DC the disc stays pulled and it is silent.
    const [a, b] = data.ids;
    const i = r?.current ?? 0;
    const imax = data.maxCurrent || 0.1;
    if (r && memo && memo.r !== r) {
      memo.swing = Math.max(Math.abs(i - (memo.last ?? i)), (memo.swing ?? 0) * 0.8);
      memo.last = i;
      memo.r = r;
    }
    const swing = memo?.swing ?? 0;
    const sounding = swing > 1e-4;
    const pull = Math.max(-1, Math.min(1, i / imax));
    make(g, 'rect', { class: 'core', x: 14, y: 34, width: 72, height: 50, rx: 4 });
    make(g, 'rect', { class: 'magnet', x: 18, y: 60, width: 14, height: 18 });
    make(g, 'rect', { class: 'magnet', x: 68, y: 60, width: 14, height: 18 });
    make(g, 'rect', { class: 'metal', x: 46, y: 50, width: 8, height: 30 });
    make(g, 'path', { class: 'winding', d: 'M36 58H44M56 58H64M36 63H44M56 63H64M36 68H44M56 68H64M36 73H44M56 73H64' });
    make(g, 'rect', { class: 'metal', x: 18, y: 78, width: 64, height: 3 });
    make(g, 'path', { class: `disc${sounding ? ' on' : ''}`, d: `M17 42Q50 ${fixed(42 + 10 * pull)} 83 42` });
    make(g, 'path', { class: 'lead', d: 'M30 84V96M70 84V96' });
    label(g, 22, 95, a, 'pin-name', 'middle', FIGURE.text);
    label(g, 78, 95, b, 'pin-name', 'middle', FIGURE.text);
    // The sound over the disc, one to three arcs with the drive.
    const arcs = sounding ? Math.max(1, Math.min(3, Math.ceil(3 * Math.sqrt(swing / imax)))) : 0;
    for (let j = 0; j < arcs; j++) {
      const rr = 8 + 7 * j;
      const dx = fixed(rr * Math.sin(0.9));
      const dy = fixed(34 - rr * Math.cos(0.9));
      make(g, 'path', { class: 'sound', d: `M${fixed(50 - dx)} ${dy}A${rr} ${rr} 0 0 1 ${fixed(50 + Number(dx))} ${dy}` });
    }
    // Conventional current from + to − through the coil, under the case between the leads.
    if (flowing(i)) shaft(g, i > 0 ? 34 : 66, 90, i > 0 ? 66 : 34, 90, widthOf(i));
    label(g, 50, 103, r ? [`V ${f(Math.abs(r.voltage ?? 0), 'V')}`, flowing(i) && `I ${f(Math.abs(i), 'A')}`].filter(Boolean).join(' · ') : '', 'note');
    const state = sounding ? 'sounding' : flowing(i) ? 'dc' : 'silent';
    label(g, 50, 114, r ? t(`page.tour.inside.buzzer.${state}`) : '', 'state');
  },
  slide(g, r, data, { t, f, control }) {
    // Cut from the side, as its datasheet draws it: the frame with its three fixed contacts, 1, COM and
    // 2, each down to its pin; the knob on top carries the slider under it, which bridges COM to the
    // contact on the knob's side. The current through that pair runs under the frame between their
    // leads; the open pair's gap holds a voltage there.
    const [p1, com, p2] = data.ids;
    const slid = Boolean(r?.on ?? control?.('slid') ?? data.on);
    const xs = { 1: 26, COM: 50, 2: 74 };
    make(g, 'rect', { class: 'core', x: 12, y: 30, width: 76, height: 32, rx: 2 });
    make(g, 'rect', { class: 'plunger', x: slid ? 56 : 32, y: 10, width: 12, height: 26 });
    make(g, 'path', { class: 'lead', d: 'M26 58V84M50 58V84M74 58V84' });
    for (const x of Object.values(xs)) make(g, 'rect', { class: 'metal', x: x - 6, y: 54, width: 12, height: 4 });
    make(g, 'path', { class: 'blade on', d: slid ? 'M48 50H76' : 'M24 50H52' });
    label(g, 26, 95, p1, 'pin-name', 'middle', FIGURE.text);
    label(g, 50, 95, com, 'pin-name', 'middle', FIGURE.small);
    label(g, 74, 95, p2, 'pin-name', 'middle', FIGURE.text);
    // The closed pair's current, from COM to its throw when positive (the contact's own sense).
    const i = r?.contacts?.[0]?.current ?? 0;
    const to = slid ? xs['2'] : xs['1'];
    if (flowing(i)) {
      const [x0, x1] = i > 0 ? [50 + Math.sign(to - 50) * 3, to - Math.sign(to - 50) * 3] : [to - Math.sign(to - 50) * 3, 50 + Math.sign(to - 50) * 3];
      shaft(g, x0, 72, x1, 72, widthOf(i));
      label(g, (50 + to) / 2, 82, 'I', 'current', 'middle', FIGURE.small);
    }
    // The open pair's gap as a dimension line; its voltage is under the figure (no room between leads).
    const open = r?.open?.[0];
    if (open) {
      const [x0, x1] = slid ? [29, 47] : [53, 71];
      make(g, 'path', { class: 'dim', d: `M${x0} 72H${x1}M${x0} 68V76M${x1} 68V76` });
    }
    label(g, 50, 103, r ? [flowing(i) && `I ${f(Math.abs(i), 'A')}`, open && `${open.a}–${open.b} ${f(Math.abs(open.voltage), 'V')}`].filter(Boolean).join(' · ') : '', 'note');
    label(g, 50, 114, r ? t(`page.tour.inside.slide.${slid ? 'at2' : 'at1'}`) : '', 'state');
  },
  tilt(g, r, data, { t, f, control }) {
    // The can with its two balls and the two leads' ends inside it, standing on its leads. Upright the
    // lower ball rests on both ends and joins them; leaning past its angle (45°: drawn at 50°, the can
    // leaning on its leads) the balls roll against the low side, onto one end at most, and the leads
    // are apart. The current, or the open gap, under the leads.
    const [a, b] = data.ids;
    const tilted = Boolean(r?.on ?? control?.('tilted') ?? data.on);
    const turn = ((tilted ? 50 : 0) * Math.PI) / 180;
    // Where a point at the can's lead end (y 72) is once the can leans about its middle there.
    const leaned = (x) => `${fixed(50 + (x - 50) * Math.cos(turn))} ${fixed(72 + (x - 50) * Math.sin(turn))}`;
    make(g, 'path', { class: 'lead', d: `M44 86L${leaned(44)}M56 86L${leaned(56)}` });
    const can = make(g, 'g', { transform: `rotate(${tilted ? 50 : 0} 50 72)` });
    make(can, 'rect', { class: 'core', x: 36, y: 28, width: 28, height: 44, rx: 7 });
    make(can, 'rect', { class: 'metal', x: 42.5, y: 58, width: 3, height: 14 });
    make(can, 'rect', { class: 'metal', x: 54.5, y: 58, width: 3, height: 14 });
    for (const [x, y] of tilted ? [[57, 51], [57, 37]] : [[50, 54.4], [50, 40.4]]) make(can, 'circle', { class: `ball${tilted ? '' : ' on'}`, cx: x, cy: y, r: 7 });
    label(g, 40, 92, a, 'pin-name', 'end', FIGURE.text);
    label(g, 60, 92, b, 'pin-name', 'start', FIGURE.text);
    const i = r?.contacts?.[0]?.current ?? 0;
    const v = r?.pins?.['1'] != null && r?.pins?.['2'] != null ? r.pins['1'] - r.pins['2'] : null;
    if (!tilted && flowing(i)) shaft(g, i > 0 ? 42 : 58, 92, i > 0 ? 58 : 42, 92, widthOf(i));
    else if (tilted && v != null) gap(g, 44, 56, 90, v, f);
    label(g, 50, 103, r && !tilted ? [v != null && `V ${f(Math.abs(v), 'V')}`, flowing(i) && `I ${f(Math.abs(i), 'A')}`].filter(Boolean).join(' · ') : '', 'note');
    label(g, 50, 114, r ? t(`page.tour.inside.tilt.${tilted ? 'tilted' : 'upright'}`) : '', 'state');
  },
  lm35(g, r, data, { t, f, control }) {
    // The chip: a thermometer of its temperature (its rated range, full at its top), the arrow of what
    // it makes of it, 10 mV per °C, out to VOUT with the voltage there; the supply's current beside +VS.
    const [vs, out, gnd] = data.ids;
    const temperature = r?.temperature ?? control?.('temperature') ?? data.temperature ?? 25;
    const top = data.range?.[1] ?? 100;
    const k = Math.max(0, Math.min(1, temperature / top));
    make(g, 'path', { class: 'lead', d: 'M40 4V30M66 54H96M40 78V92' });
    make(g, 'rect', { class: 'core', x: 14, y: 30, width: 52, height: 48, rx: 3 });
    make(g, 'rect', { class: 'gauge', x: 20, y: 36, width: 6, height: 28 });
    make(g, 'rect', { x: 20, y: fixed(36 + 28 * (1 - k)), width: 6, height: fixed(28 * k), fill: HEAT_COLOR, opacity: fixed(0.35 + 0.6 * k) });
    make(g, 'circle', { cx: 23, cy: 68, r: 5, fill: HEAT_COLOR, opacity: fixed(0.35 + 0.6 * k) });
    make(g, 'circle', { class: 'dim', cx: 23, cy: 68, r: 5 });
    make(g, 'path', { class: 'lead', d: 'M32 54H57' });
    make(g, 'path', { class: 'fill', d: 'M62 54L55 50.5V57.5Z' });
    label(g, 46, 47, t('page.tour.inside.lm35.gain'), 'note', 'middle', FIGURE.small);
    label(g, 32, 72, celsius(temperature, f), 'note', 'start', FIGURE.small);
    label(g, 46, 12, vs, 'pin-name', 'start', FIGURE.text);
    label(g, 96, 47, out, 'pin-name', 'end', FIGURE.text);
    label(g, 46, 92, gnd, 'pin-name', 'start', FIGURE.text);
    if (r) label(g, 98, 65, f(r.vout, 'V'), 'note', 'end', FIGURE.small);
    // Conventional current into +VS, down beside its lead: its own (quiescent) and what VOUT gives.
    const is = r?.currents?.['+VS'] ?? 0;
    if (flowing(is)) {
      shaft(g, 30, is > 0 ? 6 : 26, 30, is > 0 ? 26 : 6, widthOf(is));
      label(g, 24, 18, 'Is', 'current', 'end', FIGURE.small);
    }
    label(g, 50, 103, r ? [`Vs ${f(r.vs, 'V')}`, `Is ${f(Math.abs(is), 'A')}`, flowing(r.current) && `Iout ${f(r.current, 'A')}`].filter(Boolean).join(' · ') : '', 'note');
    label(g, 50, 114, r ? t(`page.tour.inside.lm35.${r.state}`, { min: f(4, 'V') }) : '', 'state');
  },
  pir(g, r, data, { t, f }) {
    // The dome (a Fresnel lens: facets cut the view into zones) over the pyroelectric element, two
    // opposed halves that feel only a change; a comparator that wakes while OUT is high; under them a
    // bar that drains with the time left in the phase (the warm-up, the delay, the 2.5 s of rest); OUT
    // lit while it is high. The supply and what OUT gives under the figure.
    const [vcc, out, gnd] = data.ids;
    const high = r?.state === 'high';
    make(g, 'path', { class: 'dome', d: 'M6 46A21 21 0 0 1 48 46' });
    for (const x of [14, 20, 27, 34, 41]) make(g, 'path', { class: 'dim', d: `M${x} ${fixed(46 - Math.sqrt(Math.max(0, 21 * 21 - (x - 27) * (x - 27))))}V46` });
    make(g, 'rect', { class: `comparator${r?.motion ? ' active' : ''}`, x: 15, y: 46, width: 9, height: 12 });
    make(g, 'rect', { class: `comparator${r?.motion ? ' active' : ''}`, x: 29, y: 46, width: 9, height: 12 });
    label(g, 19.5, 68, '+', 'note', 'middle', FIGURE.small);
    label(g, 33.5, 68, '−', 'note', 'middle', FIGURE.small);
    make(g, 'path', { class: 'lead', d: 'M24 52H29M38 52H52' });
    make(g, 'path', { class: `comparator${high ? ' active' : ''}`, d: 'M52 38V66L74 52Z' });
    make(g, 'path', { class: 'lead', d: 'M74 52H92' });
    make(g, 'circle', { class: `out${high ? ' active' : ''}`, cx: 94, cy: 52, r: 4 });
    label(g, 92, 44, out, 'pin-name', 'end', FIGURE.small);
    label(g, 6, 12, vcc, 'pin-name', 'start', FIGURE.small);
    label(g, 94, 72, gnd, 'pin-name', 'end', FIGURE.small);
    // The bar: how much of the phase is left.
    const k = r?.left != null && r.length > 0 ? Math.max(0, Math.min(1, r.left / r.length)) : 0;
    make(g, 'rect', { class: 'film', x: 8, y: 78, width: 66, height: 7, rx: 2 });
    if (k > 0) make(g, 'rect', { class: 'soc', x: 8, y: 78, width: fixed(66 * k), height: 7, rx: 2 });
    if (r?.left != null) label(g, 41, 95, f(r.left, 's'), 'note', 'middle', FIGURE.small);
    label(g, 50, 103, r ? [`${vcc} ${f(r.vcc, 'V')}`, `${out} ${f(r.vout, 'V')}`, Math.abs(r.current) >= 1e-6 && `Iout ${f(Math.abs(r.current), 'A')}`].filter(Boolean).join(' · ') : '', 'note');
    label(g, 50, 114, r ? t(`page.tour.inside.pir.${r.state}`) : '', 'state');
  },
  touch(g, r, data, { t, f, control }) {
    // The pad is one plate of a capacitor to ground; the finger is the other, away or laid on it with
    // a thin layer between. The chip times how long the pad takes to charge: a finger makes it longer.
    // Its output lit while active; a toggle also shows the latch it keeps.
    const [sig] = data.ids;
    const touching = Boolean(r?.touch ?? control?.('touch'));
    const active = r?.state === 'active';
    const lift = touching ? 0 : 14;
    make(g, 'rect', { class: 'plate', x: 10, y: 66, width: 40, height: 6, rx: 1 });
    make(g, 'rect', { class: 'dielectric', x: 10, y: 59, width: 40, height: 7 });
    make(g, 'rect', { class: 'core', x: fixed(20), y: fixed(22 + lift), width: 20, height: 36, rx: 9 });
    make(g, 'path', { class: 'dim', d: `M30 ${fixed(22 + lift)}V${fixed(40 + lift)}` });
    label(g, 30, fixed(17 + lift), touching ? t('page.tour.inside.touch.finger') : '', 'note', 'middle', FIGURE.small);
    make(g, 'path', { class: 'lead', d: 'M30 72V80H64V58' });
    make(g, 'rect', { class: `latch${active ? ' active' : ''}`, x: 56, y: 34, width: 28, height: 24 });
    label(g, 70, 49, r?.toggle ? 'T' : 'IC', 'pin-name', 'middle', FIGURE.text);
    make(g, 'path', { class: 'lead', d: 'M84 46H92' });
    make(g, 'circle', { class: `out${active ? ' active' : ''}`, cx: 94, cy: 46, r: 4 });
    label(g, 92, 30, sig, 'pin-name', 'end', FIGURE.small);
    label(g, 50, 103, r ? [`${data.ids[1]} ${f(r.vcc, 'V')}`, `${sig} ${f(r.vout, 'V')}`, Math.abs(r.current) >= 1e-6 && `I ${f(Math.abs(r.current), 'A')}`].filter(Boolean).join(' · ') : '', 'note');
    label(g, 50, 114, r ? t(`page.tour.inside.touch.${r.state}`) : '', 'state');
  },
  encoder(g, r, data, { t, f, control }) {
    // A toothed metal wheel on the shaft, turned by its angle, and two springy fingers on its rim a
    // quarter of a cycle (4.5°) apart: A at the top, B just clockwise of it. A finger lit touches a tooth,
    // which grounds its line. Under the wheel a strip of the two lines around the present position
    // (twice the width of a cycle, left is behind), a mark on it where the shaft is.
    const [clk, dt] = data.ids;
    const pitch = 360 / (data.detents || 20);
    const shaft = r?.shaft ?? control?.('angle') ?? data.angle ?? 0;
    const closed = { a: Boolean(r?.closed?.CLK), b: Boolean(r?.closed?.DT) };
    const [cx, cy, inner, outer] = [50, 42, 17, 22];
    const at = (radius, deg) => `${fixed(cx + radius * Math.sin((deg * Math.PI) / 180))} ${fixed(cy - radius * Math.cos((deg * Math.PI) / 180))}`;
    make(g, 'circle', { class: 'core', cx, cy, r: inner });
    // A tooth spans 9° of each cycle; it touches finger A while the shaft is between 2.25° and 11.25°.
    for (let k = 0; k < 360 / pitch; k++) {
      const from = shaft + k * pitch - 11.25;
      const to = from + pitch / 2;
      make(g, 'path', { class: 'plate', d: `M${at(inner, from)}L${at(outer, from)}A${outer} ${outer} 0 0 1 ${at(outer, to)}L${at(inner, to)}A${inner} ${inner} 0 0 0 ${at(inner, from)}Z` });
    }
    make(g, 'path', { class: 'dim', d: `M${cx} ${cy}L${at(inner - 2, shaft)}` });
    make(g, 'circle', { class: 'out', cx, cy, r: 2 });
    // The fingers, drawn apart so they can be told: the contact points are 4.5° of the rim apart.
    for (const [name, deg, on, x] of [[clk, 0, closed.a, 30], [dt, pitch / 4, closed.b, 70]]) {
      make(g, 'path', { class: `blade${on ? ' on' : ''}`, d: `M${at(outer + 1, deg)}L${fixed(x)} 8` });
      label(g, x, 6, name, 'pin-name', 'middle', FIGURE.small);
    }
    // The strip: each line high while its contact is open, low while closed, over -18°…+18° of the shaft.
    const span = pitch * 2;
    const start = shaft - span / 2;
    const level = (deg, channel) => {
      const u = ((deg / pitch) % 1 + 1) % 1;
      return channel === 'a' ? u >= 0.125 && u < 0.625 : u >= 0.375 && u < 0.875;
    };
    [['a', 72, closed.a], ['b', 87, closed.b]].forEach(([channel, top, on]) => {
      let d = '';
      let was = null;
      for (let i = 0; i <= 72; i++) {
        const deg = start + (i * span) / 72;
        const low = level(deg, channel);
        const x = 8 + (84 * i) / 72;
        const y = top + (low ? 8 : 0);
        d += was === null ? `M${fixed(x)} ${y}` : was === low ? `H${fixed(x)}` : `V${y}H${fixed(x)}`;
        was = low;
      }
      make(g, 'path', { class: `junction${on ? ' on' : ''}`, d });
      label(g, 4, top + 6, channel.toUpperCase(), 'note', 'end', FIGURE.small);
    });
    make(g, 'path', { class: 'dim', d: 'M50 68V97' });
    const dir = r?.direction > 0 ? 'cw' : r?.direction < 0 ? 'ccw' : 'still';
    label(g, 50, 106, r ? `${clk} ${f(r.vclk, 'V')} · ${dt} ${f(r.vdt, 'V')} · ${t('sim.encoder.shaft', { angle: r.shaftShown, click: r.click, detents: r.detents })}` : '', 'note');
    label(g, 50, 114, r ? t(`page.tour.inside.encoder.${dir}`) : '', 'state');
  },
  module(g, r, data, { t, f, control }) {
    // An LM393 sensor module as its board: the divider (the fixed 10 kΩ over the element, AO between
    // them), the trimmer's Vref, AO and Vref as two bars against VCC (the one that is lower decides),
    // the comparator, and DO with its LED, lit while the open collector pulls DO low.
    const vcc = r?.vcc > 0.1 ? r.vcc : 5;
    const share = (v) => Math.max(0, Math.min(1, (v ?? 0) / vcc));
    const id = (name) => data.ids[data.names.indexOf(name)] ?? name;
    const low = Boolean(r?.low);
    const threshold = control?.('threshold') ?? data.threshold ?? 0.5;
    const ao = r ? r.ao : null;
    const vref = r ? r.vref : threshold * vcc;
    make(g, 'path', { class: 'lead', d: 'M4 6H76M18 6V12M18 34V46M18 74V90M4 90H76M18 40H32M48 6V12M48 70V90' });
    make(g, 'rect', { class: 'film', x: 12, y: 12, width: 12, height: 22 });
    make(g, 'rect', { class: 'core', x: 10, y: 46, width: 16, height: 28, rx: 2 });
    label(g, 18, 63, t(`page.tour.inside.module.${data.element ?? 'comb'}`), 'note', 'middle', FIGURE.small);
    label(g, 18, 26, '10k', 'quiet', 'middle', FIGURE.small);
    // The trimmer: a track from VCC to GND, its wiper at the threshold.
    make(g, 'rect', { class: 'film', x: 45, y: 12, width: 6, height: 58 });
    const wy = 70 - 58 * threshold;
    make(g, 'path', { class: 'wiper', d: `M54 ${fixed(wy)}H58` });
    // The two bars: AO and Vref, each as a share of VCC.
    for (const [x, v, cls, name] of [[30, ao, 'headroom', 'AO'], [60, vref, 'soc', 'Vref']]) {
      make(g, 'rect', { class: 'gauge', x, y: 26, width: 6, height: 60 });
      if (v != null) make(g, 'rect', { class: cls, x, y: fixed(86 - 60 * share(v)), width: 6, height: fixed(60 * share(v)) });
      label(g, x + 3, 22, name, 'pin-name', 'middle', FIGURE.small);
    }
    // The comparator: AO on +, Vref on −; its output pulls DO low while AO is under Vref.
    make(g, 'path', { class: `comparator${low ? ' active' : ''}`, d: 'M70 36V64L92 50Z' });
    make(g, 'path', { class: 'lead', d: 'M36 42H70M66 58H70M92 50H98' });
    label(g, 73, 45, '+', 'note', 'start', FIGURE.small);
    label(g, 73, 61, '−', 'note', 'start', FIGURE.small);
    make(g, 'circle', { class: `out${low ? ' active' : ''}`, cx: 84, cy: 20, r: 4 });
    make(g, 'path', { class: 'lead', d: 'M76 6H84V16M84 24V30H96V50' });
    label(g, 4, 4, id('VCC'), 'pin-name', 'start', FIGURE.small);
    label(g, 4, 98, id('GND'), 'pin-name', 'start', FIGURE.small);
    label(g, 98, 46, id(data.doPin ?? 'DO'), 'pin-name', 'end', FIGURE.small);
    label(g, 50, 103, r ? `AO ${f(ao, 'V')} · Vref ${f(vref, 'V')} · ${id(data.doPin ?? 'DO')} ${f(r.vdo, 'V')}` : '', 'note');
    const field = data.field ?? 'rain';
    label(g, 50, 114, r ? t(`page.tour.inside.module.${low ? 'low' : 'high'}`, { what: t(`sim.sensor-module.${field}.${r.detected ? 'detected' : 'idle'}`) }) : '', 'state');
  },
  laser(g, r, data, { t, f }) {
    // The laser diode's chip between its two cleaved faces (the mirrors), the light inside it growing
    // with the current: a glow under the threshold, past it a band that fills the chip and leaves
    // through the lens as a straight beam, as long as the optical power. Under it the current against
    // the threshold (a bar), and the optical power.
    const [s, , minus] = data.ids;
    const i = Math.max(0, r?.current ?? 0);
    const lasing = r?.state === 'lasing';
    const glow = Math.min(1, i / (data.threshold || 0.022));
    make(g, 'path', { class: 'lead', d: 'M4 30H22V40M4 70H22V60' });
    make(g, 'rect', { class: 'core', x: 22, y: 40, width: 44, height: 20, rx: 2 });
    make(g, 'rect', { class: 'chip', x: 26, y: 46, width: 36, height: 8, fill: data.color, opacity: fixed(0.15 + (lasing ? 0.85 : 0.35 * glow)) });
    make(g, 'rect', { class: 'metal', x: 22, y: 42, width: 3, height: 16 });
    make(g, 'rect', { class: 'metal', x: 63, y: 42, width: 3, height: 16 });
    make(g, 'path', { class: 'lens', d: 'M74 38A6 12 0 0 1 74 62A6 12 0 0 1 74 38Z' });
    if (lasing) {
      const len = Math.min(22, 6 + 4 * ((r.opticalPower ?? 0) * 1e3));
      make(g, 'path', { class: 'light', d: `M66 50H${fixed(74 + len)}` });
      make(g, 'path', { class: 'light-head', d: `M${fixed(78 + len)} 50L${fixed(72 + len)} 46.5L${fixed(72 + len)} 53.5Z` });
    }
    label(g, 4, 26, s, 'pin-name', 'start', FIGURE.text);
    label(g, 4, 82, minus, 'pin-name', 'start', FIGURE.text);
    // The current against the threshold: the bar's mark at Ith, full at the current it is rated for.
    const top = data.maxCurrent || 0.04;
    make(g, 'rect', { class: 'film', x: 22, y: 76, width: 56, height: 6, rx: 2 });
    if (i > 0) make(g, 'rect', { class: lasing ? 'soc' : 'headroom', x: 22, y: 76, width: fixed(56 * Math.min(1, i / top)), height: 6, rx: 2 });
    make(g, 'path', { class: 'lead', d: `M${fixed(22 + (56 * (data.threshold || 0.022)) / top)} 73V85` });
    label(g, 50, 92, `Ith ${f(data.threshold || 0.022, 'A')}`, 'quiet', 'middle', FIGURE.small);
    label(g, 50, 103, r ? [`I ${f(i, 'A')}`, lasing && `P ${f(r.opticalPower ?? 0, 'W')}`].filter(Boolean).join(' · ') : '', 'note');
    label(g, 50, 114, r ? t(`page.tour.inside.laser.${r.state}`) : '', 'state');
  },
  sonar(g, r, data, { t, f }) {
    // An ultrasonic module from the side: T and R (two piezo discs in their cans) look at a wall; the
    // burst leaves T as arcs, reaches the wall half way through the echo and comes back to R; the bar
    // under them fills with the round trip while ECHO is high, its lamp lit, and the width it reads
    // with the distance that width means (÷ 58 µs per cm).
    const [vcc, trig, echo] = data.ids;
    const state = r?.state ?? 'idle';
    const k = state === 'echo' && r.length > 0 ? Math.max(0, Math.min(1, 1 - r.left / r.length)) : 0;
    const back = state === 'echo' && !r.noEcho && k >= 0.5;
    make(g, 'path', { class: `disc${state === 'burst' || (state === 'echo' && k < 0.08) ? ' on' : ''}`, d: 'M12 20V40' });
    make(g, 'path', { class: `disc${back && k > 0.92 ? ' on' : ''}`, d: 'M12 52V72' });
    label(g, 6, 33, 'T', 'pin-name', 'middle', FIGURE.small);
    label(g, 6, 65, 'R', 'pin-name', 'middle', FIGURE.small);
    make(g, 'rect', { class: 'plate', x: 86, y: 14, width: 4, height: 64 });
    label(g, 88, 10, r ? `${Math.round(r.distance)} cm` : '', 'note', 'middle', FIGURE.small);
    // The sound: arcs near T in the burst; out to the wall and back to R in the echo.
    const arcs = (x, y, out) => {
      for (const dx of [0, 4]) make(g, 'path', { class: 'sound', d: `M${fixed(x + (out ? dx : -dx))} ${y - 8}A10 10 0 0 ${out ? 1 : 0} ${fixed(x + (out ? dx : -dx))} ${y + 8}` });
    };
    if (state === 'burst') arcs(16, 30, true);
    else if (state === 'echo' && !back) arcs(16 + (84 - 20) * Math.min(1, 2 * k), r.noEcho ? 30 : 30 + 16 * Math.min(1, 2 * k), true);
    else if (back) arcs(84 - (84 - 20) * (2 * k - 1), 46 + 16 * (2 * k - 1), false);
    // The round trip: a bar that fills while ECHO is high, and ECHO's lamp.
    make(g, 'rect', { class: 'film', x: 8, y: 82, width: 72, height: 7, rx: 2 });
    if (k > 0) make(g, 'rect', { class: 'soc', x: 8, y: 82, width: fixed(72 * k), height: 7, rx: 2 });
    make(g, 'circle', { class: `out${state === 'echo' ? ' active' : ''}`, cx: 91, cy: 85.5, r: 4 });
    label(g, 91, 96, echo, 'pin-name', 'middle', FIGURE.small);
    label(g, 44, 96, r && r.width != null ? (r.noEcho ? t('page.tour.inside.sonar.none', { time: f(r.width, 's') }) : `${f(r.width, 's')} → ${Math.round(r.means)} cm`) : '', 'note', 'middle', FIGURE.small);
    // Under a millivolt it is the solver's leakage, not a level.
    const v = (x) => f(Math.abs(x) < 1e-3 ? 0 : x, 'V');
    label(g, 50, 103, r ? [`${vcc} ${v(r.vcc)}`, `${trig} ${v(r.vtrig)}`, `${echo} ${v(r.vecho)}`].join(' · ') : '', 'note');
    label(g, 50, 114, r ? t(`page.tour.inside.sonar.${state}`) : '', 'state');
  },
};

// `reading()`, `t`, `f` as the tour has them; `look()`: the current layer's scale (bench.js); `now()`:
// the director's time (ms); `controls()`: the circuit's controls with their values now.
export function setupFigure(page, { reading, t, f, now, look, controls }) {
  let on = null; // { id, what: 'symbol' | 'inside', k, t0, ms }
  let placed = null; // { for, x, y, s, line }: where the figure is, in drawing units, since it came
  const layers = new WeakMap(); // under the part's copy, so a pin behind a body keeps its identifier hidden
  const memos = new Map(); // part → what its drawer keeps between readings

  // Where the figure goes, in drawing units. The part is measured on screen through the camera as it is
  // now, then laid out in the layout's screen (the frame the texts were set in, pinout.js), so a figure
  // asked for after a drag or a zoom lands where it would have; never against the pinout's rows (above
  // where they begin, lit or not), never past the free area's top.
  // `ids`: where the pins' letters under their tips reach on screen ([left, right]), part of what the
  // figure keeps clear of (letters spread apart can run past the part's own box).
  function place(wanted, data, screen, tips, w, h, ids) {
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
    if (ids) part = { ...part, left: Math.min(part.left, ids[0]), right: Math.max(part.right, ids[1]) };
    const slot = figureSlot(part, free, u, w, h);
    // Above the pinout's rows: under the tips, or higher where they begin higher (rows down both sides
    // of a part of many pins, pinout.js page.rowsTop).
    const rows = Math.min(Math.max(...tips.map((p) => p.y)) + PINOUT.gap * u, page.rowsTop ?? Infinity);
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
      p.at = Math.max(p.x, last + size * (0.6 * p.id.length + 0.8));
      last = p.at;
    }
    const reach = loose.length ? [Math.min(...loose.map((p) => p.at - size * 0.3 * p.id.length)), Math.max(...loose.map((p) => p.at + size * 0.3 * p.id.length))] : null;
    // Placed once, when it comes, and kept in the drawing's own units: beside the part as part of the
    // drawing, it moves and scales with the part whatever the camera does after (a drag, a zoom, a frame).
    const wanted = `${page.state.view}|${on.id}|${on.what}`;
    if (placed?.for !== wanted) placed = place(wanted, data, screen, tips, w, h, reach);
    const box = make(g, 'g', { class: on.what, transform: `translate(${placed.x} ${placed.y}) scale(${fixed(placed.s * 1000) / 1000})`, opacity: fixed(Math.min(1, on.k * 1.4)), 'data-figure': on.id });
    const line = placed.line;
    for (const p of loose) {
      const [tx, ty] = at(p.at, below);
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
    // `control(field)`: the part's control as it is now (a potentiometer's position, which its reading
    // does not carry).
    const id = on.id;
    const control = (field) => controls?.().find((c) => c.id === id && c.field === field)?.value;
    // `memo`: what a drawer keeps of the part from one reading to the next (a buzzer's last current).
    if (!memos.has(id)) memos.set(id, {});
    INSIDE[shape.kind]?.(box, reading()?.parts?.[on.id], shape, { t, f, look, control, memo: memos.get(id) });
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
