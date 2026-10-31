# Roadmap

*[Español](docs/es/hoja-de-ruta.md)* · Design and rules: [PLANNING.md](PLANNING.md)

Each stage ends with something usable on its own. A stage is **done** when its checklist
is ticked, `npm test` passes, the examples render from both views and someone has looked
at the pictures (`npm run examples && npm run preview`).

Legend: ✅ done · 🔜 next · ⬜ planned

---

## Stage 1 — Static SVG with correct placement ✅ (v0.1)

Goal: a JSON file in, a faithful isometric picture out, with the placement checked.

- ✅ World model in millimetres, true isometric camera, named views (`front`, `back`, `front-left`, `back-right`)
- ✅ Primitives: prism/box, lathe, tube, polygon/circle/rect decals, text laid on 3D planes
- ✅ Painter's algorithm with back-face culling, per-face shading relative to the camera
- ✅ Boards as data: `bb830` and `bb400`, continuous rails, optional `split`
- ✅ Elastic board `auto`: a bb400's cross-section, as many columns as the circuit uses (2026-10-17)
- ✅ `layout`: a whole circuit placed by an algorithm from its parts and nets, in about a second (2026-10-17)
- ✅ Packages: axial, LED 5/3 mm, radial electrolytic, ceramic disc, TO-220, TO-92, jumper wire (arc/flat)
- ✅ Types: resistor (4/5 bands, IEC 60062), capacitor (code "104", can size from C·V), LED, diode, MOSFET, BJT, wire
- ✅ Part-number table (`src/parts/db.js`)
- ✅ Netlist from breadboard strips
- ✅ Checks: occupied hole, shorted pins, lead span, inline leads, floating pin, body collision
- ✅ i18n: English and Spanish, messages, labels and decimal separator
- ✅ CLI: `render`, `check`, `netlist`, `parts`; `--view`, `--lang`, `--fit parts`, `--no-labels`
- ✅ Labels as callouts in rows **above the highest part** (text never covers a component), with leader lines
- ✅ Close-up framing (`fit: 'parts'`)
- ✅ Optional layout clearance (`clearance` in mm) for teaching layouts; spaced-out showcase
- ✅ SVG split into `board`, `parts`, `labels` and `annotations` groups (ready for hover and toggling)
- ✅ Scene as a display list shared by the SVG writer, the inspector and the annotations
- ✅ `inspect`: positions (hole, mm, px), visibility and occluders, label/leader problems, text sizes; text or `--json`
- ✅ Annotation layers `--annotate pins,nodes,boxes,grid|all`
- ✅ Labels avoid the printed rail labels
- ✅ Examples, tests (node:test), gallery page, PNG preview
- ✅ Docs in English and Spanish; `SKILL.md`

### Stage 1 polish (small, any time) 🔜

- ✅ Leader lines that never cross: vertical leaders whenever possible, slanted ones placed after them in the row with the fewest crossings (zero in every example, tested)
- ⬜ Leader lines that avoid passing over other parts (`LEADER_OVER_PART` notes remain)
- ✅ Pin tags of the `pins` layer that avoid each other and the hole rings (tested)
- ✅ LED: flat side on the cathode flange
- ✅ LED: longer anode lead (a small kink above the board)
- ✅ Electrolytic: "−" marks on the stripe
- ✅ Electrolytic: value printed up the sleeve, one copy per view
- ✅ Label modes: `labels: 'both' | 'id' | 'value' | false` (`--labels`, MCP `render`)
- ✅ `bb830` laid out like the maintainer's board: back to front − + j…f | e…a − + (upright, column 1 at the top: + − a…j + −); channel rows found by position
- ✅ Potentiometer (standing, knob to the front, wiper mark), push button 6×6 across the channel (inner pairs, `SWITCH_BYPASSED`), DIP chips placed by `pin1` (NE555, LM358, 74HC595, CD4017); `suggest` places them; example `controls-and-ics.json`
- ✅ More packages: multi-turn trimmer (3296W), header pins, passive buzzer, NTC bead, photoresistor, batteries beside the board (AA/AAA/18650 holders, 9 V block with its snap, LiPo pouch), DIP-14 and other chips (LM324, LM393, UA741, NE5532, LM386, ULN2003, ULN2803, PC817)
- ⬜ Painter: sort jumper wires against tall parts more robustly (split long arcs, depth bias)
- ✅ **Page to embed** (`out/<name>.html`, `page` command, `render` with `page: true`): one self-contained file per circuit, rewritten on every change under the same name; two views, close-up or whole board, labels on/off, drag to pan, wheel or pinch to zoom. Stages 2–4 grow this same page ([embedding.md](docs/en/embedding.md))
- ✅ `check --json`; exit codes documented (0 fine, 1 errors or refused, 2 review CHANGES)
- ✅ JSON Schema for the circuit file (done in stage 1.5: `schema/`)

## Stage 1.5 — Agent interface ✅

Goal: any assistant or agent can pick up an existing circuit, understand it from a short
report, and change it with small validated operations whose effect is measured before it
is applied. The same operations will drive the interactive editor later.

- ✅ **Operations** on a circuit: `add`, `remove`, `move`, `set`, `rename`, `circuit`; atomic, validated, each with its inverse
- ✅ **Dry run with diff**: what an operation batch fixes, what it introduces (check issues + inspect problems)
- ✅ **History and undo**: `history.jsonl` next to the circuit, revision number, author and note per change; `undo` applies the inverse
- ✅ **Revision guard**: `--expect-revision` so two agents never overwrite each other
- ✅ **Derived report**: `report.json` written with the outputs, so resuming means reading numbers, not pictures
- ✅ **JSON Schemas** for the circuit file and the operations (editors, MCP tool schemas)
- ✅ CLI: `apply`, `undo`, `history`; every command accepts a file or a folder target
- ✅ Docs: `docs/en/agent-interface.md` / `docs/es/interfaz-para-agentes.md`
- ✅ **Queries**: `at <hole>`, `node <node>`, `free [near]`, `suggest <part> between <node> and <node>` (valid placements ranked by clearance and visibility)
- ✅ **MCP server** (`mcp/`, own package so the core stays dependency-free): `list_circuits`, `get_circuit`, `inspect`, `query`, `apply_ops`, `undo`, `history`, `render`, `catalog`; project `.mcp.json`
- ✅ `SKILL.md` prefers the MCP tools, CLI as fallback; `create_circuit` tool; docs `docs/en/mcp.md`
- ✅ `review`: verdict from measurements with profiles `lesson` / `draft` (CLI and MCP tool), the shared definition of done
- ✅ Agent roles (`.claude/agents/`): `circuit-layout`, `circuit-reviewer`, `parts-librarian`; they share state through the files, not the chat; briefs and loop in `docs/en/agents.md`
- ⬜ Try the agent loop on real lesson circuits and tune the briefs and the `lesson` profile

## Stage 2 — Simulation (DC first) ✅ (v0.2)

Goal: voltages at every node and current through every part, computed by the kit.
Guide: [docs/en/simulation.md](docs/en/simulation.md).

