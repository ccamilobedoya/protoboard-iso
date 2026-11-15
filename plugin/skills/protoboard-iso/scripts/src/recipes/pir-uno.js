// An Arduino UNO listening to a PIR module on D2 and printing the moment each motion starts. The
// module's OUT is 3.3 V, over the UNO's 3 V for a HIGH, so it reads it directly. The sketch looks for
// the rising edge, not the level: with the jumper on H, a person who keeps moving holds OUT high and
// prints once. A real module needs close to a minute to warm up and may fire falsely meanwhile; this recipe
// starts already warm (its `warmup` is 0), and its delay cannot go under about 2.5 s (the trimmer's minimum).
const PIR = `// Print when the PIR's OUT rises.
const int PIR_PIN = 2;
int before = LOW;

void setup() {
  Serial.begin(9600);
  pinMode(PIR_PIN, INPUT);
}

void loop() {
  int now = digitalRead(PIR_PIN);
  if (now == HIGH && before == LOW) {
    Serial.print("MOTION at ");
    Serial.print(millis());
    Serial.println(" ms");
  }
  before = now;
  delay(20);
}
`;

export default {
  name: 'pir-uno',
  group: 'sensors',
  title: { en: 'Arduino UNO: PIR motion detector', es: 'Arduino UNO: detector de movimiento PIR' },
  teaches: { en: 'A PIR\'s OUT is a plain digital level: the program watches for its rising edge and prints the time of each new motion with millis(). A real module needs about a minute to warm up and may fire falsely meanwhile (the recipe starts already warm); its shortest delay is about 2.5 s', es: 'La salida OUT de un PIR es un nivel digital simple: el programa espera su flanco de subida e imprime el momento de cada movimiento nuevo con millis(). El módulo real necesita cerca de un minuto de calentamiento y en ese rato puede dar disparos falsos (la receta arranca ya caliente); el retardo mínimo es de unos 2,5 s' },
  parts: [
    { id: 'U1', part: 'UNO', program: PIR },
    { id: 'U2', type: 'pir-sensor', delay: 5, warmup: 0 },
  ],
  nets: [['U1.5V', 'U2.VCC'], ['U2.OUT', 'U1.D2'], ['U2.GND', 'U1.GND']],
  environment: { motion: false },
  page: { controls: [{ environment: 'motion' }] },
  values: {
    U2: { field: 'delay', min: 2.5, max: 60, extra: ['mode', 'warmup'], role: { en: 'seconds OUT stays high after the last motion (the delay trimmer); mode H repeats, L ignores motion while high; warmup in seconds', es: 'segundos que OUT queda alto tras el último movimiento (el trimmer de retardo); modo H repite, L ignora el movimiento mientras está alto; warmup en segundos' } },
    U1: { field: 'program', role: { en: 'the sketch (text, or a .ino file beside the circuit)', es: 'el programa (texto, o un archivo .ino junto al circuito)' } },
  },
};
