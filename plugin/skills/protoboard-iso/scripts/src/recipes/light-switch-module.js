// A light switch with the 3-pin LDR-LM393 module: in the light its photoresistor's resistance falls,
// AO (inside the board) drops under Vref and DO goes low, lighting an LED from the supply into DO.
export default {
  name: 'light-switch-module',
  group: 'sensor-modules',
  title: { en: 'Light switch with an LDR-LM393 module', es: 'Interruptor de luz con un módulo LDR-LM393' },
  teaches: { en: 'The module turns light into yes or no: DO goes low past about 18 lx with the trimmer in the middle (the figure is the model\'s photoresistor; a real one varies), and the LED lights; the trimmer moves that point', es: 'El módulo convierte la luz en sí o no: DO baja a partir de unos 18 lx con el trimmer en el medio (la cifra es de la fotorresistencia del modelo; una real varía), y el LED se enciende; el trimmer mueve ese punto' },
  parts: [
    { id: 'U1', type: 'sensor-module', part: 'LDR-LM393', threshold: 0.5 },
    { id: 'R1', type: 'resistor', value: '470' },
    { id: 'D1', type: 'led', color: 'yellow' },
  ],
  nets: [['T+', 'U1.VCC', 'R1.1'], ['R1.2', 'D1.anode'], ['D1.cathode', 'U1.DO'], ['U1.GND', 'T-']],
  // Room between the groups: without it a standing module or the LED hides a resistor in one of the two views.
  clearance: 3,
  supplies: [{ id: 'V1', kind: 'bench', voltage: 5, positive: 'T+', negative: 'T-' }],
  environment: { light: 5 },
  page: { controls: [{ environment: 'light' }, { part: 'U1', field: 'threshold' }] },
  values: {
    U1: { field: 'threshold', min: 0.05, max: 0.95, role: { en: 'the trimmer (Vref as a share of VCC)', es: 'el trimmer (Vref como parte de VCC)' } },
    R1: { field: 'value', role: { en: 'LED resistor', es: 'resistencia del LED' } },
    D1: { field: 'color' },
  },
};
