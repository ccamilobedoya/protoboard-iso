---
name: protoboard-iso
description: Lay out, draw and simulate breadboard circuits. From a list of parts and the connections between them, the kit places every part on a solderless breadboard (real sizes, resistor colour bands, LEDs, capacitors, transistors, regulators, chips, development boards, batteries), adds the jumpers, checks it, draws it as an isometric SVG, and writes an embeddable page with a live simulation. Use when explaining or planning a circuit on a breadboard, when someone asks to "see", "draw" or "build" a breadboard circuit, or when preparing a wiring guide for an electronics lesson.
---

# protoboard-iso

You describe **what is connected**; the kit decides **where it goes**, draws it and checks it.
Never compute holes, spans, colour codes, voltages or currents yourself, and never hand-write SVG
or edit a circuit file: ask the tools. If something cannot be expressed, extend the kit
(`docs/en/adding-parts.md`), never patch the output.

Use the **MCP tools** (`protoboard-iso` server) when they are connected; otherwise the CLI,
`node <skill>/bin/protoboard-iso.js <command>`, with the same names (Node.js ≥ 22, no npm
dependencies). Setup: `docs/en/mcp.md`.

## What do you want to do?

| Task | Tool |
|---|---|
| A **usual lesson circuit** (LED, divider, transistor switch, 555, regulator…) | `layout` with a **recipe** and only the values that change (section 0) |
| Another **new circuit** | `layout` with the parts and the nets (section 1) |
| **Other connections or parts** in a circuit made by `layout` (`get_circuit` shows a `spec`) | `layout` again on the same target, with the new nets or parts |
| A **value, a description**, a small fix, or a circuit made by hand | `apply_ops` (operations, below) |
| Is it right? | `review` (the definition of done), `netlist`, `simulate` |
| Show it | the page `out/<name>.html` (written on every change), `render` |

## 0. Recipes first

A recipe is a lesson circuit the kit already knows: proven parts, nets and supply, laid out ready
(`STATUS: DONE`) in one call. Give its name and only what changes, by id:

```json
{ "target": "switch", "recipe": "npn-switch", "values": { "R1": "470", "D1": "green", "V1": 9 } }
```

| Recipe | What it is |
|---|---|
| `led-resistor` | LED with its series resistor |
| `divider` | two resistors, the output where they meet |
| `npn-switch` | button → base resistor → NPN transistor switching an LED |
| `potentiometer-led` | potentiometer's wiper dimming an LED |
| `mosfet-switch` | button → logic-level MOSFET switching an LED, with a gate pull-down |
| `button-pullup`, `button-pulldown` | button with a pull-up / pull-down, an LED showing the output |
| `rc-square` | RC charged by a square wave (see τ against the period) |
| `555-astable` | NE555 blinking an LED |
| `regulator-7805`, `regulator-ams1117` | linear regulator with an LED on its output |
| `bridge-rectifier` | bridge, filter capacitor and an LED, from a sine on the top rails |
| `zener-regulator` | Zener and its series resistor holding a load |
| `esp32-led`, `esp32-button` | ESP32 DevKit blinking an LED (D13) / reading a button (D27), with their program |
| `uno-blink`, `uno-button`, `uno-pot-pwm` | Arduino UNO: blink, a button lights an LED, a potentiometer dims an LED (ADC, PWM) |
| `c3-blink`, `c3-pot-pwm` | ESP32-C3 SuperMini: blink, a potentiometer dims an LED (ADC, PWM) |
| `opamp-comparator`, `lm393-comparator` | potentiometer against a reference, an LED on the output (LM358; LM393 open collector) |
| `opamp-follower` | LM358 copying a potentiometer and driving an LED |
| `opamp-noninverting`, `opamp-inverting` | LM358 amplifiers, gain from R1 and R2, a sine from the generator |

