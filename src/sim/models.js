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

// Several LEDs in one package sharing a common pin (an RGB LED, a 7-segment display): each chip is
// an LED as above, set to its own datasheet. `limits` are per chip.
//   rgb5: 5 mm RGB LED, four leads (YSL-R596CR3G4B5C-C10, China Young Sun LED, the usual generic
//         datasheet): Vf at 20 mA typical red 2.0 V, green 3.2 V, blue 3.2 V (max 2.2 / 3.4 / 3.4);
//         IF 20 mA per chip ("set the input current below 20 mA"), VR 5 V. Green and blue are
//         InGaN chips like a blue LED (n = 3).
//   5161: 0.56" single-digit display, super red (5161AS / 5161BS spec sheet): Vf 2.1 V typical,
//         2.5 V max at 20 mA; IF 20 mA, Pd 40 mW, VR 5 V per segment.
export const LED_FAMILIES = {
  rgb5: { colors: { red: { vf: 2.0, n: 2 }, green: { vf: 3.2, n: 3 }, blue: { vf: 3.2, n: 3 } }, limits: { maxCurrent: 0.02, maxReverse: 5, ratedCurrent: 0.02 } },
  5161: { colors: { red: { vf: 2.1, n: 2 } }, limits: { maxCurrent: 0.02, maxPower: 0.04, maxReverse: 5, ratedCurrent: 0.02 } },
};

