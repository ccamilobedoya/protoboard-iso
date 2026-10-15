// Jumper wire: a small resistance (the wire and its two contacts).

import { resistor } from '../mna.js';
import { WIRE_RESISTANCE } from '../models.js';
import { twoTerminal, twoTerminalLines, currentTag } from './shared.js';

export const wire = {
  types: ['wire'],
  kind: 'W',
  build: (part, h) => ({ main: h.add(resistor(h.at(0), h.at(1), WIRE_RESISTANCE)) }),
  read: (entry, h) => twoTerminal(entry, entry.main, h),
  lines: twoTerminalLines,
  tag: currentTag,
};
