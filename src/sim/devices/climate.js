// Climate sensors at LIBRARY level (family F6, docs/en/library-sensors.md): the DHT11 module and the
// BME280 / BMP280 boards. A board's program calls the usual library (`dht.readTemperature()`,
// `bme.readPressure()`, src/sim/program.js) and the board asks the sensor wired where that library
// would look (devices/mcu.js, `ask`); this device answers with the environment's value passed through
// the sensor's range, resolution and timing, if it is powered and wired as the library needs. The
// bits on the wire are not simulated: electrically the module is its supply current, its pull-ups and
// its limits.
//
// The element that answers (`library: { classes, bus }`, `answer(request)`) holds the truth, in `memo`
// (carried across a rebuild by `state`, so a slider elsewhere neither restarts the warm-up nor
// forgets the DHT's cache):
//   clock   seconds of the element's own time (its accepted steps)
//   since   when the supply first reached its minimum (the DHT11's power-up), or null
//   last    the DHT's last real read, in the program's milliseconds (the library's 2 s cache), or null
//   ok, t, h  that read's result (the cache)
//   verdict the last request's answer for the card: { ok, reason, … } (why it did not answer)
//
// A request (from mcu.js): { cls, method ('begin' | 'read'), now (ms), pin (the node of the sketch's
// pin) and gpio (its number), sda / scl (the nodes of the board's default I2C pins), address, chip,
// force, volt(node) }. The DHT answers only on its own pin ({ ok, real, temperature, humidity }, or
// null when the request is for another pin); an I2C chip answers every request of its bus with
// { ok, reason, temperature, pressure (Pa), humidity }.

import { resistor, regulatorElement } from '../mna.js';
import { CLIMATE as C } from '../models.js';
import { FIELDS } from '../environment.js';
import { stress, note, q, volt } from './shared.js';

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const round2 = (v) => Math.round(v * 100) / 100;

// What the DHT11 answers for a temperature and a humidity (spec: nearest whole numbers, clamped to its
// rated 0…50 °C and 20…90 %RH).
export const dhtValues = ({ temperature, humidity }) => ({
  temperature: clamp(Math.round(temperature), C.dht.temperature[0], C.dht.temperature[1]) + 0,
  humidity: clamp(Math.round(humidity), C.dht.humidity[0], C.dht.humidity[1]) + 0,
});
// What a BME280 / BMP280 answers: °C to 0.01, Pa to 1 (from hPa), %RH to 0.01, each clamped to the
// chip's range; no humidity on a BMP280.
export const boschValues = ({ temperature, pressure, humidity }, humid = true) => ({
  temperature: round2(clamp(temperature, C.bosch.temperature[0], C.bosch.temperature[1])),
  pressure: Math.round(clamp(pressure, C.bosch.pressure[0], C.bosch.pressure[1]) * 100),
  humidity: humid ? round2(clamp(humidity, C.bosch.humidity[0], C.bosch.humidity[1])) : Number.NaN,
});

// The DHT11's element: no current of its own (its supply and pull-up are resistors beside it), the
// library's answers.
function dhtCore({ s, vcc, gnd }, p) {
  const supplyOf = (v) => v(vcc) - v(gnd);
  return {
    nodes: [],
    links: [],
    library: { classes: ['DHT'], bus: 'pin' },
    memo: { clock: 0, since: null, last: null, ok: false, t: Number.NaN, h: Number.NaN, verdict: null },
    stamp: () => false,
    currents: () => [],
    accept(x, ctx = {}) {
      if (!ctx.h) return;
      const m = this.memo;
      m.clock += ctx.h;
      if (supplyOf((i) => volt(x, i)) >= C.dht.minSupply) m.since ??= m.clock - ctx.h;
      else m.since = null;
    },
    // Seconds since it was powered (the power-up it needs before a good read), or null when unpowered.
    up(supply) {
      const m = this.memo;
      if (supply < C.dht.minSupply) return null;
      return m.clock - (m.since ?? m.clock);
    },
    answer(req) {
      const m = this.memo;
      if (req.method === 'begin') {
        if (req.pin != null && req.net(s) === req.pin) m.last = null;
        return null;
      }
      if (req.pin == null || req.net(s) !== req.pin) {
        m.verdict = { ok: false, reason: 'pin', gpio: req.gpio, at: req.now };
        return null;
      }
      if (!req.force && m.last != null && req.now - m.last < C.dht.interval) return { ok: m.ok, real: false, temperature: m.t, humidity: m.h };
      m.last = req.now;
      const v = req.volt;
      const supply = supplyOf(v);
      const up = this.up(supply);
      let reason = null;
      if (supply < -C.dht.maxReverse) reason = 'reversed';
      else if (supply < C.dht.minSupply) reason = 'power';
      else if (up < p.warmup - 1e-9) reason = 'warmup';
      else if (v(s) - v(gnd) < C.dht.high * supply) reason = 'low';
      const read = reason ? null : dhtValues(p);
      m.ok = !reason;
      m.t = read ? read.temperature : Number.NaN;
      m.h = read ? read.humidity : Number.NaN;
      m.verdict = { ok: m.ok, reason, gpio: req.gpio, at: req.now, supply, ...(read && read) };
      return { ok: m.ok, real: true, temperature: m.t, humidity: m.h };
    },
  };
}

