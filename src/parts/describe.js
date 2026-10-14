// What each part is and how it works inside, in every language of src/i18n ("describe.*").
// The page shows it in the part's card; a circuit's own `description` (what the part does in
// that circuit) is shown after it.
//
//   describePart(part, lang) → text (null for nothing to say)

import { t } from '../i18n/index.js';

const DIODES = { '1N4007': 'rectifier', '1N4148': 'signal', '1N5819': 'schottky' };
const IC_FUNCTIONS = { timer: 'timer', 'dual op-amp': 'opamp', 'shift register': 'shift', 'decade counter': 'counter' };

// The i18n keys for a part, most general first: they are joined into one text.
export function describeKeys(part) {
  const e = part.def?.electrical ?? {};
  switch (part.type) {
    case 'resistor':
    case 'potentiometer':
    case 'led':
    case 'button':
    case 'wire':
      return [part.type];
    case 'capacitor':
      return [e.polarised ? 'capacitor.electrolytic' : 'capacitor.ceramic'];
    case 'diode':
      return ['diode', ...(DIODES[e.part] ? [`diode.${DIODES[e.part]}`] : [])];
    case 'bjt':
      return [e.darlington ? 'bjt.darlington' : e.polarity === 'pnp' ? 'bjt.pnp' : 'bjt.npn'];
    case 'mosfet':
      return [e.channel === 'p' ? 'mosfet.p' : 'mosfet.n', ...(e.logicLevel ? ['mosfet.logic'] : [])];
    case 'ic':
      return ['ic', ...(IC_FUNCTIONS[e.function] ? [`ic.${IC_FUNCTIONS[e.function]}`] : [])];
    default:
      return [];
  }
}

export function describePart(part, lang = 'en') {
  const keys = describeKeys(part);
  return keys.length ? keys.map((k) => t(lang, `describe.${k}`)).join(' ') : null;
}
