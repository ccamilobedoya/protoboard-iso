// Capacitors. `kind` picks the package:
//   ceramic       disc, value code printed on it ("104" = 10 × 10⁴ pF = 100 nF)
//   electrolytic  radial can, polarised (pins "+" and "-"); size from capacitance × voltage
// Without `kind`, values of 1 µF and more are taken as electrolytic.
//
// fields: value ("100n", "470u"), kind, voltage (V, electrolytic, default 25),
//         diameter / height (mm, to override the size table)

import { parseValue } from '../../core/units.js';

// Typical can sizes by the product C·V (µF·V): [max CV, diameter, height, lead spacing].
const CAN_SIZES = [
  [400, 5, 11, 2.0],
  [2500, 6.3, 11, 2.5],
  [6000, 8, 12, 3.5],
  [16000, 10, 16, 5.0],
  [40000, 13, 21, 5.0],
  [Infinity, 16, 26, 7.5],
];

const SPACING_BY_DIAMETER = [
  [5, 2.0],
  [6.3, 2.5],
  [8, 3.5],
  [13, 5.0],
  [Infinity, 7.5],
];

export function canSize(farads, volts) {
  const cv = Math.round(farads * 1e6 * volts * 1000) / 1000;
  const [, diameter, height, spacing] = CAN_SIZES.find(([max]) => cv <= max);
  return { diameter, height, spacing };
}

// Three-digit code in picofarads: two significant digits and the number of zeros.
export function capacitorCode(farads) {
  const pf = Math.round(farads * 1e12 * 1000) / 1000;
  if (pf < 10) return String(pf).replace('.', 'R');
  if (pf < 100) return String(Math.round(pf));
  const zeros = Math.floor(Math.log10(pf) + 1e-9) - 1;
  const digits = Math.round(pf / 10 ** zeros);
  return `${digits}${zeros}`;
}

export default {
  type: 'capacitor',
  pins: ['1', '2'],

  resolve(part) {
    const farads = parseValue(part.value);
    if (!(farads > 0)) return { error: { code: 'BAD_VALUE', params: { value: String(part.value) } } };
    const kind = part.kind ?? (farads >= 1e-6 ? 'electrolytic' : 'ceramic');

    if (kind === 'electrolytic') {
      const volts = Number(part.voltage ?? 25);
      const size = canSize(farads, volts);
      const diameter = part.diameter ?? size.diameter;
      const height = part.height ?? size.height;
      const leadSpacing = part.diameter ? SPACING_BY_DIAMETER.find(([d]) => diameter <= d)[1] : size.spacing;
      return {
        package: 'radial-can',
        pinNames: ['+', '-'],
        params: { diameter, height, leadSpacing },
        label: { value: farads, unit: 'F', extra: `${volts} V` },
        electrical: { kind: 'C', capacitance: farads, polarised: true, voltage: volts },
      };
    }
    if (kind === 'ceramic') {
      return {
        package: 'disc',
        params: { diameter: farads > 220e-9 ? 6 : 5, code: capacitorCode(farads) },
        label: { value: farads, unit: 'F' },
        electrical: { kind: 'C', capacitance: farads },
      };
    }
    return { error: { code: 'UNKNOWN_KIND', params: { kind: String(kind), options: 'ceramic, electrolytic' } } };
  },
};
