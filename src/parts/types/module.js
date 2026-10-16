// Development boards (see ../modules.js): an ESP32 DevKit or an ESP32-C3 SuperMini straddling
// the channel, placed with "pin1"; an Arduino UNO or the DESPI-C02 e-paper adapter beside the
// board, wired pin by pin.
//
// fields: part ("ESP32-DEVKIT", "ESP32-C3-SUPERMINI", "UNO"; other names in modules.js)
//   straddling boards: pin1, rowSpacing (holes between the two rows; boards differ)
//   UNO, DESPI-C02: pins ({ "D13": "j20", "GND": "T-5" }: only the pins in use),
//        wires ({ "D13": "yellow" }), side ("back" | "front"), offset (mm along the board)
//   DESPI-C02 also: rese ("2.2" as sold | "0.47": the P3 switch), panel (true: its 7.5" panel)
// Not simulated yet: a module only joins the groups its pins are in (level 2 in the roadmap).

import { MODULES, lookupModule, headerPins } from '../modules.js';
import { WIRE_COLORS } from '../colors.js';

// Lead colours when the circuit does not choose: power red, 3.3 V orange, ground black, signals
// in turn from a palette that avoids those three.
const SIGNALS = ['yellow', 'green', 'blue', 'white', 'violet', 'brown', 'grey'];
function wireColor(name, i) {
  if (/^GND/.test(name)) return 'black';
  if (name === '5V' || name === 'VIN') return 'red';
  if (name === '3V3' || name === '3.3V' || name === 'IOREF') return 'orange';
  return SIGNALS[i % SIGNALS.length];
}

export default {
  type: 'module',
  pins: null,
  resolve(part) {
    const found = lookupModule(part.part);
    if (!found) return { error: { code: 'UNKNOWN_MODULE', params: { number: String(part.part), options: Object.keys(MODULES).join(', ') } } };
    const { id, module } = found;
    const common = { label: { text: module.label }, internal: module.internal, spare: true, electrical: { kind: 'MOD', module: id, family: module.family, role: module.role, logic: module.logic }, ...(module.role && { typeKey: `module.${module.role}` }) };
    if (module.mount === 'straddle') {
      const rowSpacing = Number(part.rowSpacing ?? module.rowSpacing);
      if (!(Number.isInteger(rowSpacing) && rowSpacing >= 4 && rowSpacing <= 12)) return { error: { code: 'BAD_VALUE', params: { value: `rowSpacing ${part.rowSpacing}` } } };
      const labels = module.pins.map((name) => module.printed?.[name] ?? (module.printedGpio ? name.replace(/^GPIO/, '') : display(name)));
      // Its card lists only the pins with something else in their group: it has many.
      return { ...common, usedPinsOnly: true, package: 'devboard', pinNames: module.pins, params: { count: module.pins.length, rowSpacing, size: module.size, look: module.look, labels, labelSide: module.labelSide ?? 'in' } };
    }
    // Beside the board: the pins the circuit lists, in its order.
    const all = headerPins(module);
    const given = part.pins && typeof part.pins === 'object' && !Array.isArray(part.pins) ? Object.keys(part.pins) : [];
    if (!given.length) return { error: { code: 'MODULE_PINS', params: { example: '{ "D13": "j20", "GND": "T-5" }', names: all.join(', ') } } };
    const names = [];
    for (const key of given) {
      const name = all.find((n) => n.toLowerCase() === key.toLowerCase());
      if (!name) return { error: { code: 'UNKNOWN_PIN', params: { pin: key, names: all.join(', ') } } };
      names.push(name);
    }
    const colors = {};
    for (const [i, name] of names.entries()) {
      const asked = part.wires?.[name] ?? part.wires?.[given[i]];
      const color = WIRE_COLORS[asked ?? wireColor(name, i)];
      if (!color) return { error: { code: 'UNKNOWN_COLOR', params: { color: String(asked), options: Object.keys(WIRE_COLORS).join(', ') } } };
      colors[name] = color;
    }
    if (part.side !== undefined && !['back', 'front'].includes(part.side)) return { error: { code: 'UNKNOWN_KIND', params: { kind: String(part.side), options: 'back, front' } } };
    const params = { module, names, colors, side: part.side ?? 'back', offset: part.offset };
    if (module.package === 'despi') {
      // The RESE switch as it is set (as sold: 2.2), and the panel on its FPC if asked for.
      const rese = String(part.rese ?? '2.2');
      if (!['2.2', '0.47'].includes(rese)) return { error: { code: 'UNKNOWN_KIND', params: { kind: rese, options: '2.2, 0.47' } } };
      Object.assign(params, { rese, panel: Boolean(part.panel) });
    }
    return { ...common, package: module.package ?? 'uno', pinNames: names, params };
  },
};

// The name printed on the board for a pin name ("GND2" is printed "GND").
function display(name) {
  return /^GND\d$/.test(name) ? 'GND' : name;
}