// A BME280 / BMP280 board's chip: answers on the board's default I2C pins when its rail is in range,
// both lines are pulled up, the address is its own and the library's chip id is its own.
function boschCore({ vcc, gnd, rail, sda, scl }, p) {
  const model = C.boards[p.part];
  return {
    nodes: [],
    links: [],
    library: { classes: ['Adafruit_BME280', 'Adafruit_BMP280'], bus: 'i2c' },
    memo: { verdict: null },
    stamp: () => false,
    currents: () => [],
    answer(req) {
      const v = req.volt;
      const supply = v(vcc) - v(gnd);
      const chipRail = v(rail) - v(gnd);
      let reason = null;
      const [onSda, onScl] = [req.net(sda), req.net(scl)];
      if (req.sda == null || req.scl == null || onSda !== req.sda || onScl !== req.scl) reason = onSda === req.scl && onScl === req.sda && req.sda != null ? 'swapped' : 'bus';
      else if (supply < -C.bosch.maxReverse) reason = 'reversed';
      else if (!model.regulated && supply > C.bosch.dead) reason = 'dead';
      else if (chipRail < C.bosch.minSupply) reason = 'power';
      else if (v(sda) - v(gnd) < C.bosch.high * chipRail || v(scl) - v(gnd) < C.bosch.high * chipRail) reason = 'low';
      else if (req.address !== p.address) reason = 'address';
      else if (req.chip !== model.chip) reason = 'chip';
      const values = reason ? null : boschValues(p, model.humidity);
      this.memo.verdict = { ok: !reason, reason, method: req.method, address: req.address, chip: req.chip, cls: req.cls, at: req.now };
      return { ok: !reason, reason, ...(values ?? { temperature: Number.NaN, pressure: Number.NaN, humidity: Number.NaN }) };
    },
  };
}

