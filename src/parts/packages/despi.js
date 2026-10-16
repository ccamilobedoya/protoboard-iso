// GooDisplay DESPI-C02 e-paper adapter lying on the table beside the board, behind it (side
// "back", default) or in front ("front"), its 8 right-angle male pins pointing at the board.
// The pins the circuit lists carry a Dupont lead each (the female housing slid onto the pin) to
// their hole. Top face as on the board: the pin names, the RESE switch (P3) set to 2.2 or 0.47,
// the test pads, the GooDisplay logo and the 24-contact FPC connector (P1) on the far edge.
// With `panel`, the GDEY075T7 7.5" panel lies beyond it, its FPC in P1.
//
// Positions are measured on the maintainer's board (revision 2025.09.26) in mm, in its own
// frame: `a` from the pin edge towards the FPC connector (41 mm), `b` across, from BUSY to
// 3.3V (22 mm). The board's components (charge pump) are underneath: it rests on them.
//
// params: names, colors, side, offset, module, rese ("2.2" | "0.47"), panel (boolean)

import { v3, add, scale, cross, X, Y, Z } from '../../core/vec.js';
import { box, rectDecal, circleDecal } from '../../geometry/primitives.js';
import { MATERIALS } from '../colors.js';
import { flat, dupontLead } from './offboard.js';

const GAP = 24; // mm between the board's edge and the adapter's pin edge (room for the leads)
const REST = 2; // its PCB bottom rests this high above the table, on the parts underneath
const PITCH = 2.54;
const PIN_OUT = 6; // the pins stick out this far beyond their plastic
const PLASTIC = 3; // the header's plastic, beyond the PCB edge
const PIN_Z = 1.3; // pin height above the PCB top

const GOLD = '#d4b24a';
const PIN_METAL = '#d9dce0';
const FPC_AMBER = '#c98a2b';
const PADS = [
  ['GDR', 28.1, 4.6],
  ['RESE', 25.3, 6.8],
  ['PREVGH', 25.8, 12.7],
  ['PREVGL', 22.8, 14.9],
  ['VCOM', 25.8, 16.9],
  ['GND', 22.8, 18.8],
];

// GDEY075T7: outline 170.2 × 111.2 × 1.25 mm, active area 163.2 × 97.92; the FPC leaves the
// middle of a long side, where the glass ledge with the driver chip (COG) is wider.
const PANEL = { length: 170.2, width: 111.2, thick: 1.25, active: [163.2, 97.92], ledge: 10.5, fpcWidth: 12, fpcGap: 18 };

