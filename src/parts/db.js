// Known part numbers. Each entry says which package the part uses and the name of each
// lead in package order (pin 1, pin 2, pin 3). Add your own parts here.
//
// `model` holds what the simulator needs to pick a device model (src/sim/models.js).

export const PART_NUMBERS = {
  // MOSFETs
  IRLZ44N: { type: 'mosfet', package: 'TO-220', pins: ['G', 'D', 'S'], model: { channel: 'n', logicLevel: true } },
  IRF520: { type: 'mosfet', package: 'TO-220', pins: ['G', 'D', 'S'], model: { channel: 'n' } },
  IRF9540: { type: 'mosfet', package: 'TO-220', pins: ['G', 'D', 'S'], model: { channel: 'p' } },
  '2N7000': { type: 'mosfet', package: 'TO-92', pins: ['S', 'G', 'D'], model: { channel: 'n' } },

  // Bipolar transistors
  '2N2222A': { type: 'bjt', package: 'TO-92', pins: ['E', 'B', 'C'], model: { polarity: 'npn' } },
  '2N3904': { type: 'bjt', package: 'TO-92', pins: ['E', 'B', 'C'], model: { polarity: 'npn' } },
  '2N3906': { type: 'bjt', package: 'TO-92', pins: ['E', 'B', 'C'], model: { polarity: 'pnp' } },
  BC547: { type: 'bjt', package: 'TO-92', pins: ['C', 'B', 'E'], model: { polarity: 'npn' } },
  BC557: { type: 'bjt', package: 'TO-92', pins: ['C', 'B', 'E'], model: { polarity: 'pnp' } },
  '2N2907A': { type: 'bjt', package: 'TO-92', pins: ['E', 'B', 'C'], model: { polarity: 'pnp' } },
  BC548: { type: 'bjt', package: 'TO-92', pins: ['C', 'B', 'E'], model: { polarity: 'npn' } },
  BC549: { type: 'bjt', package: 'TO-92', pins: ['C', 'B', 'E'], model: { polarity: 'npn' } },
  BC550: { type: 'bjt', package: 'TO-92', pins: ['C', 'B', 'E'], model: { polarity: 'npn' } },
  BC558: { type: 'bjt', package: 'TO-92', pins: ['C', 'B', 'E'], model: { polarity: 'pnp' } },
  BC337: { type: 'bjt', package: 'TO-92', pins: ['C', 'B', 'E'], model: { polarity: 'npn' } },
  BC327: { type: 'bjt', package: 'TO-92', pins: ['C', 'B', 'E'], model: { polarity: 'pnp' } },
  BC517: { type: 'bjt', package: 'TO-92', pins: ['C', 'B', 'E'], model: { polarity: 'npn', darlington: true } },
  S8050: { type: 'bjt', package: 'TO-92', pins: ['E', 'B', 'C'], model: { polarity: 'npn' } },
  S8550: { type: 'bjt', package: 'TO-92', pins: ['E', 'B', 'C'], model: { polarity: 'pnp' } },
  S9012: { type: 'bjt', package: 'TO-92', pins: ['E', 'B', 'C'], model: { polarity: 'pnp' } },
  S9013: { type: 'bjt', package: 'TO-92', pins: ['E', 'B', 'C'], model: { polarity: 'npn' } },
  S9014: { type: 'bjt', package: 'TO-92', pins: ['E', 'B', 'C'], model: { polarity: 'npn' } },
  S9015: { type: 'bjt', package: 'TO-92', pins: ['E', 'B', 'C'], model: { polarity: 'pnp' } },
  S9018: { type: 'bjt', package: 'TO-92', pins: ['E', 'B', 'C'], model: { polarity: 'npn' } },
  // Toshiba's 2SC1815 / 2SA1015 have the collector in the middle.
  C1815: { type: 'bjt', package: 'TO-92', pins: ['E', 'C', 'B'], model: { polarity: 'npn' } },
  A1015: { type: 'bjt', package: 'TO-92', pins: ['E', 'C', 'B'], model: { polarity: 'pnp' } },
  '2N5551': { type: 'bjt', package: 'TO-92', pins: ['E', 'B', 'C'], model: { polarity: 'npn' } },
  '2N5401': { type: 'bjt', package: 'TO-92', pins: ['E', 'B', 'C'], model: { polarity: 'pnp' } },
  TIP120: { type: 'bjt', package: 'TO-220', pins: ['B', 'C', 'E'], model: { polarity: 'npn', darlington: true } },

  // Integrated circuits (DIP): pins in order 1…N
  NE555: { type: 'ic', package: 'dip', pins: ['GND', 'TRIG', 'OUT', 'RESET', 'CTRL', 'THR', 'DIS', 'VCC'], model: { function: 'timer' } },
  LM358: { type: 'ic', package: 'dip', pins: ['OUT1', 'IN1-', 'IN1+', 'GND', 'IN2+', 'IN2-', 'OUT2', 'VCC'], model: { function: 'dual op-amp' } },
  '74HC595': { type: 'ic', package: 'dip', pins: ['QB', 'QC', 'QD', 'QE', 'QF', 'QG', 'QH', 'GND', "QH'", 'SRCLR', 'SRCLK', 'RCLK', 'OE', 'SER', 'QA', 'VCC'], model: { function: 'shift register' } },
  CD4017: { type: 'ic', package: 'dip', pins: ['Q5', 'Q1', 'Q0', 'Q2', 'Q6', 'Q7', 'Q3', 'VSS', 'Q8', 'Q4', 'Q9', 'CO', 'CE', 'CLK', 'MR', 'VDD'], model: { function: 'decade counter' } },
  LM324: { type: 'ic', package: 'dip', pins: ['OUT1', 'IN1-', 'IN1+', 'VCC', 'IN2+', 'IN2-', 'OUT2', 'OUT3', 'IN3-', 'IN3+', 'GND', 'IN4+', 'IN4-', 'OUT4'], model: { function: 'quad op-amp' } },
  LM393: { type: 'ic', package: 'dip', pins: ['OUT1', 'IN1-', 'IN1+', 'GND', 'IN2+', 'IN2-', 'OUT2', 'VCC'], model: { function: 'dual comparator' } },
  UA741: { type: 'ic', package: 'dip', pins: ['NULL1', 'IN-', 'IN+', 'V-', 'NULL2', 'OUT', 'V+', 'NC'], model: { function: 'op-amp' } },
  NE5532: { type: 'ic', package: 'dip', pins: ['OUT1', 'IN1-', 'IN1+', 'V-', 'IN2+', 'IN2-', 'OUT2', 'V+'], model: { function: 'dual op-amp' } },
  // LM386: pins 1 and 8 are both "GAIN" in the datasheet; named apart here.
  LM386: { type: 'ic', package: 'dip', pins: ['GAIN1', 'IN-', 'IN+', 'GND', 'OUT', 'VS', 'BYPASS', 'GAIN8'], model: { function: 'audio amplifier' } },
  ULN2003: { type: 'ic', package: 'dip', pins: ['IN1', 'IN2', 'IN3', 'IN4', 'IN5', 'IN6', 'IN7', 'GND', 'COM', 'OUT7', 'OUT6', 'OUT5', 'OUT4', 'OUT3', 'OUT2', 'OUT1'], model: { function: 'darlington array' } },
  ULN2803: { type: 'ic', package: 'dip', pins: ['IN1', 'IN2', 'IN3', 'IN4', 'IN5', 'IN6', 'IN7', 'IN8', 'GND', 'COM', 'OUT8', 'OUT7', 'OUT6', 'OUT5', 'OUT4', 'OUT3', 'OUT2', 'OUT1'], model: { function: 'darlington array' } },
  PC817: { type: 'ic', package: 'dip', pins: ['A', 'K', 'E', 'C'], model: { function: 'optocoupler' } },

  // Linear voltage regulators (TO-220). 78xx: fixed output; LM317: 1.25 V above ADJ.
  ...Object.fromEntries([5, 6, 8, 9, 10, 12, 15, 18, 24].map((v) => [`78${String(v).padStart(2, '0')}`, { type: 'regulator', package: 'TO-220', pins: ['IN', 'GND', 'OUT'], model: { output: v } }])),
  LM317: { type: 'regulator', package: 'TO-220', pins: ['ADJ', 'OUT', 'IN'], model: { adjustable: true, reference: 1.25 } },
  // AMS1117 low-dropout regulator on its small module (right-angle pins VIN · OUT · GND, power
  // LED on the output). The pin is called IN like the other regulators; the board prints VIN.
  ...Object.fromEntries([['3.3', 3.3], ['5.0', 5]].map(([name, v]) => [`AMS1117-${name}`, { type: 'regulator', package: 'ams1117-module', pins: ['IN', 'OUT', 'GND'], model: { output: v, family: 'AMS1117', led: true } }])),

  // Diodes (axial)
  '1N4007': { type: 'diode', package: 'axial', pins: ['A', 'K'], body: { length: 5.2, diameter: 2.7, color: 'epoxyBlack', band: 'lead' } },
  '1N4148': { type: 'diode', package: 'axial', pins: ['A', 'K'], body: { length: 3.8, diameter: 1.8, color: 'glass', band: 'epoxyBlack', opacity: 0.85 } },
  '1N5819': { type: 'diode', package: 'axial', pins: ['A', 'K'], body: { length: 5.2, diameter: 2.7, color: 'epoxyBlack', band: 'lead' } },
  // 1N4001…1N4006: the 1N4007 with a lower reverse rating (same body, same forward model).
  ...Object.fromEntries([1, 2, 3, 4, 5, 6].map((n) => [`1N400${n}`, { type: 'diode', package: 'axial', pins: ['A', 'K'], body: { length: 5.2, diameter: 2.7, color: 'epoxyBlack', band: 'lead' } }])),
  '1N5399': { type: 'diode', package: 'axial', pins: ['A', 'K'], body: { length: 7.0, diameter: 3.6, color: 'epoxyBlack', band: 'lead' } }, // DO-15
  '1N5408': { type: 'diode', package: 'axial', pins: ['A', 'K'], body: { length: 9.5, diameter: 5.3, color: 'epoxyBlack', band: 'lead' } }, // DO-201AD
  '1N5822': { type: 'diode', package: 'axial', pins: ['A', 'K'], body: { length: 9.5, diameter: 5.3, color: 'epoxyBlack', band: 'lead' } }, // DO-201AD
  FR107: { type: 'diode', package: 'axial', pins: ['A', 'K'], body: { length: 5.2, diameter: 2.7, color: 'epoxyBlack', band: 'lead' } }, // DO-41
  FR207: { type: 'diode', package: 'axial', pins: ['A', 'K'], body: { length: 7.0, diameter: 3.6, color: 'epoxyBlack', band: 'lead' } }, // DO-15

  // Bridge rectifiers, KBP case: four diodes in one flat body, pins + ~ ~ − in a row. KBP2xx
  // 2 A, KBP3xx 3 A; the rest is the reverse voltage, numbered either way by the makers
  // (KBP206 = 600 V, KBP210 and KBP307 = 1000 V).
  ...Object.fromEntries(['KBP2', 'KBP3'].flatMap((family) => ['005', '01', '02', '04', '06', '07', '08', '10'].map((v) => [`${family}${v}`, { type: 'bridge', package: 'kbp', pins: ['+', 'AC1', 'AC2', '-'], model: { family } }]))),

  // Zener diodes, 1 W, DO-41 glass (1N4728A = 3.3 V … 1N4751A = 30 V). The `zener` type also
  // takes just a voltage ("5V1"); see src/sim/models.js for the breakdown model.
  ...Object.fromEntries([3.3, 3.6, 3.9, 4.3, 4.7, 5.1, 5.6, 6.2, 6.8, 7.5, 8.2, 9.1, 10, 11, 12, 13, 15, 16, 18, 20, 22, 24, 27, 30].map((vz, i) => [`1N${4728 + i}A`, { type: 'zener', package: 'axial', pins: ['A', 'K'], model: { vz } }])),
};

