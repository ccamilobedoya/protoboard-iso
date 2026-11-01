# A video about one part: design and plan

*[Español](../es/foco-en-componente.md)* · Roadmap: [ROADMAP.md](../../ROADMAP.md), *A video about one part* · Built on [stage-and-video.md](stage-and-video.md)

A video format for **one concrete part** (a transistor, a MOSFET, an LED, a 555): the part alone and
large on the same dark stage, its pins lighting up with their names, its symbol and what is inside
it, the simulation running on it as on a test bench, and a continuous move to the breadboard where
the recipe's circuit builds itself around it and works. Everything is directed by the same timeline
JSON (`examples/tours/*.json`) and rendered by `scripts/render-frames.js`. Later, maybe, the same
view in the page, opened from the card.

Plan of 2026-11-01. The architecture and decisions D1 to D6 are approved by the maintainer; D7 (the
page) stays open until a live trial after F4. Session F0 (this document, the mock-ups and the
measurements) is done, and the maintainer chose the pedestal's direction on 2026-11-01: the technical
pinout with the showcase's schematic symbol beside the part (see *The direction chosen*).

## Status

| Session | What | State |
|---|---|---|
| F0 | Measure and choose: mock-ups of three directions from the real page, zoom and band measurements, this document, the decisions in `PLANNING.md` | ✅ direction chosen 2026-11-01 |
| F1 | The pedestal: `scene` and `land` | ✅ 2026-11-01 |
| F2 | Anatomy: `pin` and orientation | ✅ built 2026-11-01; a frame of each waits for approval |
| F3 | The bench: `bench` | ✅ built 2026-11-01; a frame waits for approval |
| F4 | `symbol` and `inside` | ✅ built 2026-11-01; frames wait for approval, then the D7 trial |
| F5 | The part in the page (interactive), only if D7 says so | ⬜ open |
| F6 | Bench of timelines and guide | ⬜ |

**Everything is asked for** (the maintainer, 2026-11-01): the pedestal shows only what its timeline's
steps ask for. The pinout, the bench, the symbol and the inside view are each a step's, on and off;
none is drawn by default, and a video may use any of them, in any order, or none.

