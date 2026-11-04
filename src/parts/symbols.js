// Schematic symbols by kind of part (a video about one part, F4; docs/en/component-focus.md): the
// symbol a datasheet or a schematic draws for it, as data for the page, which only draws it beside
// the part on its pedestal and joins each terminal to the real pin (page/client/symbol.js).
//
//   symbolOf(part) → { w, h, strokes: [d], fills: [d], texts: [{ x, y, text, anchor }], pins: { name: [x, y] },
//                      ids: { name: 'B' } } or null
//
// `ids`: what the symbol calls each pin (a letter, a chip's number), written by the page at the real
// pin's tip, so the symbol and the part say which leg is which without a line between them.
//
// Units: a box `w` wide and `h` tall (100 for a part of two or three pins); strokes are SVG path data,
// drawn with the line's colour, fills filled with it; `pins` are the ends of the leads, by the part's
// own pin names. Only the kinds a first wave of videos needs; a part without one: null
// (TOUR_NO_SYMBOL).

import { LED_LIGHT } from './colors.js';
import { deviceFor } from '../sim/devices/index.js';

const arrow = (x1, y1, x2, y2, size = 9) => {
  // A filled head at (x2, y2) pointing from (x1, y1).
  const a = Math.atan2(y2 - y1, x2 - x1);
  const p = (da) => `${(x2 - size * Math.cos(a + da)).toFixed(1)} ${(y2 - size * Math.sin(a + da)).toFixed(1)}`;
  return `M${x2} ${y2}L${p(0.45)}L${p(-0.45)}Z`;
};

function bjt(pnp) {
  // Circle, base bar, collector up and emitter down on the right; the emitter's arrow out (NPN) or in (PNP).
  const head = pnp ? arrow(64, 73, 46, 63) : arrow(42, 61, 62, 72);
  return {
    w: 100, h: 100,
    strokes: ['M86 50A32 32 0 1 1 22 50A32 32 0 1 1 86 50Z', 'M6 50H40', 'M40 32V68', 'M40 41L66 27V4', 'M40 59L66 73V96'],
    fills: [head],
    texts: [{ x: 10, y: 44, text: 'B', anchor: 'start' }, { x: 74, y: 12, text: 'C', anchor: 'start' }, { x: 74, y: 94, text: 'E', anchor: 'start' }],
    pins: { B: [6, 50], C: [66, 4], E: [66, 96] },
    ids: { B: 'B', C: 'C', E: 'E' },
  };
}

function mosfet(p) {
  // Gate plate apart from a channel of three pieces; drain up, source down; the body's arrow in (N) or out (P).
  const head = p ? arrow(46, 50, 64, 50) : arrow(64, 50, 46, 50);
  return {
    w: 100, h: 100,
    strokes: ['M6 62H32', 'M32 30V70', 'M42 26V38', 'M42 44V56', 'M42 62V74', 'M42 32H66V4', 'M42 68H66V96', 'M42 50H66V68'],
    fills: [head],
    texts: [{ x: 10, y: 56, text: 'G', anchor: 'start' }, { x: 74, y: 12, text: 'D', anchor: 'start' }, { x: 74, y: 94, text: 'S', anchor: 'start' }],
    pins: { G: [6, 62], D: [66, 4], S: [66, 96] },
    ids: { G: 'G', D: 'D', S: 'S' },
  };
}

// A diode pointing down: anode at the top, cathode at the bottom.
function diode(names, { light = false, zener = false } = {}) {
  const bar = zener ? 'M32 70L36 64H64L68 58' : 'M32 64H68';
  const rays = light ? ['M74 40L90 30', 'M76 54L92 44'] : [];
  return {
    w: 100, h: 100,
    strokes: ['M50 4V34', 'M32 34H68L50 64Z', bar, 'M50 64V96', ...rays],
    fills: light ? [arrow(74, 40, 90, 30, 7), arrow(76, 54, 92, 44, 7)] : [],
    texts: [{ x: 58, y: 14, text: 'A', anchor: 'start' }, { x: 58, y: 92, text: 'K', anchor: 'start' }],
    pins: { [names[0]]: [50, 4], [names[1]]: [50, 96] },
    ids: { [names[0]]: 'A', [names[1]]: 'K' },
  };
}

