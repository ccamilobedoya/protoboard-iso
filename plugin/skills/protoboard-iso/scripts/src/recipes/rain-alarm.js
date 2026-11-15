// A rain alarm: the MH-RD's DO goes low when its comb is wet, which turns on a PNP (its base through
// 1 kΩ to DO, its emitter on the supply) that switches a buzzer. A PNP, not an NPN: DO is active low,
// and an NPN driven by it would sound while the comb is dry. The buzzer is the active one (TMB12A05, its
// own oscillator): it sounds on plain DC and takes about 30 mA, which the transistor carries straight
// from the supply, no series resistor (a resistor would only leave it less than its rated 5 V). A passive buzzer would only click.
export default {
  name: 'rain-alarm',
  group: 'sensor-modules',
  title: { en: 'Rain alarm with an MH-RD module', es: 'Alarma de lluvia con un módulo MH-RD' },
  teaches: { en: 'Water bridges the comb, AO falls under Vref and DO goes low: the LED on the board lights and DO pulls the PNP\'s base down, which switches the buzzer on', es: 'El agua une el peine, AO cae por debajo de Vref y DO baja: el LED de la placa se enciende y DO baja la base del PNP, que hace sonar el zumbador activo' },
  parts: [
    { id: 'U1', type: 'sensor-module', part: 'MH-RD', threshold: 0.5 },
    { id: 'R1', type: 'resistor', value: '1k' },
    { id: 'Q1', part: 'S8550' },
    { id: 'BZ1', type: 'buzzer', part: 'TMB12A05' },
  ],
  nets: [['T+', 'U1.VCC', 'Q1.E'], ['U1.GND', 'T-'], ['U1.DO', 'R1.1'], ['R1.2', 'Q1.B'], ['Q1.C', 'BZ1.1'], ['BZ1.2', 'T-']],
  supplies: [{ id: 'V1', kind: 'bench', voltage: 5, positive: 'T+', negative: 'T-' }],
  environment: { rain: false },
  page: { controls: [{ environment: 'rain' }, { part: 'U1', field: 'threshold' }] },
  values: {
    U1: { field: 'threshold', min: 0.05, max: 0.95, role: { en: 'the trimmer (Vref as a share of VCC)', es: 'el trimmer (Vref como parte de VCC)' } },
    R1: { field: 'value', role: { en: 'base resistor', es: 'resistencia de base' } },
  },
};
