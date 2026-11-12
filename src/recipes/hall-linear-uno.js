// An Arduino UNO reading a KY-035 module (a linear Hall sensor, the 49E) on A0 and printing the magnetic
// field in gauss. With no magnet the output sits at half the supply (2.5 V); each gauss moves it 1.4 mV,
// a south pole up and a north pole down. The zero of a real 49E lies anywhere from 2.25 to 2.75 V (up to
// 180 G of error), so the program measures it at start-up, with no magnet near, and takes it away before
// dividing by 1.4 mV/G (a typical sensitivity: the part's own is 1.0 to 1.75).
const GAUSSMETER = `// The 49E gives about half the supply with no magnet and about 1.4 mV for each gauss.
// Keep the magnet away while it starts: the first reading is taken as the zero.
const int SENSOR = A0;
float zero = 2.5;

void setup() {
  Serial.begin(9600);
  zero = analogRead(SENSOR) * 5.0 / 1023.0;  // volts with no magnet
}

void loop() {
  int reading = analogRead(SENSOR);          // 0 … 1023 for 0 … 5 V
  float volts = reading * 5.0 / 1023.0;
  float gauss = (volts - zero) / 0.0014;      // + a south pole, − a north pole
  Serial.println(gauss);                     // gauss, one number a line
  delay(500);
}
`;

export default {
  name: 'hall-linear-uno',
  group: 'sensors',
  title: { en: 'Arduino UNO: KY-035 gaussmeter', es: 'Arduino UNO: gaussímetro con KY-035' },
  teaches: { en: 'The linear Hall sensor is ratiometric: its output is about half the supply plus about 1.4 mV per gauss. Its zero varies from part to part (2.25 to 2.75 V), so the program measures it at start-up with no magnet near and turns the difference back into gauss', es: 'El sensor Hall lineal es ratiométrico: su salida es unos la mitad de la alimentación más unos 1,4 mV por gauss. Su cero varía de una pieza a otra (2,25 a 2,75 V), así que el programa lo mide al arrancar, sin imán cerca, y convierte la diferencia otra vez en gauss' },
  parts: [
    { id: 'U1', part: 'UNO', program: GAUSSMETER },
    { id: 'U2', type: 'hall-sensor', part: 'KY-035' },
  ],
  nets: [['U1.5V', 'U2.+'], ['U2.-', 'U1.GND'], ['U2.S', 'U1.A0']],
  environment: { field: { value: 0, range: [-500, 500] } },
  page: { controls: [{ environment: 'field' }] },
  values: {
    U1: { field: 'program', role: { en: 'the sketch (text, or a .ino file beside the circuit)', es: 'el programa (texto, o un archivo .ino junto al circuito)' } },
  },
};
