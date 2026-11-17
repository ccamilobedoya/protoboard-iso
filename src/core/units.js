// Reading and writing component values: "4k7", "4.7k", "330", "100n", "2R2", "100µF".

const PREFIXES = {
  p: 1e-12,
  n: 1e-9,
  u: 1e-6,
  µ: 1e-6,
  μ: 1e-6,
  m: 1e-3,
  R: 1,
  r: 1,
  k: 1e3,
  K: 1e3,
  M: 1e6,
  G: 1e9,
};

const UNIT_SUFFIX = /\s*(Ω|ohms?|F|V|A|W|H)\s*$/i;
const VALUE = /^(\d+(?:[.,]\d+)?)?([pnuµμmRrkKMG])?(\d+)?$/;

// Returns the value in base units (ohms, farads…) or NaN when it cannot be read.
export function parseValue(input) {
  if (typeof input === 'number') return input;
  if (typeof input !== 'string') return NaN;
  const text = input.trim().replace(UNIT_SUFFIX, '').replace(/\s+/g, '');
  const match = VALUE.exec(text);
  if (!match) return NaN;
  const [, whole, prefix, fraction] = match;
  if (!whole) return NaN;
  if (fraction && !prefix) return NaN;
  if (fraction && /[.,]/.test(whole)) return NaN;
  const number = Number(`${whole.replace(',', '.')}${fraction ? `.${fraction}` : ''}`);
  return number * (prefix ? PREFIXES[prefix] : 1);
}

const ENGINEERING = [
  [1e9, 'G'],
  [1e6, 'M'],
  [1e3, 'k'],
  [1, ''],
  [1e-3, 'm'],
  [1e-6, 'µ'],
  [1e-9, 'n'],
  [1e-12, 'p'],
];

// formatValue(4700, 'Ω', { decimal: ',' }) → "4,7 kΩ"
export function formatValue(value, unit = '', { decimal = '.', digits = 3 } = {}) {
  if (!Number.isFinite(value)) return '?';
  // Below a femto it is the solver's rounding, not a value ("-1,52e-18 pV" for a switched-off part).
  if (value === 0 || Math.abs(value) < 1e-15) return `0 ${unit}`.trim();
  const magnitude = Math.abs(value);
  // A frequency under 1 Hz reads in Hz, never mHz: "0.93 Hz", with the decimals a value just above
  // 1 Hz shows ("1.12 Hz"), one significant digit fewer than the others.
  if (unit === 'Hz' && magnitude < 0.9995) return `${String(Number(value.toPrecision(Math.max(1, digits - 1)))).replace('.', decimal)} Hz`;
  const [factor, prefix] = ENGINEERING.find(([f]) => magnitude >= f * 0.9995) ?? ENGINEERING.at(-1);
  const mantissa = Number((value / factor).toPrecision(digits));
  const text = String(mantissa).replace('.', decimal);
  return `${text} ${prefix}${unit}`.trim();
}

// The preferred-number series of IEC 60063 (one decade each): the values parts are made in.
// Resistors come in E24 (5 %) and its subsets, capacitors mostly in E6 (20 %).
export const E_SERIES = {
  E6: [1.0, 1.5, 2.2, 3.3, 4.7, 6.8],
  E12: [1.0, 1.2, 1.5, 1.8, 2.2, 2.7, 3.3, 3.9, 4.7, 5.6, 6.8, 8.2],
  E24: [1.0, 1.1, 1.2, 1.3, 1.5, 1.6, 1.8, 2.0, 2.2, 2.4, 2.7, 3.0, 3.3, 3.6, 3.9, 4.3, 4.7, 5.1, 5.6, 6.2, 6.8, 7.5, 8.2, 9.1],
};

// Rounded as the series prints its values: 4.7e3, not 4699.999999999999.
const tidy = (v) => Number(v.toPrecision(3));

// Every value of a series from lo to hi (inclusive, in base units), ascending.
export function standardValues(series, lo, hi) {
  const table = E_SERIES[series];
  const out = [];
  for (let e = Math.floor(Math.log10(lo)) - 1; e <= Math.ceil(Math.log10(hi)); e++) {
    for (const m of table) {
      const v = tidy(m * 10 ** e);
      if (v >= lo * (1 - 1e-9) && v <= hi * (1 + 1e-9)) out.push(v);
    }
  }
  return out;
}

// The value of a series nearest to v on a log scale (a tie goes to the lower one).
export function nearestStandard(v, series = 'E24') {
  if (!(v > 0)) return v;
  const decade = 10 ** Math.floor(Math.log10(v));
  let best = 1;
  for (const m of [...E_SERIES[series], 10]) if (Math.abs(Math.log(m / (v / decade))) < Math.abs(Math.log(best / (v / decade))) - 1e-12) best = m;
  return tidy(best * decade);
}

// A value as a part's field writes it: 470 → "470", 4700 → "4.7k", 1e-5 → "10u".
export const valueText = (v) => formatValue(v, '', { digits: 3 }).replace(/\s+/g, '').replace('µ', 'u');
