// The libraries a board's program may use at library level (docs/en/library-sensors.md): the
// classes, their methods and constants, shared by the translator (sketch.js), which writes a call as
// numbers into this table, and the runtime (program.js), which runs it. No imports: the page carries it.
//
// A class's methods are numbered by their place in `methods`: `dht.readHumidity()` becomes
// `__lib(<object>, 2)`. Appending a method keeps the numbers of the others; never reorder.
//   args      how many arguments its declaration takes: [min, max] (`DHT dht(2, DHT11)`, `Adafruit_BME280 bme`)
//   floats    the methods that return a float (Serial.print shows them with two decimals, as Arduino does)
//   chip      the I2C chip id its begin() accepts by default (an I2C class)

export const LIBRARY_INCLUDES = ['DHT.h', 'Wire.h', 'Adafruit_Sensor.h', 'Adafruit_BME280.h', 'Adafruit_BMP280.h', 'Arduino.h'];

export const LIBRARY_CLASSES = [
  { name: 'DHT', bus: 'pin', args: [2, 3], methods: ['begin', 'readTemperature', 'readHumidity', 'computeHeatIndex'], floats: ['readTemperature', 'readHumidity', 'computeHeatIndex'] },
  { name: 'Adafruit_BME280', bus: 'i2c', args: [0, 0], chip: 0x60, methods: ['begin', 'readTemperature', 'readPressure', 'readHumidity', 'readAltitude'], floats: ['readTemperature', 'readPressure', 'readHumidity', 'readAltitude'] },
  { name: 'Adafruit_BMP280', bus: 'i2c', args: [0, 0], chip: 0x58, methods: ['begin', 'readTemperature', 'readPressure', 'readAltitude'], floats: ['readTemperature', 'readPressure', 'readAltitude'] },
];

// The libraries' constants: DHT's sensor types (DHT.h) and C's NAN.
export const LIBRARY_CONSTANTS = { DHT11: 11, DHT22: 22, NAN: Number.NaN };
// Sensor types a library knows but the kit does not have yet: noted, their reads give NaN.
export const NOT_IN_KIT = ['DHT22'];
// The default I2C address of both Adafruit libraries' begin() (BME280_ADDRESS, BMP280_ADDRESS).
export const I2C_DEFAULT_ADDRESS = 0x77;

// DHT's computeHeatIndex(temperature, humidity, isFahrenheit = true), as the Adafruit library computes
// it (DHT.cpp): Steadman's simple formula, and the Rothfusz regression with its two corrections over
// 79 °F; in and out in °C when isFahrenheit is false (its own 0.55555 for the conversion back).
export function heatIndex(temperature, humidity, isFahrenheit = true) {
  const t = isFahrenheit ? temperature : temperature * 1.8 + 32;
  const h = humidity;
  let hi = 0.5 * (t + 61 + (t - 68) * 1.2 + h * 0.094);
  if (hi > 79) {
    hi = -42.379 + 2.04901523 * t + 10.14333127 * h - 0.22475541 * t * h - 0.00683783 * t ** 2 - 0.05481717 * h ** 2 + 0.00122874 * t ** 2 * h + 0.00085282 * t * h ** 2 - 0.00000199 * t ** 2 * h ** 2;
    if (h < 13 && t >= 80 && t <= 112) hi -= (13 - h) * 0.25 * Math.sqrt((17 - Math.abs(t - 95)) * 0.05882);
    else if (h > 85 && t >= 80 && t <= 87) hi += (h - 85) * 0.1 * ((87 - t) * 0.2);
  }
  return isFahrenheit ? hi : (hi - 32) * 0.55555;
}

// The Adafruit libraries' readAltitude(seaLevelhPa): metres from the pressure (hPa) in the standard
// atmosphere, 44330 · (1 − (p / sea)^0.1903).
export const altitudeOf = (hPa, sea = 1013.25) => 44330 * (1 - (hPa / sea) ** 0.1903);
