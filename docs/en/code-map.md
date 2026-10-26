# Code map

*[Español](../es/mapa-del-codigo.md)*

Where everything lives and how the pieces talk to each other. Read this first when you come
back to the code (people and assistants alike); the design reasons are in
[PLANNING.md](../../PLANNING.md), the user guides in the other pages of `docs/`.

## Three pipelines

```
                        ┌─▶ checks (circuit/checks.js) ─▶ issues
circuit.json ─▶ build ──┤
 (circuit/build.js)     └─▶ parts + netlist ─┬─▶ scene (render/scene.js) ─▶ SVG (render/svg.js)
                                              │       ▲ layers: under, board, parts, labels, annotations,
                                              │       │ veil, strips, spotlight, flow, results, probes
                                              └─▶ simulate (sim/) ─▶ results ─┘
                                                                     └─▶ text (sim/format.js)

page (page.js) = interactive SVG per view + JSON for the card ─▶ out/<name>.html
                  └─ browser side: page/client/*.js (behaviour, bundled by node/bundle.js), page/style.js (CSS)
```

1. **Drawing.** `src/index.js` (`renderCircuit`, `sceneFor`, `addLayers`) builds the scene: the
   board and parts as primitives sorted by depth (painter's algorithm), labels as callouts above
   everything, then the optional layers. `render/svg.js` writes it. `inspect.js` measures the
   same scene, so numbers and picture never disagree.
2. **Simulation.** `sim/index.js` turns the netlist and each part's `def.electrical` (through its
   device, `sim/devices/`) into MNA
   elements (`sim/mna.js`), solves DC or transient, and reads results per node, part and pin.
   Drawing never depends on it; it only adds layers when asked.
3. **Page.** `page.js` renders each view with `interactive: true` (every element tagged with
   `data-part`, strips and probes ready but hidden) and writes a JSON (`#page-data`) with what
   each card says. `page/client/` only toggles classes and CSS rules; it never redraws.

## Modules

