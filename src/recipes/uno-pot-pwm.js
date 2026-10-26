// An Arduino UNO reading a potentiometer on A0 (its ADC) and setting an LED's brightness on D9
// with PWM; it prints what it reads.
const DIMMER = `// The potentiometer on A0 sets the LED's brightness on D9 (PWM).
const int POT = A0;
const int LED = 9;

void setup() {
  pinMode(LED, OUTPUT);
  Serial.begin(9600);
}

void loop() {
  int reading = analogRead(POT);        // 0 … 1023
  analogWrite(LED, reading / 4);        // 0 … 255
  Serial.println(reading);
  delay(200);
}
`;

export default {
  name: 'uno-pot-pwm',
  title: { en: 'Arduino UNO: a potentiometer dims an LED (ADC and PWM)', es: 'Arduino UNO: un potenciómetro regula un LED (ADC y PWM)' },
  teaches: { en: 'analogRead turns a voltage into 0…1023; analogWrite turns 0…255 into the share of time the pin is high', es: 'analogRead convierte un voltaje en 0…1023; analogWrite convierte 0…255 en la fracción del tiempo que el pin está en alto' },
  parts: [
    { id: 'RV1', type: 'potentiometer', value: '10k' },
    { id: 'U1', part: 'UNO', program: DIMMER },
    { id: 'R1', type: 'resistor', value: '220' },
    { id: 'D1', type: 'led', color: 'red' },
  ],
  nets: [['U1.5V', 'RV1.1'], ['RV1.3', 'U1.GND', 'D1.cathode'], ['RV1.W', 'U1.A0'], ['U1.D9', 'R1.1'], ['R1.2', 'D1.anode']],
  values: {
    RV1: { field: 'value', role: { en: 'potentiometer (the input)', es: 'potenciómetro (la entrada)' } },
    R1: { field: 'value', role: { en: 'LED resistor', es: 'resistencia del LED' } },
    D1: { field: 'color' },
    U1: { field: 'program', role: { en: 'the sketch (text, or a .ino file beside the circuit)', es: 'el programa (texto, o un archivo .ino junto al circuito)' } },
  },
};
