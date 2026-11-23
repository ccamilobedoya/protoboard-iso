# What a sketch may use

<!-- generated: npm run parts-reference -- --write (from the simulator's own tables and a probe of each name; do not edit) -->

A board's program (a `.ino` file beside `circuit.json`, named in `"program"`) runs in the
simulator as a subset of Arduino C++. This is what that subset takes today. A name it does not
know is not an error of the circuit: `layout` and `simulate --run` say "`<name>()` … is not
something the simulator knows; it returns 0" or "the program stopped with an error", and the kit
cannot confirm what the program does (`WARNINGS`). Tell the user so; write the sketch with what
is below when they want the kit to check it.

## Functions

- From the simulator's table: `pinMode`, `digitalWrite`, `digitalRead`, `analogRead`, `analogWrite`, `millis`, `micros`, `abs`, `min`, `max`, `map`, `constrain`, `random`, `randomSeed`, `sqrt`, `log`, `pow`, `sin`, `cos`, `round`, `floor`, `ceil`, `bitRead`, `bitWrite`, `bitSet`, `bitClear`, `bitToggle`, `ledcAttach`, `ledcAttachPin`, `ledcSetup`, `ledcWrite`, `tone`, `noTone`, `pulseIn`, `pulseInLong`, `isnan`, `esp_sleep_enable_timer_wakeup`, `esp_deep_sleep_start`, `digitalPinToInterrupt`, `attachInterrupt`, `detachInterrupt`, `interrupts`, `noInterrupts`, `shiftOut`, `shiftIn`.
- Also: `delay`, `delayMicroseconds`; your own functions, with their types.
- Not known (noted, they return 0 or stop the program): `analogReference`, `analogReadResolution`, `tan`, `atan2`, `sq`, `highByte`, `lowByte`, `bit`.

## Serial

- `Serial.` `begin`, `print`, `println`, `available`, `read`, `write`, `flush`; not known: `printf`.

## Constants

- Known: `HIGH`, `LOW`, `INPUT`, `OUTPUT`, `INPUT_PULLUP`, `INPUT_PULLDOWN`, `LED_BUILTIN`, `A0`, `A5`, `PI`, `true`, `false`, `MSBFIRST`, `LSBFIRST`, `RISING`, `FALLING`, `CHANGE`, `DEG_TO_RAD` (the analog pins of the board: `A0` … `A5` on an UNO); `#define NAME value` and `const` globals of your own.
- Not defined (a program that uses one stops): `A6`, `A7`.

## Types and arrays

- Types: `int`, `long`, `unsigned long`, `byte`, `bool`, `boolean`, `char`, `float`, `double`, `uint8_t`, `uint16_t`, `int32_t`, `word`, `String`. A `String` holds text for `Serial.print`; its methods (`.length()`, `.substring()`…) are not read.
- Arrays: one dimension, `int a[3] = {1, 2, 3};`; two dimensions are refused (`int a[2][3]`: the kit names the array and its line, and the program does not run): flatten one into one dimension, `a[row * 3 + col]`.
- Printing: a `char` prints as its letter (`Serial.println('Z')` prints `Z`, a `char` variable too); arithmetic on it is a number (`c + 1` prints 67) and `Serial.println(c, DEC)` the number; `Serial.write(65)` prints `A`; an integer's second argument is its base (`HEX`, `BIN`, `OCT`, `DEC`), a float's its decimals (`Serial.println(3.14159, 3)` is `3.142`).
- Statements: if / else, while, do … while, for, switch, break, continue, return; casts such as `(int) x`; number suffixes (`1000UL`). No pointers, classes of your own or templates.

## Interrupts, serial ports and deep sleep

- `attachInterrupt(digitalPinToInterrupt(pin), handler, RISING | FALLING | CHANGE | LOW)`, `detachInterrupt`, `noInterrupts()` and `interrupts()` work on the pins that have an interrupt: an UNO's D2 and D3, any ESP32 GPIO. The handler runs at the step that sees the pin cross, between two statements of `loop()`, also during a `delay`. Another pin is warned and its handler never runs, as on the board.
- The kit's buttons do not bounce: a press is one clean edge, so a debounce in a sketch is exercised only as a lockout (the time it ignores the pin after a press), never against real bounce.
- `Serial1` and `Serial2` on an ESP32 (`Serial1` on an ESP32-C3) are ports of their own (`Serial2.begin(9600, SERIAL_8N1, 16, 17)`), their output labelled in the run (`Serial2: …`); the bytes a TX pin sends reach the board whose RX pin is on its net (`available`, `read`, `parseInt`, `readStringUntil`). An UNO has only `Serial`: `Serial2` there stops the program, as a real UNO would not compile it.
- ESP32 deep sleep (`esp_sleep_enable_timer_wakeup(µs)` and `esp_deep_sleep_start()`, or `ESP.deepSleep(µs)`): the program stops, its pins go back to inputs, and after the time given it starts again from `setup()` with its globals as at power-up.

## Libraries

- `#include`: `DHT.h`, `Wire.h`, `Adafruit_Sensor.h`, `Adafruit_BME280.h`, `Adafruit_BMP280.h`, `Arduino.h`; other headers are noted and do nothing (probed: `Servo.h`, `LiquidCrystal.h`, `LiquidCrystal_I2C.h`, `Adafruit_NeoPixel.h`, `IRremote.h`).
- `DHT`: `begin()`, `readTemperature()`, `readHumidity()`, `computeHeatIndex()`, `convertCtoF()`, `convertFtoC()`.
- `Adafruit_BME280`: `begin()`, `readTemperature()`, `readPressure()`, `readHumidity()`, `readAltitude()`, `setSampling()`, `sensorID()`, `takeForcedMeasurement()`, `seaLevelForAltitude()` (`setSampling()` accepted, it changes nothing the kit simulates).
- `Adafruit_BMP280`: `begin()`, `readTemperature()`, `readPressure()`, `readAltitude()`, `setSampling()`, `sensorID()`, `takeForcedMeasurement()`, `seaLevelForAltitude()` (`setSampling()` accepted, it changes nothing the kit simulates).
- Library constants: `DHT11`, `DHT12`, `DHT21`, `DHT22`, `AM2301`, `NAN` (`DHT12`, `DHT21`, `DHT22`, `AM2301`: sensors the kit does not have).
