// An ESP32-C3 SuperMini reading a potentiometer on GPIO4 (ADC, 12 bits) and dimming an LED on GPIO3
// with PWM. Everything on the board's left header (5V, GND, 3V3, GPIO0–4).
const DIMMER = `// The potentiometer on GPIO4 sets the LED's brightness on GPIO3 (PWM).
const int POT = 4;
const int LED = 3;

void setup() {
  pinMode(LED, OUTPUT);
  Serial.begin(115200);
}

void loop() {
  int reading = analogRead(POT);        // 0 … 4095
  analogWrite(LED, reading / 16);       // 0 … 255
  Serial.println(reading);
  delay(200);
}
`;

export default {
  name: 'c3-pot-pwm',
  title: { en: 'ESP32-C3: a potentiometer dims an LED (ADC and PWM)', es: 'ESP32-C3: un potenciómetro regula un LED (ADC y PWM)' },
  teaches: { en: 'analogRead turns a voltage into 0…4095 (12 bits, up to about 2.5 V); analogWrite sets the share of time the pin is high', es: 'analogRead convierte un voltaje en 0…4095 (12 bits, hasta unos 2,5 V); analogWrite fija la fracción del tiempo que el pin está en alto' },
  parts: [
    { id: 'U1', part: 'ESP32-C3-SUPERMINI', program: DIMMER },
    { id: 'RV1', type: 'potentiometer', value: '10k' },
    { id: 'R1', type: 'resistor', value: '220' },
    { id: 'D1', type: 'led', color: 'red' },
  ],
  nets: [['U1.3V3', 'RV1.1'], ['RV1.3', 'U1.GND'], ['RV1.W', 'U1.GPIO4'], ['U1.GPIO3', 'R1.1'], ['R1.2', 'D1.anode'], ['D1.cathode', 'U1.GND']],
  values: {
    RV1: { field: 'value', role: { en: 'potentiometer (the input)', es: 'potenciómetro (la entrada)' } },
    R1: { field: 'value', role: { en: 'LED resistor', es: 'resistencia del LED' } },
    D1: { field: 'color' },
    U1: { field: 'program', role: { en: 'the sketch (text, or a .ino file beside the circuit)', es: 'el programa (texto, o un archivo .ino junto al circuito)' } },
  },
};
