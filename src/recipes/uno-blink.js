// An Arduino UNO blinking an LED on D13 with its program, powered by USB. The UNO lies beside the
// board, wired with Dupont leads.
const BLINK = `// Blink: D13 on for half a second, off for half a second.
const int LED = 13;

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
  name: 'uno-blink',
  title: { en: 'Arduino UNO blinking an LED', es: 'Arduino UNO que hace parpadear un LED' },
  teaches: { en: 'A pin as an output at 5 V: digitalWrite(13, HIGH) lights D1, delay() sets the rhythm', es: 'Un pin como salida a 5 V: digitalWrite(13, HIGH) enciende D1 y delay() marca el ritmo' },
  parts: [
    { id: 'U1', part: 'UNO', program: BLINK },
    { id: 'R1', type: 'resistor', value: '220' },
    { id: 'D1', type: 'led', color: 'red' },
  ],
  nets: [['U1.D13', 'R1.1'], ['R1.2', 'D1.anode'], ['D1.cathode', 'U1.GND']],
  values: {
    R1: { field: 'value', role: { en: 'LED resistor', es: 'resistencia del LED' } },
    D1: { field: 'color' },
    U1: { field: 'program', role: { en: 'the sketch (text, or a .ino file beside the circuit)', es: 'el programa (texto, o un archivo .ino junto al circuito)' } },
  },
};
