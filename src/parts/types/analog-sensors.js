// Analog sensors of the second night (docs/en/analog-sensors.md): the linear Hall sensor 49E, bare or
// on its KY-035 module, and the voltage sensor module (a 5:1 divider).

import { lookupPartNumber } from '../db.js';

// fields: part ("KY-035", default; "49E"), field (G, its own value: it wins over the environment's)
// KY-035: pins S, +, − (a board with the sensor on it); 49E: VCC, GND, OUT with the flat face toward you.
export const hallSensor = {
  type: 'hall-sensor',
  family: 'sensor',
  pins: ['S', '+', '-'],
  resolve(part) {
    const found = lookupPartNumber(part.part ?? 'KY-035');
    if (!found || found.entry.type !== 'hall-sensor') return { error: { code: 'UNKNOWN_PART_NUMBER', params: { number: String(part.part), type: 'hall-sensor' } } };
    const field = part.field === undefined ? undefined : Number(part.field);
    if (field !== undefined && !(field >= -10000 && field <= 10000)) return { error: { code: 'BAD_VALUE', params: { value: `field ${part.field}` } } };
    const onBoard = found.entry.package === 'sensor-module';
    return {
      package: found.entry.package,
      pinNames: found.entry.pins,
      params: onBoard ? { part: found.number, glyph: 'hall49', print: ['S', '+', '-'], bare: true } : { marking: found.number },
      label: { text: found.number },
      electrical: { kind: 'HAL', part: found.number, roles: found.entry.model.roles, field },
    };
  },
};

// fields: part ("VOLT-25V", default)
// Pins S, + (not connected inside), − on the board's header, then the terminal's VIN and GND (as two
// more pins, a wire each). A 30 kΩ from VIN to S and a 7.5 kΩ from S to GND.
export const voltageSensor = {
  type: 'voltage-sensor',
  family: 'sensor',
  pins: ['S', '+', '-', 'VIN', 'GND'],
  resolve(part) {
    const found = lookupPartNumber(part.part ?? 'VOLT-25V');
    if (!found || found.entry.type !== 'voltage-sensor') return { error: { code: 'UNKNOWN_PART_NUMBER', params: { number: String(part.part), type: 'voltage-sensor' } } };
    return {
      package: found.entry.package,
      pinNames: found.entry.pins,
      params: { part: found.number, glyph: 'terminal', print: ['S', '+', '-', 'VIN', 'GND'], bare: true },
      label: { text: found.number },
      electrical: { kind: 'VSN', part: found.number },
    };
  },
};
