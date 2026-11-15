// A part's limits as the simulator checks them, without a circuit: the part's device (devices/)
// takes its params from the part alone, and its own `limits` runs against a reading at rest, so
// every maximum here is the number a simulation would warn at. Nothing is restated by hand: a model
// that changes changes this. Used by `catalog <part>` (node/catalog.js). Node only.
//
//   partRatings(part) → { limits: [{ kind, quantity, value, unit, pins?, of?, each? }], fields? } or null
//     part:   { id, type, raw, def, pinNames } (def from the type's resolve; no holes needed)
//     kind:   'rated' (what the part is made for, an LED's 20 mA) or 'max' (where a warning starts)
//     pins:   the chips of a package a limit is about (an RGB LED's R, G, B), when it says
//     of:     what the limit belongs to when the quantity alone does not say (supply, coil, stall, output…),
//             from the stress's `of`; a supply limit of an IC says so by its code
//     each:   the reading's list a limit is repeated over ('pins' of a board, 'contacts' of a switch)
//     fields: the part's fields its limits follow (a resistor's `power`), from the device's limitFields
//   null: the simulator has no limits for it (no device, or a device without `limits`).

import { deviceFor } from './devices/index.js';
import { batterySupply } from './compile.js';

// A reading at rest: every value reads 0, a list has one entry, and a stress made inside a list
// remembers the list's name. Devices read their readings in many shapes (r.current, r.pins[i],
// r.contacts.NO); this one fits them all without knowing them.
function restReading(name = null) {
  const target = function rest() {};
  return new Proxy(target, {
    get(_, key) {
      if (key === Symbol.toPrimitive) return () => 0;
      if (key === Symbol.iterator) return function* one() { yield restReading(name); };
      if (key === 'map' || key === 'flatMap') return (fn) => [fn(restReading(name), 0)].flat().map((s) => (s && typeof s === 'object' && 'max' in s && name ? { ...s, each: name } : s));
      return restReading(typeof key === 'string' ? key : name);
    },
    apply: () => restReading(name),
  });
}

// The device's entry as the engine builds it (engine.js: id, kind, pins, then the params).
function entryOf(part, device) {
  const pinNames = part.pinNames ?? [];
  const holes = pinNames.map((_, i) => ({ id: `~${i}`, node: `~${i}` }));
  const placed = { ...part, holes };
  const params = device.params(placed, { issues: [], members: {}, sketch: null, env: () => undefined });
  const entry = { id: part.id, kind: device.kind, pins: pinNames.map((name, i) => ({ name, node: holes[i].node, index: i + 1 })), ...params };
  if (device.source) entry.supply = batterySupply(placed);
  return entry;
}

// The rated current an LED's brightness is measured against (a chip of several has its own).
function ratedOf(entry) {
  const models = [entry.model, ...(entry.channels ?? []).map((c) => c.model)].filter(Boolean);
  const values = [...new Set(models.map((m) => m.ratedCurrent).filter((v) => Number.isFinite(v) && v > 0))];
  return values.map((value) => ({ kind: 'rated', quantity: 'current', value, unit: 'A' }));
}

// A stress's code that already says what it is about, for the devices that do not name it.
const OF_BY_CODE = { SIM_IC_SUPPLY: 'supply' };

export function partRatings(part) {
  const device = deviceFor(part);
  if (!device?.limits) return null;
  let entry;
  let stresses;
  try {
    entry = entryOf(part, device);
    stresses = device.limits(entry, restReading());
  } catch {
    return null; // a part whose params need the circuit around it (none today): no line rather than a wrong one
  }
  const limits = ratedOf(entry);
  // Only limits the simulator reports with their maximum; one line for the chips that share it.
  for (const s of stresses.filter((x) => !x.note && x.reportMax && Number.isFinite(x.max) && x.max > 0)) {
    const of = s.of ?? OF_BY_CODE[s.code];
    const same = limits.find((l) => l.kind === 'max' && l.quantity === s.quantity && l.value === s.max && l.unit === s.unit && l.each === s.each && l.of === of && Boolean(l.pins) === Boolean(s.pin));
    if (same && s.pin) same.pins.push(s.pin);
    else if (!same) limits.push({ kind: 'max', quantity: s.quantity, value: s.max, unit: s.unit, ...(s.pin && { pins: [s.pin] }), ...(of && { of }), ...(s.each && { each: s.each }) });
  }
  if (!limits.length) return null;
  const fields = device.limitFields?.(entry) ?? [];
  return { limits, ...(fields.length && { fields }) };
}
