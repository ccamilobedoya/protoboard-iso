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

In the page the simulation is always on whenever the circuit has a source, but never covers the
board with numbers: **tap a part** to see its current, the voltages of the groups under its
leads and, in its card, all its values; LEDs glow with their current, and the *Current* button
(not pressed) shows the conductors coloured by voltage with the current moving.

MCP: the `simulate` tool (same options) and `render` with `sim: true`.

> **Learners first.** Never show a result someone is asked to predict. Results are only drawn
> on request (`--sim`); the embeddable page has them by default, only for the part that is
> tapped, so a circuit with a value still to be predicted turns them off:
> `"page": { "simulation": false }` (everything) or `"page": { "results": false }` (the values;
> the lit LEDs go with them).

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

A negative `voltage` (`-5`) is the same supply the other way round: it is simulated with its
terminals swapped, and read as written (`V1 -5 V … written negative: T- is the positive rail, not
T+`); `layout`'s answer has one `Note:` line saying the rail named + is the lower one.

Set them with an operation like any circuit field:
`{ "op": "circuit", "supplies": [ … ] }`.

## Analyses

- **DC (operating point).** Capacitors are open; everything else at its steady state.
  Newton's method on modified nodal analysis (MNA); if it does not converge, the sources are
  ramped up from 10 % (source stepping). Newton has converged when an iteration moves no voltage
  by more than 1 µV + 1 ppm or, once its updates stop shrinking, when Kirchhoff's equations
  already balance at every node (1 pA + 1 ppb of the row's terms): a node held only by
  leakage, like a bridge's DC side while its diodes block, is fixed only that well.
- **Transient.** `stop` and `step` in seconds; capacitors start discharged and inductors with
  no current (`start: "zero"`, the supply switched on at t = 0), or at their DC values
  (`start: "dc"`). Backward Euler with a
  fixed step; at most 400 samples are kept (`points`). A circuit whose board runs a program is
  stepped as the page steps it (below, "A run"): pieces of at most 1 ms that end on each event of
  the program and of the timed modules, so a 10 µs pulse or an echo is at its time; the answer
  then has a note naming `--run`, which says what the program printed and how its outputs toggle.
- **A run** (`simulate <target> --run <seconds>`, MCP `run_s`). The circuit as the page runs it,
  from switch-on (the page's start: its DC point, or capacitors discharged with `page.start:
  "zero"`), for that many simulated seconds: the same engine and the same step (`sim/pace.js`),
  the board's program with `pulseIn`, the library sensors, the encoder and the timed modules. It
  answers what an assistant needs to say whether the circuit does what was asked:
  - **Serial**: what the program printed, each line with its time, in order, and the count (a
    long story keeps its first and last lines, `runSerialLines` in `src/limits.js`);
  - **outputs over time**, one per part that shows something (an LED, a chip of an RGB LED, a
    segment of a display, a buzzer, a relay, a motor), each op-amp's output and each pin a
    program drives (`U1.D13`): the share of the time it was on, how many times it changed, the
    spans it was on (`intervals`) and, when it toggles regularly (every period within 10 % of
    their mean, the start-up's first period left out), its frequency, period and duty. Edges are
    found between steps: a pin at the step its program changed it, an LED a pin drives in the
    middle of that step, anything slower where it crosses its level (an LED at 5 % of its rated
    current, a relay closed, a motor over 30 r/min, a pin or an op-amp's output over half its
    rail);
  - **the readings at the end**, as the DC point prints them, and every warning the run produced.

  Stimuli, each usable several times: `--env light=0.5,distance=10` (fields of the environment,
  in the catalog's units, inside the field's range: an unknown field or a value outside it is an
  input error, exit 1), `--set RV1=0.8,SW1=on` (a control: a potentiometer's position, a
  switch, a sensor's own field such as `U2=30` on an LM35; `ID.field=value` when it has several),
  `--press SW1@0.5+0.2` (pressed at 0.5 s for 0.2 s), `--at 1.0:light=0.1` (a field or a control
  changed at a time). A sensor that reads a field by a value of its own follows the field a run
  sets, and the run says so (`RUN_ENV_ATTACHED`). `--env` and `--set` also apply to the DC point
  and to `--transient`. Nothing is saved: the circuit file and its history stay as they were.
  Bounded: at most `runSeconds` (60) of simulated time (more is capped, `RUN_CAPPED`) and
  `runMs` (15 s) of the machine's (`RUN_BUDGET`: it ends where it got to); a program that never
  lets time pass ends with `SIM_PROGRAM_STUCK`.

  ```text
  $ protoboard-iso simulate alarm --run 1 --env distance=10
  Run from switch-on (the page's start) — a model, not a measurement: 1 s in steps of 1 ms (1000 steps).
  Serial (10 lines, in order):
    844 µs     10
    …
  Outputs over time:
    D1 (LED): on 100 % of the time · changes: 1 (on 857 µs → 1 s)
    U1.D9 (pin): 9.92 Hz, on < 1 % of the time (period 101 ms) · changes: 20
  Readings at 1 s:
  …
  ```

  A pin is reported by what the program writes to it (a pin loaded under the half-rail line is still
  high; its sagging voltage is in the readings, with `(through its 40 Ω output resistance)` on a pin
  carrying more than 1 mA).

  `layout`'s answer has the same in one line for a circuit that changes by itself (a board's
  program, a 555, a generator, an op-amp beside a capacitor): `Behaviour, first 2 s (simulated, a
  model): D1 1 Hz, on 50 % of the time`, from a run bounded at 25 000 steps of the simulation (so the
  same circuit gives the same line on any machine; about as long as the 0.8 s of the machine's
  time it replaced, `BEHAVIOUR_STEPS` in `src/sim/run.js`) and a step no shorter than a 20 000th of
  it (a rhythm faster than 50 of those steps per period is measured again in the page's own step, as
  `simulate --run` measures it, within the same bound; under five whole periods there it says `about`
  with two figures); past the bound it says it was not measured (`the run needed more than 25 000 steps of the
  simulation`) and names `simulate --run 2`.

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

A run (`--run`, `run_s`):

```js
{ ok: true, run: { seconds: 1, step: 0.001, steps: 1000, start: 'dc' },
  serial: { count: 10, lines: [{ t: 0.00084, text: '10' }, …] },    // kept: when capped
  outputs: [{ id: 'D1', kind: 'led', onShare: 0.999, changes: 1, frequency: null, period: null, duty: null,
              intervals: [[0.00086, 1]] }, …],                         // an output still on closes at the end
  boards: 1, readings: { … the DC point's shape, at the end … }, issues: [ … ] }
```

Two-terminal parts: `voltage` = first pin − second pin, `current` flows from the first pin to
the second through the part. Transistor pin currents are positive into the pin. The transient
answer has `times` and the same quantities as arrays.

## Warnings

| Code | When |
|---|---|
| `SIM_OVER_POWER` | a resistor above its rating (`power`: "1/4" W by default) or a transistor above its package limit |
| `SIM_OVER_CURRENT` | an LED above 30 mA, a diode, inductor, regulator or battery above its maximum |
| `SIM_REVERSE_VOLTAGE` | a part fed backwards: an LED with more than 5 V in reverse; a regulator, op-amp, 555 or development board whose supply pin sits more than 0.5 V below its ground pin ("any reverse voltage on a supply is outside its ratings: in a real circuit it can be destroyed"; the line names both pins and the voltage; 0.5 V is only a noise floor, no datasheet rates it); sensor modules over their own figure. Thresholds in one place: `REVERSE_LIMITS` in `src/sim/models.js` |
| `SIM_RELAY_UNDERDRIVEN` | a relay whose coil carries more than its drop-out current and less than its pull-in current, the armature at rest: driven, but it does not pull in. Not damage: `checkHazards` returns it in `doubts` (with the state it was found in), `simulate` in its notes |
| `SIM_CAP_REVERSED`, `SIM_CAP_OVER_VOLTAGE` | an electrolytic the wrong way round; any capacitor above its voltage |
| `SIM_SUPPLY_LIMITED` | a bench supply at its current limit (constant current) |
| `SIM_SHORT_CIRCUIT` | an unlimited supply delivering more than 3 A; a battery whose load is under half an ohm |
| `SIM_BATTERY_OFF`, `SIM_BATTERY_CHARGING`, `SIM_BATTERY_REVERSE` | a battery switched off; current pushed into it (a warning for alkaline cells, which cannot be recharged) |
| `SIM_REG_DROPOUT`, `SIM_REG_HOT` | a regulator without enough input voltage to regulate; dissipating more than a TO-220 handles without a heatsink (2 W) |
| `SIM_BUZZER_DC` | steady DC through a passive buzzer (the active one sounds on DC: it does not apply) |
| `SIM_RELAY_COIL`, `SIM_RELAY_KICK` | a relay's coil driven over its 120 % (6 V); its coil cut off with nothing across it, its voltage reversed far past the supply (a diode across the coil holds it to about 1 V) |
| `SIM_MOTOR_VOLTAGE`, `SIM_MOTOR_STALL` | a DC motor over the top of its voltage range; held still by its load, drawing its stall current |
| `SIM_FLOATING` | groups with no DC path to the supply (an unconnected MOSFET gate, for example) |
| `SIM_PIN_OVERVOLTAGE`, `SIM_PIN_UNKNOWN`, `SIM_PIN_STATE`, `SIM_PIN_INPUT_ONLY` | a microcontroller pin beyond its rail (protection diodes conducting), in a DC state of the review (the highest it reaches there) or at a moment of the review's run, with that time (an HC-SR04's 5 V echo on an ESP32 pin, low at rest; `variant: 'run'`); an `io` entry naming no wired GPIO, a state it does not know, or an output on an input-only pin |
| `SIM_IC_SUPPLY` | a chip fed above its maximum (555: 16 V; LM358: 32 V; 741: 36 V in total) |
| `SIM_UNSUPPORTED`, `SIM_DEFAULT_MODEL` | a part not simulated yet (chips other than the 555), or a part number without its own model |

`review` runs this same DC analysis and lists every stress past its limit (the codes that name a
part and a maximum: `SIM_OVER_CURRENT`, `SIM_OVER_POWER`, `SIM_REVERSE_VOLTAGE`, `SIM_IC_SUPPLY`, …;
not the supply, floating or note codes) as a **hazard**: the verdict becomes APPROVED WITH WARNINGS,
never blocking, and `layout` ends in `STATUS: WARNINGS`. It reads the DC point at rest and again in
each of these states, one at a time with everything else at rest (`src/sim/index.js`,
`checkHazards`):

- **Each control a learner moves by hand**: a push button (or a rotary encoder's) pressed, a switch
  in its other position (a rocker, a latching button, a slide switch, a tilt switch tipped), a
  potentiometer or trimmer at each end of its travel.
- **Each field of the environment a sensor follows, at the bottom and at the top of its range**
  (the circuit's `range` for it, else the registry's), one field at a time: a circuit that works
  at the middle of the range can stop working in the dark or in the heat. A bench supply with a
  negative `voltage` is the same supply the other way round, so what it feeds backwards is judged
  by rule above. A damage line ends by saying what happens to that kind of part (it burns out, it
  overheats, the pin can be damaged…), and a computed fix leaves the LED lit and the motor above
  the bottom of its voltage range, or the kit says it has none.
- Limit, as it is today: a part with unconnected pins is skipped by the limits, so a bare 555 with
  its supply reversed and the other pins open is not flagged. A relay driven under a quarter of its
  pull-in current is a leak, not a drive, and is not reported; when the warning shows in several
  states, the one with the highest coil current is reported, with its state.
- **Each output of a board's program held high** (since 2026-11-16): the pins the program has made
  outputs by the time it first waits (its `setup()` and `loop()` up to the first `delay`: the pin
  modes of the DC point, so `pinMode`, and the `digitalWrite`, `tone`, `analogWrite` and `ledcWrite`
  that make a pin an output there). Each is held high with `engine.drive` while the program runs on;
  a pin already high at rest adds nothing. A board's pin is named in the warning (`U1.D10`).

A hazard found only in one of those states says which (`… more than its maximum 30 mA, with S1
pressed.`, `… with D10 high.`; in JSON `hazards[].when: { part, field, value }` or `{ part, pin,
name, value: 1 }`); one that is there at rest is listed once, at rest. Measured on a board that
blinks two LEDs and beeps a buzzer (three outputs, two held high): the check took 16.0 ms before and
16.5 ms with the program's states (most of it is compiling the circuit).

### The fix

For each circuit with hazards the kit works out with its own simulator the simplest change that
clears **every** hazard in **every** state above, and says it as information; it changes nothing
(`src/fix.js`):

```text
To fix it: a 200 Ω resistor in series with BZ1 brings U1's D10 to 19.4 mA (maximum 40 mA).
To fix it: R1 = 360 Ω brings R1 to 140 mW (maximum 250 mW) and D1 to 19.7 mA (maximum 30 mA).
The kit has no computed fix for this.
```

- **A part in backwards is turned round.** For a reverse-voltage hazard the candidates are the part
  with its two leads swapped (`To fix it: turn BZ1 round (swap its 1 and 2)`), then each supply or
  battery with its leads swapped (`To fix it: swap the leads of BT1 (its + and −)`), the first that
  clears every hazard in every state (`fix.kind` `swap` or `swap-supply`). A series resistor is never
  offered for a reverse hazard (it only silences a buzzer): with none of the swaps clearing it, the
  kit has no computed fix.
- **Candidates, in this order**, the first that clears everything wins: (1) a new value for a
  resistor already in series with the stressed part or its branch (the part itself when it is a
  resistor), (2) one new resistor in series with the stressed part, or with each load on a board's
  pin, or with the pin itself. At most six candidates.
- **The value** is searched in E24 from 10 Ω to 1 MΩ with the goal solver's own sweep
  (`sweepResistor` in `src/recipes/solve.js`, the resistor changed in place). It aims the stressed
  quantity at the part's **rated value** where it has one (an LED's 20 mA), otherwise at **half of
  its maximum** (a pin's 40 mA → 20 mA, a resistor's 250 mW → 125 mW): the rated value is what the
  part is meant to run at, and half the absolute maximum is the usual margin for a part without one
  (a microcontroller pin "meant to give about 20 mA"). The nearest result at or under the aim that
  clears every hazard is chosen; when the nearest does not (the added resistor would overheat
  itself, or the damage moves to another part), the next values down are tried by bisection.
  The aim is set by a hazard on another part than the resistor being changed (an LED's current, not
  its resistor's own power).
- **A resistor that is not placed**: candidate (2) is tried on the compiled circuit, not on the
  layout: the pin is split from its net and a ¼ W resistor joins them, so its own power is judged
  too. A change that only moves the damage elsewhere is not a fix.
- **One line per circuit**: several hazards with one cause get one fix; when no single resistor
  clears them all, the fixed sentence "The kit has no computed fix for this." (Spanish: "El kit no
  tiene un arreglo calculado para esto."), the signal that an assistant is on its own (and must try
  its idea with `layout --dry-run` before it reaches the circuit). Example: a 16 V capacitor straight
  across 25 V (no current flows in DC, so no resistor in series changes its voltage).
- **JSON**: the review's `fix: { kind: 'set', part, value, brings }` or `{ kind: 'add-series',
  with, pin, value, brings }` (`brings: [{ part, quantity, value, max, unit, when? }]`: each hazard's
  quantity with the fix, in the state it was found in), or `fix: null` with `noFix: true`. `layout`
  computes it once, on the circuit it keeps (not on each try).
- **Cost**: measured 82 ms on the buzzer circuit above, 10 ms on an LED asked for 50 mA, 105 ms on a
  buzzer across 5 V through a transistor; only for a circuit with hazards.
- **Applied only when asked**: `layout <target> --fix` (the MCP tool's `fix: true`) lays a circuit
  made by `layout` out again with its computed fix, as one revision, and says so
  (`Applied the fix: R3 = 200 Ω in series with BZ1.`); nothing else applies it
  ([layout.md](layout.md#laying-out-again-an-existing-circuit-since-2026-10-20)).

### What it could not tell (doubts)

A hazard is a part the kit sees burning. A **doubt** is something the kit cannot vouch for, so it
cannot say the circuit works: what it could not check at all (a part with no model, a program it
cannot run) or what it checked and found may not work (a relay that may not pull in, a button
across joined pins): the review lists them in `doubts` (same shape as the hazards:
`{ severity: 'warning', code, params, parts }`), any one of them makes the verdict APPROVED WITH
WARNINGS and `layout` end `STATUS: WARNINGS`, and both print them as `⚠` lines under their own
heading (`The kit cannot confirm these work …`), after the hazards (`src/sim/index.js`, `doubtsOf`).
They never block. `DONE` then means what it says: the kit checked the circuit and found nothing to
tell.

- Wiring findings the kit reports and never blocks on (`DOUBT_CODES` in `src/circuit/checks.js`):
  `BUTTON_PINS_JOINED`, a push button whose two pins on one side (one metal piece) carry two
  different nets, so pressing it changes nothing. `check` lists it as a warning; `apply` saves a
  change that adds it and marks it ⚠. `COIL_NO_FLYBACK`, a relay's coil or a motor switched by a
  transistor's collector, a MOSFET's drain or a board's pin with no diode on the node the switch cuts
  (across the coil, or to a rail as in an H-bridge): the switch can be damaged when it turns off. A
  motor on a plain switch or straight on a supply has no switch to damage.
- `SIM_PART_NOT_SIMULATED`: a part wired into the circuit with no simulation model (a 74HC595, an
  LM386, a CD4017…; `catalog` marks them): it is drawn and its pins are left open, so what it does,
  and what it drives, is unknown. A part wired to nothing is not a doubt.
- `SIM_OUTPUT_NEVER_ON`: a part whose job is to show or move something (an LED, a chip of an RGB
  LED, a segment of a display, a buzzer, a relay, a motor, a laser), wired into a circuit with a
  source, that is off in every state the kit visits: at rest, each control, each end of the
  environment, each program output, then every field of a declared environment and every control the
  page offers, and a run (the first 2 s when the circuit changes by itself, then each of those states
  held 0.5 s and released). Parts that never come on are one doubt (`D1, D2 never come on`); a chip
  or segment that never lights while the others do is named (`DS1: dp`); a relay says the most its
  coil got and the pull-in it needs (a coil fed from a sensor module's output: 3.2 mA of 53.6 mA). A
  relay driven past a quarter of its pull-in current that does not pull in is
  `SIM_RELAY_UNDERDRIVEN` instead. Not said when the board's program cannot run as written (its own
  doubt says so). The two figures of the run are assumed (`src/sim/index.js`).
- Every issue about a board's program: the file not found (`SIM_PROGRAM_FILE`, which says the
  folder the kit looked in: the circuit's, beside `circuit.json`), outside the folder, too large, a
  syntax error with its line, a call the simulator does not know (`attachInterrupt()`), a library or a
  class not in the kit, no `setup()`/`loop()` (`SIM_PROGRAM_IGNORED` stays a note). Also
  `SIM_PROGRAM_STOPPED`, a program that stopped with an error at rest, and `SIM_PROGRAM_STUCK`, a
  program that never lets time pass: `setup()` or one call of `loop()` that never returns and never
  waits (`void loop() { while (1) {} }`). The program's runner says so itself
  (`stuck`, `src/sim/program.js`): one advance used its whole budget of turns inside one call, never
  by waiting; a `loop()` that returns without a `delay()` is a working program.
- Any other warning or error the simulation gives at rest or in one of the states above (with its
  `when`) that is not a hazard and not already blocking: whatever warning the simulator prints can
  no longer be invisible to `layout`. `SIM_FLOATING` is one only when a simulated part wired in by
  another pin is on the floating nodes (a MOSFET's gate left open); nodes outside the circuit (parts
  wired to nothing, what only a part not simulated touches) are not.
- A circuit with a source whose DC point does not solve (`SIM_NO_CONVERGENCE`) or whose supply is
  not valid (`SIM_BAD_SUPPLY`). A circuit with no source at all is not a doubt: its Checked line
  says nothing could be simulated.

### What it does not check

After the hazards, the review and `layout` (when the circuit was built) print one line with what
the check covered and what it did not, for this circuit
(`Checked: at rest, 3 program outputs. Not checked: peaks while switching, combinations of program
outputs.`; JSON `checked: { rest, controls, outputs, notChecked: [code…], skipped?, unsimulated?, programs? }`).
The codes, only those that apply:

- `switching`, **peaks while switching** (a board's program, a 555, a generator): a PWM pin, a
  tone, a 555's output or a generator's wave is judged at its DC point; the peaks a transient shows
  are not found.
- `combinations`, **combinations** of controls and outputs (two buttons pressed together, two pins
  high at once), when there are two or more: one is moved at a time.
- `environment`, **what the sensors read from the environment** (light, temperature, motion,
  touch, a module's trimmer…): read as the circuit leaves them, the circuit's `environment` or a
  value of the part's own (an LDR's `light`). Other sliders (a resistor's, a
  motor's load) and the supplies' controls are too.
- `limit`, **states past the limit**: at most 24 (controls first, in the order of the parts, then
  pins); the review also says how many were checked (`States checked for damage: 24 of 30 …`; JSON
  `hazardStates: { checked, total, controls, outputs }`).
- `unsimulated`, **parts drawn but not simulated** (`SIM_UNSUPPORTED`; each also a doubt).
- `program`, **a board's program where the kit cannot run it** (JSON `programs`: the boards with a
  program doubt).
- `no-source` / `no-simulation`, **nothing could be simulated** (no source, or another reason the
  simulator's issues give).
- A pin the program first makes an output later than its first wait (no `pinMode` in `setup()`) is
  not in the states.

With nothing left: `Not checked: nothing that applies to this circuit.`

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
| microcontroller board (ESP32 DevKit, ESP32-C3, UNO) | each GPIO in its `io` state: an output is the logic rail or ground behind 17 Ω (ESP32) or 40 Ω (UNO), an input draws nothing with an optional 45 kΩ / 35 kΩ pull; protection diodes to the rail and ground; on USB a 5 V source with its 3.3 V regulator and the chip's own current ([microcontrollers.md](microcontrollers.md)) | VOH = VDD − I·R; pull-up current; 5 V into an ESP32 pin |
| op-amp (LM358, LM324, µA741, NE5532) | behavioural, DC and low frequency (no bandwidth or slew rate): output = gain·(V+ − V−) centred on mid-supply, clamped softly between swingLow above the negative supply and swingHigh below the positive one (LM358: 5 mV and 1.5 V; 741: 2 V each), behind its output resistance; current from the positive pin when sourcing, to the negative one when sinking; inputs draw nothing; an amplifier with nothing wired to it is left out; limits: total supply, output current (short-circuit), power | non-inverting 1 + R2/R1 and inverting −R2/R1 within 1 mV; follower; VOH = VCC − 1.5 V, VOL a few mV |
| comparator (LM393) | open collector: OUT pulled to the negative supply through 60 Ω while V− > V+, open otherwise (needs a pull-up) | sinking and open states, the LED it drives |
| NE555 timer | behavioural: its 5 kΩ divider sets CTRL at 2/3 of VCC; THR above CTRL resets the latch (output low, discharge on), TRIG below CTRL/2 sets it, RESET under 0.7 V holds it low; the latch changes between time steps; output high about 0.9 V below VCC behind 8 Ω, low behind 7.5 Ω; discharge 18 Ω; own current 3 mA at 5 V; limits 16 V, 200 mA, 600 mW. In DC it shows its state at switch-on (output high): an astable only oscillates in a transient or the live page | astable: f = 1.44 / ((R1 + 2·R2)·C) within 4 % and its duty cycle; the latch's truth table |
| inductor | winding resistance in series; a short in DC, backward Euler in transient | RL: I·(1 − e^(−t/τ)) |
| thermistor, photoresistor | resistors whose value comes from the temperature (B equation) or the light (GL55 curve) | B equation at 50 °C; GL5528 at 10 lx |
| buzzer | its coil, 16 Ω | — |
| active buzzer (TMB12A05) | a load that takes next to nothing under 1.5 V, rises smoothly to 5 V / 30 mA = 167 Ω at 2.0 V and stays there; it sounds (2.3 kHz, about 85 − 40·log10(5/V) dB at 10 cm) from 2.0 V across it, + to −, with no hysteresis; reversed it is 100 kΩ, silent, and warns over 1 V; over 7.5 V `SIM_IC_SUPPLY`, over 35 mA (from about 5.8 V) only the note `SIM_BUZZER_CURRENT` | 30 mA at 5 V, 19.8 mA and sounding at 3.3 V; silent and under 1 mA at 1 V |
| linear Hall sensor 49E | a source of Vs/2 + 1.4 mV/G · (Vs/5) · field held in [0.95 V, Vs − 0.95 V] behind 50 Ω, 6 mA from the supply; stresses: supply over 8 V or reversed; notes: under 2.7 V, over 1.5 mA out | 2.500 / 2.640 / 2.360 V at 0 / +100 / −100 G and 5 V; 1.742 V at +100 G and 3.3 V; 4.05 V clamped |
| voltage sensor module | 30 kΩ from VIN to S and 7.5 kΩ from S to GND, a milliohm joining − and GND; stress: the 30 kΩ over 100 mW | S = 2.40 V and 0.32 mA at 12 V in |
| LED | Shockley + 10 Ω, Vf at 20 mA by colour; `"model": { "vf": 2.95 }` overrides | loop equation solved apart |
| RGB LED, 7-segment display | one LED per chip between its pin and the common (cathode or anode), each with its own datasheet: RGB (YSL-R596CR3G4B5C-C10) red 2.0 V, green and blue 3.2 V at 20 mA, 20 mA each; 5161AS / 5161BS segments 2.1 V at 20 mA, 20 mA and 40 mW each; a display's two common pins joined by 0.05 Ω; stresses per chip, named by its pin (`D1.R`); `"model": { "R": { "vf": 1.9 } }` overrides one chip | each chip's Vf at 20 mA from its datasheet; the common by either pin |
| slide switch, tilt switch | as a switch: the contact its position closes is its resistance (SS-12D00 30 mΩ; SW-520D 10 Ω, the sheet's bound), the open one is not there; stresses: current (0.3 A; 25 mA) and the voltage an open contact holds (30 V; 12 V) | contact drop I·R; the open throw carries nothing |
| relay (SRD-05VDC-SL-C) | its coil 70 Ω in series with 0.1 H (the kit's figure: the datasheet gives none) and 10 kΩ across it (its losses, the kit's figure: they bound a bare coil's kick to about I·R, 0.7 kV), and an armature with hysteresis that pulls in at 75 % of 5 V (53.6 mA) and lets go under 10 % (7.1 mA), changing between time steps 5 ms (pull in) or 2 ms (let go) after its current crossed the threshold (the kit's travel, within the datasheet's 10 ms and 5 ms); contact 0.1 Ω closed, 100 MΩ open (Songle SRD datasheet); stresses: the coil's drive I·R over 6 V, a contact over 10 A, the kick (a coil cut off with nothing across it reversed past 5 V) | 71 mA at 5 V; operate time τ·ln(I∞ / (I∞ − Ipull)) + 5 ms; held between the thresholds; the kick with no diode, about 1 V with a 1N4007 |
| DC motor (RE-140RA) | V = R·I + L·dI/dt + k·ω and J·dω/dt = k·I − b·ω − T_load as MNA elements: a resistor, an inductor and an ideal gyrator whose other side is the shaft, a node whose voltage is ω, with J as a capacitor and b as a conductance to ground and the load as a brake (a torque against the turning, tanh of ω over 1 rad/s); R, k and b from the datasheet's no-load point and stall current at the nominal voltage (RE-140RA-12240: 7.69 Ω, 5.20 mV·s/rad, 0.518 µN·m·s), J 1 g·cm² and L 1 mH the kit's figures (Mabuchi RE-140RA datasheet); stresses: voltage over the top of its range, a stall (held still by its load) over its maximum-efficiency current | 4800 r/min and 50 mA free at 3 V, 0.39 A stalled; the start against the two-pole solution solved apart, τ = J·R / (k² + R·b) ≈ 25 ms |
| LM35 | a behavioural source: 10 mV/°C · T (never under 0 V) behind 0.4 Ω (load regulation 0.4 mV/mA) while +VS leaves it 1.5 V (the kit's own figure), 56 µA of its own from +VS (TI SNIS159H); stresses: supply over 30 V or reversed, output over 10 mA; notes: supply under 4 V, a temperature its grade does not read | 250 mV at 25 °C within ±1.5 °C (LM35DZ); 56 µA; 0.4 mV at 1 mA |
| MOSFET | square law, smooth turn-on, k from Rds(on) | square law solved apart, Rds(on) |
| BJT | Ebers–Moll, constant β; TIP120 as a Darlington with its two resistors | Ebers–Moll solved apart; hFE ≥ 1000 |
| bench supply, battery | ideal source, optional limit; battery: emf from format, chemistry, cells and charge, behind its internal resistance | short circuit, Ohm's law with internal resistance |

Any model field can be overridden per part with `"model": { … }` (for example the forward
voltage of an LED measured on the bench).

## Not yet

Chips other than the 555, the op-amps and the LM393 (logic, optocouplers, the LM386, the ULN arrays) are left unconnected and reported, and so is the DESPI-C02 adapter; a microcontroller board runs its program (`"program"`, with PWM and `tone`; [microcontrollers.md](microcontrollers.md)). Op-amps have no bandwidth or slew rate yet: a fast signal comes out as if the chip were ideal (a relaxation oscillator with positive feedback runs: Newton stops at the edges of the linear range at most twice per solve, so it switches rails; an LM358 one with 47 kΩ and 10 nF runs at about 920 Hz, the textbook formula's 968 Hz with ideal rails). The 555 has no paths in the conductor view yet: its current shows at its pins and strips. Events at a time are for a run (`--press`, `--at`), not for `--transient`; no self-heating, no battery discharge over
time (`charge` is fixed for a run). Animation (stage 3) will read these same results.
