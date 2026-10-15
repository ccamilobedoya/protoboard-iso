# Planning: architecture, decisions and practices

*[Español](docs/es/planeacion.md)* · Stages and status: [ROADMAP.md](ROADMAP.md) · Full
architecture: [docs/en/architecture.md](docs/en/architecture.md)

## 1. Purpose

Help people learn electronics by **seeing** circuits as they are really built on a
breadboard: real sizes, real colour bands, real orientation. Later, see them work
(current flowing, voltages as colour), like the Falstad simulator, but on the physical
layout instead of a schematic.

The kit is used in two ways, and both shape the design:

1. **By an AI assistant, as a skill.** The assistant writes ~15 lines of JSON; the kit does
   every calculation. The assistant must never compute geometry, colour codes or electrical
   values by hand. This keeps answers cheap, fast and correct.
2. **By people, as a library.** No dependencies, runs in Node and in the browser, readable
   code that teaches how it works.

## 2. Architecture in one page

```
circuit.json ──▶ type ──▶ package ──▶ primitives ──▶ camera + painter ──▶ SVG
                  │                        ▲
                  └──▶ board holes ──▶ netlist ──▶ checks          (later: ──▶ simulator ──▶ animation)
```

| Layer | Responsibility | Folder |
|---|---|---|
| Type | What a part *is*: value → bands, C·V → can size, pin names, electrical model | `src/parts/types/` |
| Package | Physical shape: real dimensions, lead rules, built from primitives | `src/parts/packages/` |
| Part numbers | Package + pin order + model for real parts | `src/parts/db.js` |
| Primitives | Prism, lathe, tube, decals, text on planes | `src/geometry/` |
| Board | Hole positions and connected groups, as data | `src/board/` |
| Circuit | Resolve, place, netlist, checks | `src/circuit/` |
| Render | Camera, shading, painter's algorithm, SVG | `src/core/`, `src/render/` |
| i18n | Every user-visible sentence | `src/i18n/` |
| Simulator | (stage 2) MNA over the netlist and `electrical` descriptions | `src/sim/` |

**Key decisions** (see section 5 for the log):

- **Geometry in 3D, millimetres.** The projection is linear, so any view is just another
  camera. Parts never depend on the camera.
- **Orientation comes from the holes.** A part is built in the frame defined by its first
  and last hole. TO-220/TO-92 face is set by pin order (pin 1 left, print towards you).
- **The breadboard is the netlist.** Connectivity comes only from which holes are used.
- **Type ≠ package.** Electrical meaning and physical shape are separate, so shapes are
  shared (1N4007 and resistors are both axial).
- **Drawing never depends on simulation.** The simulator reads the netlist and `electrical`;
  the animation reads simulator results. Each layer can be tested alone.
- **Self-contained SVG.** Fixed colours, explicit size, white background, no CSS variables
  or scripts, so it works as an image in documents.

## 3. Considerations

### Placement and sizes
- Every package uses datasheet dimensions. Lead rules (`span`, `inline`) are derived from
  them: a 1/4 W resistor (6.3 mm body + 1 mm bend each side) needs ≥ 8.3 mm → 4 holes.
- Collision checks use axis-aligned boxes: generous for diagonal parts. Good enough to
  catch real mistakes; replace with oriented boxes if false alarms appear.
- Rail holes exist only in groups of five; columns between groups do not exist.

### Drawing
- **Painter's algorithm limits.** Sorting by primitive centre is right for convex, compact
  pieces. Long or tall pieces can sort wrongly: split them (the TO-220 tab is split at the
  top of the plastic; wires are one primitive per segment).
- **Occlusion.** Tall parts hide holes and parts behind them. Offer the back view, and
  later transparency on tap.
- **Small screens.** Holes are ~9 px apart at the default scale; use `fit: 'parts'` for
  close-ups and keep labels readable (11 px).
- **Fonts.** The SVG asks for Helvetica/Arial/Lato/sans-serif. Rasterisers without system
  fonts drop text: `scripts/preview.js` passes font files explicitly.
