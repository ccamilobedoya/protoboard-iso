// An AMS1117 regulator module (capacitors on its board) feeding an LED.
export default {
  name: 'regulator-ams1117',
  title: { en: 'AMS1117 module with an LED', es: 'Módulo AMS1117 con un LED' },
  teaches: { en: 'A low-dropout regulator: 3.3 V out from 5 V in', es: 'Un regulador de baja caída: 3,3 V de salida con 5 V de entrada' },
  parts: [
    { id: 'U1', part: 'AMS1117-3.3' },
    { id: 'R1', type: 'resistor', value: '220' },
    { id: 'D1', type: 'led', color: 'red' },
  ],
  nets: [['T+', 'U1.IN'], ['U1.OUT', 'R1.1'], ['R1.2', 'D1.anode'], ['U1.GND', 'D1.cathode', 'T-']],
  supplies: [{ id: 'V1', kind: 'bench', voltage: 5, positive: 'T+', negative: 'T-' }],
  values: {
    U1: { field: 'part', choices: ['AMS1117-3.3', 'AMS1117-5.0'] },
    R1: { field: 'value', role: { en: 'LED resistor', es: 'resistencia del LED' } },
    D1: { field: 'color' },
    V1: { field: 'voltage', min: 4.5, max: 15 },
  },
};
