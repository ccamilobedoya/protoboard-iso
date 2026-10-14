// What each part is and how it works inside, in every language of src/i18n ("describe.*").
// The page shows it in the part's card; a circuit's own `description` (what the part does in
// that circuit) is shown after it.
//
//   describePart(part, lang) → text (null for nothing to say)

import { t } from '../i18n/index.js';

const DIODES = {
  ...Object.fromEntries(['1N4001', '1N4002', '1N4003', '1N4004', '1N4005', '1N4006', '1N4007', '1N5399', '1N5408'].map((n) => [n, 'rectifier'])),
  '1N4148': 'signal',
  '1N5819': 'schottky',
  '1N5822': 'schottky',
  FR107: 'fast',
  FR207: 'fast',
};
// What an integrated circuit does, by its `function` in the part table.
const IC_FUNCTIONS = {
  timer: ['ic.timer'],
  'op-amp': ['ic.opamp'],
  'dual op-amp': ['ic.opamp', 'ic.dual'],
  'quad op-amp': ['ic.opamp', 'ic.quad'],
  'dual comparator': ['ic.comparator'],
  'audio amplifier': ['ic.audio'],
  'darlington array': ['ic.darlingtons'],
  optocoupler: ['ic.opto'],
  'shift register': ['ic.shift'],
  'decade counter': ['ic.counter'],
};

// The i18n keys for a part, most general first: they are joined into one text.
export function describeKeys(part) {
  const e = part.def?.electrical ?? {};
  switch (part.type) {
    case 'resistor':
    case 'led':
    case 'button':
    case 'wire':
    case 'zener':
    case 'bridge':
    case 'regulator':
    case 'inductor':
    case 'thermistor':
    case 'ldr':
    case 'buzzer':
    case 'header':
      return [part.type, ...(e.adjustable ? ['regulator.adjustable'] : [])];
    case 'potentiometer':
      return ['potentiometer', ...(e.trimmer ? ['potentiometer.trimmer'] : [])];
    case 'capacitor':
      return [e.polarised ? 'capacitor.electrolytic' : 'capacitor.ceramic'];
    case 'diode':
      return ['diode', ...(DIODES[e.part] ? [`diode.${DIODES[e.part]}`] : [])];
    case 'bjt':
      return [e.darlington ? 'bjt.darlington' : e.polarity === 'pnp' ? 'bjt.pnp' : 'bjt.npn'];
    case 'mosfet':
      return [e.channel === 'p' ? 'mosfet.p' : 'mosfet.n', ...(e.logicLevel ? ['mosfet.logic'] : [])];
    case 'ic':
      return ['ic', ...(IC_FUNCTIONS[e.function] ?? [])];
    case 'battery':
      return ['battery', `battery.${e.chemistry}`, ...(e.cells > 1 ? ['battery.series'] : [])];
    default:
      return [];
  }
}

export function describePart(part, lang = 'en') {
  const keys = describeKeys(part);
  return keys.length ? keys.map((k) => t(lang, `describe.${k}`)).join(' ') : null;
}
