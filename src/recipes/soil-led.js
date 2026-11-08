// A soil moisture indicator: the YL-69 fork's DO goes low in damp soil, and an LED from the supply
// through 470 Ω into DO lights (DO sinks it: about 6 mA, with the board's own 3 mA, under its 20 mA).
export default {
  name: 'soil-led',
  title: { en: 'Soil moisture LED with a YL-69 module', es: 'LED de humedad del suelo con un módulo YL-69' },
  teaches: { en: 'The damper the soil, the lower the fork\'s resistance and AO; past the trimmer\'s Vref DO goes low and sinks the LED\'s current', es: 'Cuanto más húmedo el suelo, más baja la resistencia de la horquilla y AO; al pasar el Vref del trimmer DO baja y absorbe la corriente del LED' },
  parts: [
    { id: 'U1', type: 'sensor-module', part: 'YL-69', threshold: 0.5 },
    { id: 'D1', type: 'led', color: 'green' },
    { id: 'R1', type: 'resistor', value: '470' },
  ],
  nets: [['T+', 'U1.VCC', 'R1.1'], ['R1.2', 'D1.anode'], ['D1.cathode', 'U1.DO'], ['U1.GND', 'T-']],
  supplies: [{ id: 'V1', kind: 'bench', voltage: 5, positive: 'T+', negative: 'T-' }],
  environment: { moisture: 20 },
  page: { controls: [{ environment: 'moisture' }, { part: 'U1', field: 'threshold' }] },
  values: {
    U1: { field: 'threshold', min: 0.05, max: 0.95, role: { en: 'the trimmer (Vref as a share of VCC)', es: 'el trimmer (Vref como parte de VCC)' } },
    R1: { field: 'value', role: { en: 'LED resistor', es: 'resistencia del LED' } },
    D1: { field: 'color' },
  },
};