export default {
  id: 'despi',
  pinCount: null, // the pins the circuit lists

  build({ pins, params, board }) {
    const [La, Wb, T] = params.module.size;
    const all = params.module.pins;
    const { width: W, height: H } = board.spec.size;
    const L = board.spec.size.length;
    const mean = pins.length ? pins.reduce((s, p) => s + p.x, 0) / pins.length : L / 2;
    const cx = Math.min(L - Wb / 2, Math.max(Wb / 2, mean)) + Number(params.offset ?? 0);
    const back = params.side !== 'front';
    const A = back ? Y : scale(Y, -1); // away from the board
    const B = cross(A, Z); // across, BUSY → 3.3V: left to right seen from the board
    const V = scale(B, -1); // a flat decal's second axis: (A, V) faces up
    const origin = v3(cx, back ? W + GAP : -GAP, 0);
    const zb = -H + REST;
    const zt = zb + T;
    const at = (a, b, z = zt) => add(add(add(origin, scale(A, a)), scale(B, b - Wb / 2)), v3(0, 0, z));
    const out = [];

    const pcb = box({ center: at(La / 2, Wb / 2, zb), u: A, size: [La, Wb, T], color: MATERIALS.pcbBlue, outline: true });
    out.push(pcb);
    const onPcb = (p) => {
      p.on = pcb;
      return p;
    };
    const decal = (d) => pcb.decals.push(d);
    const print = (text, a, b, size, anchor = 'middle', color = MATERIALS.pcbPrint) => decal(flat(text, at(a, b, zt + 0.01), A, size, color, anchor));
    const dot = (a, b, r, color) => decal(circleDecal({ center: at(a, b, zt + 0.01), u: A, v: V, radius: r, color }));

    // The 8 pins: their pads, names, the header's plastic beyond the edge and the pins themselves.
    const pinB = (k) => Wb / 2 + (k - (all.length - 1) / 2) * PITCH;
    const plastic = box({ center: at(-PLASTIC / 2, Wb / 2, zt + PIN_Z - 1.27), u: A, size: [PLASTIC, all.length * PITCH, 2.54], color: MATERIALS.headerBlack, outline: true });
    out.push(plastic);
    const where = new Map();
    all.forEach((name, k) => {
      const b = pinB(k);
      dot(2.3, b, 0.75, GOLD);
      print(name, 3.6, b, 1.15, 'start');
      where.set(name, at(-PLASTIC, b, zt + PIN_Z));
    });
    print('P2', 1.4, Wb - 0.6, 0.9);
    const leads = new Map(params.names.map((name, i) => [name, pins[i]]));
    for (const name of all) {
      if (leads.has(name)) continue;
      // A box's centre is the middle of its base: the pin runs from the plastic outwards.
      out.push(box({ center: at(-PLASTIC - PIN_OUT / 2, pinB(all.indexOf(name)), zt + PIN_Z - 0.32), u: A, size: [PIN_OUT, 0.64, 0.64], color: PIN_METAL }));
    }

    // RESE switch (P3): its body and the knob on the side it is set to.
    const knob = params.rese === '0.47' ? 20.7 : 17.7;
    const sw = onPcb(box({ center: at(19.2, 3.5), u: A, size: [7.1, 2.8, 1.4], color: MATERIALS.headerBlack, outline: true }));
    const k = box({ center: at(knob, 3.5, zt + 1.4), u: A, size: [1.3, 1.3, 1.0], color: '#f2f2f2', outline: true });
    k.on = sw;
    out.push(sw, k);
    print('2.2', 16.2, 1.1, 1.05);
    print('0.47', 22.6, 1.1, 1.05);
    print('RESE', 19.3, 0.9, 0.9);
    print('P3', 24.4, 3.6, 0.9);

    // Test pads, mounting holes, the logo and the names.
    for (const [name, a, b] of PADS) {
      dot(a, b, 1.1, '#173f73');
      dot(a, b, 0.8, GOLD);
      print(name, a + 1.5, b, 0.95, 'start');
    }
    dot(8.1, 1.6, 1.1, GOLD);
    dot(30.4, 19.6, 1.1, GOLD);
    decal(rectDecal({ center: at(15.8, 11.6, zt + 0.01), u: A, v: V, width: 7.8, height: 3.6, color: '#f2f2f2' }));
    decal(rectDecal({ center: at(15.8, 11.6, zt + 0.02), u: A, v: V, width: 5.6, height: 2.2, color: MATERIALS.pcbBlue }));
    decal(rectDecal({ center: at(15.8, 11.6, zt + 0.03), u: A, v: V, width: 3.6, height: 1.0, color: '#f2f2f2' }));
    print('GooDisplay', 16, 15.4, 2.0);
    print('DESPI-C02', 19.5, 20.6, 1.5);
    print('2025.09.26', 31.6, 20.8, 0.7);

    // The FPC connector (P1): its housing and its latch.
    const fpc = onPcb(box({ center: at(38, Wb / 2), u: A, size: [5.5, 19, 2.0], color: '#e9e3d3', outline: true }));
    fpc.decals.push(rectDecal({ center: at(36.6, Wb / 2, zt + 2.01), u: A, v: V, width: 1.4, height: 18, color: '#8b8a86' }));
    out.push(fpc);
    print('1', 34, 2.2, 1.0);
    print('24', 34, 19.6, 1.0);
    print('P1', 39.6, 21.2, 0.9);
    const body = [...out];

    // The panel on its FPC, beyond the connector.
    if (params.panel) {
      const near = La + PANEL.fpcGap; // the panel's FPC edge, in `a`
      const glass = box({ center: at(near + PANEL.width / 2, Wb / 2, -H), u: A, size: [PANEL.width, PANEL.length, PANEL.thick], color: '#e8e6e0', outline: true });
      const [aw, ah] = PANEL.active;
      const ztop = -H + PANEL.thick + 0.01;
      const activeA = near + PANEL.ledge + ah / 2;
      glass.decals.push(rectDecal({ center: at(activeA, Wb / 2, ztop), u: A, v: V, width: ah + 1.6, height: aw + 1.6, color: '#b9b8b2' }));
      glass.decals.push(rectDecal({ center: at(activeA, Wb / 2, ztop + 0.01), u: A, v: V, width: ah, height: aw, color: '#f3f2ee' }));
      glass.decals.push(rectDecal({ center: at(near + 3.5, Wb / 2, ztop), u: A, v: V, width: 1.2, height: 22, color: '#7d7c78' })); // the driver chip
      out.push(glass);
      // The FPC: from under the glass ledge, flat on the table, up into the connector.
      const from = at(near + 1, Wb / 2, -H + 0.2);
      const to = at(36.6, Wb / 2, zt + 1.0);
      const run = add(to, scale(from, -1));
      const len = Math.hypot(run.x, run.y, run.z);
      const u = scale(run, 1 / len);
      out.push(box({ center: add(from, scale(run, 0.5)), u, w: cross(u, B), size: [len, PANEL.fpcWidth, 0.15], color: FPC_AMBER }));
    }

    pins.forEach((hole, i) => {
      const name = params.names[i];
      const from = where.get(name);
      if (from) out.push(...dupontLead({ from, dir: scale(A, -1), hole, color: params.colors[name], on: plastic }));
    });
    return { primitives: out, body, anchor: at(La / 2, Wb / 2, zt + 2) };
  },
};
