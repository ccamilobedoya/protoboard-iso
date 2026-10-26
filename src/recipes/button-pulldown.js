// A button to the supply with a pull-down resistor: the output strip is low until S1 is pressed.
// The LED shows the output (lit = high).
export default {
  name: 'button-pulldown',
  title: { en: 'Button with a pull-down resistor', es: 'Pulsador con resistencia de pull-down' },
  teaches: { en: 'Released, R1 holds the output at ground (LED off); pressed, S1 takes it to the supply (LED on)', es: 'Suelto, R1 mantiene la salida en tierra (LED apagado); presionado, S1 la lleva a la fuente (LED encendido)' },
  parts: [
    { id: 'S1', type: 'button' },
    { id: 'R1', type: 'resistor', value: '10k' },
    { id: 'R2', type: 'resistor', value: '330' },
    { id: 'D1', type: 'led', color: 'green' },
  ],
  nets: [['T+', 'S1.1'], ['S1.3', 'R1.1', 'R2.1'], ['R1.2', 'T-'], ['R2.2', 'D1.anode'], ['D1.cathode', 'T-']],
  supplies: [{ id: 'V1', kind: 'bench', voltage: 5, positive: 'T+', negative: 'T-' }],
  values: {
    R1: { field: 'value', role: { en: 'pull-down resistor', es: 'resistencia de pull-down' } },
    R2: { field: 'value', role: { en: 'LED resistor', es: 'resistencia del LED' } },
    D1: { field: 'color' },
    V1: { field: 'voltage', min: 3, max: 12 },
  },
};
