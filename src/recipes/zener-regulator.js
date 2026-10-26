// A Zener diode with its series resistor holding a load at its breakdown voltage.
export default {
  name: 'zener-regulator',
  title: { en: 'Zener regulator', es: 'Regulador con Zener' },
  teaches: { en: 'Reversed, the Zener holds its voltage; R1 takes the rest of the supply', es: 'En inversa, el Zener mantiene su voltaje; R1 se queda con el resto de la fuente' },
  parts: [
    { id: 'R1', type: 'resistor', value: '470' },
    { id: 'D1', part: '1N4733A' },
    { id: 'R2', type: 'resistor', value: '1k' },
  ],
  nets: [['T+', 'R1.1'], ['R1.2', 'D1.K', 'R2.1'], ['D1.A', 'R2.2', 'T-']],
  supplies: [{ id: 'V1', kind: 'bench', voltage: 9, positive: 'T+', negative: 'T-' }],
  values: {
    R1: { field: 'value', role: { en: 'series resistor', es: 'resistencia en serie' } },
    D1: { field: 'part', role: { en: 'Zener diode (1N47xx)', es: 'diodo Zener (1N47xx)' } },
    R2: { field: 'value', role: { en: 'load', es: 'carga' } },
    V1: { field: 'voltage', min: 3, max: 30 },
  },
};
