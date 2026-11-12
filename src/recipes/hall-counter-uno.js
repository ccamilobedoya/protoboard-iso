// An Arduino UNO counting a magnet's passes with a KY-024 module (the kit models it with an A3144 Hall switch; the real board is reported to carry a linear 49E, not checked): DO on D2 goes low each
// time a south pole comes near (about 160 G in the model) and back high once it moves away (under about 105 G; real A3144 parts differ, and only a south pole counts: turn the magnet over if nothing counts); the program
// counts the falling edges and prints the count.
const COUNTER = `// Each time DO falls (a magnet arrives) the count goes up.
const int HALL = 2;
int count = 0;
int last = HIGH;

void setup() {
  pinMode(HALL, INPUT);
  Serial.begin(9600);
}

void loop() {
  int now = digitalRead(HALL);
  if (last == HIGH && now == LOW) {
    count = count + 1;
    Serial.println(count);
  }
  last = now;
  delay(10);
}
`;

export default {
  name: 'hall-counter-uno',
  group: 'sensor-modules',
  title: { en: 'Arduino UNO: KY-024 magnet counter', es: 'Arduino UNO: contador de imanes con KY-024' },
  teaches: { en: 'The Hall switch turns on at about 160 G and off under about 105 G in the model (hysteresis; real parts differ, and only a south pole counts: turn the magnet over if nothing counts), so a magnet that wobbles near the threshold counts once; the program counts each fall of DO', es: 'El interruptor Hall se enciende a unos 160 G y se apaga por debajo de unos 105 G en el modelo (histéresis; las piezas reales difieren, y solo cuenta un polo sur: da la vuelta al imán si no cuenta), así que un imán que tiembla cerca del umbral cuenta una sola vez; el programa cuenta cada bajada de DO' },
  parts: [
    { id: 'U1', part: 'UNO', program: COUNTER },
    { id: 'U2', type: 'sensor-module', part: 'KY-024', threshold: 0.5 },
  ],
  nets: [['U1.5V', 'U2.VCC'], ['U2.GND', 'U1.GND'], ['U2.DO', 'U1.D2'], ['U2.AO', 'U1.A0']],
  environment: { field: 0 },
  page: { controls: [{ environment: 'field', min: -300, max: 300 }, { part: 'U2', field: 'threshold' }] },
  values: {
    U2: { field: 'threshold', min: 0.05, max: 0.95, role: { en: 'the trimmer (Vref as a share of VCC)', es: 'el trimmer (Vref como parte de VCC)' } },
    U1: { field: 'program', role: { en: 'the sketch (text, or a .ino file beside the circuit)', es: 'el programa (texto, o un archivo .ino junto al circuito)' } },
  },
};
