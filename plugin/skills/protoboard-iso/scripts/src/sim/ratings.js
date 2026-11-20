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
//   partControls(part) → { controls: { field: { min, max, limit?, unit, scale, percent?, step? } }, senses: [field] }
//     or null (no device): what a run (`simulate --set`) and the page's sliders change on it, and the
//     environment's fields it follows when it gives no value of its own

import { deviceFor } from './devices/index.js';
import { batterySupply } from './compile.js';
import { supplyControls } from './controls.js';

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
    // A pin named by the rest reading itself (a board's r.pins[i].name) is the list's, not a pin.
    const pin = typeof s.pin === 'string' ? s.pin : null;
    const same = limits.find((l) => l.kind === 'max' && l.quantity === s.quantity && l.value === s.max && l.unit === s.unit && l.each === s.each && l.of === of && Boolean(l.pins) === Boolean(pin));
    if (same && pin) same.pins.push(pin);
    else if (!same) limits.push({ kind: 'max', quantity: s.quantity, value: s.max, unit: s.unit, ...(pin && { pins: [pin] }), ...(of && { of }), ...(s.each && { each: s.each }) });
  }
  if (!limits.length) return null;
  const fields = device.limitFields?.(entry) ?? [];
  return { limits, ...(fields.length && { fields }) };
}

// What can be changed on a part while it runs, and what it reads from the environment, from its
// device as the engine builds it (no circuit: the environment is left out, so a sensor's own
// stimulus shows which fields its part number follows).
export function partControls(part) {
  const device = deviceFor(part);
  if (!device) return null;
  let entry;
  let controls = {};
  try {
    entry = entryOf(part, device);
    controls = device.controls?.(entry) ?? (entry.supply ? supplyControls(entry.supply) : {});
  } catch {
    return null;
  }
  const shape = ({ min, max, limit, unit, scale, percent, step }) => ({ min, max, ...(limit && { limit }), unit: unit ?? '', scale, ...(percent && { percent }), ...(step && { step }) });
  // The fields this part follows of its device's: a module's stimulus lists them; a field with a
  // name of the part's own (a tilt switch's `tilted`) only where it has that control; a device that
  // keeps them by name (a DHT11 has no pressure) only those it keeps.
  const all = device.senses ?? [];
  const keeps = all.some((f) => f in entry);
  const senses = entry.stim && typeof entry.stim === 'object'
    ? Object.keys(entry.stim).filter((f) => all.includes(f))
    : all.filter((f) => (device.ownField?.[f] ? device.ownField[f] in controls : !keeps || entry[f] !== undefined));
  return { controls: Object.fromEntries(Object.entries(controls).map(([f, c]) => [f, shape(c)])), senses };
}
