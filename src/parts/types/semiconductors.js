// Diodes, LEDs and transistors. Diodes and transistors come from the part-number table
// (../db.js); LEDs only need a colour.

import { PART_NUMBERS } from '../db.js';
import { MATERIALS, LED_COLORS } from '../colors.js';

function fromPartNumber(part, expectedType, fallback) {
  const number = part.part ?? fallback;
  const entry = PART_NUMBERS[number] ?? PART_NUMBERS[String(number).toUpperCase()];
  if (entry && entry.type === expectedType) return { number, entry };
  // A part not in the table still works if the circuit gives its package and pin names.
  if (part.package && Array.isArray(part.pinNames)) return { number, entry: { type: expectedType, package: part.package, pins: part.pinNames, model: {} } };
  return { error: { code: 'UNKNOWN_PART_NUMBER', params: { number: String(number), type: expectedType } } };
}

export const diode = {
  type: 'diode',
  pins: ['A', 'K'],
  resolve(part) {
    const found = fromPartNumber(part, 'diode', '1N4007');
    if (found.error) return found;
    const body = found.entry.body ?? { length: 5.2, diameter: 2.7, color: 'epoxyBlack', band: 'lead' };
    return {
      package: 'axial',
      pinNames: found.entry.pins,
      params: {
        bodyLength: body.length,
        bodyDiameter: body.diameter,
        shape: 'plain',
        color: MATERIALS[body.color],
        opacity: body.opacity,
        // The band marks the cathode (pin K, the second lead).
        bands: [{ from: body.length - 1.4, to: body.length - 0.6, color: MATERIALS[body.band] }],
      },
      label: { text: found.number },
      electrical: { kind: 'D', part: found.number },
    };
  },
};

export const led = {
  type: 'led',
  pins: ['anode', 'cathode'],
  resolve(part) {
    const colorName = part.color ?? 'red';
    const color = LED_COLORS[colorName];
    if (!color) return { error: { code: 'UNKNOWN_COLOR', params: { color: String(colorName), options: Object.keys(LED_COLORS).join(', ') } } };
    const size = part.size === 3 ? 3 : 5;
    return {
      package: 'led',
      params: { size, color },
      label: { key: `color.${colorName}` },
      electrical: { kind: 'LED', color: colorName },
    };
  },
};

function transistor(type, fallback) {
  return {
    type,
    pins: null, // taken from the part number
    resolve(part) {
      const found = fromPartNumber(part, type, fallback);
      if (found.error) return found;
      return {
        package: found.entry.package,
        pinNames: found.entry.pins,
        params: { marking: part.marking ?? found.number },
        label: { text: found.number },
        electrical: { kind: type === 'mosfet' ? 'M' : 'Q', part: found.number, ...found.entry.model },
      };
    },
  };
}

export const mosfet = transistor('mosfet', 'IRLZ44N');
export const bjt = transistor('bjt', '2N2222A');
