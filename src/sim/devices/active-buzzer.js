// Active buzzer TMB12A05 (12 mm, 5 V; a part number of the `buzzer` type): a piezo disc with an oscillator
// inside, so it sounds on plain DC and needs no square wave. Its two leads have a polarity (the long
// lead and the + on its case); reversed it stays silent.
//
// The model (models.js ACTIVE_BUZZER): a load that takes nothing under 1.5 V and, from 2.5 V up, a
// resistor of rated voltage over rated current (5 V / 30 mA = 167 Ω), the change rounded between them
// (a smoothstep over a volt, so the solver has a slope everywhere). It sounds, at 2.3 kHz, while the
// voltage across it, + to −, is at least 3.5 V. Off or reversed it takes next to nothing (a microamp per volt); over 0.5 V the card
// says so (SIM_REVERSE_VOLTAGE), and the passive buzzer's DC note does not apply to it.
//
// The reading has the voltage and current across it, whether it sounds and its pitch. It shares the
// two-lead tag and tracks nothing over time.

import { ACTIVE_BUZZER } from '../models.js';
import { GMIN } from '../models.js';
import { stress, currentTag, volt } from './shared.js';

const resistance = (m) => m.rated / m.current;
// What it leaks with the oscillator off, either way round [A]: a megohm, so a collector that floats while
// a transistor is off sits at ground and not wherever its leakage current would push it.
const LEAK = 1e-6;
const smooth = (u) => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u));
const smoothSlope = (u) => (u <= 0 || u >= 1 ? 0 : 6 * u * (1 - u));

// Current in at pin 1 (+) for a voltage v across it, and its slope.
const law = (m, v) => {
  const u = (v - m.silentBelow) / (m.fullAt - m.silentBelow);
  const s = smooth(u);
  const g = 1 / resistance(m);
  return { i: v * LEAK + (v > 0 ? v * g * s : 0), di: LEAK + (v > 0 ? g * (s + v * smoothSlope(u) / (m.fullAt - m.silentBelow)) : 0) };
};

function buzzerElement(a, b, m) {
  return {
    nodes: [a, b],
    links: [[a, b]],
    stamp(st, x) {
      const v = volt(x, a) - volt(x, b);
      const { i, di } = law(m, v);
      const g = di + GMIN;
      st.device(this.nodes, [i, -i], [[g, -g], [-g, g]], [volt(x, a), volt(x, b)]);
      return false;
    },
    currents(x) {
      const { i } = law(m, volt(x, a) - volt(x, b));
      return [i, -i];
    },
  };
}

export const activeBuzzer = {
  types: ['buzzer'],
  accepts: (part) => part.def.electrical?.kind === 'BZA',
  kind: 'BZA',
  params: (part) => ({ part: part.def.electrical.part, model: { ...ACTIVE_BUZZER, ...part.raw.model } }),
  elements: (p, h) => ({ main: h.add(buzzerElement(h.at(0), h.at(1), p.model)) }),
  read(entry, h) {
    const voltage = h.volt(entry.pins[0].index) - h.volt(entry.pins[1].index);
    const current = entry.main.currents(h.x, h.ctx)[0];
    const sounding = voltage >= entry.model.minVoltage - 0.005; // a few millivolts of wire drop do not silence it
    return {
      voltage,
      current,
      power: voltage * current,
      sounding,
      frequency: sounding ? entry.model.frequency : 0,
      state: sounding ? 'sounding' : voltage < -entry.model.maxReverse ? 'reversed' : 'silent',
    };
  },
  limits(entry, r) {
    return [
      stress('SIM_REVERSE_VOLTAGE', 'reverse', -r.voltage, entry.model.maxReverse, 'V', { param: 'voltage' }),
      stress('SIM_OVER_POWER', 'power', r.power, entry.model.maxPower, 'W'),
    ];
  },
  lines(p, h) {
    return [
      h.raw(`buzzer.${p.sounding ? 'sounding' : 'silent'}`, p.sounding ? h.t('sim.buzzer.sounding', { frequency: h.f(p.frequency, 'Hz') }) : h.t(`sim.buzzer.${p.state === 'reversed' ? 'reversed' : 'silent'}`)),
      h.q('voltage', h.f(p.voltage, 'V')),
      h.q('current', h.f(p.current, 'A')),
      h.q('power', h.f(p.power, 'W')),
    ];
  },
  tag: currentTag,
  // An equivalent: a resistor of what it takes now (Falstad has no oscillator inside a buzzer).
  falstad(d, f) {
    const now = f.reading?.parts?.[d.id];
    const r = now && now.current > 1e-6 ? now.voltage / now.current : resistance(d.params.model);
    f.resistor(d.pins[0].node, d.pins[1].node, r);
    f.note('falstad.buzzer-active', { part: d.id, resistance: { value: r, unit: 'Ω' } });
  },
};
