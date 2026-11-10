// A clap switch: an Arduino UNO watching the DO pin of a KY-037 sound module on D2 and toggling an LED
// (D13, through 220 Ω) at each clap. The module's DO falls while the sound is loud (the electret's
// signal peak takes AO under Vref; with the trimmer 15 mV under the bias that is above about 98 dB),
// so the program looks for the falling edge, not the level: a clap that lasts a few hundredths of a
// second toggles once. A quiet room (40 dB) leaves DO high.
const CLAP = `// DO falls while the sound is loud: each fall is one clap and toggles the LED.
const int MIC = 2;
const int LED = 13;
int lit = LOW;
int before = HIGH;

void setup() {
  pinMode(MIC, INPUT);
  pinMode(LED, OUTPUT);
}

void loop() {
  int now = digitalRead(MIC);
  if (before == HIGH && now == LOW) {
    lit = (lit == LOW) ? HIGH : LOW;      // toggle
    digitalWrite(LED, lit);
    delay(200);                           // let the clap die out
  }
  before = now;
  delay(5);
}
`;

export default {
  name: 'clap-switch',
  group: 'sensor-modules',
  title: { en: 'Arduino UNO: clap switch with a KY-037 sound module', es: 'Arduino UNO: interruptor de palmada con un módulo de sonido KY-037' },
  teaches: { en: 'The microphone\'s signal is tiny: DO falls only when its peak beats the gap between the bias and the trimmer\'s Vref, about 98 dB with the trimmer set 15 mV under the bias. The program toggles the LED at each fall of DO', es: 'La señal del micrófono es diminuta: DO baja solo cuando su pico supera la distancia entre la polarización y el Vref del trimmer, unos 98 dB con el trimmer 15 mV por debajo de la polarización. El programa invierte el LED en cada bajada de DO' },
  parts: [
    { id: 'U1', part: 'UNO', program: CLAP },
    { id: 'U2', type: 'sensor-module', part: 'KY-037', threshold: 0.497 },
    { id: 'R1', type: 'resistor', value: '220' },
    { id: 'D1', type: 'led', color: 'green' },
  ],
  nets: [['U1.5V', 'U2.VCC'], ['U2.GND', 'U1.GND'], ['U2.DO', 'U1.D2'], ['U1.D13', 'R1.1'], ['R1.2', 'D1.anode'], ['D1.cathode', 'U1.GND']],
  environment: { sound: { value: 40, range: [30, 110] } },
  page: { controls: [{ environment: 'sound' }, { part: 'U2', field: 'threshold', min: 0.485, max: 0.5 }] },
  values: {
    U2: { field: 'threshold', min: 0.48, max: 0.5, role: { en: 'the trimmer (Vref as a share of VCC; the real board needs it within millivolts of the bias, 0.5)', es: 'el trimmer (Vref como parte de VCC; la placa real lo necesita a milivoltios de la polarización, 0,5)' } },
    R1: { field: 'value', role: { en: 'LED resistor', es: 'resistencia del LED' } },
    D1: { field: 'color' },
    U1: { field: 'program', role: { en: 'the sketch (text, or a .ino file beside the circuit)', es: 'el programa (texto, o un archivo .ino junto al circuito)' } },
  },
};
