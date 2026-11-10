// An ESP32 DevKit measuring distance with an HC-SR04. The module runs from 5 V (the DevKit's VIN, the
// USB's 5 V), so ECHO is 5 V when high: straight into a GPIO of a 3.3 V chip it would push current
// through the pin's protection diode. A divider of 1 kΩ over 2 kΩ brings it to 3.33 V, still a clear
// HIGH. TRIG needs no help: 3.3 V is over the module's 2 V threshold.
import { DISTANCE } from './uno-distance.js';

export default {
  name: 'esp32-distance',
  group: 'sensors',
  title: { en: 'ESP32 with an HC-SR04 (ECHO through a divider)', es: 'ESP32 con un HC-SR04 (ECHO por un divisor)' },
  teaches: { en: 'The HC-SR04 needs 5 V and its ECHO is 5 V; a 3.3 V board\'s pin takes it through 1 kΩ / 2 kΩ, which leaves 3.33 V, while TRIG at 3.3 V is enough for the module', es: 'El HC-SR04 necesita 5 V y su ECHO es de 5 V; el pin de una placa de 3,3 V lo recibe por 1 kΩ / 2 kΩ, que deja 3,33 V, mientras que TRIG a 3,3 V le basta al módulo' },
  // The divider first: placed before the boards, its resistors keep clear of the module, whose
  // capsules and board would hide a jumper running along it in both views.
  parts: [
    { id: 'R1', type: 'resistor', value: '1k' },
    { id: 'R2', type: 'resistor', value: '2k' },
    { id: 'U1', part: 'ESP32-DEVKIT', program: DISTANCE.replace('TRIG = 9', 'TRIG = 5').replace('ECHO = 10', 'ECHO = 18') },
    { id: 'U2', type: 'ultrasonic-sensor' },
  ],
  nets: [['U1.VIN', 'U2.VCC'], ['U2.GND', 'U1.GND', 'R2.2'], ['U1.D5', 'U2.TRIG'], ['U2.ECHO', 'R1.1'], ['R1.2', 'R2.1', 'U1.D18']],
  environment: { distance: { value: 30, range: [2, 100] }, temperature: 20 },
  page: { controls: [{ environment: 'distance' }] },
  values: {
    R1: { field: 'value', role: { en: 'divider, top (from ECHO)', es: 'divisor, arriba (desde ECHO)' } },
    R2: { field: 'value', role: { en: 'divider, bottom (to ground)', es: 'divisor, abajo (a tierra)' } },
    U1: { field: 'program', role: { en: 'the sketch (text, or a .ino file beside the circuit)', es: 'el programa (texto, o un archivo .ino junto al circuito)' } },
  },
};
