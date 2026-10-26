// Microcontroller boards (ESP32 DevKit, ESP32-C3 SuperMini, Arduino UNO): what their pins do
// electrically, the same for every family with the numbers of each (models.js, MCUS; the pins in
// parts/modules.js). Phase M1 of docs/en/microcontrollers.md: each GPIO in a fixed state from the
// part's `io` ({ "D13": "high", "D27": "input_pullup" }); later phases run a program
// that changes those states between time steps (gpioStage keeps them as its memory).
//
// Powered by USB (`usb`, default true) the board is a source: 5 V behind the cable's resistance
// on its USB pin (VIN on a DevKit, 5V on the others), its regulator making the 3.3 V rail, the
// chip's own current from its logic rail. A GPIO nothing else touches and with no state asked for
// is left out (a tie keeps its pin from reading as floating). Other modules (the DESPI-C02
// adapter) stay unsupported: `accepts` takes only boards whose family has a model.

import { resistor, junction, regulatorElement, partSource, gpioStage } from '../mna.js';
import { MCUS } from '../models.js';
import { issue, stress, note, q } from './shared.js';

const ESD = { is: 1e-14, n: 1 }; // the protection diodes on every pin
const RESET_PULL = 10e3; // EN / RESET pull-up on the board
const MODES = { high: { mode: 'output', level: 1 }, low: { mode: 'output', level: 0 }, input: { mode: 'input' }, input_pullup: { mode: 'input', pull: 'up' }, input_pulldown: { mode: 'input', pull: 'down' } };

