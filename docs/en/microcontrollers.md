# Microcontrollers in the simulation

*[Español](../es/microcontroladores.md)*

How the kit simulates development boards (ESP32 DevKit, ESP32-C3 SuperMini, Arduino UNO): not the
processor, but what a learner sees at the pins. Each GPIO behaves electrically like the real one,
and a short program in Arduino's own functions decides, in time, what each pin does. The same code
serves every board; what changes are each family's numbers.

Planned with the maintainer on 2026-10-26. Phases M1 to M4 are done.

## Why not emulate the processor

| Option | What it does | For the kit |
|---|---|---|
| Real emulation (as Wokwi does) | Runs the compiled firmware instruction by instruction | For the UNO a JavaScript library exists (avr8js), but the code must be compiled first; for the ESP32 there is nothing light and free; and the kit takes no runtime dependencies |
| Pins with fixed states | `"io": { "D13": "high" }`: the board is a source on that pin | Phase M1: no program, nothing blinks or reacts |
| **Pin model + a simple program** (chosen) | Pins as the real ones; a program with Arduino's functions sets them between time steps | Fits the engine as the 555 does (its latch changes between steps); seen in the live page, with the oscilloscope and the cards |

What a lesson needs is what voltage leaves a pin, how much current flows, what an input reads.
Instruction-level detail adds nothing to that. Real UNO firmware with avr8js may come later as an
optional mode, apart from the kit.

## Decisions (2026-10-26)

- The program is written in **the subset of Arduino C++** a lesson uses, the same text one would
  upload to the board; a small translator in the kit turns it into JavaScript (types removed,
  `void setup()` into a function). Code that uses libraries (GxEPD2 for the e-paper) does not run:
  those calls are reported.
- It lives in **a `.ino` file beside the circuit** (`<circuit folder>/<name>.ino`), not inside
  `circuit.json`.
- First board: the **ESP32 DevKit** (the most common in beginner kits), then the UNO and the C3.

## The pin model (phase M1, done)

`src/sim/devices/mcu.js`, with each family's numbers in `src/sim/models.js` (`MCUS`) and each
board's pins in `src/parts/modules.js` (`power`, `gpio`, `adc`, `inputOnly`).

| | ESP32, ESP32-C3 | Arduino UNO (ATmega328P) |
|---|---|---|
| Logic rail | 3.3 V from its regulator (AMS1117 on the DevKit, ME6211 on the C3) | the USB's 5 V; 3V3 from an LP2985 (150 mA) |
| Output | the rail or ground behind 17 Ω (VOH = 0.8·VDD at 40 mA) | behind 40 Ω (VOH 4.2 V at 20 mA) |
| Input | no current; pull-up or pull-down 45 kΩ | no current; pull-up 35 kΩ (20–50 kΩ) |
| Reads 0 / 1 | below 25 % / above 75 % of VDD | below 30 % / above 60 % of VCC |
| ADC (shown in the card) | 12 bits over 0–3.1 V (C3: 0–2.5 V), linear here | 10 bits over 0–5 V |
| Own current | 40 mA (C3: 20 mA), no radio | 45 mA (chip, USB bridge, power LED) |
| Limits | 40 mA per pin (absolute maximum); a pin beyond VDD + 0.3 V or below −0.3 V (protection diodes conducting: `SIM_PIN_OVERVOLTAGE`) | the same, at 5 V |

- **Power:** a board on USB (`"usb": true`, the default) is a source: 5 V behind the cable's
  resistance on its USB pin (VIN on a DevKit, 5V on the others). With no other supply, ground is its
  GND, so `esp32-led` simulates with nothing else. `"usb": false`: the board takes its power from the
  circuit through those pins.
