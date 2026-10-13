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
- ⬜ LED: longer anode lead when `standoff` is high
- ✅ Electrolytic: "−" marks on the stripe
- ⬜ Electrolytic: value printed on the sleeve
- ✅ Label modes: `labels: 'both' | 'id' | 'value' | false` (`--labels`, MCP `render`)
- ⬜ Check rail order and colours against the maintainer's real board (`bb830.js`)
- ✅ Potentiometer (standing, knob to the front, wiper mark), push button 6×6 across the channel (inner pairs, `SWITCH_BYPASSED`), DIP chips placed by `pin1` (NE555, LM358, 74HC595, CD4017); `suggest` places them; example `controls-and-ics.json`
- ⬜ More packages: trimmer potentiometer, header pins, buzzer, 9 V battery clip, DIP-14 parts
- ⬜ Painter: sort jumper wires against tall parts more robustly (split long arcs, depth bias)
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

## Stage 2 — Simulation (DC first) ⬜

Goal: voltages at every node and current through every part, computed by the kit.

- ⬜ Sources: bench supply on the rails (`supplies` field), battery part
- ⬜ MNA solver, linear DC: resistors, wires, voltage sources (`src/sim/`)
- ⬜ Diodes and LEDs: Shockley model, Newton iteration, per-colour parameters
- ⬜ Capacitors: transient analysis, backward Euler
- ⬜ MOSFET (square law) and BJT (Ebers–Moll simplified)
- ⬜ Every part model verified once against a reference (Falstad or a textbook value) and kept as a test
- ⬜ Static results on the SVG: node voltages, part currents, power; marked as **model**
- ⬜ Results exposed by `inspect` and the MCP tools (voltages and currents per node and part)

## Visual style and themes (cross-cutting, after stage 2) ⬜

Goal: drawings that teach first. Realism where it helps to recognise a part; calm
everywhere else so the parts stand out.

- ⬜ Theme system: every colour from a named palette (`theme: 'realistic' | 'study' | …`), no colour hard-coded in packages
- ⬜ `study` theme: a less realistic, more aesthetic breadboard (flat, muted body, lighter holes and print, softer edges) so components and wires stand out
- ⬜ Review part palettes (wires, LEDs, bands) for contrast and colour-blind safety; keep resistor bands faithful to IEC 60062
- ⬜ Highlight mode: dim everything except the parts or strips being explained
- ⬜ Dark theme for screens

## Stage 3 — Animation in the browser ⬜

Goal: see the circuit work.

- ⬜ Browser module rendering the same scene into a live SVG (or canvas) each frame
- ⬜ Electron dots along leads and wires, speed ∝ current, direction from − to +
- ⬜ Voltage as colour on strips and leads, with a fixed scale
- ⬜ LED brightness from its current; heat tint from power
- ⬜ Sliders for values and supply voltage, re-solving instantly

## Stage 4 — On a phone or tablet ⬜

Goal: open a link and explore.

- ⬜ Single-file interactive page (no build step)
- ⬜ Dynamic zoom: pinch and wheel zoom, pan, double-tap a part to zoom to it; more detail as you zoom in (hole numbers, part markings)
- ⬜ Labels on hover or tap only (the static SVG keeps the callouts above the parts)
- ⬜ Virtual multimeter: probes on holes, voltmeter in parallel, ammeter needs the circuit opened
- ⬜ Toggle front/back view; tap a strip to highlight everything connected to it
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
- ⬜ **Descriptions per part** in the circuit file (`"description": { "en": …, "es": … }`),
  shown in labels, in `inspect` and in the interactive page
- ⬜ **Clickable labels** in the interactive page: tap a label or a part to open more
  information (what it does, its pins and their connections, datasheet link, values from the
  simulation)
