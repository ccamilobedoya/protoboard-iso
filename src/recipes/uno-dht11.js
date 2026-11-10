// An Arduino UNO reading a DHT11 module on D2 with the DHT library (docs/en/library-sensors.md): every
// two seconds both reads, a "fail" line when the sensor does not answer, else the temperature and the
// humidity. The module's S has its own 10 kΩ pull-up to +; it answers at most every 2 s (the library
// repeats its last reading in between), so the loop waits 2 s first.
export const DHT11_SKETCH = `// DHT11: temperature and humidity every 2 s (the sensor answers no faster).
#include <DHT.h>

DHT dht(2, DHT11);

void setup() {
  Serial.begin(9600);
  dht.begin();
}

void loop() {
  delay(2000);
  float h = dht.readHumidity();
  float t = dht.readTemperature();
  if (isnan(h) || isnan(t)) {
    Serial.println("fail");
    return;
  }
  Serial.print("T: ");
  Serial.print(t);
  Serial.print(" C  H: ");
  Serial.print(h);
  Serial.println(" %");
}
`;

export default {
  name: 'uno-dht11',
  group: 'sensors',
  title: { en: 'Arduino UNO: temperature and humidity with a DHT11', es: 'Arduino UNO: temperatura y humedad con un DHT11' },
  teaches: { en: 'A sensor read through its library: the DHT11 answers on one data pin, in whole degrees and whole %RH, at most every 2 s; isnan() tells a failed read', es: 'Un sensor que se lee con su biblioteca: el DHT11 responde por un solo pin de datos, en grados y %HR enteros, a lo sumo cada 2 s; isnan() dice si la lectura falló' },
  parts: [
    { id: 'U1', part: 'UNO', program: DHT11_SKETCH },
    { id: 'U2', type: 'climate-sensor', part: 'DHT11' },
  ],
  nets: [['U1.5V', 'U2.+'], ['U2.−', 'U1.GND'], ['U1.D2', 'U2.S']],
  environment: { temperature: { value: 24, range: [0, 50] }, humidity: { value: 41, range: [20, 90] } },
  page: { controls: [{ environment: 'temperature' }, { environment: 'humidity' }] },
  values: {
    U1: { field: 'program', role: { en: 'the sketch (text, or a .ino file beside the circuit)', es: 'el programa (texto, o un archivo .ino junto al circuito)' } },
  },
};