export const climate = {
  types: ['climate-sensor'],
  kind: 'CLIM',
  state: ['memo'],
  senses: ['temperature', 'humidity', 'pressure'],
  params(part, c) {
    const e = part.def.electrical;
    const model = C.boards[e.part];
    const at = (field) => c?.env?.(field) ?? e[field];
    return {
      part: e.part,
      dht: Boolean(model.dht),
      temperature: at('temperature'),
      ...(model.humidity && { humidity: at('humidity') }),
      ...(model.pressure && { pressure: at('pressure') }),
      ...(model.dht ? { warmup: e.warmup } : { address: e.address }),
    };
  },
  // Its own values, as the environment's sliders (environment.js FIELDS): moved, it leaves the field.
  controls(p) {
    const out = {};
    for (const field of ['temperature', 'humidity', 'pressure']) {
      if (p[field] === undefined) continue;
      const f = FIELDS[field];
      out[field] = { min: f.min, max: f.max, limit: f.limit, scale: f.scale, unit: f.unit, step: f.step, value: p[field] };
    }
    return out;
  },
  set: (p, field, value) => (field in p && ['temperature', 'humidity', 'pressure'].includes(field) ? { ...p, [field]: value } : null),
  elements(p, h) {
    const model = C.boards[p.part];
    if (model.dht) {
      const [s, vcc, gnd] = ['S', '+', '−'].map((name) => h.pin(name));
      const supply = h.add(resistor(vcc, gnd, C.dht.currentAt / C.dht.standby));
      const pullup = h.add(resistor(s, vcc, C.dht.pullup));
      return { supply, pullup, core: h.add(dhtCore({ s, vcc, gnd }, p)), nodes: { s, vcc, gnd } };
    }
    const [vcc, gnd, scl, sda] = ['VCC', 'GND', 'SCL', 'SDA'].map((name) => h.pin(name));
    const rail = model.regulated ? h.inner() : vcc;
    const regulator = model.regulated ? h.add(regulatorElement(vcc, gnd, rail, { vref: C.bosch.rail, dropout: C.bosch.dropout, quiescent: C.bosch.quiescent })) : null;
    const supply = h.add(resistor(rail, gnd, C.bosch.rail / model.current));
    const pullSda = h.add(resistor(sda, rail, C.bosch.pullup));
    const pullScl = h.add(resistor(scl, rail, C.bosch.pullup));
    return { regulator, supply, pullSda, pullScl, core: h.add(boschCore({ vcc, gnd, rail, sda, scl }, p)), nodes: { vcc, gnd, rail, sda, scl } };
  },
  read(entry, h) {
    const n = entry.nodes;
    const v = (i) => h.volt(i);
    const into = (el) => el.currents(h.x, h.ctx ?? {});
    const memo = entry.core.memo;
    if (entry.dht) {
      const vcc = v(n.vcc) - v(n.gnd);
      const [iSupply] = into(entry.supply);
      const [iPull] = into(entry.pullup); // from S to + (positive: into S's side)
      const up = entry.core.up(vcc);
      const state = vcc < -C.dht.maxReverse ? 'reversed' : vcc < C.dht.minSupply ? 'off' : up < entry.warmup - 1e-9 ? 'warmup' : 'ready';
      return {
        part: entry.part,
        state,
        left: state === 'warmup' ? Math.max(0, entry.warmup - up) : null,
        length: state === 'warmup' ? entry.warmup : null,
        sensor: { temperature: entry.temperature, humidity: entry.humidity },
        answer: dhtValues(entry),
        last: memo.verdict,
        vcc,
        vdata: v(n.s) - v(n.gnd),
        current: iSupply - iPull,
        currents: { S: iPull, '+': iSupply - iPull, '−': -iSupply },
        power: vcc * iSupply,
      };
    }
    const model = C.boards[entry.part];
    const vcc = v(n.vcc) - v(n.gnd);
    const rail = v(n.rail) - v(n.gnd);
    const [iSupply] = into(entry.supply);
    const [iSda] = into(entry.pullSda);
    const [iScl] = into(entry.pullScl);
    const iReg = entry.regulator ? into(entry.regulator) : null;
    const own = entry.regulator ? iReg[0] : iSupply - iSda - iScl;
    const state = vcc < -C.bosch.maxReverse ? 'reversed' : !model.regulated && vcc > C.bosch.dead ? 'dead' : rail < C.bosch.minSupply ? 'off' : 'ready';
    const answer = boschValues(entry, model.humidity);
    return {
      part: entry.part,
      state,
      address: entry.address,
      chip: model.chip,
      sensor: { temperature: entry.temperature, humidity: entry.humidity ?? null, pressure: entry.pressure },
      answer,
      last: memo.verdict,
      vcc,
      rail,
      vsda: v(n.sda) - v(n.gnd),
      vscl: v(n.scl) - v(n.gnd),
      current: own,
      currents: { VCC: own, GND: -own - iSda - iScl, SDA: iSda, SCL: iScl },
      power: vcc * own,
    };
  },
  limits(entry, r) {
    const out = [];
    if (entry.dht) {
      out.push(stress('SIM_REVERSE_VOLTAGE', 'reverse', -r.vcc, C.dht.maxReverse, 'V', { param: 'voltage' }));
      if (r.vcc > C.dht.maxSupply) out.push(note('warning', 'SIM_IC_SUPPLY', { part: entry.id, voltage: q(r.vcc, 'V'), max: q(C.dht.maxSupply, 'V') }));
      if (r.vcc > 0.5 && r.vcc < C.dht.minSupply) out.push(note('warning', 'SIM_MODULE_LOW_SUPPLY', { part: entry.id, voltage: q(r.vcc, 'V'), min: q(C.dht.minSupply, 'V') }));
      return out;
    }
    const model = C.boards[entry.part];
    out.push(stress('SIM_REVERSE_VOLTAGE', 'reverse', -r.vcc, C.bosch.maxReverse, 'V', { param: 'voltage' }));
    const max = model.regulated ? C.bosch.maxVin : C.bosch.maxSupply;
    if (r.vcc > max) out.push(note('warning', 'SIM_IC_SUPPLY', { part: entry.id, voltage: q(r.vcc, 'V'), max: q(max, 'V') }));
    const min = model.regulated ? C.bosch.minVin : C.bosch.minSupply;
    if (r.vcc > 0.5 && r.vcc < min) out.push(note('warning', 'SIM_MODULE_LOW_SUPPLY', { part: entry.id, voltage: q(r.vcc, 'V'), min: q(min, 'V') }));
    return out;
  },
  lines(p, h) {
    const num = (value, digits = 0) => (Number.isFinite(value) ? value.toFixed(digits).replace('.', h.decimal) : '—');
    const lines = [];
    if (p.state === 'warmup') lines.push(h.raw('climate.warmup', h.t('sim.climate.warmup', { time: h.f(p.left, 's') })));
    else if (p.state !== 'ready') lines.push(h.raw(`climate.${p.state}`, h.t(`sim.climate.${p.state}`, { voltage: h.f(p.vcc, 'V') })));
    const a = p.answer;
    const now = p.part.startsWith('DHT')
      ? `${num(a.temperature)} °C · ${num(a.humidity)} %RH`
      : [`${num(a.temperature, 2)} °C`, `${num(a.pressure / 100, 2)} hPa`, Number.isFinite(a.humidity) ? `${num(a.humidity, 2)} %RH` : null].filter(Boolean).join(' · ');
    lines.push(h.q('climate.answer', p.state === 'ready' ? now : h.t('sim.climate.wouldAnswer', { values: now })));
    // The last request a sketch made, and why it got no answer.
    const last = p.last;
    if (last) {
      const at = h.f(last.at / 1000, 's');
      const hex = (n) => `0x${Math.trunc(n).toString(16)}`;
      const why = last.ok
        ? h.t('sim.climate.answered', { time: at })
        : h.t(`sim.climate.why.${last.reason}`, { time: at, pin: last.gpio ?? '—', asked: hex(last.address ?? 0), own: hex(p.address ?? 0), chip: hex(last.chip ?? 0), mine: hex(p.chip ?? 0), voltage: h.f(p.vcc, 'V') });
      lines.push(h.raw(last.ok ? 'climate.last' : 'climate.none', why));
    } else lines.push(h.raw('climate.last', h.t('sim.climate.unasked')));
    if (p.address != null) lines.push(h.q('climate.address', `0x${p.address.toString(16)} · ${h.t('sim.climate.chip', { chip: `0x${p.chip.toString(16)}` })}`));
    lines.push(h.q('climate.accuracy', h.t(`sim.climate.accuracy.${p.part.startsWith('DHT') ? 'dht' : p.part.startsWith('BMP') ? 'bmp' : 'bme'}`)));
    lines.push(h.q('climate.vcc', h.f(p.vcc, 'V')));
    if (p.rail != null && p.part === 'BME280-5V') lines.push(h.q('climate.rail', h.f(p.rail, 'V')));
    lines.push(h.q('climate.own', h.f(p.current, 'A')));
    return lines;
  },
  tag: (r) => ({ label: r.part.startsWith('DHT') ? '+' : 'VCC', value: Math.abs(r.current), key: 'climate.own' }),
  scope: (r) => (r.vdata != null ? { v: { label: 'S', value: r.vdata }, i: null } : { v: { label: 'SDA', value: r.vsda }, i: null }),
};
