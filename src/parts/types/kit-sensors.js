// Parts of a starter kit that stand in the breadboard and sense or select: the SS-12D00 slide switch
// (SPDT), the SW-520D ball tilt switch and the LM35 temperature sensor.
//
// The two switches are their own types, not styles of `switch`: that type lies beside the board and
// takes its pins by name (layout, query and the catalog treat it so), these go into holes like any
// part. They share its simulation (src/sim/devices/switch.js): a contact closed in the present
// position is a small resistance, an open one is not there.

import { lookupPartNumber } from '../db.js';

// What each switch is to the simulator: the contacts closed when its control is true and when it is
// false, its contact resistance and ratings, the circuit's field its control is, and the words for
// its two positions (the card's state line) and for the button that moves it.
//   SS-12D00 (Vimex drawing): DC 30 V 0.3 A, contact resistance 30 mΩ max. Its knob on pin 1's side
//     joins COM to 1; slid over (true), COM to 2.
//   SW-520D (Bailin Electronics sheet): contact rating 12 V, contact resistance under 10 Ω (the kit
//     takes 10 Ω, the sheet's bound: two balls on a pin are a poor contact). The sheet gives no
//     current; resellers list 25–30 mA, the kit warns over 25 mA. Upright (its leads down, within
//     about 45° of it) the balls close 1–2; tilted past that (true), they roll away and it opens.
export const BOARD_SWITCHES = {
  'slide-switch': { part: 'SS12D00G3', field: 'slid', on: [['COM', '2']], off: [['COM', '1']], contact: 0.03, maxCurrent: 0.3, maxVoltage: 30, states: ['sim.slide.at1', 'sim.slide.at2'], moves: ['page.controls.slideTo2', 'page.controls.slideTo1'] },
  'tilt-switch': { part: 'SW520D', field: 'tilted', on: [], off: [['1', '2']], contact: 10, maxCurrent: 0.025, maxVoltage: 12, states: ['sim.tilt.upright', 'sim.tilt.tilted'], moves: ['page.controls.tilt', 'page.controls.upright'] },
};

function boardSwitch(type) {
  const s = BOARD_SWITCHES[type];
  return {
    type,
    family: 'control',
    pins: lookupPartNumber(s.part).entry.pins,
    resolve(part) {
      const found = lookupPartNumber(part.part ?? s.part);
      if (!found || found.entry.type !== type) return { error: { code: 'UNKNOWN_PART_NUMBER', params: { number: String(part.part), type } } };
      const on = Boolean(part[s.field]);
      return {
        package: found.entry.package,
        pinNames: found.entry.pins,
        params: { [s.field]: on },
        label: { text: found.number },
        electrical: { kind: 'SWT', style: type, on, onContacts: s.on, offContacts: s.off, contact: s.contact, maxCurrent: s.maxCurrent, maxVoltage: s.maxVoltage, field: s.field, states: s.states, moves: s.moves, part: found.number },
      };
    },
  };
}

// fields: part ("SS12D00G3", default), slid (default false: the knob on pin 1's side, COM joined to 1)
export const slideSwitch = boardSwitch('slide-switch');
// fields: part ("SW520D", default), tilted (default false: upright, its contact closed)
export const tiltSwitch = boardSwitch('tilt-switch');

// fields: part ("LM35DZ", default; "LM35CZ"), temperature (°C, default 25: the
// temperature the simulation uses)
// Pins +VS, VOUT, GND from the left with the flat face toward you (the datasheet's bottom view).
export const temperatureSensor = {
  type: 'temperature-sensor',
  family: 'sensor',
  pins: ['+VS', 'VOUT', 'GND'],
  resolve(part) {
    const found = lookupPartNumber(part.part ?? 'LM35DZ');
    if (!found || found.entry.type !== 'temperature-sensor') return { error: { code: 'UNKNOWN_PART_NUMBER', params: { number: String(part.part), type: 'temperature-sensor' } } };
    const temperature = Number(part.temperature ?? 25);
    if (!(temperature > -273.15)) return { error: { code: 'BAD_VALUE', params: { value: `temperature ${part.temperature}` } } };
    return {
      package: found.entry.package,
      pinNames: found.entry.pins,
      params: { marking: found.number },
      label: { text: found.number },
      electrical: { kind: 'TMP', part: found.number, grade: found.entry.model.grade, temperature },
    };
  },
};
