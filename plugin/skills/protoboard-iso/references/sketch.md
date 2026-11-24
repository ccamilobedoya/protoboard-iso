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

- Types: `int`, `long`, `unsigned long`, `byte`, `bool`, `boolean`, `char`, `float`, `double`, `uint8_t`, `uint16_t`, `int32_t`, `word`, `String`.
- Arrays: one dimension, `int a[3] = {1, 2, 3};`; two dimensions are refused (`int a[2][3]`: the kit names the array and its line, and the program does not run): flatten one into one dimension, `a[row * 3 + col]`.
- Printing: a `char` prints as its letter (`Serial.println('Z')` prints `Z`, a `char` variable too); arithmetic on it is a number (`c + 1` prints 67) and `Serial.println(c, DEC)` the number; `Serial.write(65)` prints `A`; an integer's second argument is its base (`HEX`, `BIN`, `OCT`, `DEC`), a float's its decimals (`Serial.println(3.14159, 3)` is `3.142`).
- Statements: if / else, while, do … while, for, switch, break, continue, return; casts such as `(int) x`; number suffixes (`1000UL`). No pointers, classes of your own or templates.
- Macros: `#define NAME value`, and simple function-like ones, expanded where they are used (`#define SQUARE(x) ((x) * (x))`; `SQUARE(5)` is 25). One with `#` or `##`, or that expands into itself, is refused: write a function.

## Integers

- A value stored in a variable, a parameter, an array element or a function's return keeps its type's size on the board in use, as a board stores it: `byte` / `uint8_t` 8 bits (`byte b = 255; b++;` is 0), `char` / `int8_t` signed 8, `int` and `unsigned int` 16 bits on an UNO and 32 on an ESP32 (`int i = 32767; i++;` prints -32768 on an UNO, 32768 on an ESP32), `long` / `unsigned long` / `uint32_t` 32, `bool` 0 or 1; a `float` stays a number. Arithmetic with an `unsigned long` in it wraps as the board's does (`now - start` with `now = 10` and `start = 4294967290` prints 16), and `millis()` and `micros()` wrap at 2^32, so a `millis()` timer works across the wrap; an `int` sum that overflows inside an expression is left as it is (C leaves it undefined), and wraps when stored. Integer division truncates (`7 / 2` is 3).
- `bitSet`, `bitClear`, `bitToggle` and `bitWrite` change the variable or array element they are given, as Arduino's macros do (`byte v = 178; bitSet(v, 2);` makes it 182); given something that is not a variable (`bitSet(5, 1)`) they are a warning, as a compiler refuses them, and only give the value.
- A parameter passed by reference (`void inc(int &x)`) is a copy in the kit, with a warning: return the new value instead (`a = inc(a);`) or change a global.

## Text

- `String` and its methods: `length`, `charAt`, `indexOf`, `lastIndexOf`, `substring`, `toInt`, `toFloat`, `toDouble`, `equals`, `equalsIgnoreCase`, `startsWith`, `endsWith`, `compareTo`, `c_str`, `trim`, `toUpperCase`, `toLowerCase`, `concat`, `replace`, `remove`, `isEmpty` (`trim`, `toUpperCase`, `toLowerCase`, `concat`, `replace` and `remove` change the String, as on a board). A `char` added to a String is its letter and a `float` has two decimals (`s += c`, `s + 2.5`); `char *text = "…"` is a text too.
- `sprintf(buf, …)` and `snprintf(buf, size, …)` write into a `char` buffer, which then prints as that text: `%d %i %u %ld %lu %x %X %c %s %%` with `-`, `0`, `+` and a width; an UNO's `sprintf` has no `%f` (it writes `?`, as avr-libc does: `v=0042 ok ff ?`), an ESP32's has (`v=0042 ok ff 1.5`). An untouched buffer prints as nothing.

## Refused, and what to write instead

