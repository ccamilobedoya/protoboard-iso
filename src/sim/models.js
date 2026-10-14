// Device models for the simulator: the numbers behind each part kind.
//
// Every value here is a *typical* figure for the part, taken from its datasheet or from a
// widely published SPICE model, and simplified (no temperature, no capacitances, constant
// beta). Results are a model, never a measurement: the drawing and the reports say so.
// A circuit can override any field per part with "model": { … } (for example the forward
// voltage a learner measured on their own LED).

export const VT = 0.025852; // thermal voltage kT/q at 27 °C (300.15 K), volts
export const GMIN = 1e-12; // tiny conductance to ground on every node, siemens
export const WIRE_RESISTANCE = 0.05; // jumper wire plus its two contacts, ohms

// Diodes: Shockley equation I = Is·(exp(V / (n·Vt)) − 1) with series resistance Rs.
// Checked in test/sim.test.js against the datasheet forward voltage.
export const DIODES = {
  '1N4007': { is: 7.03e-9, n: 1.81, rs: 0.034, maxCurrent: 1, vf: { current: 1, max: 1.1 } },
  '1N4148': { is: 2.52e-9, n: 1.752, rs: 0.568, maxCurrent: 0.3, vf: { current: 0.01, max: 1.0 } },
  '1N5819': { is: 3.17e-5, n: 1.373, rs: 0.051, maxCurrent: 1, vf: { current: 1, max: 0.6 } },
  // Fitted to the typical forward curve of each datasheet (Vishay, onsemi, Diodes Inc.).
  '1N5399': { is: 2.6e-9, n: 1.8, rs: 0.06, maxCurrent: 1.5, vf: { current: 1.5, max: 1.4 } },
  '1N5408': { is: 1.4e-8, n: 1.7, rs: 0.02, maxCurrent: 3, vf: { current: 3, max: 1.2 } },
  '1N5822': { is: 4e-5, n: 1.2, rs: 0.03, maxCurrent: 3, vf: { current: 3, max: 0.525 } },
  FR107: { is: 3e-9, n: 2, rs: 0.08, maxCurrent: 1, vf: { current: 1, max: 1.3 } },
  FR207: { is: 6e-9, n: 2, rs: 0.05, maxCurrent: 2, vf: { current: 2, max: 1.3 } },
};
// Bridge rectifiers: the model of each of the four diodes inside. Fitted so one diode drops
// about 1.0 V at the rated current (the datasheets give 1.1 V maximum per element); maxCurrent
// is the rated average output current.
export const BRIDGES = {
  KBP2: { is: 5e-9, n: 1.8, rs: 0.05, maxCurrent: 2 },
  KBP3: { is: 1e-8, n: 1.75, rs: 0.03, maxCurrent: 3 },
};

// 1N4001…1N4006 conduct exactly like the 1N4007 (they only withstand less reverse voltage).
for (let n = 1; n <= 6; n++) DIODES[`1N400${n}`] = DIODES['1N4007'];

// Zener diodes, 1 W (1N4728A…1N4751A): [Vz, test current Izt in mA, impedance Zzt in Ω at
// Izt], the JEDEC table printed in the onsemi and Vishay datasheets (Zzt is a maximum). The
// model breaks down so that exactly Izt flows at Vz. Below about 5.5 V the breakdown is the
// Zener effect, with a soft knee: most of the slope is the exponential (knee ≈ 0.10–0.15 V
// per e-fold of current) and a fifth of Zzt in series. Above, it is avalanche: a sharp knee
// (0.04 V) and half of Zzt in series. So a 5.1 V part reads about 4.9 V at 10 mA, as the
// typical curves show. Forward it is an ordinary silicon junction.
export const ZENER_TABLE = [
  [3.3, 76, 10], [3.6, 69, 10], [3.9, 64, 9], [4.3, 58, 9], [4.7, 53, 8], [5.1, 49, 7], [5.6, 45, 5], [6.2, 41, 2],
  [6.8, 37, 3.5], [7.5, 34, 4], [8.2, 31, 4.5], [9.1, 28, 5], [10, 25, 7], [11, 23, 8], [12, 21, 9], [13, 19, 10],
  [15, 17, 14], [16, 15.5, 16], [18, 14, 20], [20, 12.5, 22], [22, 11.5, 23], [24, 10.5, 25], [27, 9.5, 35], [30, 8.5, 40],
];