- **Pins:** `"io"` sets each GPIO by printed name, GPIO name or number (`"D13"`, `"GPIO13"`, `"13"`):
  `high`, `low`, `input`, `input_pullup`, `input_pulldown`. Unlisted pins are inputs. A GPIO nothing
  is wired to is left out. Mistakes are warnings and are left out: an unknown pin
  (`SIM_PIN_UNKNOWN`), an unknown state (`SIM_PIN_STATE`), an output on an input-only pin
  (`SIM_PIN_INPUT_ONLY`: GPIO34–39 on the DevKit).
- **The card:** USB voltage and current, the logic rail, and per pin in use its state, voltage,
  current, what it reads (0, 1 or neither) and its ADC count.
- **Every pin has protection diodes** to the rail and to ground, so 5 V through a resistor into an
  ESP32 pin shows the current it pushes into the chip, with the warning.
- **PWM is not an average.** An average (a conductance to the rail and one to ground) would let
  current run through the chip from the rail to ground, and an LED's average current is not its
  current at the average voltage: a program's PWM switches in time (M3, below).
- Tests: `test/mcu.test.js` (VOH with the output resistance, pull-up current, the UNO at 5 V, 5 V on
  an ESP32 pin, `io` mistakes, `usb: false`).

## The program (phase M2, done)

```json
{ "id": "U1", "type": "module", "part": "ESP32-DEVKIT", "pin1": "c5", "program": "blink.ino" }
```

