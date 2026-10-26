// A potentiometer as a divider: its wiper feeds an LED through a resistor, so turning it dims the LED.
export default {
  name: 'potentiometer-led',
  title: { en: 'Potentiometer dimming an LED', es: 'Potenciómetro que regula un LED' },
  teaches: { en: 'The wiper is an adjustable divider: its voltage goes from 0 to the supply', es: 'El cursor es un divisor ajustable: su voltaje va de 0 al de la fuente' },
  parts: [
    { id: 'RV1', type: 'potentiometer', value: '10k' },
    { id: 'R1', type: 'resistor', value: '330' },
    { id: 'D1', type: 'led', color: 'red' },
  ],
  nets: [['T+', 'RV1.1'], ['RV1.3', 'T-'], ['RV1.W', 'R1.1'], ['R1.2', 'D1.anode'], ['D1.cathode', 'T-']],
  supplies: [{ id: 'V1', kind: 'bench', voltage: 5, positive: 'T+', negative: 'T-' }],
  values: {
    RV1: { field: 'value', role: { en: 'potentiometer', es: 'potenciómetro' } },
    R1: { field: 'value', role: { en: 'LED resistor', es: 'resistencia del LED' } },
    D1: { field: 'color' },
    V1: { field: 'voltage', min: 3, max: 12 },
  },
};
