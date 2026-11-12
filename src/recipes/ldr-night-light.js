// A night light: a photoresistor and a resistor make a divider; its middle drives an NPN's base
// through a resistor, and the transistor's collector switches an LED. The photoresistor is on the
// ground side, so the divider's voltage rises as the light falls: the LED turns on in the dark.
// With the defaults (5 V, R3 560 Ω) the LED has about 6 mA up to 100 lx, about 2 mA at 200 lx (the base
// starts to conduct when the photoresistor falls to about 2 kΩ) and about 0.1 mA at 300 lx (model values;
// a real photoresistor's resistance varies, which moves these light levels by a factor of about 0.6 to 1.5).
// The supply goes from 3 to 9 V: at 9 V the LED takes about 13 mA and R3 about 90 mW; the switching light
// level also rises with the supply. The light is the environment's, not a part's value.
export default {
  name: 'ldr-night-light',
  group: 'sensors',
  title: { en: 'Night light with a photoresistor', es: 'Luz nocturna con fotorresistencia' },
  teaches: { en: 'In the dark the photoresistor\'s resistance is high, the divider\'s voltage rises and the transistor switches the LED on; with light it falls and the LED goes out (it switches at about 150 to 250 lx in the model; a real photoresistor moves that by a factor of 0.6 to 1.5)', es: 'A oscuras la resistencia de la fotorresistencia es alta, el voltaje del divisor sube y el transistor enciende el LED; con luz baja y el LED se apaga (conmuta entre unos 150 y 250 lx en el modelo; una fotorresistencia real lo mueve en un factor de 0,6 a 1,5)' },
  environment: { light: 300 },
  page: { controls: [{ environment: 'light' }] },
  parts: [
    { id: 'R1', type: 'resistor', value: '10k' },
    { id: 'LDR1', type: 'ldr', part: 'GL5528' },
    { id: 'R2', type: 'resistor', value: '10k' },
    { id: 'Q1', part: 'BC547' },
    { id: 'R3', type: 'resistor', value: '560' },
    { id: 'D1', type: 'led', color: 'red' },
  ],
  nets: [['T+', 'R1.1', 'R3.1'], ['R1.2', 'LDR1.1', 'R2.1'], ['R2.2', 'Q1.B'], ['R3.2', 'D1.anode'], ['D1.cathode', 'Q1.C'], ['LDR1.2', 'Q1.E', 'T-']],
  clearance: 3,
  supplies: [{ id: 'V1', kind: 'bench', voltage: 5, positive: 'T+', negative: 'T-' }],
  values: {
    R1: { field: 'value', role: { en: 'divider resistor (sets where the LED switches)', es: 'resistencia del divisor (fija dónde conmuta el LED)' } },
    R2: { field: 'value', role: { en: 'base resistor', es: 'resistencia de base' } },
    R3: { field: 'value', role: { en: 'LED resistor (collector)', es: 'resistencia del LED (colector)' } },
    D1: { field: 'color' },
    V1: { field: 'voltage', min: 3, max: 9 },
  },
};
