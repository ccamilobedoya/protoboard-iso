// What the clocked CMOS chips share (the 74HC595 shift register, shift-register.js; the CD4017 decade
// counter, counter.js): their logic inputs, their memory, their push-pull outputs and how they hear a
// board's pins. One element per chip (logicCore), a memory like the 555's latch: its state changes only
// between time steps, so every step solves the output stages as plain sources.
//
// Inputs. A level is high above `vih`·VCC and low under `vil`·VCC; in between it keeps the level it had
// (the datasheets guarantee nothing there; a Schmitt input, the CD4017's clock, behaves exactly so). A
// reading in that band from a steady source (a board's pin, the DC point) is kept in `between` for a
// warning: a 3.3 V pin on a chip fed 5 V never reaches its high level. An input left open (no other
// part on its strip) is undefined on a real chip: the kit takes it as low, ties it there, and says so
// (SIM_IC_INPUT_OPEN, which names the level).
//
// Edges. A chip sees an input change in two ways:
// - from a board's program (devices/mcu.js `watch`): every change of a pin the program makes reaches it
//   at once, in order, with the volts the pin then has. A shiftOut's clock pulse takes no simulated
//   time (program.js), so a chip that read only the solved voltages would never see it. An input is
//   the board's when it shares a net (strips joined by jumper wires) with that pin and the pin is a
//   steady output (not a PWM): its level is the pin's, whatever the step's solution says.
// - from another chip's output on its net (two 74HC595 chained, QH' to SER), the same way while a
//   board's change runs through them: each chip takes the board's edge first, then passes on what its
//   outputs did (`flush`), so two chips on one clock both see the instant before it (the second shifts
//   in the first's old QH'). Such a chain is followed CASCADE chips deep at most (a ring of chips
//   clocking each other in no time would never end); the rest is read at the next step.
// - from the solved voltages, at the end of each accepted step (a 555's output, a button, a PWM pin,
//   one of its own outputs fed back): one edge per step at most.
// At t = 0 (`rest`) the inputs take their levels without edges (a button held at power-up is no
// clock), and a board's program run again from setup (its `restart`) puts the chip back at power-up
// first, so the start's rounds do not shift twice.
//
// Outputs. Each is pulled to VCC or to GND through its output transistor (drive below): a resistance
// near the rail, levelling off at a saturation current when `sat` is finite (a 4000-series output,
// whose drive is small); `null` is an open output (high impedance). The current comes from VCC and
// goes to GND, so the supply pins carry what the outputs give.

import { GMIN } from '../models.js';
import { issue, note, q } from './shared.js';

const volt = (x, i) => (i >= 0 ? (x?.[i] ?? 0) : 0);
// Under this supply the chip is off: its memory goes back to power-up and its inputs are not read
// [assumed: below a volt no CMOS logic works].
export const POWERED = 1;
// Chips a change may run through in no time before the rest waits for the next step [assumed: a
// chain of eight 74HC595 is 64 LEDs, more than a breadboard holds].
const CASCADE = 8;
// How far a saturating output's drop may move in one Newton iteration, in widths r·sat [assumed].
const LIMIT_WIDTHS = 1;
let depth = 0;

// The current an output transistor passes with `drop` volts across it (from the rail to the pin for a
// high output, from the pin to ground for a low one) and its slope: drop/r near the rail, levelling
// off at `sat` (a smooth tanh; Infinity: a plain resistance r).
export function drive(drop, r, sat) {
  if (!(sat < Infinity)) return { i: drop / r, g: 1 / r };
  const th = Math.tanh(drop / (r * sat));
  return { i: sat * th, g: (1 - th * th) / r };
}

// A level from volts against the chip's supply: 1, 0, or `was` in between.
export const levelOf = (v, vcc, m, was) => (v > m.vih * vcc ? 1 : v < m.vil * vcc ? 0 : was);

// The nets of a circuit: nodes joined by jumper wires (an element with `joins`) are one place.
function netsOf(elements) {
  const root = new Map();
  const find = (n) => {
    while (root.has(n) && root.get(n) !== n) n = root.get(n);
    return n;
  };
  for (const el of elements) {
    if (!el.joins) continue;
    const [a, b] = el.nodes.map(find);
    if (a !== b) root.set(a, b);
  }
  return find;
}

