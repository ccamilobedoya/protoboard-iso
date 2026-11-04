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

const ZIGZAG = 'M50 4V24L62 29L38 39L62 49L38 59L62 69L50 74V96';
const resistor = (names) => upright(names, [ZIGZAG]);

// A sensor that is a resistor: the zigzag with what it senses. An NTC thermistor's (IEC 60617) is the
// diagonal line through it with a short foot, "−t°" beside it (its resistance falls as it warms); a
// photoresistor's, two arrows of light coming in.
const thermistor = (names) => upright(names, [ZIGZAG, 'M26 80H34L74 22'], { texts: [{ x: 76, y: 34, text: '−t°', anchor: 'start', small: true }] });
function ldr(names) {
  const s = upright(names, [ZIGZAG, 'M92 22L72 34', 'M94 42L74 54']);
  s.fills = [arrow(92, 22, 70, 35, 7), arrow(94, 42, 72, 55, 7)];
  return s;
}

// A potentiometer: the zigzag between pins 1 (top) and 3 (bottom), the wiper's arrow coming in from
// the right onto its middle.
function potentiometer() {
  return {
    w: 100, h: 100,
    strokes: [ZIGZAG, 'M96 50H70'],
    fills: [arrow(96, 50, 64, 50)],
    texts: [{ x: 58, y: 14, text: '1', anchor: 'start' }, { x: 58, y: 92, text: '3', anchor: 'start' }, { x: 88, y: 44, text: 'W', anchor: 'middle' }],
    pins: { 1: [50, 4], W: [96, 50], 3: [50, 96] },
    ids: { 1: '1', W: 'W', 3: '3' },
  };
}

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

// A small circle (a contact) as a path, for the strokes.
const ring = (x, y, r = 2.5) => `M${x + r} ${y}A${r} ${r} 0 1 1 ${x - r} ${y}A${r} ${r} 0 1 1 ${x + r} ${y}Z`;

// A tactile push button (IEC 60617, normally open): 1–2 down the left and 3–4 down the right, each pair
// one piece of metal with a dot where its contact leaves it; the bar held over both contacts by its
// plunger, which pressed joins the two pieces.
function button() {
  return {
    w: 100, h: 100,
    strokes: ['M14 4V96', 'M86 4V96', 'M14 62H34', 'M86 62H66', ring(36.5, 62), ring(63.5, 62), 'M28 48H72', 'M50 48V20', 'M40 20H60'],
    fills: [ring(14, 62, 2.6), ring(86, 62, 2.6)],
    texts: [{ x: 20, y: 14, text: '1', anchor: 'start' }, { x: 20, y: 92, text: '2', anchor: 'start' }, { x: 80, y: 14, text: '3', anchor: 'end' }, { x: 80, y: 92, text: '4', anchor: 'end' }],
    pins: { 1: [14, 4], 2: [14, 96], 3: [86, 4], 4: [86, 96] },
    ids: { 1: '1', 2: '2', 3: '3', 4: '4' },
  };
}

// Only the pins a switch's circuit lists are its part's (the others are left unwired on the table): the
// symbol draws the whole switch, its terminals and letters for those.
const listed = (s, names) => ({ ...s, pins: Object.fromEntries(names.map((n) => [n, s.pins[n]])), ids: Object.fromEntries(names.map((n) => [n, n])) });

// A rocker (SPST): tab 1 at the top, tab 2 at the bottom, the blade from 2 lifted off 1's contact, as a
// schematic draws it (open); its letters are the tabs' numbers.
const rocker = (names) => listed({ w: 100, h: 100, strokes: ['M50 4V34', ring(50, 36.5), 'M50 96V66', 'M50 66L30 40'], fills: [ring(50, 66, 2.6)], texts: [{ x: 58, y: 14, text: '1', anchor: 'start' }, { x: 58, y: 92, text: '2', anchor: 'start' }], pins: { 1: [50, 4], 2: [50, 96] } }, names);