// A two-lead symbol standing up: the first pin at the top, the second at the bottom; `ids` what the
// symbol calls them (their own names unless it says otherwise).
const upright = (names, strokes, { texts = [], ids = names } = {}) => ({ w: 100, h: 100, strokes, fills: [], texts, pins: { [names[0]]: [50, 4], [names[1]]: [50, 96] }, ids: { [names[0]]: ids[0], [names[1]]: ids[1] } });

const resistor = (names) => upright(names, ['M50 4V24L62 29L38 39L62 49L38 59L62 69L50 74V96']);

// A coil of four humps between its leads.
const inductor = (names) => upright(names, ['M50 4V22A7 7 0 0 1 50 36A7 7 0 0 1 50 50A7 7 0 0 1 50 64A7 7 0 0 1 50 78V96']);

function capacitor(names, polarised) {
  const lower = polarised ? 'M30 62Q50 52 70 62' : 'M30 56H70';
  const plus = polarised ? [{ x: 74, y: 36, text: '+', anchor: 'start' }] : [];
  return upright(names, ['M50 4V44', 'M30 44H70', lower, `M50 ${polarised ? 57 : 56}V96`], { texts: plus, ids: polarised ? ['+', '−'] : names });
}

// A chip as a block: pins 1… down the left side and the rest up the right one, as the package counts
// them; each pin's name inside, the part number above.
function block(names, title) {
  const half = Math.ceil(names.length / 2);
  const top = 16;
  const h = top + half * 18 + 14;
  const strokes = [`M18 ${top}H82V${h - 4}H18Z`];
  const texts = [{ x: 50, y: 10, text: title, anchor: 'middle', quiet: true }];
  const pins = {};
  const ids = {};
  names.forEach((name, i) => {
    const left = i < half;
    const y = top + 14 + 18 * (left ? i : names.length - 1 - i);
    strokes.push(left ? `M2 ${y}H18` : `M82 ${y}H98`);
    texts.push({ x: left ? 22 : 78, y: y + 3, text: name, anchor: left ? 'start' : 'end', small: true });
    // The pin's number on its lead, outside the block, as a datasheet prints it.
    texts.push({ x: left ? 10 : 90, y: y - 3, text: String(i + 1), anchor: 'middle', small: true, number: true });
    pins[name] = [left ? 2 : 98, y];
    ids[name] = String(i + 1);
  });
  return { w: 100, h, strokes, fills: [], texts, pins, ids };
}

// A bridge rectifier: four diodes on the sides of a diamond, all pointing up to +; the AC pins at the
// sides, + at the top, − at the bottom. `ids` tell the two AC pins apart (~1, ~2), as the pinout does.
function bridge() {
  const at = { '+': [50, 14], AC2: [86, 50], '-': [50, 86], AC1: [14, 50] };
  const strokes = ['M50 4V14', 'M50 86V96', 'M4 50H14', 'M86 50H96'];
  const r = (v) => Math.round(v * 10) / 10;
  for (const [a, k] of [['AC1', '+'], ['AC2', '+'], ['-', 'AC1'], ['-', 'AC2']]) {
    // Each diode in the middle of its side: the line to its triangle, the triangle, its bar, the line on.
    const [[ax, ay], [kx, ky]] = [at[a], at[k]];
    const len = Math.hypot(kx - ax, ky - ay);
    const [ux, uy] = [(kx - ax) / len, (ky - ay) / len];
    const [mx, my] = [(ax + kx) / 2, (ay + ky) / 2];
    const p = (along, across) => `${r(mx + ux * along - uy * across)} ${r(my + uy * along + ux * across)}`;
    strokes.push(`M${ax} ${ay}L${p(-6, 0)}`, `M${p(-6, 7)}L${p(-6, -7)}L${p(6, 0)}Z`, `M${p(6, 7)}L${p(6, -7)}`, `M${p(6, 0)}L${kx} ${ky}`);
  }
  return {
    w: 100, h: 100,
    strokes,
    fills: [],
    texts: [{ x: 58, y: 10, text: '+', anchor: 'start' }, { x: 58, y: 96, text: '−', anchor: 'start' }, { x: 6, y: 42, text: '~1', anchor: 'start', small: true }, { x: 94, y: 42, text: '~2', anchor: 'end', small: true }],
    pins: { '+': [50, 4], AC1: [4, 50], AC2: [96, 50], '-': [50, 96] },
    ids: { '+': '+', AC1: '~1', AC2: '~2', '-': '−' },
  };
}

