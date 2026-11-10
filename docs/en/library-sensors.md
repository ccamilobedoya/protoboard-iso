# Library sensors: DHT11, BME280 and BMP280

*[Español](../es/sensores-de-biblioteca.md)*

Some sensors do not give a voltage a board reads with `analogRead`: they answer a short conversation
on a data pin (the DHT11) or on the I2C bus (the BME280 and the BMP280), and a sketch never talks to
them by hand. It uses their usual library: `dht.readTemperature()`, `bme.readPressure()`. The kit
simulates them **at library level**: the board's program calls the same library, and the sensor
answers with the environment's value passed through its range, its resolution and its timing, if it
is powered and wired where the library looks.

```json
{ "id": "U2", "type": "climate-sensor", "part": "DHT11" }
{ "id": "U2", "type": "climate-sensor", "part": "BME280", "address": "0x76" }
```

The code: `src/parts/types/climate-sensor.js` (the type), `src/parts/packages/climate.js` (the
drawings), `src/sim/devices/climate.js` (the answers), `src/sim/libraries.js` (the classes a program
may use), `src/sim/program.js` (the library calls) and `src/sim/devices/mcu.js` (how the board finds
the sensor). Recipes: `uno-dht11`, `esp32-bme280`, `uno-bmp280-altitude` ([recipes.md](recipes.md));
timeline `examples/tours/uno-dht11.json`.

## What "library level" means, and what it does not simulate

- **Simulated:** what the library returns (the numbers, `NaN`, `begin()` true or false), when it
  returns it (a real DHT read holds the sketch 25 ms, `begin()` 100 ms, both in simulated time as
  `delay` is), and whether the sensor answers at all: its supply against its limits, its power-up,
  the pin or the bus it is on, its pull-ups, its I2C address and its chip id.
