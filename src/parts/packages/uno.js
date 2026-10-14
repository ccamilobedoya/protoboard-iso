// Arduino UNO lying on the table beside the board, behind it (side "back", default) or in
// front ("front"), USB on the left so its print reads in the front view. Only the pins the
// circuit lists are wired: a Dupont lead from each one's female header to its hole, with the
// black plastic housing at both ends.
//
// params: names (the listed pins, in order), colors (pin → wire colour), side, offset (mm
//         along the board), module (catalog entry: size, headers)
//
// Like the battery it needs the board (where its edges are), so build() takes it.

import { v3, add, scale, distance, X, Y, Z } from '../../core/vec.js';
import { box, rectDecal, textDecal, tube } from '../../geometry/primitives.js';
import { MATERIALS } from '../colors.js';
import { withZ } from './common.js';

const IN = 25.4;
const GAP = 10; // mm between the board edge and the UNO
const STANDOFF = 3; // the UNO rests on standoffs: its PCB bottom is this high above the table
const HEADER = 8.5; // female header height
const HOUSING = 9; // Dupont housing length

// Printed name of a pin: "13", "~3", "A0", "GND", "3.3V".
const PWM = new Set(['D3', 'D5', 'D6', 'D9', 'D10', 'D11']);
function printed(name) {
  if (/^GND\d?$/.test(name)) return 'GND';
  if (name === '3V3') return '3.3V';
  if (/^D\d+$/.test(name)) return (PWM.has(name) ? '~' : '') + name.slice(1);
  return name;
}

// Text lying on the PCB, reading left to right in the front view (turned round if needed, the
// anchor swapped so it still starts where it should).
function flat(text, at, right, size, color, anchor = 'middle') {
  const flip = right.x + right.y < 0;
  const r = flip ? scale(right, -1) : right;
  const side = flip ? { start: 'end', end: 'start', middle: 'middle' }[anchor] : anchor;
  return textDecal({ text, at, right: r, down: v3(r.y, -r.x, 0), size, color, weight: 700, anchor: side });
}

