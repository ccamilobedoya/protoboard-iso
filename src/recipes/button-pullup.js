// A button to ground with a pull-up resistor: the output strip is high until S1 is pressed. The
// LED shows the output (lit = high).
export default {
  name: 'button-pullup',
  title: { en: 'Button with a pull-up resistor', es: 'Pulsador con resistencia de pull-up' },
  teaches: { en: 'Released, R1 pulls the output up (LED on); pressed, S1 takes it to ground (LED off)', es: 'Suelto, R1 lleva la salida arriba (LED encendido); presionado, S1 la lleva a tierra (LED apagado)' },
  parts: [
    { id: 'R1', type: 'resistor', value: '1k' },
    { id: 'S1', type: 'button' },
    { id: 'R2', type: 'resistor', value: '330' },
    { id: 'D1', type: 'led', color: 'green' },
  ],
  nets: [['T+', 'R1.1'], ['R1.2', 'S1.1', 'R2.1'], ['S1.3', 'T-'], ['R2.2', 'D1.anode'], ['D1.cathode', 'T-']],
  supplies: [{ id: 'V1', kind: 'bench', voltage: 5, positive: 'T+', negative: 'T-' }],
  values: {
    R1: { field: 'value', role: { en: 'pull-up resistor', es: 'resistencia de pull-up' } },
    R2: { field: 'value', role: { en: 'LED resistor', es: 'resistencia del LED' } },
    D1: { field: 'color' },
    V1: { field: 'voltage', min: 3, max: 12 },
  },
};
