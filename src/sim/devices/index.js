// Device modules: everything the simulator knows about one kind of part, in one file.
//
// A device is a plain object:
//   types         part types it handles (`type` in the circuit file)
//   kind          the reading's kind ('R', 'LED', 'Q'…); devices that share a kind share their
//                 reading hooks (lines, tag, probe, currentPins), looked up by kind
//   build(part, h)   adds its MNA elements and returns what reading needs (the "entry")
//                    h: { e (part.def.electrical), raw (the circuit's part), pin(name), at(i),
//                         inner(label), add(element), issues, supplies }
//   read(entry, h)   its values; h: { x, ctx, volt(index), supplyReading(supply) }
//   pinCurrents(entry, out, h)  optional: current into the part at each pin (default from
//                               `currents`, or ± `current` for two pins)
//   limits(entry, reading)  optional: stresses (value against a limit, see shared.js) and notes
//   lines(reading, h)       the card lines [{ key, text }]; null = nothing at all
//   tag(reading)            the current tag on the board { label, value, key } or null
//   probe(reading)          optional: what the page says about that tag { key, value }
//   currentPins(reading)    optional: where the tag's current goes in and out [[pin, ±1]]
//   source                  true for batteries: their warnings come after the other parts'
//
// Adding a kind of part: its type in src/parts/types/, one file here, one line below, one test
// against an independent reference in test/sim.test.js. Nothing else in src/sim changes.

import { wire } from './wire.js';
import { resistor, thermistor, ldr, buzzer } from './resistor.js';
import { capacitor } from './capacitor.js';
import { inductor } from './inductor.js';
import { potentiometer } from './potentiometer.js';
import { button } from './button.js';
import { header } from './header.js';
import { diode, led } from './diode.js';
import { bridge } from './bridge.js';
import { mosfet } from './mosfet.js';
import { bjt } from './bjt.js';
import { regulator } from './regulator.js';
import { battery } from './battery.js';

export const DEVICES = [wire, resistor, thermistor, ldr, buzzer, capacitor, inductor, potentiometer, button, header, diode, led, bridge, mosfet, bjt, regulator, battery];

export const DEVICE_BY_TYPE = Object.fromEntries(DEVICES.flatMap((d) => d.types.map((t) => [t, d])));
// The first device of each kind answers for the readings of that kind.
export const DEVICE_BY_KIND = {};
for (const d of DEVICES) DEVICE_BY_KIND[d.kind] ??= d;

export const deviceFor = (part) => DEVICE_BY_TYPE[part.type] ?? null;
export const deviceOfReading = (reading) => (reading && !reading.unsupported ? DEVICE_BY_KIND[reading.kind] ?? null : null);
