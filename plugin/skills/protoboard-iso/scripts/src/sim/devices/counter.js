// The CD4017: a decade counter with ten decoded outputs (logic.js has what the clocked chips share).
// Its logic, from the datasheet's truth table:
// - CLK rising advances the count while CE (clock inhibit, pin 13) is low; CE falling while CLK is high
//   advances it too (the table's second line); with CE high the count holds;
// - MR (reset) high puts the count at 0 at once and holds it there;
// - exactly one of Q0…Q9 is high, the one of the count; CO is high for counts 0 to 4 and low for 5 to
//   9, so it rises once every ten clocks (the next counter's clock).
// A Qn wired back to MR makes it count to n: the count reaches n, Qn goes high and the next step's
// reading of MR puts it back at 0 (on a real chip within nanoseconds; in the kit one time step).
// At power-up the count is 0 (a real chip's is undefined until MR is pulsed). The kit's buttons do not
// bounce: a real button on CLK needs a debounce (an RC and the clock's Schmitt input), or one press
// counts several.
//
// Numbers (TI CD4017B datasheet, typical at 25 °C unless said):
// - inputs: low under 0.3·VDD, high over 0.7·VDD (VIL 1.5 V and VIH 3.5 V at VDD = 5 V); the clock has
//   Schmitt-trigger action: in between every input keeps its level;
// - supply: recommended 3 V to 18 V, absolute maximum 20 V: damage over 20 V, a note between 18 V and
//   20 V (not guaranteed); the electrical characteristics stop at 15 V, so past 15 V the drive is held
//   at its 15 V figures;
// - outputs: IOL 1 mA at VOL 0.4 V (VDD 5 V), 2.6 mA at 0.5 V (10 V), 6.8 mA at 1.5 V (15 V), IOH the
//   same: about 400 Ω, 192 Ω and 221 Ω near the rail, interpolated in between. Away from the rail the
//   output transistor runs out of current: IOH −3.2 mA at VO = 2.5 V, VDD = 5 V, is a saturation of
//   3.35 mA in the drive's tanh (logic.js); at other supplies it grows as (VDD − 1.5 V)² [assumed: a
//   MOSFET's square law, threshold 1.5 V]. So an LED straight on an output at 5 V takes about 3 mA.
//   Above 10 V that estimate likely overestimates a real output (about 28 mA into an LED at 12 V, where a
//   real chip gives perhaps 10 to 15 mA): the datasheet's table gives no current far from the rail at
//   10 V or 15 V, only near it (2.6 mA at 0.5 V, 6.8 mA at 1.5 V), which the model meets; kept, and said;
// - absolute maximum: 100 mW in each output transistor, 500 mW for the package; IDD 5 µA at most at
//   5 V: the chip's own current as a resistance from VDD to VSS.

import { resistor } from '../mna.js';
import { REVERSE_LIMITS } from '../models.js';
import { stress, reverseSupply } from './shared.js';
import { logicCore, logicReading, openInputs, logicNotes } from './logic.js';

const SAT_AT_5V = 3.35e-3;
const THRESHOLD = 1.5;
export const COUNTERS = {
  CD4017: {
    vih: 0.7,
    vil: 0.3,
    // Where it switches: near half the supply [assumed 0.45–0.55]; the clock has Schmitt-trigger action
    // (TI CD4017B), about 1 V of hysteresis at 5 V [assumed 0.4–0.6 of VDD].
    switching: { default: [0.45, 0.55], CLK: [0.4, 0.6] },
    minSupply: 3,
    maxSupply: 18,
    maxAbsolute: 20,
    // [VDD, output resistance near the rail]: VOL / IOL at 5, 10 and 15 V.
    resistance: [
      [5, 0.4 / 1e-3],
      [10, 0.5 / 2.6e-3],
      [15, 1.5 / 6.8e-3],
    ],
    maxOutputPower: 0.1,
    maxPower: 0.5,
    quiescentResistance: 5 / 5e-6,
  },
};

// The output resistance at a supply: linear between the datasheet's points, held beyond them.
export function counterResistance(table, vdd) {
  if (vdd <= table[0][0]) return table[0][1];
  for (let k = 1; k < table.length; k++) {
    const [v1, r1] = table[k];
    const [v0, r0] = table[k - 1];
    if (vdd <= v1) return r0 + ((r1 - r0) * (vdd - v0)) / (v1 - v0);
  }
  return table.at(-1)[1];
}
// Held at its 15 V value past 15 V, where the datasheet's figures end.
export const counterSaturation = (vdd) => SAT_AT_5V * (Math.max(0, Math.min(vdd, 15) - THRESHOLD) / (5 - THRESHOLD)) ** 2 + 1e-9;

