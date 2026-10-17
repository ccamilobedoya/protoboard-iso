// Fields every part takes, and the ones that belong to some types only. A test checks that
// every field of the circuit schema is in one of the two, so the list cannot drift.
export const COMMON_FIELDS = ['id', 'type', 'pins', 'description', 'model', 'label'];
export const TYPE_FIELDS = {
  resistor: ['value', 'tolerance', 'bands', 'power'],
  capacitor: ['value', 'kind', 'voltage', 'diameter', 'height'],
  potentiometer: ['value', 'style', 'position'],
  diode: ['part'],
  zener: ['part'],
  bridge: ['part'],
  led: ['color', 'size'],
  mosfet: ['part'],
  bjt: ['part'],
  ic: ['part', 'pin1', 'package', 'pinNames', 'marking'],
  regulator: ['part', 'led'],
  button: ['pressed'],
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
