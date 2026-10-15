// Inductors, sensors that are resistors (NTC thermistor, photoresistor), the passive buzzer
// and header pins.

import { parseValue } from '../../core/units.js';
import { BAND_COLORS, MATERIALS } from '../colors.js';
import { resistorBands, parseTolerance } from './resistor.js';
import { ntcResistance, ldrResistance, LDR_PARTS } from '../sensors.js';

export { LDR_PARTS, ldrResistance };

// Inductor with colour rings (the small axial kind, like a fat green resistor): the code is
// the value in microhenries, read like a resistor ("brown black brown" = 10 × 10¹ µH = 100 µH).
// fields: value ("100u" = 100 µH), tolerance (default 10 %), dcr (Ω), current (rated A)
// Without dcr or current, typical values for the size: a few tens of mΩ at 1 µH, tens of Ω
// at 10 mH; from about 0.6 A down to 50 mA.
const INDUCTOR_LENGTH = 9;
export const inductor = {
  type: 'inductor',
  pins: ['1', '2'],
  resolve(part) {
    const henries = parseValue(part.value);
    if (!(henries > 0)) return { error: { code: 'BAD_VALUE', params: { value: String(part.value) } } };
    const tolerance = parseTolerance(part.tolerance ?? '10%');
    const microhenries = henries * 1e6;
    const names = resistorBands(microhenries, tolerance, 4);
    if (!names) return { error: { code: 'BAD_VALUE', params: { value: String(part.value) } } };
    const k = INDUCTOR_LENGTH / 6.3;
    const centres = [1.15, 2.35, 3.55, 5.2];
    const bands = names.map((name, i) => ({ from: centres[i] * k - 0.45, to: centres[i] * k + 0.45, color: BAND_COLORS[name].hex }));
    const dcr = part.dcr != null ? Number(part.dcr) : 0.04 * microhenries ** 0.72;
    const maxCurrent = part.current != null ? Number(part.current) : 0.6 * microhenries ** -0.28;
    return {
      package: 'axial',
      params: { bodyLength: INDUCTOR_LENGTH, bodyDiameter: 4, shape: 'plain', color: MATERIALS.inductor, bands },
      label: { value: henries, unit: 'H' },
      info: { bands: names },
      electrical: { kind: 'L', inductance: henries, dcr, maxCurrent },
    };
  },
};

// NTC thermistor (MF52 epoxy bead): its resistance falls as it warms,
//   R(T) = R25 · exp(B · (1/T − 1/298.15 K)).
// fields: value (R at 25 °C, "10k"), beta (B constant in K, default 3950), temperature (°C,
//         default 25: the temperature the simulation uses)
export const thermistor = {
  type: 'thermistor',
  pins: ['1', '2'],
  resolve(part) {
    const r25 = parseValue(part.value ?? '10k');
    const beta = Number(part.beta ?? 3950);
    const temperature = Number(part.temperature ?? 25);
    if (!(r25 > 0) || !(beta > 0) || !(temperature > -273.15)) return { error: { code: 'BAD_VALUE', params: { value: String(part.value) } } };
    const resistance = ntcResistance({ r25, beta }, temperature);
    return {
      package: 'bead',
      params: {},
      label: { value: r25, unit: 'Ω', extra: 'NTC' },
      electrical: { kind: 'R', resistance, maxPower: 0.05, sensor: { kind: 'thermistor', temperature, r25, beta } },
    };
  },
};

// Photoresistor (CdS, GL55xx series): its resistance falls with light,
//   R = R10 · (lux / 10)^−γ, never above the dark resistance.
// (src/parts/sensors.js: the formula and the part table.)
// fields: part ("GL5528", default), light (illuminance in lux, default 100: a lit room)
export const ldr = {
  type: 'ldr',
  pins: ['1', '2'],
  resolve(part) {
    const number = String(part.part ?? 'GL5528').toUpperCase();
    const model = LDR_PARTS[number];
    if (!model) return { error: { code: 'UNKNOWN_PART_NUMBER', params: { number, type: 'ldr' } } };
    const light = Number(part.light ?? 100);
    if (!(light >= 0)) return { error: { code: 'BAD_VALUE', params: { value: `light ${part.light}` } } };
    return {
      package: 'ldr',
      params: {},
      label: { text: number },
      electrical: { kind: 'R', resistance: ldrResistance(model, light), maxPower: 0.1, part: number, sensor: { kind: 'ldr', light, ...model } },
    };
  },
};

// Passive magnetic buzzer (12 mm, "12085"): a coil that pulls a thin steel disc. It sounds
// only with a changing voltage (a square wave of a few kHz); with steady DC it clicks once and
// its coil (about 16 Ω) just takes current.
export const buzzer = {
  type: 'buzzer',
  pins: ['1', '2'],
  resolve(part) {
    const resistance = parseValue(part.resistance ?? 16);
    return {
      package: 'buzzer',
      params: {},
      label: { key: 'label.passive' },
      electrical: { kind: 'R', resistance, maxPower: 0.5, buzzer: true },
    };
  },
};

// Male header pins in a row (to plug a module or a jumper into): pins "1"…"n". Place it with
// "pin1" and "count", or list every hole. Electrically each pin is only its own hole.
export const header = {
  type: 'header',
  pins: null,
  resolve(part) {
    const count = Number(part.count ?? (Array.isArray(part.pins) ? part.pins.length : part.pins ? Object.keys(part.pins).length : NaN));
    if (!(Number.isInteger(count) && count >= 1 && count <= 40)) return { error: { code: 'BAD_VALUE', params: { value: `count ${part.count}` } } };
    return {
      package: 'header',
      pinNames: Array.from({ length: count }, (_, i) => String(i + 1)),
      params: { count },
      label: { text: `1×${count}` },
      electrical: { kind: 'HDR' },
    };
  },
};
