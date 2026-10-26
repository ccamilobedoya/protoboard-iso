// An LM358 as a comparator: the potentiometer's wiper against half the supply from a divider; the
// output lights an LED when the wiper is the higher.
export default {
  name: 'opamp-comparator',
  title: { en: 'Op-amp comparator', es: 'Comparador con amplificador operacional' },
  teaches: { en: 'Without feedback the output saturates: high when V+ > V−, low when V+ < V−', es: 'Sin realimentación la salida se satura: alta cuando V+ > V−, baja cuando V+ < V−' },
  parts: [
    { id: 'R1', type: 'resistor', value: '10k' },
    { id: 'R2', type: 'resistor', value: '10k' },
    { id: 'U1', part: 'LM358' },
    { id: 'R3', type: 'resistor', value: '330' },
    { id: 'D1', type: 'led', color: 'red' },
    { id: 'RV1', type: 'potentiometer', value: '10k', position: 0.3 }, // wiper above the reference: the LED starts on
  ],
  nets: [['B+', 'T+', 'RV1.1', 'R1.1', 'U1.VCC'], ['B-', 'T-', 'RV1.3', 'R2.2', 'U1.GND'], ['RV1.W', 'U1.IN1+'], ['R1.2', 'R2.1', 'U1.IN1-'], ['U1.OUT1', 'R3.1'], ['R3.2', 'D1.anode'], ['D1.cathode', 'T-']],
  supplies: [{ id: 'V1', kind: 'bench', voltage: 5, positive: 'T+', negative: 'T-' }],
  values: {
    RV1: { field: 'value', role: { en: 'potentiometer (the input)', es: 'potenciómetro (la entrada)' } },
    R1: { field: 'value', role: { en: 'reference divider, top', es: 'divisor de referencia, arriba' } },
    R2: { field: 'value', role: { en: 'reference divider, bottom', es: 'divisor de referencia, abajo' } },
    R3: { field: 'value', role: { en: 'LED resistor', es: 'resistencia del LED' } },
    D1: { field: 'color' },
    U1: { field: 'part', choices: ['LM358', 'LM324'] },
    V1: { field: 'voltage', min: 5, max: 30 },
  },
};