- **File size.** A full board is ~150 kB, mostly the 830 holes. If it matters, switch holes
  to `<use>` of one symbol (the projection is affine, so every hole has the same shape).

### Labels and spacing
- **Static SVG:** labels are callouts in rows above the highest part, joined by leader
  lines, so text never covers a component. **Interactive pages:** labels appear on hover or
  tap; the SVG already groups them (`<g class="labels">`) so a page can toggle them.
- Teaching layouts need air. `clearance` (mm) reports parts closer than that; examples meant
  for learning use 3 mm or more. Future auto-placement must respect it.

### Visual style
- Realism only where it helps to recognise a part (bands, packages, markings). The board is
  background: it should be calm so parts stand out (planned `study` theme).
- All colours come from palettes, never hard-coded in packages, so themes stay possible.

### Simulation (stage 2)
- Results are a **model**: label them so. Real LEDs, tolerances and the supply's limits
  differ from ideal values.
- Add one kind of part at a time, each verified once against a reference and frozen as a
  test. Never tune a model to make one example look right.

### Learning
- The picture must match what the learner will build: same hole names as the real board,
  same rail colours, real part look.
- Never reveal in a drawing something the learner is asked to predict (prediction mode,
  stage 4, hides readings).

### Publishing
- MIT licence. Only original artwork; datasheet dimensions are facts, not copyrighted art.
- Do not copy part artwork from Fritzing (CC BY-SA) or Wokwi without checking licences;
  reading their formats for adapters is fine.
- Keep personal or course-specific material out of the repository (use `CLAUDE.local.md`).

## 4. Best practices

### For the skill (`SKILL.md`)
- **Keep it short.** Workflow, format summary, rules. Details live in `docs/` and are read
  only when needed (progressive disclosure).
- **The description decides when the skill loads.** It must say *when* to use it
  (breadboard circuits, wiring guides, "draw/see this circuit").
- **Deterministic code does the work.** If the assistant would have to calculate something,
  add it to the kit instead.
- **Check, inspect, then look.** `check` before `render`; `inspect` answers placement,
  visibility and label questions in numbers; look at a (small) picture only for style.
- **Measure, don't eyeball.** Anything visual that can be measured becomes an `inspect`
  problem and a test, so it never regresses silently.
- **Fix the kit, not the output.** Never hand-edit a generated SVG.
- **Agents follow the kit.** `.claude/agents/` names tools, commands, operations, profiles and
  formats; any change to those updates the agent files in the same change.

### For the code
- No runtime dependencies. Plain ES modules, Node ≥ 18, works in the browser.
- Real dimensions in mm, named constants, one comment at the top of each module saying
  what it is for. Code identifiers and comments in English.
- New part number → `db.js`. New shape → package. New meaning → type. In that order.
- Every user-visible sentence goes through `t()`; add the key to every language file
  (`npm test` enforces it).
- Tests for anything with a right answer (bands, codes, sizes, rules), and every example
  must render from both views without `NaN`.
- Small commits with a clear message; update `ROADMAP.md` when a checklist item changes.

### For documentation
- English is the reference; the Spanish translation is updated in the same change.
- Explain *why*, with a worked example. Diagrams over long prose.
- Use "voltage" in English; in Spanish "voltaje (tensión)" the first time in a page.

## 5. Decision log

