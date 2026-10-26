// An ESP32-C3 SuperMini blinking an LED on GPIO3 with its program, powered by USB.
const BLINK = `// Blink: GPIO3 on for half a second, off for half a second.
const int LED = 3;

void setup() {
  pinMode(LED, OUTPUT);
}

void loop() {
  digitalWrite(LED, HIGH);
  delay(500);
  digitalWrite(LED, LOW);
  delay(500);
}
`;

export default {
  name: 'c3-blink',
  title: { en: 'ESP32-C3 SuperMini blinking an LED', es: 'ESP32-C3 SuperMini que hace parpadear un LED' },
  teaches: { en: 'A GPIO as an output at 3.3 V: digitalWrite(3, HIGH) lights D1', es: 'Un GPIO como salida a 3,3 V: digitalWrite(3, HIGH) enciende D1' },
  parts: [
    { id: 'U1', part: 'ESP32-C3-SUPERMINI', program: BLINK },
    { id: 'R1', type: 'resistor', value: '220' },
    { id: 'D1', type: 'led', color: 'red' },
  ],
  nets: [['U1.GPIO3', 'R1.1'], ['R1.2', 'D1.anode'], ['D1.cathode', 'U1.GND']],
  values: {
    R1: { field: 'value', role: { en: 'LED resistor', es: 'resistencia del LED' } },
    D1: { field: 'color' },
    U1: { field: 'program', role: { en: 'the sketch (text, or a .ino file beside the circuit)', es: 'el programa (texto, o un archivo .ino junto al circuito)' } },
  },
};
