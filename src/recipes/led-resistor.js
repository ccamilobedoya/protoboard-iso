// An LED and its series resistor across a supply: the first circuit of every course.
export default {
  name: 'led-resistor',
  title: { en: 'LED with a series resistor', es: 'LED con resistencia en serie' },
  teaches: { en: 'The resistor sets the LED current: I = (V − Vf) / R', es: 'La resistencia fija la corriente del LED: I = (V − Vf) / R' },
  parts: [
    { id: 'R1', type: 'resistor', value: '330' },
    { id: 'D1', type: 'led', color: 'red' },
  ],
  nets: [['T+', 'R1.1'], ['R1.2', 'D1.anode'], ['D1.cathode', 'T-']],
  supplies: [{ id: 'V1', kind: 'bench', voltage: 5, positive: 'T+', negative: 'T-' }],
  values: {
    R1: { field: 'value', role: { en: 'current-limiting resistor', es: 'resistencia limitadora' } },
    D1: { field: 'color' },
    V1: { field: 'voltage', min: 1.5, max: 15 },
  },
};
