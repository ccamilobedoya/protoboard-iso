# What a ⚠, a `Note:` and an "about" mean

`layout` ends `STATUS: WARNINGS` when it built the circuit but has something to tell: a part that
would be damaged (a hazard, with `To fix it` or "no computed fix") or something the kit cannot
confirm works (a doubt). Tell each one to the user, in plain words, before any sentence that says the
circuit works; keep the circuit as asked unless the user wants a change. Each case below is a spec
and lines its `layout` prints (`test/skill-warnings.test.js` runs them).

## An output that never comes on

An LED, a buzzer, a relay or a motor that is on in no state the kit checked: whatever should turn it
on does not reach it (a relay fed straight from a sensor's output, a part in backwards). It is a ⚠ to
tell, not a detail: the circuit is built but does not do what it is for. The line starts
`<part> never comes on:` (a relay: `never pulls in:`); an example is the buzzer below.

## A coil with no diode across it

A relay's coil or a motor switched by a transistor or a pin with no diode across it: when the switch
turns off, the coil drives that end far past the supply. A ⚠ to tell, with the diode the line names.

```json
{
  "parts": [
    { "id": "BT1", "type": "battery", "format": "9V" },
    { "id": "SW1", "type": "button" },
    { "id": "R1", "type": "resistor", "value": "1k" },
    { "id": "Q1", "part": "2N2222A" },
    { "id": "K1", "part": "SRD-05VDC-SL-C" }
  ],
  "nets": [["BT1.+", "SW1.1", "K1.A1"], ["SW1.3", "R1.1"], ["R1.2", "Q1.B"], ["Q1.C", "K1.A2"], ["Q1.E", "BT1.-"]]
}
```

```text
  ⚠ warning: K1's coil is switched by Q1 with no diode across it: when Q1 turns off, the coil's current drives that end far past the supply, and Q1 can be damaged. A diode across the coil (a 1N4007, its cathode to the supply side) takes that current.
```

## A part in backwards: turn it round

The fix of a part wired the wrong way (a buzzer, a regulator, an LED) is to turn it round, or to
swap the supply's leads; never a resistor in series. `kit layout <folder> --fix` (connector:
`fix: true`) does it as one change and says so. A buzzer in backwards is also silent, so it is an
output that never comes on.

```json
{
  "parts": [
    { "id": "BT1", "type": "battery", "format": "AA", "cells": 3 },
    { "id": "SW1", "type": "button" },
    { "id": "BZ1", "part": "TMB12A05" }
  ],
  "nets": [["BT1.+", "SW1.1"], ["SW1.3", "BZ1.2"], ["BZ1.1", "BT1.-"]]
}
```

```text
  ⚠ warning: BZ1 has 4.5 V in reverse, more than the 1 V it withstands: it can be damaged, with SW1 pressed.
To fix it: turn BZ1 round (swap its 1 and 2); that clears every hazard above.
```

and, under the doubts, a ⚠ that starts `BZ1 never comes on:`.

Then `kit layout <folder> --fix` prints:

```text fix
Applied the fix: turned BZ1 round (its 1 and 2 swapped).
```

## A supply written negative

A supply written with a negative voltage is the same supply the other way round. The answer has a
`Note:` line that says which rail is positive in fact: pass it on (it is not one of the `· note:`
lines, which are left out of the reply).

```json
{
  "supplies": [{ "id": "V1", "voltage": -5, "positive": "T+", "negative": "T-" }],
  "parts": [{ "id": "R1", "type": "resistor", "value": "1k" }, { "id": "D1", "type": "led", "color": "red" }],
  "nets": [["T-", "R1.1"], ["R1.2", "D1.A"], ["D1.K", "T+"]]
}
```

```text
Note: V1 is written with a negative voltage (-5 V), so the rail named T+ is the lower one: T- is the positive rail in fact.
```

## A figure marked "about"

The `Behaviour` line says "about" when its run saw too few whole periods to measure a rhythm well.
Pass the figure on as approximate ("about 310 Hz"), never as exact; `kit simulate <folder> --run 1`
measures it over a longer run.

```json
{ "recipe": "555-astable", "values": { "C1": "220n" } }
```

```text
Behaviour, first 2 s from everything discharged, as the page starts (simulated, a model): D1 about 310 Hz, on about 51 % of the time
```

## A board's program

`shiftOut` and `shiftIn` run (a 74HC595 is drawn, not simulated, so what is behind it is a doubt). A
two-dimensional array (`int a[2][3]`) is refused by its line and the program does not run: write it
as one list (`a[row * 3 + col]`). What else a sketch may use: [sketch.md](sketch.md).
