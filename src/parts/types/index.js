// Registry of part types. A type turns what the circuit file says ("resistor, 4k7")
// into a package, its drawing parameters, a label and the electrical description the
// simulator will use later. To add a type, write a module with { type, pins, resolve }
// and list it here.

import resistor from './resistor.js';
import capacitor from './capacitor.js';
import { diode, zener, bridge, led, mosfet, bjt, ic, regulator } from './semiconductors.js';
import { button, potentiometer } from './controls.js';
import battery from './battery.js';
import module from './module.js';
import { inductor, thermistor, ldr, buzzer, header } from './more.js';
import { WIRE_COLORS } from '../colors.js';

const wire = {
  type: 'wire',
  pins: ['1', '2'],
  resolve(part) {
    const colorName = part.color ?? 'blue';
    const color = WIRE_COLORS[colorName];
    if (!color) return { error: { code: 'UNKNOWN_COLOR', params: { color: String(colorName), options: Object.keys(WIRE_COLORS).join(', ') } } };
    return {
      package: 'wire',
      params: { color, style: part.style ?? 'arc', height: part.height },
      label: null,
      electrical: { kind: 'W' },
    };
  },
};

export const PART_TYPES = Object.fromEntries([resistor, capacitor, potentiometer, diode, zener, bridge, led, mosfet, bjt, ic, regulator, button, wire, battery, module, inductor, thermistor, ldr, buzzer, header].map((t) => [t.type, t]));
