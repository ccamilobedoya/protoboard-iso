// An Arduino UNO counting the clicks of a KY-040 rotary encoder: CLK on D2, DT on D3, SW on D4, the
// module's + on the 5 V pin. The usual polling sketch: on a falling edge of CLK, DT high means a turn
// clockwise (the count goes up) and DT low counter-clockwise (down); the push switch sets it to zero.
// Contacts chatter when they change (the module's own control goes up to 5 ms), so CLK is debounced by
// time: a change is accepted only when 8 ms have passed since the last accepted one, and the three
// lines use the chip's pull-ups. The loop waits 1 ms between reads, far under the 12.5 ms between two
// edges of a brisk turn (360 degrees a second). At a very fast turn (measured at 800 degrees a second) the
// filter can count one click too many if the shaft reverses right on an edge; at a hand's speed it is exact.
const COUNTER = `// Count the encoder's clicks: CLK falls, then DT says which way.
const int CLK_PIN = 2;
const int DT_PIN = 3;
const int SW_PIN = 4;
const unsigned long DEBOUNCE_MS = 8;
int count = 0;
int lastClk = HIGH;
unsigned long lastChange = 0;

void setup() {
  Serial.begin(9600);
  pinMode(CLK_PIN, INPUT_PULLUP);
  pinMode(DT_PIN, INPUT_PULLUP);
  pinMode(SW_PIN, INPUT_PULLUP);
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
      Serial.println(count);
    }
    lastClk = clk;
  }
  if (digitalRead(SW_PIN) == LOW && count != 0) {
    count = 0;
    Serial.println(count);
  }
  delay(1);
}
`;

export default {
  name: 'encoder-uno',
  group: 'sensors',
  title: { en: 'Arduino UNO: KY-040 rotary encoder counter', es: 'Arduino UNO: contador con encoder rotativo KY-040' },
  teaches: { en: 'A rotary encoder gives two square waves a quarter of a cycle apart: at each fall of CLK, DT high means clockwise and DT low counter-clockwise; the contacts chatter, so the sketch ignores a CLK change less than 8 ms after the last one it accepted (with the bounce set from 0 to 5 ms the count stays exact up to about 800 degrees a second, over two turns a second), and it must poll faster than 12.5 ms (the gap at 360 degrees a second) to miss no click; at a very fast turn (measured at 800 degrees a second) the filter can count a click too many if the shaft reverses right on an edge, at a hand\'s speed it is exact', es: 'Un encoder rotativo da dos ondas cuadradas desfasadas un cuarto de ciclo: en cada bajada de CLK, DT alto es giro a la derecha y DT bajo a la izquierda; los contactos rebotan, así que el programa ignora un cambio de CLK a menos de 8 ms del último que aceptó (con el rebote entre 0 y 5 ms la cuenta sigue exacta hasta unos 800 grados por segundo, más de dos vueltas por segundo), y debe leer más rápido que 12,5 ms (el intervalo a 360 grados por segundo) para no perder ningún clic; a un giro muy rápido (medido a 800 grados por segundo) el filtro puede contar un clic de más si el eje cambia de sentido justo sobre un flanco, a velocidad de mano cuenta exacto' },
  parts: [
    { id: 'U1', part: 'UNO', program: COUNTER },
    { id: 'U2', type: 'rotary-encoder', bounce: 2 },
  ],
  nets: [['U1.5V', 'U2.+'], ['U2.CLK', 'U1.D2'], ['U2.DT', 'U1.D3'], ['U2.SW', 'U1.D4'], ['U2.GND', 'U1.GND']],
  environment: { angle: { value: 0, range: [0, 360] } },
  page: { controls: [{ environment: 'angle' }, { part: 'U2', field: 'pressed' }] },
  values: {
    U2: { field: 'bounce', min: 0, max: 5, extra: ['speed'], role: { en: 'milliseconds of contact chatter at each change (2 here; 0 = clean; the sketch\'s 8 ms filter holds the count exact up to 5); speed is how fast the shaft follows the angle, degrees a second', es: 'milisegundos de rebote de los contactos en cada cambio (2 aquí; 0 = limpio; el filtro de 8 ms del programa mantiene la cuenta exacta hasta 5); speed es la rapidez con que el eje sigue al ángulo, grados por segundo' } },
    U1: { field: 'program', role: { en: 'the sketch (text, or a .ino file beside the circuit)', es: 'el programa (texto, o un archivo .ino junto al circuito)' } },
  },
};
