// A resistor charging a capacitor from a square wave: the time constant against the period, seen
// on the oscilloscope of C1.
export default {
  name: 'rc-square',
  title: { en: 'RC circuit with a square wave', es: 'Circuito RC con onda cuadrada' },
  teaches: { en: 'C1 charges and discharges with τ = R·C; compare it with the period of G1', es: 'C1 se carga y se descarga con τ = R·C; compárala con el período de G1' },
  parts: [
    { id: 'R1', type: 'resistor', value: '1k' },
    { id: 'C1', type: 'capacitor', value: '1u' },
  ],
  nets: [['T+', 'R1.1'], ['R1.2', 'C1.+'], ['C1.-', 'T-']],
  supplies: [{ id: 'G1', kind: 'generator', waveform: 'square', frequency: 100, amplitude: 2.5, offset: 2.5, positive: 'T+', negative: 'T-' }],
  netLabels: { 'T+': 'G1', 'T-': 'GND' },
  page: { start: 'zero' },
  values: {
    R1: { field: 'value', role: { en: 'resistor', es: 'resistencia' } },
    C1: { field: 'value', role: { en: 'capacitor', es: 'condensador' } },
    G1: { field: 'frequency', min: 0.1, max: 100000 },
  },
};
