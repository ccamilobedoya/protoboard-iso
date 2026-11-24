// A part number with no simulation model, for the tests only. Since C11 every chip in the kit is
// simulated, and the one part still drawn only (the DESPI-C02 adapter) is a module that layout does
// not place; the behaviours of a part with no model (layout ends WARNINGS with its ⚠, the outputs
// behind it are named by that ⚠ and not called dead, catalog marks it) are tested through layout
// with this entry, added to the parts table in the test's own process. It is never shipped: nothing
// outside test/ imports this file.
import { PART_NUMBERS } from '../src/parts/db.js';

export const UNSIMULATED = 'TEST-NOMODEL';
PART_NUMBERS[UNSIMULATED] ??= { type: 'ic', package: 'dip', pins: ['VCC', 'IN', 'OUT', 'GND'], model: { function: 'test only' } };
