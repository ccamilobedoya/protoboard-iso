// Parts that move something, lying on the table beside the board (they do not fit its holes).
//
//   relay-srd   SRD-05VDC-SL-C relay (Songle SRD datasheet, dimension and drilling): a case 19.1 ×
//               15.5 × 15.3 mm max, its five pins 5 mm long; seen from the pins, COM 1.4 mm from one
//               end, the coil's two pins 2 mm further on and 12 mm apart, NO and NC 12.2 mm on from
//               them, 12 mm apart too: no pin on the 2.54 mm grid. It lies on its side, its pins
//               toward the board, a lead soldered to each pin in use under a sleeve, the lead's other
//               end a Dupont pin in its hole (as the 7 × 7 latching button, switch.js).
//   motor-140   Mabuchi RE-140RA (its datasheet's drawing): a round steel can Ø21 mm, 25 mm long with
//               its end cap, a Ø6.15 mm boss and a Ø2 mm shaft 10 mm out at the front; two terminals
//               at the back, 15.5 mm apart, (+) and (−) printed beside them. It lies on the table
//               beside one edge of the board like a battery (battery.js), its terminals toward the
//               board, a red lead from (+) and a black one from (−) into two holes. A white pulley on
//               its shaft carries a dark notch, drawn at each of eight angles (`pose`: 'a0' … 'a7'),
//               only the first shown: the live page shows the one its reading's angle has, so the
//               shaft turns at its speed (page/client/live.js).
//
// mark (src/pinout.js): the relay's coil is the two pins beside COM (`coil`, no polarity: no diode
// inside); the motor's red lead by its (+) terminal (`lead`, as a battery's).
//
// params: relay as a switch beside the board (names, colors, side, offset); motor: side, offset.

import { v3, add, scale, cross, normalize, Z } from '../../core/vec.js';
import { box, lathe, textDecal } from '../../geometry/primitives.js';
import { MATERIALS, WIRE_COLORS } from '../colors.js';
import { withZ } from './common.js';
import { placement as besideBoard, slab, leads } from './switch.js';
import { placement as besideEdge, cable } from './battery.js';

// SRD (mm): the case along the board, high and deep (away from the board); its pins' length; where
// each pin is on the pin face (x along the board from the case's middle, z from its middle height).
const CASE = [19.1, 15.5, 15.3];
const PIN = 5;
const SRD_PINS = { COM: [-8.15, 0], A1: [-6.15, 6], A2: [-6.15, -6], NC: [8.05, 6], NO: [8.05, -6] };

export const relay = {
  id: 'relay-srd',
  pinCount: null, // the pins the circuit lists

  build({ pins, params, board }) {
    const { at, away, toward, table } = besideBoard(pins, params, board);
    const zc = table + CASE[1] / 2;
    const FACE = 20 + PIN; // the pin face, mm from the board's edge
    const body = slab(at, away, FACE, FACE + CASE[2], 0, zc - CASE[1] / 2, CASE[0], CASE[1], MATERIALS.relayCase);
    // Its part number on the top, reading from the side it is seen from.
    const top = at(FACE + CASE[2] / 2, 0, table + CASE[1] + 0.01);
    const right = normalize(cross(away, Z));
    const flip = right.x + right.y < 0 ? -1 : 1;
    body.decals.push(textDecal({ text: 'SRD-05VDC-SL-C', at: top, right: scale(right, flip), down: scale(away, flip), size: 1.7, color: MATERIALS.relayPrint, weight: 700 }));
    body.decals.push(textDecal({ text: '10A 30VDC', at: add(top, scale(away, flip * 3)), right: scale(right, flip), down: scale(away, flip), size: 1.4, color: MATERIALS.relayPrint }));
    const pinBoxes = Object.entries(SRD_PINS).map(([name, [x, z]]) => slab(at, away, FACE - PIN, FACE, x, zc + z, name.startsWith('A') ? 0.6 : 1, name.startsWith('A') ? 0.6 : 0.4, MATERIALS.tinned, false));
    const contactOf = (name) => {
      const p = SRD_PINS[name];
      return p ? { x: p[0], z: zc + p[1], tip: at(FACE - PIN + 0.5, p[0], zc + p[1]) } : null;
    };
    // A heat-shrink sleeve over the pin's tip and the lead soldered to it, in the wire's colour.
    const sleeve = (c, color) => ({ primitives: [slab(at, away, FACE - PIN - 3.5, FACE - PIN + 1.5, c.x, c.z - 0.9, 1.8, 1.8, color ?? MATERIALS.clipBoot)], start: at(FACE - PIN - 3.5, c.x, c.z) });
    const inside = at(FACE + CASE[2] / 2, 0, zc);
    const wired = leads(pins, params, contactOf, sleeve, toward, inside);
    const anchor = at(FACE + CASE[2] / 2, 0, table + CASE[1]);
    return { primitives: [body, ...pinBoxes, ...wired.primitives], body: [body], anchor, paths: wired.paths, mark: { kind: 'coil', at: anchor } };
  },
};