export const mcu = {
  types: ['module'],
  kind: 'MCU',
  accepts: (part) => Boolean(MCUS[part.def.electrical?.family]),
  params(part, c) {
    const e = part.def.electrical;
    const board = e; // power, gpio, adc, inputOnly: from parts/modules.js through the part's type
    const model = { ...MCUS[e.family], ...part.raw.model };
    const nodeOf = new Map(part.pinNames.map((name, i) => [name, part.holes[i].node]));
    const alone = (name) => (c.members?.[nodeOf.get(name)] ?? []).every((id) => id === part.id);
    const io = {};
    for (const [key, value] of Object.entries(part.raw.io ?? {})) {
      const name = part.pinNames.find((p) => p === key) ?? Object.keys(board.gpio).find((p) => p.toLowerCase() === String(key).toLowerCase() || `GPIO${board.gpio[p]}` === String(key).toUpperCase() || String(board.gpio[p]) === String(key));
      const gpio = board.gpio[name];
      const state = MODES[String(value).toLowerCase()];
      if (gpio === undefined || !nodeOf.has(name)) c.issues.push(issue('warning', 'SIM_PIN_UNKNOWN', { part: part.id, pin: String(key), pins: Object.keys(board.gpio).filter((p) => nodeOf.has(p)).join(', ') }));
      else if (!state) c.issues.push(issue('warning', 'SIM_PIN_STATE', { part: part.id, pin: name, state: String(value), states: Object.keys(MODES).join(', ') }));
      else if (state.mode === 'output' && board.inputOnly?.includes(gpio)) c.issues.push(issue('warning', 'SIM_PIN_INPUT_ONLY', { part: part.id, pin: name }));
      else io[name] = state;
    }
    // Not `pins`: the engine keeps each part's pins (with their nodes) under that name.
    const gpios = part.pinNames
      .filter((name) => board.gpio[name] !== undefined)
      .map((name) => ({ name, gpio: board.gpio[name], adc: board.adc?.includes(board.gpio[name]) ?? false, state: io[name] ?? null, used: Boolean(io[name]) || !alone(name) }));
    return { model, power: board.power, gpios, wired: part.pinNames, usb: part.raw.usb !== false, ground: `~${part.id}:GND` };
  },
  elements(p, h) {
    const m = p.model;
    const has = (name) => Boolean(name) && p.wired.includes(name);
    const pinOr = (name, fallback) => (has(name) ? h.pin(name) : fallback());
    const grounds = p.power.ground.filter(has);
    const gnd = grounds.length ? h.pin(grounds[0]) : h.node(p.ground);
    const own = [];
    const add = (el) => own.push(h.add(el)) && el;
    // Every ground pin of the board is one: the copper joins them.
    for (const name of grounds.slice(1)) add(resistor(h.pin(name), gnd, 1e-3));
    const vbus = pinOr(p.power.usb, () => h.inner());
    const entry = { gnd, vbus, own };
    if (p.usb) {
      const top = h.inner();
      entry.usb = add(partSource(top, gnd, 5));
      add(resistor(top, vbus, m.usbResistance));
    }
    const regulator = (out) => add(regulatorElement(vbus, gnd, out, { vref: 3.3, ...m.regulator }));
    // The logic rail: the USB's 5 V itself (UNO), or the regulator's 3.3 V output.
    entry.vdd = p.power.logic === p.power.usb ? vbus : pinOr(p.power.logic, () => h.inner());
    if (entry.vdd !== vbus) entry.reg = regulator(entry.vdd);
    if (p.power.v3 && has(p.power.v3)) entry.reg3 = regulator(h.pin(p.power.v3));
    add(resistor(entry.vdd, gnd, m.vdd / m.own));
    if (has(p.power.reset)) add(resistor(h.pin(p.power.reset), entry.vdd, RESET_PULL));
    if (has(p.power.ioref)) add(resistor(h.pin(p.power.ioref), entry.vdd, 1e-3));
    entry.stages = p.gpios.map((pin) => {
      const node = h.pin(pin.name);
      if (!pin.used) {
        // Nothing wired to it: no element, only a tie so its pin does not read as floating.
        h.add({ nodes: [], links: [[node, gnd]], stamp: () => false, currents: () => [] });
        return null;
      }
      return {
        stage: add(gpioStage({ pin: node, vdd: entry.vdd, gnd }, m, pin.state ?? {})),
        up: add(junction(node, entry.vdd, ESD)),
        down: add(junction(gnd, node, ESD)),
      };
    });
    return entry;
  },
  read(entry, h) {
    const m = entry.model;
    const v = (i) => h.volt(i) - h.volt(entry.gnd);
    // Current into the board at each pin: what its elements take from that pin's node.
    const currents = Object.fromEntries(entry.pins.map((x) => [x.name, 0]));
    const at = new Map();
    for (const x of entry.pins) if (!at.has(x.index)) at.set(x.index, x.name);
    for (const el of entry.own) {
      const into = el.currents(h.x, h.ctx);
      el.nodes.forEach((node, t) => {
        if (at.has(node)) currents[at.get(node)] += into[t];
      });
    }
    const usb = entry.usb ? -entry.usb.currents(h.x)[0] : 0;
    const rail = entry.reg ? -entry.reg.currents(h.x)[2] : null;
    const pins = entry.gpios
      .map((info, k) => [info, entry.stages[k]])
      .filter(([, s]) => s)
      .map(([info, s]) => {
        const voltage = v(s.stage.nodes[0]);
        const current = -(s.stage.currents(h.x)[0] + s.up.currents(h.x)[0] + s.down.currents(h.x)[1]);
        const vdd = v(entry.vdd);
        const read = voltage < m.vil * vdd ? 0 : voltage > m.vih * vdd ? 1 : null;
        const adc = info.adc ? Math.round(Math.min(1, Math.max(0, voltage / m.adcFull)) * (2 ** m.adcBits - 1)) : null;
        return { name: info.name, gpio: info.gpio, mode: s.stage.mode, level: s.stage.level, pull: s.stage.pull, voltage, current, read, adc };
      });
    const power = entry.pins.reduce((sum, x) => sum + h.volt(x.index) * (currents[x.name] ?? 0), 0) + (entry.usb ? 5 * usb : 0);
    return { usb: entry.usb ? { voltage: v(entry.vbus), current: usb } : null, vdd: v(entry.vdd), rail, pins, power, currents };
  },
  limits(entry, r) {
    const m = entry.model;
    const out = r.pins.map((x) => stress('SIM_OVER_CURRENT', 'current', Math.abs(x.current), m.maxPin, 'A'));
    if (r.rail != null) out.push(stress('SIM_OVER_CURRENT', 'current', r.rail, m.regulator.maxCurrent, 'A'));
    for (const x of r.pins) {
      if (x.voltage > r.vdd + 0.3 || x.voltage < -0.3) out.push(note('warning', 'SIM_PIN_OVERVOLTAGE', { part: entry.id, pin: x.name, voltage: q(x.voltage, 'V'), max: q(r.vdd, 'V') }));
    }
    return out;
  },
  lines(p, h) {
    const lines = [];
    if (p.usb) lines.push(h.q('mcu.usb', `${h.f(p.usb.voltage, 'V')} · ${h.f(p.usb.current, 'A')}`));
    lines.push(h.q('mcu.vdd', `${h.f(p.vdd, 'V')}${p.rail != null ? ` · ${h.f(p.rail, 'A')}` : ''}`));
    for (const x of p.pins) {
      const what = x.mode === 'output' ? h.t(`sim.mcu.${x.level ? 'high' : 'low'}`) : h.t(`sim.mcu.input${x.pull ? `.${x.pull}` : ''}`);
      const read = x.mode === 'input' ? ` · ${h.t(x.read == null ? 'sim.mcu.readsNone' : 'sim.mcu.reads', { value: x.read })}` : '';
      const adc = x.mode === 'input' && x.adc != null ? ` · ADC ${x.adc}` : '';
      lines.push(h.raw(`mcu.${x.mode}`, `${x.name} (GPIO${x.gpio}): ${what} · ${h.f(x.voltage, 'V')} · ${h.f(x.current, 'A')}${read}${adc}`));
    }
    lines.push(h.q('power', h.f(p.power, 'W')));
    return lines;
  },
  tag: (r) => (r.usb ? { label: 'USB', value: Math.abs(r.usb.current), key: 'mcu.usb' } : null),
  scope: (r) => {
    const x = r.pins[0];
    return x ? { v: { label: x.name, value: x.voltage }, i: { label: `I(${x.name})`, value: x.current } } : { v: { label: 'Vdd', value: r.vdd }, i: null };
  },
};
