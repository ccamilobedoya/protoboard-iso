// uno-distance with an alarm: an LED on D13 (through 220 Ω) lights while the HC-SR04 sees something
// closer than 15 cm.
import { DISTANCE } from './uno-distance.js';

const ALARM = DISTANCE.replace('const int ECHO = 10;\n', 'const int ECHO = 10;\nconst int LED = 13;\n')
  .replace('  pinMode(ECHO, INPUT);\n', '  pinMode(ECHO, INPUT);\n  pinMode(LED, OUTPUT);\n')
  .replace('  Serial.println(cm);\n', '  Serial.println(cm);\n  // Something closer than 15 cm (0 is no echo: nothing in range).\n  digitalWrite(LED, cm > 0 && cm < 15 ? HIGH : LOW);\n');

export default {
  name: 'distance-alarm-uno',
  group: 'sensors',
  title: { en: 'Arduino UNO: LED alarm under 15 cm (HC-SR04)', es: 'Arduino UNO: alarma LED a menos de 15 cm (HC-SR04)' },
  teaches: { en: 'The program compares the distance it measured with a limit and lights an LED; pulseIn returns 0 when no echo comes, which is not "close"', es: 'El programa compara la distancia que midió con un límite y enciende un LED; pulseIn devuelve 0 cuando no llega eco, y eso no es «cerca»' },
  parts: [
    { id: 'U1', part: 'UNO', program: ALARM },
    { id: 'U2', type: 'ultrasonic-sensor' },
    { id: 'R1', type: 'resistor', value: '220' },
    { id: 'D1', type: 'led', color: 'red' },
  ],
  nets: [['U1.5V', 'U2.VCC'], ['U2.GND', 'U1.GND', 'D1.cathode'], ['U1.D9', 'U2.TRIG'], ['U2.ECHO', 'U1.D10'], ['U1.D13', 'R1.1'], ['R1.2', 'D1.anode']],
  environment: { distance: { value: 30, range: [2, 100] }, temperature: 20 },
  page: { controls: [{ environment: 'distance' }] },
  values: {
    R1: { field: 'value', role: { en: 'LED resistor', es: 'resistencia del LED' } },
    D1: { field: 'color' },
    U1: { field: 'program', role: { en: 'the sketch (text, or a .ino file beside the circuit)', es: 'el programa (texto, o un archivo .ino junto al circuito)' } },
  },
};