// RE-140RA (mm): the can's radius and length (with its end cap), the boss, the shaft, the terminals'
// distance across the back and how far they stand out; the pulley a kit's motor often comes with.
const CAN = { radius: 10.5, length: 25, cap: 2 };
const BOSS = { radius: 3.075, length: 1.7 };
const SHAFT = { radius: 1, length: 10 };
const TERMINALS = { apart: 15.5, out: 2 };
const PULLEY = { radius: 4, length: 3, from: 5 };
export const MOTOR_POSES = 8;

export const motor = {
  id: 'motor-140',
  pinCount: 2,
  span: () => ({ min: 2.4, max: 400 }),

  build({ pins: [plus, minus], params, board }) {
    const dims = [CAN.length + TERMINALS.out, 2 * CAN.radius, 2 * CAN.radius];
    const { centre, u: toBoard, v: across, gap } = besideEdge(board, [plus, minus], params, dims);
    const u = normalize(toBoard);
    // The (+) terminal on the side of the + hole, so the leads never cross.
    const v = (plus.x - minus.x) * across.x + (plus.y - minus.y) * across.y >= 0 ? across : scale(across, -1);
    const axisZ = centre.z + CAN.radius;
    const back = add(withZ(centre, axisZ), scale(u, dims[0] / 2 - TERMINALS.out)); // the end cap's face
    const front = add(back, scale(u, -CAN.length));
    const away = scale(u, -1);
    // The can in three slices along its length (the painter sorts whole pieces: one long can would be
    // painted over the leads at its back), the end cap, the boss and the shaft.
    const R = CAN.radius;
    const out = [];
    // Rounded only where the can ends (its front), so the cuts between slices do not show.
    const slice = (h0, h1, color) => lathe({ profile: [[0, h0], [R, h0], ...(h1 >= CAN.length ? [[R, h1 - 0.6], [R - 0.6, h1]] : [[R, h1]]), [0, h1]], origin: back, axis: away, ref: Z, segments: 24, color });
    out.push(lathe({ profile: [[0, 0], [8, 0], [8, CAN.cap], [0, CAN.cap]], origin: back, axis: away, ref: Z, segments: 20, color: MATERIALS.motorCap }));
    for (const [h0, h1] of [[CAN.cap, 9], [9, 17], [17, CAN.length]]) out.push(slice(h0, h1, MATERIALS.motorCan));
    out.push(lathe({ profile: [[0, 0], [BOSS.radius, 0], [BOSS.radius, BOSS.length], [0, BOSS.length]], origin: front, axis: away, ref: Z, segments: 14, color: MATERIALS.motorCan }));
    out.push(lathe({ profile: [[0, 0], [SHAFT.radius, 0], [SHAFT.radius, SHAFT.length], [0, SHAFT.length]], origin: front, axis: away, ref: Z, segments: 10, color: MATERIALS.nickel }));
    const pulleyAt = add(front, scale(away, PULLEY.from));
    out.push(lathe({ profile: [[0, 0], [PULLEY.radius, 0], [PULLEY.radius, PULLEY.length], [0, PULLEY.length]], origin: pulleyAt, axis: away, ref: Z, segments: 18, color: MATERIALS.motorPulley }));
    // The notch on the pulley's face, at each of its angles; the live page shows the one it has.
    const face = add(pulleyAt, scale(away, PULLEY.length));
    const notches = Array.from({ length: MOTOR_POSES }, (_, k) => {
      const a = (k / MOTOR_POSES) * 2 * Math.PI;
      const radial = add(scale(Z, Math.cos(a)), scale(v, Math.sin(a)));
      const n = box({ center: add(face, scale(radial, PULLEY.radius * 0.55)), u: radial, w: away, size: [2.6, 1.1, 0.4], color: MATERIALS.motorNotch, outline: false });
      n.pose = `a${k}`;
      n.hidden = k !== 0;
      return n;
    });
    // The terminals, the (+) and (−) printed by them on the cap, and the leads to the holes.
    const terminal = (k) => add(back, scale(v, (k * TERMINALS.apart) / 2));
    const tabs = [1, -1].map((k) => box({ center: terminal(k), u: v, w: u, size: [2.9, 0.4, TERMINALS.out], color: MATERIALS.tinned, outline: false }));
    const print = (text, k) => textDecal({ text, at: add(add(back, scale(v, k * 4.5)), scale(u, 0.02)), right: scale(v, -1), down: scale(Z, -1), size: 3, color: MATERIALS.motorNotch, weight: 700 });
    out[0].decals.push(print('+', 1), print('−', -1));
    const exit = (k) => add(terminal(k), scale(u, TERMINALS.out));
    const red = cable(exit(1), plus, u, WIRE_COLORS.red, gap);
    const black = cable(exit(-1), minus, u, WIRE_COLORS.black, gap);
    // Inside, current goes round the armature: both leads meet in the middle of the can.
    const inside = add(back, scale(away, CAN.length / 2));
    const paths = [red.path, black.path].map((path) => ({ points: [...path, inside], body: path.length - 1 }));
    const anchor = v3(inside.x, inside.y, centre.z + 2 * R);
    return { primitives: [...out, ...notches, ...tabs, ...red.primitives, ...black.primitives], body: out, anchor, paths, mark: { kind: 'lead', at: withZ(plus, 0) } };
  },
};
