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

function resistor(names) {
  return { w: 100, h: 100, strokes: ['M50 4V24L62 29L38 39L62 49L38 59L62 69L50 74V96'], fills: [], texts: [], pins: { [names[0]]: [50, 4], [names[1]]: [50, 96] }, ids: { [names[0]]: names[0], [names[1]]: names[1] } };
}

function capacitor(names, polarised) {
  const lower = polarised ? 'M30 62Q50 52 70 62' : 'M30 56H70';
  const plus = polarised ? [{ x: 74, y: 36, text: '+', anchor: 'start' }] : [];
  return { w: 100, h: 100, strokes: ['M50 4V44', 'M30 44H70', lower, `M50 ${polarised ? 57 : 56}V96`], fills: [], texts: plus, pins: { [names[0]]: [50, 4], [names[1]]: [50, 96] }, ids: polarised ? { [names[0]]: '+', [names[1]]: '−' } : { [names[0]]: names[0], [names[1]]: names[1] } };
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

export function symbolOf(part) {
  const e = part.def?.electrical ?? {};
  const names = part.pinNames ?? [];
  if (part.type === 'bjt') return bjt(e.polarity === 'pnp');
  if (part.type === 'mosfet') return mosfet(e.channel === 'p');
  if (part.type === 'led') return diode(names, { light: true });
  if (part.type === 'diode') return diode(names);
  if (part.type === 'zener') return diode(names, { zener: true });
  if (part.type === 'resistor') return resistor(names);
  if (part.type === 'capacitor') return capacitor(names, e.polarised === true);
  if (part.type === 'ic') return block(names, part.raw?.part ?? '');
  return null;
}

// The teaching diagram a part's kind has (`inside`, page/client/inside.js draws it from the reading),
// or null (TOUR_NO_INSIDE).
export function insideOf(part) {
  const e = part.def?.electrical ?? {};
  if (part.type === 'bjt') return { kind: 'bjt', pnp: e.polarity === 'pnp' };
  if (part.type === 'mosfet') return { kind: 'mosfet', p: e.channel === 'p' };
  if (part.type === 'led') return { kind: 'led', color: LED_LIGHT[e.color] ?? LED_LIGHT.red };
  if (part.type === 'ic' && e.kind === 'TMR') return { kind: 'timer' };
  return null;
}
