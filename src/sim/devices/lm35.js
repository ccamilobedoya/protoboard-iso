// LM35 temperature sensor (TO-92: +VS, VOUT, GND): a behavioural source. Its output follows
// 10 mV per °C of the temperature the circuit (or its slider) gives, behind the output resistance of
// its datasheet, while +VS leaves it room; it takes its quiescent current from +VS to GND. The same
// element as a regulator's (../mna.js regulatorElement: a reference held at the output, a current of
// its own from the supply), with 10 mV · T as its reference (../models.js LM35).
//
// The reading has the temperature, the voltage it should give (10 mV · T), the output and the supply
// it has, the current it sources from VOUT and the quiescent current. Stresses: the supply over its
// 30 V or reversed, the output overloaded (10 mA); notes: the supply under its 4 V, a temperature its
// grade (or the basic circuit, from 2 °C) does not read.

import { regulatorElement, resistor } from '../mna.js';
import { LM35 } from '../models.js';
import { stress, note, q } from './shared.js';

// The output it holds: 10 mV/°C, never under 0 V (one positive supply: nothing pulls it lower).
const target = (temperature) => LM35.gain * Math.max(0, temperature);

export const lm35 = {
  types: ['temperature-sensor'],
  kind: 'TMP',
  params(part) {
    const e = part.def.electrical;
    const grade = LM35.grades[e.grade] ?? LM35.grades.LM35DZ;
    return { part: e.part, temperature: e.temperature, range: grade.range, accuracy: grade.limit, model: { ...LM35, ...part.raw.model } };
  },
  // Its rated range, at most −55 to 150 °C typed; the slider over what the basic circuit reads (0 °C up).
  controls: (p) => ({ temperature: { min: 0, max: p.range[1], limit: [-55, 150], scale: 'linear', unit: '°C', step: 1, value: p.temperature } }),
  set: (p, field, value) => (field === 'temperature' ? { ...p, temperature: value } : null),
  elements(p, h) {
    const mid = h.inner();
    const m = p.model;
    const main = h.add(regulatorElement(h.pin('+VS'), h.pin('GND'), mid, { vref: target(p.temperature), dropout: m.dropout, quiescent: m.quiescent }));
    const out = h.add(resistor(mid, h.pin('VOUT'), m.outputResistance));
    return { main, out };
  },
  read(entry, h) {
    const at = (name) => h.volt(entry.pins.find((p) => p.name === name).index);
    const [iin, ignd] = entry.main.currents(h.x, h.ctx);
    const iout = entry.out.currents(h.x, h.ctx)[0];
    const [vs, vout] = [at('+VS') - at('GND'), at('VOUT') - at('GND')];
    const quiescent = -ignd;
    return {
      temperature: entry.temperature,
      ideal: target(entry.temperature),
      vs,
      vout,
      current: iout,
      quiescent,
      power: vs * iin - vout * iout,
      state: vs < 0.5 ? 'off' : vs < entry.model.minSupply ? 'low' : 'ok',
      currents: { '+VS': iin, VOUT: -iout, GND: ignd },
    };
  },
  limits(entry, r) {
    const m = entry.model;
    const out = [
      stress('SIM_IC_SUPPLY', 'voltage', r.vs, m.maxSupply, 'V'),
      stress('SIM_REVERSE_VOLTAGE', 'reverse', -r.vs, m.maxReverse, 'V', { param: 'voltage' }),
      stress('SIM_OVER_CURRENT', 'current', Math.abs(r.current), m.maxCurrent, 'A'),
    ];
    if (r.state === 'low') out.push(note('warning', 'SIM_LM35_LOW_SUPPLY', { part: entry.id, voltage: q(r.vs, 'V'), min: q(m.minSupply, 'V') }));
    const [lo, hi] = entry.range;
    if (r.state === 'ok' && (r.temperature < Math.max(lo, m.minTemperature) || r.temperature > hi)) out.push(note('info', 'SIM_LM35_RANGE', { part: entry.id, temperature: q(r.temperature, '°C'), from: q(Math.max(lo, m.minTemperature), '°C'), to: q(hi, '°C') }));
    return out;
  },
  lines(p, h) {
    const lines = [];
    if (p.state !== 'ok') lines.push(h.raw(`lm35.${p.state}`, h.t(`sim.lm35.${p.state}`)));
    lines.push(
      h.q('lm35.temperature', `${String(Math.round(p.temperature * 10) / 10).replace('.', h.decimal)} °C`),
      h.q('lm35.vout', h.f(p.vout, 'V')),
      h.q('lm35.vs', h.f(p.vs, 'V')),
      // Under a nanoampere it is the reader's leakage (an ADC's input), not a current it gives.
      h.q('lm35.iout', h.f(Math.abs(p.current) < 1e-9 ? 0 : p.current, 'A')),
      h.q('lm35.own', h.f(p.quiescent, 'A')),
    );
    return lines;
  },
  // The tag: what it takes from its supply (its own current and what VOUT gives).
  tag: (r) => ({ label: '', value: Math.abs(r.currents['+VS']), key: 'current' }),
  scope: (r) => ({ v: { label: 'Vout', value: r.vout }, i: null }),
  // An equivalent: a source of the output it gives now behind its output resistance, and a resistor
  // from +VS to GND that takes its quiescent current at this supply.
  falstad(d, f) {
    const p = d.params;
    const [vs, out, gnd] = ['+VS', 'VOUT', 'GND'].map((name) => f.pin(d, name));
    const now = f.reading?.parts?.[d.id];
    const vout = now && now.state !== 'off' ? now.vout + now.current * p.model.outputResistance : target(p.temperature);
    const mid = f.inner(d.id);
    f.voltage(gnd, mid, vout);
    f.resistor(mid, out, p.model.outputResistance);
    f.resistor(vs, gnd, now?.vs > 1 ? Math.min(1e7, now.vs / p.model.quiescent) : 1e5);
    f.note('falstad.lm35', { part: d.id, voltage: q(vout, 'V'), temperature: q(p.temperature, '°C') });
  },
};
