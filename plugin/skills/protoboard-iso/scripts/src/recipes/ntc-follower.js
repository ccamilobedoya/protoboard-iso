// An NTC thermistor and a resistor make a divider (the thermistor on top: the voltage rises as it
// warms); an LM358 follower copies that voltage and drives a 10 kΩ load that the divider alone
// could not feed without changing. The supply is 9 V (the control allows 9 to 12 V) because the LM358's
// output cannot reach within about 1.5 V of its supply: the follower copies the divider up to about 7.5 V
// at 9 V, which is about 65 degrees C, and the page's temperature control stops there. Measured: at 9 V the
// thermistor dissipates up to 2 mW, at 12 V up to 3.6 mW, enough to warm it a little (the NTC's dissipation
// constant, around 2 mW per degree for a bead in air, is a typical value, not measured here). The
// temperature is the environment's.
export default {
  name: 'ntc-follower',
  group: 'sensors',
  title: { en: 'NTC thermistor divider with a follower', es: 'Divisor con termistor NTC y seguidor' },
  teaches: { en: 'A thermistor divider turns temperature into a voltage; the follower copies it to a load without loading the divider, as long as the output can follow: an LM358 stops about 1.5 V under its supply, about 65 °C at 9 V.', es: 'Un divisor con termistor convierte la temperatura en un voltaje; el seguidor lo copia a una carga sin cargar el divisor, mientras la salida pueda seguirlo: un LM358 se detiene a unos 1,5 V de su alimentación, unos 65 °C con 9 V.' },
  environment: { temperature: 25 },
  page: { controls: [{ environment: 'temperature', min: -20, max: 65 }] },
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
    V1: { field: 'voltage', min: 9, max: 12 },
  },
};
