// Export a compiled program (compile.js) to Falstad's CircuitJS text format, to open the same
// circuit there (the page's "Open in Falstad" button) or to compare both simulators
// (scripts/falstad.js, test/falstad.test.js). Bundleable: the live page exports the circuit as
// it is at that moment, with its sliders where they are.
//
//   toFalstad(program, { exact, reading, timeConstants }) → { text, url, notes }
//
// Layout: a schematic (falstad-layout.js): nets as rows ordered by voltage, parts standing
// between them, series parts in one column, jumpers merged into their nets, each net labelled
// with the kit's name for it ("T+", "9:f-j").
//
// Each device module says how its part goes to Falstad (`falstad(d, f)`, see devices/index.js),
// with the builder below. When Falstad has no such part, the device writes an equivalent and a
// note (`falstad.*` texts): a battery is a source behind its internal resistance, a sensor a fixed
// resistor at its value now. Notes are shown beside the button; the export still happens.
//
// exact: for comparing the two simulators. Wires and the push button's contacts keep the kit's
// small resistances, capacitors and inductors integrate with backward Euler (as the kit does).
// Without it, wires are ideal and the push button is Falstad's own, so a learner can press it.

import { VT } from './models.js';
import { DEVICE_BY_TYPE } from './devices/index.js';
import { createEngine } from './engine.js';
import { layoutFalstad, escapeName } from './falstad-layout.js';

// Falstad's thermal voltage (Diode.vt, TransistorElm.vt), slightly different from the kit's
// (models.js VT): emission coefficients are scaled so both give the same curve.
export const FALSTAD_VT = 0.025865;
export const FALSTAD_URL = 'https://www.falstad.com/circuit/circuitjs.html';

const BACK_EULER = 2; // CapacitorElm / InductorElm.FLAG_BACK_EULER

const num = (v) => String(Number.isFinite(v) ? Number(v.toPrecision(12)) : 0);

export function createBuilder({ exact = false } = {}) {
  const items = [];
  const merges = [];
  const models = new Map();
  const notes = [];
  let ground = null;
  let inner = 0;
  const f = {
    exact,
    notes,
    note: (code, params) => notes.push({ code, params }),
    // A node only Falstad needs (between a source and its resistance, inside a Darlington).
    inner: (id) => `${id}.${++inner}`,
    model(name, line) {
      if (!models.has(name)) models.set(name, line);
      return escapeName(name);
    },
    // A two-lead element from node a (its first post) to node b.
    two(code, a, b, fields = [], flags = 0) {
      items.push({ kind: 'two', code, nodes: [a, b], fields: fields.map(String), flags });
    },
    pin: (d, name) => d.pins.find((p) => p.name === name)?.node,
    resistor: (a, b, r) => f.two('r', a, b, [num(r)]),
    capacitor: (a, b, c) => f.two('c', a, b, [num(c), 0], exact ? BACK_EULER : 0),
    inductor: (a, b, l) => f.two('l', a, b, [num(l), 0], exact ? BACK_EULER : 0),
    // A jumper: in the drawing its two groups are one net; exact, its small resistance.
    wire: (a, b, r) => (exact ? f.resistor(a, b, r) : merges.push([a, b])),
    // Diode-like elements (d, z, 162) with a model line "34" written once.
    diodeModel(name, { is, n, rs = 0, bv = 0 }) {
      return f.model(name, `34 ${escapeName(name)} 0 ${num(is)} ${num(rs)} ${num((n * VT) / FALSTAD_VT)} ${num(bv)} 0`);
    },
    // A diode (code d), Zener (z) or LED (162, its colour after the model): FLAG_MODEL = 2.
    diode(code, a, k, name, model, extra = []) {
      f.two(code, a, k, [f.diodeModel(name, model), ...extra.map(num)], 2);
    },
    // A bipolar transistor, its model a line "32" written once.
    bjt({ c, b, e }, { polarity, is, bf, br }, name) {
      const nf = num(VT / FALSTAD_VT);
      const model = f.model(name, `32 ${escapeName(name)} 0 ${num(is)} 0 0 1.5 0 0 2 ${nf} ${nf} 0 0 ${num(br)}`);
      items.push({ kind: 'bjt', nodes: { c, b, e }, pnp: polarity === 'pnp' ? -1 : 1, beta: num(bf), model });
    },
    mosfet({ d, g, s }, { channel, vth, k }) {
      items.push({ kind: 'mosfet', nodes: { d, g, s }, flags: channel === 'p' ? 1 : 0, vth: num(Math.abs(vth)), k: num(k) });
    },
    pot({ one, wiper, three }, resistance, position, name) {
      items.push({ kind: 'pot', nodes: { one, wiper, three }, fields: [num(resistance), num(position), escapeName(name)] });
    },
    // Falstad's switch: position 0 is closed. Momentary: it closes while held, like the kit's.
    pushButton(a, b, pressed) {
      f.two('s', a, b, [pressed ? 0 : 1, 'true']);
    },
    voltage(minus, plus, v) {
      f.two('v', minus, plus, [0, 40, num(v), 0, 0, 0.5]);
    },
    ground(node) {
      ground = node;
    },
    done: (header, voltages) => [header, ...models.values(), ...layoutFalstad(items, { ground, voltages, merges })].join('\n') + '\n',
  };
  return f;
}

