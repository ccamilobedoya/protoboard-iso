// Batteries: what each format and chemistry is, for the drawing (sizes) and for the
// simulator (voltage, internal resistance, capacity, current limit).
//
//   batteryModel({ format, chemistry, cells, charge, voltage, internalResistance, capacity })
//     → { format, chemistry, cells, nominal, emf, resistance, capacity, maxCurrent, rechargeable, charge }
//     | { error: { code, params } }
//
// Cells in series add their voltages and their internal resistances: 4 × AA = 6 V nominal.
// Without `charge` the battery sits at its nominal voltage (the one printed on it); with
// `charge` (0 empty … 1 full) the open-circuit voltage follows the chemistry's curve, and the
// internal resistance grows as it empties. `voltage` (a measured open-circuit voltage) wins
// over both. Every figure is typical, from the makers' datasheets or application notes
// (Energizer E91/E92/522, Panasonic eneloop, Samsung INR18650, generic 103450 LiPo, A123
// LiFePO4); a real cell of the same kind can differ by tens of percent.

// Open-circuit voltage of one cell against the state of charge: [charge, volts], resting.
const CHEMISTRIES = {
  alkaline: {
    nominal: 1.5,
    rechargeable: false,
    // Alkaline cells also get much worse at delivering current as they empty.
    emptyResistance: 4,
    ocv: [[0, 1.05], [0.1, 1.15], [0.25, 1.25], [0.5, 1.35], [0.75, 1.45], [0.9, 1.52], [1, 1.6]],
  },
  nimh: {
    nominal: 1.2,
    rechargeable: true,
    emptyResistance: 1.5,
    ocv: [[0, 1.0], [0.1, 1.18], [0.25, 1.22], [0.5, 1.25], [0.75, 1.28], [0.9, 1.32], [1, 1.4]],
  },
  'li-ion': {
    nominal: 3.7,
    rechargeable: true,
    emptyResistance: 1.5,
    ocv: [[0, 3.0], [0.05, 3.3], [0.1, 3.45], [0.25, 3.62], [0.5, 3.75], [0.75, 3.95], [0.9, 4.08], [1, 4.2]],
  },
  lipo: {
    nominal: 3.7,
    rechargeable: true,
    emptyResistance: 1.5,
    ocv: [[0, 3.0], [0.05, 3.3], [0.1, 3.45], [0.25, 3.62], [0.5, 3.75], [0.75, 3.95], [0.9, 4.08], [1, 4.2]],
  },
  lifepo4: {
    nominal: 3.2,
    rechargeable: true,
    emptyResistance: 1.5,
    ocv: [[0, 2.5], [0.05, 3.0], [0.1, 3.15], [0.25, 3.25], [0.5, 3.28], [0.75, 3.3], [0.9, 3.33], [1, 3.4]],
  },
};

// Formats. Sizes in mm; per chemistry: capacity (Ah), internal resistance of one fresh cell
// (Ω) and the largest continuous current it is meant for (A). `inside` is the number of cells
// inside one package (a 9 V block holds six small alkaline cells).
//   shape 'cell'   round cells lying in an open holder, side by side
//   shape 'block'  a 9 V block with its snap clip
//   shape 'pouch'  a flat lithium-polymer pouch
export const BATTERY_FORMATS = {
  AA: { shape: 'cell', diameter: 14.5, length: 50.5, default: 'alkaline', chemistries: { alkaline: { capacity: 2.5, resistance: 0.25, maxCurrent: 1 }, nimh: { capacity: 2.0, resistance: 0.03, maxCurrent: 2 } } },
  AAA: { shape: 'cell', diameter: 10.5, length: 44.5, default: 'alkaline', chemistries: { alkaline: { capacity: 1.15, resistance: 0.35, maxCurrent: 0.5 }, nimh: { capacity: 0.8, resistance: 0.05, maxCurrent: 1 } } },
  18650: { shape: 'cell', diameter: 18.4, length: 65.2, default: 'li-ion', chemistries: { 'li-ion': { capacity: 3.5, resistance: 0.03, maxCurrent: 10 }, lifepo4: { capacity: 1.5, resistance: 0.03, maxCurrent: 4.5 } } },
  '9V': { shape: 'block', size: [48.5, 26.5, 17.5], inside: 6, default: 'alkaline', chemistries: { alkaline: { capacity: 0.55, resistance: 1.7, maxCurrent: 0.3 } } },
  pouch: { shape: 'pouch', size: [50, 34, 10], default: 'lipo', chemistries: { lipo: { capacity: 2.0, resistance: 0.08, maxCurrent: 2 } } },
};

