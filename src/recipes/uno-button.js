// An Arduino UNO reading a button on D2 with its internal pull-up and lighting an LED on D13
// while it is pressed.
const BUTTON = `// The LED on D13 is on while the button on D2 is pressed (it reads LOW).
const int BUTTON = 2;
const int LED = 13;

void setup() {
  pinMode(BUTTON, INPUT_PULLUP);
  pinMode(LED, OUTPUT);
  Serial.begin(9600);
}

void loop() {
  int pressed = digitalRead(BUTTON) == LOW;
  digitalWrite(LED, pressed ? HIGH : LOW);
  delay(10);
}
`;

export default {
  name: 'uno-button',
  title: { en: 'Arduino UNO: a button lights an LED', es: 'Arduino UNO: un pulsador enciende un LED' },
  teaches: { en: 'A pin as an input with the internal pull-up: it reads LOW while S1 is pressed, and the program decides the LED', es: 'Un pin como entrada con el pull-up interno: lee LOW mientras S1 está presionado, y el programa decide el LED' },
  parts: [
    { id: 'U1', part: 'UNO', program: BUTTON },
    { id: 'S1', type: 'button' },
    { id: 'R1', type: 'resistor', value: '220' },
    { id: 'D1', type: 'led', color: 'green' },
  ],
  nets: [['U1.D2', 'S1.1'], ['S1.3', 'U1.GND'], ['U1.D13', 'R1.1'], ['R1.2', 'D1.anode'], ['D1.cathode', 'U1.GND']],
  values: {
    R1: { field: 'value', role: { en: 'LED resistor', es: 'resistencia del LED' } },
    D1: { field: 'color' },
    U1: { field: 'program', role: { en: 'the sketch (text, or a .ino file beside the circuit)', es: 'el programa (texto, o un archivo .ino junto al circuito)' } },
  },
};
