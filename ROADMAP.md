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
- ✅ Results in the CLI and MCP (`simulate`, text or JSON) and in the embeddable page behind a button, only when the circuit asks (`"page": { "results": true }`)
- ⬜ Compare a few circuits with Falstad CircuitJS as a second reference
- ⬜ Events during a transient (press a button at a given time), and a chart of the transient in the page
- ⬜ Chips: behavioural 555 and op-amp
- ⬜ Development boards in the simulation (level 2, with the complete electrical simulation): each pin's state set in the circuit (`"D13": "high"`, PWM duty), outputs as sources with their own resistance, inputs high-impedance with optional pull-up, 5V and 3V3 pins as regulators with their limits; warnings for current per pin, 5 V into a 3.3 V pin, an output shorted to ground. Running real firmware (avr8js for the UNO, Wokwi for the ESP32) is a later, separate step
- ✅ Inductors (axial, colour rings in µH; winding resistance; transient), Zener diodes (1N47xxA, breakdown with a soft or sharp knee), linear regulators (78xx, LM317, with dropout and their own current), NTC thermistor and photoresistor (resistance from `temperature` / `light`), passive buzzer (warns on DC)
- ✅ Batteries drawn as parts and simulated as sources: format, chemistry, cells in series, state of charge, measured voltage, holder switch; runtime estimate; warnings for short circuit, over-current, charging an alkaline cell ([simulation.md](docs/en/simulation.md))

## Parts and sources, next ⬜

From the course inventory, in rough order of use:

- ✅ Development boards, drawn and checked (level 1): ESP32 DevKit (30 pins) and ESP32-C3 SuperMini straddling the channel by `pin1`, with a `rowSpacing` because boards differ; Arduino UNO beside the board, only the pins in use wired with Dupont leads; a note per pin in the card (strapping pins, input only, ADC2 and Wi-Fi, PWM…). Examples `esp32-led.json`, `uno-led.json`
- ⬜ Other modules: AMS1117-3.3 and LM2596 regulators, TP4056 charger
- ⬜ Bench supply drawn beside the board, its leads clipped to the rails (today `supplies` is not drawn)
- ⬜ Battery discharge over time in a transient (charge falling with the current drawn), for runtime lessons
- ⬜ Step-up (boost) converter module, as a behavioural source
- ✅ KBP bridge rectifier (`bridge`: four diodes in one body, simulated), cement resistors (3, 5, 10 W, value printed on top); example `rectifier.json`
- ✅ Battery holders: end walls as tall as the cells, so the + button never peeks over them
- ⬜ Coin cell (CR2032) in its holder

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
- ⬜ Dark theme for screens

## Stage 3 — Animation in the browser ⬜

Goal: see the circuit work.

- ⬜ Browser module rendering the same scene into a live SVG (or canvas) each frame
- ✅ Current layer (`page.flow`): everything dimmed, strips shown, dots along strips and through parts, speed from the current (log scale), electrons from − to + or conventional current; Kirchhoff along each strip
- ⬜ Dots along the real path of leads and wires (today: straight lines at board level)
- ⬜ Voltage as colour on strips and leads, with a fixed scale
- ⬜ LED brightness from its current; heat tint from power
- ⬜ Sliders for values and supply voltage, re-solving instantly

## Stage 4 — On a phone or tablet ⬜

Goal: open a link and explore.

- ⬜ Single-file interactive page (no build step): grows the embeddable page of stage 1, same file name, so existing embeds keep working
- ⬜ Dynamic zoom: pinch and wheel zoom, pan, double-tap a part to zoom to it; more detail as you zoom in (hole numbers, part markings)
- ⬜ Labels on hover or tap only (the static SVG keeps the callouts above the parts)
- ⬜ Virtual multimeter: probes on holes, voltmeter in parallel, ammeter needs the circuit opened
- ✅ Toggle front/back view; tap a part to bring it and its strips forward
- ⬜ Tap a strip to highlight everything connected to it
- ⬜ Prediction mode: readings hidden until the learner commits to an answer

## Stage 5 — Faster authoring ⬜

- ⬜ Templates: common circuits where only values change (LED + resistor, divider, RC, transistor switch)
- ⬜ Automatic placement from a netlist ("R1 between 5V and n1"), respecting `clearance` so lessons are never cramped
- ⬜ Adapters: import/export Wokwi `diagram.json`; export a Falstad CircuitJS link

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
