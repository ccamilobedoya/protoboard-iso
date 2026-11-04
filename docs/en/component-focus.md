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
| F5 | The part in the page (interactive): the trial's prototype polished, a session of its own | ✅ built 2026-11-01; waits for the maintainer on a phone and a tablet |
| F6 | Bench of timelines and guide | ✅ 2026-11-01; the videos approved by the maintainer |

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

This was the plan's first draft; the beats as F6 fixed them (times, an opening zoom, the symbol's own
caption) are in [making-a-video.md](making-a-video.md#a-video-about-one-part).

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
| D7 | Page | **decided 2026-11-01 after the live trial: yes.** The prototype behind `?focusView=1` (`page/client/focus-view.js`) was tried and liked; F5 polishes it in a session of its own, with the maintainer's list below | build it from the start; never build it |

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

The parts with two leads came after the first wave, with the same five things (`docs/en/adding-parts.md`
§6). A resistor's inside view is its film on a ceramic core between metal caps, cut in a spiral, with
a warmth over it that grows with its share of its power rating (the board's heat colour, the
simulator's limit), the voltage it takes on a line over it and its current under it, and a state line
with that share; a capacitor's, two plates with + and − charges on their inner faces, as many as the
voltage against the current layer's scale (else its rating), its current beside them, and *charging*,
*discharging* or *holding its charge*; an inductor's, its coil round a core with field lines that grow
with its current against its rated current, its current under it, and the current *growing*, *falling*
or *steady*, read from the coil's own voltage with the winding resistance taken out. Each names its pins
with the symbol's letters (1, 2; an electrolytic's + and −). None of them has a polarity to get wrong
but the electrolytic, so their mark says so: a resistor's or an inductor's first colour band (the end
its code is read from, by pin 1, "First colour band on the left: read from it; no polarity"), a ceramic
capacitor's "No polarity: it goes in either way round".

A diode's and a Zener's inside view is their PN junction drawn across: the p side by the anode, the n
side by the cathode, and between them the depletion zone, thin while it conducts and wider in reverse
(against Vz for a Zener, so it is widest when it breaks down), the voltage over it (Vf forward, Vr in
reverse, Vz in breakdown), the current under it, a warmth against its rating (a Zener's power too), and
*conducting*, *blocking* or *in breakdown, holding Vz*. A bridge rectifier's is its four diodes on a
diamond, + at the top, − at the bottom, ~1 and ~2 at the sides: the two that conduct at that instant
lit, with the current beside them outside the diamond, and a line that names the pair ("conducting
~1→+ · −→~2"). Each diode's current comes from the AC pins' (the reading's `pinCurrents`: the one an
AC pin feeds goes up to +, the one it takes from comes up from −), so the simulator gives nothing new.
A bridge's mark is its bevelled top corner, over the + lead ("Bevelled corner on the left: the + lead");
its pins are called ~1 and ~2 apart, as the symbol and the pinout's rows say them.

A potentiometer's mark is its knob ("Knob toward you: 1 W 3 from the left"), a trimmer's its printed
face ("Printed face toward you: …"): seen from either, pin 1 is on the left. Its symbol is the zigzag
with the wiper's arrow (1, W, 3); its inside view, the track in an arc from 1 to 3 with the wiper where
its position control has it (the circuit file's position until a `set` or the slider moves it: the
reading does not carry it, so the figure reads the control), each part's resistance over it, the current
along each part beside the arc, the wiper's beside its lead, the voltage at W and "wiper at 50 % from 1 to
3". An NTC thermistor and a photoresistor have no polarity ("No polarity: it goes in either way round");
their symbols are the zigzag with the IEC marks (the thermistor's diagonal line and −t°, the
photoresistor's two arrows of light coming in). A thermistor's inside view is its ceramic bead between
the leads, blue when cold and orange when hot, its atoms shaking more as it warms (the slider's −20 to
100 °C), with V over it, its current under it and "10 kΩ at 25 °C"; a photoresistor's, its cadmium
sulphide track in a zigzag between two metal combs, lighter as more light falls, an arrow of light per
decade of lux (1 lx one, 10 000 lx five), V and I and "2.98 kΩ with 100 lx". Both read the temperature,
the light and the resistance from the reading's `sensor`, which the slider updates.

A push button's rows say which pin each is joined to inside ("1 · joined to 2 inside"); its mark,
how to tell the pairs on the part ("Legs on opposite faces are joined: 1–2 and 3–4; pressed, all
four"), with no side: seen from above at an angle the pairs cross on screen. Its symbol is a normally
open push button, 1–2 down one side and 3–4 down the other, the bar on its plunger over both contacts.
Its inside view is cut from the side: the two pieces of metal, the dome over their arms and the plunger
on it; released, the dome arches clear and the gap's voltage is on a dimension line; pressed (a `set`, or
held in the page), it lies flat on both, lit, and the current crosses under them ("pressed: 1–2 joined
to 3–4"). A rocker's two tabs have no polarity; its symbol is an SPST switch drawn open; its inside view,
the rocker on its pivot (I pressed down on the right when on) and the blade under it, down on tab 2's
contact or lifted off it, with the current or the gap's voltage. A latching button's mark says its
common is the middle pin of each row; its symbol, a DPDT changeover on a dashed link, with terminals
for the pins its circuit lists; its inside view, a changeover per row in use with its blade on NC
(released) or NO (latched) and the current of each closed contact beside its common. Both read their
position from the reading (`pressed`, `on`, `contacts`), else from their control. The rows of a part
lying beside the board go under its body.

A regulator's rows by its part number where they differ (a 78xx's IN GND OUT, an LM317's ADJ OUT IN, an
AMS1117 module's VIN OUT GND, its printed names); a TO-220's mark is its metal tab, a module's its printed
side. Its symbol is a box with IN, OUT and GND (or ADJ) under it. Its inside view: the pass transistor
between IN and OUT, warmer as its power, (Vin − Vout) · I, nears its limit, and its power over it; the
error amplifier under it comparing a reference with the output through the regulator's own divider (an
LM317's reference sits between OUT and ADJ, its divider outside); a bar of the headroom, Vin − Vout,
with the dropout marked (under it, in the warning colour); the currents in and out over the leads; and
"regulating", "in dropout" or "off" from the reading (`vin`, `vout`, `headroom`, `current`, `currents`,
`power`, `state`), its limits from the device's model. A battery's rows name its leads' colours and its
mark is the red lead, on the side of its + pin; its symbol is its cells in series, a long and a short
plate each (up to four; more, the first two, a dashed line and the last); its inside view, the cells
(up to six, a 9 V block's six inside it) filled with the charge left, its internal resistance before
the + lead, EMF and I·R over them so V = EMF − I·R reads at a glance, the current inside from − to +
while it gives energy, and a warning line from the reading as the simulator gives it (a short, more
than it is meant for, an alkaline being charged). A buzzer's + is printed on its top over pin 1 (the
mark, `plus`); its symbol is IEC's dome on a flat base with + by pin 1; its inside view is the kit's
passive magnetic buzzer cut through, its coil round a pole piece in a ring magnet and the steel disc
over them pulled with the current, with one to three arcs of sound while the current changes from one
reading to the next and "silent: steady DC only heats it" on DC.

An RGB LED's rows name its chips and the common (R, COM, G, B in the package's order) and its mark is
the longest lead, the common, with R alone beside it (`longest`; the flat of its rim is by R on some
makers' parts and by B on others, so the kit does not use it). Its symbol is three LEDs to a common bar,
K for a common cathode or A for a common anode; its inside view, three chips in the lens, each glowing
in its colour with its own brightness, the lens tinted with their light mixed, the four leads with the
common longer, and each chip's brightness and the common's current under it (`channels`, `current`). A
7-segment display's rows name each segment by its place (segment a · top) and the common at pins 3 and 8;
its mark is the decimal point's edge, which has pins 1–5 with pin 1 under e (`dp`). Its symbol is the
datasheet's internal circuit, eight LEDs a–g and DP to the common's bar with both common pins on it; its
inside view, the figure 8 leaning as on the face, each segment lit in its colour with its brightness and
its letter outside it, the common's current, and the digit the lit segments draw ("it reads 3"), or the
lit ones when they draw none. On the board and on a pedestal the RGB dome's halo mixes its chips' light
and each segment lights on the display's face.

A slide switch's rows say which end each pin is and that COM is the middle one; its mark is the knob,
which joins COM to the end on its side (`slide`: "COM is the middle pin; the knob joins it to the end
pin on its side"; it names no side, since a tap moves the knob). Its symbol is a changeover, COM's blade on the throw it has; its inside view, cut
from the side as its datasheet draws it, the three fixed contacts down to their pins, the knob on top
and the slider under it bridging COM to one of them, the current through that pair under the frame and
the voltage the open pair holds (`contacts`, `open`). On the board the knob is drawn at both places and
the page shows the one its control has (a tap on the drawing slides it). A tilt switch goes in either
way round (`either`); its symbol, a switch closed as it stands with the ball that moves it; its inside
view, the can with its two balls resting on both leads' ends (upright, closed, the current under the
leads) or rolled against the low side when it leans past its angle (open, the voltage across it). An
LM35's rows say +VS 4–30 V, VOUT 10 mV per °C and GND; its mark is the TO-92's flat face; its symbol a
block with +VS, VOUT and GND; its inside view, a thermometer of its temperature, the arrow of 10 mV per
°C out to VOUT with the voltage there, its supply's current beside +VS, and under it Vs, Is and what
VOUT gives (`temperature`, `vout`, `vs`, `currents`, `state`).

Up close on a phone the pinout's rows hug their leaders as before, and now fit the screen too: they
shrink together to 65 % and a row still too long ends in "…" at the edge, as in a video; when two
columns would cut a row, one column on either side, whichever cuts less. Measured at 390 px wide: before,
the LED's rows ran from −43 to 470 px and the push button's and the latching button's past both edges;
after, every row is inside the screen (the longest cut by a few letters).

### F5 · The part in the page

**The trial (2026-11-01).** A prototype behind `?focusView=1`, in a page made with
`renderPage(…, { focusView: true })` (`page/client/focus-view.js`): *See the part* in a part's card puts
it on its pedestal with a bar of toggles (Pins, Bench, Symbol, Inside, Back), each running the same
steps a video runs (`tour.run`, `tour.hold`). The maintainer tried it and liked the idea: F5 goes ahead,
as a session of its own, because there is much to polish.

**What the trial showed (the maintainer's list), each to fix in F5:**

1. **A tap outside makes the part disappear.** A tap on the drawing while the part is on its pedestal
   must not take the focus away: outside taps do nothing, or land the part as Back does (decide and
   measure on a phone).
2. **The *See the part* button looks out of place** in the card. Redesign it from the taste and UX skills
   and the page's tokens, as an entry that belongs to the card.
3. **The bar.** Review it for a better experience and a better look: grouping (what is shown vs. leaving),
   the pressed state, icons or not, its place against the safe areas, one row where it fits.
4. **The inside view has no legend.** In a video the captions explain it; in the page nothing does, so a
   learner sees shapes without knowing what they are. Each inside view needs its key in the page: what
   the colours (n, p), the arrows (conventional current, width by current), the channel or the latch mean,
   from the kit's texts (`t()`).
5. **The phone.** Review the whole experience on a phone: sizes (a chip's eight pads, rows cut with "…",
   the figure beside the part), the bar over the drawing, touch targets, safe areas, landscape.
6. **Back must not jump.** Landing, the camera now goes out to the whole circuit, which the learner did
   not expect. It stays centred where the part was (the land keeps the part still on screen; then no
   further frame), so the board simply appears around it.

And from the plan: desktop and tablet (the bar or a panel beside the drawing), keyboard focus and
Escape, `aria-label` on the callouts and pads, reduced motion (every move a cut), `page.focusView` in
the circuit to turn it off (or on in the pages that should have it), the demo site with it, `ux-shots.js`
at its five sizes, `validate_contrast` and an a11y review of the bar and the legends. Done when the
maintainer tries it on a phone and a tablet and approves it, and the pages without it are byte for byte
as before.

**As built (2026-11-01).** On in a page whose circuit says `"page": { "focusView": true }` (or made with
`renderPage(…, { focusView: true })`; the demo site has it on every simulated page); no `?focusView=1`
any more. The six points, as solved, with the taste and UX skills (an app screen: the page's own tokens,
flat surfaces, the hairline edge its other floating panel has, 44 px targets, no ornament):

1. **Outside taps** do nothing while the part is up (`page.focusing`, read by the page's tap handler);
   Back or Escape lands it.
2. **The entry** is the card's first row, under its head: a step of tone (`--well`), the pedestal's icon
   in the accent, *See the part up close*, a chevron.
3. **The bar** names the part beside *‹ Back*, and holds two segmented controls, one per room around the
   part, so what excludes what is seen: *Pins | Bench* (under it) and *Symbol | Inside* (beside it); the
   pressed segment on `--accent-soft`; a pressed one pressed again empties its room. One row where it
   fits, two on a phone (Back and the name, then the two controls sharing the width).
4. **A legend** (*What you are seeing*) stands over the bar while an inside view is on: a swatch and a
   line for each thing the view draws (n and p material, the oxide, the channel, the current's arrows, the
   chip, the comparators and the latch), from `page.tour.legend.*`. When it comes or goes the part is
   framed again in the room left, so it never covers the bench.
5. **The phone**: the free area is measured above the dock; the figure goes where it is larger, beside
   the part or above it; a bench whose pads are narrower than 64 px keeps each pin's name and voltage
   only; sizes have a floor.
6. **Back** lands the part with the camera following it and frames nothing after: the part stays where
   it was on screen and the board comes up around it.

**After the maintainer's first try on a phone (2026-11-01).** Rows cut with "…" were not readable; of
the options (a list in the dock, rows on two lines, a tap for the whole text, or dragging), the
maintainer chose dragging and zooming as on the board. So, up close: the drawing takes drags and pinches
again (taps still do nothing), the texts are laid out once the view has framed the part and then stay
on the drawing (`page.layoutBox`), moving and scaling with it, and rows are set whole, each hugging its
leader and running past the screen's edge when long. The same try showed why the right edge was cut:
with the drawing taking no touches, a drag zoomed the whole page, and the page's bar, grown with the
time's buttons, made it wider than the phone; up close the bar now steps aside (the dock has Back), and
on Safari the dock stands above its floating toolbar. A second try showed two more: a pinch begun on
the dock still zoomed the whole page (so up close nothing but the drawing takes a pinch, and the page's
scale is held at 1 while the view is open), and the figure beside the part moved when zooming (its place
is now worked out once per layout, like the texts). A third try: the figure could still land behind the
part when it was asked for after a drag; it is now placed once, when it comes, in the drawing's own
units beside the part (measured through the camera as it is then), drawn over the part's layer, and
never moved again: it goes wherever the part goes. And the other parts' short labels now fade with the
board instead of vanishing at the end.

Keyboard: every control is a button in reading order, the first segment takes the focus on entering,
Escape leaves; the groups and Back have names for a screen reader. Reduced motion makes every move a cut
(the tour player's rule). Tried in Chromium at 390 × 844, 1024 × 1366 and 1440 × 900, in the stage,
light and notebook themes, with no error.

### F6 · Bench of timelines and guide

Four timelines (`focus-npn`, `focus-mosfet`, `focus-led`, `focus-555`) in both languages; a section of
`making-a-video.md` (and `hacer-un-video.md`), *A video about one part*, with the six beats, the fixed
choreography of beats 1 and 2, the rules (400 ms between two `pin`; `bench` before `flow`;
`symbol`/`inside`/`bench` off before `land`; captions never invent figures) and the new `--validate`
codes; `timeline.md`, the code map, the roadmap, the agents if a command changed, `CHANGELOG.md`. The
small-model test: a medium model writes `focus-zener.json` from the guide alone and passes
`--validate` and `--check` at the first or second try.

**Done (2026-11-01).** The two notes after F1, judged on the four timelines: an opening zoom, yes (the
part alone and small on an empty frame was a weak hook): `scene` with `zoom` 1.6 (1.4 for a chip), and
at 1400 ms a `frame` on the part pulls back as the pins come in (a `frame` on the part on the pedestal
now frames it alone, as `scene` does). Captions: a title and one line, the first with the part number
and one idea, a caption for the symbol, the bench's caption saying what the reading shows before a
control moves, a working beat (let go of the button and press it again, a `value`) and a closing
caption that says the idea again; each stays 2 s or more. All four follow the six beats, 26 to 33 s.
Found on the way and fixed: a symbol beside a chip's eight rows overlapped them (the rule: a chip's
pins off when its symbol comes), the chip's pin numbers under the tips ran together ("48"), two of the
NE555's Spanish rows were cut, an LED on the bench lost its light with the current layer on, and a
bench's pad kept a resistor's old value after a `set`. The small-model test: a medium model wrote
`focus-zener.json` from the guide alone and passed `--validate` and the render at the first try; one
caption said "the voltage stays put" while the bench showed it falling (a load too heavy for the
Zener), which became the guide's rule "look at the figures before the words".

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