- **values**: the main field by id (`"R1": "470"`, `"D1": "green"`, `"Q1": "BC547"`, `"V1": 9`) or
  some fields (`"R1": {"value": "470", "tolerance": "1%"}`). Only the ids a recipe lists can change,
  some within choices or a range: `catalog` lists every recipe with its values and defaults,
  `catalog` with the recipe's name shows its parts, nets and limits. A wrong value is a `FIX_SPEC`
  that says what is allowed.
- `title`, `board`, `clearance`, `netLabels`, `page` and `lang` may be given beside the recipe. Never
  `parts` or `nets`: to add to a recipe circuit, call `layout` on it again with the full parts and
  nets (`get_circuit` shows them).
- **Change a value later**: `layout` on the same target with the recipe and the new values; every
  part keeps its holes.

## 1. `layout`: describe it, the kit places it

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

- **parts**: no holes, in signal order. A part number, module or alias is enough (`"7805"`,
  `"KCD1"`, `"UNO"`, `"ESP32-DEVKIT"`, `"resistencia"`); otherwise a `type` with its fields. No need
  to look them up first: unknown names come back with the closest ones. A battery the circuit uses
  ("4 × AA") is a part: `{"id": "BT1", "type": "battery", "format": "AA", "cells": 4}`, with `BT1.+`
  and `BT1.-` in the nets. A microcontroller board (`ESP32-DEVKIT`, `ESP32-C3-SUPERMINI`, `UNO`) is
  powered by USB (no supply needed) and takes each pin's state for the simulation:
  `{"id": "U1", "part": "ESP32-DEVKIT", "io": {"D13": "high", "D27": "input_pullup"}}`, or runs a
  program: `"program": "blink.ino"` (a file beside the circuit, the Arduino sketch as uploaded) or the
  sketch's text; `setup()`, `loop()`, `pinMode`, `digitalWrite`, `digitalRead`, `analogRead`,
  `analogWrite`/`ledcWrite` (PWM), `tone`, `delay`, `millis`, `Serial.println` run in simulated time, and the page runs them in real time
  (`docs/en/microcontrollers.md`).
