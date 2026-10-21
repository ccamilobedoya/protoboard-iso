// Pin names as people write them. A brief says "D1.K" for an LED whose pins are anode and
// cathode, "U1.DISCH" for the 555's DIS, "U1.GPIO4" for the DevKit's D4 or "U1.VDD" for a VCC
// pin; each of those cost a smaller model a whole round of "no such pin". findPin answers the
// part's own name for any of them, and nothing when the guess is not unique:
//
//   findPin(['anode', 'cathode'], 'K')        → 'cathode'
//   findPin(['GND', 'TRIG', …, 'DIS', 'VCC'], 'discharge') → 'DIS'
//   findPin(['EN', …, 'D4', …], 'GPIO4')      → 'D4'
//   findPin(['1', '2'], 'A')                  → undefined
//
// An exact name (ignoring case) always wins, so an alias never hides a real pin.

// Each set: names that mean the same pin. Upper case, compared after norm().
const SYNONYMS = [
  ['A', 'ANODE', 'ANODO'],
  ['K', 'CATHODE', 'CATODO'],
  ['+', 'POS', 'POSITIVE', 'POSITIVO'],
  ['-', 'NEG', 'NEGATIVE', 'NEGATIVO'],
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
  ['VCC', 'VDD', 'V+', 'VS', 'VPLUS'],
  ['GND', 'VSS', '0V', 'TIERRA', 'MASA'],
  ['3V3', '3.3V', '3.3', '3V', '+3V3', '+3.3V'],
  ['5V', '+5V'],
];

const norm = (s) => String(s ?? '').trim().toUpperCase().replace(/−/g, '-').replace(/\s+/g, '');
const GROUP = new Map(SYNONYMS.flatMap((set) => set.map((n) => [n, new Set(set)])));
// GPIO numbers: "GPIO4", "IO4", "G4", "D4" and "4" are the same pin on a development board.
const gpio = (name) => /^(?:GPIO|IO|G|D)?(\d{1,2})$/.exec(name)?.[1];

// The part's own pin name for what was written, or undefined (unknown, or more than one match).
export function findPin(names, key) {
  const k = norm(key);
  if (!k) return undefined;
  const exact = names.find((n) => norm(n) === k);
  if (exact !== undefined) return exact;
  const unique = (found) => (found.length === 1 ? found[0] : undefined);
  const group = GROUP.get(k);
  if (group) {
    const hit = unique(names.filter((n) => group.has(norm(n))));
    if (hit !== undefined) return hit;
  }
  const number = gpio(k);
  if (number !== undefined) return unique(names.filter((n) => /^(?:GPIO|IO|G|D)\d/.test(norm(n)) && gpio(norm(n)) === number));
  return undefined;
}