`program` is the name of a `.ino` file beside the circuit (`circuit.json`'s folder), or the sketch's
text itself (examples, recipes). It is the sketch one would upload:

```cpp
const int LED = 13;
void setup() { pinMode(LED, OUTPUT); }
void loop() { digitalWrite(LED, HIGH); delay(500); digitalWrite(LED, LOW); delay(500); }
```

- **What it reads** (`src/sim/sketch.js`, translated once when the circuit is compiled): globals and
  constants, `#define NAME value`, its own functions, `int`/`long`/`float`/`bool`/`byte`/`unsigned …`
  and arrays with `{ … }`, `if`/`else`, `while`, `do … while`, `for`, `switch`, `break`, `continue`,
  `return`, the operators C and JavaScript share, casts (`(int) x`), char literals, number suffixes
  (`1000UL`). A division between integers stays integer, as in C (`7 / 2` → 3, `analogRead(A0) / 4`
  → 127 for 510): the translator knows which terms are integers (literals, `int`-like variables and
  functions, `analogRead`, `millis` …, casts, integer `#define`s) and keeps `*`, `/`, `%` binding
  left to right.
- **What it can call** (`src/sim/program.js`): `pinMode` (`INPUT`, `OUTPUT`, `INPUT_PULLUP`,
  `INPUT_PULLDOWN`), `digitalWrite`, `digitalRead`, `delay`, `delayMicroseconds`, `millis`,
  `micros`, `Serial.begin/print/println` (its last lines show in the board's card), `analogRead`
  (the ADC count), `map`, `constrain`, `min`, `max`, `abs`, `random` (a fixed sequence), the bit
  functions, `LED_BUILTIN` (2 on the DevKit, 8 on the C3, 13 on the UNO) and `A0`…`A5`. On an UNO,
  `digitalWrite(pin, HIGH)` on an input turns its pull-up on, as on the real chip.
- **How it runs:** every function becomes a generator, so `delay()` waits in simulated time. The
  program runs between time steps, from the voltages of the step before, as the 555's latch: a
  change takes effect one step later (1 ms in the page). At t = 0 it starts over from the
  voltages there until its pins come out the same (its setup may turn on a pull-up its loop reads).
  A loop that never waits gets 2000 turns per step, so the page does not freeze. When a control is
  used (a button pressed), the program goes on where it was.
- **In the page:** a circuit with a program runs in real time (`delay(500)` is half a second),
  with steps of 1 ms (shorter, down to 0.1 ms, for a fast RC beside it). The board's card shows the
  program (running, or in `delay()` until when), its Serial lines and each pin.
- **Not run:** classes, pointers, templates, function-like macros, libraries (an `#include` other
  than Arduino's is noted: `SIM_PROGRAM_LIBRARY`); a call to a function nobody defines returns 0
  (`SIM_PROGRAM_UNSUPPORTED`); a line it cannot read stops it (`SIM_PROGRAM_ERROR`, with the line);
  a missing file (`SIM_PROGRAM_FILE`).
- Tests: `test/program.test.js` (the translator, blink against time, a button read by the program
  through the engine's steps and a rebuild, the `.ino` file).

## PWM, tone and the serial monitor (phase M3, done)

- **PWM switches in time.** `analogWrite(pin, 0…255)`: on an ESP32 any output pin, 1 kHz; on an
  UNO its PWM pins (3, 9, 10, 11 at 490 Hz; 5, 6 at 980 Hz), any other pin taking it as
  `digitalWrite` (128 and up is HIGH), as its core does. `ledcAttach(pin, freq, bits)` +
  `ledcWrite(pin, duty)` (ESP32 core 3) and `ledcSetup(ch, freq, bits)` + `ledcAttachPin(pin, ch)` +
  `ledcWrite(ch, duty)` (core 2). `tone(pin, freq[, ms])` is a square wave at half duty, `noTone`
  stops it. A duty of 0 or full is a plain level.
- At each step the pin is high or low by its phase at that moment (`levelAt` in
  `src/sim/program.js`), so the oscilloscope shows the square wave and the current is what it is
  in each half. No average (an average would let current run through the chip from its rail to
  ground).
- **In the page:** while a PWM or a tone runs, the step shrinks to a twentieth of its period
  (`engine.stepHint()`, never under 5 µs: past what the page can do in real time it slows down by
  itself). An LED's glow is its brightness averaged over the steps since the last paint
  (`engine.glow()`), what the eye sees: `analogWrite(13, 64)` lights it at a quarter.
- **Serial monitor:** the last 12 lines the program printed, in the board's card.
- The card shows a PWM pin as "PWM 25 % at 1 kHz" with its voltage and current at that instant.
- Tests in `test/program.test.js`: duty and frequency of `analogWrite`, both LEDC styles, `tone`
  with a duration, the UNO's non-PWM pin, the step hint and the averaged glow.

## The plan

| Phase | What | State |
|---|---|---|
| **M1** | Pin model with fixed states (`io`), the board on USB as a source, limits and warnings | ✅ 2026-10-26 |
| **M2** | The program: the `.ino` beside the circuit (or its text), translated to JavaScript; `pinMode`, `digitalWrite`, `digitalRead`, `delay`, `millis`, `Serial`; run between time steps, `delay` waits in simulated time; the page runs it in real time | ✅ 2026-10-26 |
| **M3** | PWM as a real square wave in time (`analogWrite`, `ledcWrite`), `tone`, the step it needs in the page and the LED's averaged glow, the serial monitor in the board's card | ✅ 2026-10-26 |
| **M4** | Recipes with their program: `esp32-led`, `esp32-button`, `uno-blink`, `uno-button`, `uno-pot-pwm`, `c3-blink`, `c3-pot-pwm`; tested potentiometer → ADC → PWM against each board's numbers | ✅ 2026-10-26 |
| later | A serial console panel of its own in the page, `analogRead` against the ESP32 ADC's real curve, interrupts (`attachInterrupt`), simplified stand-ins for common libraries, real UNO firmware with avr8js as an optional mode, both ESP32 headers in one circuit (the layout limit) | — |

The program drives the memory the pins keep (`gpioStage`: `mode`, `level`, `pull`) through one
element with no current of its own (the board's controller), so the engine only learned to run
programs at t = 0 (`settle`) and to tell the page it has one (`hasProgram`).

## See also

- [simulation.md](simulation.md): the simulator and its models.
- [circuit-format.md](circuit-format.md): the `module` part and its fields.
- [recipes.md](recipes.md): `esp32-led`, `esp32-button`.
