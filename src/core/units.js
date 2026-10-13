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
  if (value === 0) return `0 ${unit}`.trim();
  const magnitude = Math.abs(value);
  const [factor, prefix] = ENGINEERING.find(([f]) => magnitude >= f * 0.9995) ?? ENGINEERING.at(-1);
  const mantissa = Number((value / factor).toPrecision(digits));
  const text = String(mantissa).replace('.', decimal);
  return `${text} ${prefix}${unit}`.trim();
}
