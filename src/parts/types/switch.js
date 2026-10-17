// Switches that stay where they are put, lying beside the board and wired pin by pin (they do
// not fit across the channel): the KCD1 rocker and the 7 × 7 latching push button.
//
// fields: style ('rocker': KCD1, SPST, pins 1 2 | 'latching': 7 × 7, DPDT, pins NC1 C1 NO1 NC2
//         C2 NO2), on (default false: rocker on O, button released), pins ({ "1": "T+5",
//         "2": "j10" }: only the pins in use), wires ({ "1": "red" }), side ('front' | 'back'),
//         offset (mm along the board)

import { WIRE_COLORS } from '../colors.js';
import { LATCH_PINS } from '../packages/switch.js';

// What each style is: its package, pins, the contacts closed when on and when off, and its
// limits (rocker: no DC rating from the maker, a few amperes at 12 V is safe; latching: about
// 100 mA at 30 V, typical for the size).
export const SWITCH_STYLES = {
  rocker: { label: 'KCD1', package: 'rocker-kcd1', pins: ['1', '2'], on: [['1', '2']], off: [], contact: 0.05, maxCurrent: 3 },
  latching: { label: '7×7', package: 'latching-7x7', pins: Object.keys(LATCH_PINS), on: [['C1', 'NO1'], ['C2', 'NO2']], off: [['C1', 'NC1'], ['C2', 'NC2']], contact: 0.1, maxCurrent: 0.1 },
};

const COLORS = ['red', 'yellow', 'green', 'blue', 'white', 'violet'];

export default {
  type: 'switch',
  pins: null,
  resolve(part) {
    const styleName = part.style ?? 'rocker';
    const style = SWITCH_STYLES[styleName];
    if (!style) return { error: { code: 'UNKNOWN_KIND', params: { kind: `style ${styleName}`, options: Object.keys(SWITCH_STYLES).join(', ') } } };
    const given = part.pins && typeof part.pins === 'object' && !Array.isArray(part.pins) ? Object.keys(part.pins) : [];
    if (!given.length) return { error: { code: 'MODULE_PINS', params: { example: styleName === 'rocker' ? '{ "1": "T+5", "2": "j10" }' : '{ "C1": "j10", "NO1": "j14" }', names: style.pins.join(', ') } } };
    const names = [];
    for (const key of given) {
      const name = style.pins.find((n) => n.toLowerCase() === key.toLowerCase());
      if (!name) return { error: { code: 'UNKNOWN_PIN', params: { pin: key, names: style.pins.join(', ') } } };
      names.push(name);
    }
    const colors = {};
    for (const [i, name] of names.entries()) {
      const asked = part.wires?.[name] ?? part.wires?.[given[i]] ?? COLORS[i % COLORS.length];
      const color = WIRE_COLORS[asked];
      if (!color) return { error: { code: 'UNKNOWN_COLOR', params: { color: String(asked), options: Object.keys(WIRE_COLORS).join(', ') } } };
      colors[name] = color;
    }
    if (part.side !== undefined && !['front', 'back'].includes(part.side)) return { error: { code: 'UNKNOWN_KIND', params: { kind: String(part.side), options: 'front, back' } } };
    const on = Boolean(part.on);
    // Only the contacts whose two pins are wired matter to the circuit.
    const wired = (pairs) => pairs.filter(([a, b]) => names.includes(a) && names.includes(b));
    return {
      package: style.package,
      pinNames: names,
      params: { names, colors, on, side: part.side ?? 'front', offset: part.offset },
      // Its name, not its position: the page can change that while the label stays.
      label: { text: style.label },
      typeKey: `switch.${styleName}`,
      electrical: { kind: 'SWT', style: styleName, on, onContacts: wired(style.on), offContacts: wired(style.off), contact: style.contact, maxCurrent: style.maxCurrent },
    };
  },
};
