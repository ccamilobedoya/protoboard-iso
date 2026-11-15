// A slide switch choosing which of two LEDs lights: the supply on its common (the middle pin), a red
// LED on pin 1's side and a green one on pin 2's, each with its own resistor. Slide the knob and the
// common moves from one to the other: a changeover (SPDT).
export default {
  name: 'slide-switch-leds',
  group: 'basics',
  title: { en: 'Slide switch picks an LED', es: 'Interruptor deslizante: uno de dos LEDs' },
  teaches: { en: 'A changeover (SPDT): its middle pin is joined to one end or the other, so one switch sends the current down one of two paths', es: 'Un conmutador (SPDT): su pata del medio se une a un extremo o al otro, así un solo interruptor manda la corriente por uno de dos caminos' },
  parts: [
    { id: 'S1', type: 'slide-switch', slid: false },
    { id: 'R1', type: 'resistor', value: '330' },
    { id: 'D1', type: 'led', color: 'red' },
    { id: 'R2', type: 'resistor', value: '330' },
    { id: 'D2', type: 'led', color: 'green' },
  ],
  nets: [['T+', 'S1.COM'], ['S1.1', 'R1.1'], ['R1.2', 'D1.anode'], ['S1.2', 'R2.1'], ['R2.2', 'D2.anode'], ['D1.cathode', 'D2.cathode', 'T-']],
  supplies: [{ id: 'V1', kind: 'bench', voltage: 5, positive: 'T+', negative: 'T-' }],
  values: {
    R1: { field: 'value', role: { en: 'red LED resistor', es: 'resistencia del LED rojo' } },
    R2: { field: 'value', role: { en: 'green LED resistor', es: 'resistencia del LED verde' } },
  },
};
