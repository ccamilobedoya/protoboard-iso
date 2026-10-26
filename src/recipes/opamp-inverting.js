// An LM358 inverting amplifier on one supply: V+ held at half the supply by a divider (the
// "virtual ground"), a sine around that level through R1, gain −R2/R1 (−2 by default).
export default {
  name: 'opamp-inverting',
  title: { en: 'Inverting amplifier', es: 'Amplificador inversor' },
  teaches: { en: 'Gain = −R2/R1 around the reference on V+: the output is twice the input, upside down', es: 'Ganancia = −R2/R1 alrededor de la referencia en V+: la salida es el doble de la entrada, invertida' },
  parts: [
    { id: 'R3', type: 'resistor', value: '10k' },
    { id: 'R4', type: 'resistor', value: '10k' },
    { id: 'U1', part: 'LM358' },
    { id: 'R1', type: 'resistor', value: '10k' },
    { id: 'R2', type: 'resistor', value: '20k' },
  ],
  nets: [['T+', 'R3.1', 'U1.VCC'], ['R4.2', 'U1.GND', 'T-'], ['R3.2', 'R4.1', 'U1.IN1+'], ['R1.1'], ['R1.2', 'R2.1', 'U1.IN1-'], ['R2.2', 'U1.OUT1']],
  supplies: [
    { id: 'V1', kind: 'bench', voltage: 9, positive: 'T+', negative: 'T-' },
    { id: 'G1', kind: 'generator', waveform: 'sine', frequency: 100, amplitude: 0.5, offset: 4.5, positive: 'R1.1', negative: 'T-' },
  ],
  values: {
    R1: { field: 'value', role: { en: 'input resistor (sets the gain)', es: 'resistencia de entrada (fija la ganancia)' } },
    R2: { field: 'value', role: { en: 'feedback (sets the gain)', es: 'realimentación (fija la ganancia)' } },
    U1: { field: 'part', choices: ['LM358', 'LM324'] },
    V1: { field: 'voltage', min: 5, max: 30 },
    G1: { field: 'amplitude', min: 0.01, max: 3 },
  },
};
