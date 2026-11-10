// Pin names as people write them. A brief says "D1.K" for an LED whose pins are anode and
// cathode, "U1.DISCH" for the 555's DIS, "U1.GPIO4" for the DevKit's D4 or "U1.VDD" for a VCC
// pin; each of those cost a smaller model a whole round of "no such pin". findPin answers the
// part's own name for any of them, and nothing when the guess is not unique:
//
//   findPin(['anode', 'cathode'], 'K')        → 'cathode'
//   findPin(['GND', 'TRIG', …, 'DIS', 'VCC'], 'discharge') → 'DIS'
//   findPin(['EN', …, 'D4', …], 'GPIO4')      → 'D4'
//   findPin(['1', '2'], 'A')                  → undefined
//   findPin(['AO', 'DO', 'GND', 'VCC'], 'A0', 'sensor-module') → 'AO' (only for that type)
//
// An exact name (ignoring case) always wins, so an alias never hides a real pin.

// Each set: names that mean the same pin. Upper case, compared after norm().
const SYNONYMS = [
  ['A', 'ANODE', 'ANODO'],
  ['K', 'CATHODE', 'CATODO'],
  ['+', 'POS', 'POSITIVE', 'POSITIVO'],
  ['-', '−', 'NEG', 'NEGATIVE', 'NEGATIVO'],
  ['E', 'EMITTER', 'EMISOR'],
  ['B', 'BASE'],
  ['C', 'COLLECTOR', 'COLECTOR'],
  ['G', 'GATE', 'COMPUERTA'],
  ['D', 'DRAIN', 'DRENADOR'],
  ['S', 'SOURCE', 'FUENTE'],
  ['IN', 'VIN', 'VI', 'INPUT', 'ENTRADA'],
  ['OUT', 'VOUT', 'VO', 'OUTPUT', 'SALIDA'],
  ['ADJ', 'ADJUST', 'AJUSTE'],
  ['W', 'WIPER', 'CURSOR', '2'],
  ['DIS', 'DISCH', 'DISCHARGE', 'DESCARGA'],
  ['THR', 'THRES', 'THRESH', 'THRESHOLD', 'UMBRAL'],
  ['TRIG', 'TRIGGER', 'DISPARO'],
  ['CTRL', 'CV', 'CONT', 'CONTROL'],
  ['RESET', 'RST', 'RES'],
  ['VCC', 'VDD', 'V+', 'VS', '+VS', 'VPLUS'],
  ['GND', 'VSS', '0V', 'TIERRA', 'MASA'],
  ['3V3', '3.3V', '3.3', '3V', '+3V3', '+3.3V'],
  ['5V', '+5V'],
  // A relay's coil.
  ['A1', 'COIL1', 'BOBINA1'],
  ['A2', 'COIL2', 'BOBINA2'],
  // An RGB LED's chips and common, a display's decimal point.
  ['R', 'RED', 'ROJO'],
  ['G', 'GREEN', 'VERDE'],
  ['B', 'BLUE', 'AZUL'],
  ['COM', 'COMMON', 'COMUN', 'COMÚN'],
  ['DP', 'DOT', 'PUNTO'],
  // A touch module's signal pin, printed I/O.
  ['SIG', 'SIGNAL', 'I/O', 'IO', 'SENAL'],
];
// Names that mean the same pin on one kind of part only: a sensor module's outputs, printed A0 and D0
// on some boards. Never for every part: on an Arduino UNO, A0 and D0 are real pins, and a mistyped
// AO must not become A0 in silence.
const BY_TYPE = {
  'sensor-module': [
    ['AO', 'A0', 'AOUT', 'ANALOG'],
    ['DO', 'D0', 'DOUT', 'DIGITAL'],
  ],
};

const norm = (s) => String(s ?? '').trim().toUpperCase().replace(/−/g, '-').replace(/\s+/g, '');
const groupsOf = (sets) => new Map(sets.flatMap((set) => set.map((n) => [n, new Set(set)])));
const GROUP = groupsOf(SYNONYMS);
const TYPE_GROUP = Object.fromEntries(Object.entries(BY_TYPE).map(([type, sets]) => [type, groupsOf(sets)]));
// GPIO numbers: "GPIO4", "IO4", "G4", "D4" and "4" are the same pin on a development board.
const gpio = (name) => /^(?:GPIO|IO|G|D)?(\d{1,2})$/.exec(name)?.[1];

// The part's own pin name for what was written, or undefined (unknown, or more than one match).
// `type`: the part's type, for the names only that kind of part shares (BY_TYPE).
export function findPin(names, key, type) {
  const k = norm(key);
  if (!k) return undefined;
  const exact = names.find((n) => norm(n) === k);
  if (exact !== undefined) return exact;
  const unique = (found) => (found.length === 1 ? found[0] : undefined);
  for (const group of [TYPE_GROUP[type]?.get(k), GROUP.get(k)]) {
    if (!group) continue;
    const hit = unique(names.filter((n) => group.has(norm(n))));
    if (hit !== undefined) return hit;
  }
  const number = gpio(k);
  if (number !== undefined) return unique(names.filter((n) => /^(?:GPIO|IO|G|D)\d/.test(norm(n)) && gpio(norm(n)) === number));
  return undefined;
}
