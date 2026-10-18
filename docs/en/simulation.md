# Simulation

*[Español](../es/simulacion.md)*

The kit computes the voltage of every connected group and the current through every part,
from the same circuit file that draws the board. Every result is a **model**: ideal strips,
typical part values, no temperature. The text answer, the drawing and the page say so.

```bash
node bin/protoboard-iso.js simulate <target> [--lang es] [--json]                 # DC operating point
node bin/protoboard-iso.js simulate <target> --transient 5,1m [--start zero|dc]    # 5 s in 1 ms steps
node bin/protoboard-iso.js render <target> --sim --fit parts                       # results drawn on the board
node bin/protoboard-iso.js render <target> --sim --focus D1                        # only D1's current and its groups' voltages
```

In the page, a circuit with a source gets a **Simulation** button in the bar, not pressed
(`"page": { "results": true }` presses it from the start). It never covers the board with
numbers: with it on, **tap a part** to see its current, the voltages of the groups under its
leads and, in its card, all its values. While it is off the card shows no values, the
oscilloscope records nothing and no limit is marked.

MCP: the `simulate` tool (same options) and `render` with `sim: true`.

> **Learners first.** Never show a result someone is asked to predict. Results are only drawn
> on request (`--sim`); the embeddable page offers them behind its Simulation button, and then
> only for the part that is tapped. For a value still to be predicted, set
> `"page": { "simulation": false }`: no button, no engine in the page.

## Power: battery parts and `supplies`

Two ways to say where the energy comes from; the simulator treats both alike (an ideal source
behind an internal resistance):

