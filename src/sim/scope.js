// What the oscilloscope plots for a part (stage 3, phase 7): its voltage and its current against
// time. Each kind of part may say which ones with a `scope(reading)` hook in its device module
// (a transistor: Vce and Ic); otherwise a part with two leads plots the voltage across them and
// the current through them. Bundleable: the live page records and draws with it.
//
//   scopeOf(reading) → { v: { label, value } | null, i: { label, value } | null } | null
//
// label: a short name ("Vce", "Ic") or null for the plain voltage / current of the part.

import { deviceOfReading } from './devices/index.js';

export function scopeOf(reading) {
  if (!reading || reading.unsupported || reading.floating) return null;
  const own = deviceOfReading(reading)?.scope;
  if (own) return own(reading);
  if (typeof reading.voltage === 'number' && typeof reading.current === 'number') {
    return { v: { label: null, value: reading.voltage }, i: { label: null, value: reading.current } };
  }
  return null;
}