export function zenerModel(vz, override = {}) {
  // Izt and Zzt for any voltage: interpolated in the table (clamped at its ends).
  const t = ZENER_TABLE;
  let k = t.findIndex(([v]) => v >= vz);
  if (k === -1) k = t.length - 1;
  if (k === 0) k = 1;
  const [v0, i0, z0] = t[k - 1];
  const [v1, i1, z1] = t[k];
  const f = Math.min(1, Math.max(0, (vz - v0) / (v1 - v0)));
  const izt = (i0 + (i1 - i0) * f) / 1000;
  const zzt = z0 + (z1 - z0) * f;
  const knee = vz < 5 ? 0.15 : vz < 6 ? 0.1 : 0.04;
  const nbv = knee / VT;
  const ibv = 1e-3;
  const base = { is: 2e-9, n: 1.6, rs: zzt * (vz < 6 ? 0.2 : 0.5), nbv, ibv, vz, izt, maxPower: 1, maxCurrent: 1, ...override };
  // At Izt: Vz = Izt · rs + bv + nbv · Vt · ln(Izt / ibv).
  base.bv = override.bv ?? base.vz - izt * base.rs - nbv * VT * Math.log(izt / ibv);
  return base;
}

// LEDs: the same equation, set so the forward voltage at 20 mA matches a typical 5 mm LED
// of each colour. `vf` (at 20 mA) can be overridden per part; Is is derived from it.
export const LED_TYPICAL = {
  red: { vf: 1.9, n: 2, rs: 10 },
  orange: { vf: 2.0, n: 2, rs: 10 },
  yellow: { vf: 2.1, n: 2, rs: 10 },
  green: { vf: 2.2, n: 2, rs: 10 },
  blue: { vf: 3.2, n: 3, rs: 10 },
  white: { vf: 3.2, n: 3, rs: 10 },
};
export const LED_LIMITS = { maxCurrent: 0.03, maxReverse: 5, ratedCurrent: 0.02 };

export function ledModel(color, override = {}) {
  const base = { ...(LED_TYPICAL[color] ?? LED_TYPICAL.red), ...LED_LIMITS, ...override };
  const at = base.ratedCurrent;
  const is = override.is ?? at / Math.expm1((base.vf - at * base.rs) / (base.n * VT));
  return { ...base, is };
}

// MOSFETs: square law with a smooth turn-on (no hard corner at Vth, which Newton dislikes).
//   saturation  Id = k/2 · Vov² · (1 + λ·Vds)      linear  Id = k · (Vov·Vds − Vds²/2) · (1 + λ·Vds)
// k is set from the datasheet on-resistance: Rds(on) ≈ 1 / (k · (Vgs − Vth)).
export const MOSFETS = {
  IRLZ44N: { channel: 'n', vth: 1.5, k: 11.4, lambda: 0.01, maxPower: 2 }, // 25 mΩ at Vgs = 5 V
  IRF520: { channel: 'n', vth: 3.0, k: 0.53, lambda: 0.01, maxPower: 2 }, // 0.27 Ω at Vgs = 10 V
  IRF9540: { channel: 'p', vth: -3.0, k: 0.71, lambda: 0.01, maxPower: 2 }, // 0.2 Ω at Vgs = −10 V
  '2N7000': { channel: 'n', vth: 2.1, k: 0.105, lambda: 0.01, maxPower: 0.4 }, // 1.2 Ω at Vgs = 10 V
};
export const MOSFET_DEFAULT = { channel: 'n', vth: 2, k: 1, lambda: 0.01, maxPower: 0.5 };

