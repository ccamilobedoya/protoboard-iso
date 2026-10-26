// A logic-level N-channel MOSFET switching an LED; a pull-down keeps the gate off when S1 is released.
export default {
  name: 'mosfet-switch',
  title: { en: 'MOSFET switch', es: 'Interruptor con MOSFET' },
  teaches: { en: 'The gate takes voltage, not current; the pull-down R2 discharges it when S1 is released', es: 'La compuerta pide voltaje, no corriente; R2 la descarga al soltar S1' },
  parts: [
    { id: 'S1', type: 'button' },
    { id: 'R1', type: 'resistor', value: '220' },
    { id: 'R2', type: 'resistor', value: '10k' },
    { id: 'Q1', part: 'IRLZ44N' },
    { id: 'R3', type: 'resistor', value: '330' },
    { id: 'D1', type: 'led', color: 'red' },
  ],
  nets: [['T+', 'S1.1', 'R3.1'], ['S1.3', 'R1.1'], ['R1.2', 'Q1.G', 'R2.1'], ['R2.2', 'T-'], ['R3.2', 'D1.anode'], ['D1.cathode', 'Q1.D'], ['Q1.S', 'T-']],
  supplies: [{ id: 'V1', kind: 'bench', voltage: 5, positive: 'T+', negative: 'T-' }],
  values: {
    R1: { field: 'value', role: { en: 'gate resistor', es: 'resistencia de compuerta' } },
    R2: { field: 'value', role: { en: 'gate pull-down', es: 'resistencia de pull-down de la compuerta' } },
    R3: { field: 'value', role: { en: 'LED resistor (drain)', es: 'resistencia del LED (drenador)' } },
    D1: { field: 'color' },
    Q1: { field: 'part', choices: ['IRLZ44N', '2N7000'] },
    V1: { field: 'voltage', min: 3, max: 12 },
  },
};