// Other names for the same part: "LM7805", "L7805CV" and "MC7805" are a 7805; "LM317T" an LM317;
// "AMS1117-3V3" and "AMS1117-33" an AMS1117-3.3.
export function lookupPartNumber(number) {
  const n = String(number ?? '').toUpperCase().replace(/\s+/g, '');
  if (PART_NUMBERS[n]) return { number: n, entry: PART_NUMBERS[n] };
  const regulator = /^(?:LM|L|MC|KA|UA)?(78\d\d)(?:C?[VTP]|A?CT)?$/.exec(n) ?? /^(LM317)[TK]?$/.exec(n);
  if (regulator && PART_NUMBERS[regulator[1]]) return { number: regulator[1], entry: PART_NUMBERS[regulator[1]] };
  const ams = /^AMS1117-?(3[.V]?3|5(?:[.V]0?)?)$/.exec(n);
  if (ams) {
    const number = ams[1].startsWith('3') ? 'AMS1117-3.3' : 'AMS1117-5.0';
    return { number, entry: PART_NUMBERS[number] };
  }
  const named = { '2SC1815': 'C1815', '2SA1015': 'A1015', '2N2907': '2N2907A', '2N2222': '2N2222A', LM741: 'UA741' }[n];
  return named ? { number: named, entry: PART_NUMBERS[named] } : null;
}
