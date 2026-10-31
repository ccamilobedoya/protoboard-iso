// Development board that straddles the centre channel on its male headers, like a very wide
// DIP chip: an ESP32 DevKit or an ESP32-C3 SuperMini. The black plastic of the headers rests
// on the board and the PCB sits on top, so the holes under it can no longer be reached.
//
// Placement: "pin1" (e.g. "e10"), as for a DIP. Pins count along one row from pin 1, then back
// along the other row, `rowSpacing` holes away across the channel (or, on a double board, the
// joint between the two boards). With the other row behind pin 1 (pin 1 in rows a–e) the board
// reads from the front, pin-1 end on the left; with it in front it is turned round.
//
// params: count (pins), rowSpacing (holes between the two rows), size ([along, across, PCB
//         thickness] mm), look ('devkit' | 'supermini'), labels (printed pin names, in pin order),
//         labelSide ('in' | 'out': where the names are printed, towards the middle or the edge)

import { add, sub, scale, normalize, length, dot, cross, Z } from '../../core/vec.js';
import { box, rectDecal, circleDecal, textDecal } from '../../geometry/primitives.js';
import { MATERIALS } from '../colors.js';
import { withZ } from './common.js';

const P = 2.54;
const HEADER = 2.5; // plastic strip of the male headers, between the board and the PCB

// Hole names for every pin, from pin 1, or null when the board does not fit there. The other
// row is `rowSpacing` holes behind pin 1's row (the board reads from the front, pin-1 end on the
// left) or, when there is no row of another strip there, in front of it (turned round). On a
// double board that is how a DevKit straddles the joint: pin 1 in row j, the other row in p.
export function devboardHoles(board, pin1, { count, rowSpacing }) {
  const hole = board.find(String(pin1));
  if (!hole || hole.kind !== 'main') return null;
  const { rows, strips, columns } = board.spec;
  const row = rows.find((r) => r.id === hole.row);
  const stripOf = (r) => strips.find((s) => s.rows.includes(r.id));
  // The other row must be on another strip (across the channel or the joint).
  const across = (dy) => rows.find((r) => r.y === row.y + dy && stripOf(r) !== stripOf(row));
  const behind = across(-rowSpacing);
  const other = behind ?? across(rowSpacing);
  if (!other) return null;
  const step = behind ? 1 : -1;
  const half = count / 2;
  const last = hole.col + step * (half - 1);
  if (last < 1 || last > columns) return null;
  const names = [];
  for (let i = 0; i < half; i++) names.push(`${row.id}${hole.col + step * i}`);
  for (let i = half - 1; i >= 0; i--) names.push(`${other.id}${hole.col + step * i}`);
  return names;
}

// Text lying on the PCB, reading left to right in the front view.
function flat(text, at, along, size, color, anchor = 'middle') {
  const flip = dot(along, { x: 1, y: 1, z: 0 }) < 0;
  const right = flip ? scale(along, -1) : along;
  const side = flip ? { start: 'end', end: 'start', middle: 'middle' }[anchor] : anchor;
  return textDecal({ text, at, right, down: cross(right, Z), size, color, weight: 700, anchor: side });
}

export default {
  id: 'devboard',
  pinCount: null, // from params.count

  expandPin1(board, pin1, params) {
    return devboardHoles(board, pin1, params);
  },

  // The rows pin 1 can go in with this row spacing, for the error message.
  pin1Help(board, params) {
    const rows = board.spec.rows.filter((r) => [...Array(board.spec.columns).keys()].some((c) => devboardHoles(board, `${r.id}${c + 1}`, params)));
    return { code: 'BAD_PIN1_MODULE', params: { spacing: params.rowSpacing, rows: rows.map((r) => r.id).sort().join(', ') } };
  },

  footprints(board, params) {
    const out = [];
    for (let c = 1; c <= board.spec.columns; c++) {
      for (const row of board.spec.rows) {
        const holes = devboardHoles(board, `${row.id}${c}`, params);
        if (holes) out.push(holes);
      }
    }
    return out;
  },

  validate(pos, part) {
    const n = pos.length;
    const half = n / 2;
    const spacing = part.def.params.rowSpacing * P;
    const along = sub(pos[1], pos[0]);
    const across = sub(pos[n - 1], pos[0]);
    let ok = Math.abs(length(along) - P) < 0.05 && Math.abs(length(across) - spacing) < 0.05 && Math.abs(dot(normalize(along), normalize(across))) < 0.01;
    for (let i = 0; ok && i < half; i++) {
      ok = length(sub(pos[i], add(pos[0], scale(along, i)))) < 0.05 && length(sub(pos[n - 1 - i], add(pos[i], across))) < 0.05;
    }
    return ok ? [] : [{ severity: 'warning', code: 'MODULE_SHAPE', params: { part: part.id, spacing: part.def.params.rowSpacing } }];
  },

  build({ pins, params }) {
    const n = pins.length;
    const half = n / 2;
    const [L, W, T] = params.size;
    const u = normalize(withZ(sub(pins[half - 1], pins[0]), 0)); // from the pin-1 end along the rows
    const v = normalize(withZ(sub(pins[n - 1], pins[0]), 0)); // from row 1 to row 2
    const centre = withZ(scale(pins.reduce((s, p) => add(s, p), { x: 0, y: 0, z: 0 }), 1 / n), 0);
    const at = (a, b, z = 0) => add(add(add(centre, scale(u, a)), scale(v, b)), scale(Z, z));
    const top = HEADER + T;
    const out = [];

    // Header strips on the board, then the PCB on them.
    const gap = (params.rowSpacing * P) / 2;
    const strips = [-1, 1].map((side) => box({ center: at(0, side * gap), u, size: [half * P, 2.5, HEADER], color: MATERIALS.headerBlack, outline: true }));
    const pcb = box({ center: at(0, 0, HEADER), u, size: [L, W, T], color: MATERIALS.pcbBlack, outline: true });
    pcb.on = strips;
    out.push(...strips, pcb);

    // Solder pads over each pin and the printed pin names, pointing inwards from their pin.
    const labels = params.labels ?? [];
    // One size for every name on the board; printed towards the edge they must fit before it.
    const longest = Math.max(1, ...labels.map((t) => t.length));
    const size = params.labelSide === 'out' ? Math.min(1.1, (W / 2 - (params.rowSpacing * P) / 2 - 1.1) / (longest * 0.58)) : Math.min(1.1, P * 0.42);
    pins.forEach((p, i) => {
      const side = i < half ? -1 : 1;
      const a = dot(sub(withZ(p, 0), centre), u);
      pcb.decals.push(circleDecal({ center: at(a, side * gap, top + 0.01), u, v: cross(Z, u), radius: 0.75, color: MATERIALS.tinned }));
      if (labels[i]) {
        // Reads along v, starting next to the pad and running inwards, or outwards to the edge
        // when a module covers the middle (labelSide 'out').
        const out = params.labelSide === 'out';
        const dir = out ? side : -side;
        pcb.decals.push(flat(labels[i], at(a, side * gap + dir * 1.0, top + 0.01), scale(v, dir), size, MATERIALS.pcbPrint, 'start'));
      }
    });

    // Everything else rests on the PCB (see `on` in render/scene.js), unless it says otherwise.
    const parts = params.look === 'supermini' ? supermini(at, u, v, L, W, top) : devkit(at, u, v, L, W, top);
    for (const p of parts) p.on ??= pcb;
    out.push(...parts);
    return { primitives: out, body: out, anchor: at(0, 0, top + 2) };
  },
};