- ✅ Sources: `supplies` field: bench supply on the rails with optional current limit (constant voltage → constant current), battery with internal resistance; set with the `circuit` operation
- ✅ MNA solver (`src/sim/`): dense LU with partial pivoting, GMIN, Newton with junction limiting, source stepping; resistors, wires (0.05 Ω), potentiometers, push buttons
- ✅ Diodes and LEDs: Shockley model with series resistance; diodes per part number, LEDs per colour (Vf at 20 mA), `"model"` overrides per part
- ✅ Capacitors: transient analysis, backward Euler; start discharged or at the DC point
- ✅ MOSFET (square law with smooth turn-on, k from Rds(on)) and BJT (Ebers–Moll transport, constant β; TIP120 as a Darlington)
- ✅ Every part model verified once against an independent reference (textbook formula solved apart, or the datasheet) and kept as a test (`test/sim.test.js`)
- ✅ Warnings a learner needs: overpower, overcurrent, reverse voltage, reversed electrolytic, supply in current limit, short circuit, floating nodes
- ✅ Static results on the SVG (`render --sim`, own `results` layer): group voltages, part currents, "MODEL" badge; tags avoid parts
- ✅ Results in the CLI and MCP (`simulate`, text or JSON) and in the embeddable page, only for the tapped part (since 2026-10-18 on by default with a source, with lit LEDs and the Current button; `"page": { "simulation": false }` turns it off)
- ✅ Compare a few circuits with Falstad CircuitJS as a second reference (stage 3, phase 6: [falstad.md](docs/en/falstad.md))
- ⬜ Events during a transient (press a button at a given time), and a chart of the transient in the page
- 🔜 Chips: behavioural 555 ✅ (2026-10-26: `sim/devices/timer.js`, comparators at CTRL and CTRL/2 with the internal 5 kΩ divider, a latch that changes between time steps, output and discharge stages from the NE555 datasheet; the `555-astable` recipe blinks in the live page; tested against f = 1.44 / ((R1 + 2·R2)·C). Op-amps ✅ (2026-10-26: `sim/devices/opamp.js`, LM358, LM324, µA741, NE5532, and the LM393 comparator with its open collector; no bandwidth or slew rate yet; recipes `opamp-comparator`, `lm393-comparator`, `opamp-follower`, `opamp-noninverting`, `opamp-inverting`). Neither exports to Falstad yet, and the 555 has no conductor-view paths
- ✅ **Microcontrollers in the simulation** ([microcontrollers.md](docs/en/microcontrollers.md), planned 2026-10-26): not the processor but its pins, the same model for the ESP32 DevKit, ESP32-C3 SuperMini and UNO with each family's numbers, and a short program in Arduino's functions
  - ✅ M1 (2026-10-26): pin model (`sim/devices/mcu.js`, `MCUS` in `models.js`): outputs as the rail or ground behind their resistance, inputs with optional pull-up/down, protection diodes; the board on USB is a source (no other supply needed) with its 3.3 V regulator; each GPIO's state in `"io": { "D13": "high", "D27": "input_pullup" }`; the card shows USB, the rail and each pin (state, voltage, current, what it reads, ADC); warnings for current per pin, 5 V on a 3.3 V pin (`SIM_PIN_OVERVOLTAGE`), `io` mistakes. `esp32-led`, `esp32-button`, `uno-led` simulate
  - ✅ M2 (2026-10-26): the program (`"program"`: a `.ino` beside the circuit, or its text) in the Arduino C++ subset, translated to generators (`sim/sketch.js`) and run between time steps (`sim/program.js`): `pinMode`, `digitalWrite`, `digitalRead`, `delay`, `millis`, `Serial` (lines in the board's card), `analogRead`; replayed at t = 0 until its pins settle; the page runs it in real time; `esp32-led` blinks, `esp32-button` prints what it reads
  - ✅ M3 (2026-10-26): PWM as a real square wave in time (`analogWrite`, `ledcWrite` in both core styles, `tone`/`noTone`); the page shortens its step for it (`engine.stepHint`) and averages an LED's glow over the steps (`engine.glow`); the serial monitor in the board's card. Later: a console panel of its own, the ESP32 ADC's real curve
  - ✅ M4 (2026-10-26): recipes with their program: `esp32-led`, `esp32-button`, `uno-blink`, `uno-button`, `uno-pot-pwm`, `c3-blink`, `c3-pot-pwm` (all `DONE` in one call); integer division kept in any expression, as in C
  - Later: interrupts, stand-ins for common libraries, real UNO firmware with avr8js as an optional mode
- ✅ Inductors (axial, colour rings in µH; winding resistance; transient), Zener diodes (1N47xxA, breakdown with a soft or sharp knee), linear regulators (78xx, LM317, with dropout and their own current), NTC thermistor and photoresistor (resistance from `temperature` / `light`), passive buzzer (warns on DC)
- ✅ Batteries drawn as parts and simulated as sources: format, chemistry, cells in series, state of charge, measured voltage, holder switch; runtime estimate; warnings for short circuit, over-current, charging an alkaline cell ([simulation.md](docs/en/simulation.md))

## Parts and sources, next ⬜

From a usual beginner's kit, in rough order of use:

- ✅ Development boards, drawn and checked (level 1): ESP32 DevKit (30 pins) and ESP32-C3 SuperMini straddling the channel by `pin1`, with a `rowSpacing` because boards differ; Arduino UNO beside the board, only the pins in use wired with Dupont leads; a note per pin in the card (strapping pins, input only, ADC2 and Wi-Fi, PWM…). Examples `esp32-led.json`, `uno-led.json`
- ✅ GooDisplay DESPI-C02 e-paper adapter beside the board (right-angle pins with Dupont leads, RESE switch, test pads, FPC connector) and, when asked, the 7.5" GDEY075T7 panel on its flat cable (`panel: true`); card "Adapter board". Example `epaper-esp32.json`
- ⬜ Bench supply drawn beside the board, its leads clipped to the rails (today `supplies` is not drawn)
- ⬜ Battery discharge over time in a transient (charge falling with the current drawn), for runtime lessons
- ⬜ Step-up (boost) converter module, as a behavioural source
- ✅ KBP bridge rectifier (`bridge`: four diodes in one body, simulated), cement resistors (3, 5, 10 W, value printed on top); example `rectifier.json`
- ✅ Battery holders: end walls as tall as the cells, so the + button never peeks over them
- ⬜ Coin cell (CR2032) in its holder

Usual bench parts the kit does not draw yet (2026-10-16):

- ✅ Off-board switches (`switch`), on the table in front of or behind the board, simulated as switches that stay put (*Turn on* / *Turn off* in the card, control `on` with the new `toggle` scale): the KCD1 rocker (SPST, alligator clips on its faston tabs) and the 7 × 7 latching push button (DPDT, a wire soldered to each pin in use); example `switches.json`
- ⬜ Alligator clip leads as wires off the board (to the rails, to an off-board switch, to the supply)
- ✅ AMS1117-3.3 (and -5.0) regulator module: a `regulator` part number, standing on its three right-angle pins `IN` · `OUT` · `GND` (VIN OUT GND printed facing the front view; chip, capacitors and power LED on the side towards the row, seen from the back), simulated as a low-dropout regulator (1.1 V) with its power LED inside (`led`: `"1k"`, `"200"`, `"none"`); warnings for heat on its small board, input over the maximum, and reverse polarity. Primitives may sit on one face of a standing board (`side`: painted after the board from that face, before it from the other)
- ⬜ Regulator and power modules, drawn and simulated: LM2596 buck (plain ZX-001 and V591 with LED voltmeter), TP4056 USB-C charger with protection, CN3791 MPPT solar charger, 2S BMS
- ⬜ **USB as the power source for chips**: a USB cable (computer or charger: 5 V with its limit) into a development board (UNO, ESP32 DevKit, ESP32-C3, Pico) powering its 5V and 3V3 pins and what hangs from them, drawn and simulated; a USB-C input module on the board as well
- ⬜ More development boards: Raspberry Pi Pico (RP2040) and ESP32-CAM with its MB programmer
- ⬜ Display and input modules: OLED 0.96" (GME12864: VCC GND SCL SDA) and 0.91" SSD1306 over I2C, EC11 rotary encoder module, TTC MX key switches (keyboard block)
- ⬜ Sensor modules: the 22-module kit (DHT11, BMP280, MH-RD rain, soil moisture, KY-018…), BME280, capacitive soil sensor (TLC555), HC-SR04 ultrasonic
- ⬜ Actuators: SG90 and MG90S servos (3-pin lead), TB6612FNG motor driver, DC gear motors, mini submersible pump
- ⬜ Energy: 6 V 2 W solar panel; single 18650 holder, LiPo 103450 on a JST PH lead
- ⬜ On the board: TO-220 heatsink, XH connectors, DIP sockets
- ⬜ Instruments on the circuit: multimeter leads on a strip (stage 4's virtual multimeter), the oscilloscope probe and a bench generator's output, logic analyzer leads

## Faster circuits for lessons (from the two-rail supply test) ⬜

On 2026-10-16 a fresh `circuit-layout` rebuilt a two-rail supply from a learner's notes and
photo: 19 min, 68 calls, about 185 000 tokens (half a session's budget) to copy the photo, and the
result passed review with resistors crossing other parts, three parts stood in by pin headers and
no simulation (the switch is missing). The maintainer's rule from then on: **the same function, not
the same picture**. Its spec is `examples/layout/two-rail-supply.json`, kept to rebuild it
with the improvements below and compare.

- ✅ Brief: `Target: <name>` without a `circuits/` prefix; `Fidelity: functional` by default; the layout agent checks every part with `catalog` first and gives up a constraint after three attempts ([agents.md](docs/en/agents.md))
- ✅ The MCP server reloads when the kit's code changed since it started: its tools run in a worker that it restarts (`mcp/kit-worker.js`), and that answer says so; a changed list of tools still asks for a reconnect ([mcp.md](docs/en/mcp.md))
- ✅ The MCP drops a `circuits/` (or the root's own name) prefix that does not exist under the root (it nested `circuitos/circuits/…`); `targetArg`'s example no longer suggests it
- ⬜ Labels on any group, not only rails (`netLabels` for strips, e.g. `"8:a-e": "TP3"`), drawn on the board and in the card, checked by the reviewer: test points are what measuring lessons are about
- ✅ Leads and jumpers that pass through another part are warnings (`LEAD_THROUGH_PART`, `WIRE_THROUGH_PART`, `checkCrossings`: lead samples against the other parts' convex primitives), so every profile blocks them and `suggest` avoids them; it found the R2 lead through the header in a two-rail supply, and two kit examples (fixed)
- ✅ `suggest` gives each placement its nearest body and gap (`nearest`), takes a review `profile` (leaves out what it would block, both views) and measures more candidates (up to 48) while fewer than `limit` pass
- ✅ Place several parts at once: `suggest` with `parts` (CLI `--parts`), each placed given the ones before it, answered as one batch of adds; groups can be named by a placed pin (`R1.2`, `U1.OUT`) everywhere
- ✅ `review`: each blocking item names its `parts` and `views`; `--explain` (`explain: true`) adds the profile's rules
- ✅ `catalog`: a compact list by default (2 KB instead of 20); `name` (a type, part number or module) for its pins, package, fields and a real example from `examples/`; the full registry with `format: "json"` (`src/node/catalog.js`)
- ✅ MCP tool `netlist` (CLI `nets`): nets as groups joined by wires, with their pins, labels and the pins alone on a net (`src/nets.js`)
- ⬜ A "stands for" marker for a part the kit still lacks: drawn flat, no collisions, named in the card (only while the part is pending)
- ⬜ Photos: a table for a board standing up (left rail = B+/B−, right = T−/T+; the photo's rows are the kit's columns) and an annotated grid render to compare with a photo
- ⬜ Measure again: rebuild the two-rail supply with these improvements (`Fidelity: functional`) and compare time, calls and tokens

## Circuits with a small model, and with any model (review of 2026-10-20) 🔜

Goal: a circuit comes out right at the first try from a cheap model with little reasoning, and from
assistants other than Claude, by reusing proven patterns instead of working each circuit out.
From a review of the kit, its agents and its docs, and a try of `layout` with four usual lesson
circuits: an NPN switch and a potentiometer divider came out ready; a 555 astable was left with
parts hidden from the back view; an ESP32 with a pull-up button found no room for its ground jumper
(the board covers the strips) while the text still ended in "Review: APPROVED"; and **none** of the
four passed the first try, because of pin names (`D1.K` on an LED, `U1.DISCH` on a 555).

**Mistakes that cost a round each (done 2026-10-20)**

- ✅ The layout agent's tools list lacked `layout` (its step 0 said "layout first") and `simulate`; the reviewer lacked `simulate`. Both now run `simulate` once and report warnings only, never values. `npm run test:mcp` fails when an agent's instructions name a tool its list does not have
- ✅ The layout agent's file without contradictions: one choice of path at the top (A: `layout` for a new circuit, no `catalog` before it; B: operations for changes and fixes), instead of "catalog first" and "no catalog before layout" in the same file
- ✅ Pin names as people write them (`src/parts/pin-names.js`, `findPin`): synonyms (`A`/`anode`, `K`/`cathode`, `VIN`/`IN`, `DISCH`/`DIS`, `THRESHOLD`/`THR`, `VDD`/`VCC`, `3.3V`/`3V3`…) and GPIO numbers on boards (`GPIO4` → the DevKit's `D4`), only when one pin matches; in `layout`, circuits, `query` and `suggest`. A pin name may contain a dot (`U2.3.3V`)
- ✅ One verdict: `layout` ends in `STATUS: DONE | CHANGES | FIX_SPEC | SPEC_OK` with what to do next (`status` in JSON); the CLI exits 0 only when done

**Proven patterns instead of working each circuit out**

- ✅ **Recipes** (2026-10-26, [recipes.md](docs/en/recipes.md)): fifteen lesson circuits as layout specs in `src/recipes/` (`led-resistor`, `divider`, `npn-switch`, `potentiometer-led`, `mosfet-switch`, `button-pullup`, `button-pulldown`, `rc-square`, `555-astable`, `regulator-7805`, `regulator-ams1117`, `bridge-rectifier`, `zener-regulator`, `esp32-led`, `esp32-button`), called by name with only the values (`layout { recipe: "npn-switch", values: { R1: "1k" } }`, CLI `--recipe` / `--values`); only the ids each recipe lists change, within choices or ranges (`RECIPE_*` errors say what is allowed); never with `parts` or `nets`; `catalog` lists them with their values and details one by name; the circuit keeps `spec.recipe`, and the same call with new values keeps every part's holes. All fifteen end in `DONE` in one call in `layout-bench` and in `test/recipes.test.js` (every part choice too) and simulate without stressing a part. `SKILL.md`, the MCP instructions ("recipes first") and the layout agent start with them. Replaces stage 5's "templates"
- ✅ **The spec as the desired state** (2026-10-20): the circuit keeps what `layout` was asked (`spec`: nets with resolved pin names, supplies that name pins, the ids of its jumpers); `review` checks those nets in every circuit that has them (`SPEC_NET_MISSING`, `SPEC_NETS_SHORTED`); `layout` on an existing target lays it out again as one revision (undo brings the old one back), with only what changes given, every part and jumper trying its present holes first (a second LED on the 555 moved nothing); `rename` follows into the spec. Kept inside `circuit.json` rather than a `spec.json` beside it, so history and undo cover it
- ✅ **Repairs inside `layout`** (2026-10-20): what the relayout loop leaves (a net apart, a jumper named by a blocking item) is routed again once with `suggest` (lesson profile, `VIA_WIRE`), kept only if it improves; a ground net without a rail goes to the − rail the others use, else `B-` (notes `LAYOUT_REPAIRED`, `LAYOUT_GROUND_TO_RAIL`)
- ✅ Found on the way: the lesson profile blocked a part as hidden in every view when it was under 85 % visible in each, and counted two parts covering it in one view as two views. Now it blocks when its best view shows less than 70 % (`hiddenBelow`): both bench circuits pass at the first try (the two-rail supply: 8 tries and 1.5 s → 1 try and 0.3 s) and the 555 astable passes
- 🔜 The brief carries the nets as JSON (or a recipe's name: done 2026-10-26, the `Recipe:` line, and a recipe circuit is one `layout` call from the main conversation) instead of prose ("R1 between T+ and the LED anode") the agent must translate; a recipe circuit is laid out by one `layout` call from the main conversation, and the agent is kept for `CHANGES`

**The algorithm** (limits already listed in [layout.md](docs/en/layout.md#known-limits-and-where-to-improve))

- 🔜 Visibility in the placement check: since 2026-10-26 a jumper pays 12 mm for each body it crosses seen from above, and every joined group of the net is weighed together (not the nearest by column first): the 555 astable went from 70 % to 100 % visible in its best view and from 3 tries to 1. Left: tall parts hiding low ones behind them (step 2)
- 🔜 Wide boards (ESP32 DevKit) that cover the strips: since 2026-10-26 the board is placed by pin 1 so the pins in its nets keep a free row past its PCB, and a group no jumper reaches waits for the rest of its net (rails last): a circuit on one header comes out ready (`esp32-led`, `esp32-button`). Left: nets on both headers (`3V3` and `D4`), through the other pin of the same name or a rail
- ✅ A bigger bench (2026-10-26): `layout-bench` runs every recipe after `examples/layout/`, and the four circuits of this review are recipes (`npn-switch`, `potentiometer-led`, `555-astable`, `esp32-led` / `esp32-button`)

**Any model, not only Claude**

- ⬜ `AGENTS.md` at the root (read by Codex, Gemini CLI, Cursor and others) with the short workflow; `SKILL.md` and `.claude/agents/` stay for Claude Code
- ⬜ MCP prompts (`build_circuit`, `review_circuit`): the agents' procedure served by the MCP server, so any MCP client gets it, not only the tools
- ⬜ `schema/layout.schema.json`: the spec's JSON Schema, for models that generate JSON constrained by a schema
- ✅ `SKILL.md` reordered (2026-10-20): a table of which tool for which task, `layout` first with a worked example (a test checks it lays out to `DONE`), the `STATUS:` lines, changing a circuit by laying it out again, the operations loop, checking and showing; the hand-written format left to `docs/en/circuit-format.md` (11.5 KB → 8.7 KB). The MCP server's instructions and tool descriptions say the same (⬜ recipes first, when they exist)
- ⬜ Agent bench: N briefs × model (a small Claude, another provider's model), measuring calls, tokens, time and first-try success, so each change to the kit is measured (continues "Measure again" above)

## Visual style and themes (cross-cutting, after stage 2) ⬜

Goal: drawings that teach first. Realism where it helps to recognise a part; calm
everywhere else so the parts stand out.

- ⬜ Theme system: every colour from a named palette (`theme: 'realistic' | 'study' | …`), no colour hard-coded in packages
- ⬜ `study` theme: a less realistic, more aesthetic breadboard (flat, muted body, lighter holes and print, softer edges) so components and wires stand out
- ⬜ Review part palettes (wires, LEDs, bands) for contrast and colour-blind safety; keep resistor bands faithful to IEC 60062
- ✅ Highlight mode: dim everything except the parts being explained and the strips under their leads, drawn on top even when covered, with the column numbers and row letters of their leads highlighted (`--focus`, `page.focus`, tap in the page; [focus-and-flow.md](docs/en/focus-and-flow.md))
- ✅ Page on a phone: the button bar is one row that scrolls sideways
- ✅ See-through: make one part transparent to see what is behind it (page card)
- ⬜ **What covers what, planned as a whole** (to do properly later, not patched case by case): in a focused page the simulation tags (voltages, currents, the MODEL badge) can cover the highlighted column numbers, the hole positions and the leads they talk about. Decide a priority between layers (part copy, strips, coordinate tags, result tags, labels, probes), place tags aside of what they would hide (collision-aware, as the labels already avoid each other), and check it with `inspect` like the rest of the drawing
- ✅ Dark theme for screens: the page (UX pass, U2); the board drawing keeps its colours

## Stage 3 — Live simulation in the browser 🔜

Goal: see the circuit work, like Falstad's CircuitJS, on the breadboard. Design, decisions and
the plan by sessions: [docs/en/live-simulation.md](docs/en/live-simulation.md).

- ✅ Current layer (`page.flow`), first version: everything dimmed, strips shown, dots along strips and through parts, Kirchhoff along each strip
- ✅ Phase 0: golden test of the simulator output (safety net for the refactors): `scripts/golden.js`, `test/golden.test.js`
- ✅ Phase 1: conductor view: conductors along their real paths (package `paths`: axial, LED, wire, TO-92, TO-220, push button, battery), coloured by voltage; conventional current only (electrons view removed); speed proportional to the current with a log toggle; mock-ups (`scripts/mockups.js`); rails palette chosen, steep shading inside bodies
- ✅ Phase 2: device modules, one file per kind of part (`src/sim/devices/`: elements, reading, limits as stresses, card lines, tag, probe); outputs identical (golden file, pages and drawings byte for byte); floating islands anchored in DC (an isolated inductor made the matrix singular). Controls move to phase 5
- ✅ Phase 3: compiled program (`sim/compile.js`) + dependency-free engine (`sim/engine.js`); devices split into `params` (JSON) and `elements`; a small bundler (`node/bundle.js`), the engine bundled runs alone and matches `simulate()`; the page script as modules (`page/client/`); stamper reused and solved in place (≈ 4× faster, same results)
- ✅ Phase 4: live simulation in the page (`page/client/live.js`, the engine and the compiled program embedded with `results` or `flow`): dots moved by an accumulated phase, voltage colours, LED glow, heat tint, *Pause* / *Switch on (t = 0)* and a clock for circuits with C or L (speed from the time constants), live tags, probe captions and card; `page.start`
- ✅ Phase 5: sliders in the card (resistance with E24 stops, temperature, light, potentiometer position, bench voltage, battery charge) and the `page.controls` panel (checked by `check`), momentary push button (on the drawing or in its card); `engine.controls()` / `engine.set()` re-solve at once and carry the state (a capacitor keeps its voltage); limits made visible: amber near the limit, pulsing red past it, latched until cleared or reset, warnings panel; `stress` per part in `simulate`
- ✅ Phase 6: Falstad CircuitJS ([falstad.md](docs/en/falstad.md)): exporter to its text format (`sim/falstad.js`, a `falstad` hook per device, drawn as a schematic, nets labelled with the breadboard groups), *Open in Falstad* button in the live page with the state at that moment and **⚠ n** listing the parts sent as equivalents; cross-check of 7 cases with stored references (`test/falstad/`, `scripts/falstad.js`): same models within 1 µV, MOSFET and Zener within a stated tolerance
  - ⬜ Falstad's XML format: the MOSFET's λ and Falstad's LM317 (regulators are left out today)
  - ✅ Transient cases in the cross-check, sampled at the same times (phase 8)
  - ✅ Drawn as a schematic in Falstad (`sim/falstad-layout.js`): nets as rows ordered by voltage, parts standing between them, series parts in one column, jumpers merged, the column order with the fewest crossings
- ✅ Phase 7: oscilloscope in the card of the tapped part: V and I against time on a dark 10 × 4 screen, two stacked plots with their own scale, recorded from the start for every part (`sim/recorder.js`), what each kind plots in its device (`scope`: Vce and Ic for a transistor), from t = 0 until 10 time constants and then scrolling (wall clock without C or L), only where the card shows results; closing the card removes it. Plan: [live-simulation.md](docs/en/live-simulation.md#phases-7-to-9-oscilloscope-signal-generator-and-probes-plan-of-2026-10-15)
- ✅ Phase 8: signal generator as a supply (`kind: "generator"`: sine, square, triangle with Falstad's shapes; frequency, peak amplitude, offset, 50 Ω output unless given), followed step by step by the engine; frequency and amplitude sliders; the page paced by its period; exported to Falstad as its own source; transient cases in the cross-check, sample by sample (RC with a square wave within 5 nV, half-wave rectifier within 1 mV). Examples `half-wave-rectifier.json`, `rc-square-wave.json`
- ✅ Phase 9: probes on nodes: tapping a strip in use opens its card (found by where the tap is, since strips lie under the parts; each pin of a part's card also opens its strip, and each lead of a strip's card its part): what a strip is, what is clipped to it and where, the parts brought forward with that strip; with results, its voltage to ground with the red and black probes drawn, the current of each lead into or out of the strip (Kirchhoff) and its oscilloscope, recorded from the start like the parts'
- ⬜ Later, when a lesson needs it: pin traces to a two-channel oscilloscope panel (the plot code is written for a list of traces)

## User experience (cross-cutting) ⬜

Asked by the maintainer (2026-10-15): the page has many useful features, with more to come. They
must be organised so a learner does not get lost, above all on a phone. Today there are:

- in the bar: views, framing, labels, current layer, speed, time and *Open in Falstad*;
- in the card: focus, see-through, results, sliders and the oscilloscope; a strip's card, with
  links between the cards;
- in the side panel: limits and warnings, the controls panel and the Falstad equivalents.

The oscilloscope, the generator and the probes came with phases 7 to 9. Best done now, before
stage 4.

Plan of 2026-10-16, from a review of the live page with the UI/UX skills: design, decisions and
sessions in [docs/en/ux-pass.md](docs/en/ux-pass.md); visual system in
[`.interface-design/system.md`](.interface-design/system.md).

- ✅ Review of the live page (desktop, tablet, phone, embedded) and inventory of every feature: where it lives, when it appears, which `page.*` asks for it
- ✅ Visual system chosen: bench palette as tokens, light and dark (`system.md`)
- ✅ U0 · Safety net: `scripts/ux-shots.js`, screenshots at five sizes (inside an iframe too)
- ✅ U1 · Gestures and embedding: no scroll trap inside a note (one finger and the wheel go to the host; two fingers, Ctrl/⌘ + wheel and pinch zoom), zoom buttons, double tap to a part, full screen (tried on the maintainer's phone)
- ✅ U2 · Tokens, dark theme (follows the system; `page.theme` and `?theme=` override it), touch baseline
- ✅ U3 · The bar: grouped by job, icons, Flip and Fit as single buttons, ⋯ menu, first-time hint
- ✅ U4 · The inspector: one card with a sticky header, a Circuit tab (controls, warnings, Falstad), right panel on wide screens and a bottom sheet on phones; the selected part never covered; MODEL badge with the right mode
- ✅ U5 · Motion: flip keeping the focus, framing, sheet, press feedback, reduced motion
- ✅ U6 · Details: small parts easier to tap (a part nearby, the part underneath on a second tap), portrait framing (the labels items were dropped)
- ⬜ U7 · Try it with the maintainer on a phone, an iPad and inside a notes app, and adjust

## Stage and video (cross-cutting) ⬜

Asked by the maintainer (2026-10-30): the page should tell a circuit step by step, look the part,
and give short videos without an assistant in the loop. Design, mock-ups and the plan by sessions in
[docs/en/stage-and-video.md](docs/en/stage-and-video.md): a declarative timeline (one JSON per
video), one external clock, a rhythm grammar of seven moves, a `stage` theme chosen from mock-ups,
and a frame exporter. Decisions taken with the maintainer on 2026-10-30: C dark for video as a `stage` theme, light A stays in lessons, the grid in page and video, the first wave of moves, the tour from V2.

- ✅ V0 · Safety net: a frame golden (recipe, viewport, `tick` calls, PNG hash) in `test/frames/`, `scripts/frames.js` (Playwright's fake clock), a step of `npm run verify`; skipped without a browser, never passed
- ✅ V1 · One clock: `director.js`; camera, tweens, dots, glow and colours written per `tick`; `?director=1`; `test/director.test.js` (no system clock, the same page twice)
- ✅ V2 · Timeline and player: the JSON format and schema, the seven moves as tokens, `wait-until`, *See how it works* in the page, caps and attack cases; `examples/npn-switch.json` with its tour, `test/tour.test.js`
- ✅ V3 · The drawing that tells: the board's own printed coordinates lit (the same decals; unnumbered columns get one in the same format), covered by parts like the print; the current layer as a plan (a pad at every landing, a line through two-pin parts and along wires, a stub per pin on the others); result tags at a fixed screen size and off their part; short labels at rest and the frame computed with them
- ✅ V4 · The stage: the chosen direction as `[data-theme="stage"]`, the hole grid continued under the drawing, the caption layer, one label and no tags in a frame, the reserved margin, safe bands measured
- 🔜 V5 · Frames (built, the test video waits for approval): `scripts/render-frames.js` (Playwright, dev only) → PNG sequence + `timeline.json`; ffmpeg command documented; a 45 s test video of three recipes approved on a phone
- ✅ V6 · The chosen moves (M1 to M16 in the plan), each with a jsdom test (`test/moves.test.js`) and a golden frame (`test/frames/move-*.json`), from `examples/tours/npn-switch-moves.json` and `npn-switch-build.json`; new steps `raise` (M16), `assemble` (M4, M5), `pulse` (M7), `probe` in a recording as an oscilloscope box (M11). Every choice of a move is an optional field of the timeline, documented in `docs/en/timeline.md` (2026-10-31). Left for a decision: the pulse on load
- ⬜ V7 · Bench and guide: a timeline per recorded recipe, the golden in `npm run verify`, the guide in en and es

## Stage 4 — On a phone or tablet ⬜

Goal: open a link and explore.

- ⬜ Single-file interactive page (no build step): grows the embeddable page of stage 1, same file name, so existing embeds keep working
- ⬜ Dynamic zoom: pinch and wheel zoom, pan, double-tap a part to zoom to it; more detail as you zoom in (hole numbers, part markings)
- ⬜ Labels on hover or tap only (the static SVG keeps the callouts above the parts)
- ⬜ Virtual multimeter: probes on holes, voltmeter in parallel, ammeter needs the circuit opened
- ✅ Toggle front/back view; tap a part to bring it and its strips forward
- ✅ Tap a strip to highlight everything connected to it (stage 3, phase 9)
- ⬜ Prediction mode: readings hidden until the learner commits to an answer

## Stage 5 — Faster authoring ⬜

- ✅ Templates: common circuits where only values change: now the **recipes** of "Circuits with a small model" above (2026-10-26)
- ✅ Automatic placement from a netlist, respecting `clearance`: `layout` (2026-10-17)
- ⬜ Adapters: import/export Wokwi `diagram.json` (✅ a Falstad CircuitJS link: stage 3, phase 6)

## Stage 6 — Publishing 🔜

The repository is already public on GitHub. The goal: someone who arrives understands it in a
minute, can try it without installing anything, and can install it as a skill, a plugin or a
package. Planned on 2026-10-26 after a review of licences and private data.

**A · Clean-up** ✅ (2026-10-26)
- ✅ Licences reviewed: MIT; no runtime dependencies; the MCP server's dependencies are MIT, ISC or BSD; `@resvg/resvg-js` (MPL-2.0) is a development or optional dependency, never redistributed; no fonts, images or third-party code in git; Falstad only through its text format
- ✅ Private context removed from the docs (names, private paths, the notes app, own equipment); git history checked: no hostnames or note ids
- ✅ Privacy rules in `CLAUDE.md` and `PLANNING.md`; `test/privacy.test.js` over tracked and new files (generic patterns + an untracked `privacy.local.txt` of personal words)
- ✅ `package.json`: `repository`, `homepage`, `bugs`, keywords; Node ≥ 20 (18 is out of support)

**B · README and images** ✅ (2026-10-26)
- ✅ README (en/es) rewritten: what it is, a one-minute try, from a description to a lesson in six pictures, the page, recipes, three ways to use it, what it is and is not, docs split into using and developing, contributing, credits
- ✅ `scripts/readme-images.js`: the README and examples images drawn by the kit (`docs/img/`); `live-page.png` is a screenshot (`scripts/ux-shots.js`)
- ✅ `scripts/demo-site.js` and `.github/workflows/pages.yml`: every recipe and every example with a source as a live page, in English and Spanish, with an index
- ✅ Turn on GitHub Pages (Settings → Pages → Source: GitHub Actions) so the README's demo link works: on, checked 2026-10-29 (the demo answers, the workflow runs on every push)
- ⬜ A short GIF or video of the live page (current flowing, the oscilloscope, a slider); made with the frame exporter of *Stage and video* (V5)

**C · Examples** ✅ (2026-10-26)
- ✅ `examples/README.md` (en/es): the three ways to describe a circuit (by hand, layout, recipe), the examples by theme with a thumbnail each, `common-mistakes.json` marked as wrong on purpose, how to add one

**D · What a public project needs**
- ✅ CI on GitHub Actions: `npm test`, `npm run test:mcp`, `node scripts/golden.js`, `npm run examples`, `npm run layout-bench`, on Node 20, 22 and 24 — done as C01 of "Repository tooling" (2026-10-29): `npm run verify` on Node 22 and 24; the layout bench left out (it measures time)
- ⬜ `CONTRIBUTING.md` (en/es), mostly how to add a part; `CODE_OF_CONDUCT.md`; `SECURITY.md`; `CHANGELOG.md`
- ⬜ Issue templates: a new part, a wrong drawing, a wrong simulation
- ⬜ Version 0.3.0, a git tag and a GitHub release; repository description, topics and social preview image
- ⬜ Versioned circuit format with migration notes
- ⬜ Decide the copyright line (today "protoboard-iso contributors") and the `author` field

**E · Packaging the skill**
- ⬜ Claude Code plugin: `.claude-plugin/plugin.json` and a `marketplace.json` in this repository, bundling the skill, the three agents and the MCP server (`/plugin marketplace add …`). To solve: the MCP server needs `npm install` (bundle it into one file, or publish it to npm and start it with `npx`); `.mcp.json` paths with `${CLAUDE_PLUGIN_ROOT}`; check how a plugin prefixes MCP tool names, and update the agents' tool lists (`npm run test:mcp` catches stale names)
- ⬜ A skill zip for claude.ai or the API, CLI only (no dependencies): `scripts/pack-skill.js` with `SKILL.md`, `bin`, `src`, `schema`, the essential docs and the examples, no tests or development notes; first check that Node is available where those skills run
- ⬜ npm packages: `protoboard-iso` (CLI, `npx protoboard-iso`) and the MCP server as a second package (today `files` leaves `mcp/` out); then list it in MCP server directories
- ⬜ Skill evaluations: a few requests ("an LED with its resistor on 9 V") that must end in `review` APPROVED, to check that the skill triggers and that a small model uses it well
- ⬜ `AGENTS.md` (see "Circuits with a small model")

**F · Launch**
- ⬜ Release published, demo online, a short announcement with the GIF

## Repository tooling ✅

Checks and guards for the repository itself, not for the circuits. Planned on 2026-10-29 after a
read-only check at `11d6de2`, in the order they pay off: security first, then false greens, CI,
context and agents, usage, and process. Each item says what to add and, after "Today", why; the
code in brackets names the check. File names follow the repository's conventions: checks are
`node:test` suites in `test/`, tools are `scripts/*.js`, data and settings are JSON, decisions go
in the log of `PLANNING.md`.

**A · Security** ✅ (2026-10-29)
- ✅ Never-commit list (N03): `test/privacy.test.js` also fails on tracked files whose name matches a case-insensitive list (`local.env`, `*.env`, SSH keys, `*.pem`, `*.srl`, `CLAUDE.local.md`, `privacy.local.txt`). Today: only `.gitignore`, which `git add -f` skips — done 2026-10-29: `NEVER_COMMIT` in `test/privacy/scan.js`, the same names in `.gitignore`
- ✅ Privacy scan, stronger (N06): `gitleaks` (development only), private terms matched after NFC normalisation, file names read with `git ls-files -z`, an unreadable file counted as a finding, and a set of cases in `test/privacy/cases/` that must and must not match. Today: generic patterns and `privacy.local.txt` (the one list outside the repository), but no `gitleaks` and no cases that prove the patterns work — done 2026-10-29: the scan in `test/privacy/scan.js` (`-z`, NFC, unreadable files and bad expressions as findings, more secret formats); its cases in `test/privacy.test.js` (in the test, not a `cases/` folder: files with accents, forced adds and unreadable ones only exist in a throwaway repository); gitleaks 8.30 over the history, the uncommitted changes and the new files, proved first on a throwaway repository with a token in each place (skipped when not installed)
- ✅ Shared Claude Code settings (N07): `.claude/settings.json` with `permissions.deny` for secret paths, a `PreToolUse` hook that blocks reading or writing them, and a `Stop` hook that warns about uncommitted work. Today: only an untracked `.claude/settings.local.json` — done 2026-10-29: `.claude/settings.json` (36 deny rules), `.claude/hooks/guard-secrets.js` and `stop-uncommitted.js`, `test/hooks.test.js`; hooks in `.claude/hooks/`, not `scripts/hooks/` (kept for the git hooks of N04)
- ✅ External input rule and attack test (N14): a rule in `CLAUDE.md` (size caps, paths confined to the circuit's folder, no `eval` or `new Function` on input) and a test that feeds hostile circuits, operations and sketches. Today: `src/sim/program.js` runs the translated sketch with `new Function`, `src/sim/compile.js` reads `"program"` with `join(folder, name)`, so `../` leaves the folder, and nothing caps the size of a circuit, a sketch or an operation list — done 2026-10-29: `src/limits.js`, the program file confined (`SIM_PROGRAM_OUTSIDE`), the translator writes only names of its own (`$`), `Serial.<method>`, numeric indexes and strings in `__str`; `test/attack.test.js`. On the way: `x / a[i]` with integers indexed the quotient; the index now belongs to its array
- ✅ Dependency licence check, offline (O02): a test that reads the installed `node_modules` (root and `mcp/`) and fails on a licence outside an allowed list, with `license-exceptions.json` for the known ones (`@resvg/resvg-js`, MPL-2.0). Today: the licences were reviewed by hand once (stage 6, A); nothing checks a new dependency — done 2026-10-29: `test/licenses.test.js` over both lockfiles (no install needed), `license-exceptions.json` with `@resvg/resvg-js` tied to development or optional use; also checks that the root has no runtime `dependencies`

**B · No false green** ✅ (2026-10-29)
- ✅ Git hooks (N04): `scripts/hooks/pre-commit` (privacy and fast tests) and `scripts/hooks/pre-push` (the whole verification), turned on by `scripts/setup.js` (`git config core.hooksPath scripts/hooks`). Today: no git hooks — done 2026-10-29: `scripts/hooks/`, `npm run setup` (and `-- --off`)
- ✅ One verification command with three exits (N05): `scripts/verify.js` (`npm run verify`) runs the steps of "How to verify a change" in `CLAUDE.md` and exits 0 (pass), 1 (fail) or 2 (a step could not run, for example the MCP server without `npm install`). Named `verify`, not `review`, because `review` is already the circuit review. Today: each step is run by hand and a skipped step looks like a pass — done 2026-10-29: `scripts/verify.js`; also the examples' issue counts against `test/fixtures/examples-issues.json` (`--write-examples`), and lint, knip, jscpd and coverage once Q01 landed
- ✅ README smoke block (N12): mark the README's try-it commands with `<!-- smoke -->` and run them in CI. Today: nothing proves those commands still work — done 2026-10-29: `<!-- smoke -->` in both READMEs, run by `test/readme.test.js` (part of `npm test`); it found the Spanish README promising "APPROVED" where the review says "APROBADO"
- ✅ Tests without the real clock (N15): `mock.timers` from `node:test`, unique temporary names per test, and a check that fails on `setTimeout` in `test/`. Today: `test/page.test.js` and `test/sliders.test.js` use the real clock — done 2026-10-29: `test/clock.js` installed in each jsdom window (`mock.timers` cannot reach a window's own timers), `test/clock.test.js` fails on a real-clock call without a `// real clock:` reason (a speed test and a file time keep one)
- ✅ Node tooling, development only (Q01): a linter (Biome), coverage thresholds with c8, `knip` that blocks on unused files and exports, `jscpd` for copies; strict `parseArgs` in `bin/`. Today: `node:test` only, no linter, coverage or dead-code check — done 2026-10-29: Biome lint only (`biome.jsonc`, dead code removed), c8 at 97/97/93/88 %, knip at zero (`@public` for the packages' primitives), jscpd under 1 % (0.10 % today), the CLI refuses unknown options and missing values (`test/cli.test.js`); `npm audit fix` for `undici` (root) and `body-parser`, `fast-uri`, `qs` (mcp/)
- ✅ Documents (Q05): `lychee --offline` (links and anchors) and `markdownlint-cli2` in `npm run verify`. Today: nothing checks the documents; relative file links resolve at `11d6de2`, anchors are unchecked — done 2026-10-29 with our own offline test instead (`test/docs.test.js`: 392 links, anchors by GitHub's slug, code blocks name their language, no doubled blank line); lychee and markdownlint-cli2 left out (see the decision log)
- ✅ Static agent test (A02): `test/agents.test.js` checks that each agent declares `model:` and that no agent sends the reader to a private file. Today: `npm run test:mcp` already fails when an agent names an MCP tool that does not exist or is not in its `tools:`, but `parts-librarian` has no `model:` and nothing catches it — done 2026-10-29: `test/agents.test.js`; `parts-librarian` got `model: sonnet`, and the three agents no longer send the reader to `CLAUDE.local.md` (half of N02)
- ✅ One status line per agent report (A04): every report (`LAYOUT REPORT`, `REVIEW REPORT`, the librarian's) ends in one `STATUS:` line, like `layout` already does, with a validator in `scripts/report-status.js` used by the agent bench. Today: the reports have fixed formats but no single last line to read and nothing that checks them — done 2026-10-29: the three report formats end in `STATUS:`, `scripts/report-status.js` checks it against the report; agents.md (en/es)

**C · CI and releases** ✅ (2026-10-29)
- ✅ CI (C01): `.github/workflows/ci.yml` runs `npm run verify` on push and pull request, with no `privacy.local.txt` (the privacy test must pass with the generic patterns alone) and with actions pinned by SHA. The same item as the CI of stage 6, D: do it once. Today: only `pages.yml`, which runs no tests — done 2026-10-29: Node 22 and 24 (Node 20 is out of support; `engines` raised to 22), gitleaks at 8.30.1 by checksum, the demo's actions pinned too; `test/ci.test.js`
- ✅ `.github/dependabot.yml` (C02): npm for the root and for `mcp/`, and `github-actions`. Today: none — done 2026-10-29: weekly, minor and patch grouped per ecosystem
- ✅ Protecting `main` (C03): `scripts/github-ruleset.js` (through `gh api`) for the owner to run: a ruleset for `main` (CI required, no force push) and secret scanning with push protection. Today: nothing protects `main` — done 2026-10-29: `scripts/github-ruleset.js` (shows the plan; `--apply` does it); admins may bypass, since the maintainer pushes to main; ⬜ the owner runs it with `--apply`
- ✅ `CHANGELOG.md`, version and tags (N11): a changelog from the version in `package.json`, a tag per stage or phase, `engines` that match what CI tests (root and `mcp/`). Shares the `CHANGELOG.md` and version 0.3.0 of stage 6, D. Today: no changelog, no tags, version 0.2.0 although the live page and the microcontrollers came after it — done 2026-10-29: `CHANGELOG.md` (0.1.0, 0.2.0, Unreleased), tags `v0.1.0` and `v0.2.0` on the commits that had those versions, `engines` >=22 in both packages, `test/changelog.test.js`; 0.3.0 stays with stage 6, D

**D · Context and agents** ✅ (2026-10-29)
- ✅ Closed `model:` and `tools:` per role (A01): each agent declares both, and the read-only reviewer gets no tool that writes. Today: `parts-librarian` has no `model:`, and `circuit-reviewer` (read-only, dry runs only) has `apply_ops`, which can also apply — done 2026-10-29: `parts-librarian` declares `model: sonnet`; the reviewer has `try_ops` (a new MCP tool: apply_ops as a dry run only) instead of `apply_ops`, and keeps Bash for the CLI's `--dry-run`; `test/agents.test.js` holds read-only roles to it
- ✅ Agent bench (A03): `scripts/agent-bench.js`, like `layout-bench.js`: three fixed briefs run with `claude -p --output-format json`, their status lines, calls and cost compared with the last run. Today: nothing measures whether a change to the kit made the agents better or worse — done 2026-10-29: `scripts/agent-bench.js` (plan by default, `--run` to spend), results in `.claude/state/agent-bench.json`; `test/agent-bench.test.js` checks it without running; ⬜ a first `--run` for a baseline
- ✅ Named options (A05): `project.json` with `review_rounds` (today "two rounds at most") and `briefs_per_agent` (when to start a fresh agent), cited by `CLAUDE.md`, `docs/en/agents.md` and the agents. Today: the limits are prose in several files — done 2026-10-29: `project.json` (`review_rounds` 2, `briefs_per_agent` 1, `context_kb` 48), cited by `CLAUDE.md` and agents.md (en/es); no prose repeats the numbers
- ✅ Generated options block in `CLAUDE.md` (N01): a block between `<!-- generated: project.json -->` markers, written from `project.json` and checked by a test. Today: none — done 2026-10-29: `scripts/project-options.js` (`npm run options -- --write`), `test/project.test.js` fails when it is stale
- ✅ `CLAUDE.local.md.example` and no private file in the agents (N02): add the example (300 words at most: what goes in the private file), and replace "read `CLAUDE.local.md` for the path" in the three agents with a generic hint (Node from a version manager may not be on `PATH`). Today: no example, and the three agents point to the private file — done 2026-10-29: the example (228 words), pointed at from `CLAUDE.md`; the agents part with A02
- ✅ Startup context budget (N08): a test that sums `CLAUDE.md`, the agents and `.mcp.json` against `context_kb` in `project.json`, and a way to read the real startup context from the status line. Today: nothing measures it — done 2026-10-29: `scripts/context-size.js` (44.0 KB today, `context_kb` 48), the real figure with `/context` in a session

**E · Usage** ✅ (2026-10-29)
- ✅ Usage log (B01): a `Stop` and `SubagentStop` hook (`scripts/hooks/usage.js`) that adds tokens, cost, calls and cache hit rate to an ignored `.claude/state/usage.jsonl`. Today: no record of what circuit work costs, so "circuit work should run on a small model" cannot be checked — done 2026-10-29: `.claude/hooks/usage.js` on Stop and SubagentStop (tokens, calls, tools, cache hit rate; cost stays null: transcripts carry no cost, the agent bench has it), `--summary`

**F · Process and documents** ✅ (2026-10-29)
- ✅ English–Spanish parity test (I01): every document in `docs/en/` has its copy in `docs/es/` (and `README`, `ROADMAP`, `PLANNING`, `examples/README`), with the same headings and code blocks; each pair declared once. Today: 22 pairs kept by hand, nothing checks them — done 2026-10-29: `test/parity.test.js`, pairs by their language links; it found four decisions missing from the Spanish log (added) and a sentence missing from the English circuit format (added)
- ✅ Status per decision (N09): every entry of the decision log in `PLANNING.md` (and `planeacion.md`) gets a status, and a replaced one says «replaced by N»; a test checks it. Today: entries have no status, so a reader cannot tell which ones still hold — done 2026-10-29: a status column in both logs (76 in force, 5 replaced in whole or in part), `test/decisions.test.js`
- ✅ Index of the documents (N18): `docs/en/README.md` and `docs/es/README.md` with a generated block, one line per document (title and what it is for), and a step in `npm run verify` that fails when it is stale. Today: the README and the code map link documents, but nothing lists them all — done 2026-10-29: `docs/en/README.md`, `docs/es/README.md`, `scripts/docs-index.js`; the check lives in `test/docs.test.js` (part of `npm test`, so of `npm run verify`)

## Optional, later ⬜

Ideas worth keeping, with no date. Pick them up after the stages above, or when a lesson
needs them.

- ⬜ **Parametric labels chosen by the user**: what each label shows, per circuit or per
  part (`name`, `value`, a custom title, a short description), with templates such as
  `"{id} · {value}"` or `"{name}: {description}"`, translated like the rest
- ✅ **Descriptions per part** in the circuit file (`"description": { "en": …, "es": … }`),
  shown in the page card after the kit's own description of each kind of part (`describe.*`, every
  language; `check` reports a missing language) (⬜ in labels and in `inspect`)
- ✅ **Clickable labels** in the interactive page: tap a label or a part to open a card (what
  it is, its description, its pins and their connections, values from the simulation when
  shown); ⬜ datasheet link