export function symbolOf(part) {
  const e = part.def?.electrical ?? {};
  const names = part.pinNames ?? [];
  if (part.type === 'bjt') return bjt(e.polarity === 'pnp');
  if (part.type === 'mosfet') return mosfet(e.channel === 'p');
  if (part.type === 'led') return diode(names, { light: true });
  if (part.type === 'diode') return diode(names);
  if (part.type === 'zener') return diode(names, { zener: true });
  if (part.type === 'bridge') return bridge();
  if (part.type === 'resistor') return resistor(names);
  if (part.type === 'capacitor') return capacitor(names, e.polarised === true);
  if (part.type === 'inductor') return inductor(names);
  if (part.type === 'ic') return block(names, part.raw?.part ?? '');
  return null;
}

// The teaching diagram a part's kind has (`inside`, page/client/figure.js draws it from the reading),
// or null (TOUR_NO_INSIDE). A two-lead part's carries the symbol's letters for its pins (`ids`, in the
// part's order) and the limit the simulator holds it to (its device's params), so the drawing can show
// how near it is.
export function insideOf(part) {
  const e = part.def?.electrical ?? {};
  const ids = () => (part.pinNames ?? []).map((n) => symbolOf(part)?.ids[n] ?? n);
  // A device's params may note what it assumed (a diode's default model): nothing to note here.
  const limits = () => deviceFor(part)?.params(part, { issues: [] }) ?? {};
  if (part.type === 'resistor') return { kind: 'resistor', ids: ids(), maxPower: limits().maxPower };
  if (part.type === 'capacitor') return { kind: 'capacitor', ids: ids(), maxVoltage: limits().maxVoltage };
  if (part.type === 'inductor') return { kind: 'inductor', ids: ids(), maxCurrent: limits().maxCurrent, dcr: limits().dcr };
  if (part.type === 'bjt') return { kind: 'bjt', pnp: e.polarity === 'pnp' };
  if (part.type === 'mosfet') return { kind: 'mosfet', p: e.channel === 'p' };
  // A diode's and a Zener's junction, a bridge's four diodes: each with the current it is rated for (a
  // Zener also its power and its Vz, the voltage its depletion zone is drawn against).
  if (part.type === 'diode') return { kind: 'diode', ids: ids(), maxCurrent: limits().model?.maxCurrent };
  if (part.type === 'zener') return { kind: 'zener', ids: ids(), vz: limits().model?.vz, maxCurrent: limits().model?.maxCurrent, maxPower: limits().model?.maxPower };
  if (part.type === 'bridge') return { kind: 'bridge', ids: ids(), maxCurrent: limits().model?.maxCurrent };
  if (part.type === 'led') return { kind: 'led', color: LED_LIGHT[e.color] ?? LED_LIGHT.red };
  if (part.type === 'ic' && e.kind === 'TMR') return { kind: 'timer' };
  return null;
}
