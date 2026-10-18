// Fields every part takes, and the ones that belong to some types only. A test checks that
// every field of the circuit schema is in one of the two, so the list cannot drift.
export const COMMON_FIELDS = ['id', 'type', 'pins', 'description', 'model', 'label'];
export const TYPE_FIELDS = {
  resistor: ['value', 'tolerance', 'bands', 'power'],
  capacitor: ['value', 'kind', 'voltage', 'diameter', 'height'],
  potentiometer: ['value', 'style', 'position'],
  diode: ['part'],
  zener: ['part', 'value'],
  bridge: ['part'],
  led: ['color', 'size'],
  mosfet: ['part'],
  bjt: ['part'],
  ic: ['part', 'pin1', 'package', 'pinNames', 'marking'],
  regulator: ['part', 'led'],
  button: ['pressed', 'color'],
  switch: ['style', 'on', 'wires', 'side', 'offset'],
  wire: ['color', 'style', 'height'],
  battery: ['format', 'chemistry', 'cells', 'charge', 'capacity', 'voltage', 'internalResistance', 'switch', 'side', 'offset'],
  module: ['part', 'pin1', 'rowSpacing', 'wires', 'side', 'offset', 'rese', 'panel'],
  inductor: ['value', 'dcr', 'current'],
  thermistor: ['value', 'beta', 'temperature'],
  ldr: ['part', 'light'],
  buzzer: ['resistance'],
  header: ['count', 'pin1', 'color'],
};

// Fields a part has that its type does not take (a typo, or another type's field): saved, they
// would be ignored without a word, as "state": "on" on a switch left it off.
export function strayFields(part) {
  const known = TYPE_FIELDS[part?.type];
  if (!known) return [];
  const allowed = new Set([...COMMON_FIELDS, ...known]);
  return Object.keys(part).filter((k) => !allowed.has(k));
}

export const fieldsOfType = (type) => [...COMMON_FIELDS.filter((f) => !['id', 'type', 'pins'].includes(f)), ...(TYPE_FIELDS[type] ?? [])];
