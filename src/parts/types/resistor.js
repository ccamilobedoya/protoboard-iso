// Resistor: value → colour bands → axial body.
//
// fields: value ("4k7", 4700), tolerance ("5%", default 5), bands (4 | 5, default from
//         the tolerance), power ("1/4", default), body (colour name from MATERIALS)

import { parseValue } from '../../core/units.js';
import { BAND_COLORS, DIGIT_COLORS, MULTIPLIER_COLORS, TOLERANCE_COLORS, MATERIALS } from '../colors.js';

// Body size by power rating: [length, diameter] in mm.
export const RESISTOR_SIZES = {
  '1/8': [3.3, 1.8],
  '1/4': [6.3, 2.4],
  '1/2': [9.0, 3.2],
  '1': [11.0, 4.5],
};

// Band centres for a 6.3 mm body (scaled to other lengths) and band width.
const LAYOUT = {
  4: { centres: [1.03, 2.43, 3.23, 5.33], width: 0.55 },
  5: { centres: [0.9, 2.2, 2.85, 3.5, 5.3], width: 0.5 },
};

export function parseTolerance(input) {
  if (input === undefined) return 5;
  const n = typeof input === 'number' ? input : Number(String(input).replace('%', '').replace(',', '.'));
  return Number.isFinite(n) ? n : NaN;
}

// Colour names of the bands, from pin 1 to pin 2. `count` is 4 or 5.
export function resistorBands(ohms, tolerance = 5, count = 4) {
  const significant = count === 5 ? 3 : 2;
  let exponent = Math.floor(Math.log10(ohms) + 1e-9) - (significant - 1);
  let mantissa = Math.round(exponent >= 0 ? ohms / 10 ** exponent : ohms * 10 ** -exponent);
  if (mantissa >= 10 ** significant) {
    mantissa = Math.round(mantissa / 10);
    exponent += 1;
  }
  const multiplier = MULTIPLIER_COLORS[exponent];
  if (!multiplier) return null;
  const digits = String(mantissa).padStart(significant, '0').split('').map((d) => DIGIT_COLORS[Number(d)]);
  const bands = [...digits, multiplier];
  const toleranceColor = TOLERANCE_COLORS[tolerance];
  if (toleranceColor) bands.push(toleranceColor);
  else if (tolerance !== 20) return null;
  return bands;
}

export default {
  type: 'resistor',
  pins: ['1', '2'],

  resolve(part) {
    const ohms = parseValue(part.value);
    if (!(ohms > 0)) return { error: { code: 'BAD_VALUE', params: { value: String(part.value) } } };
    const tolerance = parseTolerance(part.tolerance);
    const count = part.bands ?? (tolerance <= 2 ? 5 : 4);
    const names = resistorBands(ohms, tolerance, count);
    if (!names) return { error: { code: 'BAD_VALUE', params: { value: `${part.value} ±${part.tolerance ?? 5}%` } } };

    const [length, diameter] = RESISTOR_SIZES[String(part.power ?? '1/4').replace(/\s*W$/i, '')] ?? RESISTOR_SIZES['1/4'];
    const layout = LAYOUT[count];
    const k = length / 6.3;
    // With 20 % tolerance there is no last band: drop the tolerance slot.
    const centres = names.length < layout.centres.length ? layout.centres.slice(0, names.length) : layout.centres;
    const bands = names.map((name, i) => ({
      from: centres[i] * k - layout.width / 2,
      to: centres[i] * k + layout.width / 2,
      color: BAND_COLORS[name].hex,
    }));

    return {
      package: 'axial',
      params: {
        bodyLength: length,
        bodyDiameter: diameter,
        shape: 'resistor',
        color: MATERIALS[part.body] ?? (count === 5 ? MATERIALS.metalFilm : MATERIALS.carbonFilm),
        bands,
      },
      label: { value: ohms, unit: 'Ω' },
      info: { bands: names },
      electrical: { kind: 'R', resistance: ohms, tolerance },
    };
  },
};
