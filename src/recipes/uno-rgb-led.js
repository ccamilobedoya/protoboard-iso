// An Arduino UNO mixing the colours of an RGB LED with PWM: its red, green and blue chips on D9,
// D10 and D11, each through its own resistor, the common cathode to GND.
const MIX = `// Each chip's share of the time on (PWM) sets its brightness; the eye adds the three.
const int RED = 9;
const int GREEN = 10;
const int BLUE = 11;

void color(int r, int g, int b) {
  analogWrite(RED, r);
  analogWrite(GREEN, g);
  analogWrite(BLUE, b);
  delay(1000);
}

void setup() {
  pinMode(RED, OUTPUT);
  pinMode(GREEN, OUTPUT);
  pinMode(BLUE, OUTPUT);
}

void loop() {
  color(255, 0, 0);     // red
  color(0, 255, 0);     // green
  color(0, 0, 255);     // blue
  color(255, 255, 0);   // red + green: yellow
  color(0, 255, 255);   // green + blue: cyan
  color(255, 0, 255);   // red + blue: magenta
  color(255, 255, 255); // all three: white
  color(255, 40, 0);    // much red, a little green: orange
}
`;

export default {
  name: 'uno-rgb-led',
  group: 'boards',
  title: { en: 'Arduino UNO: an RGB LED mixes colours (PWM)', es: 'Arduino UNO: un LED RGB mezcla colores (PWM)' },
  teaches: { en: 'Three LEDs in one dome, each with its own resistor: their brightness, set by PWM, adds up to the colour the eye sees', es: 'Tres LEDs en una cúpula, cada uno con su resistencia: sus brillos, fijados con PWM, se suman en el color que ve el ojo' },
  parts: [
    { id: 'U1', part: 'UNO', program: MIX },
    { id: 'R1', type: 'resistor', value: '220' },
    { id: 'R2', type: 'resistor', value: '220' },
    { id: 'R3', type: 'resistor', value: '220' },
    { id: 'D1', type: 'rgb-led' },
  ],
  nets: [['U1.D9', 'R1.1'], ['R1.2', 'D1.R'], ['U1.D10', 'R2.1'], ['R2.2', 'D1.G'], ['U1.D11', 'R3.1'], ['R3.2', 'D1.B'], ['D1.COM', 'U1.GND']],
  values: {
    R1: { field: 'value', role: { en: 'red chip resistor', es: 'resistencia del chip rojo' } },
    R2: { field: 'value', role: { en: 'green chip resistor', es: 'resistencia del chip verde' } },
    R3: { field: 'value', role: { en: 'blue chip resistor', es: 'resistencia del chip azul' } },
    U1: { field: 'program', role: { en: 'the sketch (text, or a .ino file beside the circuit)', es: 'el programa (texto, o un archivo .ino junto al circuito)' } },
  },
};
