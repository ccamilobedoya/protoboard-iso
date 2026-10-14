// Diodes, LEDs and transistors. Diodes and transistors come from the part-number table
// (../db.js); LEDs only need a colour.

import { lookupPartNumber } from '../db.js';
import { parseValue } from '../../core/units.js';
import { MATERIALS, LED_COLORS } from '../colors.js';

function fromPartNumber(part, expectedType, fallback) {
  const found = lookupPartNumber(part.part ?? fallback);
  if (found && found.entry.type === expectedType) return found;
  const number = part.part ?? fallback;
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

// Bridge rectifier (KBP): four diodes in one body. Both AC pins have a diode up to + and one
// up from −, so whichever AC pin is higher, current leaves by + and comes back by −.
// fields: part ("KBP307", default)
export const bridge = {
  type: 'bridge',
  pins: ['+', 'AC1', 'AC2', '-'],
  resolve(part) {
    const found = fromPartNumber(part, 'bridge', 'KBP307');
    if (found.error) return found;
    return {
      package: 'kbp',
      pinNames: found.entry.pins,
      params: { marking: found.number },
      label: { text: found.number },
      electrical: { kind: 'BR', part: found.number, family: found.entry.model?.family },
    };
  },
};

// Zener diode: a diode made to break down at a set reverse voltage (Vz) and hold it there.
// fields: value (Vz: "5V1", "5.1", 5.1) or part ("1N4733A"); the band marks the cathode (K).
function zenerVoltage(value) {
  if (typeof value === 'number') return value;
  const text = String(value ?? '').trim().replace(',', '.');
  const coded = /^(\d+)V(\d+)$/i.exec(text); // "5V1" = 5.1 V, as printed on the parts
  if (coded) return Number(`${coded[1]}.${coded[2]}`);
  return parseValue(text.replace(/\s*V$/i, ''));
}

export const zener = {
  type: 'zener',
  pins: ['A', 'K'],
  resolve(part) {
    let vz;
    let number = null;
    if (part.part !== undefined) {
      const found = fromPartNumber(part, 'zener');
      if (found.error) return found;
      number = found.number;
      vz = found.entry.model?.vz ?? zenerVoltage(part.value);
    } else {
      vz = zenerVoltage(part.value);
    }
    if (!(vz > 0 && vz <= 200)) return { error: { code: 'BAD_VALUE', params: { value: String(part.value ?? part.part) } } };
    return {
      package: 'axial',
      params: {
        bodyLength: 4.2,
        bodyDiameter: 2.4,
        shape: 'plain',
        color: MATERIALS.glass,
        opacity: 0.85,
        bands: [{ from: 4.2 - 1.2, to: 4.2 - 0.5, color: MATERIALS.epoxyBlack }],
      },
      label: { value: vz, unit: 'V', extra: number ?? undefined },
      electrical: { kind: 'D', zener: true, vz, part: number },
    };
  },
};

// Linear voltage regulator in TO-220: 78xx (IN, GND, OUT) or LM317 (ADJ, OUT, IN).
export const regulator = {
  type: 'regulator',
  pins: null, // from the part number
  resolve(part) {
    const found = fromPartNumber(part, 'regulator', '7805');
    if (found.error) return found;
    return {
      package: found.entry.package,
      pinNames: found.entry.pins,
      params: { marking: part.marking ?? found.number },
      label: { text: found.number },
      electrical: { kind: 'REG', part: found.number, ...found.entry.model },
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

// Integrated circuits in DIP packages. Place them with "pin1" (e.g. "f10").
export const ic = {
  type: 'ic',
  pins: null, // from the part number
  resolve(part) {
    const found = fromPartNumber(part, 'ic', 'NE555');
    if (found.error) return found;
    return {
      package: found.entry.package,
      pinNames: found.entry.pins,
      params: { count: found.entry.pins.length, marking: part.marking ?? found.number },
      label: { text: found.number },
      electrical: { kind: 'IC', part: found.number, ...found.entry.model },
    };
  },
};
export const bjt = transistor('bjt', '2N2222A');