// A latching button (DPDT): a changeover per row, its common on the left and its blade on NC (released,
// as a schematic draws it), NO under it; both blades on one dashed link to the push at the top.
function latching(names) {
  // The push at the top and the link, dashed, from it down through both blades.
  const strokes = ['M40 6H60', 'M50 6V9'];
  for (let d = 12; d < 72; d += 6) strokes.push(`M50 ${d}V${d + 3}`);
  const texts = [];
  const pins = {};
  for (const [row, y] of [[1, 34], [2, 78]]) {
    strokes.push(`M6 ${y}H30`, ring(30, y, 2.2), `M30 ${y}L66 ${y - 11}`, `M70 ${y - 12}H94`, `M70 ${y + 12}H94`, ring(68, y - 12, 2.2), ring(68, y + 12, 2.2));
    texts.push({ x: 6, y: y - 5, text: `C${row}`, anchor: 'start', small: true }, { x: 94, y: y - 15, text: `NC${row}`, anchor: 'end', small: true }, { x: 94, y: y + 9, text: `NO${row}`, anchor: 'end', small: true });
    Object.assign(pins, { [`C${row}`]: [6, y], [`NC${row}`]: [94, y - 12], [`NO${row}`]: [94, y + 12] });
  }
  return listed({ w: 100, h: 100, strokes, fills: [], texts, pins }, names);
}

// A linear regulator (IEC 60617 draws a box with its terminals): IN on the left, OUT on the right and
// the common (GND, or an LM317's ADJ) under it; the part number above. A module's printed names are
// its letters (VIN for IN).
function regulator(names, title, printed) {
  const ref = names.includes('ADJ') ? 'ADJ' : 'GND';
  const id = (n) => (printed && n === 'IN' ? 'VIN' : n);
  return {
    w: 100, h: 100,
    strokes: ['M24 30H76V70H24Z', 'M4 50H24', 'M76 50H96', 'M50 70V96'],
    fills: [],
    texts: [{ x: 50, y: 22, text: title, anchor: 'middle', quiet: true }, { x: 28, y: 53, text: id('IN'), anchor: 'start', small: true }, { x: 72, y: 53, text: 'OUT', anchor: 'end', small: true }, { x: 50, y: 66, text: ref, anchor: 'middle', small: true }],
    pins: { IN: [4, 50], OUT: [96, 50], [ref]: [50, 96] },
    ids: { IN: id('IN'), OUT: 'OUT', [ref]: ref },
  };
}

// A battery: its cells in series, + at the top; each cell a long plate (+) over a short thick one (−),
// as a schematic draws it, one pair per cell up to four (more: the first two and the last, a dashed
// line between).
function battery(series) {
  const n = Math.max(1, series);
  const drawn = n > 4 ? 3 : n;
  const pitch = 14;
  const top = Math.round(50 - (drawn * pitch + (n > 4 ? 8 : 0)) / 2);
  const strokes = [`M50 4V${top + 3}`];
  const fills = [];
  let y = top;
  for (let k = 0; k < drawn; k++) {
    strokes.push(`M30 ${y + 3}H70`);
    fills.push(`M40 ${y + 8}H60V${y + 11}H40Z`);
    // Between two cells, the lead from one's − to the next one's +; dashed where cells are left out.
    if (k < drawn - 1 && n > 4 && k === 1) {
      strokes.push(`M50 ${y + 11}V${y + 13}`, `M50 ${y + 16}V${y + 18}`, `M50 ${y + 21}V${y + pitch + 11}`);
      y += 8;
    } else if (k < drawn - 1) strokes.push(`M50 ${y + 11}V${y + pitch + 3}`);
    y += pitch;
  }
  strokes.push(`M50 ${y - pitch + 11}V96`);
  return {
    w: 100, h: 100,
    strokes,
    fills,
    texts: [{ x: 74, y: top + 6, text: '+', anchor: 'start' }, { x: 64, y: y - pitch + 14, text: '−', anchor: 'start' }, ...(n > 4 ? [{ x: 26, y: 54, text: `${n}×`, anchor: 'end', small: true, quiet: true }] : [])],
    pins: { '+': [50, 4], '-': [50, 96] },
    ids: { '+': '+', '-': '−' },
  };
}