- **Electrically**, the module is its supply current (a resistor), its pull-ups (10 kΩ to its supply
  or to its chip's rail) and its limits. Its data pin is never driven: a scope on S or SDA shows the
  pull-up's level.
- **Not simulated:** the bits on the wire (the DHT's 40 bits, the I2C bytes), noise, the sensors'
  own lag (the DHT11 takes 6 to 30 s to follow a change of air, the BME280's humidity about 1 s: the
  card says so), self-heating. Bit-level protocol stays on the roadmap as optional.

## The DHT11 module

Pins `S`, `+`, `−` as the usual blue board prints them (other boards print `+, OUT, −` or
`DATA, VCC, GND`: one more row with their order in `src/parts/db.js`). On the board, a 10 kΩ pull-up
from S to +.

| | |
|---|---|
| Supply | 3 to 5.5 V (3.3 V works the same); under 3 V it does not answer (`SIM_MODULE_LOW_SUPPLY`); over 5.5 V `SIM_IC_SUPPLY`; reversed, `SIM_REVERSE_VOLTAGE` |
| Current | 120 µA as a resistor between + and − (the 1 mA of the 25 ms of a read is left out) |
| Reading | temperature and humidity of the environment, rounded to the nearest whole number (23.5 → 24), held to its rated 0…50 °C and 20…90 %RH |
| Power-up | 1 s after + reaches 3 V (`warmup` on the part, default 1): a read before gives `NaN` |
| Cache | the library's: a read within 2 s of the last real one (a failed one too) returns that one, with no time and no new value; `begin()` lets the next read be real |
| Accuracy | ±2 °C, ±5 %RH: text in its card only |

A read **answers** when S is on the net of the pin the sketch gave (`DHT dht(2, DHT11)`, joined by
jumper wires), the supply is between + and − in range, the power-up second has passed and S idles
high (at 0.7 · VCC or more, pulled up). Otherwise `readTemperature()` and `readHumidity()` give `NaN`
and `isnan()` is true. Rounding to the nearest is the kit's choice; real chips often truncate, and
they sit within ±2 °C anyway.

`readTemperature(true)` is °F from the rounded °C (24 → 75.2); `computeHeatIndex(t, h, false)` is the
library's formula (30 °C and 60 % → 32.83 °C; 25 °C and 50 % → 24.86 °C).

## The BME280 and BMP280 boards

Pins `VCC`, `GND`, `SCL`, `SDA`; the board lies flat on its four-pin header.

| Part | Board | Senses | Chip id |
|---|---|---|---|
| `BME280` | 3.3 V only: VCC is the chip's supply, 1.71 to 3.6 V; over 3.6 V `SIM_IC_SUPPLY`, over 4.25 V (its absolute maximum) the chip does not answer | temperature, humidity, pressure | 0x60 |
| `BME280-5V` | regulated: a 3.3 V regulator (its rail `min(3.3, VIN − 0.2)`) feeds the chip and the pull-ups; VIN under 3.4 V `SIM_MODULE_LOW_SUPPLY` | temperature, humidity, pressure | 0x60 |
| `BMP280` | as `BME280`, no humidity | temperature, pressure | 0x58 |

- `address`: 0x76 (the default; SDO to ground on most boards) or 0x77.
- Readings: `readTemperature()` the temperature held to −40…85 °C, to 0.01 °C; `readPressure()` the
  pressure held to 300…1100 hPa, **in Pa**, to 1 Pa (1013.25 hPa → 101325); `readHumidity()` to
  0.01 %RH, held to 0…100; `readAltitude(seaLevelHpa)` the library's
  `44330 · (1 − (p / sea)^0.1903)` from the rounded pressure (900 hPa → 988.7 m).
- Accuracy ±1 °C, ±3 %RH, ±1 hPa: text in the card.
- Current after `begin()` (the library's normal mode, measuring all the time): 0.47 mA (BMP280
  0.4 mA), as a resistor on the chip's rail.

`begin(address)` returns **true** only when SDA and SCL are on the board's default I2C pins (UNO A4
and A5, or its SDA and SCL header pins; ESP32 DevKit GPIO21 and GPIO22; ESP32-C3 GPIO8 and GPIO9),
both idle high (pulled up), the chip's rail is in range, the address is the board's and the chip id
is the one the library expects: `Adafruit_BME280` only 0x60; `Adafruit_BMP280::begin(addr, chipid)`
0x58 by default (0x60 only if the sketch asks for it). `begin()` with no address asks for **0x77**,
as both libraries do. A read after a `begin()` that failed, or with the chip no longer answering,
gives `NaN` (a real board may print a fixed nonsense number instead; the kit gives the value the
library's checks give).

## The classic failures the kit reproduces

| What the learner does | What the sketch sees | What the card says |
|---|---|---|
| Reads the DHT11 in a loop without `delay(2000)` | the same value for 2 s, no error | the last real read and when |
| Reads at once after power | `NaN` for the first second | "powering up · 0.6 s left" |
| Wires S to D3 and writes `DHT dht(2, DHT11)` | `NaN` | "the sketch reads pin 2, and S is not on it" |
| `bme.begin()` on the usual board | `false` | "the sketch asks 0x77, this board is 0x76" |
| A BMP280 with the BME280 library | `begin` false | "the library expects chip id 0x60, this chip is 0x58" |
| The 3.3 V-only board on 5 V | `begin` false, `SIM_IC_SUPPLY` | "over its 4.25 V maximum" |
| SDA and SCL swapped | `begin` false | "SDA and SCL are swapped" |
| `readPressure()` printed as hPa | 101325 instead of 1013 | the reading in hPa beside it |

## How a board finds a sensor

The sensor's device holds the truth; the board only asks.

1. A library call in the sketch (`dht.readTemperature()`) runs in `program.js` and asks the board:
   `ask({ cls: 'DHT', method: 'read', pin: 2 })` (or `{ cls: 'Adafruit_BME280', method: 'begin',
   address: 0x76, chip: 0x60 }`).
2. The board (`mcu.js`) turns the pin into its net (nodes joined by jumper wires), and its family's
   default I2C pins into theirs (`I2C_PINS` in `src/sim/models.js`), and asks every element of the
   circuit that declares the class: `library: { classes: ['DHT'], bus: 'pin' }` and
   `answer(request)`. The engine hands the board those elements once they are all built
   (`connect(elements)`).
3. Each sensor judges whether it answers (power, power-up, net, pull-up, address, chip id), records
   its verdict for its card, and returns its values; the first that answers wins.
4. What it keeps (the DHT's cache and since when it is powered) is in the element's `memo`, carried
   across a rebuild (`state: ['memo']`), so a slider elsewhere neither restarts the power-up nor makes
   a cached read real. Its values are its params, which the environment changes (`sense`).

## Adding another library sensor

A DS18B20 or an SSD1306 display would be data plus its own answers, nothing special in `mcu.js`:

1. Its class and methods in `LIBRARY_CLASSES` (`src/sim/libraries.js`), appended, never reordered
   (the translator writes them as numbers); its include in `LIBRARY_INCLUDES`.
2. The methods' runtime in `program.js` (`METHODS`, the same order): they call `ask(...)`; a method
   that waits is a generator and is listed in `WAITS`.
3. A device whose element has `library: { classes, bus }` and `answer(request)`, keeping what it
   remembers in a key listed in `state`. A new bus (one-wire on a pin is `pin`) needs only what its
   request carries.
4. Attack cases in `test/attack.test.js` for the new class, and checks against the datasheet in a test
   of its own (as `test/library-sensors.test.js`).
