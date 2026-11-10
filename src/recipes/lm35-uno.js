// An Arduino UNO reading an LM35 on A0 and printing the temperature on the serial monitor: the
// sensor's output is 10 mV per °C, so a reading of the 10-bit ADC (0…1023 for 0…5 V) times 500 / 1023
// is degrees Celsius.
const THERMOMETER = `// The LM35 gives 10 mV per degree: 250 mV at 25 °C.
const int SENSOR = A0;

void setup() {
  Serial.begin(9600);
}

void loop() {
  int reading = analogRead(SENSOR);          // 0 … 1023 for 0 … 5 V
  float volts = reading * 5.0 / 1023.0;
  float celsius = volts * 100.0;             // 10 mV per °C
  Serial.print(celsius);
  Serial.println(" C");
  delay(500);
}
`;

export default {
  name: 'lm35-uno',
  group: 'sensors',
  title: { en: 'Arduino UNO: LM35 thermometer', es: 'Arduino UNO: termómetro LM35' },
  teaches: { en: 'The LM35 turns temperature into 10 mV per °C; the ADC turns that voltage into a number, and the program back into degrees', es: 'El LM35 convierte la temperatura en 10 mV por °C; el ADC convierte ese voltaje en un número, y el programa otra vez en grados' },
  parts: [
    { id: 'U1', part: 'UNO', program: THERMOMETER },
    { id: 'U2', type: 'temperature-sensor', temperature: 25 },
  ],
  nets: [['U1.5V', 'U2.+VS'], ['U2.VOUT', 'U1.A0'], ['U2.GND', 'U1.GND']],
  values: {
    U2: { field: 'temperature', min: -55, max: 150, role: { en: 'the temperature the sensor is at (°C)', es: 'la temperatura a la que está el sensor (°C)' } },
    U1: { field: 'program', role: { en: 'the sketch (text, or a .ino file beside the circuit)', es: 'el programa (texto, o un archivo .ino junto al circuito)' } },
  },
};
