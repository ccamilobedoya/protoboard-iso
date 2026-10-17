// Switches that stay put (KCD1 rocker, 7 × 7 latching button): each contact closed in the
// present position is a small resistance; open ones are not there. Control: on/off (a toggle).

import { resistor as resistorEl } from '../mna.js';
import { stress } from './shared.js';

const closedNow = (p) => (p.on ? p.onContacts : p.offContacts);

export const toggle = {
  types: ['switch'],
  kind: 'SWT',
  params(part) {
    const e = part.def.electrical;
    return { style: e.style, on: e.on, onContacts: e.onContacts, offContacts: e.offContacts, contact: e.contact, maxCurrent: e.maxCurrent };
  },
  controls: (p) => ({ on: { scale: 'toggle', value: Boolean(p.on) } }),
  set: (p, field, value) => (field === 'on' ? { ...p, on: Boolean(value) } : null),
  elements(p, h) {
    return { closed: closedNow(p).map(([a, b]) => ({ a, b, el: h.add(resistorEl(h.pin(a), h.pin(b), p.contact)) })) };
  },
  read(entry, h) {
    const contacts = entry.closed.map(({ a, b, el }) => ({ a, b, current: el.currents(h.x, h.ctx)[0] }));
    // The tag shows the contact that carries the most.
    const main = contacts.reduce((best, c) => (!best || Math.abs(c.current) > Math.abs(best.current) ? c : best), null);
    return { on: entry.on, contacts, current: main ? main.current : 0 };
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
  limits: (entry, r) => r.contacts.map((c) => stress('SIM_OVER_CURRENT', 'current', Math.abs(c.current), entry.maxCurrent, 'A')),
  lines(p, h) {
    const lines = [h.q('switch.state', h.t(p.on ? 'state.on' : 'state.off'))];
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
