// An LM393 comparator: its open-collector output sinks the LED's current (from the supply through
// R3) while the potentiometer's wiper on IN− is above the reference on IN+.
export default {
  name: 'lm393-comparator',
  title: { en: 'LM393 comparator (open collector)', es: 'Comparador LM393 (colector abierto)' },
  teaches: { en: 'The output only pulls down: the LED, fed from the supply, lights while V− > V+', es: 'La salida solo tira hacia abajo: el LED, alimentado desde la fuente, se enciende mientras V− > V+' },
  parts: [
    { id: 'RV1', type: 'potentiometer', value: '10k', position: 0.3 }, // wiper above the reference: the LED starts on
    { id: 'R1', type: 'resistor', value: '10k' },
    { id: 'U1', part: 'LM393' },
    { id: 'R3', type: 'resistor', value: '330' },
    { id: 'D1', type: 'led', color: 'red' },
    { id: 'R2', type: 'resistor', value: '10k' },
  ],
  nets: [['B+', 'T+', 'RV1.1', 'R1.1', 'U1.VCC', 'R3.1'], ['B-', 'T-', 'RV1.3', 'R2.2', 'U1.GND'], ['RV1.W', 'U1.IN1-'], ['R1.2', 'R2.1', 'U1.IN1+'], ['R3.2', 'D1.anode'], ['D1.cathode', 'U1.OUT1']],
  supplies: [{ id: 'V1', kind: 'bench', voltage: 5, positive: 'T+', negative: 'T-' }],
  values: {
    RV1: { field: 'value', role: { en: 'potentiometer (the input)', es: 'potenciómetro (la entrada)' } },
    R1: { field: 'value', role: { en: 'reference divider, top', es: 'divisor de referencia, arriba' } },
    R2: { field: 'value', role: { en: 'reference divider, bottom', es: 'divisor de referencia, abajo' } },
    R3: { field: 'value', role: { en: 'LED resistor (pull-up)', es: 'resistencia del LED (pull-up)' } },
    D1: { field: 'color' },
    V1: { field: 'voltage', min: 3, max: 30 },
  },
};
