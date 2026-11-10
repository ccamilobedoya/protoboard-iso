// An obstacle alarm: the FC-51's OUT goes low when something reflects its infrared back, which turns on
// a PNP (its base through 1 kΩ to OUT, its emitter on the supply) that switches an active buzzer
// (TMB12A05: it sounds on plain DC, takes about 30 mA at 5 V, more than the LM393's
// 20 mA output could carry itself). A PNP, not an NPN: OUT is active low.
export default {
  name: 'obstacle-buzzer',
  group: 'sensor-modules',
  title: { en: 'Obstacle alarm with an FC-51 module', es: 'Alarma de obstáculo con un módulo FC-51' },
  teaches: { en: 'The nearer the object, the more infrared comes back and the lower AO; past Vref OUT goes low and the PNP lets the active buzzer\'s current through. The trimmer sets the distance: about 4.5 cm with it at 25 %, 9 cm at 50 % and 28 cm at 90 % (white paper)', es: 'Cuanto más cerca el objeto, más infrarrojo vuelve y más baja AO; al pasar Vref OUT baja y el PNP deja pasar la corriente del zumbador activo. El trimmer fija la distancia: unos 4,5 cm con él al 25 %, 9 cm al 50 % y 28 cm al 90 % (papel blanco)' },
  parts: [
    { id: 'U1', type: 'sensor-module', part: 'FC-51', threshold: 0.5 },
    { id: 'R1', type: 'resistor', value: '1k' },
    { id: 'Q1', part: 'S8550' },
    { id: 'BZ1', type: 'buzzer', part: 'TMB12A05' },
  ],
  nets: [['T+', 'U1.VCC', 'Q1.E'], ['U1.GND', 'T-'], ['U1.OUT', 'R1.1'], ['R1.2', 'Q1.B'], ['Q1.C', 'BZ1.1'], ['BZ1.2', 'T-']],
  supplies: [{ id: 'V1', kind: 'bench', voltage: 5, positive: 'T+', negative: 'T-' }],
  environment: { distance: { value: 30, range: [2, 40] }, reflectance: 90 },
  page: { controls: [{ environment: 'distance', min: 2, max: 40 }, { part: 'U1', field: 'threshold' }] },
  values: {
    U1: { field: 'threshold', min: 0.05, max: 0.95, role: { en: 'the trimmer (Vref as a share of VCC)', es: 'el trimmer (Vref como parte de VCC)' } },
    R1: { field: 'value', role: { en: 'base resistor', es: 'resistencia de base' } },
  },
};