export default {
  id: 'uno',
  pinCount: null, // the pins the circuit lists

  build({ pins, params, board }) {
    const { size: [Lu, Wu, T], headers } = params.module;
    const { length: L, width: W, height: H } = board.spec.size;
    const mean = pins.length ? pins.reduce((s, p) => s + p.x, 0) / pins.length : L / 2;
    const cx = Math.min(L - Lu / 2, Math.max(Lu / 2, mean)) + Number(params.offset ?? 0);
    const x0 = cx - Lu / 2;
    const y0 = params.side === 'front' ? -GAP - Wu : W + GAP;
    const zb = -H + STANDOFF; // PCB bottom
    const zt = zb + T; // PCB top
    const on = (x, y, z = zt) => v3(x0 + x, y0 + y, z); // UNO coordinates in mm, USB on the left
    const out = [];

    const pcb = box({ center: on(Lu / 2, Wu / 2, zb), u: X, size: [Lu, Wu, T], color: MATERIALS.pcbBlue, outline: true });
    out.push(pcb);
    // What rests on the PCB is painted after it (see `on` in render/scene.js).
    const onPcb = (p) => {
      p.on = pcb;
      return p;
    };
    const print = (text, x, y, size, right = X, anchor = 'middle') => pcb.decals.push(flat(text, on(x, y, zt + 0.01), right, size, MATERIALS.pcbPrint, anchor));

    // Female headers, a dark square per contact, and the pin names printed beside them.
    const where = new Map();
    const stripOf = new Map();
    for (const h of headers) {
      const xs = h.pins.map(([, x]) => x * IN);
      const first = (h.first ?? h.pins[0][1]) * IN;
      const last = xs.at(-1);
      const y = h.y * IN;
      const strip = box({ center: on((first + last) / 2, y), u: X, size: [last - first + 2.54, 2.54, HEADER], color: MATERIALS.headerBlack, outline: true });
      for (let x = first; x <= last + 0.01; x += 2.54) strip.decals.push(rectDecal({ center: on(x, y, zt + HEADER + 0.01), u: X, v: Y, width: 1.0, height: 1.0, color: '#050506' }));
      out.push(onPcb(strip));
      for (const [name] of h.pins) stripOf.set(name, strip);
      const inward = h.y > 1 ? -1 : 1; // labels run from the header towards the middle of the board
      for (const [name, x] of h.pins) {
        where.set(name, on(x * IN, y, zt + HEADER));
        print(printed(name), x * IN, y + inward * 2.1, 1.05, scale(Y, inward), 'start');
      }
    }
    print('DIGITAL (PWM ~)', 1.9 * IN, 2.0 * IN - 9.5, 1.5);
    print('POWER', 1.45 * IN, 0.1 * IN + 9, 1.5);
    print('ANALOG IN', 2.25 * IN, 0.1 * IN + 9, 1.5);
    print('UNO', 52, 31, 6.5);

    // Connectors and the main parts, from the reference layout.
    out.push(onPcb(box({ center: on(1.8, 38.1), u: X, size: [16, 12, 10.9], color: MATERIALS.shield, outline: true }))); // USB-B
    out.push(onPcb(box({ center: on(5.3, 7.6), u: X, size: [14.2, 9, 11], color: MATERIALS.headerBlack, outline: true }))); // DC jack
    const mcu = box({ center: on(42, 23), u: X, size: [7, 7, 1.0], color: MATERIALS.chip, outline: true });
    mcu.decals.push(flat('ATMEGA328P', on(42, 23, zt + 1.01), X, 0.7, MATERIALS.print));
    const usbChip = box({ center: on(24, 37), u: X, size: [10, 4, 1.6], color: MATERIALS.chip, outline: true });
    usbChip.decals.push(flat('CH340G', on(24, 37, zt + 1.61), X, 1.1, MATERIALS.print));
    out.push(onPcb(mcu), onPcb(usbChip));
    out.push(onPcb(box({ center: on(44, 12), u: X, size: [11, 4.6, 3.5], color: MATERIALS.crystal, outline: true })));
    const reset = onPcb(box({ center: on(6, 49), u: X, size: [6, 6, 1.2], color: MATERIALS.shield, outline: true }));
    const cap = box({ center: on(6, 49, zt + 1.2), u: X, size: [3.2, 3.2, 1.5], color: MATERIALS.resetRed, outline: true });
    cap.on = reset;
    out.push(reset, cap);
    const body = [...out];

    // Dupont leads: housing on the header, an arc, housing on the hole.
    const colors = params.colors ?? {};
    pins.forEach((hole, i) => {
      const name = params.names[i];
      const start = where.get(name);
      if (!start) return;
      const color = colors[name];
      const a = withZ(start, start.z + HOUSING);
      const b = withZ(hole, HOUSING);
      const housing = box({ center: start, u: X, size: [2.4, 2.4, HOUSING], color: MATERIALS.headerBlack, outline: true });
      housing.on = stripOf.get(name);
      out.push(housing);
      // Pushed all the way in: the housing rests on the board, centred on its hole (lifted, the
      // isometric view would show it shifted back from the hole).
      out.push(box({ center: withZ(hole, 0), u: X, size: [2.4, 2.4, HOUSING], color: MATERIALS.headerBlack, outline: true }));
      const h = 6 + distance(a, b) * 0.22;
      const pts = [];
      for (let k = 0; k <= 20; k++) {
        const t = k / 20;
        const c0 = (1 - t) ** 3;
        const c1 = 3 * (1 - t) ** 2 * t;
        const c2 = 3 * (1 - t) * t * t;
        const c3 = t ** 3;
        const p1 = add(a, scale(Z, h));
        const p2 = add(b, scale(Z, h));
        pts.push(v3(c0 * a.x + c1 * p1.x + c2 * p2.x + c3 * b.x, c0 * a.y + c1 * p1.y + c2 * p2.y + c3 * b.y, c0 * a.z + c1 * p1.z + c2 * p2.z + c3 * b.z));
      }
      out.push(...tube({ points: pts, radius: 0.65, color, segments: 8, caps: 'ends' }));
    });
    return { primitives: out, body, anchor: on(Lu / 2, Wu / 2, zt + 2) };
  },
};