export const BATTERY_CHEMISTRIES = Object.keys(CHEMISTRIES);

// Piecewise-linear open-circuit voltage of one cell.
export function cellVoltage(chemistry, charge) {
  const curve = CHEMISTRIES[chemistry].ocv;
  const c = Math.min(1, Math.max(0, charge));
  for (let i = 1; i < curve.length; i++) {
    const [c0, v0] = curve[i - 1];
    const [c1, v1] = curve[i];
    if (c <= c1) return v0 + ((v1 - v0) * (c - c0)) / (c1 - c0);
  }
  return curve.at(-1)[1];
}

// "2000 mAh", "2Ah", 2000 (mAh) → amperes-hour.
function parseCapacity(value) {
  if (value == null) return null;
  if (typeof value === 'number') return value / 1000;
  const m = /^\s*([\d.,]+)\s*(m?)a?h?\s*$/i.exec(String(value));
  if (!m) return NaN;
  const n = Number(m[1].replace(',', '.'));
  return m[2] || !/ah/i.test(value) ? n / 1000 : n;
}

const bad = (value) => ({ error: { code: 'BAD_VALUE', params: { value: String(value) } } });

export function batteryModel({ format = 'AA', chemistry, cells = 1, charge, voltage, internalResistance, capacity } = {}) {
  const f = BATTERY_FORMATS[format] ?? BATTERY_FORMATS[String(format).toUpperCase()];
  if (!f) return { error: { code: 'UNKNOWN_KIND', params: { kind: String(format), options: Object.keys(BATTERY_FORMATS).join(', ') } } };
  const name = Object.keys(BATTERY_FORMATS).find((k) => BATTERY_FORMATS[k] === f);
  const chem = chemistry ?? f.default;
  const typical = f.chemistries[chem];
  if (!typical) return { error: { code: 'UNKNOWN_KIND', params: { kind: `${name} ${chem}`, options: Object.keys(f.chemistries).join(', ') } } };
  const n = Number(cells);
  if (!(Number.isInteger(n) && n >= 1 && n <= 12)) return bad(`cells ${cells}`);
  if (charge != null && !(Number(charge) >= 0 && Number(charge) <= 1)) return bad(`charge ${charge}`);
  const series = n * (f.inside ?? 1); // cells in series, counting the ones inside a package
  const c = CHEMISTRIES[chem];
  const emf = voltage != null ? Number(voltage) : charge == null ? series * c.nominal : series * cellVoltage(chem, Number(charge));
  if (!(emf >= 0)) return bad(`voltage ${voltage}`);
  const fade = charge == null ? 1 : 1 + (c.emptyResistance - 1) * (1 - Number(charge)) ** 2;
  const resistance = internalResistance != null ? Number(internalResistance) : n * typical.resistance * fade;
  if (!(resistance >= 0)) return bad(`internalResistance ${internalResistance}`);
  const ah = capacity != null ? parseCapacity(capacity) : typical.capacity;
  if (!(ah > 0)) return bad(`capacity ${capacity}`);
  return {
    format: name,
    chemistry: chem,
    cells: n,
    series, // cells in series, counting the ones inside a package (a 9 V block: 6)
    nominal: series * c.nominal,
    emf,
    resistance,
    capacity: ah,
    maxCurrent: typical.maxCurrent,
    rechargeable: c.rechargeable,
    charge: charge == null ? null : Number(charge),
    measured: voltage != null, // the voltage was measured: the charge does not set it
  };
}
