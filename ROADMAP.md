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
- 🔜 Chips: behavioural 555 ✅ (2026-10-26: `sim/devices/timer.js`, comparators at CTRL and CTRL/2 with the internal 5 kΩ divider, a latch that changes between time steps, output and discharge stages from the NE555 datasheet; the `555-astable` recipe blinks in the live page; tested against f = 1.44 / ((R1 + 2·R2)·C)); op-amp next. The 555 has no conductor-view paths yet
- ⬜ Development boards in the simulation (level 2, with the complete electrical simulation): each pin's state set in the circuit (`"D13": "high"`, PWM duty), outputs as sources with their own resistance, inputs high-impedance with optional pull-up, 5V and 3V3 pins as regulators with their limits; warnings for current per pin, 5 V into a 3.3 V pin, an output shorted to ground. Running real firmware (avr8js for the UNO, Wokwi for the ESP32) is a later, separate step
- ✅ Inductors (axial, colour rings in µH; winding resistance; transient), Zener diodes (1N47xxA, breakdown with a soft or sharp knee), linear regulators (78xx, LM317, with dropout and their own current), NTC thermistor and photoresistor (resistance from `temperature` / `light`), passive buzzer (warns on DC)
- ✅ Batteries drawn as parts and simulated as sources: format, chemistry, cells in series, state of charge, measured voltage, holder switch; runtime estimate; warnings for short circuit, over-current, charging an alkaline cell ([simulation.md](docs/en/simulation.md))

## Parts and sources, next ⬜

From the course inventory, in rough order of use:

- ✅ Development boards, drawn and checked (level 1): ESP32 DevKit (30 pins) and ESP32-C3 SuperMini straddling the channel by `pin1`, with a `rowSpacing` because boards differ; Arduino UNO beside the board, only the pins in use wired with Dupont leads; a note per pin in the card (strapping pins, input only, ADC2 and Wi-Fi, PWM…). Examples `esp32-led.json`, `uno-led.json`
- ✅ GooDisplay DESPI-C02 e-paper adapter beside the board (right-angle pins with Dupont leads, RESE switch, test pads, FPC connector) and, when asked, the 7.5" GDEY075T7 panel on its flat cable (`panel: true`); card "Adapter board". Example `epaper-esp32.json`
- ⬜ Bench supply drawn beside the board, its leads clipped to the rails (today `supplies` is not drawn)
- ⬜ Battery discharge over time in a transient (charge falling with the current drawn), for runtime lessons
- ⬜ Step-up (boost) converter module, as a behavioural source
- ✅ KBP bridge rectifier (`bridge`: four diodes in one body, simulated), cement resistors (3, 5, 10 W, value printed on top); example `rectifier.json`
- ✅ Battery holders: end walls as tall as the cells, so the + button never peeks over them
- ⬜ Coin cell (CR2032) in its holder

What the course bench has and the kit does not yet draw (from the inventory, 2026-10-16):

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
- ⬜ Instruments on the circuit: multimeter leads on a strip (stage 4's virtual multimeter), the oscilloscope probe and the ZT-703S generator output, logic analyzer leads

## Faster circuits for lessons (from the two-rail supply test) ⬜

On 2026-10-16 a fresh `circuit-layout` rebuilt the M2 two-rail supply from the learner's notes and
photo: 19 min, 68 calls, about 185 000 tokens (half a session's budget) to copy the photo, and the
result passed review with resistors crossing other parts, three parts stood in by pin headers and
no simulation (the switch is missing). The maintainer's rule from then on: **the same function, not
the same picture**. Kept as it came out (`m2-fuente-dos-rieles` in the course's `circuitos/`, revision 6) to rebuild it
with the improvements below and compare.

- ✅ Brief: `Target: <name>` without a `circuits/` prefix; `Fidelity: functional` by default; the layout agent checks every part with `catalog` first and gives up a constraint after three attempts ([agents.md](docs/en/agents.md))
- ✅ The MCP server reloads when the kit's code changed since it started: its tools run in a worker that it restarts (`mcp/kit-worker.js`), and that answer says so; a changed list of tools still asks for a reconnect ([mcp.md](docs/en/mcp.md))
- ✅ The MCP drops a `circuits/` (or the root's own name) prefix that does not exist under the root (it nested `circuitos/circuits/…`); `targetArg`'s example no longer suggests it
- ⬜ Labels on any group, not only rails (`netLabels` for strips, e.g. `"8:a-e": "TP3"`), drawn on the board and in the card, checked by the reviewer: test points are what measuring lessons are about
- ✅ Leads and jumpers that pass through another part are warnings (`LEAD_THROUGH_PART`, `WIRE_THROUGH_PART`, `checkCrossings`: lead samples against the other parts' convex primitives), so every profile blocks them and `suggest` avoids them; it found the R2 lead through the header in `m2-fuente-dos-rieles`, and two kit examples (fixed)
- ✅ `suggest` gives each placement its nearest body and gap (`nearest`), takes a review `profile` (leaves out what it would block, both views) and measures more candidates (up to 48) while fewer than `limit` pass
- ✅ Place several parts at once: `suggest` with `parts` (CLI `--parts`), each placed given the ones before it, answered as one batch of adds; groups can be named by a placed pin (`R1.2`, `U1.OUT`) everywhere
- ✅ `review`: each blocking item names its `parts` and `views`; `--explain` (`explain: true`) adds the profile's rules
- ✅ `catalog`: a compact list by default (2 KB instead of 20); `name` (a type, part number or module) for its pins, package, fields and a real example from `examples/`; the full registry with `format: "json"` (`src/node/catalog.js`)
- ✅ MCP tool `netlist` (CLI `nets`): nets as groups joined by wires, with their pins, labels and the pins alone on a net (`src/nets.js`)
- ⬜ A "stands for" marker for a part the kit still lacks: drawn flat, no collisions, named in the card (only while the part is pending)
- ⬜ Photos: a table for the course's board standing up (left rail = B+/B−, right = T−/T+; the photo's rows are the kit's columns) and an annotated grid render to compare with a photo
- ⬜ Measure again: rebuild `m2-fuente-dos-rieles` with these improvements (`Fidelity: functional`) and compare time, calls and tokens

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
- ⬜ U7 · Try it with the maintainer on a phone, an iPad and inside Trilium, and adjust

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

## Stage 6 — Publishing ⬜

- ⬜ First public release on GitHub, v0.x; issue templates; contribution guide
- ⬜ npm package; versioned circuit format with migration notes
- ⬜ Example gallery site

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
