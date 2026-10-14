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

In the page (`"page": { "results": true }`) the simulation is always on but never covers the
board with numbers: **tap a part** to see its current, the voltages of the groups under its
leads and, in its card, all its values.

MCP: the `simulate` tool (same options) and `render` with `sim: true`.

> **Learners first.** Never show a result someone is asked to predict. Results are only drawn
> on request (`--sim`), and the embeddable page only has them when the circuit asks
> (`"page": { "results": true }`), and then only for the part that is tapped.

## Power: `supplies`

```json
"supplies": [{ "id": "V1", "voltage": 5, "positive": "T+", "negative": "T-", "currentLimit": 0.5 }]
```

| Field | Meaning | Default |
|---|---|---|
| `id` | name in the results | `V1`, `V2`… |
| `kind` | `bench` or `battery` | `bench` |
| `voltage` | volts | required |
| `positive`, `negative` | hole (`"T+9"`) or group (`"T+"`, `"12:a-e"`) of each lead | `T+`, `T-` |
| `currentLimit` | bench supply limit, A: above it the supply holds the current (constant current, CC) and its voltage falls | none |
| `internalResistance` | Ω | bench 0; battery 0.25 Ω per 1.5 V cell |

The first supply's negative is **ground** (0 V). A second supply with no connection to the
first one feeds a separate circuit, measured from its own negative.

Set them with an operation like any circuit field:
`{ "op": "circuit", "supplies": [ … ] }`.

## Analyses

- **DC (operating point).** Capacitors are open; everything else at its steady state.
  Newton's method on modified nodal analysis (MNA); if it does not converge, the sources are
  ramped up from 10 % (source stepping).
- **Transient.** `stop` and `step` in seconds; capacitors start discharged (`start: "zero"`,
  the supply switched on at t = 0) or at their DC values (`start: "dc"`). Backward Euler with a
  fixed step; at most 400 samples are kept (`points`).

## Results

`simulate(circuit)` (JSON with `--json` or `format: "json"`):

```js
{ analysis: 'dc', model: true, ok: true, ground: 'T-',
  nodes:    { 'T+': 5, '9:a-e': 1.76, … },               // volts; null = floating
  supplies: { V1: { voltage, current, power, mode: 'CV' | 'CC' } },
  parts:    { R1: { voltage, current, power, pins: { '1': 5, '2': 1.76 } },
              D1: { …, brightness: 0.49 },                // LED: current / 20 mA
              Q1: { currents: { C, B, E }, vbe, vce, beta, region: 'off' | 'active' | 'saturation' },
              M1: { currents: { D, G, S }, vgs, vds, region: 'off' | 'linear' | 'saturation' } },
  issues: [ … ] }
```

Two-terminal parts: `voltage` = first pin − second pin, `current` flows from the first pin to
the second through the part. Transistor pin currents are positive into the pin. The transient
answer has `times` and the same quantities as arrays.

## Warnings

| Code | When |
|---|---|
| `SIM_OVER_POWER` | a resistor above its rating (`power`: "1/4" W by default) or a transistor above its package limit |
| `SIM_OVER_CURRENT` | an LED above 30 mA, a diode above its maximum |
| `SIM_REVERSE_VOLTAGE` | an LED with more than 5 V in reverse |
| `SIM_CAP_REVERSED`, `SIM_CAP_OVER_VOLTAGE` | an electrolytic the wrong way round; any capacitor above its voltage |
| `SIM_SUPPLY_LIMITED` | a bench supply at its current limit (constant current) |
| `SIM_SHORT_CIRCUIT` | an unlimited supply delivering more than 3 A |
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
| capacitor | open in DC; backward Euler in transient | V·(1 − e^(−t/RC)) |
| diode | Shockley + series resistance (1N4007, 1N4148, 1N5819) | datasheet Vf |
| LED | Shockley + 10 Ω, Vf at 20 mA by colour; `"model": { "vf": 2.95 }` overrides | loop equation solved apart |
| MOSFET | square law, smooth turn-on, k from Rds(on) | square law solved apart, Rds(on) |
| BJT | Ebers–Moll, constant β; TIP120 as a Darlington with its two resistors | Ebers–Moll solved apart; hFE ≥ 1000 |
| bench supply, battery | ideal source, optional limit; battery 0.25 Ω per cell | short circuit, loaded battery |

Any model field can be overridden per part with `"model": { … }` (for example the forward
voltage of an LED measured on the bench).

## Not yet

Chips (555, op-amps, logic) are left unconnected and reported. No inductors, no events during
a transient (pressing a button at a given time), no temperature, no breakdown. Animation
(stage 3) will read these same results.
