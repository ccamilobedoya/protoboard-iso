// A light sensor with a threshold: a photoresistor over a resistor makes a divider into an LM393's
// IN+, a potentiometer sets the reference on IN−. In the dark the photoresistor's resistance is
// high, the divider is below the reference, the output sinks and the LED, fed from the supply,
// lights. With the reference at half the supply the switch point is where the photoresistor equals
// the 10 kΩ under it: about 18 lx for a GL5528. The light is the environment's.
export default {
  name: 'ldr-comparator',
  group: 'sensors',
  title: { en: 'Light comparator with a photoresistor', es: 'Comparador de luz con fotorresistencia' },
  teaches: { en: 'The photoresistor\'s divider is compared with a reference you set: below it (dark) the output pulls down and the LED lights; above it (light) the output is released', es: 'El divisor de la fotorresistencia se compara con una referencia que tú fijas: por debajo (oscuro) la salida tira hacia abajo y el LED se enciende; por encima (con luz) la salida se suelta' },
  environment: { light: 300 },
  page: { controls: [{ environment: 'light' }] },
  parts: [
    { id: 'RV1', type: 'potentiometer', value: '10k', position: 0.5 }, // the reference: half the supply
    { id: 'R1', type: 'resistor', value: '10k' },
    { id: 'LDR1', type: 'ldr', part: 'GL5528' },
    { id: 'U1', part: 'LM393' },
    { id: 'R2', type: 'resistor', value: '10k' },
    { id: 'R3', type: 'resistor', value: '330' },
    { id: 'D1', type: 'led', color: 'red' },
  ],
  nets: [['B+', 'T+', 'RV1.1', 'LDR1.1', 'U1.VCC', 'R2.1', 'R3.1'], ['B-', 'T-', 'RV1.3', 'R1.2', 'U1.GND'], ['RV1.W', 'U1.IN1-'], ['LDR1.2', 'R1.1', 'U1.IN1+'], ['R2.2', 'U1.OUT1', 'D1.cathode'], ['R3.2', 'D1.anode']],
  clearance: 3,
  supplies: [{ id: 'V1', kind: 'bench', voltage: 5, positive: 'T+', negative: 'T-' }],
  values: {
    RV1: { field: 'position', min: 0, max: 1, role: { en: 'potentiometer (the reference: where the switch happens)', es: 'potenciómetro (la referencia: dónde ocurre la conmutación)' } },
    R1: { field: 'value', role: { en: 'divider resistor, with the photoresistor', es: 'resistencia del divisor, con la fotorresistencia' } },
    R2: { field: 'value', role: { en: 'output pull-up', es: 'pull-up de la salida' } },
    R3: { field: 'value', role: { en: 'LED resistor (from the supply)', es: 'resistencia del LED (desde la fuente)' } },
    D1: { field: 'color' },
    V1: { field: 'voltage', min: 3, max: 30 },
  },
};
