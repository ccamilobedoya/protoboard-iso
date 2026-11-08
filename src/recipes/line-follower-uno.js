// An Arduino UNO reading a TCRT5000 line follower module: DO on D2, AO on A0. Over white paper the
// reflection pulls AO and DO low; over a black line (or nothing near) DO is high. The sensor is held
// 3 mm over the surface (its own distance); the environment's reflectance is the surface under it.
const LINE = `// DO is LOW over white (the infrared comes back) and HIGH over a black line.
const int LINE_PIN = 2;

void setup() {
  pinMode(LINE_PIN, INPUT);
  Serial.begin(9600);
}

void loop() {
  if (digitalRead(LINE_PIN) == HIGH) {
    Serial.print("LINE ");
  } else {
    Serial.print("NO LINE ");
  }
  Serial.println(analogRead(A0));   // AO: 0 … 1023
  delay(200);
}
`;

export default {
  name: 'line-follower-uno',
  title: { en: 'Arduino UNO: TCRT5000 line follower', es: 'Arduino UNO: seguidor de línea TCRT5000' },
  teaches: { en: 'White paper sends the infrared back and the phototransistor pulls AO low, so DO reads LOW; black ink absorbs it, AO rises and DO reads HIGH: the program prints LINE', es: 'El papel blanco devuelve el infrarrojo y el fototransistor baja AO, así que DO lee LOW; la tinta negra lo absorbe, AO sube y DO lee HIGH: el programa escribe LINE' },
  parts: [
    { id: 'U1', part: 'UNO', program: LINE },
    { id: 'U2', type: 'sensor-module', part: 'TCRT5000-M', threshold: 0.5, distance: 0.3 },
  ],
  nets: [['U1.5V', 'U2.VCC'], ['U2.GND', 'U1.GND'], ['U2.DO', 'U1.D2'], ['U2.AO', 'U1.A0']],
  environment: { reflectance: 80 },
  page: { controls: [{ environment: 'reflectance' }, { part: 'U2', field: 'threshold' }] },
  values: {
    U2: { field: 'threshold', min: 0.05, max: 0.95, role: { en: 'the trimmer (Vref as a share of VCC)', es: 'el trimmer (Vref como parte de VCC)' } },
    U1: { field: 'program', role: { en: 'the sketch (text, or a .ino file beside the circuit)', es: 'el programa (texto, o un archivo .ino junto al circuito)' } },
  },
};
