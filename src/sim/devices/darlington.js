// Darlington transistor arrays (ULN2003A: seven channels; ULN2803A: eight), one open-collector
// driver per channel, every channel as the datasheet's schematic draws it:
//
//   IN ─ 2.7 kΩ ─┬─ base of Q1        Q1 and Q2 collectors ─ OUT (through `rc`)
//                └─ 7.2 kΩ ─ GND      Q1 emitter ─ base of Q2 ─ 3 kΩ ─ GND, Q2 emitter ─ GND
//   OUT ─▷|─ COM (the clamp diode, for the coil a channel drives)
//
// So a channel turns on from the voltage the datasheet says (VI(on) under 2.4 V at 200 mA), its
// output saturates at its VCE(sat), and an input left open sits at GND through the resistors: off.
// Q1 and Q2 are the kit's Ebers–Moll transistors (../mna.js bjt). A channel none of whose pins is
// wired to anything else is left out (tied to GND, so its pins do not read as floating).
//
// The numbers, from the Texas Instruments ULN2003A / ULN2803A datasheets (SLRS027, SLRS049):
//   rin 2.7 kΩ, r1 7.2 kΩ, r2 3 kΩ    the schematic's resistors (each Darlington pair)
//   q1, q2                            [assumed, fitted]: Is 1e-14 A and 1e-13 A, β 50 each (the
//                                     ULN2001A's hFE ≥ 1000 for the pair), so that VI(on) is 2.2 V at
//                                     200 mA (datasheet max 2.4 V) and 2.3 V at 300 mA (max 3 V)
//   rc 1 Ω                            [assumed, fitted]: the collector's bulk resistance, so that
//                                     VCE(sat) is 0.9 V at 100 mA, 1.0 V at 200 mA and 1.15 V at
//                                     350 mA (datasheet typical 0.9, 1.0, 1.2 V)
//   clamp                             [fitted]: VF 1.7 V at 350 mA (datasheet typical), n = 2.5
//   maxCurrent 0.5 A                  absolute maximum: peak collector current, per channel
//   maxClamp 0.5 A                    absolute maximum: output clamp current, per channel
//   maxOutput 50 V                    absolute maximum: collector-emitter voltage
//   maxInput 30 V                     absolute maximum: input voltage
//   maxTotal 2.5 A                    absolute maximum: total emitter (GND) current
//   maxPower 1.8 W                    [assumed]: a plastic DIP at 25 °C, θJA about 67 °C/W to a
//                                     junction of 150 °C (the datasheets' package tables)
// Not modelled: switching times, the substrate diodes, temperature.

import { resistor, bjt, junction } from '../mna.js';
import { stress } from './shared.js';

export const DARLINGTON = {
  rin: 2700, r1: 7200, r2: 3000, rc: 1,
  q1: { polarity: 'npn', is: 1e-14, bf: 50, br: 1 },
  q2: { polarity: 'npn', is: 1e-13, bf: 50, br: 1 },
  clamp: { is: 1e-12, n: 2.5 },
  maxCurrent: 0.5, maxClamp: 0.5, maxOutput: 50, maxInput: 30, maxTotal: 2.5, maxPower: 1.8,
};
const CHANNELS = { ULN2003: 7, ULN2803: 8 };
// Over this a channel is called on (it carries current) [assumed: its leakage is under 50 µA].
const ON = 1e-4;

