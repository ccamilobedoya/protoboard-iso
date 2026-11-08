// An obstacle alarm: the FC-51's OUT goes low when something reflects its infrared back, and a buzzer
// from the supply through 470 Ω into OUT sounds (OUT sinks about 10 mA with the board's own 3 mA, under
// its 20 mA). The kit's buzzer is passive: on DC it only clicks; an active one would sound.
export default {
  name: 'obstacle-buzzer',
  title: { en: 'Obstacle alarm with an FC-51 module', es: 'Alarma de obstáculo con un módulo FC-51' },
  teaches: { en: 'The nearer the object, the more infrared comes back and the lower AO; past Vref OUT goes low and sinks the buzzer\'s current. The trimmer sets the distance, from about 4 to 28 cm', es: 'Cuanto más cerca el objeto, más infrarrojo vuelve y más baja AO; al pasar Vref OUT baja y absorbe la corriente del zumbador. El trimmer fija la distancia, de unos 4 a 28 cm' },
  parts: [
    { id: 'U1', type: 'sensor-module', part: 'FC-51', threshold: 0.5 },
    { id: 'R1', type: 'resistor', value: '470' },
    { id: 'BZ1', type: 'buzzer' },
  ],
  nets: [['T+', 'U1.VCC', 'R1.1'], ['R1.2', 'BZ1.1'], ['BZ1.2', 'U1.OUT'], ['U1.GND', 'T-']],
  supplies: [{ id: 'V1', kind: 'bench', voltage: 5, positive: 'T+', negative: 'T-' }],
  environment: { distance: 30, reflectance: 90 },
  page: { controls: [{ environment: 'distance', min: 2, max: 40 }, { part: 'U1', field: 'threshold' }] },
  values: {
    U1: { field: 'threshold', min: 0.05, max: 0.95, role: { en: 'the trimmer (Vref as a share of VCC)', es: 'el trimmer (Vref como parte de VCC)' } },
    R1: { field: 'value', role: { en: 'buzzer resistor', es: 'resistencia del zumbador' } },
  },
};
