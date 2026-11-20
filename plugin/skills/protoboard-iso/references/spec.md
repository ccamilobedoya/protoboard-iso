# `layout` from parts and nets

Describe the circuit; the kit places every part, adds the jumpers, checks it and writes the page.
Write the spec to a file and run `kit layout circuits/<name> spec.json` (with the connector's
tools: `layout` with the same fields and a `target`):

```json
{
  "target": "transistor-switch",
  "parts": [
    { "id": "BT1", "type": "battery", "format": "AA", "cells": 4 },
    { "id": "SW1", "type": "button" },
    { "id": "R1", "type": "resistor", "value": "10k" },
    { "id": "Q1", "part": "2N2222A" },
    { "id": "R2", "type": "resistor", "value": "330" },
    { "id": "D1", "part": "LED", "color": "red" }
  ],
  "nets": [
    ["BT1.+", "T+"], ["SW1.1", "T+"], ["SW1.3", "R1.1"], ["R1.2", "Q1.B"],
    ["R2.1", "T+"], ["R2.2", "D1.A"], ["D1.K", "Q1.C"],
    { "pins": ["Q1.E", "BT1.-", "T-"], "color": "black" }
  ],
  "clearance": 3,
  "lang": "es"
}
```

## Parts

No holes, in signal order. A part number, module or alias is enough (`"7805"`, `"KCD1"`, `"UNO"`,
`"ESP32-DEVKIT"`, `"resistencia"`); otherwise a `type` with its fields. No need to look them up
first: unknown names come back with the closest ones. `kit catalog` lists every part type grouped
by family with its pins and part numbers, plus modules and boards; `kit catalog <name>` one entry's
fields.

- A **battery** the circuit uses ("4 × AA") is a part:
  `{"id": "BT1", "type": "battery", "format": "AA", "cells": 4}`, with `BT1.+` and `BT1.-` in the
  nets.
- A **microcontroller board** (`ESP32-DEVKIT`, `ESP32-C3-SUPERMINI`, `UNO`) is powered by USB (no
  supply needed) and takes each pin's state for the simulation:
  `{"id": "U1", "part": "ESP32-DEVKIT", "io": {"D13": "high", "D27": "input_pullup"}}`, or runs a
  program: `"program": "blink.ino"` (the Arduino sketch as uploaded, a file **in the circuit's
  folder, beside `circuit.json`**: `circuits/<name>/blink.ino`, written there before `layout`;
  anywhere else it is not read, and the answer says where the kit looked) or the sketch's text. `setup()`, `loop()`, `pinMode`, `digitalWrite`, `digitalRead`, `analogRead`,
  `analogWrite`/`ledcWrite` (PWM), `tone`, `delay`, `millis`, `Serial.println` run in simulated
  time, and the page runs them in real time. A function the kit does not know (`shiftOut`, a
  library's) is a ⚠ under "The kit cannot confirm these work": the program runs only as far as the
  kit can follow. Check what it does with `kit simulate <folder> --run <s>` ([run-it.md](run-it.md)).
- A part the simulator only draws (`kit catalog` says "Not simulated": a 74HC595, an LM386, a
  ULN2003…) is built and wired, and the answer ends `WARNINGS`: nothing about it is checked. What
  every part takes: [parts.md](parts.md).

## Nets

Each one the pins it joins (`"R1.2"`) and rails (`"T+"`, `"T-"`, `"B+"`, `"B-"`), as a list or
`{pins, color}`. Pin names as people write them work: `A`/`K` or `anode`/`cathode`, `VIN`, `VOUT`,
`DISCH`, `THRESHOLD`, `VDD`, `GPIO4` (the DevKit's `D4`), `3.3V`. A ground net without a rail goes
to a − rail by itself.

## Supplies and the rest

- **supplies**: a bench supply on the rails (`voltage`, `currentLimit`; `positive` may name a pin;
  a negative `voltage` is the same supply reversed, and a part fed backwards is a ⚠ hazard);
  `"kind": "generator"` for a signal generator. Not needed with a battery part.
- Also `board` (`auto` by default: it grows as needed), `clearance` (mm; 3 for lessons), `title`,
  `netLabels`, `page`, `lang`; `--check` (`check_only: true`) only checks the spec.

## Change it later

Call `layout` on the same folder with the whole new `nets` (start from the `spec` that the
circuit's `circuit.json` keeps; `get_circuit` with the connector) and, if parts or supplies change,
the **full** `parts` list (a call with only the changed parts fails with `FIX_SPEC`: the nets name
parts it lacks) and `supplies` again; `--expect-revision n` (`expect_revision`) refuses it when
the circuit is no longer at revision n. A part keeps its holes only when every pin is still where its
new net wants it; otherwise it is placed again. `kit undo <folder>` brings the old layout back.