export function familyLedModel(family, color, override = {}) {
  const f = LED_FAMILIES[family] ?? LED_FAMILIES.rgb5;
  return ledModel(color, { ...(f.colors[color] ?? {}), ...f.limits, ...override });
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

// Signal generators: output resistance when the circuit does not give one. 50 Ω is the usual
// value of bench function generators; give `resistance` when a generator's own is known.
export const GENERATOR_RESISTANCE = 50;

// Linear regulators (TO-220). The output follows the reference (GND for a 78xx, ADJ for the
// LM317) plus its voltage, unless the input is too low: then it sits `dropout` volts below
// the input (out of regulation). `quiescent`: current the chip itself takes from IN (to GND
// for a 78xx; the 50 µA out of ADJ for the LM317). Limits for a TO-220 with no heatsink.
// Sources: TI LM340/LM78xx and LM317 datasheets (typical values).
// NE555 bipolar timer, as a behavioural model: the internal 5 kΩ divider sets CTRL at 2/3 of the
// supply; THR above V(CTRL) resets the latch (output low, discharge on), TRIG below V(CTRL)/2 sets
// it (output high, discharge off), RESET below 0.7 V forces it low. Output high sits highDrop
// below VCC through highResistance; low sits lowLevel above GND through lowResistance (from VOH
// 13.3 V at 100 mA and 12.5 V at 200 mA with VCC 15 V; VOL 0.1 V at 10 mA and 0.4 V at 50 mA). The
// discharge transistor: 0.15 V at 8 mA. Own current 3 mA at 5 V (10 mA at 15 V), a resistance
// beside the divider. Limits: 16 V supply (recommended), 200 mA output, 600 mW in a DIP-8.
// Source: Texas Instruments NE555 datasheet (SLFS022).
export const TIMERS = {
  NE555: { divider: 5000, quiescentResistance: 1875, highDrop: 0.9, highResistance: 8, lowLevel: 0.025, lowResistance: 7.5, dischargeResistance: 18, resetThreshold: 0.7, maxSupply: 16, maxCurrent: 0.2, maxPower: 0.6 },
};

// Op-amps and comparators (behavioural, DC and low frequency: no bandwidth or slew rate). Each
// amplifier: open-loop gain `gain`; its output follows gain·(V+ − V−), centred on mid-supply,
// saturating softly `swingLow` above the negative supply and `swingHigh` below the positive one,
// behind `outputResistance`; its current comes from the positive supply pin when sourcing and goes
// to the negative one when sinking. A comparator (`openCollector`) only sinks: its output
// transistor pulls OUT to the negative supply through `onResistance` while V− > V+, and is off
// otherwise (it needs a pull-up). `quiescent`: the whole chip's own current. Limits: `maxSupply`
// (total), `maxCurrent` per output (short-circuit current), `maxPower` (DIP). Inputs draw no
// current at `quiescentAt` volts of total supply (a resistor). `channels`: [IN+, IN−, OUT] of each amplifier; `supply`: [positive, negative] pins.
// Sources: TI LM358 (SLOS068), LM324 (SLOS066), LM393 (SLCS005), µA741 (SLOS094), NE5532 (SLOS075).
const DUAL = [['IN1+', 'IN1-', 'OUT1'], ['IN2+', 'IN2-', 'OUT2']];
const LM358 = { gain: 1e5, swingLow: 0.005, swingHigh: 1.5, outputResistance: 50, quiescent: 0.7e-3, quiescentAt: 5, maxSupply: 32, maxCurrent: 0.04, maxPower: 0.8, channels: DUAL, supply: ['VCC', 'GND'] };
export const OPAMPS = {
  LM358,
  LM324: { ...LM358, channels: [...DUAL, ['IN3+', 'IN3-', 'OUT3'], ['IN4+', 'IN4-', 'OUT4']] },
  UA741: { gain: 2e5, swingLow: 2, swingHigh: 2, outputResistance: 75, quiescent: 1.7e-3, quiescentAt: 30, maxSupply: 36, maxCurrent: 0.025, maxPower: 0.5, channels: [['IN+', 'IN-', 'OUT']], supply: ['V+', 'V-'] },
  NE5532: { gain: 1e5, swingLow: 1.5, swingHigh: 1.5, outputResistance: 30, quiescent: 8e-3, quiescentAt: 30, maxSupply: 44, maxCurrent: 0.038, maxPower: 0.8, channels: DUAL, supply: ['V+', 'V-'] },
  LM393: { openCollector: true, gain: 2e5, onResistance: 60, quiescent: 0.4e-3, quiescentAt: 5, maxSupply: 36, maxCurrent: 0.02, maxPower: 0.6, channels: DUAL, supply: ['VCC', 'GND'] },
};

// Microcontroller boards (sim/devices/mcu.js), by family. A GPIO driven as an output is a source
// of `vdd`·level behind `outputResistance` (a PWM duty is its average); an input draws nothing,
// with an optional pull-up or pull-down (`pull` ohms); every pin has protection diodes to the
// logic rail and to ground. Reading an input: below `vil`·vdd it reads 0, above `vih`·vdd 1, in
// between it is undefined. ADC: `adcBits` over 0…`adcFull` volts (linear here). The board takes
// `own` amperes from its logic rail (the chip running, no radio); USB gives 5 V behind
// `usbResistance` (cable and fuse); `regulator`: the 3.3 V regulator's model (REGULATORS or its
// own numbers). Limits: `maxPin` per pin (absolute maximum), `vdd` + 0.3 V on any pin.
// Sources: Espressif ESP32 datasheet v5.3 (VOH 0.8·VDD at 40 mA, VIL 0.25·VDD, VIH 0.75·VDD,
// pull-ups 45 kΩ, ADC 12 bits up to about 3.1 V at 11 dB); ESP32-C3 datasheet v2.4 (ADC up to
// 2.5 V at 11 dB); Microchip ATmega328P datasheet (VOH 4.2 V at 20 mA, VIL 0.3·VCC, VIH 0.6·VCC,
// pull-ups 20–50 kΩ, 40 mA absolute per pin, ADC 10 bits on AVCC); Arduino UNO R3 schematic.
// adcRef 'vdd': the ADC's full scale is the board's own solved logic rail (the UNO's AVcc, the USB's 5 V
// a little under 5 V behind its cable), not the nominal adcFull: a ratiometric sensor then reads the same
// count whatever the supply. The ESP32 families keep their fixed reference (adcFull).
export const MCUS = {
  esp32: { vdd: 3.3, outputResistance: 17, pull: 45e3, vil: 0.25, vih: 0.75, adcBits: 12, adcFull: 3.1, own: 0.04, maxPin: 0.04, usbResistance: 0.2, regulator: { dropout: 1.1, quiescent: 5e-3, maxCurrent: 0.8, maxPower: 1 } },
  esp32c3: { vdd: 3.3, outputResistance: 17, pull: 45e3, vil: 0.25, vih: 0.75, adcBits: 12, adcFull: 2.5, own: 0.02, maxPin: 0.04, usbResistance: 0.2, regulator: { dropout: 0.1, quiescent: 40e-6, maxCurrent: 0.5, maxPower: 0.5 } },
  uno: { vdd: 5, outputResistance: 40, pull: 35e3, vil: 0.3, vih: 0.6, adcBits: 10, adcFull: 5, adcRef: 'vdd', own: 0.045, maxPin: 0.04, usbResistance: 0.3, regulator: { dropout: 0.28, quiescent: 1e-3, maxCurrent: 0.15, maxPower: 0.3 } },
};
// The default I2C pins of each family's Arduino core (Wire with no pins), as GPIO numbers: the UNO's
// A4 = SDA and A5 = SCL [D]; the ESP32 DevKit's GPIO21 / GPIO22 [D]; the ESP32-C3's GPIO8 / GPIO9 [T]
// (the common DevKitM-1 and SuperMini default). A library sensor on I2C answers only on these
// (docs/en/library-sensors.md).
export const I2C_PINS = { uno: { sda: 18, scl: 19 }, esp32: { sda: 21, scl: 22 }, esp32c3: { sda: 8, scl: 9 } };

// LM35 precision centigrade temperature sensors (Texas Instruments LM35 datasheet, SNIS159H,
// sections 6.1 and 6.7). Its output is 10 mV per °C over 0 V (0 mV at 0 °C: 250 mV at 25 °C).
//   gain               sensor gain 10 mV/°C (9.8–10.2 tested limits)
//   quiescent          56 µA from +VS at 5 V and 25 °C (80 µA max; 56.2 µA at 30 V: it hardly changes)
//   outputResistance   load regulation ±0.4 mV/mA typical at 25 °C for 0–1 mA (±2 max): 0.4 Ω
//   supply             operates from 4 V to 30 V (Features; line regulation is given over 4–30 V);
//                      absolute maximum −0.2 V to 35 V
//   maxCurrent         absolute maximum output current 10 mA (it sources; the tested load is 0–1 mA)
//   minTemperature     in the basic circuit (one positive supply, no resistor to a negative one) it
//                      reads from 2 °C ("minimum temperature for rate accuracy", 2 °C limit); under
//                      that its output cannot go lower: the kit holds it at 10 mV · max(T, 0)
//   dropout            the kit's own figure, not the datasheet's: how far under +VS the output can
//                      still follow, so a starved sensor's output falls smoothly instead of jumping
//   grades             accuracy at 25 °C (typical, tested limit) and rated range, by the TO-92 part:
//                      LM35DZ ±0.6 / ±1.5 °C, 0–100 °C; LM35CZ ±0.4 / ±1 °C, −40–110 °C
// Self-heating (0.08 °C in still air) and the error over temperature are left out.
export const LM35 = {
  gain: 0.01, quiescent: 56e-6, outputResistance: 0.4, minSupply: 4, maxSupply: 30, maxReverse: 0.2, maxCurrent: 0.01, minTemperature: 2, dropout: 1.5,
  grades: {
    LM35DZ: { typical: 0.6, limit: 1.5, range: [0, 100] },
    LM35CZ: { typical: 0.4, limit: 1, range: [-40, 110] },
  },
};

// Relays: a coil (its resistance and an inductance) that pulls an armature, a changeover contact.
// SRD-05VDC-SL-C (Songle SRD datasheet: coil data chart, performance, rating):
//   coil            70 Ω ±10 % at 5 V, 71.4 mA, 0.36 W ("L" sensitivity)
//   pullIn          pull-in voltage 75 % max (3.75 V): the kit pulls in at 3.75 V / 70 Ω = 53.6 mA
//   dropOut         drop-out voltage 10 % min (0.5 V): it lets go at 0.5 V / 70 Ω = 7.1 mA
//   maxVoltage      max allowable coil voltage 120 % (6 V)
//   contactResistance 100 mΩ max; insulation 100 MΩ min (the open contact)
//   maxContactCurrent 10 A (10 A 125 VAC / 28 VDC rating)
//   operate, release  the datasheet gives the whole time from the coil's switching, 10 ms and 5 ms
//                   max, not the inductance nor the armature's travel. The kit's own figures: 0.1 H
//                   (τ = L/R = 1.4 ms: at 5 V the current reaches pull-in in 2.0 ms) and a travel of
//                   5 ms once it has (7 ms in all, within 10 ms) and 2 ms to let go (with nothing
//                   across the coil its current stops at once: 2 ms, within 5 ms; a diode across it
//                   keeps it flowing, ~3 ms more: the release a flyback diode slows)
//   parallel        what a coil loses besides its winding (its core's eddy currents, its leakage) as a
//                   resistance across it; the kit takes 10 kΩ (its own figure): switched off with
//                   nothing across it, that is where its current goes, so its spike is about I·R, 0.7 kV
//                   whatever the time step (a real transistor breaks down first: 75 V for a 2N2222A)
export const RELAYS = {
  'SRD-05VDC-SL-C': { nominal: 5, coil: 70, inductance: 0.1, parallel: 1e4, pullIn: 3.75 / 70, dropOut: 0.5 / 70, maxVoltage: 6, contactResistance: 0.1, insulation: 1e8, maxContactCurrent: 10, operate: 5e-3, release: 2e-3 },
};

// Small DC motors (Mabuchi RE-140RA datasheet, its table of characteristics at the nominal voltage):
// the datasheet's points, from which the device (devices/motor.js, motorConstants) derives the model
//   R = V / I_stall, k = (V − R·I_noload) / ω_noload, b = k·I_noload / ω_noload,
// so the no-load point and the stall current are the datasheet's; its stall torque is then k·I_stall
// (2.03 mN·m for the -12240 against the 1.67 it lists: its friction is mostly that of the brushes,
// constant, which a viscous b cannot be at stall). Not in the datasheet, the kit's figures: the rotor's
// inertia J (1 g·cm², an armature of about 5 g, 12 mm across) and the winding's inductance L (1 mH).
//   RE-140RA-12240  3–6 V, 3 V nominal: no load 4800 r/min 0.050 A; at maximum efficiency 3530 r/min
//                   0.14 A 0.44 mN·m; stall 1.67 mN·m 0.39 A
//   RE-140RA-2270   1.5–3.0 V, 1.5 V nominal: no load 8100 r/min 0.21 A; at maximum efficiency
//                   6150 r/min 0.66 A 0.66 mN·m; stall 2.74 mN·m 2.10 A
export const MOTORS = {
  'RE-140RA-12240': { nominal: 3, range: [3, 6], noLoad: { rpm: 4800, current: 0.05 }, efficient: { rpm: 3530, current: 0.14, torque: 0.44e-3 }, stall: { torque: 1.67e-3, current: 0.39 }, inertia: 1e-7, inductance: 1e-3 },
  'RE-140RA-2270': { nominal: 1.5, range: [1.5, 3], noLoad: { rpm: 8100, current: 0.21 }, efficient: { rpm: 6150, current: 0.66, torque: 0.66e-3 }, stall: { torque: 2.74e-3, current: 2.1 }, inertia: 1e-7, inductance: 1e-3 },
};

export const REGULATORS = {
  fixed: { dropout: 2.0, quiescent: 5e-3, maxCurrent: 1.5, maxPower: 2 },
  LM317: { dropout: 2.0, quiescent: 50e-6, maxCurrent: 1.5, maxPower: 2 },
  // AMS1117 (SOT-223) on its small module: dropout 1.1 V typical at 800 mA (1.3 V max), 5 mA
  // own current (10 mA max), 800 mA rated. maxPower: the tab soldered to a few mm² of copper,
  // about 90-100 °C/W, so 1 W takes the junction from 25 °C to its 125 °C. Source: Advanced
  // Monolithic Systems AMS1117 datasheet; the module's seller sheet (4.75-12 V in, 800 mA).
  AMS1117: { dropout: 1.1, quiescent: 5e-3, maxCurrent: 0.8, maxPower: 1, maxInput: 15 },
};

// Timed digital sensors (docs/en/timed-sensors.md; the sheets are resellers' and the chips' own,
// the numbers marked [A] are the kit's).
// PIR HC-SR501 (BISS0001 and an on-board 3.3 V regulator). maxReverse 0.3 V [A], both modules: neither
// has a protection diode on its supply, so a reversed supply is a warning from a few tenths of a volt.
//   supply [4.5, 20] V   the module's range (reseller sheets; "5 to 20 V" on some); under 4.5 V the
//                        regulator is out of regulation and the module does not start, over 20 V it
//                        is beyond what it takes
//   logic 3.3 V          OUT is 3.3 V when active whatever the supply
//   outputResistance 500 Ω [A]   a weak CMOS output through a series resistor: it should drive a
//                        logic input or a transistor, so 2 mA is its limit [A]
//   quiescent 65 µA at 5 V       a resistor VCC / 65 µA
//   blocking 2.5 s       after OUT falls the module ignores motion (the lock-out time Ti)
//   warmup 30 s [A]      sheets say 10 to 60 s; 0 skips it in an example
//   delay [2.5, 600] s   the trimmer Tx = 24576 · R · C: about 2.5 s with the trimmer at its minimum (10 kΩ,
//                        10 nF; sheets and tests report 3 to 4 s), up to 5 min; the kit takes 5 s by default
export const PIR = { maxReverse: 0.3, minSupply: 4.5, maxSupply: 20, logic: 3.3, outputResistance: 500, maxCurrent: 2e-3, quiescent: 65e-6, quiescentAt: 5, blocking: 2.5, warmup: 30, delay: 5, delayRange: [2.5, 600], sliderRange: [3, 300] };

// Capacitive touch TTP223 (Tontek TTP223-BA6 and TTP223B datasheets, at VDD = 3 V):
//   supply [2, 5.5] V    operating voltage
//   response             220 ms in low-power mode, 60 ms in fast mode (rising and falling edges)
//   settle 0.5 s         the output is stable and the pad calibrated this long after power on: a
//                        finger already on the pad then is the baseline, ignored until it is lifted
//   highResistance 150 Ω   sources 4 mA at VOH 2.4 V (VDD 3 V): (3 − 2.4) / 4 mA
//   lowResistance 75 Ω     sinks 8 mA at VOL 0.6 V: 0.6 / 8 mA
//   sourceSpec 4 mA, sinkSpec 8 mA   the currents those levels are guaranteed at (test points, not
//                        limits); maxCurrent 10 mA [A] is where the kit warns
//   quiescent            3 µA in low-power mode and 7 µA in fast mode (maximum values), as a
//                        resistor at 3.3 V
export const TOUCH = { maxReverse: 0.3, minSupply: 2, maxSupply: 5.5, response: 0.22, fastResponse: 0.06, settle: 0.5, highResistance: 150, lowResistance: 75, sourceSpec: 4e-3, sinkSpec: 8e-3, maxCurrent: 10e-3, quiescent: 3e-6, fastQuiescent: 7e-6, quiescentAt: 3.3 };

// Rotary encoder EC11 on the KY-040 module (docs/en/rotary-encoder.md; ALPS EC11 datasheets, the module
// manuals):
//   contact 0.1 Ω        a closed contact, the datasheet's 100 mΩ maximum
//   maxCurrent 10 mA     the contacts' rating at 5 V DC; maxVoltage 12 V [A] where the kit warns
//   pullup 10 kΩ         from `+` to CLK, DT and SW on the module (some clones omit SW's)
//   (speed 360 °/s, 20 pulses and 20 detents are the type's own defaults, src/parts/types/rotary-encoder.js,
//   which a type may not import from here)
//   stepsPerQuarter 25 [A]  the element asks for steps of a twenty-fifth of the time between two edges
//                        (0.5 ms at 360 °/s), deliberately finer than the twentieth the datasheet-derived
//                        notes suggest: a step's end is where an edge is seen, so this keeps every edge
//                        within 0.5 ms of its time
export const ENCODER = { contact: 0.1, maxCurrent: 10e-3, maxVoltage: 12, pullup: 10e3, stepsPerQuarter: 25 };

// Ultrasonic distance module HC-SR04 (docs/en/ultrasonic-sensor.md). [D] the module's datasheet
// (resellers publish copies of the same one), [T] widely quoted for the usual module, [A] the kit's own.
//   speed            331.3 + 0.606 · T m/s, T in °C (dry air)
//   supply           5 V [D]; it works from 4.5 to 5.5 V [A]: under minSupply it answers "no echo"
//                    (SIM_MODULE_LOW_SUPPLY), under minRun [A] it is off (ECHO high impedance), over
//                    maxSupply SIM_IC_SUPPLY
//   trigThreshold    TRIG reads high from 2.0 V [A] (a TTL input; a 3.3 V board's pin is enough)
//   trigMin 10 µs    the trigger pulse [D]; a shorter one is not taken
//   burst 250 µs     from TRIG falling to ECHO rising: eight 40 kHz cycles (200 µs [D]) and about
//                    50 µs of the module's own [A]
//   range [2, 400]   cm [D]; outside it, or with no echo, ECHO stays high noEcho = 38 ms [T]
//   outputResistance 20 Ω [A]   ECHO push-pull at VCC (a 5 V chip's TTL output), assumed: no datasheet
//                    gives it. With 100 Ω a 1 kΩ / 2 kΩ divider's middle would sit at 3.23 V instead of
//                    the 3.33 V of an ideal 5 V source; with 20 Ω it is 3.30 V
//   idleCurrent 2 mA, workCurrent 15 mA at 5 V [D]  as a load VCC–GND, measuring from TRIG to ECHO's fall
//   maxCurrent 50 mA [A]    what ECHO may give before the kit warns: a short to ground (about 250 mA)
//                    warns, ECHO straight into a 3.3 V board's clamp diode (about 46 mA) does not, since
//                    the hazard there is the board's pin, which says so itself (SIM_PIN_OVERVOLTAGE).
//                    A real chip's pin gives 20 to 25 mA; 50 mA keeps the clamp case (0.93 of it) quiet
//   cycle 60 ms      the measuring cycle the datasheet recommends [D] (the page's pace without a program)
export const ULTRASONIC = {
  speed: [331.3, 0.606], minRun: 2.5, minSupply: 4.5, maxSupply: 5.5, maxReverse: 0.3, trigThreshold: 2.0, trigMin: 10e-6, burst: 250e-6,
  range: [2, 400], noEcho: 0.038, outputResistance: 20, idleCurrent: 2e-3, workCurrent: 15e-3, currentAt: 5, maxCurrent: 0.05, cycle: 0.06,
  temperature: 20, distance: 50,
};

// Evidence tags in the figures below: [D] read in a published datasheet, [T] typical (listings and
// community figures, consistent but not guaranteed), [A] assumed by the kit: no source, a free parameter.
// Linear Hall sensor 49E / SS49E (Honeywell SS39ET/SS49E/SS59ET datasheet, read in secondary copies;
// docs/en/analog-sensors.md). The output is ratiometric: Vout = Vs/2 + S · B with S = 1.4 mV/G at 5 V
// [D: 1.0 to 1.75 typical 1.4], scaling with the supply (S · Vs / 5 V).
//   sensitivity       1.4 mV/G at the reference supply (5 V)
//   margin            the output clamps at [0.95 V, Vs − 0.95 V] [D/T, the transfer plot]
//   quiescent         6 mA from the supply [T: the sheets show 6 to 10 mA]
//   outputResistance  50 Ω [A: an output good for about ±1 mA]
//   minSupply         2.7 V [D]; maxOperating 6.5 V [D: the operating range's end]; maxSupply 8 V [A: the
//                     sheets copied give no absolute maximum]: between the two only a note (SIM_HALL_HIGH_SUPPLY)
//   maxReverse        0.3 V [A]; loadNote 1.5 mA [A]: over it the output no longer holds its value
//   outputLimit       5 mA [A]: the output stage's current limit, about three times the ±1.5 mA the class
//                     is good for; the modelled output is current-limited (a short draws about this, not
//                     the 50 mA of a plain 50 Ω, and the supply current stays positive: the chip's own
//                     6 mA is more than the limit). SIM_OVER_CURRENT when the output is asked for more
export const HALL_LINEAR = { sensitivity: 1.4e-3, reference: 5, margin: 0.95, quiescent: 6e-3, outputResistance: 50, minSupply: 2.7, maxSupply: 8, maxOperating: 6.5, maxReverse: 0.3, loadNote: 1.5e-3, outputLimit: 5e-3 };

// Voltage sensor module (30 kΩ / 7.5 kΩ divider, 5:1; docs/en/analog-sensors.md).
//   upper 30 kΩ (marked 3002), lower 7.5 kΩ (7501) [T]; maxPower 0.1 W for the 30 kΩ [A: 1/10 W parts]
//   rated 25 V [T]: the input range on the module's label; over it a note (SIM_VOLTAGE_SENSOR_RANGE), the
//     warning being the 30 kΩ's power (about 68 V)
//   join 1 mΩ [A]: the board's "−" pin and the terminal's GND are one copper trace
//   leak 1 GΩ [A]: the unconnected "+" pin, so it never reads as a floating group
export const VOLTAGE_SENSOR = { upper: 30e3, lower: 7.5e3, maxPower: 0.1, rated: 25, join: 1e-3, leak: 1e9 };

// Active buzzer TMB12A05 (12 mm, 5 V, with an oscillator inside). The listings of this family disagree [T]:
// rated 5 V, 30 mA at 5 V, 2300 Hz, 85 dB at 10 cm.
//   start 2.0 V [A]: the self-oscillator starts there; from 1.5 V [A] the current rises to its full law
//     over half a volt (a smoothstep, monotonic, so the solver has a slope everywhere); there is no
//     hysteresis (the card has no memory of its own: it is a function of the voltage across it)
//   from 2.0 V up it is a resistor, rated / current = 167 Ω [A: roughly linear in V], and it sounds:
//     weakly at 3.3 V (19.8 mA), fully at 5 V; the level is about 85 − 40·log10(5/V) dB below 5 V [A]
//   leak 1 µA per volt silent [A]; reversed it is an open circuit of 100 kΩ, silent, with a note from 1 V
//   maxVoltage 7.5 V [A]: over it SIM_IC_SUPPLY, the kit's existing "more than its maximum supply" warning;
//     the listings' range ends at 7 V, and a 6 V pack of four cells (36 mA) is inside it, so from
//     maxCurrent 35 mA [A] up to there the card only notes that it takes more than its 30 mA (SIM_BUZZER_CURRENT)
export const ACTIVE_BUZZER = { rated: 5, current: 0.03, frequency: 2300, rampFrom: 1.5, start: 2.0, leak: 1e-6, reverseLeak: 1e-5, maxReverse: 1, maxVoltage: 7.5, maxCurrent: 0.035, level: 85 };

// Climate sensors read at library level (docs/en/library-sensors.md). [D] datasheet (Aosong DHT11; Bosch
// BST-BME280-DS002, BST-BMP280-DS001) or the Adafruit library's source, [T] the usual module, [A] the
// kit's own choice.
//   dht.minSupply 3.0 V [A]  under it a read fails (the sheet gives 3 to 5.5 V); maxSupply 5.5 V [D]:
//                 over it SIM_IC_SUPPLY
//   dht.standby 120 µA at 5 V [D: 100 to 150 µA], as a resistor VCC–GND (the 1 mA of the 25 ms of a
//                 real read is left out: 1 % of the time)
//   dht.pullup 10 kΩ [T]  the module's, S to +
//   dht.interval 2000 ms [D library]  MIN_INTERVAL: a read sooner gives the last one (a failure too)
//   dht.warmup 1 s [D]  power-up before a good read (the part's `warmup`)
//   dht.temperature [0, 50] °C, dht.humidity [20, 90] %RH [D]  rated ranges: the reading saturates
//                 there [A]; rounded to whole numbers, nearest [A]
//   dht.high 0.7 [A]  S must idle at 0.7 · VCC or more (pulled up) for an answer
//   bosch.minSupply 1.71, maxSupply 3.6, dead 4.25 V [D]  the chip's VDD and absolute maximum: over
//                 dead the 3.3 V-only board does not answer
//   bosch.rail 3.3 V, dropout 0.2 V [A], quiescent 1 µA [A], minVin 3.4 V [A], maxVin 6.5 V [A]  the
//                 regulated board's LDO
//   bosch.pullup 10 kΩ [T] on SDA and SCL to the chip's rail; bosch.high 0.7 [A] as for the DHT
//   bosch.overIo 0.3 V [D]  a pin's absolute maximum over VDDIO: a bus line above it is SIM_PIN_OVER_VDDIO
//   bosch.temperature [-40, 85] °C, pressure [300, 1100] hPa, humidity [0, 100] %RH [D]
//   boards.*.current  after begin() in the library's normal mode: BME280 0.47 mA [A, from the sheet's
//                 peaks], BMP280 0.4 mA [A]; chip id 0x60 (BME280), 0x58 (BMP280) [D]
export const CLIMATE = {
  dht: { minSupply: 3, maxSupply: 5.5, maxReverse: 0.3, standby: 120e-6, currentAt: 5, pullup: 10e3, interval: 2000, warmup: 1, temperature: [0, 50], humidity: [20, 90], high: 0.7 },
  bosch: { overIo: 0.3, minSupply: 1.71, maxSupply: 3.6, dead: 4.25, maxReverse: 0.3, rail: 3.3, dropout: 0.2, quiescent: 1e-6, minVin: 3.4, maxVin: 6.5, pullup: 10e3, high: 0.7, temperature: [-40, 85], pressure: [300, 1100], humidity: [0, 100] },
  boards: {
    DHT11: { dht: true, humidity: true, pressure: false },
    BME280: { chip: 0x60, humidity: true, pressure: true, regulated: false, current: 0.47e-3 },
    'BME280-5V': { chip: 0x60, humidity: true, pressure: true, regulated: true, current: 0.47e-3 },
    BMP280: { chip: 0x58, humidity: false, pressure: true, regulated: false, current: 0.4e-3 },
  },
};
