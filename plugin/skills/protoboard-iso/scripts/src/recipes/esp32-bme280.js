// An ESP32 DevKit reading a BME280 board (the 3.3 V-only one) over I2C with the Adafruit library: the
// board on 3V3 and GND, SCL on GPIO22 and SDA on GPIO21 (the DevKit's default I2C pins). The sketch
// checks begin(0x76), the address of the usual board (the library's own default is 0x77), and prints
// temperature, pressure in hPa (the library gives Pa), humidity and the altitude every second.
const SKETCH = `// BME280 over I2C: begin(0x76), then T, P, H and altitude every second.
#include <Wire.h>
#include <Adafruit_Sensor.h>
#include <Adafruit_BME280.h>

Adafruit_BME280 bme;

void setup() {
  Serial.begin(115200);
  if (!bme.begin(0x76)) {
    Serial.println("Could not find a valid BME280 sensor");
    while (1) delay(10);
  }
}

void loop() {
  Serial.print("T: ");
  Serial.print(bme.readTemperature());
  Serial.print(" C  P: ");
  Serial.print(bme.readPressure() / 100.0F);
  Serial.print(" hPa  H: ");
  Serial.print(bme.readHumidity());
  Serial.print(" %  alt: ");
  Serial.print(bme.readAltitude(1013.25));
  Serial.println(" m");
  delay(1000);
}
`;

export default {
  name: 'esp32-bme280',
  group: 'sensors',
  title: { en: 'ESP32 with a BME280: temperature, pressure, humidity', es: 'ESP32 con un BME280: temperatura, presión y humedad' },
  teaches: { en: 'An I2C sensor answers at its address on the board\'s SDA and SCL: begin(0x76) finds the usual board; readPressure() is in Pa, ÷ 100 is hPa; the altitude comes from the pressure', es: 'Un sensor I2C responde en su dirección por SDA y SCL de la placa: begin(0x76) encuentra la placa de siempre; readPressure() está en Pa, ÷ 100 son hPa; la altitud sale de la presión' },
  parts: [
    { id: 'U1', part: 'ESP32-DEVKIT', program: SKETCH },
    { id: 'U2', type: 'climate-sensor', part: 'BME280' },
  ],
  nets: [['U1.3V3', 'U2.VCC'], ['U2.GND', 'U1.GND'], ['U1.D22', 'U2.SCL'], ['U2.SDA', 'U1.D21']],
  environment: { temperature: 22, humidity: 45, pressure: { value: 1013.25, range: [900, 1050] } },
  page: { controls: [{ environment: 'pressure' }, { environment: 'temperature' }, { environment: 'humidity' }] },
  values: {
    U1: { field: 'program', role: { en: 'the sketch (text, or a .ino file beside the circuit)', es: 'el programa (texto, o un archivo .ino junto al circuito)' } },
  },
};