Each of these stops the program before it runs, and the warning names the construct and its line:
- Pointers (`int *p = &x;`, `*p`, `p->x`): use the variable itself, or an array and an index (`values[i]`); a text is a `String` or `char *text = "…"`.
- `struct`, `class`, `union`, `enum`, `typedef`, `template`: write the fields as separate variables (`pointX`, `pointY`) or as arrays with one index (`x[i]`, `y[i]`), the methods as functions that take what they change, an enum as constants (`const int IDLE = 0;`).
- A `String` method not in the list above (`s.reverse()`): the warning lists the ones the kit reads.
- A member read with `.` on anything but `Serial`, a `String` or a library object (`p.x`): a variable of its own (`pointX`).
- A macro with `#` or `##`, or one that expands into itself: a function.

## Interrupts, serial ports and deep sleep

- `attachInterrupt(digitalPinToInterrupt(pin), handler, RISING | FALLING | CHANGE | LOW)`, `detachInterrupt`, `noInterrupts()` and `interrupts()` work on the pins that have an interrupt: an UNO's D2 and D3, any ESP32 GPIO. The handler runs at the step that sees the pin cross, between two statements of `loop()`, also during a `delay`. Another pin is warned and its handler never runs, as on the board.
- The kit's buttons do not bounce: a press is one clean edge, so a debounce in a sketch is exercised only as a lockout (the time it ignores the pin after a press), never against real bounce.
- `Serial1` and `Serial2` on an ESP32 (`Serial1` on an ESP32-C3) are ports of their own (`Serial2.begin(9600, SERIAL_8N1, 16, 17)`), their output labelled in the run (`Serial2: …`). An UNO has only `Serial`: `Serial2` there stops the program, as a real UNO would not compile it.
- Between two boards the bytes follow the wire: a board hears another board's TX when the TX pin's high and low reach its RX pin as a high and a low for it, directly or through resistors (the usual 1 kΩ over 2 kΩ divider from an UNO's 5 V to an ESP32's 3.3 V carries data, and takes away the 5 V hazard of the direct wire); a path that never gives the RX pin both levels, or an RX pin wired to nothing that sends, is a warning saying why (`available`, `read`, `parseInt`, `readStringUntil` read what arrives; a received `\r` prints as nothing).
- Typing to a board: `simulate --run 3 --serial "1@0.5"` sends the text to its USB `Serial` at 0.5 s (repeatable; `\n` for a new line; `U1:` in front names the board, `Serial2:` the port). A sketch that reads its serial port with nothing typed and nothing wired to RX gets a note saying so and naming the option. A DHT11 read in its first second prints `nan`, with a note saying it was still powering up.
- ESP32 deep sleep (`esp_sleep_enable_timer_wakeup(µs)` and `esp_deep_sleep_start()`, or `ESP.deepSleep(µs)`): the program stops, its pins go back to inputs, and after the time given it starts again from `setup()` with its globals as at power-up.

## Libraries

- `#include`: `DHT.h`, `Wire.h`, `Adafruit_Sensor.h`, `Adafruit_BME280.h`, `Adafruit_BMP280.h`, `Arduino.h`; other headers are noted and do nothing (probed: `Servo.h`, `LiquidCrystal.h`, `LiquidCrystal_I2C.h`, `Adafruit_NeoPixel.h`, `IRremote.h`).
- `DHT`: `begin()`, `readTemperature()`, `readHumidity()`, `computeHeatIndex()`, `convertCtoF()`, `convertFtoC()`.
- `Adafruit_BME280`: `begin()`, `readTemperature()`, `readPressure()`, `readHumidity()`, `readAltitude()`, `setSampling()`, `sensorID()`, `takeForcedMeasurement()`, `seaLevelForAltitude()` (`setSampling()` accepted, it changes nothing the kit simulates).
- `Adafruit_BMP280`: `begin()`, `readTemperature()`, `readPressure()`, `readAltitude()`, `setSampling()`, `sensorID()`, `takeForcedMeasurement()`, `seaLevelForAltitude()` (`setSampling()` accepted, it changes nothing the kit simulates).
- Library constants: `DHT11`, `DHT12`, `DHT21`, `DHT22`, `AM2301`, `NAN` (`DHT12`, `DHT21`, `DHT22`, `AM2301`: sensors the kit does not have).
