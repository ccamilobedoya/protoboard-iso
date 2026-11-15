// An Arduino UNO counting 0 to 9 on a 7-segment display (5161AS, common cathode): segments a to g
// on D2 to D8, each through its own resistor, the common (pin 3) to GND; the decimal point unused.
const COUNT = `// Each digit is the set of segments it lights: bit 0 is a, bit 6 is g.
const int SEGMENT[7] = {2, 3, 4, 5, 6, 7, 8}; // a, b, c, d, e, f, g
const int DIGIT[10] = {63, 6, 91, 79, 102, 109, 125, 7, 127, 111};

void setup() {
  for (int s = 0; s < 7; s++) pinMode(SEGMENT[s], OUTPUT);
}

void loop() {
  for (int n = 0; n < 10; n++) {
    for (int s = 0; s < 7; s++) digitalWrite(SEGMENT[s], bitRead(DIGIT[n], s));
    delay(1000);
  }
}
`;

export default {
  name: 'uno-seven-segment',
  group: 'boards',
  title: { en: 'Arduino UNO: a 7-segment display counts 0 to 9', es: 'Arduino UNO: un display de 7 segmentos cuenta de 0 a 9' },
  teaches: { en: 'Seven LEDs to one common pin, each with its own resistor: a digit is the set of segments the program lights', es: 'Siete LEDs a una pata común, cada uno con su resistencia: un dígito es el grupo de segmentos que enciende el programa' },
  parts: [
    { id: 'U1', part: 'UNO', program: COUNT },
    { id: 'R1', type: 'resistor', value: '220' },
    { id: 'R2', type: 'resistor', value: '220' },
    { id: 'R3', type: 'resistor', value: '220' },
    { id: 'R4', type: 'resistor', value: '220' },
    { id: 'R5', type: 'resistor', value: '220' },
    { id: 'R6', type: 'resistor', value: '220' },
    { id: 'R7', type: 'resistor', value: '220' },
    { id: 'DS1', part: '5161AS' },
  ],
  nets: [
    ['U1.D2', 'R1.1'], ['R1.2', 'DS1.a'],
    ['U1.D3', 'R2.1'], ['R2.2', 'DS1.b'],
    ['U1.D4', 'R3.1'], ['R3.2', 'DS1.c'],
    ['U1.D5', 'R4.1'], ['R4.2', 'DS1.d'],
    ['U1.D6', 'R5.1'], ['R5.2', 'DS1.e'],
    ['U1.D7', 'R6.1'], ['R6.2', 'DS1.f'],
    ['U1.D8', 'R7.1'], ['R7.2', 'DS1.g'],
    ['DS1.COM1', 'U1.GND'],
  ],
  values: {
    ...Object.fromEntries(['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((seg, k) => [`R${k + 1}`, { field: 'value', role: { en: `segment ${seg} resistor`, es: `resistencia del segmento ${seg}` } }])),
    U1: { field: 'program', role: { en: 'the sketch (text, or a .ino file beside the circuit)', es: 'el programa (texto, o un archivo .ino junto al circuito)' } },
  },
};
