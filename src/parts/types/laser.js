// A laser module (an emitter: its light is written into the circuit's environment, read by every
// sensor of light; docs/en/environment.md#emitters). Part number KY-008, the default: a 650 nm laser
// diode with its 100 Ω resistor between S and −, the middle pin (+) joined to nothing; it stands in
// the breadboard on its three pins, the brass barrel pointing forward. Its power is what the circuit
// gives it (src/sim/devices/laser.js): no field of its own.
//
// fields: part ('KY-008', the default).

import { lookupPartNumber } from '../db.js';

export const laser = {
  type: 'laser',
  family: 'led',
  pins: ['S', '+', '−'],
  resolve(part) {
    const found = lookupPartNumber(part.part ?? 'KY-008');
    if (!found || found.entry.type !== 'laser') return { error: { code: 'UNKNOWN_PART_NUMBER', params: { number: String(part.part), type: 'laser' } } };
    return {
      package: found.entry.package,
      pinNames: found.entry.pins,
      params: {},
      label: { text: found.number },
      electrical: { kind: 'LSR', part: found.number },
    };
  },
};
