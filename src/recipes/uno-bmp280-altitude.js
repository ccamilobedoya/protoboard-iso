// An Arduino UNO reading the altitude from a BMP280 board. The board is the 3.3 V-only one (no
// regulator), so it takes the UNO's 3.3 V pin: on 5 V its chip would be over its 4.25 V absolute
// maximum. Its 10 kΩ pull-ups go to that 3.3 V, so SDA and SCL idle at 3.3 V, which the UNO still
// reads as HIGH (over 0.6 · 5 V). SDA on A4 and SCL on A5, the UNO's I2C pins.
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
  teaches: { en: 'The usual BMP280 board has no regulator: it goes on the UNO\'s 3.3 V pin, not 5 V (over its 4.25 V maximum); its I2C lines then idle at 3.3 V, still a HIGH for the UNO. Lower pressure, higher altitude', es: 'La placa BMP280 de siempre no tiene regulador: va al pin de 3,3 V del UNO, no a 5 V (pasa su máximo de 4,25 V); sus líneas I2C quedan entonces en 3,3 V, que el UNO todavía lee como HIGH. Menos presión, más altitud' },
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