// The chip's element. pins: { vcc, gnd, inputs: [{ name, node }], outputs: [{ name, node }] };
// open: { input name → level assumed } for the inputs left open; m: { vih, vil, outputHigh(vcc),
// outputLow(vcc) → { r, sat } }; chip: the logic, pure functions of a state object:
//   initial() → state at power-up
//   step(state, levels, rising: Set, falling: Set)   the edges, then what the levels hold (a clear)
//   outputs(state, levels) → [1 | 0 | null] in `outputs` order
export function logicCore({ vcc, gnd, inputs, outputs }, open, m, chip) {
  const nodes = [vcc, gnd, ...outputs.map((o) => o.node)];
  const fresh = () => Object.fromEntries(inputs.map((p) => [p.name, open[p.name] ?? null]));
  const outVolts = (level, x) => (level == null ? null : level ? volt(x, vcc) : volt(x, gnd));
  const drop = (x, k, level) => (level ? volt(x, vcc) - volt(x, outputs[k].node) : volt(x, outputs[k].node) - volt(x, gnd));
  const supplyOf = (x) => volt(x, vcc) - volt(x, gnd);
  const stageOf = (level, x) => (level ? m.outputHigh(supplyOf(x)) : m.outputLow(supplyOf(x)));
  const el = {
    nodes,
    links: outputs.flatMap((o) => [
      [o.node, vcc],
      [o.node, gnd],
    ]),
    logic: chip.initial(),
    levels: fresh(),
    outs: [],
    between: {},
    x: null,
    rested: null,
    rising: new Set(),
    falling: new Set(),
    byBoard: new Map(), // source → gpio → the input names on its net (what a change of that pin reaches)
    sources: new Map(), // input name → { board, gpio }: a board's pin (or another chip's output) on its net
    watchers: [], // the chips with an input on one of its outputs
    live: new Set(), // outputs changed in no time since the last solve (x does not show them yet)
    dirty: new Set(), // outputs changed while a board's edge runs, not passed on yet
    // The state of power-up (a board's program started again, the chip without supply); the inputs
    // nothing else gives (a supply, a button) take their level from x at once.
    powerUp(x) {
      this.logic = chip.initial();
      this.levels = fresh();
      this.between = {};
      if (x && supplyOf(x) >= POWERED) for (const p of inputs) if (!(p.name in open) && !this.sources.has(p.name)) this.levels[p.name] = levelOf(volt(x, p.node) - volt(x, gnd), supplyOf(x), m, null);
      this.track(chip.outputs(this.logic, this.levels), true);
    },
    // New outputs: the ones that moved are passed on later (`flush`) when it happens in no time.
    track(outs, instant) {
      outs.forEach((level, k) => {
        if (level === this.outs[k]) return;
        if (instant) {
          this.dirty.add(k);
          this.live.add(k);
        }
      });
      this.outs = outs;
    },
    // As a source for other chips (the board's interface, devices/mcu.js): its outputs' nodes, and the
    // volts of an output changed in no time (else null: the solution says it).
    watch(fn) {
      this.watchers.push(fn);
    },
    gpioNodes: () => new Map(outputs.map((o, k) => [k, o.node])),
    steady(k) {
      return this.live.has(k) ? outVolts(this.outs[k], this.x) : null;
    },
    flush() {
      if (!this.dirty.size || depth >= CASCADE) {
        this.dirty.clear();
        return;
      }
      const moved = [...this.dirty];
      this.dirty.clear();
      depth++;
      try {
        for (const k of moved) {
          const volts = outVolts(this.outs[k], this.x);
          if (volts == null) continue;
          for (const fn of this.watchers) fn({ gpio: k, volts, x: this.x });
          for (const fn of this.watchers) fn({ flush: true });
        }
      } finally {
        depth--;
      }
    },
    // Inputs that change together ([[name, level]]): their edges at once (two clocks tied together see
    // the same instant), then the outputs.
    // `force`: what the levels hold is applied even when none changed (after levels set by hand).
    see(changes, instant = false, force = false) {
      const { rising, falling } = this;
      rising.clear();
      falling.clear();
      let moved = force;
      for (const [name, level] of changes) {
        const was = this.levels[name];
        if (level == null || level === was) continue;
        this.levels[name] = level;
        moved = true;
        if (was === 0 && level === 1) rising.add(name);
        else if (was === 1 && level === 0) falling.add(name);
      }
      if (!moved) return;
      chip.step(this.logic, this.levels, rising, falling);
      this.track(chip.outputs(this.logic, this.levels), instant);
    },
    // The level of an input now, from what drives it: its board's pin (a steady output), else the
    // solution x. `steady`: the reading is not a passing value (a board's level, the DC point).
    sample(name, node, x, steady) {
      const v = supplyOf(x);
      const src = this.sources.get(name);
      const held = src ? src.board.steady(src.gpio) : null;
      const at = held != null ? held - volt(x, gnd) : volt(x, node) - volt(x, gnd);
      const level = levelOf(at, v, m, this.levels[name]);
      if ((steady || held != null) && at >= m.vil * v && at <= m.vih * v) this.between[name] = at;
      return level;
    },
    readAll(x, steady) {
      return inputs.filter((p) => !(p.name in open)).map((p) => [p.name, this.sample(p.name, p.node, x, steady)]);
    },
    // A saturating output (finite `sat`) is linearised at a drop that moves at most LIMIT_WIDTHS of its
    // linear width (r·sat) per Newton iteration: Newton on a tanh started deep in its flat part jumps
    // past the answer and diverges (an output switching onto an LED); true while a drop is held back.
    lim: outputs.map(() => 0),
    stamp(st, x) {
      if (this.live.size) this.live.clear();
      let limited = false;
      this.outs.forEach((level, k) => {
        if (level == null) return;
        const o = outputs[k].node;
        const { r, sat } = stageOf(level, x);
        let d = drop(x, k, level);
        if (sat < Infinity) {
          const width = LIMIT_WIDTHS * r * sat;
          const held = Math.min(this.lim[k] + width, Math.max(this.lim[k] - width, d));
          if (Math.abs(held - d) > 1e-9) limited = true;
          d = held;
          this.lim[k] = d;
        }
        const { i, g } = drive(d, r, sat);
        const [a, b] = level ? [vcc, o] : [o, gnd];
        st.conductance(a, b, g + GMIN);
        st.current(a, b, i - g * d);
      });
      return limited;
    },
    // Into the element at each node, in `nodes` order; also each output's current out of its pin.
    currents(x) {
      const into = new Array(nodes.length).fill(0);
      this.outs.forEach((level, k) => {
        if (level == null) return;
        const { r, sat } = stageOf(level, x);
        const { i } = drive(drop(x, k, level), r, sat);
        if (level) {
          into[0] += i;
          into[2 + k] -= i;
        } else {
          into[2 + k] += i;
          into[1] -= i;
        }
      });
      return into;
    },
    accept(x) {
      this.x = x;
      if (supplyOf(x) < POWERED) this.powerUp(null);
      else this.see(this.readAll(x, false));
      this.dirty.clear();
    },
    // t = 0: the levels without edges, what they hold applied; true when an output moved since the
    // last call (the start solves again).
    rest(x) {
      this.x = x;
      if (supplyOf(x) < POWERED) this.powerUp(null);
      else {
        for (const [name, level] of this.readAll(x, true)) if (level != null) this.levels[name] = level;
        this.see([], false, true);
      }
      const now = JSON.stringify(this.outs);
      const moved = now !== this.rested;
      this.rested = now;
      this.dirty.clear();
      return moved;
    },
    // A board's pin changed (devices/mcu.js `watch`): every input on its net at once.
    heard(board, ev) {
      if (ev.flush) return this.flush();
      if (ev.restart) return this.powerUp(ev.x ?? this.x);
      const x = ev.x ?? this.x;
      const v = supplyOf(x);
      if (v < POWERED) return;
      const names = this.byBoard.get(board)?.get(ev.gpio);
      if (!names) return;
      const at = ev.volts - volt(x, gnd);
      if (at >= m.vil * v && at <= m.vih * v) for (const name of names) this.between[name] = at;
      this.see(names.map((name) => [name, levelOf(at, v, m, this.levels[name])]), true);
    },
    // The engine hands every element over once they are all built: the boards whose pins share a net
    // with an input are listened to.
    connect(elements) {
      const net = netsOf(elements);
      // A board's pins, and the outputs of the other chips (never its own: those it reads each step).
      const boards = elements.filter((e) => e !== this && typeof e.watch === 'function' && typeof e.gpioNodes === 'function');
      for (const board of boards) {
        let mine = false;
        for (const [gpio, node] of board.gpioNodes()) {
          for (const p of inputs) {
            if (p.name in open || this.sources.has(p.name) || net(p.node) !== net(node)) continue;
            this.sources.set(p.name, { board, gpio });
            if (!this.byBoard.has(board)) this.byBoard.set(board, new Map());
            const at = this.byBoard.get(board);
            at.set(gpio, [...(at.get(gpio) ?? []), p.name]);
            mine = true;
          }
        }
        if (mine) board.watch((ev) => this.heard(board, ev));
      }
    },
  };
  el.outs = chip.outputs(el.logic, el.levels);
  return el;
}

