// Switches that stay put (KCD1 rocker, 7 × 7 latching button beside the board; the SS-12D00 slide
// switch and the SW-520D tilt switch in it): each contact closed in the present position is a small
// resistance; open ones are not there. Control: a toggle, `on` (a slide switch's `slid`, a tilt
// switch's `tilted`: the circuit's own field). The switches in the board also hold their rated
// voltage across an open contact (a stress) and name their two positions (`states`).

import { resistor as resistorEl } from '../mna.js';
import { stress } from './shared.js';

const closedNow = (p) => (p.on ? p.onContacts : p.offContacts);

export const toggle = {
  types: ['switch', 'slide-switch', 'tilt-switch'],
  kind: 'SWT',
  params(part) {
    const e = part.def.electrical;
    const own = e.field ? { field: e.field, states: e.states, moves: e.moves, maxVoltage: e.maxVoltage } : {};
    return { style: e.style, on: e.on, onContacts: e.onContacts, offContacts: e.offContacts, contact: e.contact, maxCurrent: e.maxCurrent, ...own };
  },
  // A switch in the board moves with a tap on the drawing too (`tap`), and its button says where it
  // goes (`moves`: the button's words while the control is false, and while it is true).
  controls: (p) => ({ [p.field ?? 'on']: { scale: 'toggle', value: Boolean(p.on), ...(p.moves && { moves: p.moves, tap: true }) } }),
  set: (p, field, value) => (field === (p.field ?? 'on') ? { ...p, on: Boolean(value) } : null),
  elements(p, h) {
    return { closed: closedNow(p).map(([a, b]) => ({ a, b, el: h.add(resistorEl(h.pin(a), h.pin(b), p.contact)) })) };
  },
  read(entry, h) {
    const contacts = entry.closed.map(({ a, b, el }) => ({ a, b, current: el.currents(h.x, h.ctx)[0] }));
    // The tag shows the contact that carries the most.
    const main = contacts.reduce((best, c) => (!best || Math.abs(c.current) > Math.abs(best.current) ? c : best), null);
    const out = { on: entry.on, contacts, current: main ? main.current : 0 };
    if (!entry.states) return out;
    // What its open contacts hold, pin to pin, and the word for its position.
    const at = (name) => h.volt(entry.pins.find((p) => p.name === name).index);
    const open = (entry.on ? entry.offContacts : entry.onContacts).map(([a, b]) => ({ a, b, voltage: at(a) - at(b) }));
    return { ...out, open, state: entry.states[entry.on ? 1 : 0] };
  },
  pinCurrents(entry, out, h) {
    const result = Object.fromEntries(entry.pins.map((p) => [p.name, 0]));
    for (const { a, b, el } of entry.closed) {
      const i = el.currents(h.x, h.ctx)[0];
      result[a] += i;
      result[b] -= i;
    }
    return result;
  },
  limits: (entry, r) => [
    ...r.contacts.map((c) => stress('SIM_OVER_CURRENT', 'current', Math.abs(c.current), entry.maxCurrent, 'A')),
    ...(r.open ?? []).map((c) => stress('SIM_SWITCH_VOLTAGE', 'voltage', Math.abs(c.voltage), entry.maxVoltage, 'V')),
  ],
  lines(p, h) {
    const lines = [h.q('switch.state', h.t(p.state ?? (p.on ? 'state.on' : 'state.off')))];
    for (const c of p.contacts) lines.push(h.q('switch.contact', h.t('sim.switch.contact', { a: c.a, b: c.b, current: h.f(c.current, 'A') })));
    if (!p.contacts.length) lines.push(h.q('current', h.f(0, 'A')));
    return lines;
  },
  tag: (r) => ({ label: '', value: Math.abs(r.current), key: 'current' }),
  probe: (r) => ({ key: 'probe.toggle', value: Math.abs(r.current) }),
  scope: (r) => ({ v: null, i: { label: null, value: r.current } }),
  // Falstad's switch, left in the same position (not momentary); exact: the kit's resistances.
  falstad(d, f) {
    const p = d.params;
    for (const [a, b] of [...p.onContacts, ...p.offContacts]) {
      const closed = (p.on ? p.onContacts : p.offContacts).some(([x, y]) => x === a && y === b);
      if (f.exact) {
        if (closed) f.resistor(f.pin(d, a), f.pin(d, b), p.contact);
      } else f.toggle(f.pin(d, a), f.pin(d, b), closed);
    }
  },
};
