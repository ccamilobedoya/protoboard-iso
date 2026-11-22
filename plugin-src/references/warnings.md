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

## A mistake in a board's program

A mistake a real board would show (it compiles and misbehaves, or it does not compile) is a ⚠ that
names its line, and the program goes on as a board would: a pin the board does not have, a write to
a pin never set `OUTPUT`, `analogWrite` on a pin with no PWM, a division by zero, an array read past
its end, a negative `delay`, a name never declared, a `{` never closed, a library the kit does not
have (its calls do nothing). Tell the user the line and the fix the ⚠ gives; never call it a limit of
the kit.

```json
{
  "parts": [
    { "id": "U1", "part": "UNO", "program": "void setup() {\n}\n\nvoid loop() {\n  digitalWrite(13, HIGH);\n  delay(500);\n}" },
    { "id": "R1", "type": "resistor", "value": "220" },
    { "id": "D1", "type": "led", "color": "red" }
  ],
  "nets": [["U1.D13", "R1.1"], ["R1.2", "D1.A"], ["D1.K", "U1.GND"]]
}
```

```text
  ⚠ warning: U1: digitalWrite(D13, HIGH) at line 5 writes to a pin never set as OUTPUT. On an UNO that only turns the pin's pull-up on (about 35 kΩ to 5 V), as the kit models it: an LED on it barely glows. Add pinMode(D13, OUTPUT) in setup().
```

`shiftOut` and `shiftIn` run. A two-dimensional array (`int a[2][3]`) is refused by its line and
the program does not run: write it as one list (`a[row * 3 + col]`). What else a sketch may use:
[sketch.md](sketch.md).

## A chip with no supply

A chip whose supply pins are left out of the nets, or both on one net, cannot work: a ⚠, and what
it drives never comes on.

```json
{
  "parts": [
    { "id": "BT1", "type": "battery", "format": "9V" },
    { "id": "U1", "part": "LM358" },
    { "id": "R1", "type": "resistor", "value": "1k" },
    { "id": "D1", "type": "led", "color": "red" }
  ],
  "nets": [["BT1.+", "U1.IN1+"], ["U1.OUT1", "R1.1"], ["R1.2", "D1.A"], ["D1.K", "BT1.-", "U1.IN1-"]]
}
```

```text
  ⚠ warning: U1 has no supply: its supply pins VCC and GND are wired to nothing, so it cannot work. Wire each to its side of the supply.
```

## A logic input left open

An input of a 74HC595 or a CD4017 left out of the nets is undefined on a real chip; the kit reads it
low and says so. Tie it as the chip needs ([chips.md](chips.md)): here the 74HC595's `SRCLR`, which
holds the register clear, so its LED never lights.

```json
{
  "parts": [
    { "id": "U1", "part": "UNO", "program": "void setup() {\n  pinMode(11, OUTPUT);\n  pinMode(12, OUTPUT);\n  pinMode(8, OUTPUT);\n  digitalWrite(8, LOW);\n  shiftOut(11, 12, MSBFIRST, 1);\n  digitalWrite(8, HIGH);\n}\n\nvoid loop() {\n}" },
    { "id": "U2", "part": "74HC595" },
    { "id": "R1", "type": "resistor", "value": "330" },
    { "id": "D1", "type": "led", "color": "red" }
  ],
  "nets": [
    ["U1.5V", "U2.VCC"], ["U1.GND", "U2.GND", "U2.OE", "D1.K"],
    ["U1.D11", "U2.SER"], ["U1.D12", "U2.SRCLK"], ["U1.D8", "U2.RCLK"],
    ["U2.QA", "R1.1"], ["R1.2", "D1.A"]
  ]
}
```

```text
  ⚠ warning: U2: its input SRCLR is left open. On a real CMOS chip an open input is undefined (it picks up noise and may change by itself); the kit takes it as low (0 V). Wire it to GND or to the supply, as the circuit needs.
```

## A 3.3 V pin on a 5 V logic chip

An ESP32's pins give 3.3 V; a 74HC595 or a CD4017 fed 5 V needs more to read high. Each such input is
a ⚠: feed the chip from the board's `3V3`, or use a level shifter.

```json
{
  "parts": [
    { "id": "U1", "part": "ESP32-DEVKIT", "program": "void setup() {\n  pinMode(23, OUTPUT);\n  pinMode(18, OUTPUT);\n  pinMode(5, OUTPUT);\n  digitalWrite(5, LOW);\n  shiftOut(23, 18, MSBFIRST, 1);\n  digitalWrite(5, HIGH);\n}\n\nvoid loop() {\n}" },
    { "id": "U2", "part": "74HC595" },
    { "id": "R1", "type": "resistor", "value": "330" },
    { "id": "D1", "type": "led", "color": "red" }
  ],
  "nets": [
    ["U1.VIN", "U2.VCC", "U2.SRCLR"], ["U1.GND", "U2.GND", "U2.OE", "D1.K"],
    ["U1.D23", "U2.SER"], ["U1.D18", "U2.SRCLK"], ["U1.D5", "U2.RCLK"],
    ["U2.QA", "R1.1"], ["R1.2", "D1.A"]
  ]
}
```

```text
  ⚠ warning: U2: its input SER sits at 3.3 V, between the 1.5 V under which it reads low and the 3.49 V over which it reads high: the chip may read either level (the kit keeps the one it had). A 3.3 V pin on a chip fed 5 V does not reach its high level: feed the chip from the board's 3.3 V, or use a level shifter.
```

## A damaged history

Not a ⚠ but a refusal: when the circuit's `history.jsonl` has a line the kit cannot read, `apply`
saves nothing (exit 1) and says the circuit is intact. Tell the user; with their agreement,
`--new-history` (connector: `new_history: true`) keeps the old file as `history.jsonl.damaged` and
starts again from the circuit as it is (undo then goes back no further).

```bash
kit apply circuits/led --ops '[{"op":"set","part":"R1","value":"470"}]'
```

```text history
  error: The history file circuits/led/history.jsonl is damaged at line 2: it is not an entry the kit can read, so undo and history cannot go on from it and nothing was saved. The circuit itself (circuit.json) is intact. To go on, start a new history from the circuit as it is with --new-history (the damaged file is kept beside it, ending .damaged), or repair that line.
```
