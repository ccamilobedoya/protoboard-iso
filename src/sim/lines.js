// A part's readings as lines for its card: [{ key, text }]. `key` names its explanation
// (i18n "explain.<key>"), so a learner can tap "Ic: 8,82 mA" and read what Ic is. Each kind of
// part writes its own lines (src/sim/devices/). No i18n import: the caller passes `t` (Node:
// src/sim/format.js; the live page: the texts it carries), so the page can rewrite the card
// while the simulation runs.
//
//   linesFor(reading, { t(key, params), decimal }) → [{ key, text }]

import { formatValue } from '../core/units.js';
import { deviceOfReading } from './devices/index.js';

export function runtimeWords(hours, { t, decimal }) {
  const n = (x) => String(x).replace('.', decimal);
  if (hours < 1) return t('sim.runtime.min', { n: Math.max(1, Math.round(hours * 60)) });
  if (hours < 48) return t('sim.runtime.h', { n: n(hours < 10 ? Math.round(hours * 10) / 10 : Math.round(hours)) });
  const days = hours / 24;
  return t('sim.runtime.d', { n: n(days < 10 ? Math.round(days * 10) / 10 : Math.round(days)) });
}

export function linesFor(p, { t, decimal }) {
  const f = (value, unit) => (value == null ? t('sim.floating') : formatValue(value, unit, { decimal }));
  const raw = (key, text) => ({ key, text });
  if (p.unsupported) return [raw('unsupported', t('sim.unsupported'))];
  const h = { f, decimal, raw, q: (key, value) => ({ key, text: `${t(`sim.q.${key}`)}: ${value}` }), t, runtime: (hours) => runtimeWords(hours, { t, decimal }) };
  const lines = deviceOfReading(p)?.lines(p, h);
  if (lines === null) return [];
  if (p.floating) (lines ?? []).push(raw('floating', t('sim.floating')));
  return lines ?? [];
}

// A node's card (stage 3, phase 9: a strip tapped): its voltage to ground, then the current of
// every lead clipped to it, into or out of the strip (conventional current). What goes in comes
// out (Kirchhoff), which the learner can check line by line.
//
//   leads: [{ name, part, pin } | { name, supply, sign }]   (sign: +1 the supply's +, −1 its −)
//   nodeLines(reading, node, leads, { t, decimal }) → [{ key, text }]
const NO_CURRENT = 1e-9; // A: below a nanoampere it is the solver's leakage (a charged capacitor), not a current

export function leadCurrent(reading, lead) {
  if (lead.supply) return lead.sign * (reading.supplies?.[lead.supply]?.current ?? 0);
  const r = reading.parts?.[lead.part];
  return !r || r.floating ? 0 : -(r.pinCurrents?.[lead.pin] ?? 0);
}

export function nodeLines(reading, node, leads, { t, decimal }) {
  const v = reading.nodes?.[node];
  const volts = v == null ? t('sim.floating') : formatValue(Math.abs(v) < 1e-3 ? 0 : v, 'V', { decimal });
  const lines = [{ key: 'node.voltage', text: t('page.node.voltage', { value: volts }) }];
  if (v == null) return lines;
  for (const lead of leads) {
    const i = leadCurrent(reading, lead);
    const value = formatValue(Math.abs(i), 'A', { decimal });
    const key = Math.abs(i) < NO_CURRENT ? 'page.node.none' : i > 0 ? 'page.node.in' : 'page.node.out';
    lines.push({ key: 'node.current', text: t(key, { who: lead.name, value }) });
  }
  return lines;
}