// A buzzer (IEC 60617: a dome on a flat base), its two leads down from the base; + by pin 1, the side
// its top is marked.
const buzzer = () => ({
  w: 100, h: 100,
  strokes: ['M22 58A28 28 0 0 1 78 58Z', 'M36 58V96', 'M64 58V96'],
  fills: [],
  texts: [{ x: 30, y: 82, text: '+', anchor: 'end' }],
  pins: { 1: [36, 96], 2: [64, 96] },
  ids: { 1: '+', 2: '−' },
});

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
  if (part.type === 'thermistor') return thermistor(names);
  if (part.type === 'ldr') return ldr(names);
  if (part.type === 'potentiometer') return potentiometer();
  if (part.type === 'button') return button();
  if (part.type === 'switch') return e.style === 'latching' ? latching(names) : rocker(names);
  if (part.type === 'regulator') return regulator(names, e.part ?? part.raw?.part ?? '', Boolean(e.family));
  if (part.type === 'battery') return battery(e.series ?? e.cells ?? 1);
  if (part.type === 'buzzer') return buzzer();
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
  // A sensor's inside view reads what it senses from the reading (`sensor`); a potentiometer's wiper
  // from its position control, this the position in the circuit file until one moves it.
  if (part.type === 'thermistor') return { kind: 'thermistor', ids: ids(), r25: e.sensor?.r25, beta: e.sensor?.beta, temperature: e.sensor?.temperature };
  if (part.type === 'ldr') return { kind: 'ldr', ids: ids(), light: e.sensor?.light };
  if (part.type === 'potentiometer') return { kind: 'potentiometer', ids: ids(), resistance: e.resistance, position: e.position };
  // A push button's two pieces and the contact pressing joins (its device's, 1 and 3); a switch's
  // contacts, the ones its position closes, with the pins its circuit lists. Pressed or on from the
  // circuit file until its control moves it.
  if (part.type === 'button') return { kind: 'button', ids: ids(), contact: limits().contact, pressed: e.pressed === true };
  if (part.type === 'switch') {
    const { style, on, onContacts, offContacts } = limits();
    return { kind: 'switch', style, ids: ids(), on, onContacts, offContacts };
  }
  // A regulator's pass transistor and error amplifier, against its dropout and its limits (its device's
  // model); an LM317's reference sits between OUT and ADJ, so its divider is outside it.
  if (part.type === 'regulator') {
    const { model = {}, ref } = limits();
    return { kind: 'regulator', ids: ['IN', 'OUT', ref].map((n) => symbolOf(part).ids[n]), adjustable: ref === 'ADJ', vref: model.vref, dropout: model.dropout, maxCurrent: model.maxCurrent, maxPower: model.maxPower };
  }
  // A battery's cells and chemistry, its internal resistance and the current it is meant for (the
  // simulator's own figures: its supply has no device params).
  if (part.type === 'battery') return { kind: 'battery', ids: ids(), chemistry: e.chemistry, series: e.series ?? e.cells, resistance: e.resistance, maxCurrent: e.maxCurrent, rechargeable: e.rechargeable === true, charge: e.charge ?? null };
  // A buzzer's coil (a resistor to the simulator) and the current its rating allows (P = I²R).
  if (part.type === 'buzzer') {
    const { resistance, maxPower } = limits();
    return { kind: 'buzzer', ids: ids(), resistance, maxCurrent: resistance > 0 ? Math.sqrt(maxPower / resistance) : null };
  }
  if (part.type === 'led') return { kind: 'led', color: LED_LIGHT[e.color] ?? LED_LIGHT.red };
  if (part.type === 'ic' && e.kind === 'TMR') return { kind: 'timer' };
  return null;
}
