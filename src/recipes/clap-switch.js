// A clap switch: an Arduino UNO watching the DO pin of a KY-037 sound module on D2 and toggling an LED
// (D13, through 220 Ω) at each clap. Two things are not known about the real board, so the sketch does not
// depend on them: which way DO moves with sound (makers' sheets say up, tutorials with code say down: not
// confirmed) and how long it stays there (a comparator on a microphone's AC signal gives pulses shorter than a
// delay()). So setup() reads DO's resting level, and loop(), with no delay, takes any reading different from
// it as a clap: it toggles the LED and shuts the door for 200 ms (millis()) so one clap counts once. In the
// simulator DO falls with the sound (the electret's signal peak takes AO under Vref; with the trimmer 15 mV
// under the bias that is above about 98 dB, a model figure); a quiet room (40 dB) leaves it high.
const CLAP = `// Any change of DO from its resting level is a clap; the polarity of the board does not matter.
const int MIC = 2;
const int LED = 13;
const unsigned long QUIET_MS = 200;       // after a clap, ignore DO this long
int lit = LOW;
int rest = HIGH;
unsigned long lastClap = 0;

void setup() {
  pinMode(MIC, INPUT);
  pinMode(LED, OUTPUT);
  rest = digitalRead(MIC);                // DO's level in a quiet room
}

void loop() {
  // No delay here: the pulses of a real clap can be shorter than one.
  if (digitalRead(MIC) != rest && millis() - lastClap >= QUIET_MS) {
    lastClap = millis();
    lit = (lit == LOW) ? HIGH : LOW;      // toggle
    digitalWrite(LED, lit);
  }
}
`;

export default {
  name: 'clap-switch',
  group: 'sensor-modules',
  title: { en: 'Arduino UNO: clap switch with a KY-037 sound module', es: 'Arduino UNO: interruptor de palmada con un módulo de sonido KY-037' },
  teaches: { en: 'A clap is a change of DO from its resting level, whichever way the board moves it (the polarity of a KY-037 is not confirmed) and however short the pulse is (shorter than a delay would let you see): the sketch reads the rest level in setup, polls without waiting, and ignores DO for 200 ms after each clap. In the model DO falls when the microphone\'s peak beats the gap between the bias and the trimmer\'s Vref, about 98 dB with the trimmer 15 mV under the bias', es: 'Una palmada es un cambio de DO respecto de su nivel de reposo, hacia donde lo mueva la placa (la polaridad de un KY-037 no está confirmada) y por corto que sea el pulso (más corto de lo que dejaría ver un delay): el programa lee el nivel de reposo en setup, lee sin esperar e ignora DO 200 ms después de cada palmada. En el modelo DO baja cuando el pico del micrófono supera la distancia entre la polarización y el Vref del trimmer, unos 98 dB con el trimmer 15 mV por debajo de la polarización' },
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