- **nets**: each one the pins it joins (`"R1.2"`) and rails (`"T+"`, `"T-"`, `"B+"`, `"B-"`), as a
  list or `{pins, color}`. Pin names as people write them work: `A`/`K` or `anode`/`cathode`,
  `VIN`, `VOUT`, `DISCH`, `THRESHOLD`, `VDD`, `GPIO4` (the DevKit's `D4`), `3.3V`. A ground net
  without a rail goes to a − rail by itself.
- **supplies**: a bench supply on the rails (`voltage`, `currentLimit`; `positive` may name a pin);
  `"kind": "generator"` for a signal generator. Not needed with a battery part.
- Also `board` (`auto` by default: it grows as needed), `clearance` (mm; 3 for lessons), `title`,
  `netLabels`, `page`, `lang`; `check_only: true` only checks the spec.

**Read the last line.** Every answer ends in `STATUS:`

| `STATUS:` | Means | Do |
|---|---|---|
| `DONE` | every net is there and the lesson review approves | nothing more (descriptions, if wanted, with `apply_ops`) |
| `CHANGES` | created, but the items marked ✖ are open | fix only those with section 2, then `review` |
| `FIX_SPEC` | nothing created: the spec has mistakes | fix every ✖ (each lists what it accepts) and call again |
| `SPEC_OK` | `check_only`: the spec is consistent | call again without it |

**Change it later** by calling `layout` on the same target with only what changes: the whole new
`nets` (start from `spec.nets`), `parts` only if parts change, and `expect_revision`. Every part keeps
its holes when it still fits, the circuit keeps the new nets, and `undo` brings the old layout back.

## 2. Operations: small, checked changes

```text
history / inspect          what happened, the drawing in numbers
query / suggest            what is where; where a part fits (never compute holes)
apply_ops dry_run: true    what the change fixes and what it breaks
apply_ops expect_revision, author, note      → a new revision
review                     until APPROVED · undo when needed
```

- `suggest` gives placements ready to apply: `between` (groups in pin order) or `connect`
  (`{"pin": group}`), groups named by a placed pin (`"R1.2"`); `parts` places a chain in one call;
  `profile: "lesson"` leaves out what review would block. When nothing fits it says why (`reasons`):
  act on the reason, never repeat the call.
- Operations: `add`, `remove`, `move`, `set`, `rename`, `circuit` (`schema/ops.schema.json`).
  `set` changes a field (`{"op": "set", "part": "R1", "value": "4k7"}`); `circuit` the top-level
  ones (`supplies`, `page`, `clearance`, `lang`…).
- A diff that introduces an error or a warning is not applied: find another placement.

## 3. Check it

- **`review`** is the definition of done: APPROVED or CHANGES, profile `lesson` (teaching layouts)
  or `draft` (only errors and warnings). Each blocking item names its parts and views. A circuit
  made by `layout` also gets its nets checked against what was asked.
- **`netlist`**: every net with its pins, one call to compare with what the circuit must do.
- **`simulate`** (a model, not a measurement): node voltages and part currents, DC or transient;
  warnings for shorts, overloads and floating groups. It needs a source (a supply or a battery
  part). **Never show a value a learner is asked to predict.**

## 4. Show it

- The page **`out/<name>.html`** is rewritten on every change under the same name: two views,
  zoom, labels, tap a part for its card. With a source it runs the simulation by itself (values of
  the tapped part, oscilloscope, lit LEDs, a Current button). While a learner must predict a value:
  `"page": {"simulation": false}`. Embedding: `docs/en/embedding.md`.
- **`inspect`** answers placement, visibility and label questions in numbers; look at a picture
  (`render` with `png_width`, small) only to judge style. `render` options: `view: "back"`,
  `fit: "parts"` (close-up), `annotate: "all"` (holes, groups), `focus: [ids]`, `sim: true`.

## The breadboard

Holes `a1`…`j63` (row letter + column); rails `T-`, `T+` (next to row j) and `B+`, `B-` (next to
row a) plus a column (`T+9`). Rows a–e of one column are connected, f–j too; each rail is one
connection. Buttons and DIP chips straddle the centre channel. `layout` and `suggest` know all this;
`catalog` lists every part type with its pins, part numbers, modules and boards (`name` for one
entry's fields and an example).

To write a circuit file by hand (exact positions, for a lesson about where things go): start from
the closest file in `examples/`, then `check` and `review` it. Format, every type and its fields:
`docs/en/circuit-format.md`.

## Languages

Everything the kit writes (messages, drawing labels, the page and its cards) comes in English or
Spanish. In order of priority: the call's `lang` (`--lang es` in the CLI); the circuit's own
`"lang": "es"` (pages rewritten after each change stay in it); `PROTOBOARD_LANG`, else English.
Texts in the circuit (`title`, each part's `description`) are one string, or one per language
`{ "en": "…", "es": "…" }`. A part's `description` says how it is used in this circuit and shows
in its card; leave it out when the learner should work it out.

## CLI

```bash
node bin/protoboard-iso.js layout <target> --recipe npn-switch [--values '{"R1":"470"}']
node bin/protoboard-iso.js layout <target> [spec.json] [--check] [--expect-revision n]
node bin/protoboard-iso.js apply <target> --ops '<json>' --dry-run      # then --expect-revision n
node bin/protoboard-iso.js review | netlist | inspect | history | undo <target>
node bin/protoboard-iso.js suggest <target> --part '<json>' --between <group>,<group>
node bin/protoboard-iso.js simulate <target> [--transient stop,step]
node bin/protoboard-iso.js render <target> -o out.svg [--view back] [--fit parts]
node bin/protoboard-iso.js page <target> · parts [name]   # parts: every type, its pins and part numbers, and the recipes
```

A target is a circuit folder (`circuit.json`, `history.jsonl`, `out/`) or a circuit file.
Exit codes: 0 fine (`layout`: `DONE`), 1 errors or refused, 2 review `CHANGES`.
