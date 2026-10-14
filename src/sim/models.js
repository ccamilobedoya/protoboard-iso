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
};

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
  // Darlington: two transistors and the two internal resistors of the datasheet.
  TIP120: { polarity: 'npn', darlington: { first: { is: 1e-14, bf: 100, br: 1 }, second: { is: 5e-12, bf: 50, br: 1 }, r1: 8000, r2: 120 }, maxPower: 2 },
};
export const BJT_DEFAULT = { polarity: 'npn', is: 1e-14, bf: 100, br: 1, maxPower: 0.5 };

// Resistor power ratings ("1/4" W by default) and capacitor voltage ratings.
export const RESISTOR_POWER = { '1/8': 0.125, '1/4': 0.25, '1/2': 0.5, 1: 1 };
export const CERAMIC_VOLTAGE = 50;

// Batteries: internal resistance of a fresh alkaline cell, per 1.5 V cell in series.
export const BATTERY_CELL_RESISTANCE = 0.25;
