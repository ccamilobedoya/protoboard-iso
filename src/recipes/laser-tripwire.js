// A laser tripwire: a KY-008 always on (5 V) lights the photoresistor of an LDR-LM393 module through
// the environment (nothing is aimed: its light is added to the room's for every light sensor). While
// the beam reaches the module DO is low; cut it (the environment's `beam`) and the photoresistor sees
// only the room, AO rises over Vref, DO goes high and drives an NPN through R1 that lights the LED.
// The trimmer sits low (0.1: Vref 0.5 V, the switch near 300 lx) so the room's 50 lx reads as dark.
// An NPN and not the LED on DO: DO high is the module's 10 kΩ pull-up, a fraction of a milliampere.
// The base resistor is high on purpose: the pull-up's current is all that feeds the base. With 1 kΩ the base took
// 1.3 mA and pulled DO down to 2.0 V, neither a high nor a low (and the module's own DO LED lit); to read as a
// clean high DO must stay over 0.7 · VCC = 3.5 V, which leaves (5 − 3.5) / 10 kΩ = 0.15 mA for the base.
// With 22 kΩ the base takes 0.13 mA and DO sits at 3.66 V. The LED branch is 470 Ω (6.7 mA: LED 1.9 V, Vce 0.1 V),
// so the transistor is driven at a forced gain of 50, under the 100 or more a 2N3904 has at that current,
// and it saturates.
export default {
  name: 'laser-tripwire',
  group: 'sensor-modules',
  title: { en: 'Laser tripwire with a KY-008 and an LDR-LM393 module', es: 'Barrera láser con un KY-008 y un módulo LDR-LM393' },
  teaches: { en: 'The laser\'s light adds to the room\'s for the light sensor; cut the beam and only the room is left: DO goes high, the transistor conducts and the LED lights', es: 'La luz del láser se suma a la del cuarto para el sensor de luz; corta el haz y queda solo la del cuarto: DO sube, el transistor conduce y el LED se enciende' },
  parts: [
    { id: 'LS1', type: 'laser', part: 'KY-008' },
    { id: 'U1', type: 'sensor-module', part: 'LDR-LM393', threshold: 0.1 },
    { id: 'R1', type: 'resistor', value: '22k' },
    { id: 'Q1', part: '2N3904' },
    { id: 'R2', type: 'resistor', value: '470' },
    { id: 'D1', type: 'led', color: 'red' },
  ],
  nets: [['T+', 'LS1.S', 'U1.VCC', 'R2.1'], ['LS1.−', 'U1.GND', 'Q1.E', 'T-'], ['U1.DO', 'R1.1'], ['R1.2', 'Q1.B'], ['R2.2', 'D1.anode'], ['D1.cathode', 'Q1.C']],
  supplies: [{ id: 'V1', kind: 'bench', voltage: 5, positive: 'T+', negative: 'T-' }],
  environment: { light: 50, beam: false },
  page: { controls: [{ environment: 'beam', label: { en: 'Cut the beam', es: 'Cortar el haz' } }, { environment: 'light' }, { part: 'U1', field: 'threshold' }] },
  values: {
    U1: { field: 'threshold', min: 0.05, max: 0.95, role: { en: 'the trimmer (Vref as a share of VCC)', es: 'el trimmer (Vref como parte de VCC)' } },
    R1: { field: 'value', role: { en: 'base resistor', es: 'resistencia de base' } },
    R2: { field: 'value', role: { en: 'LED resistor', es: 'resistencia del LED' } },
    D1: { field: 'color' },
  },
};
