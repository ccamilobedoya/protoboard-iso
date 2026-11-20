---
name: protoboard-iso
description: Builds an electronics circuit on a solderless breadboard and gives the user a live, interactive page of it (real holes, wires, simulation, oscilloscope). Use it whenever someone wants to see, build, wire, connect or change a circuit, even if they never say "breadboard" - an LED with its resistor, a voltage divider, a transistor switch, a 555 timer, a regulator, a sensor, an Arduino UNO or ESP32 with its sketch - and for "how do I connect…?" questions about such parts. Úsala cuando alguien quiera ver, armar, cablear, conectar o cambiar un circuito electrónico, aunque no diga "protoboard" - un LED con su resistencia, un divisor de voltaje, un transistor, un 555, un regulador, un sensor, un Arduino o un ESP32 con su programa - y para preguntas de "¿cómo conecto…?". Not for theory questions with no circuit to build, nor for PCB or schematic design.
license: MIT
compatibility: Needs Node.js 22 or later where the skill's scripts run. No packages to install, no network.
---

# protoboard-iso

# protoboard-iso

You say **what is connected**; the kit decides **where it goes**, draws it, checks it and simulates
it. Never draw a circuit yourself (no SVG, HTML or ASCII), never answer a request to build or wire
something with prose only, and never work out holes, colour bands, voltages or currents yourself:
run the kit and report what it says.

## How to run it

The kit is [scripts/bin/protoboard-iso.js](scripts/bin/protoboard-iso.js) in this skill's folder
(plain Node.js, nothing to install); `kit` below means
`node ${CLAUDE_SKILL_DIR}/scripts/bin/protoboard-iso.js`.

- With tools named `layout`, `apply_ops`, `review` of a **protoboard-iso** connector, use them
  instead, same names and arguments: the user sees the board in the conversation; make no file.
- Otherwise run `kit` in a shell; once per conversation `node --version` (without Node 22+, say so
  and stop).
- Keep circuits in a `circuits/` folder, in the folder the environment gives for files handed to
  the user, else the working directory: one subfolder per circuit, named for what it is
  (`green-led`); a different circuit gets a new one.
- Add `--lang es` when the user writes in Spanish (page, labels, messages; the circuit keeps it).

## Build a circuit: one call

**A recipe first.** If the request is one of these, it is one call and nothing to look up:

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
before `layout`), named in `"program"`. A part you have not used: `kit catalog <name>` first; "drawn,
not simulated" means nothing about it is checked. Spec details: [references/spec.md](references/spec.md);
each part's pins, fields, units and environment: [references/parts.md](references/parts.md).

## Read the last line

Every `layout` ends in `STATUS:`. Act on it:

| STATUS | Do |
|---|---|
| `DONE` | Checked, nothing to tell. Reply (below). |
| `WARNINGS` | Built. Each ⚠ is a part that would be damaged (with `To fix it`, or "no computed fix") or something the kit cannot confirm works (a part not simulated, a program that does not run, a relay that may not pull in…). Reply, telling each one; do not fix silently or refuse. |
| `FIX_SPEC` | Nothing built. Fix exactly the ✖ lines and call again. "Too large for one board": split it into circuits. |
| `CHANGES` | Built, with ✖ open. Fix only those ([references/operations.md](references/operations.md)), then `kit review`. "stopped at its budget": `--budget` or a smaller circuit. |
| `SPEC_OK` | Only after `--check`: call again without it. |

**Stop rule.** At most two corrections per circuit. If the second does not end `DONE` or
`WARNINGS`, stop: show the ✖ lines and ask. The same spec gives the same circuit: never repeat a
call unchanged. After `DONE`, run more only for a question the answer does not settle.

## Check what it does

Before you say a circuit with a program, a sensor or an oscillator does what was asked, run it
with the user's conditions and quote what it printed (Serial lines, each output's time on,
frequency): `kit simulate circuits/<name> --run 2 --env distance=10`; also `--set RV1=0.8`,
`--press S1@0.5+0.2`, `--at 1:light=50`. Worked example: [references/run-it.md](references/run-it.md).

## Where the kit has no answer

**"Fix it"** after `To fix it`: `kit layout <folder> --fix` (connector: `fix: true`), one change.
Only where the kit says it has none (a fixed sentence, a `STATUS` it cannot get past, a part it
lacks) use your own knowledge, and try it first with `layout … --dry-run` (connector:
`dry_run: true`): it saves nothing; apply only what ends `DONE` (or the `WARNINGS` asked for). At
most three trials, the smallest change, no redesign unless asked:
[references/beyond-the-kit.md](references/beyond-the-kit.md).

## Reply

In the user's language, in this order, with only the lines the answer printed (a circuit written
by hand, with a program or one that oscillates has fewer; Spanish names them in Spanish):

1. One sentence: what was built, with the kit's values.
2. With `WARNINGS`: every ⚠, plainly (which part, what happens or what the kit cannot confirm) and
   the `To fix it` line or that there is none, before any sentence that says the circuit works.
3. As printed: `Readings`, `Behaviour, first 2 s`, `Solved`, `Worth checking` (information: act
   only if asked); and what `simulate --run` showed for what was asked. Not the `· note:` lines.
4. The page: the `Page: <path>` file, handed over as written (never pasted, rewritten or redrawn),
   again after every change. (With the connector's tools, skip this.)
5. With a board, the sketch in a code block, exactly as the `Program` block.
6. The `Can change` line, if printed, as information, for a new circuit or when it differs. Only on
   the first circuit of the conversation, add: "You can change a value, add or remove parts, ask
   about a part or how it is connected, or undo a change; tap a part in the page to see its card."

Three kinds of sentence, never mixed: what the kit says; what you added **and the kit confirmed**
("the kit confirms D10 stays at 19 mA"); what it cannot check, marked "General knowledge, not from
the kit:". The `Checked` line is for you: tell what matters to the request or a warning. No
closing offers. No wiring list in prose unless asked.

## Change it, ask about it

- **A value** of a recipe circuit: the same `layout` call and folder with all the `--values`.
- **Other parts or connections**: `layout` again on the same folder with the whole new spec.
- **Undo**: `kit undo <folder>`; what happened: `kit history <folder>`.
- **Current, voltage?** `kit simulate <folder>` (a model). **Connected how?** `kit nets <folder>`.
  **A part?** `kit catalog <name>`.

Operations, checks, drawings: [references/operations.md](references/operations.md). Board,
languages, every command and exit code: [references/board-and-cli.md](references/board-and-cli.md).
The kit is a teaching model, not a datasheet: say so when it comes up.
