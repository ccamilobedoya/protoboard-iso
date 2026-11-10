# The ultrasonic distance sensor (HC-SR04)

*[Español](../es/sensor-ultrasonico.md)*

The HC-SR04 measures distance with sound: one capsule (`T`) sends a short burst of 40 kHz, the other
(`R`) listens for its echo, and the module holds `ECHO` high for as long as the sound took to go and
come back. A board's program starts it with a 10 µs pulse on `TRIG` and times `ECHO` with `pulseIn`
([microcontrollers.md](microcontrollers.md#pulsein)). The kit simulates it as a small state machine
with a clock of its own, like the PIR and the touch module ([timed-sensors.md](timed-sensors.md)), so
the timing a learner reads is the module's: the program gets the round trip to the microsecond.

```json
{ "id": "U2", "type": "ultrasonic-sensor" }
```

It reads the environment's `distance` (cm) and `temperature` (°C, which sets the speed of sound)
([environment.md](environment.md)); `distance` and `temperature` on the part are its own values and
win over the environment's, and its card has a `distance` slider of its own. The code is
`src/sim/devices/ultrasonic.js` (the machine is the pure function `sonarAdvance`), its numbers
`ULTRASONIC` in `src/sim/models.js`, the type `src/parts/types/ultrasonic.js` and the drawing
`src/parts/packages/ultrasonic.js`. Recipes: `uno-distance`, `esp32-distance`, `distance-alarm-uno`
([recipes.md](recipes.md)); timeline `examples/tours/uno-distance.json`.

## Pins and fields

Pins `VCC`, `TRIG`, `ECHO`, `GND`, as the board prints them, left to right with the capsules toward
you. The module stands on its four pins: a board of 45 × 20 mm with two capsules 16 mm across.

| Field | Default | |
|---|---|---|
| `part` | `"HC-SR04"` | the only part number today |
| `distance` | 50 | cm, its own value of the field (it then does not follow the environment) |
| `temperature` | 20 | °C, its own value of the field |

## The machine and its times

```text
idle ──TRIG high ≥ 10 µs, then low──▶ burst ──(250 µs)──▶ echo ──(2·d / v)──▶ idle
ECHO low                              ECHO low             ECHO high
                                      a TRIG now is ignored ─────────────────┘
```

- `TRIG` reads high from 2.0 V, so a 3.3 V pin drives it. It must stay high 10 µs or more; a 5 µs
  pulse is not taken. The measurement starts when `TRIG` falls.
- The burst (eight cycles of 40 kHz, 200 µs, and about 50 µs of the module's own) lasts 250 µs;
  then `ECHO` rises.
- `ECHO` stays high for the round trip, `2·d / v` with `v = 331.3 + 0.606·T` m/s: 5 824 µs at
  100 cm and 20 °C (the usual "58 µs per cm"), 577 µs at 10 cm and 25 °C, 23.3 ms at 400 cm,
  3 018 µs at 50 cm and 0 °C. Outside 2 to 400 cm, or under 4.5 V, nothing answers: `ECHO` stays
  high 38 ms ("no echo").
- The width is fixed when the burst leaves: a slider moved during the echo (on this part or any
  other) does not change the measurement under way, and the engine carries `phase`, `clock` and
  `width` across the rebuild.
- `ECHO` is a push-pull output at `VCC` behind 20 Ω, so it is 5 V when high. The supply takes 2 mA
  waiting and 15 mA while it measures.

The element stamps `ECHO` for the state at the end of the step being solved and tells the engine
when its next edge comes (`until()`), so `engine.advance` ends a step exactly on the rise and on the
fall of `ECHO` and the program sees each edge at its time, whatever the page's step. Not modelled:
the beam's 15° cone, the 0.3 cm resolution of the module's own timer (the echo's width is exact),
and soft or slanted surfaces that send no echo.

## A 3.3 V board: the divider on ECHO

The module needs 5 V (the ESP32 DevKit's `VIN`, the USB's 5 V), so its `ECHO` is 5 V. Straight into a
GPIO of a 3.3 V chip it pushes current through the pin's protection diode: the board's own check says
so (`SIM_PIN_OVERVOLTAGE`). A divider of 1 kΩ from `ECHO` over 2 kΩ to ground leaves
5 V · 2 / 3 = 3.33 V on the pin, still a clear HIGH; `TRIG` needs nothing. The recipe
`esp32-distance` has it.

## Limits and warnings

| Code | When |
|---|---|
| `SIM_IC_SUPPLY` | `VCC` over 5.5 V |
| `SIM_REVERSE_VOLTAGE` | `VCC` reversed by more than 0.3 V |
| `SIM_MODULE_LOW_SUPPLY` | `VCC` under 4.5 V: it answers "no echo" (under 2.5 V it is off, `ECHO` high impedance) |
| `SIM_OVER_CURRENT` | `ECHO` giving more than 20 mA |

The 250 µs from `TRIG` to `ECHO` and the 20 Ω of `ECHO` are the kit's own figures, not the sheet's; a
bench scope would settle both. The first guess for the output, 100 Ω, put the divider's middle at
3.23 V, under the 3.33 V a bench reads, so the kit takes 20 Ω (a 5 V chip's output at a light load).
