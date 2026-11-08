// An Arduino UNO reading an NTC thermistor divider on A0 and printing the temperature, worked out
// with the thermistor's B equation:  1/T = 1/T0 + ln(R/R0) / B.  The divider's resistance comes
// from the ADC's count; the temperature is the environment's.
const THERMOMETER = `// NTC 10k (B = 3950) over 10k: the divider's middle is on A0.
const int SENSOR = A0;
const float R_FIXED = 10000.0;   // the resistor to ground
const float R_NTC_25 = 10000.0;  // the thermistor at 25 C
const float B = 3950.0;

void setup() {
  Serial.begin(9600);
}

void loop() {
  int reading = analogRead(SENSOR);                  // 0 ... 1023 for 0 ... 5 V
  float r = R_FIXED * (1023.0 - reading) / reading;  // the thermistor's resistance
  float kelvin = 1.0 / (1.0 / 298.15 + log(r / R_NTC_25) / B);
  Serial.print("T=");
  Serial.println(kelvin - 273.15);
  delay(1000);
}
`;

export default {
  name: 'thermistor-uno',
  title: { en: 'Arduino UNO: NTC thermistor thermometer', es: 'Arduino UNO: termómetro con termistor NTC' },
  teaches: { en: 'The thermistor and a resistor make a divider; the ADC turns its voltage into a number, and the B equation turns the resistance into degrees', es: 'El termistor y una resistencia forman un divisor; el ADC convierte su voltaje en un número, y la ecuación B convierte la resistencia en grados' },
  environment: { temperature: 25 },
  page: { controls: [{ environment: 'temperature' }] },
  parts: [
    { id: 'U1', part: 'UNO', program: THERMOMETER },
    { id: 'TH1', type: 'thermistor', value: '10k' },
    { id: 'R1', type: 'resistor', value: '10k' },
  ],
  nets: [['U1.5V', 'TH1.1'], ['TH1.2', 'R1.1', 'U1.A0'], ['R1.2', 'U1.GND']],
  values: {
    TH1: { field: 'value', role: { en: 'NTC thermistor (resistance at 25 °C; the sketch assumes 10k)', es: 'termistor NTC (resistencia a 25 °C; el programa supone 10k)' } },
    R1: { field: 'value', role: { en: 'divider resistor to ground (the sketch assumes 10k)', es: 'resistencia del divisor a tierra (el programa supone 10k)' } },
    U1: { field: 'program', role: { en: 'the sketch (text, or a .ino file beside the circuit)', es: 'el programa (texto, o un archivo .ino junto al circuito)' } },
  },
};
