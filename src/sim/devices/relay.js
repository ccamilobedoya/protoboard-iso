// A relay (SRD-05VDC-SL-C): its coil, a resistance in series with an inductance from A1 to A2 (no
// polarity), and its armature, a memory with hysteresis that pulls in once the coil's current
// reaches the pull-in current and lets go once it falls to the drop-out current, each after the
// armature's travel; it changes between time steps, as the 555's latch does (../mna.js relayCore).
// The changeover contact joins COM to NC at rest and to NO while pulled in: its contact resistance
// when closed, its insulation resistance when open. Only the pins the circuit wires are its; the
// others are inner nodes (a contact left in the air).
//
// The reading: the coil's voltage and current, the thresholds, where the armature is and whether it
// is on its way, each contact's current. Stresses: the coil's drive over its 120 % (6 V, as I·R, so
// the spike below does not count), a closed contact over 10 A, and the inductive kick: switched off
// with nothing across it, the coil's current must go on for an instant and drives the voltage at its
// ends far the other way (a transistor that cut it off takes it on its collector); a diode across the
// coil holds that to about a volt. In the kit the spike is the coil's current through its losses (a
// resistance across it: some 700 V, its transistors having no breakdown); on the bench it reaches
// the transistor's breakdown, and damages it.

import { resistor, inductor as inductorEl, relayCore } from '../mna.js';
import { RELAYS } from '../models.js';
import { stress, q } from './shared.js';

const CONTACTS = ['COM', 'NO', 'NC'];

export const relay = {
  types: ['relay'],
  kind: 'RLY',
  params(part) {
    const e = part.def.electrical;
    return { part: e.part, names: part.pinNames, model: { ...RELAYS[e.part], ...part.raw.model } };
  },
  elements(p, h) {
    const m = p.model;
    const at = (name) => (p.names.includes(name) ? h.pin(name) : h.inner());
    const [a1, a2, com, no, nc] = ['A1', 'A2', ...CONTACTS].map(at);
    const mid = h.inner();
    const coil = h.add(resistor(a1, mid, m.coil));
    const winding = h.add(inductorEl(mid, a2, m.inductance));
    // The coil's losses as a resistance across it: what bounds its spike when nothing else takes it.
    h.add(resistor(a1, a2, m.parallel));
    const core = h.add(relayCore({ com, no, nc }, coil, m));
    // Its own times, for the page's pace: the coil's L/R and the armature's travel.
    core.times = [m.inductance / m.coil, m.operate];
    return { coil, winding, core, ends: [a1, a2] };
  },
  read(entry, h) {
    const m = entry.model;
    const i = entry.coil.currents(h.x)[0];
    const v = h.volt(entry.ends[0]) - h.volt(entry.ends[1]);
    // Each contact's current from COM to its throw (the element's currents go into it at each node).
    const c = entry.core.currents(h.x);
    const [ino, inc] = [-c[1], -c[2]];
    const closed = entry.core.closed;
    const moving = entry.core.wants(h.x) !== closed;
    const state = moving ? (closed ? 'letting' : 'pulling') : closed ? 'operated' : 'released';
    // The voltage the coil's own current drives against what drives it: a kick when it points back
    // against the current it had (the step before: cut off, its current is already gone at this one).
    const before = Math.abs(entry.winding.iprev) > 1e-6 ? entry.winding.iprev : i;
    const kick = Math.abs(before) > 1e-6 && v * before < 0 ? Math.abs(v) : 0;
    const all = { A1: i, A2: -i, COM: ino + inc, NO: -ino, NC: -inc };
    const currents = Object.fromEntries(entry.names.map((n) => [n, all[n]]));
    return { closed, state, voltage: v, current: i, drive: Math.abs(i) * m.coil, kick, power: v * i, pullIn: m.pullIn, dropOut: m.dropOut, contacts: { NO: ino, NC: inc }, currents };
  },
  limits(entry, r) {
    const m = entry.model;
    return [
      stress('SIM_RELAY_COIL', 'voltage', r.drive, m.maxVoltage, 'V'),
      stress('SIM_OVER_CURRENT', 'current', Math.abs(r.closed ? r.contacts.NO : r.contacts.NC), m.maxContactCurrent, 'A'),
      stress('SIM_RELAY_KICK', 'voltage', r.kick, m.nominal, 'V', { reportMax: false }),
    ];
  },
  lines(p, h) {
    const contact = p.closed ? 'NO' : 'NC';
    return [
      h.raw(`relay.${p.state}`, h.t(`sim.relay.${p.state}`)),
      // Under a millivolt and a microampere it is the solver's leakage through an open transistor.
      h.q('relay.coil', h.f(Math.abs(p.voltage) < 1e-3 ? 0 : p.voltage, 'V')),
      h.q('relay.current', h.f(Math.abs(p.current) < 1e-6 ? 0 : p.current, 'A')),
      h.q('relay.pull', `${h.f(p.pullIn, 'A')} / ${h.f(p.dropOut, 'A')}`),
      h.q('relay.contact', h.t('sim.switch.contact', { a: 'COM', b: contact, current: h.f(Math.abs(p.contacts[contact]) < 1e-9 ? 0 : p.contacts[contact], 'A') })),
      h.q('power', h.f(p.power, 'W')),
    ];
  },
  // The tag: the coil's current, what its driver has to give.
  tag: (r) => ({ label: 'I', value: Math.abs(r.current), key: 'relay.current' }),
  scope: (r) => ({ v: { label: 'V', value: r.voltage }, i: { label: 'I', value: r.current } }),
  // An equivalent: the coil as its resistance and inductance, the contact as a switch where the
  // armature is now (Falstad's own relay has other thresholds and times).
  falstad(d, f) {
    const m = d.params.model;
    const node = (name) => (d.params.names.includes(name) ? f.pin(d, name) : null);
    const [a1, a2, com, no, nc] = ['A1', 'A2', ...CONTACTS].map(node);
    const closed = Boolean(f.reading?.parts?.[d.id]?.closed);
    if (a1 && a2) {
      const mid = f.inner(d.id);
      f.resistor(a1, mid, m.coil);
      f.inductor(mid, a2, m.inductance);
    }
    if (com && no) f.toggle(com, no, closed);
    if (com && nc) f.toggle(com, nc, !closed);
    f.note('falstad.relay', { part: d.id, contact: closed ? 'COM–NO' : 'COM–NC', current: q(m.pullIn, 'A') });
  },
};
