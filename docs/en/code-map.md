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
                                              │       ▲ layers: board, parts, labels, annotations,
                                              │       │ veil, strips, spotlight, flow, results, probes
                                              └─▶ simulate (sim/) ─▶ results ─┘
                                                                     └─▶ text (sim/format.js)

page (page.js) = interactive SVG per view + JSON for the card ─▶ out/<name>.html
                  └─ browser side: page/script.js (behaviour), page/style.js (CSS)
```

1. **Drawing.** `src/index.js` (`renderCircuit`, `sceneFor`, `addLayers`) builds the scene: the
   board and parts as primitives sorted by depth (painter's algorithm), labels as callouts above
   everything, then the optional layers. `render/svg.js` writes it. `inspect.js` measures the
   same scene, so numbers and picture never disagree.
2. **Simulation.** `sim/index.js` turns the netlist and each part's `def.electrical` into MNA
   elements (`sim/mna.js`), solves DC or transient, and reads results per node, part and pin.
   Drawing never depends on it; it only adds layers when asked.
3. **Page.** `page.js` renders each view with `interactive: true` (every element tagged with
   `data-part`, strips and probes ready but hidden) and writes a JSON (`#page-data`) with what
   each card says. `page/script.js` only toggles classes and CSS rules; it never redraws.

## Modules

| Path | What it does |
|---|---|
| `core/` | vectors, isometric camera and views, units (`parseValue`, `formatValue`) |
| `geometry/primitives.js` | prisms, lathes, tubes, decals, text on planes (3D, millimetres) |
| `board/` | breadboards as data (`boards/bb830.js`), holes and groups, drawing the board |
| `parts/types/` | what a part *is*: value → bands, pins, label, `electrical` model |
| `parts/packages/` | physical shapes from datasheet sizes; `expandPin1` for DIP |
| `parts/db.js` | part numbers: package, pin order, model |
| `parts/describe.js` | which `describe.*` text says what a kind of part is |
| `parts/colors.js` | every colour: materials, bands, LEDs, wires, nodes |
| `circuit/build.js` | circuit file → placed parts, netlist, issues |
| `circuit/checks.js` | placement checks, description languages |
| `render/scene.js` | painter's algorithm, label callouts, frame (`fit`) |
| `render/svg.js` | SVG writer; `tagParts` adds `data-part`; optional layers only when not empty |
| `render/focus.js` | veil, metal strips, spotlight copies (static focus) |
| `render/coverage.js`, `inspect.js`, `annotate.js` | measuring the drawing; annotation layers |
| `ops.js`, `diff.js`, `node/workspace.js` | operations with inverses, dry-run diff, history, undo, outputs |
| `query.js`, `query-format.js`, `review.js` | questions, placements, verdict from measurements |
| `schema.js` | JSON Schemas built from the registries (`npm run schemas`) |
| `sim/models.js` | typical device values, each with its source |
| `sim/mna.js` | linear solver, stamps, element companions, Newton, source stepping |
| `sim/index.js` | supplies, parts → elements, floating groups, DC and transient, readings, warnings |
| `sim/format.js` | results as text; `partLines` for the card (each with an explanation key) |
| `sim/overlay.js` | result tags (current per part, voltage per group) with `data-q` and `data-probe` |
| `sim/flow.js` | current along strips (Kirchhoff) and through parts; moving dots |
| `sim/probes.js` | "where a value comes from": probes for voltages, arrows for currents |
| `page.js`, `page/script.js`, `page/style.js` | the embeddable page |
| `i18n/` | every sentence; `pickLanguage` decides the language |
| `bin/protoboard-iso.js` | command line |
| `mcp/server.js` | MCP server (own package); tools call the same functions |

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
- **Layers** are always written in the order of `addLayers`. A page shows or hides them with CSS
  only; new interactive features should follow the same idea (tag in the SVG, rule in CSS).
- **Data attributes**: `data-part` (part id), `data-node` (group), `data-q` (quantity of a result
  tag, also its explanation key), `data-probe` (`node:<group>` or `part:<id>`), `data-flow`.
- **Results are a model** and may give away a prediction: drawn only on request (`sim`, `flow`),
  in a page only when the circuit asks (`page.results`, `page.flow`) and only for the tapped part.
- **SVG elements have no `hidden` property**; use the attribute. Test page scripts with jsdom
  (`test/focus.test.js`), which follows the DOM specification.
- **The agents depend on the kit** (`.claude/agents/*.md`): change them with any tool, command,
  operation or format change; `npm run test:mcp` catches tools that no longer exist.

## Tests

`npm test` (node:test, no dependencies; jsdom only for page scripts) and `npm run test:mcp`.
Simulator models are checked against independent references in `test/sim.test.js`; page
behaviour in `test/focus.test.js` and `test/page.test.js`; texts in `test/describe.test.js` and
`test/i18n.test.js`.
