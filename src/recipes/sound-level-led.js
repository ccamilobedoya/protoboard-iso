// A sound indicator: the KY-037's DO goes low while the sound is loud, and an LED from the supply through
// 470 Ω into DO lights (DO sinks it: about 6 mA, with the board's own 3 mA, under its 20 mA). With the
// trimmer 15 mV under the electret's bias, DO falls above about 98 dB. The resistor goes between the LED
// and DO, as in `soil-led`: the part that shares DO's strip stands right behind the standing module.
export default {
  name: 'sound-level-led',
  group: 'sensor-modules',
  title: { en: 'Sound level LED with a KY-037 module', es: 'LED de nivel de sonido con un módulo KY-037' },
  teaches: { en: 'The microphone\'s signal rides on a steady bias; when its peak is larger than the gap between the bias and the trimmer\'s Vref DO goes low and sinks the LED\'s current. A louder sound is a bigger peak, so the trimmer picks the level', es: 'La señal del micrófono va sobre una polarización fija; cuando su pico supera la distancia entre la polarización y el Vref del trimmer, DO baja y absorbe la corriente del LED. Un sonido más fuerte es un pico mayor, así que el trimmer escoge el nivel' },
  parts: [
    { id: 'U1', type: 'sensor-module', part: 'KY-037', threshold: 0.497 },
    { id: 'D1', type: 'led', color: 'red' },
    { id: 'R1', type: 'resistor', value: '470' },
  ],
  nets: [['T+', 'U1.VCC', 'D1.anode'], ['D1.cathode', 'R1.1'], ['R1.2', 'U1.DO'], ['U1.GND', 'T-']],
  supplies: [{ id: 'V1', kind: 'bench', voltage: 5, positive: 'T+', negative: 'T-' }],
  environment: { sound: { value: 40, range: [30, 110] } },
  page: { controls: [{ environment: 'sound' }, { part: 'U1', field: 'threshold', min: 0.485, max: 0.5 }] },
  values: {
    U1: { field: 'threshold', min: 0.48, max: 0.5, role: { en: 'the trimmer (Vref as a share of VCC; the real board needs it within millivolts of the bias, 0.5)', es: 'el trimmer (Vref como parte de VCC; la placa real lo necesita a milivoltios de la polarización, 0,5)' } },
    R1: { field: 'value', role: { en: 'LED resistor', es: 'resistencia del LED' } },
    D1: { field: 'color' },
  },
};
