// Parts of a starter kit that move something: a 5 V relay (SRD-05VDC-SL-C) and a small DC motor
// (Mabuchi RE-140RA, the "130 size" hobby motor). Neither fits the breadboard: both lie on the table
// beside it and are wired to holes.
//
// The relay's five pins (Songle SRD drilling: COM 2 mm from the coil's two pins, which are 12 mm
// apart, NO and NC 12.2 mm further on) are on no 2.54 mm grid, so it cannot stand in the board; it
// is the bare relay, not the module with a transistor and a diode on it most kits also ship, because
// that transistor and that diode are the lesson. Wired like the 7 × 7 latching button: a lead soldered
// to each pin in use, under a sleeve, pushed into its hole; only the pins the circuit lists.
//
// The motor's two terminals carry a red lead (+, by the (+) its end cap prints) and a black one, into
// two holes, as the battery's.

import { lookupPartNumber } from '../db.js';
import { pinsByName } from './switch.js';

const BATTERY_SIDES = ['left', 'right', 'back', 'front'];
const found = (number, type) => {
  const f = lookupPartNumber(number);
  return f && f.entry.type === type ? f : null;
};

// fields: part ("SRD-05VDC-SL-C", default), pins ({ "A1": "j10", "COM": "T+20", … }: only the pins in
//         use), wires ({ "A1": "red" }), side ('front' | 'back'), offset (mm along the board)
export const relay = {
  type: 'relay',
  pins: null,
  resolve(part) {
    const f = found(part.part ?? 'SRD-05VDC-SL-C', 'relay');
    if (!f) return { error: { code: 'UNKNOWN_PART_NUMBER', params: { number: String(part.part), type: 'relay' } } };
    const wired = pinsByName(part, f.entry.pins, '{ "A1": "j10", "A2": "T+12", "COM": "T+20", "NO": "j20" }');
    if (wired.error) return wired;
    const { names, colors } = wired;
    return {
      package: f.entry.package,
      pinNames: names,
      params: { names, colors, side: part.side ?? 'front', offset: part.offset },
      label: { text: f.number },
      // The coil and the contact are two circuits: A1 on the same strip as COM shorts nothing.
      isolated: [['A1', 'A2'], ['COM', 'NO', 'NC']],
      electrical: { kind: 'RLY', part: f.number, pins: f.entry.pins },
    };
  },
};

// fields: part ("RE-140RA-12240", default, 3–6 V; "RE-140RA-2270", 1.5–3 V), load (mN·m, default 0:
//         a brake on the shaft, against its turning), side ('left' | 'right' | 'back' | 'front'),
//         offset (mm along that edge)
export const motor = {
  type: 'motor',
  pins: ['+', '-'],
  resolve(part) {
    const f = found(part.part ?? 'RE-140RA-12240', 'motor');
    if (!f) return { error: { code: 'UNKNOWN_PART_NUMBER', params: { number: String(part.part), type: 'motor' } } };
    const load = Number(part.load ?? 0);
    if (!(load >= 0 && load <= 100)) return { error: { code: 'BAD_VALUE', params: { value: `load ${part.load}` } } };
    if (part.side !== undefined && !BATTERY_SIDES.includes(part.side)) return { error: { code: 'UNKNOWN_KIND', params: { kind: `side ${part.side}`, options: BATTERY_SIDES.join(', ') } } };
    return {
      package: f.entry.package,
      pinNames: f.entry.pins,
      params: { side: part.side, offset: part.offset },
      label: { text: f.number },
      electrical: { kind: 'MOT', part: f.number, load },
    };
  },
};
