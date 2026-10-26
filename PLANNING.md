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
- Keep personal or course-specific material out of the repository (use `CLAUDE.local.md`): the
  repository is public. No names, emails, private paths, hostnames, notes-app ids or the
  maintainer's own equipment; `test/privacy.test.js` checks it, with personal words in an untracked
  `privacy.local.txt` (CLAUDE.md, "Privacy").

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
- No runtime dependencies. Plain ES modules, Node ≥ 20, works in the browser.
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
| 2026-10-13 | Current layer: dots on straight segments at board level, speed on a log scale, electrons by default, strip currents from Kirchhoff along each strip; opt-in per circuit like the results | Currents span µA to A; some courses explain with electrons; a flow can give away a prediction. |
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
| 2026-10-15 | Falstad: export the compiled program to CircuitJS's text format, one grid cell per element and a labeled node per lead named after its breadboard group (no schematic layout); each device writes itself (`falstad(d, f)`), equivalents always carry a note shown as **⚠ n** beside the live page's *Open in Falstad* button, which exports the engine's state at that moment; an `exact` variant (kit resistances, backward Euler, potentiometer as two resistors) for the cross-check, whose Falstad results are stored with the exported text and compared offline | Labels make every connection exact without routing; the learner opens what they see; equivalents must never pass silently; references must not need a browser in CI, and a reference run on another export is stale, not wrong. |
| 2026-10-15 | Falstad drawing as a schematic instead of a grid of labels: nets as rows ordered by the kit's DC voltage, two-lead parts standing between them, series parts sharing a column, jumpers merged into their nets, transistors with their base on a half row, column order by a local search on crossings then wire length; one label per net with its breadboard group | Asked by the maintainer: the grid worked but did not look like a circuit. Ordering by voltage makes current flow down the page, as in textbooks; a search over column orders is cheap for breadboard-sized circuits (≈ 15 ms for the examples). |
| 2026-10-15 | Phases 7–9 planned: the oscilloscope in the selected part's card only (closing the card removes it; no pinned channels yet, but the plot takes a list of traces), recorded from the start for every part; then a signal generator as a supply; then probes on nodes. A user-experience pass is added to the roadmap | Asked by the maintainer: the plot explains the part being read; a generator is what makes a scope worth having; probing nodes is how the bench scope is used; the page now has many features and they must be organised. |
| 2026-10-15 | DESPI-C02 e-paper adapter as a module beside the board (like the UNO) rather than plugged in: its right-angle pins point at the board and take Dupont leads; the RESE switch and the optional 7.5" panel are fields; modules may carry a `role` ("adapter") that changes the card's type and description; the Dupont lead and flat printing moved to `packages/offboard.js` (UNO drawings byte-identical) | That is how it is wired on the bench (the ESP32 fills the board); the switch position is the most common mistake with this panel, so it shows; an adapter is not a development board. |
| 2026-10-16 | Oscilloscope (phase 7): every part recorded from the start in a ring buffer (a part tapped later shows its whole story); drawn only in the open card, only where the card shows results; one plot per quantity, never a double axis; the screen starts at t = 0, stretches up to twice its window and only then scrolls; wall-clock time without C or L; values under 1e-15 written as 0 everywhere | A capacitor's charge from 0 is the lesson, so it must not scroll away; one axis per plot is readable for a learner; the solver's rounding ("-1.52e-18 pV") flipped the scale and filled the card with noise. |
| 2026-10-16 | Signal generator (phase 8) as a supply, not a part: Falstad's three waves, peak amplitude, 50 Ω output by default; the engine sets the source before each step (backward Euler: the value at the step's end); the page paced by the period (one a second, ≥ 100 steps per period, a window of 4 periods), and time keeps its speed when a slider moves; in the exact Falstad export the source is one step ahead, since Falstad uses the value at the step's start | One source model for DC, transient and live; matching Falstad's waves makes the cross-check exact (5 nV on an RC over 952 steps) without bending the kit's integration; a learner raising the frequency should see more periods a second. |
| 2026-10-16 | Probes on nodes (phase 9): a strip is found by where the tap is (the page carries each strip's holes on screen), not by a hit area in the drawing; a part wins where it is drawn, and the cards link to each other (a part's pin → its strip, a strip's lead → its part); the strip's card shows what is clipped to it, and with results its voltage to ground, the current of each lead into or out of the strip and its oscilloscope; below 1 nA a lead shows no current | A hit area above the parts would steal their taps, one below them would be covered by the veil and the conductor view; a part often hides its strip on screen, hence the links. The voltage to ground is what a real scope reads; listing the leads' currents lets a learner check Kirchhoff's current law at any strip. The solver leaks picoamperes (a charged capacitor), which are not a current to read. |
| 2026-10-16 | User-experience pass planned (docs/en/ux-pass.md): one interaction model (the bar for view and time; one inspector for what was tapped, with a Circuit tab for controls, warnings and Falstad notes; right panel on wide screens, bottom sheet on phones); gestures by context (embedded: one finger and the wheel scroll the host, two fingers and Ctrl/⌘ + wheel zoom); tokens from `.interface-design/system.md` (bench palette, light and dark), page-only so the static SVG stays byte-identical; motion only for the flip, the framing and the sheet; phases U0–U7, gestures first | The review (desktop, tablet, phone, embedded) found the page traps scrolling inside a note, covers the tapped part on a phone and buries controls in a flat bar; a palette-only mock-up did not help, so structure comes before colour. Several defaults wait for the maintainer (listed in the plan). |
| 2026-10-16 | UX pass decisions and U1: embedded pages behave like an embedded map (one finger and the plain wheel scroll the note; two fingers move and zoom; Ctrl/⌘ + wheel or a trackpad pinch zoom; a short hint when tried the other way; Full screen in the zoom buttons); alone or full screen, the drawing takes every gesture as before; double tap or double-click frames the tapped part. Also chosen: the inspector as a panel over the frame on a desktop, labels of the selected part only on a phone, the theme following the system with `page.theme` and `?theme=` overriding it | Chosen by the maintainer after the review: inside a lesson the note must scroll, and a familiar pattern needs no teaching. Touch goes through the touch events when embedded because the browser must keep one-finger scrolling; checked in Chromium with touch emulation, Safari still to try on the devices. |
| 2026-10-16 | U2: the page's colours as tokens on `:root` (light; dark by `prefers-color-scheme` unless `<html data-theme>`), `page.theme` (`auto`, `light`, `dark`) and `?theme=` over it; the drawing recoloured in the page by CSS over its presentation attributes (background, veil, labels, result tags by `data-q`) so the static SVG stays byte-identical; the board itself keeps its colours in dark; the scope colours as classes; no hex outside the token blocks (tested); touch baseline (hover gated, `:active`, 40 px on coarse pointers) | One place for colour makes the theme and later tuning cheap; a lesson note may be dark when the system is not, hence the setting and the link; a dark veil dims the board in dark mode as the light one does in light. |
| 2026-10-16 | U3, the bar: one row grouped by job (Flip and Whole board as single two-state buttons, Labels and Current as toggles, time as icons), labels hidden on a narrow screen instead of a sideways-scrolling row, everything used less in a ⋯ menu (dot speed, Falstad, the hint again, the revision) that modules fill with `page.menuAdd`; the hint leaves the bar for a first-time message over the drawing (remembered in `localStorage` when allowed); a ⚠ n flag on the bar when a limit was passed; pressed state as a soft accent instead of a filled button | Thirteen equal buttons took two or three rows, or a 1,844 px row on a phone; two buttons for one choice doubled the bar. A calmer pressed state keeps the circuit as the focal point. |
| 2026-10-16 | U4, the inspector: one box for the card (`.info`) and the circuit's panels (`.side`) with tabs; a 300 px panel on the right on wide screens (the zoom buttons move to the bottom left), a bottom sheet on phones with peek (the card's head and summary), half and full, dragged 1:1 with rubber band and landing by projected release velocity (Apple's 0.998 deceleration); with nothing tapped it shows the Circuit tab, folded on a phone; the frame pans so the selected parts stay in the free area; the card's head (title, eye, ✕ as icons) stays at the top, a summary line (MODEL chip, values) follows, pins are folded; the drawing's MODEL stamp is hidden in the page and a badge in the frame's corner says DC or over time | The card covered the tapped part and the controls covered a quarter of a phone; closing meant scrolling to the bottom; the stamp fell off the frame. One container and one model (bar for view and time, inspector for what was tapped and the circuit) is what the plan asked for. |
| 2026-10-16 | The card's summary line only in a folded sheet, values in fixed slots; gestures (`touch-action`) on the drawing's SVGs, not on `main` | Asked by the maintainer: the line repeated the Simulation section and jumped as values changed length (−7,04 nA after 48 mA), which the UX skills flag (numbers that move while read, an element that does not earn its place). With `touch-action: none` on `main` the card inside it did not scroll on the phone, and at half height its end lay below the screen. |
| 2026-10-16 | U5, motion: the flip immediate (a 260 ms turn was tried and the maintainer preferred none), keeping the zoom and the focused part's place on screen; the frame glides 220 ms ease-out for buttons and code (`frameTo`, a requestAnimationFrame loop since the viewBox is not CSS) and follows gestures at once (`setBox`); entrances by `@starting-style` (menu from its button, desktop panel) and a sheet that rises from the edge; press feedback; reduced motion: fades, no movement. The frame no longer resets when Labels or a layer change | The review-animations standard (under 300 ms, ease-out to enter, ease-in-out for on-screen movement, interruptible, transform and opacity only; the viewBox is the exception the drawing needs). Keeping the zoom and the part's place on a flip is what lets the learner keep their place. |
| 2026-10-16 | U6 reduced to two items (the maintainer dropped the label ones): taps that hit nothing take a part within a few pixels (more with a finger), the open part tapped again opens the one under it (after 350 ms, so a double tap still frames), by the open part rather than the screen spot; on a portrait screen the close-up frame is the parts and labels as drawn (including the `under` layer: boards and panels beside the breadboard), 6 % margin, centred above the sheet, fitted again when the sheet appears | A wire over a resistor stole its taps; a wide frame on a tall screen left the parts small with empty space above. The drawing may move when a card opens, so "again" cannot be a screen position. |
| 2026-10-16 | The MCP server runs the tools in a worker thread and restarts it when the kit's code changes (newest mtime under `src/` and the tools, checked before each call), instead of only warning | A long-lived server kept writing pages with the old interface; workers have their own module cache, so a new one loads the new code without the client reconnecting. A stat walk costs about a millisecond. Tool names and input schemas stay as registered at start: changing them still needs a reconnect, and the answer says so. |
| 2026-10-16 | Leads and jumpers through another part are warnings (`LEAD_THROUGH_PART`, `WIRE_THROUGH_PART`), tested by sampling each lead every 0.5 mm against the other parts' convex primitives, 0.2 mm deep; jumpers crossing jumpers are not reported | The body check compared bodies only, so a resistor lead over a header passed review. Primitives are convex by rule, so a point-in-planes test is exact where the old boxes were generous; a warning (not a lesson-only rule) because it is physically wrong in any layout, and `suggest` then avoids it for free. Jumpers stacked on jumpers are normal on a real board. |
| 2026-10-16 | `suggest` takes a review profile and `parts` (several at once, greedy in the given order); groups can be named by a placed pin (`R1.2`) | Fewer calls and fewer review rounds for a layout agent; greedy is predictable and each later part sees the earlier ones. A search over orders would cost more than it saves for lesson circuits. |
| 2026-10-16 | `catalog` answers a compact list by default and one entry in detail by `name`; the fields per type are an explicit list (`TYPE_FIELDS`) checked against the schema by a test | The full registry was about 20 KB per call. Parsing the schema's descriptions for type names would be fragile; an explicit list with a test cannot drift silently. |
| 2026-10-17 | `suggest` keeps room for what comes next: a strip with a lone pin and each group named later in a chain (`reserve`) keep a usable hole per pending connection, checked with a probe jumper through the same evaluation; in a chain the parts hanging from the one placed are tried on its best six positions (else the best is kept with `DEPENDENT_BLOCKED`); no placement comes with `reasons` | Two layout runs with a smaller model sealed a regulator's output strip (a capacitor took its last visible hole) and spent dozens of calls retrying the same `suggest`. Counting free holes is not enough: holes behind a tall body are free but hidden, so the probe uses the review's own criterion. A full search over orders stays out (cost); one level of look-ahead catches the common dead end. |
| 2026-10-17 | (Replaced the same day by the elastic board `auto`: the maintainer prefers one board that grows in length, not real boards joined; whoever builds it works out how to join theirs.) Joined boards (`bb400x2`, `bb400x3`, `bb830x2`): one board for the kit, columns numbered straight through, each segment with its own margins, each rail bridged across a seam by a jumper the board draws (its two rail holes are taken), so rails stay one group; the first segment keeps the single board's holes | The maintainer asked for a flexible board: a regulator circuit on a bb400 came out cramped and hard to read. On the bench it is two boards snapped together with rail jumpers, so the model stays physical and the simulation honest; keeping the first board identical lets a layout grow without moving a part. Split rails per board were the alternative, but every supply and rail reference would then need a side (`T-:L`). |
| 2026-10-17 | `layout`: a whole circuit placed by an algorithm from its parts and nets, following the place → route → verify flow of layout tools: layers by distance from the source (as Sugiyama-style schematic layout), placement by rules per part kind checked with geometry only (no drawing), jumpers by the shortest pair of holes that passes, then the nets check and the review; while the review blocks, lay out again without the place of the last part or jumper it names | A layout agent spent 40–80 calls per circuit, and `suggest` chains took 12–22 s because every candidate was drawn and measured in two views. Geometry-only checks take milliseconds, so a whole layout takes about a second and is predictable. The row rule for tall parts (rows a, b, f, g) was measured: in c–e and h–j one side of their strips ends up hidden. Relaying out is simpler than patching a layout in place. |
| 2026-10-18 | The page runs the simulation whenever the circuit can be simulated (a source: supplies or a battery): results always on (tapped part, oscilloscope, limits), the Current button in the bar not pressed, and LEDs glowing with their current on the board (a `lights` layer over the parts, no longer only inside the current layer). `page.results: false` and `page.flow: false` turn each off; `page.simulation: false` both. Supersedes the 2026-10-14 "no new page flag" entry in live-simulation.md | The maintainer asked for it: lesson circuits came out without the Current button and with dark LEDs because nobody remembered `page.flow`. A first try the same week put the results behind a new Simulation button; that was not what was asked and was reverted. The prediction rule now works by opting out (`page.simulation: false`) for a circuit with a value still to be predicted. |
| 2026-10-20 | Circuit work (laying out, fixing, reviewing) is meant to run on a small model with little reasoning; kit development aims at that: judgement goes into tools and reports, not into the agent's thinking | The maintainer asked for it. A circuit task done in a large-model conversation spends many tokens on reasoning the kit could do (placing, routing, telling what is wrong and how to fix it). The agents already run on `sonnet`; a task that needs more is a gap to close in the kit. |
| 2026-10-20 | Pin names read as people write them (`findPin`: exact name, then synonym sets, then GPIO numbers; only a unique match), everywhere a pin is named; `layout` ends in one `STATUS:` line (`DONE`, `CHANGES`, `FIX_SPEC`, `SPEC_OK`) that also sets the CLI's exit code; the layout agent split into two paths (A: `layout`, B: operations) with `layout` and `simulate` in its tools; a test that every tool an agent's instructions name is in its list | A review with four lesson circuits: none passed the first try because of pin names (`D1.K` on an LED, `U1.DISCH` on a 555), each a round for a small model; `layout` could say "Review: APPROVED" with a net missing; the agent's file said "layout first" without the tool and "catalog first" beside "no catalog before layout". An alias is accepted only when it names one pin, so it never picks the wrong one silently. The rest of the review (recipes, the spec as the desired state, repairs in `layout`, AGENTS.md, MCP prompts) is in the roadmap. |
| 2026-10-20 | The layout spec kept in the circuit (`spec`: nets, supplies that name pins, layout's jumper ids), not in a `spec.json` beside it; `review` checks those nets; `layout` on an existing target lays it out again as one revision of remove + circuit + add ops, each part and jumper trying its present holes first; `rename` follows into it. Ground nets without a rail go to a − rail; a repair pass re-routes, once, the jumpers the relayout loop leaves. The lesson profile's "hidden in every view" is now "best view under 70 %" (`hiddenBelow`), counted per view | A small model describes a desired state better than it plans a sequence of operations, and the connections asked for were lost after the first call, so nothing could check them later. Inside the circuit, history and undo cover the spec with no new mechanism. Trying present holes first keeps a learner's build where it is. The 85 % threshold (the inspector's note level) and a double count in one view made a 555 seen 73 % and 69 % block, and the two-rail supply use all 8 tries: measured, both now pass at the first try. |
| 2026-10-26 | Recipes: usual lesson circuits as `layout` specs in the kit (`src/recipes/`, one data module each), called with `recipe` and only the `values` each recipe lists (main field by id, or a few allowed fields; choices and ranges); never with `parts` or `nets`; listed and detailed by `catalog` (no new tool; recipe names may not shadow a part name); the circuit keeps `spec.recipe` until laid out with other nets. Each recipe must end in `DONE` in one call (bench and tests, every choice too). Found on the way, fixed in `layout`: a development board over the channel is placed by pin 1 so its pins in nets keep free holes past its PCB, and a net group no jumper reaches waits for the rest of its net (rails last) | A small model gets a usual circuit right only if nothing is left to work out; ids and nets fixed keep each recipe a proven layout, and only values change. One more tool would cost every agent; the catalog is where names are already looked up. Data modules, not JSON, so `src/` reads no files and titles carry both languages. The ESP32 failures were the algorithm's (a covered strip), so they were fixed there; the bridge's was the recipe's (a tall capacitor next to a rail jumper), so the recipe keeps its DC side off the rails. |
| 2026-10-26 | NE555 simulated as a behavioural model: the internal divider and own current as resistors, and one element (`timerCore`) for comparators, latch, output and discharge whose latch changes only when a step is accepted, from that step's voltages; a device may accept only some parts of its type (`accepts`), so other ICs stay unsupported | Each step solves a linear stage, so no new convergence trouble; the switching error is one time step, far below what a learner sees (the astable lands 2 % slower than the textbook formula, as a real 555 with its discharge pin above ground). One device for the 555 rather than a transistor-level subcircuit: the card shows what the datasheet's block diagram shows. |
| 2026-10-26 | Jumpers pay 12 mm of wire for each body their line crosses seen from above, and a group joins the net where it is cheapest, all joined groups weighed together | A jumper arches over what lies between its holes; the nearest-first rule sent THR to TRIG straight over the 555 when a short jumper to the timing capacitor's strip was free. A penalty, not a ban: crossing stays possible when it is the only way (RESET to VCC). |
| 2026-10-26 | Op-amps as one behavioural row per amplifier: V(o) − V(vee) = a soft clamp of gain·vd + S/2, with vd limited between Newton iterations (stop just inside the linear range the first time it would leave it, go on the second); the LM393 as a smooth switch from OUT to its negative pin; amplifiers with nothing wired left out; several devices per part type, the program naming each part's device by its kind | A clamp is what a learner sees on a bench (an output stuck below the rail) without a transistor-level model; with feedback, Newton bounced between the rails because the slope is nearly zero in saturation, and stopping inside the range, where the slope is 1, makes the next step almost exact. No bandwidth yet: the lessons are DC and audio-frequency gains. |
| 2026-10-26 | Microcontrollers simulated by their pins, not their processor: one device for every board (`mcu.js`), each family's numbers from its datasheet (`MCUS`), each GPIO a linear stage whose state (`mode`, `level`, `pull`) is a memory; the board on USB is a source of its own; `io` sets the states (phase M1); later a program in the Arduino C++ subset, from a `.ino` beside the circuit, changes them between time steps (M2). No average PWM | A lesson needs what leaves a pin, what flows and what an input reads; emulating the ESP32 has no light free option and would add a runtime dependency. The 555's latch showed that state changed between steps costs no convergence. An average PWM (two conductances) let current run from the rail to ground inside the chip: PWM will switch in time instead. |
| 2026-10-26 | A board's program: the Arduino C++ subset translated once (at compile) into JavaScript generators, every function a generator so `delay()` yields simulated seconds; run by one controller element at each accepted step from the step before; replayed from scratch at t = 0 until its pins settle; kept across a control's rebuild; the page steps a circuit with a program in real time (1 ms, down to 0.1 ms beside a fast RC); `program` is a `.ino` file beside the circuit (read through a symbol the loader sets, so nothing is saved into `circuit.json`) or the text | The learner writes what they upload; generators give `delay()` without threads or an interpreter of our own; a step's latency (1 ms) is below what a lesson sees; the replay at t = 0 fixes a loop reading a pin before its setup's pull-up existed; a symbol keeps the folder out of the file and needs no new argument through every caller. |
| 2026-10-26 | PWM and `tone` switch in time: each step the pin is high or low by its phase (`levelAt`); the page shortens its step to a twentieth of the fastest period (`stepHint`, at least 5 µs) and paints an LED's glow as its brightness averaged over the steps since the last paint (`glow`); the serial monitor stays in the board's card | The square wave is what the oscilloscope and the currents should show; a time average would put current through the chip; averaging only what the eye averages (the LED) keeps every other value instantaneous. The engine runs 20–60 k steps a second for a board circuit, enough for 490 Hz–1 kHz in real time. |
| 2026-10-26 | Integer division in any sketch expression: the translator marks each term as integer or not and truncates a division whose two sides are integers, the left side taken over the `*` `/` `%` chain before it | A lesson writes `analogRead(A0) / 4` straight into `analogWrite`: as a float it gave 127.5 and 128 instead of the board's 127. Assignments alone did not cover arguments. |
| 2026-10-26 | Getting ready to publish: private context removed from the docs (names, private paths, notes app, own equipment), a privacy test over every tracked and new file with generic patterns plus an untracked list of personal words, README images drawn by the kit (`scripts/readme-images.js`, PNG in `docs/img/`), a demo site of live pages on GitHub Pages (`scripts/demo-site.js`, built by a workflow, not kept in git), an index of the examples, Node ≥ 20 | The repository was already public; a test catches a leak before a commit, and keeping the personal words out of git keeps the test from being the leak. Images drawn by the kit can be regenerated instead of going stale; the demo is generated so it never needs committing. Node 18 is out of support. Packaging (plugin, npm, skill zip), CI and community files are the publication stage of the roadmap. |
