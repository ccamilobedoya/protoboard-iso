---
name: protoboard-iso
description: Builds an electronics circuit on a solderless breadboard and gives the user a live, interactive page of it (real holes, wires, simulation, oscilloscope). Use it whenever someone wants to see, build, wire, connect or change a circuit, even if they never say "breadboard" - an LED with its resistor, a voltage divider, a transistor switch, a 555 timer, a regulator, a sensor, an Arduino UNO or ESP32 with its sketch - and for "how do I connect…?" questions about such parts. Úsala cuando alguien quiera ver, armar, cablear, conectar o cambiar un circuito electrónico, aunque no diga "protoboard" - un LED con su resistencia, un divisor de voltaje, un transistor, un 555, un regulador, un sensor, un Arduino o un ESP32 con su programa - y para preguntas de "¿cómo conecto…?". Not for theory questions with no circuit to build, nor for PCB or schematic design.
license: MIT
compatibility: Needs Node.js 22 or later where the skill's scripts run. No packages to install, no network.
---

# protoboard-iso

You say **what is connected**; the kit decides **where it goes**, draws it, checks it and simulates
it. Never draw a circuit yourself (no hand-made SVG, HTML or ASCII), never answer a request to build
or wire something with prose only, and never work out holes, colour bands, voltages or currents
yourself: run the kit and report what it says, and nothing from memory.

## How to run it

The kit is in this skill's folder, [scripts/bin/protoboard-iso.js](scripts/bin/protoboard-iso.js)
(plain Node.js, nothing to install). Below, `kit` means
`node ${CLAUDE_SKILL_DIR}/scripts/bin/protoboard-iso.js`.

- If tools named `layout`, `apply_ops`, `review` of a **protoboard-iso** connector are available,
  use them instead, with the same names and arguments: the user sees the board inside the
  conversation, and you must not make or send any file.
- Otherwise run `kit` in a shell. Once per conversation run `node --version`; without Node 22 or
  later, say so and stop.
- Keep every circuit in one folder you can write and hand files from (in Claude chat:
  `/mnt/user-data/outputs/circuits`; `circuits/` below), one subfolder per circuit, named for what it is
  (`green-led`, `uno-blink`). When the circuit becomes a different one (an LED alone, then a board
  driving it), use a new subfolder.
- Add `--lang es` when the user writes in Spanish (the page, the labels and the messages follow).

## Build a circuit: one call

**A recipe first.** If the request is one of these, it is one call and nothing to look up:

```bash
kit layout circuits/green-led --recipe led-resistor --values '{"V1": 9, "R1": "470", "D1": "green"}'
```

Give only the values the user asked for; a wanted result (a current, a frequency) goes as a goal,
`{"D1": {"current": "15mA"}}`, and the kit picks the value. Recipes: led-resistor, divider, npn-switch,
potentiometer-led, mosfet-switch, button-pullup, button-pulldown, rc-square, 555-astable,
regulator-7805, regulator-ams1117, bridge-rectifier, zener-regulator, esp32-led, esp32-button,
opamp-comparator, lm393-comparator, opamp-follower, opamp-noninverting, opamp-inverting, uno-blink,
uno-button, uno-pot-pwm, c3-blink, c3-pot-pwm, uno-rgb-led, uno-seven-segment, slide-switch-leds,
tilt-alarm, lm35-uno, relay-npn, motor-npn, ldr-night-light, ldr-comparator, lm35-comparator,
ntc-follower, thermistor-uno, pir-lamp, pir-uno, touch-toggle-led, touch-uno, rain-alarm, soil-led,
light-switch-module, line-follower-uno, obstacle-buzzer, hall-counter-uno, encoder-uno,
encoder-dimmer-uno, laser-tripwire, laser-uno, uno-distance, esp32-distance, distance-alarm-uno,
hall-linear-uno, voltage-sensor-uno, clap-switch, uno-dht11, esp32-bme280, uno-bmp280-altitude.
What each one is: [references/recipes.md](references/recipes.md). `kit catalog <recipe>` shows a
recipe's ids, defaults and limits; call it only when a value is refused.

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

A part number or a common name is enough (`"part": "2N2222A"`, `"UNO"`, `"7805"`); an unknown one
comes back with the closest names. Supplies, boards with their program, pin names:
[references/spec.md](references/spec.md).

## Read the last line

Every `layout` ends in `STATUS:`. Act on it and on nothing else:

| STATUS | Do |
|---|---|
| `DONE` | Reply (below). Stop. |
| `WARNINGS` | Built, but a part would be damaged as wired. Reply, with the warnings. Do not fix it silently and do not refuse. |
| `FIX_SPEC` | Nothing was built. Fix exactly the lines marked ✖ (each says what it accepts) and call again. |
| `CHANGES` | Built, with open items marked ✖. Fix only those ([references/operations.md](references/operations.md)), then `kit review`. |
| `SPEC_OK` | Only after `--check`: call again without it. |

**Stop rule.** At most two corrections for the same circuit. If the second still does not end in
`DONE` or `WARNINGS`, stop: show the user the ✖ lines and ask how to go on. Never repeat a call
that already failed without changing it. **No calls after `DONE`**: `layout`'s answer already has
the readings, the program and what can change; run `simulate`, `review` or `catalog` only for a
question of the user that they answer.

## Reply

In the user's language, in this order and nothing else:

1. One sentence: what was built, with the values the kit used.
2. The readings, exactly as `layout`'s `Readings` line (`Lecturas`) gives them, and its `Solved`
   and `Note` lines (`Resuelto`, `Nota`) as printed; skip what is absent. A `Note` is information:
   act on it only if the user asks.
3. The page: `layout` prints `Page: <path>` (`Página:`), one self-contained HTML file. Hand that
   file over as a file to open, exactly as written: never paste, rewrite, shorten or re-create it,
   and do not make an image of it. After every change, hand over the new page. (With the
   connector's tools, skip this: the user already sees the board.)
4. With a board, the sketch in a code block, exactly as `layout`'s `Program` block (`Programa`)
   gives it.
5. With `WARNINGS`: which part and why, in plain words, from the ⚠ lines.
6. What can be changed, from `layout`'s `Can change` line (`Se puede cambiar`): the ids with their
   meaning and limits, as information. Only on the first circuit of the conversation, add: "You can
   change a value, add or remove parts, ask about a part or how it is connected, or undo a change;
   tap a part in the page to see its card."

Only the kit's facts: no numbers, part facts or advice from memory. If the user asks something the
kit does not say, say it is general knowledge, not from the kit. No closing offers or suggestions.
No wiring list in prose unless the user asks how it is connected.

## Change it, ask about it

- **A value** of a recipe circuit: the same `layout` call on the same folder with all the
  `--values`, not only the changed one. Parts keep their holes.
- **Other parts or connections**: `layout` again on the same folder with the whole new spec.
- **Undo**: `kit undo <folder>`. What happened: `kit history <folder>`.
- **How much current, what voltage?** `kit simulate <folder>`, quoting its numbers; it is a model,
  not a measurement.
- **How is it connected?** `kit nets <folder>`.
- **A question about a part** (what it is, what each pin does, its limits): `kit catalog <name>`.

Checks, operations and drawings: [references/operations.md](references/operations.md). The board,
languages, circuit files and every command: [references/board-and-cli.md](references/board-and-cli.md).
The kit checks the DC point at rest and with each control moved alone (not combinations, nor the
peaks of a PWM or a 555), and it is a teaching
model, not a datasheet: say so when it comes up.
