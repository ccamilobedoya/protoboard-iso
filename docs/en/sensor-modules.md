# LM393 sensor modules

*[Español](../es/modulos-sensores.md)*

Most sensors of a starter kit come on the same little board: the sensing element, a 10 kΩ resistor
over it, a blue trimmer and an LM393 comparator with two LEDs. The kit has them as **one type**,
`sensor-module`, one package and one device; the part number says which element it carries.

```json
{ "id": "U1", "type": "sensor-module", "part": "YL-69", "threshold": 0.5 }
```

The code: `src/parts/sensors.js` (`SENSOR_MODULES`: the table of the part numbers, and the element
formulas), `src/parts/types/sensor-modules.js` (the type), `src/parts/packages/sensor-module.js`
(the drawing), `src/sim/devices/sensor-module.js` (the simulation). Recipes: `rain-alarm`,
`soil-led`, `light-switch-module`, `line-follower-uno`, `obstacle-buzzer`, `hall-counter-uno`,
`clap-switch`, `sound-level-led` ([recipes.md](recipes.md)); timelines `examples/tours/soil-led.json`,
`obstacle-buzzer.json` and `clap-switch.json`. `rain-alarm` and `obstacle-buzzer` switch an active buzzer
with a PNP, not an NPN: DO goes low when the module detects, and an NPN driven by it would sound while
the comb is dry (the buzzer needs 3.5 V across it and about 30 mA, more than the LM393's 20 mA output
could carry). The analog sensors that are not on this board (the linear Hall 49E, the voltage sensor
module) are in [analog-sensors.md](analog-sensors.md).

## The common board

```text
VCC ─┬─ 1 kΩ ─ power LED ─ GND
     ├─ 10 kΩ ─┬─ AO ─ element ─ GND
     │         └─ LM393 IN+
     ├─ trimmer ─ Vref ─ LM393 IN−
     ├─ 10 kΩ pull-up ─ DO ─ LM393 open collector to GND
     └─ 1 kΩ ─ DO LED ─ DO
```

- **AO** is the point between the 10 kΩ and the element: a share of VCC that moves with what the
  element senses. On the 3-pin boards (LDR-LM393, SW-420-M, FC-51) it stays inside; the card still
  shows it.
- **Vref** is what the trimmer sets: `threshold` × VCC (0 to 1, default 0.5). Its slider is the
  part's `threshold` control.
- **DO is low exactly while AO is under Vref**, and the DO LED lights then. "Detected" (wet, damp,
  light, a beam, white or near, a magnet, an obstacle) pulls AO down, so DO goes low; the SW-420 is
  the exception, low at rest and high while shaken.
- Everything follows VCC (ratiometric): on 3.3 V AO and Vref are two thirds of their 5 V values, and
  DO switches at the same stimulus. DO high **is** VCC (the pull-up goes there), so a module on 5 V
  drives 5 V into a 3.3 V board's pin: the board's own check says so (`SIM_PIN_OVERVOLTAGE`).
- Currents at 5 V: about 3.9 mA with DO high, 7.5 mA with DO low; the infrared ones add their LED's
  25 mA (about 29 mA in all).

## The nine parts

| Part | Board pins | Field it senses (own value) | Element | DO low means |
|---|---|---|---|---|
| `MH-RD` | VCC GND AO DO | `rain` (`wetness`, 0…1) | copper comb, 10 MΩ dry … 5 kΩ wet | water on the comb |
| `YL-69` | AO DO GND VCC | `moisture` (`moisture`, %) | soil fork, 5 MΩ in air … 4.7 kΩ in water | damp soil (from 61 %) |
| `LDR-LM393` | DO GND VCC | `light` (`light`, lx) | GL5528 photoresistor | light (from 17.6 lx) |
| `SLOT-IR` | A0 D0 GND VCC | `beam` (`beam`, true = blocked) | IR LED and phototransistor across a slot | the beam reaches it |
| `TCRT5000-M` | A0 D0 GND VCC | `distance`, `reflectance` (both) | IR LED and phototransistor, reflective | white within about 1.5 cm |
| `KY-024` | DO + G AO | `field` (`field`, G) | A3144 Hall switch, on at 160 G, off at 105 G | a south pole near it |
| `SW-420-M` | DO GND VCC | `vibration` (`vibration`) | spring contact, 10 Ω closed | at rest (high while shaken) |
| `FC-51` | OUT GND VCC | `distance`, `reflectance` (both) | IR LED and receiver side by side | an obstacle (9 cm for white) |
| `KY-037` | DO + G AO | `sound` (`sound`, dB SPL) | electret capsule, its bias at VCC/2 | a loud sound (above about 98 dB) |

A value on the part wins over the circuit's environment, field by field
([environment.md](environment.md)); moving the part's own control in its card detaches it from that
field. `reflectance` is in % of white paper's (black ink about 10); `beam` and `reflectance` are the
two fields these modules added to the environment.

