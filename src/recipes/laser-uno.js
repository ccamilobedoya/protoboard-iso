// An Arduino UNO blinks a KY-008 laser at 1 Hz (half a second on, half off) and reads a photoresistor on A0:
// the laser's light is added to the room's for every light sensor (the environment; nothing is
// aimed), so the reading the Serial monitor prints jumps while the laser is on. The photoresistor is
// a bare GL5528 over a 10 kΩ to ground (the 3-pin LDR-LM393 board has no AO pin to read).
// The pin drives the laser through an NPN: straight from D7 its 40 Ω output drops the laser to about
// 20 mA, under its 22 mA threshold (the simulation says SIM_LASER_DIM: a dim glow, no beam).
const BLINK = `// The laser on D7, a photoresistor divider on A0.
const int LASER = 7;
const int SENSOR = A0;

void setup() {
  pinMode(LASER, OUTPUT);
  Serial.begin(9600);
}

// 1 Hz: half a second on, half off; the reading in the middle of each half.
void loop() {
  digitalWrite(LASER, HIGH);
  delay(250);
  Serial.print("on  A0=");
  Serial.println(analogRead(SENSOR));
  delay(250);
  digitalWrite(LASER, LOW);
  delay(250);
  Serial.print("off A0=");
  Serial.println(analogRead(SENSOR));
  delay(250);
}
`;

export default {
  name: 'laser-uno',
  title: { en: 'Arduino UNO: a laser and a light sensor', es: 'Arduino UNO: un láser y un sensor de luz' },
  teaches: { en: 'A pin switches the laser through a transistor; its light adds to the room\'s at the photoresistor, so the reading on A0 rises while it is on and falls back when it is off', es: 'Un pin enciende el láser con un transistor; su luz se suma a la del cuarto en la fotorresistencia, así que la lectura en A0 sube mientras está encendido y vuelve a bajar al apagarlo' },
  parts: [
    { id: 'U1', part: 'UNO', program: BLINK },
    { id: 'R2', type: 'resistor', value: '1k' },
    { id: 'Q1', part: '2N3904' },
    { id: 'LS1', type: 'laser', part: 'KY-008' },
    { id: 'LDR1', type: 'ldr', part: 'GL5528' },
    { id: 'R1', type: 'resistor', value: '10k' },
  ],
  nets: [['U1.D7', 'R2.1'], ['R2.2', 'Q1.B'], ['U1.5V', 'LS1.S', 'LDR1.1'], ['LS1.−', 'Q1.C'], ['Q1.E', 'U1.GND', 'R1.2'], ['LDR1.2', 'R1.1', 'U1.A0']],
  // A wider margin keeps the wires out from behind the standing laser module (the front view).
  clearance: 2,
  environment: { light: 50, beam: false },
  page: { controls: [{ environment: 'light' }, { environment: 'beam', label: { en: 'Cut the beam', es: 'Cortar el haz' } }] },
  values: {
    R1: { field: 'value', role: { en: 'divider resistor to ground', es: 'resistencia del divisor a tierra' } },
    R2: { field: 'value', role: { en: 'base resistor', es: 'resistencia de base' } },
    U1: { field: 'program', role: { en: 'the sketch (text, or a .ino file beside the circuit)', es: 'el programa (texto, o un archivo .ino junto al circuito)' } },
  },
};
