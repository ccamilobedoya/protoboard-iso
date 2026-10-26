// An LM358 as a voltage follower: the output copies the potentiometer's wiper and drives an LED
// that the potentiometer alone could not.
export default {
  name: 'opamp-follower',
  title: { en: 'Op-amp voltage follower (buffer)', es: 'Seguidor de voltaje con amplificador operacional' },
  teaches: { en: 'With the output on V−, the output copies V+: the potentiometer gives a voltage, the op-amp gives the current', es: 'Con la salida en V−, la salida copia a V+: el potenciómetro da el voltaje y el amplificador da la corriente' },
  parts: [
    { id: 'RV1', type: 'potentiometer', value: '100k' },
    { id: 'U1', part: 'LM358' },
    { id: 'R1', type: 'resistor', value: '330' },
    { id: 'D1', type: 'led', color: 'red' },
  ],
  nets: [['B+', 'T+', 'RV1.1', 'U1.VCC'], ['B-', 'T-', 'RV1.3', 'U1.GND'], ['RV1.W', 'U1.IN1+'], ['U1.OUT1', 'U1.IN1-', 'R1.1'], ['R1.2', 'D1.anode'], ['D1.cathode', 'T-']],
  supplies: [{ id: 'V1', kind: 'bench', voltage: 9, positive: 'T+', negative: 'T-' }],
  values: {
    RV1: { field: 'value', role: { en: 'potentiometer (the input)', es: 'potenciómetro (la entrada)' } },
    R1: { field: 'value', role: { en: 'LED resistor', es: 'resistencia del LED' } },
    D1: { field: 'color' },
    U1: { field: 'part', choices: ['LM358', 'LM324'] },
    V1: { field: 'voltage', min: 5, max: 30 },
  },
};
