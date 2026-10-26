// An LM358 non-inverting amplifier on one supply: a sine with an offset from the signal generator
// on V+, gain 1 + R2/R1 (3 by default). The oscilloscope of U1 shows the output.
export default {
  name: 'opamp-noninverting',
  title: { en: 'Non-inverting amplifier', es: 'Amplificador no inversor' },
  teaches: { en: 'Gain = 1 + R2/R1: the output is the input times 3, in phase', es: 'Ganancia = 1 + R2/R1: la salida es la entrada por 3, en fase' },
  parts: [
    { id: 'U1', part: 'LM358' },
    { id: 'R1', type: 'resistor', value: '10k' },
    { id: 'R2', type: 'resistor', value: '20k' },
  ],
  nets: [['T+', 'U1.VCC'], ['U1.GND', 'T-'], ['U1.IN1+'], ['U1.IN1-', 'R1.1', 'R2.1'], ['R1.2', 'T-'], ['R2.2', 'U1.OUT1']],
  supplies: [
    { id: 'V1', kind: 'bench', voltage: 9, positive: 'T+', negative: 'T-' },
    { id: 'G1', kind: 'generator', waveform: 'sine', frequency: 100, amplitude: 0.5, offset: 1, positive: 'U1.IN1+', negative: 'T-' },
  ],
  values: {
    R1: { field: 'value', role: { en: 'to ground (sets the gain)', es: 'a tierra (fija la ganancia)' } },
    R2: { field: 'value', role: { en: 'feedback (sets the gain)', es: 'realimentación (fija la ganancia)' } },
    U1: { field: 'part', choices: ['LM358', 'LM324'] },
    V1: { field: 'voltage', min: 5, max: 30 },
    G1: { field: 'amplitude', min: 0.01, max: 5 },
  },
};