// Bipolar transistors: Ebers–Moll transport model with constant forward and reverse beta.
export const BJTS = {
  '2N2222A': { polarity: 'npn', is: 14.34e-15, bf: 200, br: 6, maxPower: 0.5 },
  '2N3904': { polarity: 'npn', is: 6.734e-15, bf: 200, br: 0.74, maxPower: 0.625 },
  '2N3906': { polarity: 'pnp', is: 1.41e-15, bf: 180, br: 4.98, maxPower: 0.625 },
  BC547: { polarity: 'npn', is: 7.05e-15, bf: 290, br: 5, maxPower: 0.5 },
  BC557: { polarity: 'pnp', is: 6.73e-15, bf: 250, br: 4, maxPower: 0.5 },
  // Typical hFE (middle of the datasheet range) and Pd; Is from published SPICE models where
  // there is one, else 10 fA (Vbe ≈ 0.7 V at 10 mA).
  '2N2907A': { polarity: 'pnp', is: 650.6e-18, bf: 231.7, br: 3.563, maxPower: 0.625 },
  BC548: { polarity: 'npn', is: 7.05e-15, bf: 290, br: 5, maxPower: 0.5 },
  BC549: { polarity: 'npn', is: 7.05e-15, bf: 400, br: 5, maxPower: 0.5 },
  BC550: { polarity: 'npn', is: 7.05e-15, bf: 400, br: 5, maxPower: 0.5 },
  BC558: { polarity: 'pnp', is: 6.73e-15, bf: 250, br: 4, maxPower: 0.5 },
  BC337: { polarity: 'npn', is: 4.13e-14, bf: 250, br: 10, maxPower: 0.625 },
  BC327: { polarity: 'pnp', is: 4.13e-14, bf: 250, br: 10, maxPower: 0.625 },
  S8050: { polarity: 'npn', is: 1e-14, bf: 200, br: 5, maxPower: 0.625 },
  S8550: { polarity: 'pnp', is: 1e-14, bf: 200, br: 5, maxPower: 0.625 },
  S9012: { polarity: 'pnp', is: 1e-14, bf: 200, br: 5, maxPower: 0.625 },
  S9013: { polarity: 'npn', is: 1e-14, bf: 200, br: 5, maxPower: 0.625 },
  S9014: { polarity: 'npn', is: 1e-14, bf: 400, br: 5, maxPower: 0.45 },
  S9015: { polarity: 'pnp', is: 1e-14, bf: 400, br: 5, maxPower: 0.45 },
  S9018: { polarity: 'npn', is: 1e-14, bf: 100, br: 5, maxPower: 0.4 },
  C1815: { polarity: 'npn', is: 1e-14, bf: 250, br: 5, maxPower: 0.4 },
  A1015: { polarity: 'pnp', is: 1e-14, bf: 250, br: 5, maxPower: 0.4 },
  '2N5551': { polarity: 'npn', is: 2.5e-15, bf: 100, br: 5, maxPower: 0.625 },
  '2N5401': { polarity: 'pnp', is: 2.5e-15, bf: 100, br: 5, maxPower: 0.625 },
  // BC517: a small Darlington (hFE ≥ 30 000), no internal resistors.
  BC517: { polarity: 'npn', darlington: { first: { is: 1e-14, bf: 200, br: 1 }, second: { is: 1e-13, bf: 150, br: 1 }, r1: 1e9, r2: 1e9 }, maxPower: 0.625 },
  // Darlington: two transistors and the two internal resistors of the datasheet.
  TIP120: { polarity: 'npn', darlington: { first: { is: 1e-14, bf: 100, br: 1 }, second: { is: 5e-12, bf: 50, br: 1 }, r1: 8000, r2: 120 }, maxPower: 2 },
};
export const BJT_DEFAULT = { polarity: 'npn', is: 1e-14, bf: 100, br: 1, maxPower: 0.5 };

// Resistor power ratings ("1/4" W by default) and capacitor voltage ratings.
export const RESISTOR_POWER = { '1/8': 0.125, '1/4': 0.25, '1/2': 0.5, 1: 1, 3: 3, 5: 5, 10: 10 };
export const CERAMIC_VOLTAGE = 50;

// Batteries: internal resistance of a fresh alkaline cell, per 1.5 V cell in series. (Battery
// parts, and supplies given a format or chemistry, use src/parts/batteries.js instead.)
export const BATTERY_CELL_RESISTANCE = 0.25;

// Linear regulators (TO-220). The output follows the reference (GND for a 78xx, ADJ for the
// LM317) plus its voltage, unless the input is too low: then it sits `dropout` volts below
// the input (out of regulation). `quiescent`: current the chip itself takes from IN (to GND
// for a 78xx; the 50 µA out of ADJ for the LM317). Limits for a TO-220 with no heatsink.
// Sources: TI LM340/LM78xx and LM317 datasheets (typical values).
export const REGULATORS = {
  fixed: { dropout: 2.0, quiescent: 5e-3, maxCurrent: 1.5, maxPower: 2 },
  LM317: { dropout: 2.0, quiescent: 50e-6, maxCurrent: 1.5, maxPower: 2 },
};
