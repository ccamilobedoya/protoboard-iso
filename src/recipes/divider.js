// Two resistors in series: the output is taken where they meet (strip of R1.2 and R2.1).
export default {
  name: 'divider',
  title: { en: 'Voltage divider', es: 'Divisor de voltaje' },
  teaches: { en: 'Vout = Vin · R2 / (R1 + R2), measured where the two resistors meet', es: 'Vsal = Vent · R2 / (R1 + R2), medido donde se unen las dos resistencias' },
  parts: [
    { id: 'R1', type: 'resistor', value: '10k' },
    { id: 'R2', type: 'resistor', value: '10k' },
  ],
  nets: [['T+', 'R1.1'], ['R1.2', 'R2.1'], ['R2.2', 'T-']],
  supplies: [{ id: 'V1', kind: 'bench', voltage: 9, positive: 'T+', negative: 'T-' }],
  values: {
    R1: { field: 'value', role: { en: 'upper resistor', es: 'resistencia de arriba' } },
    R2: { field: 'value', role: { en: 'lower resistor (output across it)', es: 'resistencia de abajo (la salida está sobre ella)' } },
    V1: { field: 'voltage', min: 1, max: 30 },
  },
};