**To review later** (the maintainer, after seeing F1's video on 2026-11-01): the captions of a video
about one part (their words, size and timing); and whether the pedestal needs an opening zoom on the
part, or the frame as F1 presents it is enough. Both are judged at F6, with the four timelines.

## The format

Six beats, 25 to 35 s, portrait first. The action names are the plan's; F1 to F5 fix them against the
code.

| Beat | s | Actions |
|---|---|---|
| 1 Hook | 0–1.5 | `scene part Q1` (a cut), `caption` with the part's name and one idea |
| 2 Anatomy | 1.5–6 | `pin Q1.E`, `pin Q1.B`, `pin Q1.C` (400 ms apart, a short `label`), `caption` with the orientation |
| 3 How it works | 6–16 | `bench on`, `flow on ramp 600`, `symbol on` (optional), `inside on` (optional), `set` + `value` + `probe` as today |
| 4 To the breadboard | 16–20 | `symbol off`, `inside off`, `bench off`, `land Q1` (the board rises), `assemble` |
| 5 Working | 20–28 | as today's videos: `focus`, `set`, `value` |
| 6 Close | 28–30 | `frame board travel`, `caption`, `focus []` |

Beats 1 and 2 keep the same choreography in every video of the series: recognisable, and cheap for a
small model to write from the guide.

## Architecture: the pedestal is the same circuit

The pedestal is not a second drawing: it is the circuit's own page with the board and the other parts
hidden. An action `scene` in mode `part` (1) hides the board (the hole grid behind it stays), (2) hides
the parts not named, (3) raises the part with the mechanism of `raise` (`liftPart` in
`page/client/focus.js`) and (4) frames it. Going back to the breadboard (`land`) undoes that with
moves: the part comes down, the board appears, `assemble` brings the rest.

Why: the continuity between pedestal and breadboard comes free (the part is the same SVG element, in
its real place), the simulation already runs (the part never leaves the circuit, as with `raise`),
controls (`set`) and readings (`value`, `probe`) already work, and the current layer drawn as a plan
already has one stub per pin (V3), the base of the bench: each pin shows what reaches it from the rest
of the circuit.

Set aside for now (back if F1 needs it): a "bench" circuit generated per type of part, drawn in a
second SVG without a board, with a fade or a move to the real circuit. A more literal bench (a drawn
supply, clips), but the first drawing without a board and two circuits to keep in step.

## Decisions

| # | Decision | Chosen | Alternative |
|---|---|---|---|
| D1 | Camera on the pedestal | the fixed isometric camera, no orbits (the 2026-10-30 decision stays); `flip` for the other face | orbits in `scene part` only |
| D2 | Pin callouts, symbol, inside | 2D graphics in screen space, anchored to each pin's projection (leaders) | 3D decals on the part |
| D3 | New data | by **type** (symbol, inside, the order pins are told in) in `src/parts/types/*`; by **part number** (each pin's function, the orientation mark) in `db.js` | all by part number |
| D4 | First wave of parts | BJT `2N2222A`, the MOSFET of `mosfet-switch`, LED, `NE555`, each with its final recipe (`npn-switch`, `mosfet-switch`, `led-resistor`, `555-astable`) | BJT and LED only |
| D5 | Bench | the current layer as a plan, limited to the part, stubs lengthened to a pad per pin carrying the pin's voltage and current | a drawn supply and clips |
| D6 | Transition | **B, the board rises**: the part does not move on screen, the board appears under it (unveiled, with a camera move that compensates), then `assemble` | A, the part comes down with `insert` |
| D7 | Page | **open**: decided with a live trial. After F4, a quick prototype in the page behind `?focusView=1`, tried on a phone and a tablet; then F5 as written, changed, or dropped (the video does not need it) | build it from the start; never build it |

## Measurements (F0)

`scripts/focus-mockups.js` opens the real page of `npn-switch` (Q1, a TO-92) and of the recipe
`555-astable` (U1, a DIP-8) in Chromium as a recording (`?director=1`, theme `stage`, 1080 × 1920 and
1920 × 1080), puts the part on a pedestal as F1 would (a timeline with `focus`, `raise` 3 mm and
`frame` on the part with a `zoom`, plus CSS that hides the board and the other parts), and measures
the part on screen. The numbers are in `examples/out/focus-mockups/measurements.json`; the tables
below are from the run of 2026-11-01. "Free area" is what a recording leaves free for the drawing
(`STAGE_INSET` in `page/client/view.js`): portrait from 40 % to 75 % of the height and 6.7 % to
93.3 % of the width; landscape the right half, from 9 % to 91 % of the height.

**How much of the free area the part takes** (width × height, as shares of the free area), and the
size of its printed marking (the letters' font size on screen, through the drawing's matrix):

| `frame` zoom | TO-92 portrait | marking | DIP-8 portrait | marking | TO-92 landscape | DIP-8 landscape |
|---|---|---|---|---|---|---|
| 1 (today's default) | 15 % × 40 % (140 × 269 px) | 16 px | 33 % × 40 % (311 × 269 px) | 31 px | 21 % × 40 % | 40 % × 35 % |
| 1.5 | 22 % × 60 % | 24 px | 50 % × 60 % | 47 px | 31 % × 60 % | 60 % × 52 % |
| 2 | 30 % × 80 %, out of the area | 32 px | 67 % × 80 %, out | 63 px | out | out |
| 3 | out | 48 px | out | 94 px | out | out |

What they say:

- **The part's height decides, not its width.** A frame of a part is its box 2.5 times over
  (`partBox`), fitted to the free area: at zoom 1 a raised part takes 40 % of the free area's height
  and only 15 % (TO-92) to 33 % (DIP-8) of its width. Above zoom 1.5 the part leaves the free area
  through the top (the caption's band) in both formats, because the frame's centre includes the lift.
- **At zoom 1 a TO-92's marking is 16 px tall on a 1080-wide frame**: legible on a full-screen
  phone, small. At 1.5 it is 24 px. The DIP-8's is 31 px at zoom 1. The SVG scales without loss: no
  seams between the convex pieces showed at any zoom tried (up to 5).
- **The frame's lower limit is not in the way.** `clampBox` keeps the frame at least a twelfth of the
  board wide; a TO-92 in portrait meets it only at zoom 4.
- **A pinout under the part fits at zoom 1** (the rows of text between the part and 75 %), not at
  1.5. A showcase with a large part (zoom 1.6) fits for the TO-92 in both formats; for the DIP-8 in
  portrait, the numbers of the back row, written above the body, reach into the caption's band.
- Proposal, not approved: `scene part` should not reuse a part's frame with a zoom. It should fit the
  part's own box (without the 2.5 margin) into a pedestal area inside the free area: the upper share
  of it (about 55 % of its height) when callouts or a bench go under the part, all of it in a
  showcase. F1 measures and fixes the share; the zoom stays for a timeline that wants more or less.

**Contrast** of the colours the mock-ups use, on the stage's ground `#151a21` (WCAG 2.2; text 4.5:1,
lines and pads 3:1): callout text `--ink` 14.4:1, the kind line `--ink-3` 6.8:1, leaders and pin
letters `--accent` 9.9:1, a pad's reading `--cap-value` 11.7:1, the pads in the voltage scale 6.8:1
(0 V), 4.3:1 (half) and 3.5:1 (the top). All pass.

## Findings for the sessions

- **F1, a bug to fix first.** A part raised and then focused again (a `focus` or `label` step after a
  `raise`) disappears: the focus clones the part's body, which `liftPart` made unseen while it is in
  the air, so the copies are unseen too. The mock-ups force the copies visible; F1 fixes it in
  `applyFocus` (a lifted part's copies keep their opacity) with a jsdom case.
- **F1.** The LED's light (layer `lights`) is not a part's piece: hiding the other parts must hide
  their light too, and keep the told part's when it is an LED.
- **F2.** In the front view a DIP's back row of pins is behind its body. A callout's leader must come
  from under the part (the mock-ups draw leaders under the drawing, so a hidden pin's leader comes out
  from below the body), or its number goes above the body. Which pins are hidden is a measurement of
  the scene (inspect), not a guess from the rows.
- **F2.** Leaders do not cross when each column of text takes the pins on its side of the part's
  centre, the nearest pin at the top row.
- **F2.** Orientation is data, never a sentence written by hand: the first mock-up said "notch to the
  left", and in this circuit the 555 has its notch on the right (pin 1 at the right). A chip whose pin
  1 is at the right shows its marking upside down, as the real one would.
- **F2.** A pin's text must end before its leader: in landscape the 555's longest text on the left
  ("5 CTRL") reached past its pin, and the leader ran over it. The column's width is measured and the
  text shortened or the column moved, never left over a leader.
- **F2.** Two pins at the same screen x (a DIP's pin 4 behind and pin 8 in front) share one vertical
  leader; each leader takes its own x, a few pixels apart.
- **F3.** A pad's reading needs a floor: the ground pin of the 555 read 270 µV. Readings under a
  millivolt show as 0 V, or the scale of the circuit decides the digits.
- **F3.** Two pins at the same height on screen (a DIP's opposite rows) give stubs that cross; pads
  ordered by the pin's position on screen, with the back row's stubs under the body, keep it legible.

## The three directions (mock-ups)

`node scripts/focus-mockups.js [--lang es] [--jpeg]` writes, for each part and format,
`<part>-<direction>-<v|h>.png` into `examples/out/focus-mockups/` (the three below and `chosen`). Nothing in the kit changes: the
callouts, the symbol and the pads are HTML and SVG drawn over the page by the script, and every number
on a pad is the page's own simulation.

- **Technical pedestal**: a pinout as a datasheet prints it, in monospace, one row per pin under the
  part with its function, leaders that never cross, the kind of part and its orientation mark in a
  quiet line at the bottom.
- **Showcase**: the part larger (zoom 1.6), each pin's letter (a chip's number) at its tip, the
  schematic symbol below it (portrait) or beside it (landscape), few words.
- **Test bench**: each pin's stub lengthened to a pad in the voltage's colour, the pad's reading large
  under it; the part conducting (the button of `npn-switch` pressed).

## The direction chosen (2026-11-01)

The maintainer chose **the technical pedestal with the showcase's schematic symbol** (`chosen` in
the script: `<part>-chosen-<v|h>.png`), in both formats:

- the part at the technical frame (today's part frame, zoom 1: room under it for the pinout), in
  portrait and in landscape; not the showcase's larger part;
- the pinout as in the technical direction: one row of monospaced text per pin with its function,
  leaders that never cross, the kind of part and the orientation in a quiet line at the bottom;
- the schematic symbol beside the part, in the room the free area leaves on its right, centred on it
  (F4 joins its pins to the real ones with lines);
- timelines named `focus-<part>.json` (`focus-npn.json`, `focus-555.json`…).

The bench (F3) keeps its plan; its look is judged when it is built. F1 frames the pedestal as the
technical direction does: the part in the upper share of the free area, the pinout under it.

## Sessions

Common rules (those of [stage-and-video.md](stage-and-video.md)): each session starts by reading
`CLAUDE.md`, the code map, `stage-and-video.md`, `timeline.md` and this document; checks the names an
earlier session chose against the code; ends with `npm run verify` green, the frame golden updated on
purpose, the roadmap (en/es) and the code map, a `STATUS:` line, and asks before committing. Each new
move enters the table of moves with a number, purpose and cost, a jsdom case (`test/moves.test.js`)
and a golden frame (`test/frames/move-*.json`). Every new text goes through `t()` in every file of
`src/i18n/`.

### F1 · The pedestal: `scene` and `land`

`scene` in `tour.js` with `"mode": "part" | "board"`, `"part"`, `"zoom"` and `move`/`ms`/`curve` (a
`cut` by default for the hook). In mode `part`: the board veiled entirely (`data-scene="part"` on
`main`, styles in `style.js`, no CSS filters), the other parts `display: none` in a recording (not
opacity, to pay no painting), the part raised `RAISE.mm`, one label by the one-label rule, and the
frame on the part (see the proposal above). `land` (`"part"`, `travel` 1500 ms by default): the part
comes down, the veil goes in the same tween, and the camera compensates so the part **does not move on
screen** (D6: the target box from `partBox` before and after, tweened with `frameAt`); then the other
parts come back, or wait for an `assemble`. Moves M17 *pedestal* and M18 *the board rises*. Schema,
caps, `--validate` (`TOUR_SCENE_PART` for a missing part, a wire or a supply), `--parts` says which
parts can go on the pedestal. Tests: jsdom in `test/tour.test.js` and `test/moves.test.js` (the part's
place on screen the same before and after `land`, ±1 px), golden frames `move-scene.json` and
`move-land.json`, hostile ids in `test/attack.test.js`. Done when `examples/tours/focus-npn.json`
(scene → caption → land → assemble) passes `--validate` and `render-frames.js --format both --check`,
and in the pedestal's frame nothing is out of the free area.

### F2 · Anatomy: `pin` and orientation

Data: each pin's function by part number (`NE555`'s names exist; their text per language as
`pin.<part>.<name>` keys in `src/i18n`), and in each package an orientation mark as data
(`orientation: { kind: 'flat' | 'notch' | 'dot' | 'long-lead' | 'stripe', at: <3D point> }`) for TO-92,
TO-220, DIP, LED, axial diode and electrolytic. `pin` (`"pin": "Q1.B"`, an optional `"text"`, an
`arrival` by default): a 2D callout over the drawing, anchored to the projection of the pin's tip
(`data-pin` in the parts, or the position exposed by the scene), with a leader that never crosses the
part; lit pins add up until `pin off`. `orientation` (or `pin` with `"mark": true`) lights the mark and
writes its text. `--parts` lists each part's pins with name and function; `--validate`:
`TOUR_UNKNOWN_PIN`. Moves M19 *pin lights* and M20 *callout arrives*. Done when `focus-npn.json` and
`focus-555.json` light every pin, `--check` passes, and the maintainer approves a frame of each.

**As built (2026-11-01).** The names changed a little against the plan above: the mark is a field of
the package's build, `mark: { kind: 'flat' | 'tab' | 'notch' | 'flange' | 'stripe', at, normal }`, and
one action does pins and marks: `pin` with `pin`, `mark` (the part) or `off` (no `orientation` action).
The pins' texts are by kind of part (`pin.role.bjt.E`), with a part number first when it has its own
(`pin.role.NE555.TRIG`); a chip's row says its number. The mark's sentence comes from the camera
(which way a flat face or tab faces, which side a notch or stripe is on), so the back view says the
other thing. The callouts are drawn in the drawing, in a layer under the part's copy (the leaders of
the back row come out from under the body with no measurement of what is hidden), laid out in screen
px each time the frame moves. Two of F0's findings needed a rule each: a row too long for its room
first shrinks with the others (to 65 %), and when two columns would still cut a row, all the rows go
to one column on the roomier side (no leader crosses either: the pins nearest it at the top); two
pins at one x get leaders 10 px apart, and the one that moves is the higher tip, since the other
leader would otherwise start on it (a crossing a jsdom case found). `render-frames.js` measures the
pinout against the free area. `TOUR_NO_MARK` was added for a `mark` on a part without one. After
seeing the first frames, the maintainer asked for two changes: the part in the middle (the pedestal
now frames the part alone, in the middle; its short label is not shown there, since the caption names
the part, so the label no longer pushes a small part aside and the rows fit around it), and no ring on the mark (the flat face shows in the drawing; the mark is
its sentence only).

### F3 · The bench: `bench`

`bench` (`"on"`, `"part"`): on the pedestal, the current layer as a plan for that part alone, its stubs
lengthened to a fixed screen length and ended in a pad with the node's voltage (the scale's colour and
the figure) and, with `flow on`, the pin's dots; a label per pad with the net's name, or the main part
next to it ("→ R1 1k"); `value`, `probe` and `set` on hidden parts keep working (the point: raise the
base resistor and the base pad changes). In `src/sim/paths.js` (a `bench` style from `plan`) and
`live.js`; pads as shapes with opacity, no filters. `--validate`: `TOUR_BENCH_NOT_SIMULATED`. Move M21
*bench connects* (stubs traced like M5, 400 ms). Done when in `focus-npn.json` beat 3 shows a `set` of
R1 (hidden) changing the base pad and the collector current, in both formats, and the maintainer
approves it.

**As built (2026-11-01).** Not in `src/sim/paths.js`: the bench is drawn by the page like the pinout
(`page/client/bench.js`), in screen px from the engine's reading, which already gives each pin's voltage
and current; the colour scale, the dots' speed and their colour are the current layer's. Under each pad:
the pin, its voltage, the current into it and what it is joined to (`page.js`, `benchLabel`). The stubs
go down to one level and straight to their pad, the pads in the order of the pins on screen, so none
cross (a chip's two rows included, measured in jsdom); a reading under a millivolt is 0 V. Each line
under a pad fits nine tenths of the pads' pitch, so a chip's eight blocks stand side by side (staggering
them took the 555's bench out of the free area). A bench and a pinout share the room under the part:
each turns the other off. On the pedestal the part stays solid with the current layer on.

### F4 · `symbol` and `inside`

By type (`src/parts/types/*` → `symbol`, `inside`), 2D graphics in a panel of the pedestal (right in
landscape, under the part in portrait, inside the free area), drawn with the kit's own primitives and
tokens. `symbol`: the schematic symbol of the first wave with a line from each of its pins to the real
pin (F2's anchors). `inside`: a teaching diagram driven by the simulation's state (BJT junctions and
arrows of Ib and Ic with a width by current; MOSFET channel opening with Vgs; LED chip and lens with
the engine's brightness; 555 comparators, latch and discharge following `timer.js`). Moves M22
*symbol joins* and M23 *see inside*. `--validate`: `TOUR_NO_INSIDE`. Done when the four parts have
both, each in a timeline of the bench with its golden frame, and the maintainer approves a frame of
each. Then the D7 trial: a minimal prototype behind `?focusView=1`.

**As built (2026-11-01).** The symbols are data by kind (`src/parts/symbols.js`, not in each type's
module): strokes and a terminal per pin in a box of 100, so the page only draws them. Symbol and inside
share one slot beside the part, on its right as chosen in F0 (on its left only when the right is too
narrow), one at a time. M22 first joined each terminal to its pin with a line that faded; the
maintainer found the lines noisy, so the symbol's names for the pins (B, C, E; a chip's numbers, now
also printed on the block's leads) are said on the part instead: at the start of a pin's row when the
pinout shows it, else under its tip, apart. The same review (with the UX skill) moved the inside
views' arrows off what they explain: a BJT's beside its layers, a MOSFET's under its channel, each
named (Ib, Ic, Id) with its figure on a line under the view; an LED's glow stays inside its lens. When the pinout's rows are on, the figure stands above them
with a gap (a 555's block touched its first row; the rows could not go lower, the quiet lines are
under them).
The inside views are built every tick from the reading: a BJT's region and its base and collector
currents (arrows 1.5 units wide at a microampere, 5 at a tenth of an ampere, log), a MOSFET's
channel and Vgs, an LED's chip at its brightness in its light's colour, a 555's comparators (THR over
the control level, TRIG under half of it), latch and output. A finding of the MOSFET's timeline: a
TO-220 is tall, its bench did not fit under it; a bench now takes the part up by what is missing, along
its move, never past the free area's top. `focus-mosfet.json` and `focus-led.json` are F4's (F6 polishes
the four).

### F5 · The part in the page (only if D7 says so)

The ⓘ of a part's kind in the card opens *See the part*: the page enters `scene part` with the code of
F1 to F4 driven by a finger (Pins, Symbol, Inside, Bench; the card's sliders stay live); ✕ or a tap on
the board lands it. Phone (bottom sheet) and desktop (right panel), keyboard focus, `aria-label` on
callouts, reduced motion; `page.focusView: false` turns it off.

### F6 · Bench of timelines and guide

Four timelines (`focus-npn`, `focus-mosfet`, `focus-led`, `focus-555`) in both languages; a section of
`making-a-video.md` (and `hacer-un-video.md`), *A video about one part*, with the six beats, the fixed
choreography of beats 1 and 2, the rules (400 ms between two `pin`; `bench` before `flow`;
`symbol`/`inside`/`bench` off before `land`; captions never invent figures) and the new `--validate`
codes; `timeline.md`, the code map, the roadmap, the agents if a command changed, `CHANGELOG.md`. The
small-model test: a medium model writes `focus-zener.json` from the guide alone and passes
`--validate` and `--check` at the first or second try.

Order: F0 → F1 → F2 → F3 → F4 → F5 → F6. F2 and F3 are independent of each other; F4 needs both; F6
can start its timelines from F3. If time runs short: F4 for BJT and LED only, F5 later.

## Risks and how they are measured

- **A small part in a large frame**: measured above (zoom, marking size, seams); F1 fixes the
  pedestal's area from these numbers, not from a look.
- **Frame rules without a board**: `render-frames.js` already measures labels and the free area per
  frame; it is extended to callouts, pads and panels.
- **Data growing with the catalog**: four parts first; `--parts` says what each has and `--validate`
  rejects what is missing with a code, so a small model does not guess.
- **Determinism**: everything under the director's clock; `--check` (two runs) in every session.
