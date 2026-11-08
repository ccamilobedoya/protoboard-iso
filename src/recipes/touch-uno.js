// An Arduino UNO reading a TTP223 touch module on D2 and printing TOUCH when a finger arrives and
// RELEASE when it leaves. The module runs from the UNO's 3.3 V pin (it takes 2 to 5.5 V; 5 V would be
// 91 % of its top), so its output is 3.3 V when active: above the 3 V the UNO needs to read a HIGH.
const TOUCH = `// Print the moments the pad is touched and let go.
const int TOUCH_PIN = 2;
int before = LOW;

void setup() {
  Serial.begin(9600);
  pinMode(TOUCH_PIN, INPUT);
}

void loop() {
  int now = digitalRead(TOUCH_PIN);
  if (now != before) {
    Serial.println(now == HIGH ? "TOUCH" : "RELEASE");
  }
  before = now;
  delay(10);
}
`;

export default {
  name: 'touch-uno',
  title: { en: 'Arduino UNO: touch sensor', es: 'Arduino UNO: sensor táctil' },
  teaches: { en: 'The TTP223 gives a clean digital level that follows the finger, 60 to 220 ms late; the program prints each change; on the UNO\'s 3.3 V its output is 3.3 V, enough for a HIGH', es: 'El TTP223 da un nivel digital limpio que sigue al dedo, con 60 a 220 ms de retraso; el programa imprime cada cambio; con los 3,3 V del UNO su salida es de 3,3 V, suficiente para un HIGH' },
  parts: [
    { id: 'U1', part: 'UNO', program: TOUCH },
    { id: 'U2', type: 'touch-sensor', mode: 'momentary' },
  ],
  nets: [['U1.3V3', 'U2.VCC'], ['U2.SIG', 'U1.D2'], ['U2.GND', 'U1.GND']],
  environment: { touch: false },
  page: { controls: [{ environment: 'touch' }] },
  values: {
    U2: { field: 'mode', choices: ['momentary', 'toggle'], extra: ['activeLow', 'fast'], role: { en: 'momentary: the output follows the touch; toggle: each touch flips it; activeLow and fast as the module\'s solder pads', es: 'momentary: la salida sigue al toque; toggle: cada toque la invierte; activeLow y fast como los pads de soldadura del módulo' } },
    U1: { field: 'program', role: { en: 'the sketch (text, or a .ino file beside the circuit)', es: 'el programa (texto, o un archivo .ino junto al circuito)' } },
  },
};