// ESP32 DevKit: the WROOM-32 module (antenna and metal can) at the pin-1 end, then the
// regulator, the CP2102, the EN and BOOT buttons and the USB-C connector at the far end.
function devkit(at, u, v, L, W, top) {
  const out = [];
  const start = -L / 2;
  const module = box({ center: at(start + 25.5 / 2, 0, top), u, size: [25.5, 18, 0.8], color: MATERIALS.moduleBlue, outline: true });
  // Antenna: the copper zigzag on the module's end, clear of the can.
  for (let k = 0; k < 6; k++) {
    module.decals.push(rectDecal({ center: at(start + 1.2 + (k % 2) * 3.6, -7 + k * 2.8, top + 0.81), u, v, width: 0.5, height: 2.8, color: MATERIALS.copper }));
    module.decals.push(rectDecal({ center: at(start + 3, -5.6 + k * 2.8, top + 0.81), u, v, width: 3.6, height: 0.5, color: MATERIALS.copper }));
  }
  const canStart = start + 7;
  const can = box({ center: at(canStart + 9, 0, top + 0.8), u, size: [18, 16.5, 2.3], color: MATERIALS.shield, outline: true });
  can.on = module;
  can.decals.push(flat('ESP32', at(canStart + 9, 2.2, top + 3.11), u, 2.6, MATERIALS.shieldPrint));
  can.decals.push(flat('WROOM-32', at(canStart + 9, -2.6, top + 3.11), u, 1.4, MATERIALS.shieldPrint));
  out.push(module, can);
  const end = L / 2;
  out.push(box({ center: at(end - 15, -5.5, top), u, size: [6.5, 3.5, 1.6], color: MATERIALS.chip, outline: true })); // regulator
  const usbChip = box({ center: at(end - 15, 3.5, top), u, size: [5, 5, 0.9], color: MATERIALS.chip, outline: true }); // CP2102
  usbChip.decals.push(flat('CP2102', at(end - 15, 3.5, top + 0.91), u, 0.8, MATERIALS.print));
  out.push(usbChip);
  for (const b of [-8, 8]) {
    // the EN and BOOT buttons
    const button = box({ center: at(end - 4.5, b, top), u, size: [4, 3, 1.2], color: MATERIALS.shield, outline: true });
    const cap = box({ center: at(end - 4.5, b, top + 1.2), u, size: [1.6, 1.2, 0.6], color: MATERIALS.chip, outline: true });
    cap.on = button;
    out.push(button, cap);
  }
  out.push(box({ center: at(end - 3.2, 0, top), u, size: [7.4, 9, 3.2], color: MATERIALS.shield, outline: true })); // USB-C, 1 mm past the edge
  return out;
}

// ESP32-C3 SuperMini: USB-C at the pin-1 end, the chip in the middle, the ceramic antenna at
// the far end, the BOOT and RST buttons and the blue LED.
function supermini(at, u, v, L, W, top) {
  const out = [];
  const start = -L / 2;
  out.push(box({ center: at(start + 3.4, 0, top), u, size: [7.4, 9, 3.2], color: MATERIALS.shield, outline: true }));
  const chip = box({ center: at(0.5, 0, top), u, size: [5, 5, 0.9], color: MATERIALS.chip, outline: true });
  chip.decals.push(flat('C3', at(0.5, 0, top + 0.91), u, 1.4, MATERIALS.print));
  out.push(chip);
  out.push(box({ center: at(L / 2 - 2.2, 0, top), u, size: [2, 7, 0.9], color: MATERIALS.antennaCeramic, outline: true }));
  for (const b of [-5, 5]) out.push(box({ center: at(start + 9.5, b, top), u, size: [3, 2.2, 1.1], color: MATERIALS.shield, outline: true }));
  out.push(box({ center: at(5, -5.5, top), u, size: [1.6, 0.8, 0.5], color: MATERIALS.ledBlue, outline: true }));
  return out;
}