const INPUTS = ['CLK', 'CE', 'MR'];
// What an input left open does, taken as low (SIM_IC_INPUT_OPEN's variant): the datasheet's truth table.
const OPEN_MEANS = { CLK: 'noClock', CE: 'counts', MR: 'noReset' };
const OUTPUTS = ['Q0', 'Q1', 'Q2', 'Q3', 'Q4', 'Q5', 'Q6', 'Q7', 'Q8', 'Q9', 'CO'];

const LOGIC = {
  initial: () => ({ count: 0 }),
  step(s, lv, rising, falling) {
    if ((rising.has('CLK') && lv.CE !== 1) || (falling.has('CE') && lv.CLK === 1)) s.count = (s.count + 1) % 10;
    if (lv.MR === 1) s.count = 0;
  },
  outputs: (s) => [...Array.from({ length: 10 }, (_, k) => (k === s.count ? 1 : 0)), s.count < 5 ? 1 : 0],
};

export const counter = {
  types: ['ic'],
  kind: 'CNT',
  modelText: 'counter',
  accepts: (part) => part.def.electrical?.function === 'decade counter' && Boolean(COUNTERS[part.def.electrical.part]),
  // The count and what each input last read: carried over when the circuit is rebuilt (a button
  // pressed) and kept between steps.
  state: ['logic', 'levels', 'outs', 'between', 'rested'],
  // engine.hold: a state the review visits (logic.js `held`).
  holds: true,
  params(part, c) {
    const model = { ...COUNTERS[part.def.electrical.part], ...part.raw.model };
    return { part: part.def.electrical.part, model, open: openInputs(part, c, INPUTS, OPEN_MEANS) };
  },
  elements(p, h) {
    const m = p.model;
    const vdd = h.pin('VDD');
    const vss = h.pin('VSS');
    const own = h.add(resistor(vdd, vss, m.quiescentResistance));
    for (const name of Object.keys(p.open)) h.add({ nodes: [], links: [[h.pin(name), vss]], stamp: () => false, currents: () => [] });
    const stage = (v) => ({ r: counterResistance(m.resistance, v), sat: counterSaturation(v) });
    const core = h.add(
      logicCore(
        { vcc: vdd, gnd: vss, inputs: INPUTS.map((name) => ({ name, node: h.pin(name) })), outputs: OUTPUTS.map((name) => ({ name, node: h.pin(name) })) },
        p.open,
        { held: p.held, vih: m.vih, vil: m.vil, switching: m.switching, outputHigh: stage, outputLow: stage },
        LOGIC,
      ),
    );
    return { own, core, outputNames: OUTPUTS, inputNames: INPUTS };
  },
  read(entry, h) {
    const r = logicReading(entry, h, { vcc: 'VDD', gnd: 'VSS' });
    // What each output transistor turns into heat: the drop across it times its current.
    const dissipation = Object.fromEntries(Object.entries(r.outputs).map(([name, o]) => [name, o.level == null ? 0 : Math.abs((o.level ? r.vcc - o.voltage : o.voltage) * o.current)]));
    return { ...r, count: r.logic.count, dissipation, label: `Q${r.logic.count}` };
  },
  limits(entry, r) {
    const m = entry.model;
    return [
      ...logicNotes(entry, r, m),
      stress('SIM_IC_SUPPLY', 'voltage', r.vcc, m.maxAbsolute, 'V'),
      ...OUTPUTS.map((name) => stress('SIM_OVER_POWER', 'power', r.dissipation?.[name] ?? 0, m.maxOutputPower, 'W', { pin: name, of: 'output' })),
      stress('SIM_OVER_POWER', 'power', r.power, m.maxPower, 'W'),
      reverseSupply(-r.vcc, REVERSE_LIMITS.ic, 'VDD', 'VSS'),
    ];
  },
  lines(p, h) {
    return [
      h.raw('counter.count', h.t('sim.counter.count', { count: p.count, out: `Q${p.count}`, carry: h.t(p.count < 5 ? 'sim.counter.carryHigh' : 'sim.counter.carryLow') })),
      h.q('logic.vcc', h.f(p.vcc, 'V')),
      h.q('logic.iout', h.f(p.iout, 'A')),
      h.q('logic.supply', h.f(p.supply, 'A')),
      h.q('power', h.f(p.power, 'W')),
    ];
  },
  tag: (r) => ({ label: 'Iout', value: r.iout, key: 'logic.iout' }),
  scope: (r) => ({ v: { label: `Q${r.count ?? 0}`, value: r.outputs?.[`Q${r.count ?? 0}`]?.voltage ?? 0 }, i: { label: 'Iout', value: r.iout ?? 0 } }),
};
