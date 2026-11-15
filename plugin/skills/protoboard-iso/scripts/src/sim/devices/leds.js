// Several LEDs in one package sharing a common pin: an RGB LED (three chips, R, G and B) and a
// 7-segment display (eight, a–g and DP). Each chip is an LED of its own (a junction with its series
// resistance, the model of its colour and family in ../models.js) between its pin and the common;
// a common cathode has the chips' anodes on their pins, a common anode the other way round. A
// display's two common pins are one piece of metal inside (a wire's resistance between them).
//
// The reading has each chip's voltage, current, power and brightness (`channels`, by pin), the
// common's current, and the brightest chip's brightness, which the page fades the part's light
// with; each chip has its own stresses, named by its pin ("D1.R").

import { resistor, junction } from '../mna.js';
import { familyLedModel, WIRE_RESISTANCE } from '../models.js';
import { stress } from './shared.js';

// LED colours for Falstad's drawing (red, green, blue from 0 to 1).
const FALSTAD_RGB = { red: [1, 0, 0], green: [0, 1, 0], blue: [0, 0.4, 1] };

// A circuit's model may set every chip ({ "vf": 2.0 }) or one by its pin ({ "R": { "vf": 1.9 } }).
function override(raw, pin) {
  const all = Object.fromEntries(Object.entries(raw ?? {}).filter(([, v]) => typeof v === 'number'));
  const own = raw?.[pin] && typeof raw[pin] === 'object' ? raw[pin] : {};
  return { ...all, ...own };
}

export const leds = {
  types: ['rgb-led', 'seven-segment'],
  kind: 'LEDS',
  params(part) {
    const e = part.def.electrical;
    return {
      common: e.common,
      commons: e.commons,
      channels: e.channels.map((c) => ({ pin: c.pin, color: c.color, model: familyLedModel(e.family, c.color, override(part.raw.model, c.pin)) })),
    };
  },
  elements(p, h) {
    const com = h.pin(p.commons[0]);
    const links = p.commons.slice(1).map((name) => ({ pin: name, el: h.add(resistor(com, h.pin(name), WIRE_RESISTANCE)) }));
    const legs = p.channels.map((c) => {
      const pin = h.pin(c.pin);
      const [a, k] = p.common === 'anode' ? [com, pin] : [pin, com];
      const mid = h.inner();
      h.add(resistor(a, mid, c.model.rs));
      return h.add(junction(mid, k, c.model));
    });
    return { legs, links };
  },
  read(entry, h) {
    const at = (name) => h.volt(entry.pins.find((p) => p.name === name).index);
    const vc = at(entry.commons[0]);
    const anode = entry.common === 'anode';
    const channels = {};
    const currents = {};
    let total = 0;
    let power = 0;
    let brightness = 0;
    entry.channels.forEach((c, n) => {
      const i = entry.legs[n].currents(h.x, h.ctx)[0];
      const v = anode ? vc - at(c.pin) : at(c.pin) - vc;
      const b = Math.max(0, i) / c.model.ratedCurrent;
      channels[c.pin] = { voltage: v, current: i, power: v * i, brightness: b };
      currents[c.pin] = anode ? -i : i;
      total += i;
      power += v * i;
      brightness = Math.max(brightness, b);
    });
    // The common takes back what the chips pass (cathode) or gives it (anode); a second common
    // pin carries what goes through the metal between them.
    let rest = anode ? total : -total;
    for (const l of entry.links) {
      const i = l.el.currents(h.x, h.ctx)[0];
      currents[l.pin] = -i;
      rest += i;
    }
    currents[entry.commons[0]] = rest;
    return { channels, current: total, power, brightness, currents };
  },
  limits(entry, r) {
    return entry.channels.flatMap((c) => {
      const ch = r.channels[c.pin];
      const m = c.model;
      return [
        stress('SIM_OVER_CURRENT', 'current', ch.current, m.maxCurrent, 'A', { pin: c.pin }),
        ...(m.maxPower ? [stress('SIM_OVER_POWER', 'power', Math.abs(ch.power), m.maxPower, 'W', { pin: c.pin })] : []),
        stress('SIM_REVERSE_VOLTAGE', 'reverse', -ch.voltage, m.maxReverse, 'V', { param: 'voltage', pin: c.pin }),
      ];
    });
  },
  // Each chip on its own line (its name, Vf, current, brightness), then the common's current.
  lines(p, h) {
    const lines = Object.entries(p.channels).map(([pin, c]) => ({
      key: 'leds.channel',
      text: `${h.t(`sim.leds.${pin}`)}: ${h.f(c.voltage, 'V')} · ${h.f(c.current, 'A')} · ${Math.round(c.brightness * 100)} %`,
    }));
    lines.push(h.q('leds.common', h.f(Math.abs(p.current), 'A')), h.q('power', h.f(p.power, 'W')));
    return lines;
  },
  tag: (r) => (typeof r.current === 'number' ? { label: '', value: Math.abs(r.current), key: 'leds.common' } : null),
  scope: (r) => ({ v: null, i: { label: 'I', value: r.current } }),
  // One of Falstad's LEDs per chip with this model, in its colour: what the kit simulates inside.
  falstad(d, f) {
    const p = d.params;
    const com = f.pin(d, p.commons[0]);
    for (const name of p.commons.slice(1)) f.wire(com, f.pin(d, name), WIRE_RESISTANCE);
    for (const c of p.channels) {
      const pin = f.pin(d, c.pin);
      const [a, k] = p.common === 'anode' ? [com, pin] : [pin, com];
      f.diode(162, a, k, `kit-${d.id}-${c.color}`, c.model, [...(FALSTAD_RGB[c.color] ?? FALSTAD_RGB.red), c.model.ratedCurrent]);
    }
  },
};
