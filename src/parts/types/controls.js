// Push buttons and potentiometers.

import { parseValue } from '../../core/units.js';

// fields: color (cap colour), pressed (for the simulator, default false)
export const button = {
  type: 'button',
  pins: ['1', '2', '3', '4'],
  // Pins always connected inside the part: the checker treats each group as one.
  internal: [['1', '2'], ['3', '4']],
  resolve(part) {
    return {
      package: 'tactile-6x6',
      params: { color: part.color },
      internal: this.internal,
      label: { key: part.pressed ? 'state.pressed' : 'state.released' },
      electrical: { kind: 'SW', pressed: Boolean(part.pressed), poles: [['1', '2'], ['3', '4']] },
    };
  },
};

// fields: value (end-to-end resistance, "10k"), position (wiper 0…1, default 0.5)
export const potentiometer = {
  type: 'potentiometer',
  pins: ['1', 'W', '3'],
  resolve(part) {
    const ohms = parseValue(part.value ?? '10k');
    if (!(ohms > 0)) return { error: { code: 'BAD_VALUE', params: { value: String(part.value) } } };
    const position = part.position ?? 0.5;
    if (!(position >= 0 && position <= 1)) return { error: { code: 'BAD_VALUE', params: { value: `position ${part.position}` } } };
    return {
      package: 'pot-vertical',
      params: { position },
      label: { value: ohms, unit: 'Ω' },
      electrical: { kind: 'POT', resistance: ohms, position },
    };
  },
};
