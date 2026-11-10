// An NTC thermistor and a resistor make a divider (the thermistor on top: the voltage rises as it
// warms); an LM358 follower copies that voltage and drives a 10 kΩ load that the divider alone
// could not feed without changing. The supply is 9 V because the LM358's output cannot reach
// within about 1.5 V of its supply. The temperature is the environment's.
export default {
  name: 'ntc-follower',
  group: 'sensors',
  title: { en: 'NTC thermistor divider with a follower', es: 'Divisor con termistor NTC y seguidor' },
  teaches: { en: 'A thermistor divider turns temperature into a voltage; the follower copies it to a load without loading the divider', es: 'Un divisor con termistor convierte la temperatura en un voltaje; el seguidor lo copia a una carga sin cargar el divisor' },
  environment: { temperature: 25 },
  page: { controls: [{ environment: 'temperature' }] },
  parts: [
    { id: 'TH1', type: 'thermistor', value: '10k' },
    { id: 'R1', type: 'resistor', value: '10k' },
    { id: 'U1', part: 'LM358' },
    { id: 'R2', type: 'resistor', value: '10k' },
  ],
  nets: [['B+', 'T+', 'TH1.1', 'U1.VCC'], ['B-', 'T-', 'R1.2', 'U1.GND', 'R2.2'], ['TH1.2', 'R1.1', 'U1.IN1+'], ['U1.OUT1', 'U1.IN1-', 'R2.1']],
  clearance: 3,
  supplies: [{ id: 'V1', kind: 'bench', voltage: 9, positive: 'T+', negative: 'T-' }],
  values: {
    TH1: { field: 'value', role: { en: 'NTC thermistor (resistance at 25 °C)', es: 'termistor NTC (resistencia a 25 °C)' } },
    R1: { field: 'value', role: { en: 'divider resistor, bottom', es: 'resistencia del divisor, abajo' } },
    R2: { field: 'value', role: { en: 'load on the follower', es: 'carga del seguidor' } },
    V1: { field: 'voltage', min: 5, max: 30 },
  },
};
