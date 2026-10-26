// A bridge rectifier from an AC source on the top rails, a filter capacitor and an LED as load.
// The DC side stays on strips (no rails), and C1 comes last: so any usual filter capacitor
// (100 µF to 2200 µF) leaves the jumpers in sight.
export default {
  name: 'bridge-rectifier',
  title: { en: 'Bridge rectifier with a filter capacitor', es: 'Puente rectificador con condensador de filtro' },
  teaches: { en: 'Both half-waves come out positive; C1 fills the gaps between peaks (ripple)', es: 'Los dos semiciclos salen positivos; C1 llena los huecos entre picos (rizado)' },
  parts: [
    { id: 'BR1', part: 'KBP206' },
    { id: 'R1', type: 'resistor', value: '1k' },
    { id: 'D1', type: 'led', color: 'red' },
    { id: 'C1', type: 'capacitor', kind: 'electrolytic', value: '470u' },
  ],
  nets: [['T+', 'BR1.AC1'], ['T-', 'BR1.AC2'], ['BR1.+', 'C1.+', 'R1.1'], ['R1.2', 'D1.anode'], ['BR1.-', 'C1.-', 'D1.cathode']],
  supplies: [{ id: 'G1', kind: 'generator', waveform: 'sine', frequency: 50, amplitude: 12, positive: 'T+', negative: 'T-' }],
  netLabels: { 'T+': '~ 1', 'T-': '~ 2' },
  values: {
    C1: { field: 'value', role: { en: 'filter capacitor', es: 'condensador de filtro' } },
    R1: { field: 'value', role: { en: 'LED resistor (load)', es: 'resistencia del LED (carga)' } },
    D1: { field: 'color' },
    G1: { field: 'amplitude', min: 3, max: 30 },
  },
};