Each element in short:

- **Rain, soil, light**: a resistance under the 10 kΩ. Rain: R = 10 MΩ^(1 − w) · 5 kΩ^w (w the share
  of the comb wet). Soil: log-linear between 5 MΩ (0 %), 100 kΩ (10 %), 17 kΩ (40 %), 8 kΩ (70 %) and
  4.7 kΩ (100 %). Light: the kit's GL5528 curve. A steady current through wet electrodes corrodes
  them: `SIM_MODULE_CORROSION` (info).
- **Slot, line follower, obstacle**: the board's own IR LED (150 Ω, a flat 1.25 V: 25 mA at 5 V)
  lights a phototransistor whose current is proportional to the LED's and to what comes back: the
  slot 3 mA with the beam clear (`transmittance` on the part for paper, about 0.3, which still does
  not trigger it; `slots` and `duty` make it an encoder disc on the environment's `angle`); the
  TCRT5000 `reflectance` · 2 mA · g(distance), g read from its datasheet's curve (peak at 2.5 mm,
  nothing past 3 cm); the FC-51 `reflectance` · 0.5 mA / (1 + (d / 10 cm)²). Saturated, AO settles
  near 0.2 V. Neither models ambient light (the infrared that daylight adds to the receiver): they
  sense only `distance` and `reflectance`, a choice made for this first version.
- **Hall**: the A3144 is a latch: on at 160 G, off at 105 G, kept between (it lives in the element's
  `closed`, which the engine carries when a slider moves). AO jumps between about 0.09 V and VCC. The
  chip is specified from 4.5 V: on 3.3 V it works but says `SIM_MODULE_LOW_SUPPLY`.
- **Sound (KY-037)**: an electret capsule with a JFET and a 10 kΩ bias, so AO sits at **VCC/2** (2.5 V at
  5 V) and the audio rides on it: 6.3 mV rms per pascal, `Vrms = 6.3 mV · 10^((dB − 94) / 20)`, whose peak is
  8.9 mV at 94 dB, 17.8 mV at 100 dB and 56 mV at 110 dB. The kit does it as an **envelope**: AO stays
  the DC bias and the card shows the AC peak beside it, and DO goes low while that peak is larger than the
  gap between AO and Vref, `Vpk > Vbias − Vref` (a source of the peak between the trimmer and the
  comparator does it; there is no waveform, no hold time). The trimmer's default puts Vref 15 mV under the
  bias (`threshold` 0.497 at 5 V), so DO falls above about 98.5 dB; the `threshold` slider moves it in
  steps of 0.05 %. **The real board needs its trimmer set within millivolts of the bias** (a 25-turn
  trimmer, turned until the DO LED just goes out in a quiet room): a few millivolts too far and it never
  triggers or is always low, which is the experience this model keeps. Up close, the element is the
  capsule: a charged diaphragm in front of a plate. It senses the environment's `sound`.
- **Vibration**: shaken, the contact chatters in cells of 10 ms ± 50 %, open for the first 40 % of
  each, the pattern fixed by a seed (`seed` on the part, else its id), so DO comes in bursts of about
  100 pulses a second; once it stops, it settles closed within one more cell. The page steps in
  0.1 ms while it chatters. Its DO LED is wired as on the other boards, so it is lit at rest and goes
  out in the bursts; whether the real board lights it on detection instead is an open question for
  the bench.

## Limits and warnings

| Code | When |
|---|---|
| `SIM_IC_SUPPLY` | VCC over 5.5 V (the board's rating; a warning, so 5 V does not read as near it) |
| `SIM_REVERSE_VOLTAGE` | VCC reversed by more than 0.3 V |
| `SIM_OVER_CURRENT` | DO sinking over 20 mA (`U1.DO`, or `U1.OUT` on the FC-51, which prints OUT), an IR LED over 60 mA (`U1.IR`), the Hall output over 25 mA |
| `SIM_MODULE_LOW_SUPPLY` | VCC under the LM393's 2 V, or the Hall chip's 4.5 V (the linear Hall sensor's 2.7 V uses it too) |
| `SIM_MODULE_CORROSION` | DC through a wet comb or the soil (info) |

## Adding a tenth part

One row in `SENSOR_MODULES` (`src/parts/sensors.js`): its pins in the order the board prints them
(and `print` when the print differs), the fields it senses (`own` when the part calls one otherwise),
its element (one of the nine kinds: the KY-037's `electret` is the latest, or a new one with its formula in the same file and its element
in the device), the trimmer's total and its parameters with their source tags. One glyph in
`glyph()` of the package when its element looks new. Then its describe text
(`describe.sensor-module.<part>`), a check against the element's own formula in
`test/sensor-modules.test.js`, and a recipe if a lesson uses it. The board, the comparator, the LEDs,
the card, the symbol and the inside view are the same for all of them.
