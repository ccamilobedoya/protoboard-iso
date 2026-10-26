// A 78xx linear regulator with its input and output capacitors and an LED on the output.
export default {
  name: 'regulator-7805',
  title: { en: '7805 regulator with a pilot LED', es: 'Regulador 7805 con LED piloto' },
  teaches: { en: 'A fixed output from a higher input; the difference is lost as heat in U1', es: 'Una salida fija a partir de una entrada mayor; la diferencia se pierde como calor en U1' },
  parts: [
    { id: 'C1', type: 'capacitor', value: '330n' },
    { id: 'U1', part: '7805' },
    { id: 'C2', type: 'capacitor', value: '100n' },
    { id: 'R1', type: 'resistor', value: '1k' },
    { id: 'D1', type: 'led', color: 'red' },
  ],
  nets: [['T+', 'U1.IN', 'C1.1'], ['U1.OUT', 'C2.1', 'R1.1'], ['R1.2', 'D1.anode'], ['U1.GND', 'C1.2', 'C2.2', 'D1.cathode', 'T-']],
  supplies: [{ id: 'V1', kind: 'bench', voltage: 9, positive: 'T+', negative: 'T-' }],
  values: {
    U1: { field: 'part', choices: ['7805', '7806', '7808', '7809'] },
    R1: { field: 'value', role: { en: 'LED resistor', es: 'resistencia del LED' } },
    D1: { field: 'color' },
    V1: { field: 'voltage', min: 7, max: 35 },
  },
};
