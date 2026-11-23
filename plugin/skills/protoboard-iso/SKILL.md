---
name: protoboard-iso
description: Builds an electronics circuit on a solderless breadboard and gives the user a live, interactive page of it (real holes, wires, simulation, oscilloscope). Use it whenever someone wants to see, build, wire, connect or change a circuit, even if they never say "breadboard" - an LED with its resistor, a voltage divider, a transistor switch, a 555 timer, a regulator, a sensor, an Arduino UNO or ESP32 with its sketch - and for "how do I connect…?" questions about such parts. Úsala cuando alguien quiera ver, armar, cablear, conectar o cambiar un circuito electrónico, aunque no diga "protoboard" - un LED con su resistencia, un divisor de voltaje, un transistor, un 555, un regulador, un sensor, un Arduino o un ESP32 con su programa - y para preguntas de "¿cómo conecto…?". Not for theory questions with no circuit to build, nor for PCB or schematic design.
license: MIT
compatibility: Needs Node.js 22 or later where the skill's scripts run. No packages to install, no network.
---

# protoboard-iso

You say **what is connected**; the kit decides **where it goes**, draws it, checks it and simulates
it. Never draw a circuit yourself (no SVG, HTML or ASCII), never work out holes, colour bands,
voltages or currents yourself, and never build or wire something in prose instead of the kit: run
it and report what it says. A part the kit lacks is the exception (below).

## How to run it

The kit is [scripts/bin/protoboard-iso.js](scripts/bin/protoboard-iso.js) in this skill's folder;
`kit` below means
`node ${CLAUDE_SKILL_DIR}/scripts/bin/protoboard-iso.js`. If `CLAUDE_SKILL_DIR` is empty, use the
absolute path of the folder this file is in.

- With tools named `layout`, `apply_ops`, `review` of a **protoboard-iso** connector, use them
  instead, same names and arguments: the user sees the board; make no file.
- Otherwise run `kit` in a shell; once per conversation `node --version` (no Node 22+: say so,
  stop).
- Keep circuits in `circuits/<name>/`, in the folder for files handed to the user,
  else the working directory; a different circuit gets a new folder.
- Add `--lang es` when the user writes in Spanish (page, labels, messages).

## Build a circuit: one call

**A recipe first.** If the request is one of these, it is one call:

```bash
kit layout circuits/green-led --recipe led-resistor --values '{"V1": 9, "R1": "470", "D1": "green"}'
```

Give only the values the user asked for; a wanted result goes as a goal, `{"D1": {"current": "15mA"}}`,
and the kit picks the value. Recipes: led-resistor, divider, npn-switch,
potentiometer-led, mosfet-switch, button-pullup, button-pulldown, rc-square, 555-astable,
regulator-7805, regulator-ams1117, bridge-rectifier, zener-regulator, esp32-led, esp32-button,
opamp-comparator, lm393-comparator, opamp-follower, opamp-noninverting, opamp-inverting, uno-blink,
uno-button, uno-pot-pwm, c3-blink, c3-pot-pwm, uno-rgb-led, uno-seven-segment, slide-switch-leds,
tilt-alarm, lm35-uno, relay-npn, motor-npn, ldr-night-light, ldr-comparator, lm35-comparator,
ntc-follower, thermistor-uno, pir-lamp, pir-uno, touch-toggle-led, touch-uno, rain-alarm, soil-led,
light-switch-module, line-follower-uno, obstacle-buzzer, hall-counter-uno, encoder-uno,
encoder-dimmer-uno, laser-tripwire, laser-uno, uno-distance, esp32-distance, distance-alarm-uno,
hall-linear-uno, voltage-sensor-uno, clap-switch, uno-dht11, esp32-bme280, uno-bmp280-altitude.
What each one is: [references/recipes.md](references/recipes.md).

**Anything else:** write a spec file with the parts (no holes) and the nets, then
`kit layout circuits/<name> spec.json`:

```json
{
  "parts": [
    { "id": "BT1", "type": "battery", "format": "9V" },
    { "id": "R1", "type": "resistor", "value": "470" },
    { "id": "D1", "type": "led", "color": "red" }
  ],
  "nets": [["BT1.+", "R1.1"], ["R1.2", "D1.A"], ["D1.K", "BT1.-"]]
}
```

