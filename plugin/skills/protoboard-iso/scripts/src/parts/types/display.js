// Parts made of several LEDs sharing one pin: a 5 mm RGB LED (three chips under one dome) and a
// single-digit 7-segment display (eight segments, a–g and the decimal point). The simulator gives
// each chip its own LED (src/sim/devices/leds.js); the package draws where each one lights.

import { lookupPartNumber } from '../db.js';

// fields: common ("cathode", default: the usual kit part, or "anode")
// Leads in the order of the usual datasheets: R, the common (the longest), G, B.
export const rgbLed = {
  type: 'rgb-led',
  family: 'led',
  pins: ['R', 'COM', 'G', 'B'],
  resolve(part) {
    const common = part.common ?? 'cathode';
    if (!['cathode', 'anode'].includes(common)) return { error: { code: 'BAD_VALUE', params: { value: `common ${part.common}` } } };
    return {
      package: 'led-rgb',
      params: { common },
      label: { key: `leds.common.${common}` },
      electrical: {
        kind: 'LEDS',
        family: 'rgb5',
        common,
        commons: ['COM'],
        channels: [{ pin: 'R', color: 'red' }, { pin: 'G', color: 'green' }, { pin: 'B', color: 'blue' }],
      },
    };
  },
};

export const SEGMENTS = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'DP'];

// fields: part ("5161AS", common cathode, default; "5161BS", common anode); pin1 (e.g. "c10":
// pin 1 in rows b–e, the other row 6 holes behind, 15.24 mm, across the channel).
export const sevenSegment = {
  type: 'seven-segment',
  family: 'led',
  pins: null, // from the part number
  // Pins 3 and 8 are both the common: one piece of metal inside.
  internal: [['COM1', 'COM2']],
  resolve(part) {
    const found = lookupPartNumber(part.part ?? '5161AS');
    if (!found || found.entry.type !== 'seven-segment') return { error: { code: 'UNKNOWN_PART_NUMBER', params: { number: String(part.part), type: 'seven-segment' } } };
    const { common } = found.entry.model;
    return {
      package: found.entry.package,
      pinNames: found.entry.pins,
      params: { count: found.entry.pins.length, rowSpacing: 6, marking: found.number },
      internal: this.internal,
      label: { text: found.number },
      electrical: {
        kind: 'LEDS',
        family: '5161',
        part: found.number,
        common,
        commons: ['COM1', 'COM2'],
        channels: SEGMENTS.map((pin) => ({ pin, color: 'red' })),
      },
    };
  },
};
