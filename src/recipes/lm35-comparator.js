// A temperature alarm: an LM35 (10 mV per °C) into an LM393's IN+ against a reference from a
// divider (10 kΩ over 910 Ω from 5 V ≈ 0.417 V, about 42 °C). Cold, IN+ is lower and the output
// sinks, keeping the LED off; past the reference the output is released and its pull-up resistor
// feeds the LED. The LM35's temperature is the environment's.
export default {
  name: 'lm35-comparator',
  group: 'sensors',
  title: { en: 'Temperature alarm with an LM35 and a comparator', es: 'Alarma de temperatura con LM35 y comparador' },
  teaches: { en: 'The LM35 gives 10 mV per °C; the comparator releases its output when that voltage passes the reference from the divider (about 42 °C) and the LED lights', es: 'El LM35 da 10 mV por °C; el comparador suelta su salida cuando ese voltaje pasa la referencia del divisor (unos 42 °C) y el LED se enciende' },
  environment: { temperature: 25 },
  page: { controls: [{ environment: 'temperature' }] },
  parts: [
    { id: 'R1', type: 'resistor', value: '10k' },
    { id: 'R2', type: 'resistor', value: '910' },
    { id: 'U2', type: 'temperature-sensor', part: 'LM35DZ' },
    { id: 'U1', part: 'LM393' },
    { id: 'R3', type: 'resistor', value: '330' },
    { id: 'D1', type: 'led', color: 'red' },
  ],
  nets: [['B+', 'T+', 'R1.1', 'U2.+VS', 'U1.VCC', 'R3.1'], ['B-', 'T-', 'R2.2', 'U2.GND', 'U1.GND', 'D1.cathode'], ['R1.2', 'R2.1', 'U1.IN1-'], ['U2.VOUT', 'U1.IN1+'], ['R3.2', 'U1.OUT1', 'D1.anode']],
  clearance: 3,
  supplies: [{ id: 'V1', kind: 'bench', voltage: 5, positive: 'T+', negative: 'T-' }],
  values: {
    R1: { field: 'value', role: { en: 'reference divider, top', es: 'divisor de referencia, arriba' } },
    R2: { field: 'value', role: { en: 'reference divider, bottom (sets the alarm temperature)', es: 'divisor de referencia, abajo (fija la temperatura de alarma)' } },
    R3: { field: 'value', role: { en: 'output pull-up and LED resistor', es: 'pull-up de la salida y resistencia del LED' } },
    D1: { field: 'color' },
  },
};
