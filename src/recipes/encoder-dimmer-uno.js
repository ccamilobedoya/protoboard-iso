// The same encoder counter on an Arduino UNO, with a LED on D9 whose brightness follows the count:
// 12 PWM counts a click, so 20 clicks reach 240 of 255 (analogWrite takes 0 to 255: a larger value would wrap). The count is held between 0 and 20 clicks:
// turned further, it stays at the end, so one click back from there dims the LED at once.
// CLK is debounced by time (a change counts only 8 ms after the last accepted one) and the three lines use
// the chip's pull-ups, as in encoder-uno; the encoder's bounce is 2 ms by default. At a very fast turn (measured
// at 800 degrees a second) the filter can count a click too many if the shaft reverses right on an edge.
const DIMMER = `// Each click changes the count; the LED's brightness follows it.
const int CLK_PIN = 2;
const int DT_PIN = 3;
const int SW_PIN = 4;
const int LED_PIN = 9;
const unsigned long DEBOUNCE_MS = 8;
int count = 0;
int lastClk = HIGH;
unsigned long lastChange = 0;

void setup() {
  Serial.begin(9600);
  pinMode(CLK_PIN, INPUT_PULLUP);
  pinMode(DT_PIN, INPUT_PULLUP);
  pinMode(SW_PIN, INPUT_PULLUP);
  pinMode(LED_PIN, OUTPUT);
}

void loop() {
  int clk = digitalRead(CLK_PIN);
  if (clk != lastClk && millis() - lastChange >= DEBOUNCE_MS) {
    lastChange = millis();
    if (clk == LOW) {
      if (digitalRead(DT_PIN) == HIGH) {
        count = count + 1;
      } else {
        count = count - 1;
      }
      count = constrain(count, 0, 20);
      Serial.println(count);
    }
    lastClk = clk;
  }
  if (digitalRead(SW_PIN) == LOW && count != 0) {
    count = 0;
    Serial.println(count);
  }
  analogWrite(LED_PIN, count * 12);
  delay(1);
}
`;

export default {
  name: 'encoder-dimmer-uno',
  group: 'sensors',
  title: { en: 'Arduino UNO: dimmer with a KY-040 rotary encoder', es: 'Arduino UNO: atenuador con encoder rotativo KY-040' },
  teaches: { en: 'The encoder counts clicks in either direction and the sketch turns the count into a PWM duty: 12 per click, held between 0 and 20 clicks, so 240 at most. Clockwise brightens the LED, counter-clockwise dims it, the button turns it off.', es: 'El encoder cuenta clics en los dos sentidos y el programa convierte la cuenta en un ciclo útil PWM: 12 por clic, retenido entre 0 y 20 clics, o sea 240 como máximo. A la derecha sube el brillo del LED, a la izquierda lo baja, el botón lo apaga.' },
  parts: [
    { id: 'U1', part: 'UNO', program: DIMMER },
    { id: 'U2', type: 'rotary-encoder', bounce: 2 },
    { id: 'R1', type: 'resistor', value: '220' },
    { id: 'D1', type: 'led', color: 'green' },
  ],
  nets: [['U1.5V', 'U2.+'], ['U2.CLK', 'U1.D2'], ['U2.DT', 'U1.D3'], ['U2.SW', 'U1.D4'], ['U2.GND', 'U1.GND'], ['U1.D9', 'D1.A'], ['D1.K', 'R1.1'], ['R1.2', 'U1.GND']],
  environment: { angle: { value: 0, range: [0, 360] } },
  page: { controls: [{ environment: 'angle' }, { part: 'U2', field: 'pressed' }] },
  values: {
    U2: { field: 'bounce', min: 0, max: 5, extra: ['speed'], role: { en: 'milliseconds of contact chatter at each change (2 here; 0 = clean; the sketch\'s 8 ms filter holds the count exact up to 5); speed is how fast the shaft follows the angle, degrees a second', es: 'milisegundos de rebote de los contactos en cada cambio (2 aquí; 0 = limpio; el filtro de 8 ms del programa mantiene la cuenta exacta hasta 5); speed es la rapidez con que el eje sigue al ángulo, grados por segundo' } },
    R1: { field: 'value', choices: ['150', '220', '330', '470'], role: { en: 'the LED\'s series resistor (ohms)', es: 'la resistencia en serie del LED (ohmios)' } },
    D1: { field: 'color', choices: ['red', 'green', 'yellow', 'blue', 'white'], role: { en: 'the LED\'s colour', es: 'el color del LED' } },
    U1: { field: 'program', role: { en: 'the sketch (text, or a .ino file beside the circuit)', es: 'el programa (texto, o un archivo .ino junto al circuito)' } },
  },
};