export const darlington = {
  types: ['ic'],
  kind: 'DRV',
  modelText: 'darlington',
  accepts: (part) => Boolean(CHANNELS[part.def.electrical?.part]),
  params(part, c) {
    const n = CHANNELS[part.def.electrical.part];
    const nodeOf = new Map(part.pinNames.map((name, i) => [name, part.holes[i]?.node]));
    const alone = (pin) => (c.members?.[nodeOf.get(pin)] ?? []).every((id) => id === part.id);
    const channels = Array.from({ length: n }, (_, i) => ({ name: String(i + 1), used: !alone(`IN${i + 1}`) || !alone(`OUT${i + 1}`) }));
    return { model: { ...DARLINGTON, ...part.raw.model }, channels };
  },
  elements(p, h) {
    const m = p.model;
    const gnd = h.pin('GND');
    const com = h.pin('COM');
    const stages = p.channels.map((ch) => {
      const inp = h.pin(`IN${ch.name}`);
      const out = h.pin(`OUT${ch.name}`);
      if (!ch.used) {
        h.add({ nodes: [], links: [[inp, gnd], [out, gnd]], stamp: () => false, currents: () => [] });
        return null;
      }
      const b1 = h.inner();
      const b2 = h.inner();
      const cx = h.inner();
      return {
        rin: h.add(resistor(inp, b1, m.rin)),
        r1: h.add(resistor(b1, gnd, m.r1)),
        q1: h.add(bjt(cx, b1, b2, m.q1)),
        r2: h.add(resistor(b2, gnd, m.r2)),
        q2: h.add(bjt(cx, b2, gnd, m.q2)),
        rc: h.add(resistor(out, cx, m.rc)),
        clamp: h.add(junction(out, com, m.clamp)),
      };
    });
    return { stages };
  },
  read(entry, h) {
    const pin = (name) => entry.pins.find((x) => x.name === name).index;
    const ref = h.volt(pin('GND'));
    const currents = Object.fromEntries(entry.pins.map((x) => [x.name, 0]));
    const channels = [];
    entry.channels.forEach((ch, k) => {
      const s = entry.stages[k];
      if (!s) return;
      const iin = s.rin.currents(h.x)[0];
      const [ic] = s.rc.currents(h.x); // into OUT, down to the transistors
      const [iclamp] = s.clamp.currents(h.x); // out of OUT, through the diode to COM
      const vin = h.volt(pin(`IN${ch.name}`)) - ref;
      const vout = h.volt(pin(`OUT${ch.name}`)) - ref;
      currents[`IN${ch.name}`] += iin;
      currents[`OUT${ch.name}`] += ic + iclamp;
      currents.COM -= iclamp;
      currents.GND -= iin + ic;
      channels.push({ name: ch.name, vin, vout, current: ic, clamp: iclamp, input: iin, on: ic > ON });
    });
    // What the chip turns into heat: each pin's voltage times the current into it.
    const power = entry.pins.reduce((sum, x) => sum + h.volt(x.index) * currents[x.name], 0);
    const top = channels.reduce((a, b) => (Math.abs(b.current) > Math.abs(a?.current ?? 0) ? b : a), null);
    return { channels, power, ground: -currents.GND, currents, current: top?.current ?? 0, vout: top?.vout ?? 0 };
  },
  limits(entry, r) {
    const m = entry.model;
    // By the circuit's channels (the reading has only the used ones): `catalog` reads them all.
    const at = (name) => r.channels.find((c) => c.name === name);
    return [
      ...entry.channels.map((ch) => [ch.name, at(ch.name)]).filter(([, c]) => c).flatMap(([n, c]) => [
        stress('SIM_OVER_CURRENT', 'current', Math.abs(c.current), m.maxCurrent, 'A', { pin: `OUT${n}`, of: 'output' }),
        stress('SIM_OVER_CURRENT', 'current', Math.abs(c.clamp), m.maxClamp, 'A', { pin: `OUT${n}`, of: 'clamp' }),
        stress('SIM_IC_PIN_VOLTAGE', 'voltage', c.vout, m.maxOutput, 'V', { pin: `OUT${n}`, of: 'output' }),
        stress('SIM_IC_PIN_VOLTAGE', 'voltage', c.vin, m.maxInput, 'V', { pin: `IN${n}`, of: 'input' }),
      ]),
      stress('SIM_OVER_CURRENT', 'current', Math.abs(r.ground), m.maxTotal, 'A', { of: 'ground' }),
      stress('SIM_OVER_POWER', 'power', r.power, m.maxPower, 'W'),
    ];
  },
  lines(p, h) {
    const lines = p.channels.map((c) => h.raw(`darlington.${c.on ? 'on' : 'off'}`, h.t(`sim.darlington.${c.on ? 'on' : 'off'}`, { n: c.name, vin: h.f(c.vin, 'V'), vout: h.f(c.vout, 'V'), current: h.f(Math.abs(c.current) < 1e-6 ? 0 : c.current, 'A') })));
    lines.push(h.q('power', h.f(p.power, 'W')));
    return lines;
  },
  // The tag: the channel that carries most, what its load takes.
  tag: (r) => (r.channels.length ? { label: 'Iout', value: Math.abs(r.current), key: 'darlington.iout' } : null),
  scope: (r) => (r.channels.length ? { v: { label: 'Vout', value: r.vout }, i: { label: 'Iout', value: r.current } } : null),
};
