// An Arduino UNO reading the altitude from a BMP280 board. The board is the 3.3 V-only one (no
// regulator), so it takes the UNO's 3.3 V pin: on 5 V its chip would be over its 4.25 V absolute
// maximum. Its 10 kΩ pull-ups go to that 3.3 V. When the library starts Wire, the UNO turns on its own
// pull-ups to 5 V on A4 and A5 too, which would lift SDA and SCL to about 3.68 V (simulated), over the
// chip's interface-pin maximum of VDDIO + 0.3 V = 3.6 V (Bosch datasheet, as listed by distributors and
// the BME280 sheet; the PDF itself was not read). So the sketch turns them off after begin() with
// digitalWrite(A4, LOW) and digitalWrite(A5, LOW): the bus then idles at the module's 3.3 V. SDA on A4
// and SCL on A5, the UNO's I2C pins. The bus then idles at 3.3 V, but the ATmega328P's datasheet asks 0.7·VCC =
// 3.5 V at 5 V as a high on its I2C pins (the two-wire interface table; the model's 0.6·VCC is the ordinary pins'
// figure): it usually works, but it is outside the specification. A level shifter or a 3.3 V board is the right way.
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
  // Wire has turned on the UNO's own pull-ups to 5 V on SDA and SCL; the chip is 3.3 V only, so turn them off:
  // the module's 10 k pull-ups to 3.3 V keep the bus, and the TWI hardware still drives it.
  digitalWrite(A4, LOW);
  digitalWrite(A5, LOW);
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
  teaches: { en: 'The usual BMP280 board has no regulator: it goes on the UNO\'s 3.3 V pin, not 5 V. Wire turns on the UNO\'s own 5 V pull-ups, so after begin() the sketch turns them off and the bus idles at 3.3 V. Lower pressure, higher altitude.', es: 'La placa BMP280 de siempre no tiene regulador: va al pin de 3,3 V del UNO, no a 5 V. Wire enciende los pull-ups propios del UNO a 5 V, así que tras begin() el programa los apaga y el bus queda en 3,3 V. Menos presión, más altitud.' },
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
