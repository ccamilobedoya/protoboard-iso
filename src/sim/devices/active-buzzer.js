// Active buzzer TMB12A05 (12 mm, 5 V; a part number of the `buzzer` type): a piezo disc with an oscillator
// inside, so it sounds on plain DC and needs no square wave. Its two leads have a polarity (the long
// lead and the + on its case); reversed it stays silent.
//
// The model (models.js ACTIVE_BUZZER): under 1.5 V it takes next to nothing; from 2.0 V up it is a resistor
// of rated voltage over rated current (5 V / 30 mA = 167 Ω) and it sounds, at 2.3 kHz, weakly on a 3.3 V pin
// (19.8 mA) and fully on 5 V. Between 1.5 and 2.0 V the current rises through a smoothstep, so the law is
// monotonic and Newton has a slope everywhere. There is no hysteresis: it is a function of the voltage
// across it. Reversed it is an open circuit of 100 kΩ, silent; over 1 V the card says so
// (SIM_REVERSE_VOLTAGE). Over 7 V SIM_IC_SUPPLY (the kit's "more than its maximum" warning), over 35 mA
// SIM_OVER_CURRENT. `SIM_BUZZER_DC` is the passive one's note and does not apply.
//
// The reading has the voltage and current across it, whether it sounds, its pitch and its level in dB at
// 10 cm (85 − 40·log10(5/V) below 5 V).

import { ACTIVE_BUZZER, GMIN } from '../models.js';
import { stress, currentTag, volt, positiveNumbers } from './shared.js';

const resistance = (m) => m.rated / m.current;
const smooth = (u) => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u));
const smoothSlope = (u) => (u <= 0 || u >= 1 ? 0 : 6 * u * (1 - u));

// Current in at pin 1 (+) for a voltage v across it, and its slope.
const law = (m, v) => {
  if (v <= 0) return { i: v * m.reverseLeak, di: m.reverseLeak };
  const span = m.start - m.rampFrom;
  const u = (v - m.rampFrom) / span;
  const s = smooth(u);
  const g = 1 / resistance(m);
  return { i: v * m.leak + v * g * s, di: m.leak + g * (s + (v * smoothSlope(u)) / span) };
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
  params: (part) => {
    const m = { ...ACTIVE_BUZZER, ...positiveNumbers(part.raw.model) };
    // The ramp must start under the start voltage.
    if (!(m.rampFrom < m.start)) m.rampFrom = m.start / 2;
    return { part: part.def.electrical.part, model: m };
  },
  elements: (p, h) => ({ main: h.add(buzzerElement(h.at(0), h.at(1), p.model)) }),
  read(entry, h) {
    const m = entry.model;
    const voltage = h.volt(entry.pins[0].index) - h.volt(entry.pins[1].index);
    const current = entry.main.currents(h.x, h.ctx)[0];
    const sounding = voltage >= m.start - 0.005; // a few millivolts of wire drop do not silence it
    return {
      voltage,
      current,
      power: voltage * current,
      sounding,
      frequency: sounding ? m.frequency : 0,
      level: sounding ? m.level - 40 * Math.log10(Math.max(1, m.rated / voltage)) : 0,
      state: sounding ? 'sounding' : voltage < -m.maxReverse ? 'reversed' : 'silent',
    };
  },
  limits(entry, r) {
    const m = entry.model;
    return [
      stress('SIM_REVERSE_VOLTAGE', 'reverse', -r.voltage, m.maxReverse, 'V', { param: 'voltage' }),
      stress('SIM_IC_SUPPLY', 'voltage', r.voltage, m.maxVoltage, 'V'),
      stress('SIM_OVER_CURRENT', 'current', Math.max(0, r.current), m.maxCurrent, 'A'),
    ];
  },
  lines(p, h) {
    const lines = [h.raw(`buzzer.${p.sounding ? 'sounding' : 'silent'}`, p.sounding ? h.t('sim.buzzer.sounding', { frequency: h.f(p.frequency, 'Hz') }) : h.t(`sim.buzzer.${p.state === 'reversed' ? 'reversed' : 'silent'}`))];
    if (p.sounding) lines.push(h.q('buzzer.level', h.t('sim.buzzer.level', { level: Math.round(p.level) })));
    lines.push(h.q('voltage', h.f(p.voltage, 'V')), h.q('current', h.f(p.current, 'A')), h.q('power', h.f(p.power, 'W')));
    return lines;
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
