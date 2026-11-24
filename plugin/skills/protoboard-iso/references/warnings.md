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

## A rhythm faster than a run's steps

A run's steps are at least its length over 20 000 (a 555 at 300 Hz in a run of 2 s: 100 µs, three
dozen a period). The `Behaviour` line and `simulate --run` measure such a rhythm again in a shorter
run whose steps follow it, and a run's line names it (`measured in the first 200 ms in steps of
10 µs`). A figure marked "about" saw fewer than five periods there: pass it on as approximate. One
with no frequency (`changes faster than this run's steps follow`) comes with a note saying how short
a `--run` measures it.

```json
{ "recipe": "555-astable", "values": { "C1": "220n" } }
```

```text
Behaviour, first 2 s from everything discharged, as the page starts (simulated, a model): D1 305 Hz, on 51 % of the time
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
  ⚠ warning: U2: its input SRCLR is left open; the kit takes it as low: the register is held clear, so the outputs never light. A real CMOS input left open floats: it may read either level, or change by itself (undefined); the kit's low is a choice. Wire it to GND or to the supply, as the circuit needs.
```

## A 3.3 V pin on a 5 V logic chip

An ESP32's pins give 3.3 V; a 74HC595 or a CD4017 fed 5 V is guaranteed to read high only from 3.5 V.
The kit reads 3.3 V as high (a real chip switches near half its supply), and each such input is a ⚠:
the datasheet does not guarantee it. Feed the chip from the board's `3V3`, or use a level shifter.

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
  ⚠ warning: U2: its input SER gets 3.3 V from a board's pin, between the 1.5 V and 3.49 V the datasheet guarantees as low and high. The kit reads it as high here (a real chip switches near half its supply), but the datasheet does not guarantee it: a 3.3 V pin into a chip fed 5 V. Feed the chip from the board's 3.3 V, or use a level shifter.
```

## A board on USB past what the port gives

A board on USB gives at most 500 mA in all (a USB 2.0 port; an UNO's resettable fuse too), and an
UNO's `3V3` pin at most the 150 mA of its regulator. Past it, a ⚠ on its USB pin says what happens;
the kit proposes no resistor in the supply for it. Feed the load from its own supply (a battery, a
bench supply) and keep the board's ground joined to it.

```json
{
  "parts": [
    { "id": "U1", "part": "UNO", "program": "void setup() {\n  pinMode(8, OUTPUT);\n  digitalWrite(8, HIGH);\n}\n\nvoid loop() {\n}" },
    { "id": "R1", "type": "resistor", "value": "1k" },
    { "id": "Q1", "part": "TIP120" },
    { "id": "R2", "type": "resistor", "value": "8.2", "power": "10" }
  ],
  "nets": [["U1.D8", "R1.1"], ["R1.2", "Q1.B"], ["U1.5V", "R2.1"], ["R2.2", "Q1.C"], ["Q1.E", "U1.GND"]]
}
```

```text
  ⚠ warning: U1.5V gives 542 mA from USB, more than the 500 mA a USB port gives: the board's 500 mA resettable fuse opens, and the board switches off until it cools (the computer's port may shut down first).
The kit has no computed fix for this.
```

## A chip fed less than its signals

A 74HC595 or a CD4017 fed 3.3 V and driven by an UNO's 5 V pins: every input the board drives high
is a ⚠ (the clock that `shiftOut` pulses too), and the line says the chip is fed less than the
signal that drives it. With a rail at the signals' voltage in the circuit, the fix feeds the chip
from it (`resupply`); `kit layout <folder> --fix` (connector: `fix: true`) applies it.

```json
{
  "parts": [
    { "id": "U1", "part": "UNO", "program": "int n = 0;\nvoid setup() { pinMode(11, OUTPUT); pinMode(12, OUTPUT); pinMode(8, OUTPUT); }\nvoid loop() { digitalWrite(8, LOW); shiftOut(11, 12, MSBFIRST, n); digitalWrite(8, HIGH); n = (n + 1) % 256; delay(100); }" },
    { "id": "U2", "part": "74HC595" },
    { "id": "R1", "type": "resistor", "value": "1k" },
    { "id": "D1", "type": "led", "color": "red" }
  ],
  "nets": [["U1.3V3", "U2.VCC"], ["U1.GND", "U2.GND", "U2.OE", "D1.K"], ["U1.D11", "U2.SER"], ["U1.D12", "U2.SRCLK"], ["U1.D8", "U2.RCLK"], ["U2.QA", "R1.1"], ["R1.2", "D1.A"], ["U1.5V", "U2.SRCLR"]]
}
```

```text
  ⚠ warning: U2.SRCLK has 4.99 V on it, more than its maximum 3.8 V: it can be damaged. The chip is fed 3.3 V, less than the signal that drives it: feed it from the signal's voltage, or drive it with 3.3 V signals, with D12 high.
To fix it: feed U2 from U1.5V (4.99 V, the voltage of the signals that drive it): move its VCC there; that clears every hazard above.
```

Then `kit layout <folder> --fix` prints:

```text fix
Applied the fix: U2 fed from U1.5V (its VCC moved there).
```

## A serial line that carries no data

A board's RX reads another board's TX only when the TX's high and low reach it as a high and a low
for it, through the wire or the resistors between (a 1 kΩ over 2 kΩ divider from an UNO's 5 V to an
ESP32's 3.3 V does). When the path does not, a ⚠ says so, and no byte arrives in a run: the
receiving sketch prints nothing of it. Tell the user, with the path the line proposes.

```json
{
  "parts": [
    { "id": "U1", "part": "UNO", "program": "void setup() {\n  Serial.begin(9600);\n}\n\nvoid loop() {\n  Serial.println(24.9, 1);\n  delay(1000);\n}" },
    { "id": "U2", "part": "ESP32-DEVKIT", "program": "void setup() {\n  Serial.begin(115200);\n  Serial2.begin(9600, SERIAL_8N1, 16, 17);\n}\n\nvoid loop() {\n  if (Serial2.available()) {\n    String line = Serial2.readStringUntil('\\n');\n    Serial.println(line);\n  }\n}" },
    { "id": "R1", "type": "resistor", "value": "10k" },
    { "id": "R2", "type": "resistor", "value": "1k" }
  ],
  "nets": [["U1.GND", "U2.GND", "R2.2"], ["U1.D1", "R1.1"], ["R1.2", "U2.RX2", "R2.1"]]
}
```

```text
  ⚠ warning: U2: Serial2 reads its RX pin RX2, which U1's TX reaches through the circuit at 453 mV when it idles high and 0 V when it sends a 0: this board reads above 2.47 V as high and below 825 mV as low, so the line cannot carry data and no byte arrives. Change the path (a divider of about 1 kΩ over 2 kΩ from 5 V to 3.3 V, or a direct wire between boards of the same voltage).
```

A sketch that reads `Serial` with nothing typed to it is a note, not a ⚠: type to it with
`--serial` ([run-it.md](run-it.md)).

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
