// An Arduino UNO measuring a 9 V supply through a voltage sensor module: its 30 kΩ and 7.5 kΩ divide the
// input by five, so 9 V reaches A0 as 1.8 V (an input of up to 25 V stays under the UNO's 5 V). The
// program reads A0, turns the code into volts, and multiplies by five to get the supply's. The
// module's "+" pin goes nowhere inside, so it stays free.
const VOLTMETER = `// The module divides the input by 5: multiply the reading by 5 to get the supply's volts.
const int SENSOR = A0;

void setup() {
  Serial.begin(9600);
}

void loop() {
  int reading = analogRead(SENSOR);          // 0 … 1023 for 0 … 5 V on A0
  float pin = reading * 5.0 / 1023.0;
  float volts = pin * 5.0;                   // S carries 1/5 of the input: multiply by 5
  Serial.println(volts);
  delay(500);
}
`;

export default {
  name: 'voltage-sensor-uno',
  group: 'sensors',
  title: { en: 'Arduino UNO: voltmeter with a voltage sensor module', es: 'Arduino UNO: voltímetro con un módulo sensor de voltaje' },
  teaches: { en: 'The module is a 30 kΩ and 7.5 kΩ divider: S carries a fifth of the voltage at its terminal, so a 25 V input still fits the 5 V ADC, and the program multiplies the reading by five', es: 'El módulo es un divisor de 30 kΩ y 7,5 kΩ: S lleva la quinta parte del voltaje de su borne, así que una entrada de 25 V todavía cabe en el ADC de 5 V, y el programa multiplica la lectura por cinco' },
  parts: [
    { id: 'U1', part: 'UNO', program: VOLTMETER },
    { id: 'U2', type: 'voltage-sensor' },
  ],
  nets: [['T+', 'U2.VIN'], ['T-', 'U2.GND', 'U2.-', 'U1.GND'], ['U2.S', 'U1.A0']],
  supplies: [{ id: 'V1', kind: 'bench', voltage: 9, positive: 'T+', negative: 'T-' }],
  page: { controls: [{ supply: 'V1', field: 'voltage', min: 1, max: 25 }] },
  values: {
    V1: { field: 'voltage', min: 1, max: 25, role: { en: 'the voltage being measured (V; the module takes up to 25 V)', es: 'el voltaje que se mide (V; el módulo admite hasta 25 V)' } },
    U1: { field: 'program', role: { en: 'the sketch (text, or a .ino file beside the circuit)', es: 'el programa (texto, o un archivo .ino junto al circuito)' } },
  },
};
