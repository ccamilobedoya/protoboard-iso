// An Arduino UNO reading the altitude from a BMP280 board. The board is the 3.3 V-only one (no
// regulator), so it takes the UNO's 3.3 V pin: on 5 V its chip would be over its 4.25 V absolute
// maximum. Its 10 kΩ pull-ups go to that 3.3 V; when the library starts Wire, the UNO turns on its
// own pull-ups to 5 V on A4 and A5 too, so SDA and SCL idle at about 3.68 V: a HIGH for the UNO, a
// little over the chip's 3.6 V (VDDIO + 0.3 V) maximum (SIM_PIN_OVER_VDDIO, a note). It works, as on
// the bench; a level shifter keeps the lines inside. SDA on A4 and SCL on A5, the UNO's I2C pins.
const SKETCH = `// BMP280: the altitude from the air pressure, every second.
#include <Wire.h>
#include <Adafruit_BMP280.h>

Adafruit_BMP280 bmp;

void setup() {
  Serial.begin(9600);
  if (!bmp.begin(0x76)) {
    Serial.println("no BMP280");
    while (1) delay(10);
  }
}

void loop() {
  Serial.print("alt: ");
  Serial.print(bmp.readAltitude(1013.25));
  Serial.println(" m");
  delay(1000);
}
`;

export default {
  name: 'uno-bmp280-altitude',
  group: 'sensors',
  title: { en: 'Arduino UNO: altitude with a BMP280 (on 3.3 V)', es: 'Arduino UNO: altitud con un BMP280 (a 3,3 V)' },
  teaches: { en: 'The usual BMP280 board has no regulator: it goes on the UNO\'s 3.3 V pin, not 5 V (over its 4.25 V maximum). Wire then turns on the UNO\'s own pull-ups to 5 V, so SDA and SCL idle at about 3.68 V, a little over the chip\'s 3.6 V: it works, a level shifter keeps them inside. Lower pressure, higher altitude', es: 'La placa BMP280 de siempre no tiene regulador: va al pin de 3,3 V del UNO, no a 5 V (pasa su máximo de 4,25 V). Wire enciende además los pull-ups propios del UNO a 5 V, así que SDA y SCL quedan en unos 3,68 V, un poco sobre los 3,6 V del chip: funciona, un convertidor de nivel los deja dentro. Menos presión, más altitud' },
  parts: [
    { id: 'U1', part: 'UNO', program: SKETCH },
    { id: 'U2', type: 'climate-sensor', part: 'BMP280' },
  ],
  // Ground first: laid out in this order, no jumper runs behind the UNO.
  nets: [['U2.GND', 'U1.GND'], ['U1.3V3', 'U2.VCC'], ['U1.A5', 'U2.SCL'], ['U2.SDA', 'U1.A4']],
  environment: { temperature: 20, pressure: { value: 1013.25, range: [700, 1050] } },
  page: { controls: [{ environment: 'pressure' }] },
  values: {
    U1: { field: 'program', role: { en: 'the sketch (text, or a .ino file beside the circuit)', es: 'el programa (texto, o un archivo .ino junto al circuito)' } },
  },
};
