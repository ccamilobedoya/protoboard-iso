// A button feeds the base of an NPN transistor through a resistor; the collector switches an LED.
export default {
  name: 'npn-switch',
  title: { en: 'NPN transistor switch', es: 'Interruptor con transistor NPN' },
  teaches: { en: 'A small base current switches a larger collector current (press S1)', es: 'Una corriente de base pequeña controla una corriente de colector mayor (presiona S1)' },
  parts: [
    { id: 'S1', type: 'button' },
    { id: 'R1', type: 'resistor', value: '1k' },
    { id: 'Q1', part: '2N2222A' },
    { id: 'R2', type: 'resistor', value: '330' },
    { id: 'D1', type: 'led', color: 'red' },
  ],
  nets: [['T+', 'S1.1', 'R2.1'], ['S1.3', 'R1.1'], ['R1.2', 'Q1.B'], ['R2.2', 'D1.anode'], ['D1.cathode', 'Q1.C'], ['Q1.E', 'T-']],
  supplies: [{ id: 'V1', kind: 'bench', voltage: 5, positive: 'T+', negative: 'T-' }],
  values: {
    R1: { field: 'value', role: { en: 'base resistor', es: 'resistencia de base' } },
    R2: { field: 'value', role: { en: 'LED resistor (collector)', es: 'resistencia del LED (colector)' } },
    D1: { field: 'color' },
    Q1: { field: 'part', choices: ['2N2222A', '2N3904', 'BC547', 'BC337', 'S8050'] },
    V1: { field: 'voltage', min: 3, max: 12 },
  },
};
