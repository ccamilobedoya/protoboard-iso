// Battery drawn beside the board, with its two leads in holes: pins "+" and "-". It is also a
// power source: the simulator uses it like a supply (src/sim/index.js), so a circuit with a
// battery needs no `supplies`.
//
// fields: format ('AA' | 'AAA' | '18650' | '9V' | 'pouch', default 'AA'),
//         chemistry ('alkaline' | 'nimh' | 'li-ion' | 'lifepo4' | 'lipo'; default by format),
//         cells (in series, default 1), charge (0…1; without it, the nominal voltage),
//         voltage (measured open-circuit voltage, wins), internalResistance (Ω), capacity
//         ("2000 mAh"), switch ('on' | 'off': a holder with a switch), side, offset (drawing)
// The numbers behind each format and chemistry are in ../batteries.js.

import { batteryModel, BATTERY_FORMATS } from '../batteries.js';
import { CELL_WRAPS } from '../colors.js';

const NAMES = { pouch: 'LiPo' };
const SIDES = ['left', 'right', 'back', 'front'];

export default {
  type: 'battery',
  pins: ['+', '-'],
  resolve(part) {
    const model = batteryModel(part);
    if (model.error) return model;
    if (part.side !== undefined && !SIDES.includes(part.side)) return { error: { code: 'UNKNOWN_KIND', params: { kind: `side ${part.side}`, options: SIDES.join(', ') } } };
    if (part.switch !== undefined && !['on', 'off'].includes(part.switch)) return { error: { code: 'UNKNOWN_KIND', params: { kind: `switch ${part.switch}`, options: 'on, off' } } };
    const f = BATTERY_FORMATS[model.format];
    const name = NAMES[model.format] ?? model.format;
    const perCell = model.nominal / model.cells;
    const text = `${String(Math.round(perCell * 10) / 10)}V`;
    return {
      package: 'battery',
      params: {
        shape: f.shape,
        cells: model.cells,
        diameter: f.diameter,
        length: f.length,
        size: f.size,
        wrap: CELL_WRAPS[model.chemistry],
        text: f.shape === 'pouch' ? `${text} ${Math.round(model.capacity * 1000)}mAh` : f.shape === 'block' ? `${text}` : text,
        side: part.side,
        offset: part.offset,
        switch: part.switch,
      },
      label: { value: model.nominal, unit: 'V', extra: model.cells > 1 ? `(${model.cells}×${name})` : f.shape === 'block' ? undefined : `(${name})` },
      electrical: { kind: 'BAT', ...model, on: part.switch !== 'off' },
    };
  },
};