| Path | What it does |
|---|---|
| `core/` | vectors, isometric camera and views, units (`parseValue`, `formatValue`) |
| `geometry/primitives.js` | prisms, lathes, tubes, decals, text on planes (3D, millimetres) |
| `board/` | breadboards as data (`boards/bb830.js`), holes and groups, drawing the board |
| `parts/types/` | what a part *is*: value → bands, pins, label, `electrical` model (`battery.js`; `more.js`: inductor, thermistor, LDR, buzzer, header) |
| `parts/packages/` | physical shapes from datasheet sizes; `expandPin1` for DIP and headers; `battery.js` lies beside the board (its `build` gets the board); `small.js`: bead, LDR, buzzer, header; `trimmer.js`; `sip.js`: KBP bridge (`kbp`); `devboard.js` (ESP32 boards across the channel) `uno.js` (UNO beside the board) and `despi.js` (DESPI-C02 e-paper adapter and its panel), sharing `offboard.js` (printed text, Dupont lead); data in `parts/modules.js`; `axial.js` also draws cement resistors (`shape: 'box'`); `ams1117.js`: the AMS1117 module standing on right-angle pins (its parts one-sided, `side`); `switch.js`: KCD1 rocker and 7 × 7 latching button on the table, wired with `wireToHole` (`offboard.js`) |
| `parts/db.js` | part numbers: package, pin order, model; `lookupPartNumber` accepts other names (L7805CV, 2SC1815) |
| `parts/batteries.js` | battery formats and chemistries: sizes, voltage curve, internal resistance, capacity; `batteryModel` |
| `parts/sensors.js` | sensor formulas (NTC, photoresistor) and the GL55xx table; no imports, so the browser engine can bundle them |
| `parts/describe.js` | which `describe.*` text says what a kind of part is |
| `parts/colors.js` | every colour: materials, bands, LEDs, wires, nodes |
| `circuit/build.js` | circuit file → placed parts, netlist, issues |
| `circuit/checks.js` | placement checks (holes, leads, connections, bodies that collide, leads and jumpers through other parts), description languages |
| `render/scene.js` | painter's algorithm, label callouts, frame (`fit`) |
| `render/svg.js` | SVG writer; `tagParts` adds `data-part`; optional layers only when not empty |
| `render/focus.js` | veil, metal strips, column and row tags (`coords`), spotlight copies (static focus) |
| `render/coverage.js`, `inspect.js`, `annotate.js` | measuring the drawing; annotation layers |
| `ops.js`, `diff.js`, `node/workspace.js` | operations with inverses, dry-run diff, history, undo, outputs; `relayoutTarget` (layout again as one revision) |
| `parts/resolve.js` | a part from what a person writes (`resolvePart`: part number, module, alias like KCD1 or resistencia; `closestNames` when unknown), `pinsOf`; aliases in `PART_ALIASES` |
| `parts/pin-names.js` | a pin from what a person writes (`findPin`: exact name ignoring case, then synonyms like K/cathode, DISCH/DIS, VDD/VCC, then GPIO numbers on boards; nothing when not unique); used by circuits, `query`, `suggest` and `layout` |
| `recipes/` | lesson circuits as layout specs, one data module each (`led-resistor.js`, `npn-switch.js`…); `index.js`: the registry, `expandRecipe` (name + values → spec, only the values each recipe lists), `resolveRecipe` (a layout request with `recipe` → spec, for the CLI and MCP), the catalog's entries ([recipes.md](recipes.md)) |
| `layout.js` | a whole circuit from its parts and nets (`validateSpec` first: every problem at once; `autoLayout`: layers, placement rules checked by geometry only, jumpers, relayout while the review blocks), `checkNets` (nets asked vs built), `formatLayout`; CLI `layout`, MCP `layout`; how it works and how to change it: [layout.md](layout.md), bench `npm run layout-bench` |
| `query.js`, `query-format.js`, `review.js` | questions, placements (`suggest`, `suggestMany`; groups by hole, name or placed pin; room kept for later connections with probe jumpers, one level of look-ahead, `reasons` when nothing fits), verdict from measurements (blocking items with their parts and views) |
| `nets.js` | the circuit as nets: groups joined by jumper wires, with their pins (MCP `netlist`, CLI `nets`); `checkNets`: nets asked for against the circuit (used by `layout` and by `review` for a circuit's `spec`) |
| `node/catalog.js` | what the kit knows, compact or one entry in detail with its fields (`TYPE_FIELDS`, kept in step with the schema by a test) and an example from `examples/` |
| `schema.js` | JSON Schemas built from the registries (`npm run schemas`) |
| `sim/models.js` | typical device values, each with its source (diodes, Zener table, LEDs, transistors, regulators) |
| `sim/mna.js` | linear solver, stamps, element companions (capacitor, inductor), junction with Zener breakdown, regulator, Newton, source stepping |
| `sim/index.js` | supplies, parts → elements through their devices, floating groups (anchored in DC), DC and transient, readings, warnings from stresses |
| `sim/devices/` | one file per kind of part: elements, reading, limits as stresses, card lines, current tag, probe text; `index.js` lists them and describes the interface; `shared.js` the common helpers; a device may `accept` only some parts of its type (`timer.js` takes the NE555 among the ICs, `opamp.js` the op-amps and comparators, `mcu.js` the microcontroller boards: pins in their `io` state, the board on USB as a source, its program run by `sim/program.js` from the JavaScript `sim/sketch.js` made of the Arduino sketch); the program records each part's device by its kind (`deviceOfProgram`) |
| `sim/format.js` | results as text; `partLines` for the card (each with an explanation key) |
| `sim/overlay.js` | result tags (current per part, voltage per group) with `data-q` and `data-probe` |
| `sim/look.js`, `sim/lines.js` | bundleable: voltage colours, dot speed, body shading, glow and heat (look); a part's card lines with the texts passed in (lines) |
| `page/client/live.js` | the live page: runs the engine, moves dots, repaints colours, tags and card, time controls |
| `page/client/controls.js`, `page/client/limits.js` | live page: sliders (card and `page.controls` panel) and the momentary button; stress outlines (`#stress` rules), latched marks and the warnings panel (in `.side`) |
| `sim/controls.js` | bundleable: supplies' controls, slider maths (log, E24), stress levels; each device's own controls are in its module (`controls`, `set`) |
| `sim/paths.js` | conductor view: current paths per part (package `paths` or a straight fallback), strip currents (Kirchhoff), voltage colours, dots of conventional current |
| `sim/probes.js` | "where a value comes from": probes for voltages, arrows for currents |
| `page.js`, `page/client/`, `page/style.js` | the embeddable page; `page/client/main.js` is the entry of its script (view, focus, card, tooltip modules); `view.js`: frame, gestures by context, zoom buttons; `bar.js`: the ⋯ menu (`page.menuAdd`) and the first-time hint; `icons.js`: the line icons, shared with `page.js`; `inspector.js`: the box of the card (`.info`) and the circuit's panels (`.side`), tabs, panel or bottom sheet, keeping the selected parts in view |
| `scripts/ux-shots.js` | screenshots of pages at five sizes, alone and inside a note (a Playwright snippet), for the UX pass |
| `node/bundle.js` | the small bundler: allowed ES modules → one classic script for the page (engine, page script) |
| `sim/generator.js` | the signal generator (bundleable): its waves (Falstad's), its peak; the engine sets the source to `waveAt` before each step |
| `sim/recorder.js`, `sim/scope.js`, `page/client/scope.js` | oscilloscope (bundleable): recording per part (and per strip in use, key `node:<group>`) from the start, what each kind plots (`scope` hook), the drawing in the card (a list of traces, 10 × 4 screen) |
| `page/client/view.js` `stripAt`, `page/client/card.js` `selectNode`, `sim/lines.js` `nodeLines` | a strip's card (phase 9): the tap found by position in `hits` (the strips lie under the parts), what is clipped to it, its voltage to ground and the current of each lead |
| `sim/falstad.js`, `sim/falstad-layout.js`, `page/client/falstad.js` | export to Falstad's CircuitJS (bundleable): each device writes its part with `falstad(d, f)`; the layout draws it as a schematic (nets as rows by voltage, series parts in one column, the column order with the fewest crossings); the live page's *Open in Falstad* button and its notes. Cross-check: `test/falstad/`, `scripts/falstad.js` ([falstad.md](falstad.md)) |
| `sim/compile.js`, `sim/engine.js` | compile: circuit → program (plain JSON, Node only); engine: runs a program (no dependencies, bundled into pages) |
| `i18n/` | every sentence; `pickLanguage` decides the language |
| `bin/protoboard-iso.js` | command line |
| `mcp/server.js`, `mcp/tools.js`, `mcp/kit-worker.js` | MCP server (own package): `tools.js` defines the tools, which call the same functions; `server.js` registers them and runs them in a worker it restarts when the kit's code changes |

## Conventions that are easy to break

- **Language.** `pickLanguage(asked, circuit.lang, default)`: an explicit `--lang` / MCP `lang`
  wins, then the circuit's `lang`, then the default (English, or `PROTOBOARD_LANG` in the MCP
  server). Files written after a change use the same rule (`outputLang` in `workspace.js`).
- **Texts for learners** live in `src/i18n`, never in code: `describe.*` (what a kind of part is),
  `explain.*` (what a value means), `probe.*` (where a value comes from), `page.*`, `sim.*`.
  Every kind of part needs its `describe.*` in every language (a test checks it).
- **Circuit texts**: `title` and each part's `description` are a plain string (shown as it is) or
  one text per language (`check` reports a missing one). A part's `description` is how it is used
  in *this* circuit; leave it out when the learner should find it out.
- **Off-board parts** (batteries) are drawn like any part; `sceneFor` sends the pieces that lie
  beyond a side face of the board, on the far side from the camera, to the `under` layer, painted
  before the board. Anything that looks at part layers (inspect, spotlight, the page script)
  reads `under` and `parts` together.
- **Painter's order**: whole primitives are sorted by the centre of their faces, so a long
  piece next to small ones is cut in slices (battery cells, holder walls). Before adding a sort
  hint, check whether the geometry itself is right: the + button over the holder wall was really
  visible, because the wall was too low for a view from 35° above.
- **Parts resting on others**: a primitive can name its support with `on` (a primitive or a
  list): a chip on a PCB, the can on the ESP32 module, a PCB on its header strips. The painter
  draws it after its support whatever their centres say (`supportsFirst` in `render/scene.js`).
  Use it for anything built on a large flat piece; slicing (as the battery cells) is for long
  pieces next to small ones.
- **Parts on one side of a standing board** (the AMS1117 module) also set `side`, the normal of
  that side: seen from that side the painter draws them after the board (`on`); from the other,
  just before it, so the board covers them and only what sticks out beside it shows.
- **Marks repeated around a round part** (the electrolytic's value) set `minFacing` on the decal:
  it shows only when it faces the viewer that squarely. The isometric views look at 45° to the
  board, so copies near the diagonals give exactly one per view.
- **Power sources**: the first of `supplies` sets ground; with none, the first battery part.
  Code that needs "where the supply is" (ground probe, flow) must handle both.
- **Layers** are always written in the order of `addLayers`: veil, strips, coords, spotlight, flow,
  marks (live page: a hidden box around each part, shown when it nears or passes a limit),
  spotlabels (copies of the focused parts' labels, above the current), results, probes. A page shows or hides them with CSS only; new interactive features should
  follow the same idea (tag in the SVG, rule in CSS). Coordinate tags sit under the spotlight
  copy so they never cover the part being explained, but result tags may still cover them: a
  known limit, left for a planned pass on what covers what (see the roadmap, visual style).
- **Data attributes**: `data-part` (part id), `data-node` (group), `data-q` (quantity of a result
  tag, also its explanation key), `data-probe` (`node:<group>` or `part:<id>`), `data-flow`, `data-col` / `data-row` (coordinate tags).
- **Results are a model** and may give away a prediction: drawn only on request (`sim`, `flow`),
  in a page whenever the circuit can be simulated (`pageSimulation` in `sim/index.js`: results
  always on and the Current button by default with a source; `page.results: false`,
  `page.flow: false`, or `page.simulation: false` for both), and only for the tapped part. Lit LEDs
  are the `lights` layer (`lightOps` in `sim/paths.js`), drawn with the results.
- **Controls** (`controls`, `set` in a device) run in the page: `set` is a pure formula and may
  only import bundleable modules (`ALLOWED` in `node/bundle.js`). A device that adds elements in a
  different order after a change loses their state on `engine.set` (it is matched by order).
- **Painting order of the conductor view** (`flowOps`, `paintOrder` in `sim/paths.js`): strips
  first (they lie inside the board), then one line per pin, ordered where two lines meet on screen
  by which is nearer there (a topological sort, per view); the middle depth only for what that
  leaves open. Do not sort by the middle alone: long pieces (a resistor) came out over a jumper
  crossing them. The page finds pieces by `data-wire` / `data-seg`, never by their order.
- **No CSS filters on animated pages** (`drop-shadow`, `blur`): the whole SVG is redrawn on every
  frame the dots move, and a filter is recomputed each time (an outline made with one made the
  page crawl). Draw the shape once in a layer and change its `display`, `stroke` or `opacity`;
  animate in a few `steps()`. The dots skip offset changes too small to see.
- **SVG elements have no `hidden` property**; use the attribute. Test page scripts with jsdom
  (`test/focus.test.js`), which follows the DOM specification; `loadPage(html, { embedded: true })`
  in `test/page.test.js` loads a page inside an iframe.
- **Colours of the page are tokens** (`page/style.js`, `:root`, light and dark): never a hex value
  outside the token blocks (`test/page.test.js` checks). The drawing's colours in the page are
  changed by CSS over the SVG's presentation attributes (background, veil, labels, result tags by
  `data-q`), so the static SVG never changes. Client code sets classes, not colours (the scope:
  `kind: 'v' | 'i'`; limits: `var(--warn)`).
- **The bar** (`page.js`, UX pass U3): a button for two states carries `data-key`, `data-on` and
  `data-off` (main.js toggles between them and sets `aria-pressed`); choices in the ⋯ menu are
  `role="menuitemradio"` with `data-value` (`aria-checked`). Labels sit in `.label` (hidden on a
  narrow screen, so every button has a `title`). Modules put rarely used things in the menu with
  `page.menuAdd(el)`, never as new bar groups.
- **The inspector** (`inspector.js`, U4): card.js fills `.info`, the live modules put their panels in
  `.side` (`page.side`); neither positions anything. card.js calls `page.cardChanged()` after a card
  opens or closes; panels that appear or hide are seen by a MutationObserver. The card's head
  (`.head`: title and icon buttons) and `.summary` are what a peeking sheet shows, so keep them first.
- **Moving the frame** (`view.js`, U5): gestures use `setBox` (at once, and it stops any motion);
  buttons and code that move the frame for the learner use `frameTo` (220 ms, interruptible).
  Changing the view goes through `flipView` + `flipFrame` (immediate); `show()` in main.js changes the frame
  only when the view or the framing changed.
- **The views are `main > svg`**: buttons carry small svg icons too, so never select `main svg`.
  Interface boxes inside `main` (the inspector, the zoom buttons) are listed in `page.inChrome`, so a
  tap or a gesture on them is not a tap on the board.
- **Gestures by context** (`page/client/view.js`, UX pass U1): `page.embedded` (inside an iframe and
  not full screen) and `body.embedded`; embedded, touch goes through the touch events (one finger is
  left to the browser, two are handled), the plain wheel is not prevented. Check gesture changes in
  a real browser too (`scripts/ux-shots.js`, CDP touch emulation): jsdom does not scroll.
- **The agents depend on the kit** (`.claude/agents/*.md`): change them with any tool, command,
  operation or format change; `npm run test:mcp` catches tools that no longer exist.

## Tests

`npm test` (node:test, no dependencies; jsdom only for page scripts) and `npm run test:mcp`.
Simulator models are checked against independent references in `test/sim.test.js` and
`test/sources.test.js` (batteries, Zener, regulators, inductors, sensors), and against Falstad's CircuitJS in `test/falstad.test.js` (stored references, offline); page
behaviour in `test/focus.test.js` and `test/page.test.js`; texts in `test/describe.test.js` and
`test/i18n.test.js`.