| Date | Decision | Why |
|---|---|---|
| 2026-10-12 | Own skill instead of Anatomy | Anatomy is mechanical-only and does not simulate. |
| 2026-10-12 | JavaScript, no dependencies | Must run in the browser for animation, and be easy to reuse. |
| 2026-10-12 | Code, JSON keys and reference docs in English; Spanish docs from day one; i18n system | Public reach; maintainer learns in Spanish; easy to add languages. |
| 2026-10-12 | Explicit holes first; templates and auto-placement later | Cheap and exact; the checker catches mistakes. |
| 2026-10-12 | Continuous rails by default | Matches the maintainer's board; `split` supported. |
| 2026-10-12 | 3D geometry + camera; front and back views | Rotation is free; text follows the plane. |
| 2026-10-12 | Type/package split; part-number table | Reuse shapes; new parts are one line. |
| 2026-10-12 | No prediction mode until simulation works | First make it correct. |
| 2026-10-12 | Own JSON format; adapters later (Wokwi, Falstad) | Fit our needs; interoperate later. |
| 2026-10-12 | MIT licence | Permissive, simple for learners and teachers. |
| 2026-10-12 | Static labels as callouts above all parts; hover/tap labels in interactive pages | Labels covered parts and made crowded layouts unreadable. |
| 2026-10-12 | Optional `clearance` check; showcase re-spaced | For learning, parts must not be packed tightly. |
| 2026-10-12 | Themes later: a calmer, more aesthetic board than the realistic one | The board should not compete with the parts. |
| 2026-10-12 | `inspect` report and coverage raster; scene as a shared display list | Reading PNGs is slow for an assistant; numbers are fast, exact and testable. |
| 2026-10-12 | Annotation layers (`pins`, `nodes`, `boxes`, `grid`) as a parametric option, not a debug mode | Exact holes and groups are useful to learners too, not only for debugging. |
| 2026-10-12 | Stage 1.5 agent interface before simulation: operations with dry-run diff, history/undo, queries, MCP server, agent roles | Assistants must resume and adjust circuits cheaply and safely; simulation results will use the same tools. |
| 2026-10-12 | MCP server in `mcp/` as its own package; root restricted by `PROTOBOARD_ROOT`; text or JSON answers; PNG only on request | Typed tools for any agent while the kit stays dependency-free; safe file access; images are slow to read. |
| 2026-10-12 | `review` command with profiles as the shared definition of done; three subagents (layout, reviewer read-only, parts librarian) sharing state through files | Verdicts must not depend on an agent's taste; small agents keep the main conversation light. |
| 2026-10-12 | `@resvg/resvg-js` as dev dependency for PNG previews | Lets an assistant check drawings without a browser; runtime stays dependency-free. |
| 2026-10-13 | One self-contained page per circuit (`out/<name>.html`), rewritten on every change under a stable name, as the embed target; later stages grow it instead of adding new pages | Documentation embeds a URL once; static today, interactive later, without editing the docs. |
| 2026-10-13 | Simulator: dense MNA with Newton, typical datasheet models, `supplies` in the circuit, results as a separate `results` layer; the page shows them only if the circuit asks, behind a button | Breadboard circuits are small; models stay readable and testable; results must never give away a prediction. |
| 2026-10-13 | Each model checked against an independent reference solved apart (textbook formula or datasheet), not against its own output | A test that reuses the simulator to make its reference proves nothing. |
| 2026-10-13 | Focus as veil + parts drawn again on top (X-ray) with the strips under their leads; the page clones the focused parts at run time instead of shipping copies; the same layers serve static images | One mechanism for lessons, clicks and the current layer; the page stays small (copies would add ~130 kB per view). |
| 2026-10-13 | Current layer: dots on straight segments at board level, speed on a log scale, electrons by default, strip currents from Kirchhoff along each strip; opt-in per circuit like the results | Currents span µA to A; the learner's course explains with electrons; a flow can give away a prediction. |
| 2026-10-13 | Language precedence: asked for in the call > circuit `lang` > default (`pickLanguage`), also for files rewritten after a change; circuit texts as a plain string (shown as is) or per language | One circuit keeps its language whoever edits it; an explicit request still wins. |
| 2026-10-13 | Two kinds of part text: the kit's description of a kind of part (`describe.*`, behind the kind in the card) and the circuit's `description` (how it is used here, shown directly, optional) | The learner asks for the generic text; the use in a circuit can be left out on purpose so they discover it. |
| 2026-10-13 | `jsdom` as dev dependency to test page scripts (tests skip without it) | A spec-following DOM catches what a hand-made fake hides (SVG elements have no `hidden` property); runtime stays dependency-free. |
| 2026-10-13 | Batteries are parts: drawn on the table beside the board with leads to two holes, and simulated as sources like `supplies` (ideal emf behind an internal resistance); format, chemistry, cells and charge give the numbers (`src/parts/batteries.js`); without `charge`, the nominal voltage | A learner builds with a battery holder, not an abstract source; one model for both keeps them consistent; the nominal voltage is what is printed on it. |
| 2026-10-13 | `under` layer: a primitive entirely beyond one side face of the board, on the side the camera does not see, is painted before the board | Off-board parts must be hidden by the board without splitting the painter's algorithm; outside the face plane nothing else can overlap wrongly. |
| 2026-10-13 | Zener breakdown in the junction model (second exponential with its own limiting), soft knee below ~5.5 V and sharp above, exactly Vz at Izt; regulators as a smooth controlled source (softmin of the reference and the input minus dropout) with their own current | Typical curves of real parts; smooth functions keep Newton convergent; values match the datasheet points the tests check. |
| 2026-10-13 | Sensors as resistors whose value comes from a circuit field (`temperature`, `light`); a passive buzzer as its coil, with a warning on DC | One simple model a learner can reason about; sliders later (stage 3) only change those fields. |
| 2026-10-14 | Conductor view replaces the first current layer: conductors drawn along their real paths (packages return `paths`), coloured by voltage (red + / grey 0 / blue −, the rail colours), conventional current only (+ to −, as Falstad), dot speed proportional to the current with a log toggle; the electrons view is removed | Asked by the maintainer: the path of the current must be readable on the breadboard, and match the simulator learners compare with. Reverses the 2026-10-13 choice (log scale, electrons by default). |
| 2026-10-14 | Stage 3 plan: device modules (one file per kind of part), a compiled program run by a dependency-free engine inlined in the page by a small bundler, limits shown as stresses; see `docs/en/live-simulation.md` | Adding parts must stay one file; the same engine must run in Node and in the page without a build step. |
| 2026-10-14 | Floating islands (no DC path to a source) are anchored to ground at one node in DC only (1 S, off during a transient) | An inductor is a 10⁶ S short in DC; with only GMIN (10⁻¹²) to ground its island made the matrix numerically singular. No direct current can flow in such an island, so nothing changes; in a transient a capacitor may couple it, so the anchor is off. |
| 2026-10-14 | The live page carries the compiled program and the engine (bundled) only when the circuit asks for results or flow; simulated time runs so the longest time constant takes about 2 s; the dot speed scale is the largest current since the start (it never shrinks on its own) | One engine for Node and the page keeps numbers identical; a fixed visual time scale makes every RC readable; a scale that followed the current would hide a capacitor's current dying away, which is the lesson. |
| 2026-10-15 | Controls: each device declares `controls` and a pure `set`; `engine.set` rebuilds the system and carries the state by node name and by element order per part, then solves with a very short step; slider ranges are suggestions inside a hard `limit`; a resistor's slider stays around the file's value and stops at E24 values | One rebuild path covers topology changes (a button) and value changes alike; carrying the state keeps a charging capacitor continuous, which is what a learner watches; real resistor values make the slider match the parts drawer. |
| 2026-10-15 | Limits in the page: amber outline from 80 %, pulsing red past 100 %, latched with its peak until *Clear marks* or a reset, checked every frame; a warnings panel and a line in the card | A brief peak can kill a part, so it must not vanish when the slider goes back; outlines are CSS rules, as the focus, so nothing is redrawn. |
| 2026-10-15 | Limit outlines are a box per part drawn once (layer `marks`) whose stroke and opacity CSS changes in four steps; no CSS filters in the page; sliders debounced (120 ms at rest, at least every 300 ms, at once on release); dots skip offset writes under 0.05 px | Past 10 V the LED of led-resistor crossed 80 % of its limit and got a `drop-shadow` outline, then an animated one: the filter was recomputed on every frame the dots moved and the browser crawled. |
| 2026-10-15 | Conductor view painted per view: strips first, then one line per pin ordered by a topological sort of their screen crossings (the nearer at each crossing goes last), middle depth as tie-break and to break cycles | Strips were drawn after the leads and parts in file order, so a strip or a far lead covered a near one; sorting by each pin's middle still failed for long pieces crossed by a jumper. Lines only cover each other where they meet, so the crossings give the exact order. |
