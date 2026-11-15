// A tilt switch that lights an LED when it is tipped over: upright, its balls close the contact and
// short the LED (the current goes through the switch instead); tilted, the contact opens and the
// resistor's current goes through the LED.
export default {
  name: 'tilt-alarm',
  group: 'sensors',
  title: { en: 'Tilt switch alarm', es: 'Alarma con interruptor de inclinación' },
  teaches: { en: 'Upright, the closed switch takes the resistor\'s current past the LED; tilted, it opens and the LED gets it', es: 'Derecho, el interruptor cerrado se lleva la corriente de la resistencia y la desvía del LED; inclinado, se abre y el LED la recibe' },
  parts: [
    { id: 'R1', type: 'resistor', value: '330' },
    { id: 'S1', type: 'tilt-switch', tilted: false },
    { id: 'D1', type: 'led', color: 'red' },
  ],
  nets: [['T+', 'R1.1'], ['R1.2', 'S1.1', 'D1.anode'], ['S1.2', 'D1.cathode', 'T-']],
  supplies: [{ id: 'V1', kind: 'bench', voltage: 5, positive: 'T+', negative: 'T-' }],
  values: {
    R1: { field: 'value', role: { en: 'resistor (sets the LED\'s current, and the switch\'s while upright)', es: 'resistencia (fija la corriente del LED, y la del interruptor mientras está derecho)' } },
  },
};
