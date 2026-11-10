// The same encoder counter on an Arduino UNO, with a LED on D9 whose brightness follows the count:
// 13 PWM counts a click, so 20 clicks reach full brightness. The count is held between 0 and 255 / 13.
const DIMMER = `// Each click changes the count; the LED's brightness follows it.
const int CLK_PIN = 2;
const int DT_PIN = 3;
const int SW_PIN = 4;
const int LED_PIN = 9;
int count = 0;
int lastClk = HIGH;

void setup() {
  Serial.begin(9600);
  pinMode(CLK_PIN, INPUT);
  pinMode(DT_PIN, INPUT);
  pinMode(SW_PIN, INPUT);
  pinMode(LED_PIN, OUTPUT);
}

void loop() {
  int clk = digitalRead(CLK_PIN);
  if (lastClk == HIGH && clk == LOW) {
    if (digitalRead(DT_PIN) == HIGH) {
      count = count + 1;
    } else {
      count = count - 1;
    }
    Serial.println(count);
  }
  lastClk = clk;
  if (digitalRead(SW_PIN) == LOW && count != 0) {
    count = 0;
    Serial.println(count);
  }
  analogWrite(LED_PIN, constrain(count * 13, 0, 255));
  delay(1);
}
`;

export default {
  name: 'encoder-dimmer-uno',
  title: { en: 'Arduino UNO: dimmer with a KY-040 rotary encoder', es: 'Arduino UNO: atenuador con encoder rotativo KY-040' },
  teaches: { en: 'The encoder counts clicks in either direction and the sketch turns the count into a PWM duty with constrain(): clockwise brightens the LED, counter-clockwise dims it, the button turns it off', es: 'El encoder cuenta clics en los dos sentidos y el programa convierte la cuenta en un ciclo útil PWM con constrain(): a la derecha sube el brillo del LED, a la izquierda lo baja, el botón lo apaga' },
  parts: [
    { id: 'U1', part: 'UNO', program: DIMMER },
    { id: 'U2', type: 'rotary-encoder' },
    { id: 'R1', type: 'resistor', value: '220' },
    { id: 'D1', type: 'led', color: 'green' },
  ],
  nets: [['U1.5V', 'U2.+'], ['U2.CLK', 'U1.D2'], ['U2.DT', 'U1.D3'], ['U2.SW', 'U1.D4'], ['U2.GND', 'U1.GND'], ['U1.D9', 'D1.A'], ['D1.K', 'R1.1'], ['R1.2', 'U1.GND']],
  environment: { angle: { value: 0, range: [0, 360] } },
  page: { controls: [{ environment: 'angle' }, { part: 'U2', field: 'pressed' }] },
  values: {
    R1: { field: 'value', choices: ['150', '220', '330', '470'], role: { en: 'the LED\'s series resistor (ohms)', es: 'la resistencia en serie del LED (ohmios)' } },
    D1: { field: 'color', choices: ['red', 'green', 'yellow', 'blue', 'white'], role: { en: 'the LED\'s colour', es: 'el color del LED' } },
    U1: { field: 'program', role: { en: 'the sketch (text, or a .ino file beside the circuit)', es: 'el programa (texto, o un archivo .ino junto al circuito)' } },
  },
};
