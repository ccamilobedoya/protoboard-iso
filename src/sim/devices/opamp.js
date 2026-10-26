// Op-amps (LM358, LM324, µA741, NE5532) and comparators (LM393): a behavioural model per
// amplifier (models.js, OPAMPS; mna.js, opampStage and comparatorStage) and the chip's own
// current as a resistor between its supply pins. An amplifier with none of its three pins
// connected to anything else is left out (a dual op-amp with one half in use), so its pins do not
// read as floating.

import { resistor, opampStage, comparatorStage } from '../mna.js';
import { OPAMPS } from '../models.js';
import { stress } from './shared.js';

export const opamp = {
  types: ['ic'],
  kind: 'OPA',
  accepts: (part) => Boolean(OPAMPS[part.def.electrical?.part]),
  params(part, c) {
    const model = { ...OPAMPS[part.def.electrical.part], ...part.raw.model };
    const nodeOf = new Map(part.pinNames.map((name, i) => [name, part.holes[i].node]));
    const alone = (pin) => (c.members?.[nodeOf.get(pin)] ?? []).every((id) => id === part.id);
    const channels = model.channels.map(([plus, minus, out], i) => ({ name: model.channels.length > 1 ? String(i + 1) : '', plus, minus, out, used: ![plus, minus, out].every(alone) }));
    return { model, channels };
  },
  elements(p, h) {
    const m = p.model;
    const vcc = h.pin(m.supply[0]);
    const vee = h.pin(m.supply[1]);
    const own = h.add(resistor(vcc, vee, m.quiescentAt / m.quiescent));
    const stages = p.channels.map((ch) => {
      if (!ch.used) {
        // Nothing is wired to it: no element, only a tie to the chip's supply so its pins do not
        // read as floating (inside the chip they are not).
        h.add({ nodes: [], links: [ch.plus, ch.minus, ch.out].map((name) => [h.pin(name), vee]), stamp: () => false, currents: () => [] });
        return null;
      }
      const pins = { p: h.pin(ch.plus), n: h.pin(ch.minus), vcc, vee };
      if (m.openCollector) return { stage: h.add(comparatorStage({ ...pins, out: h.pin(ch.out) }, m)) };
      const o = h.inner();
      return { stage: h.add(opampStage({ ...pins, o }, m)), rout: h.add(resistor(o, h.pin(ch.out), m.outputResistance)) };
    });
    return { own, stages };
  },
  read(entry, h) {
    const m = entry.model;
    const pin = (name) => entry.pins.find((x) => x.name === name).index;
    const ref = h.volt(pin(m.supply[1]));
    const currents = Object.fromEntries(entry.pins.map((x) => [x.name, 0]));
    const [iq] = entry.own.currents(h.x);
    currents[m.supply[0]] += iq;
    currents[m.supply[1]] -= iq;
    const amps = [];
    entry.channels.forEach((ch, k) => {
      const s = entry.stages[k];
      if (!s) return;
      const vplus = h.volt(pin(ch.plus)) - ref;
      const vminus = h.volt(pin(ch.minus)) - ref;
      const vout = h.volt(pin(ch.out)) - ref;
      let iout;
      let state;
      if (m.openCollector) {
        const [into] = s.stage.currents(h.x);
        currents[ch.out] += into;
        currents[m.supply[1]] -= into;
        iout = -into;
        state = s.stage.on(h.x) ? 'sinking' : 'open';
      } else {
        const [, , fromVcc, fromVee] = s.stage.currents(h.x);
        const [, atOut] = s.rout.currents(h.x);
        currents[m.supply[0]] += fromVcc;
        currents[m.supply[1]] += fromVee;
        currents[ch.out] += atOut;
        iout = -atOut;
        const { u, lo, hi } = s.stage.shape(h.x);
        state = u > hi ? 'high' : u < lo ? 'low' : 'linear';
      }
      amps.push({ name: ch.name, vplus, vminus, vout, current: iout, state });
    });
    // What the chip turns into heat: each pin's voltage times the current into it.
    const power = entry.pins.reduce((sum, x) => sum + h.volt(x.index) * currents[x.name], 0);
    const first = amps[0];
    return { supply: h.volt(pin(m.supply[0])) - ref, amps, power, currents, vout: first?.vout ?? 0, current: first?.current ?? 0 };
  },
  limits(entry, r) {
    const m = entry.model;
    return [
      stress('SIM_IC_SUPPLY', 'voltage', r.supply, m.maxSupply, 'V'),
      ...r.amps.map((a) => stress('SIM_OVER_CURRENT', 'current', Math.abs(a.current), m.maxCurrent, 'A')),
      stress('SIM_OVER_POWER', 'power', r.power, m.maxPower, 'W'),
    ];
  },
  lines(p, h) {
    const lines = [];
    for (const a of p.amps) {
      const tag = a.name ? `${h.t('sim.opamp.amp', { n: a.name })}: ` : '';
      lines.push(h.raw(`opamp.${a.state}`, `${tag}${h.t(`sim.opamp.${a.state}`)}`), h.q('opamp.vplus', h.f(a.vplus, 'V')), h.q('opamp.vminus', h.f(a.vminus, 'V')), h.q('opamp.vout', h.f(a.vout, 'V')), h.q('opamp.iout', h.f(a.current, 'A')));
    }
    lines.push(h.q('power', h.f(p.power, 'W')));
    return lines;
  },
  tag: (r) => (r.amps.length ? { label: 'Iout', value: Math.abs(r.current), key: 'opamp.iout' } : null),
  scope: (r) => (r.amps.length ? { v: { label: 'Vout', value: r.vout }, i: { label: 'Iout', value: r.current } } : null),
};
