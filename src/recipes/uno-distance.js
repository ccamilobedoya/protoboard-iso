// An Arduino UNO measuring distance with an HC-SR04: a 10 µs pulse on TRIG (D9) starts a measurement,
// pulseIn times how long ECHO (D10) stays high, the round trip of the sound, and the program prints
// the distance in centimetres (58 µs per cm at 20 °C) ten times a second.
export const DISTANCE = `// HC-SR04: a 10 us pulse on TRIG, then the width of ECHO is the round trip.
const int TRIG = 9;
const int ECHO = 10;

void setup() {
  pinMode(TRIG, OUTPUT);
  pinMode(ECHO, INPUT);
  Serial.begin(9600);
}

void loop() {
  digitalWrite(TRIG, LOW);
  delayMicroseconds(2);
  digitalWrite(TRIG, HIGH);
  delayMicroseconds(10);
  digitalWrite(TRIG, LOW);
  unsigned long us = pulseIn(ECHO, HIGH, 30000);
  long cm = us / 58;
  Serial.println(cm);
  delay(100);
}
`;

export default {
  name: 'uno-distance',
  group: 'sensors',
  title: { en: 'Arduino UNO: HC-SR04 distance meter', es: 'Arduino UNO: medidor de distancia con HC-SR04' },
  teaches: { en: 'TRIG starts a ping; ECHO stays high for the round trip of the sound, and pulseIn measures it: microseconds ÷ 58 is centimetres', es: 'TRIG lanza un pulso de sonido; ECHO queda en alto durante su ida y vuelta, y pulseIn lo mide: microsegundos ÷ 58 son centímetros' },
  parts: [
    { id: 'U1', part: 'UNO', program: DISTANCE },
    { id: 'U2', type: 'ultrasonic-sensor' },
  ],
  nets: [['U1.5V', 'U2.VCC'], ['U2.GND', 'U1.GND'], ['U1.D9', 'U2.TRIG'], ['U2.ECHO', 'U1.D10']],
  environment: { distance: { value: 30, range: [2, 100] }, temperature: 20 },
  page: { controls: [{ environment: 'distance' }] },
  values: {
    U1: { field: 'program', role: { en: 'the sketch (text, or a .ino file beside the circuit)', es: 'el programa (texto, o un archivo .ino junto al circuito)' } },
  },
};
