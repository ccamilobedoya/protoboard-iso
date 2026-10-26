// An ESP32 DevKit reading a button on D27 (GPIO27) with its internal pull-up, printing what it
// reads. GND and D27 are on the same header, so the board leaves free holes for both (the other
// header is under the PCB).
const READ = `// Reads the button on D27 (LOW while pressed) and prints it when it changes.
const int BUTTON = 27;
int last = -1;

void setup() {
  pinMode(BUTTON, INPUT_PULLUP);
  Serial.begin(115200);
}

void loop() {
  int now = digitalRead(BUTTON);
  if (now != last) {
    Serial.println(now == LOW ? "pressed" : "released");
    last = now;
  }
  delay(20);
}
`;

export default {
  name: 'esp32-button',
  title: { en: 'ESP32 reading a button', es: 'ESP32 que lee un pulsador' },
  teaches: { en: 'A GPIO pin as an input with the internal pull-up: digitalRead(27) reads LOW while S1 is pressed', es: 'Un pin GPIO como entrada con el pull-up interno: digitalRead(27) lee LOW mientras S1 está presionado' },
  parts: [
    { id: 'U1', part: 'ESP32-DEVKIT', program: READ },
    { id: 'S1', type: 'button' },
  ],
  nets: [['U1.D27', 'S1.1'], ['S1.3', 'U1.GND']],
  values: {
    U1: { field: 'program', role: { en: 'the sketch (text, or a .ino file beside the circuit)', es: 'el programa (texto, o un archivo .ino junto al circuito)' } },
  },
};
