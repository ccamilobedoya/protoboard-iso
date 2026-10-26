# Microcontrollers in the simulation

*[Español](../es/microcontroladores.md)*

How the kit simulates development boards (ESP32 DevKit, ESP32-C3 SuperMini, Arduino UNO): not the
processor, but what a learner sees at the pins. Each GPIO behaves electrically like the real one,
and a short program in Arduino's own functions decides, in time, what each pin does. The same code
serves every board; what changes are each family's numbers.

Planned with the maintainer on 2026-10-26. Phase M1 is done; M2 to M4 follow.

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
- First board: the **ESP32 DevKit** (the one the course uses most), then the UNO and the C3.

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
- **No PWM yet.** An average (a conductance to the rail and one to ground) would let current run
  through the chip from the rail to ground, and an LED's average current is not its current at the
  average voltage. PWM switches in time in M3.
- Tests: `test/mcu.test.js` (VOH with the output resistance, pull-up current, the UNO at 5 V, 5 V on
  an ESP32 pin, `io` mistakes, `usb: false`).

## The plan

| Phase | What | State |
|---|---|---|
| **M1** | Pin model with fixed states (`io`), the board on USB as a source, limits and warnings | ✅ 2026-10-26 |
| **M2** | The program: the `.ino` beside the circuit, translated to JavaScript; `pinMode`, `digitalWrite`, `digitalRead`, `delay`, `millis`; run between time steps (as the 555's latch), `delay` waits in simulated time; the page shows it running (an LED blinks at the program's rhythm) | ⬜ |
| **M3** | `analogRead` (the ADC), PWM as a real square wave in time (`analogWrite` on the UNO, `ledcWrite` on the ESP32), `Serial.print` to a console panel in the page | ⬜ |
| **M4** | Recipes for the UNO and the C3 (LED, button, potentiometer with ADC and PWM), the existing ESP32 recipes with their program, docs and agents | ⬜ |
| later | Interrupts (`attachInterrupt`), simplified stand-ins for common libraries, real UNO firmware with avr8js as an optional mode, both ESP32 headers in one circuit (the layout limit) | — |

The program will drive the same memory the pins keep now (`gpioStage`: `mode`, `level`, `pull`),
read at each step, so M2 adds no element to the engine.

## See also

- [simulation.md](simulation.md): the simulator and its models.
- [circuit-format.md](circuit-format.md): the `module` part and its fields.
- [recipes.md](recipes.md): `esp32-led`, `esp32-button`.
