// A laser module (KY-008): electrically an LED with its series resistor, between S and −; the middle
// pin (+) is joined to nothing on the board. Above a threshold current the diode lases and its light
// is written into the circuit's environment (an emitter, docs/en/environment.md#emitters): every
// sensor of `light` receives it, unless the environment's `beam` says something is in the way.
//
//   S ── 100 Ω ── laser diode (Vf 2.2 V at 25 mA) ── −          + : not connected
//
// Optical power P = η · max(0, I − Ith) and the light it adds, K · P: a teaching simplification (the
// spot of a small beam is far brighter than a room and saturates a photoresistor; nothing is aimed or
// drawn). Below Ith the chip glows like a dim LED and adds nothing. The numbers marked [A] are assumed
// (the usual module's parts are not marked); [T] typical of reseller sheets.
//
// The reading: the current, the voltage, the optical power, what it adds to `light` and its state
// (off, dim, lasing, reversed). Stresses: over 40 mA, reverse over 2 V; a note while it conducts under
// its threshold, a warning when its beam passes the 5 mW of its class (a supply over its 5 V).

import { resistor, junction } from '../mna.js';
import { VT } from '../models.js';
import { stress, note, q, currentTag } from './shared.js';
import { envText } from '../environment.js';

export const LASER = {
  vf: 2.2, // V at `at` [A] (a 650 nm AlGaInP laser diode)
  at: 0.025, // A [A]
  n: 2, // emission coefficient [A]
  rs: 2, // Ω, the chip's own series resistance [A]
  series: 100, // Ω, the board's resistor [A]: about 28 mA at 5 V
  threshold: 0.022, // A, the lasing threshold Ith [A]
  slope: 0.5, // W/A, the slope efficiency η above Ith [A]
  lux: 3.333e6, // lx per W of beam [A]: 3 333 lx per mW, 3 mW → 10 000 lx, a teaching simplification
  classLimit: 0.005, // W: what class 3R allows [T]; above it (from about 6 V) a warning
  maxCurrent: 0.04, // A [T]: the diode dies quickly above it
  maxReverse: 2, // V [T]: laser diodes are fragile in reverse
  glow: 1e-3, // A: from here up to Ith it glows as a dim LED (the note)
  leak: 1e12, // Ω from + to −: the pin joined to nothing, so a lone + strip does not read as floating
};

// The diode's saturation current, so it drops vf at `at` (the chip's rs apart), as ledModel does.
const model = () => ({ n: LASER.n, rs: LASER.rs, is: LASER.at / Math.expm1((LASER.vf - LASER.at * LASER.rs) / (LASER.n * VT)) });

export const opticalPower = (current) => LASER.slope * Math.max(0, current - LASER.threshold);
export const addedLight = (current) => LASER.lux * opticalPower(current);

export const laser = {
  types: ['laser'],
  kind: 'LSR',
  emits: ['light'],
  params: () => ({ model: model(), series: LASER.series }),
  elements(p, h) {
    const [s, plus, k] = [h.at(0), h.at(1), h.at(2)];
    const inner = h.inner();
    // The board's resistor and the chip's own in one.
    const own = h.add(resistor(s, inner, p.series + p.model.rs));
    const main = h.add(junction(inner, k, p.model));
    h.add(resistor(plus, k, LASER.leak));
    return { own, main };
  },
  read(entry, h) {
    const [s, , k] = entry.pins;
    const voltage = h.volt(s.index) - h.volt(k.index);
    const current = entry.main.currents(h.x, h.ctx)[0];
    const power = opticalPower(current);
    const state = voltage < -0.5 ? 'reversed' : current < LASER.glow ? 'off' : current < LASER.threshold ? 'dim' : 'lasing';
    return { voltage, current, power: voltage * current, optical: power, light: addedLight(current), state, threshold: LASER.threshold, currents: { S: current, '+': 0, '−': -current } };
  },
  // What it adds to the environment now (engine.js): its light, 0 when it does not lase.
  emit: (entry, r) => ({ light: r.light }),
  limits(entry, r) {
    const out = [stress('SIM_OVER_CURRENT', 'current', r.current, LASER.maxCurrent, 'A'), stress('SIM_REVERSE_VOLTAGE', 'reverse', -r.voltage, LASER.maxReverse, 'V', { param: 'voltage' })];
    if (r.state === 'dim') out.push(note('info', 'SIM_LASER_DIM', { part: entry.id, current: q(r.current, 'A'), threshold: q(LASER.threshold, 'A') }));
    if (r.optical > LASER.classLimit) out.push(note('warning', 'SIM_LASER_POWER', { part: entry.id, power: q(r.optical, 'W'), max: q(LASER.classLimit, 'W'), voltage: q(r.voltage, 'V') }));
    return out;
  },
  lines(p, h) {
    // What its light does: added to the environment's (the engine says so in `emission`), blocked by
    // the beam, or nowhere (a circuit with no environment).
    const e = p.emission?.light;
    const field = h.t('sim.env.field.light');
    const by = e?.blockedBy && h.t(`sim.env.field.${e.blockedBy}`);
    const effect = p.state !== 'lasing' ? h.t(`sim.laser.${p.state}`) : !e ? h.t('sim.laser.alone') : e.blocked ? h.t('sim.laser.blocked', { field: by }) : h.t('sim.laser.adds', { value: envText('light', e.value, h.decimal), field });
    return [h.raw(`laser.${p.state}`, effect), h.q('laser.current', h.f(p.current, 'A')), h.q('laser.optical', h.f(p.optical, 'W')), h.q('laser.voltage', h.f(p.voltage, 'V')), h.q('laser.nc', h.t('sim.laser.nc'))];
  },
  tag: currentTag,
  falstad(d, f) {
    const [s, k] = [f.pin(d, 'S'), f.pin(d, '−')];
    const mid = f.inner(d.id);
    f.resistor(s, mid, d.params.series);
    f.diode(162, mid, k, `kit-${d.id}`, d.params.model, [1, 0, 0, LASER.at]);
    f.note('falstad.laser', { part: d.id });
  },
};