// The reading's figures every logic chip shares: supply, each output's level, voltage and current
// (out of the pin), the current into each pin, the power and the inputs seen in the undefined band.
export function logicReading(entry, h, { vcc, gnd }) {
  const core = entry.core;
  const pin = (name) => entry.pins.find((p) => p.name === name).index;
  const ref = h.volt(pin(gnd));
  const into = core.currents(h.x);
  const [own] = entry.own.currents(h.x);
  const currents = Object.fromEntries(entry.pins.map((p) => [p.name, 0]));
  currents[vcc] += into[0] + own;
  currents[gnd] += into[1] - own;
  const outputs = {};
  entry.outputNames.forEach((name, k) => {
    currents[name] += into[2 + k];
    outputs[name] = { level: core.outs[k], voltage: h.volt(pin(name)) - ref, current: -into[2 + k] };
  });
  const power = entry.pins.reduce((sum, p) => sum + h.volt(p.index) * currents[p.name], 0);
  const iout = Math.max(0, ...Object.values(outputs).map((o) => Math.abs(o.current)));
  return { vcc: h.volt(pin(vcc)) - ref, outputs, iout, supply: currents[vcc], ground: -currents[gnd], power, currents, levels: { ...core.levels }, between: { ...core.between } };
}

// The inputs of a part left open: no other part on their strip ({ name: 0 }, read as low).
export function openInputs(part, c, names) {
  const nodeOf = new Map(part.pinNames.map((name, i) => [name, part.holes[i].node]));
  const alone = (name) => (c.members?.[nodeOf.get(name)] ?? []).every((id) => id === part.id);
  const open = Object.fromEntries(names.filter((name) => nodeOf.has(name) && alone(name)).map((name) => [name, 0]));
  if (c.members && Object.keys(c.members).length) for (const name of Object.keys(open)) c.issues.push(issue('warning', 'SIM_IC_INPUT_OPEN', { part: part.id, pin: name }));
  return open;
}

// What a logic chip says beside its limits: a supply under its minimum, an input in the undefined band.
export function logicNotes(entry, r, m) {
  const out = [];
  if (r.vcc > 0.1 && r.vcc < m.minSupply) out.push(note('warning', 'SIM_IC_UNDER_SUPPLY', { part: entry.id, voltage: q(r.vcc, 'V'), min: q(m.minSupply, 'V') }));
  for (const [pin, v] of Object.entries(r.between ?? {})) out.push(note('warning', 'SIM_IC_INPUT_LEVEL', { part: entry.id, pin, voltage: q(v, 'V'), high: q(m.vih * r.vcc, 'V'), low: q(m.vil * r.vcc, 'V') }));
  return out;
}