- a **battery part** (`"type": "battery"`), drawn beside the board with its two leads in holes:
  format, chemistry, cells in series, state of charge (see
  [circuit-format.md](circuit-format.md#battery)). A circuit with a battery needs no `supplies`.
- **`supplies`**, not drawn: a bench supply or a battery clipped to two groups.

```json
{ "id": "BT1", "type": "battery", "format": "AA", "cells": 4, "pins": { "+": "T+3", "-": "T-3" } }
```

Cells in series add up: 4 × AA alkaline is 6 V nominal with 4 × 0.25 Ω inside, so with 330 Ω
it delivers 6 V / 331 Ω = 18.1 mA and 5.98 V at its terminals. Its card shows the open-circuit
voltage (emf), the terminal voltage, the internal drop, the current and power delivered, and
an estimated runtime (capacity / current).

| Format | Chemistries (default first) | Per cell: nominal · full | Internal resistance | Capacity | Largest current |
|---|---|---|---|---|---|
| AA | alkaline, nimh | 1.5 V · 1.6 V; 1.2 V · 1.4 V | 0.25 Ω; 0.03 Ω | 2.5 Ah; 2.0 Ah | 1 A; 2 A |
| AAA | alkaline, nimh | as AA | 0.35 Ω; 0.05 Ω | 1.15 Ah; 0.8 Ah | 0.5 A; 1 A |
| 18650 | li-ion, lifepo4 | 3.7 V · 4.2 V; 3.2 V · 3.4 V | 0.03 Ω | 3.5 Ah; 1.5 Ah | 10 A; 4.5 A |
| 9V | alkaline (six cells inside) | 9 V · 9.6 V | 1.7 Ω | 0.55 Ah | 0.3 A |
| pouch | lipo (103450) | 3.7 V · 4.2 V | 0.08 Ω | 2.0 Ah | 2 A |

Without `charge` a battery is at its nominal voltage. With `charge` (0…1) the open-circuit
voltage follows its chemistry's curve (li-ion: 3.0 V empty, 3.75 V at half, 4.2 V full) and the
internal resistance grows as it empties (four times for alkaline cells). A measured `voltage`
wins over both. `switch: "off"` disconnects it.

### `supplies`

```json
"supplies": [{ "id": "V1", "voltage": 5, "positive": "T+", "negative": "T-", "currentLimit": 0.5 }]
```

| Field | Meaning | Default |
|---|---|---|
| `id` | name in the results | `V1`, `V2`… |
| `kind` | `bench`, `battery` or `generator` (signal generator, below) | `bench` |
| `voltage` | volts | required, unless a battery gives `format` or `chemistry` |
| `format`, `chemistry`, `cells`, `charge`, `capacity` | a battery described like a battery part | — |
| `positive`, `negative` | hole (`"T+9"`) or group (`"T+"`, `"12:f-j"`) of each lead | `T+`, `T-` |
| `currentLimit` | bench supply limit, A: above it the supply holds the current (constant current, CC) and its voltage falls | none |
| `internalResistance` | Ω | bench 0; battery by format, or 0.25 Ω per 1.5 V cell with only a voltage |

**Signal generator** (`"kind": "generator"`): a supply whose voltage changes with time, like a
bench oscilloscope's generator output.

```json
"supplies": [{ "id": "G1", "kind": "generator", "waveform": "sine", "frequency": 50, "amplitude": 10 }]
```

| Field | What | Default |
|---|---|---|
| `waveform` | `sine`, `square` or `triangle` | `sine` |
| `frequency` | Hz | required |
| `amplitude` | peak volts (half of peak to peak) | 1 |
| `offset` | DC offset, volts | 0 |
| `resistance` | output resistance, Ω (a typical bench generator's) | 50 |

The waves are Falstad's: the sine starts at its offset rising, the square starts high and the
triangle at the bottom. In DC it is its value at t = 0; in a transient and in the live page it
follows the wave step by step. It has no card (it is not a drawn part), but the controls panel
may carry its frequency and amplitude (`"field": "frequency"` / `"amplitude"`). In the page,
time runs one period a second, with at least 100 steps per period. Examples
`half-wave-rectifier.json` and `rc-square-wave.json`.

The first supply's negative is **ground** (0 V); with no `supplies`, the first battery part's. A second supply with no connection to the
first one feeds a separate circuit, measured from its own negative.

Set them with an operation like any circuit field:
`{ "op": "circuit", "supplies": [ … ] }`.

## Analyses

- **DC (operating point).** Capacitors are open; everything else at its steady state.
  Newton's method on modified nodal analysis (MNA); if it does not converge, the sources are
  ramped up from 10 % (source stepping).
- **Transient.** `stop` and `step` in seconds; capacitors start discharged and inductors with
  no current (`start: "zero"`, the supply switched on at t = 0), or at their DC values
  (`start: "dc"`). Backward Euler with a
  fixed step; at most 400 samples are kept (`points`).

## Results

`simulate(circuit)` (JSON with `--json` or `format: "json"`):

```js
{ analysis: 'dc', model: true, ok: true, ground: 'T-',
  nodes:    { 'T+': 5, '9:f-j': 1.76, … },               // volts; null = floating
  supplies: { V1: { voltage, current, power, mode: 'CV' | 'CC' } },
  parts:    { R1: { voltage, current, power, pins: { '1': 5, '2': 1.76 } },
              D1: { …, brightness: 0.49 },                // LED: current / 20 mA
              Q1: { currents: { C, B, E }, vbe, vce, beta, region: 'off' | 'active' | 'saturation' },
              M1: { currents: { D, G, S }, vgs, vds, region: 'off' | 'linear' | 'saturation' },
              BT1: { voltage, current, power, emf, drop, runtime, charge, on },   // current: delivered
              U1: { vin, vout, headroom, current, quiescent, power, state: 'regulating' | 'dropout' },
              RT1: { …, sensor: { kind: 'thermistor', temperature, resistance } } },
              // DC only: each part against its limits (fine < 80 %, near ≤ 100 %, exceeded)
              // D1.stress: [{ quantity: 'current', value, max, unit: 'A', ratio, level: 'fine' | 'near' | 'exceeded' }]
  issues: [ … ] }
```

Two-terminal parts: `voltage` = first pin − second pin, `current` flows from the first pin to
the second through the part. Transistor pin currents are positive into the pin. The transient
answer has `times` and the same quantities as arrays.

## Warnings

| Code | When |
|---|---|
| `SIM_OVER_POWER` | a resistor above its rating (`power`: "1/4" W by default) or a transistor above its package limit |
| `SIM_OVER_CURRENT` | an LED above 30 mA, a diode, inductor, regulator or battery above its maximum |
| `SIM_REVERSE_VOLTAGE` | an LED with more than 5 V in reverse |
| `SIM_CAP_REVERSED`, `SIM_CAP_OVER_VOLTAGE` | an electrolytic the wrong way round; any capacitor above its voltage |
| `SIM_SUPPLY_LIMITED` | a bench supply at its current limit (constant current) |
| `SIM_SHORT_CIRCUIT` | an unlimited supply delivering more than 3 A; a battery whose load is under half an ohm |
| `SIM_BATTERY_OFF`, `SIM_BATTERY_CHARGING`, `SIM_BATTERY_REVERSE` | a battery switched off; current pushed into it (a warning for alkaline cells, which cannot be recharged) |
| `SIM_REG_DROPOUT`, `SIM_REG_HOT` | a regulator without enough input voltage to regulate; dissipating more than a TO-220 handles without a heatsink (2 W) |
| `SIM_BUZZER_DC` | steady DC through a passive buzzer |
| `SIM_FLOATING` | groups with no DC path to the supply (an unconnected MOSFET gate, for example) |
| `SIM_UNSUPPORTED`, `SIM_DEFAULT_MODEL` | a part not simulated yet (chips), or a part number without its own model |

## Models

All in `src/sim/models.js`, each checked once in `test/sim.test.js` against an independent
reference (a textbook formula solved separately, or the datasheet figure).

| Part | Model | Reference in the tests |
|---|---|---|
| wire | 0.05 Ω (wire and two contacts) | — |
| resistor, potentiometer | Ohm's law; wiper: R(1–W) = position · R | divider, series–parallel |
| push button | 0.1 Ω when pressed; pairs always joined | LED on only while pressed |
| switch (KCD1, 7 × 7 latching) | each contact closed in its position, 50 mΩ / 0.1 Ω; open ones absent; stress over 3 A / 100 mA | Ohm's law through the contact; NC and NO swap |
| capacitor | open in DC; backward Euler in transient | V·(1 − e^(−t/RC)) |
| diode | Shockley + series resistance, per part number | datasheet Vf |
| Zener diode | the diode plus a reverse breakdown: a soft knee below about 5.5 V (Zener effect), a sharp one above (avalanche), behind part of Zzt; exactly Vz at the test current Izt (1N47xxA table) | 1N4733A: 5.1 V at 49 mA |
| bridge rectifier | four diodes (AC1 and AC2 up to +, − up to each), Shockley + series resistance, about 1.0 V each at the rated current (KBP2xx 2 A, KBP3xx 3 A) | same output polarity either way round; Kirchhoff at its pins |
| regulator | output = reference + its voltage (GND + 5 V for a 7805, ADJ + 1.25 V for an LM317), or about 2 V below the input when that is too low (1.1 V for the AMS1117); its own current (5 mA; 50 µA out of ADJ); the AMS1117 module's power LED and resistor from OUT to GND, counted in what it draws | 7805 at 9 V; LM317 formula with Iadj; AMS1117 output and dropout from its datasheet |
| inductor | winding resistance in series; a short in DC, backward Euler in transient | RL: I·(1 − e^(−t/τ)) |
| thermistor, photoresistor | resistors whose value comes from the temperature (B equation) or the light (GL55 curve) | B equation at 50 °C; GL5528 at 10 lx |
| buzzer | its coil, 16 Ω | — |
| LED | Shockley + 10 Ω, Vf at 20 mA by colour; `"model": { "vf": 2.95 }` overrides | loop equation solved apart |
| MOSFET | square law, smooth turn-on, k from Rds(on) | square law solved apart, Rds(on) |
| BJT | Ebers–Moll, constant β; TIP120 as a Darlington with its two resistors | Ebers–Moll solved apart; hFE ≥ 1000 |
| bench supply, battery | ideal source, optional limit; battery: emf from format, chemistry, cells and charge, behind its internal resistance | short circuit, Ohm's law with internal resistance |

Any model field can be overridden per part with `"model": { … }` (for example the forward
voltage of an LED measured on the bench).

## Not yet

Chips (555, op-amps, logic, optocouplers) are left unconnected and reported. No events during
a transient (pressing a button at a given time), no self-heating, no battery discharge over
time (`charge` is fixed for a run). Animation (stage 3) will read these same results.