// A supply: an ideal source behind its internal resistance (none for a bench supply set so).
function exportSupply(s, f, reading) {
  if (s.off) {
    if (s.part) f.note('falstad.batteryOff', { part: s.part });
    return;
  }
  const r = s.internalResistance ?? 0;
  const top = r > 0 ? f.inner(s.part ?? s.id) : s.p;
  f.voltage(s.n, top, s.voltage);
  if (r > 0) f.resistor(top, s.p, r);
  if (s.part || s.battery) f.note('falstad.battery', { part: s.part ?? s.id, voltage: { value: s.voltage, unit: 'V' }, resistance: { value: r, unit: 'Ω' } });
  // The current limit of a bench supply is not exported: say so when it is acting now.
  const now = reading?.supplies?.[s.part ?? s.id];
  if (now?.mode === 'CC') f.note('falstad.currentLimit', { supply: s.id, limit: { value: s.currentLimit, unit: 'A' } });
}

// The step Falstad starts with: as the live page (live.js stepFor), or 5 µs with no C or L.
function timeStep(taus) {
  if (!taus?.length) return 5e-6;
  const h = Math.max(Math.min(...taus) / 50, Math.max(...taus) / 5000);
  return Math.min(1e-2, Math.max(1e-9, h));
}

// reading: the kit's reading now (engine.read()), for the rows' order and the current limit; and
// timeConstants (engine.timeConstants()): both computed here when not given.
export function toFalstad(program, { exact = false, reading = null, timeConstants = null } = {}) {
  if (!reading || !timeConstants) {
    const engine = createEngine(program);
    if (!reading && engine.start('dc')) reading = engine.read();
    timeConstants ??= engine.timeConstants();
  }
  const f = createBuilder({ exact });
  f.ground(program.ground);
  for (const s of program.supplies) exportSupply(s, f, reading);
  for (const d of program.devices) {
    const device = !d.unsupported && DEVICE_BY_TYPE[d.type];
    if (device?.falstad) device.falstad(d, f);
    // A part the kit simulates but Falstad has nothing for, or one the kit does not simulate.
    else if (device && !device.source) f.note('falstad.missing', { part: d.id });
    else if (!device) f.note('falstad.unsupported', { part: d.id });
  }
  const range = Math.max(5, ...program.supplies.map((s) => s.voltage || 0));
  const header = `$ 1 ${num(timeStep(timeConstants))} 10.2 50 ${num(range)} 50 5e-11`;
  const text = f.done(header, reading?.nodes ?? {});
  // Falstad reads `cct` with decodeURI (reserved characters such as ":" stay encoded), so the
  // text goes with encodeURI; names are escaped (escapeName), so no "&", "#" or "+" is left.
  return { text, url: `${FALSTAD_URL}?cct=${encodeURI(text).replace(/[&#]/g, encodeURIComponent)}`, notes: f.notes };
}
