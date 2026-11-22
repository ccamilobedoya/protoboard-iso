// The 74HC595: an 8-bit shift register with output latches and three-state outputs (logic.js has what
// the clocked chips share). Its logic, from the datasheet's function table:
// - SRCLK rising: the register shifts one place (QA's stage to QB's … to QH's) and takes SER in at QA's;
// - SRCLR low: the register is cleared at once and held so (not the output latches);
// - RCLK rising: the register is copied to the output latches. Both clocks rising at the same instant
//   (tied together) copy the register as it was before the shift, so the latches are one clock behind,
//   as the datasheet says;
// - OE low: QA…QH drive their latch's level; OE high leaves them open (high impedance);
// - QH' follows the register's last stage (not its latch) and is always driven: the next chip's SER.
// So `shiftOut(…, MSBFIRST, v)` puts bit 7 (shifted first) on QH and bit 0 on QA; LSBFIRST the mirror.
// At power-up the register and the latches hold zero (a real chip's are undefined until written).
//
// Numbers (NXP 74HC595 datasheet, typical at 25 °C unless said; TI SN74HC595 agrees):
// - inputs: VIH 3.15 V and VIL 1.35 V at VCC = 4.5 V, i.e. 0.7·VCC and 0.3·VCC; supply 2 V to 6 V;
// - outputs: VOH 4.32 V at IO = −6 mA and VOL 0.15 V at IO = 6 mA, VCC = 4.5 V: about 30 Ω to VCC and
//   25 Ω to GND, taken as constant over the supply range [the resistance grows at lower VCC: assumed];
// - absolute maximum: ±35 mA per output, ±70 mA through VCC or GND, Ptot 750 mW (DIP16), VCC 7 V (the
//   kit warns over the 6 V of the recommended range); the recommended drive is 6 mA per output;
// - ICC 8 µA at most at 6 V: the chip's own current as a resistance from VCC to GND.

import { resistor } from '../mna.js';
import { REVERSE_LIMITS } from '../models.js';
import { stress, reverseSupply } from './shared.js';
import { logicCore, logicReading, openInputs, logicNotes } from './logic.js';

export const SHIFT_REGISTERS = {
  '74HC595': {
    vih: 0.7,
    vil: 0.3,
    minSupply: 2,
    maxSupply: 6,
    highResistance: (4.5 - 4.32) / 6e-3,
    lowResistance: 0.15 / 6e-3,
    maxCurrent: 0.035,
    maxSupplyCurrent: 0.07,
    recommendedCurrent: 0.006,
    maxPower: 0.75,
    quiescentResistance: 6 / 8e-6,
  },
};

const INPUTS = ['SER', 'SRCLK', 'SRCLR', 'RCLK', 'OE'];
const OUTPUTS = ['QA', 'QB', 'QC', 'QD', 'QE', 'QF', 'QG', 'QH', "QH'"];

// The register's logic over a state { reg: [8 bits, QA's first], latch: [8 bits] }.
const LOGIC = {
  initial: () => ({ reg: new Array(8).fill(0), latch: new Array(8).fill(0) }),
  step(s, lv, rising) {
    if (rising.has('RCLK')) for (let k = 0; k < 8; k++) s.latch[k] = s.reg[k];
    if (rising.has('SRCLK') && lv.SRCLR !== 0) {
      for (let k = 7; k > 0; k--) s.reg[k] = s.reg[k - 1];
      s.reg[0] = lv.SER ? 1 : 0;
    }
    if (lv.SRCLR === 0) s.reg.fill(0);
  },
  outputs: (s, lv) => [...s.latch.map((b) => (lv.OE === 1 ? null : b)), s.reg[7]],
};

export const shiftRegister = {
  types: ['ic'],
  kind: 'SR',
  accepts: (part) => part.def.electrical?.function === 'shift register' && Boolean(SHIFT_REGISTERS[part.def.electrical.part]),
  // The register, the latches and what each input last read: carried over when the circuit is rebuilt
  // (a control moved) and kept between steps.
  state: ['logic', 'levels', 'outs', 'between', 'rested'],
  params(part, c) {
    const model = { ...SHIFT_REGISTERS[part.def.electrical.part], ...part.raw.model };
    return { part: part.def.electrical.part, model, open: openInputs(part, c, INPUTS) };
  },
  elements(p, h) {
    const m = p.model;
    const vcc = h.pin('VCC');
    const gnd = h.pin('GND');
    const own = h.add(resistor(vcc, gnd, m.quiescentResistance));
    // An open input reads as nothing inside the kit: a tie keeps its strip from floating.
    for (const name of Object.keys(p.open)) h.add({ nodes: [], links: [[h.pin(name), gnd]], stamp: () => false, currents: () => [] });
    const stage = (r) => () => ({ r, sat: Infinity });
    const core = h.add(
      logicCore(
        { vcc, gnd, inputs: INPUTS.map((name) => ({ name, node: h.pin(name) })), outputs: OUTPUTS.map((name) => ({ name, node: h.pin(name) })) },
        p.open,
        { vih: m.vih, vil: m.vil, outputHigh: stage(m.highResistance), outputLow: stage(m.lowResistance) },
        LOGIC,
      ),
    );
    return { own, core, outputNames: OUTPUTS };
  },
  read(entry, h) {
    const r = logicReading(entry, h, { vcc: 'VCC', gnd: 'GND' });
    const { reg, latch } = entry.core.logic;
    return { ...r, register: reg.join(''), latch: latch.join(''), enabled: entry.core.levels.OE !== 1 };
  },
  limits(entry, r) {
    const m = entry.model;
    return [
      ...logicNotes(entry, r, m),
      stress('SIM_IC_SUPPLY', 'voltage', r.vcc, m.maxSupply, 'V'),
      ...OUTPUTS.map((name) => stress('SIM_OVER_CURRENT', 'current', Math.abs(r.outputs?.[name]?.current ?? 0), m.maxCurrent, 'A', { pin: name, of: 'output' })),
      stress('SIM_OVER_CURRENT', 'current', Math.max(Math.abs(r.supply), Math.abs(r.ground)), m.maxSupplyCurrent, 'A', { of: 'supply' }),
      stress('SIM_OVER_POWER', 'power', r.power, m.maxPower, 'W'),
      reverseSupply(-r.vcc, REVERSE_LIMITS.ic, 'VCC', 'GND'),
    ];
  },
  lines(p, h) {
    return [
      h.raw('shift.register', h.t('sim.shift.register', { bits: p.register })),
      h.raw('shift.latch', h.t(p.enabled ? 'sim.shift.latch' : 'sim.shift.disabled', { bits: p.latch })),
      h.q('logic.vcc', h.f(p.vcc, 'V')),
      h.q('logic.iout', h.f(p.iout, 'A')),
      h.q('logic.supply', h.f(p.supply, 'A')),
      h.q('power', h.f(p.power, 'W')),
    ];
  },
  tag: (r) => ({ label: 'Iout', value: r.iout, key: 'logic.iout' }),
  scope: (r) => ({ v: { label: 'QA', value: r.outputs?.QA?.voltage ?? 0 }, i: { label: 'I(QA)', value: r.outputs?.QA?.current ?? 0 } }),
};
