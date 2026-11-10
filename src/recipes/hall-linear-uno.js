// An Arduino UNO reading a KY-035 module (a linear Hall sensor, the 49E) on A0 and printing the magnetic
// field in gauss. With no magnet the output sits at half the supply (2.5 V); each gauss moves it 1.4 mV,
// a south pole up and a north pole down, so the program takes the 2.5 V away and divides by 1.4 mV/G.
const GAUSSMETER = `// The 49E gives 2.5 V with no magnet and 1.4 mV for each gauss.
const int SENSOR = A0;

void setup() {
  Serial.begin(9600);
}

void loop() {
  int reading = analogRead(SENSOR);          // 0 … 1023 for 0 … 5 V
  float volts = reading * 5.0 / 1023.0;
  float gauss = (volts - 2.5) / 0.0014;      // + a south pole, − a north pole
  Serial.println(gauss);                     // gauss, one number a line
  delay(500);
}
`;

export default {
  name: 'hall-linear-uno',
  group: 'sensors',
  title: { en: 'Arduino UNO: KY-035 gaussmeter', es: 'Arduino UNO: gaussímetro con KY-035' },
  teaches: { en: 'The linear Hall sensor is ratiometric: its output is half the supply plus 1.4 mV per gauss, so the ADC reads 2.5 V with no magnet and the program turns the difference back into gauss', es: 'El sensor Hall lineal es ratiométrico: su salida es la mitad de la alimentación más 1,4 mV por gauss, así que el ADC lee 2,5 V sin imán y el programa convierte la diferencia otra vez en gauss' },
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