A part number or common name is enough (`"part": "2N2222A"`, `"UNO"`). A board's program is a
`.ino` file **in the circuit's folder, beside `circuit.json`** (`circuits/<name>/blink.ino`, written
before `layout`), named in `"program"`, written only with what [references/sketch.md](references/sketch.md)
lists. A part you have not used: `kit catalog <name>` first (its `Simulated:` line; "Not
simulated": nothing about it is checked). Spec details: [references/spec.md](references/spec.md);
each part's pins (which is +), fields and units:
[references/parts.md](references/parts.md); a 74HC595, 4017, ULN, PC817 or LM386:
[references/chips.md](references/chips.md).

## Read the last line

`layout` ends in `STATUS:`. Act on it:

| STATUS | Do |
|---|---|
| `DONE` | Checked, nothing to tell. Reply (below). |
| `WARNINGS` | Built. Each ⚠ is damage (with `To fix it` or "no computed fix") or something the kit cannot confirm works. Reply, telling each; never fix silently or refuse. Cases: [references/warnings.md](references/warnings.md). |
| `FIX_SPEC` | Nothing built. Fix exactly the ✖ lines and call again. "Too large for one board": split it into circuits. |
| `CHANGES` | Built, ✖ open (it tried other orders and changes already). Make the change a ✖ names next (not tried yet), else fix only those ([references/operations.md](references/operations.md)), then `kit review`. "stopped at its budget": `--budget` or a smaller circuit. A part that "found no place" is off the board: say so. |
| `SPEC_OK` | Only after `--check`: call again without it. |

**Stop rule.** At most two corrections per circuit; a correction is a call that saves (a `layout`
or `apply` without `--dry-run`), never a trial. If the second does not end `DONE` or `WARNINGS`,
stop: show the ✖ lines and ask. The same spec gives the same circuit: never repeat a call
unchanged. After `DONE`, run more only for a question the answer does not settle.

## Check what it does

Before you say a circuit with a program, a sensor or an oscillator does what was asked, run it
with the user's conditions and quote what it printed (Serial lines, each output's time on):
`kit simulate circuits/<name> --run 2 --env distance=10` (`--serial 1@0.5` types to a board); a
`warning:` it prints is a ⚠ to tell, even after `DONE` (power: averaged over the run). `Behaviour, first 2 s` is only 2 s: run longer
for a whole cycle. Options, examples: [references/run-it.md](references/run-it.md).

## Where the kit has no answer

**A part the kit lacks** ("the kit does not know …") is not a failure. Ask before building with the
nearest, Y: "The kit has no X. Shall I use
Y instead? It differs in …". With nobody to ask: say what the kit lacks and stop.

**"Fix it"** after `To fix it`: `kit layout <folder> --fix` (connector: `fix: true`), one change.
Only where the kit says it has none (a fixed sentence, a `STATUS` it cannot get past, a part it
lacks) use your own knowledge, and try it first with `layout … --dry-run` (connector:
`dry_run: true`); apply only what ends `DONE` (or the `WARNINGS` asked for). At
most three trials, the smallest change, no redesign unless asked:
[references/beyond-the-kit.md](references/beyond-the-kit.md).

## Reply

In the user's language, in this order, with only the lines the kit printed (Spanish names them
in Spanish):

1. What was built, with the kit's values, in one sentence.
2. With `WARNINGS`: every ⚠, plainly (which part, what happens or what the kit cannot confirm) and
   the `To fix it` line or that there is none, before any sentence that says the circuit works.
   A part you added to clear one: say what and why.
3. As printed: `Readings`, `Behaviour, first 2 s`, `Solved`, `Worth checking` (information: act
   only if asked); and what `simulate --run` showed for what was asked. A `Note:` line too; not the
   `· note:` lines (drawing, nets, model details: over a limit is a ⚠). "About" is approximate: say so.
4. The page: the `Page: <path>` file, handed over as written (never pasted or redrawn),
   again after every change. (With the connector's tools, skip this.)
5. With a board, the sketch in a code block, exactly as the `Program` block.
6. The `Can change` line, if printed, for a new circuit or when it differs. On the first circuit
   of the conversation only, add: "You can change a value, add or remove parts, ask
   about a part or how it is connected, or undo a change; tap a part in the page to see its card."

Three kinds of sentence, never mixed: what the kit says; what you added **and the kit confirmed**;
what it cannot check, marked "General knowledge, not from the kit:". From the `Checked` line, tell
what matters to the request. No closing offers, no wiring list in prose unless asked.

## Change it, ask about it

A value of a recipe: the same call with all the `--values`; other parts or nets: `layout` on the
same folder with the whole spec. One kind of part for another (a MOSFET for an NPN) needs other
parts around it: `--dry-run` first, and read its ⚠ before saving. Undo, history, the board (`double`), every
command and exit code: [references/board-and-cli.md](references/board-and-cli.md); operations
and checks: [references/operations.md](references/operations.md).
The kit is a teaching model, not a datasheet: say so when it comes up.
