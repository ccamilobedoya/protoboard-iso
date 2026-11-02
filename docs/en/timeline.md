# Timelines: every step and option

*[Español](../es/linea-de-tiempo.md)*

A timeline is the script of a video and of a page's tour (*See how it works*): a JSON file of
steps, each at a time, each doing one thing. Whoever writes it decides everything that is said and
shown; the kit writes no text of its own into a caption. Every option below is optional unless it
says *required*: left out, the step does what the kit does by default, so a short timeline already
looks right and a long one can control each move.

Making a video from start to end, step by step: [making-a-video.md](making-a-video.md). This page is the reference. The plan and the decisions behind it are in
[stage-and-video.md](stage-and-video.md); the schema is `schema/timeline.schema.json` (editors
complete and check the fields with it). Example timelines: `examples/tours/`.

## The file

```json
{
  "$schema": "../../schema/timeline.schema.json",
  "circuit": "npn-switch",
  "format": "vertical",
  "theme": "stage",
  "steps": [
    { "at": 0, "do": "frame", "target": "board", "move": "cut" },
    { "at": 0, "do": "caption", "text": { "en": "A transistor as a switch", "es": "Un transistor como interruptor" } }
  ]
}
```

| Field | Values | Default | What it is |
|---|---|---|---|
| `circuit` | a circuit file's name (beside the timeline or one folder up) or a recipe's | none | the circuit it tells (for `scripts/render-frames.js`) |
| `format` | `vertical` (1080 × 1920), `horizontal` (1920 × 1080) | `vertical` | the video's size |
| `theme` | `stage`, `notebook`, `light`, `dark` | `stage` | the page's look in a recording |
| `steps` | a list of steps, *required* | | what happens |

A circuit plays its timeline in its page when `page.tour` names the file (read beside the circuit,
never outside its folder) or holds the timeline itself.

## Steps and time

Every step has `at` (ms from the start, *required*) and `do` (the action, *required*). Steps with the
same `at` start together, in the order written. A `wait-until` holds the clock: the steps after it
move by as long as it waited.

Texts (`text`, `line`, `label`, `title`, `note`) are plain (`"text": "Hello"`) or one per language
(`"text": { "en": "Hello", "es": "Hola" }`); the page takes its language, else English, else the
first. At most 280 characters each. A text is always shown as text, never read as markup.

### Moves: how long, along which curve

Steps that move something take a `move`, one of seven words, so the rhythm is the same in every
video:

| `move` | Duration (`ms` range) | Curve | For |
|---|---|---|---|
| `cut` | 0 | none | a change of shot or state |
| `arrival` | 750 (600…900) | quint out | the camera landing on a part |
| `travel` | 1500 (1200…1800) | quart in-out | from one place to a far one |
| `push` | 5000 (3000…8000) | cubic out | a slow close-in while a caption speaks |
| `hit` | 150 (120…180) | quint out | a value appears, a button goes down |
| `breath` | 800 (400…1200) | still | a rest |
| `anticipation` | 250 back, then an arrival | recoil, then quint out | the key move of a video, once |

- `ms` changes the duration. Outside the move's range `check` warns (`TOUR_MOVE_MS`) and the step
  still plays as written.
- `curve` replaces the move's curve with your own cubic-bezier, `[x1, y1, x2, y2]` as in CSS (x
  between 0 and 1; y may overshoot, between −3 and 4): `[0.34, 1.56, 0.64, 1]` overshoots a little
  and comes back. A `cut` stays a cut.
- Rhythm, checked by `check` as warnings: never two `push` in a row, and a breath (400 ms) between
  two `hit`.

## Actions

### `frame`: the camera

The camera moves only when a step moves it (and when a `probe` box needs room, below): with no
`frame` it stays where it is. In a recording a named target is framed in the part of the screen the
caption leaves free.

| Field | Values | Default | |
|---|---|---|---|
| `target` | `board`, `parts`, `here`, a part's id, or a list of ids, *required* | | `here` is the frame as it is now, to zoom or pan from it; a list frames all of its parts |
| `zoom` | 0.05…20 | 1 | closer in (above 1) or farther out (below 1), about the target's centre |
| `pan` | `[x, y]`, each −3…3 | none | then moves the frame by shares of its own size: `[0.2, 0]` a fifth to the right, `[0, -0.1]` a tenth up |
| `move`, `ms`, `curve` | | `arrival` | how it gets there |

A part's frame includes its short label in a recording. To follow something by hand: a `frame` on
`here` with a `pan`, step after step, or `push` with a small `zoom`.

```json
{ "at": 4800, "do": "frame", "target": "D1", "zoom": 1.25, "move": "push", "ms": 4000 },
{ "at": 9000, "do": "frame", "target": "here", "pan": [0.3, 0], "move": "travel" },
{ "at": 11000, "do": "frame", "target": ["R1", "D1"], "move": "arrival" }
```

### `focus`: what is explained

| Field | Values | Default | |
|---|---|---|---|
| `parts` | a list of ids, *required*; `[]` clears | | the parts brought forward: the rest dims under a veil, the strips under their leads show, the board's coordinates of their holes light up |
| `move`, `ms`, `curve` | | `cut` | with a move, the veil, strips and coordinates come in along it, or leave (`[]`) |

In a recording only the told part keeps a label: the last one framed, focused, inserted or raised.

### `caption`: what is said

| Field | Values | Default | |
|---|---|---|---|
| `text` | a text, *required* unless `off` | | the caption |
| `line` | a text | none | a second, smaller line |
| `off` | `true` | | takes the caption away |
| `enter` | `rise`, `fade`, `cut` | `rise` | how its lines come in: rising from their baseline behind a mask, fading in, or at once |
| `in` | 0…3000 ms | 400 | how long each line takes |
| `stagger` | 0…1000 ms | 90 | between one line and the next |
| `out` | 0…2000 ms | 200 | how long the caption before takes to leave (the new one comes in after) |

### `value`: a reading, large

| Field | Values | Default | |
|---|---|---|---|
| `part` | an id, *required* | | |
| `field` | `current`, `voltage`, `power`, `brightness`, *required* | | what is read, in A, V, W or % |
| `label` | a text | none | beside the number |
| `count` | 0…5000 ms | 500 | it counts up to the reading; 0 shows it as it is |
| `enter`, `in` | as a caption's | `rise`, 400 | how it comes in |

The number is the simulation's (a model), written by the kit; the label is yours. A new caption
takes the value away.

### `set`: a control moves

| Field | Values | Default | |
|---|---|---|---|
| `part`, `field`, `value` | a control of the part (`pressed`, `resistance`, `voltage`…) and its new value, *required* | | `check` names the controls a part has |
| `move`, `ms`, `curve` | | `hit` | a number moves along the curve (on a log scale where the slider is), a button changes at once |

A slider moving by itself between two values (M10): two `set` steps with `travel`.

### `flow`: the current layer

| Field | Values | Default | |
|---|---|---|---|
| `on` | `true`, `false`, *required* | | |
| `ramp` | 0…10000 ms | 0 | the dots come up from rest to their speed (M6) |

### `pulse`: a flash along the current's path (M7)

With the current layer on. Each piece the current runs through lights in turn, by its voltage.

| Field | Values | Default | |
|---|---|---|---|
| `through` | a list of part ids or strips | the whole path | only the pieces of these parts or strips |
| `direction` | `forward`, `back` | `forward` | from + to −, as the current runs, or the other way |
| `color` | `pulse`, `accent`, `value`, `voltage`, `current`, or `#rrggbb` | `pulse` | the names are the theme's colours |
| `width` | 0.05…1 | 0.25 | the share of the run each piece is lit: smaller is a sharper flash |
| `size` | 1…12 | 4.5 | its thickness, in drawing units |
| `move`, `ms`, `curve` | | `travel` | how long the run takes (`curve` is not used: the flash runs evenly) |

### `insert`: a part goes into its holes (M15)

| Field | Values | Default | |
|---|---|---|---|
| `part` | an id, *required* | | it comes into focus |
| `enter` | `drop`, `fade`, `cut` | `drop` | down from above, fading in, or at once |
| `height` | 0…40 mm | 12 | where a drop starts |
| `dark` | `true`, `false` | `true` | no current in the circuit until it is in (as on a bench: a part out opens the circuit) |
| `move`, `ms`, `curve` | | `arrival`, 700 ms | |

When it lands the dots come up in 600 ms and an LED's light in 180 ms.

### `assemble`: the circuit builds itself (M4, M5)

The parts leave the board, then come in one after the other; a wire is drawn from one end to the
other. Best before the current layer is on.

| Field | Values | Default | |
|---|---|---|---|
| `parts` | a list of ids, or of `{ "part", "enter", "wire", "from" }` | every part, in the circuit's order | the order they come in; an object gives that part its own way in |
| `gap` | 300…3000 ms | 1100 | from one part to the next |
| `ms` | 0…5000 ms | 700 | how long each part takes |
| `enter` | `drop`, `fade`, `cut` | `drop` | how a part (not a wire) comes in |
| `wire` | `draw`, `fade`, `cut` | `draw` | how a wire comes in |
| `from` | `start`, `end` | `start` | the end a wire is drawn from (its first pin, or its second) |
| `height` | 0…40 mm | 12 | where a drop starts |
| `dark` | `true`, `false` | `true` | no current until the last one is in |
| `move`, `curve` | | `arrival` | each part's curve |

```json
{ "at": 300, "do": "assemble", "gap": 800,
  "parts": ["S1", "R1", "R2", "Q1", { "part": "D1", "enter": "fade" }, { "part": "W1", "from": "end" }, "W2", "W3", "W4"] }
```

### `raise`: set a part apart (M16)

| Field | Values | Default | |
|---|---|---|---|
| `part` | an id, *required* | | it comes into focus |
| `mm` | 0…12 | 3 | how high; it stays up until a `raise` with `"mm": 0` |
| `move`, `ms`, `curve` | | `arrival` | |

A raised part is still in the circuit: the simulation does not change.

### `scene`: a part alone on a pedestal (M17)

For a video about one part ([component-focus.md](component-focus.md)). In mode `part` the board, the
other parts, their labels and lights go away (the hole grid stays), the part is raised 3 mm and
framed alone in the middle of the free area, without its short label (the caption names it); it stays in the circuit, so `set`, `value` and `probe` still work.

| Field | Values | Default | |
|---|---|---|---|
| `mode` | `part`, `board`, *required* | | `board`: back to the board as a `land` does, the camera where it is |
| `part` | an id, *required* with `part` | | a part of the circuit, not a wire or a supply (`TOUR_SCENE_PART`); `render-frames.js --parts` marks those that can stand there |
| `zoom` | 0.5…3 | 1 | closer in or farther out than the part's frame |
| `move`, `ms`, `curve` | | `cut` | with a move, the board fades along it and the camera arrives |

A `frame` on the part on the pedestal frames it the same way (alone, without room for its label), so a
video can open close on it (`zoom` 1.6) and pull back when its pins come in: `{ "at": 1400, "do":
"frame", "target": "Q1" }`.

### `land`: the board rises under the part (M18)

| Field | Values | Default | |
|---|---|---|---|
| `part` | an id, *required* | | the part on the pedestal |
| `move`, `ms`, `curve` | | `travel` | |

The part comes down to its holes while the camera follows it, so it stays still on screen and the
board, with the other parts, rises under it; then the focus goes. An `assemble` after a `land`
brings the other parts one by one (they wait unseen) and leaves the landed part in place.

```json
{ "at": 0, "do": "scene", "mode": "part", "part": "Q1" },
{ "at": 3000, "do": "land", "part": "Q1" },
{ "at": 4800, "do": "frame", "target": "parts", "move": "travel" },
{ "at": 4800, "do": "assemble", "gap": 600 }
```

A video of a whole circuit may open the same way: its main part alone on the pedestal while the
caption names it (the hook), then a `land` with the other parts already in their holes (no
`assemble`), and the video goes on on the board. The board and the other parts rise under the part,
their lights, labels and current come back as they were, and the focus goes; frame the board or the
parts when the land ends (the camera stays as close as the pedestal until a `frame` moves it, and a
board seen that close takes the screen behind the caption):

```json
{ "at": 0, "do": "scene", "mode": "part", "part": "U1", "zoom": 1.6 },
{ "at": 2500, "do": "land", "part": "U1" },
{ "at": 4000, "do": "frame", "target": "parts", "move": "travel" },
{ "at": 4000, "do": "flow", "on": true, "ramp": 600 }
```

### `pin`: a part's pins, one by one (M19, M20)

On the pedestal (or on the board), a pin lights at its tip and its row of text comes in under the
part, as a datasheet prints it: what the pin does, from the kit (`pin.role.*`), a chip's with its
number ("3 OUT · output"). Lit pins add up until `off`. The rows stay inside the free area, each
column takes the pins on its side of the part, and no two leaders cross (a pin behind a chip's body
shows its leader coming out from under it); while any pin is lit, the part's short label stays away.

| Field | Values | Default | |
|---|---|---|---|
| `pin` | `"part.pin"` | | its name (`"Q1.B"`), a usual alias (`"Q1.base"`, `"D1.K"`) or a chip's number (`"U1.2"`); `render-frames.js --parts` lists each part's pins (`TOUR_UNKNOWN_PIN`) |
| `mark` | an id | | the package's mark instead (a TO-92's flat face, a TO-220's tab, a chip's notch, an LED's flat edge, a stripe): on a quiet line at the bottom the kind of part and what the mark tells, from the drawing ("Flat face toward you: E B C from the left"); a part without one: `TOUR_NO_MARK` |
| `off` | `true` | | every pin and mark off |
| `text` | a text | the kit's | the pin's row in other words |
| `move`, `ms`, `curve` | | `arrival` | the dot lights in the first quarter, the row rises in with the rest |

One of `pin`, `mark` and `off`. Leave 400 ms between two pins, and turn them off before a `land`.

```json
{ "at": 1600, "do": "pin", "pin": "Q1.E" },
{ "at": 2000, "do": "pin", "pin": "Q1.B" },
{ "at": 2400, "do": "pin", "pin": "Q1.C" },
{ "at": 3200, "do": "pin", "mark": "Q1" },
{ "at": 6000, "do": "pin", "off": true }
```

### `bench`: the part on a test bench (M21)

On the pedestal, each pin's stub runs down to a pad in a row under the part. The pad takes the colour
of the pin's voltage (the current layer's scale) and under it are the pin, its voltage (under a
millivolt, 0 V), the current into it, and what it is joined to in the circuit (the net's name, a
supply's terminal, or the first other part: "→ R1 1 kΩ"). The circuit keeps running hidden: a `set`
on a part not shown (the base resistor) changes the pads. With `flow` on, dots run along the stubs
at the current layer's speed. The stubs never cross, and the pads and their readings stay in the free
area (a tall part goes up, along the step's move, to leave them room). A bench takes the room under the part: it turns its pins' callouts off, and a `pin` after it
turns the bench off.

| Field | Values | Default | |
|---|---|---|---|
| `on` | `true`, `false`, *required* | | `false`: the bench goes |
| `part` | an id, *required* with `on: true` | | the part on the pedestal; a circuit without a simulation cannot have one (`TOUR_BENCH_NOT_SIMULATED`) |
| `move`, `ms`, `curve` | | `arrival` | the stubs are traced, then the pads and readings come |

```json
{ "at": 6000, "do": "bench", "part": "Q1", "on": true },
{ "at": 7200, "do": "flow", "on": true, "ramp": 600 },
{ "at": 9500, "do": "set", "part": "R1", "field": "resistance", "value": 100000, "move": "travel", "ms": 1800 },
{ "at": 14000, "do": "bench", "on": false }
```

### `symbol` and `inside`: a figure beside the part (M22, M23)

Beside the part on its pedestal (on its right; on its left only when the right is too narrow), one
figure at a time, only when a step asks for it:

- `symbol`: the part's schematic symbol (a bipolar transistor, a MOSFET, an LED, a diode, a zener, a
  resistor, a capacitor, a chip as a block with its pins' names and numbers). The part says which leg is
  which with the symbol's names, not lines: at the start of a pin's row when the pinout shows it
  ("E · emitter · …"), else under its tip (M22).
- `inside`: what goes on inside, drawn from the simulation on every tick (M23): a bipolar transistor's
  three layers with its base and collector currents as arrows beside them, as wide as the current,
  their figures and its region under it; a MOSFET's channel opening with its gate voltage, its current
  as an arrow under it; an LED's chip glowing with its brightness; a 555's
  comparators, latch and output. Didactic, not to scale.

| Field | Values | Default | |
|---|---|---|---|
| `on` | `true`, `false`, *required* | | `false`: the figure goes |
| `part` | an id, *required* with `on: true` | | a part whose kind has one (`TOUR_NO_SYMBOL`, `TOUR_NO_INSIDE`; `render-frames.js --parts` says which) |
| `move`, `ms`, `curve` | | `arrival` | |

```json
{ "at": 4800, "do": "symbol", "part": "Q1", "on": true },
{ "at": 6000, "do": "inside", "part": "Q1", "on": true },
{ "at": 14000, "do": "inside", "on": false }
```

### `flip`: the other side

| Field | Values | Default | |
|---|---|---|---|
| `view` | `front`, `back` (the page's views), *required* | | a cut; leave a breath before and after |

### `probe`: the oscilloscope

In the page it opens the part's (or strip's) card with its oscilloscope. In a recording it shows the
oscilloscope in a box of its own, from t = 0 (M11): in portrait in the band from 56 % to 75 % of the
height (the camera frames again what it framed last, above the box), in landscape under the caption.

| Field | Values | Default | |
|---|---|---|---|
| `part` or `node` or `off` | an id, a strip as the page names it, or `true` (one of the three, *required*) | | `off` takes it away |
| `field` | `voltage`, `current` | `voltage` | the trace in the box |
| `title` | a text (`""` for none) | the kit's (*Oscilloscope*) | the box's title |
| `label` | a text | the kit's (*Voltage*, *Current*) | the trace's name, before its value |
| `note` | a text (`""` for none) | the kit's (*model, since switching on*) | under the trace |

### `label`: a part's name in a recording

| Field | Values | Default | |
|---|---|---|---|
| `part`, `text` | an id and a text (`""` for none), *required* | | the part's short label (the one a recording keeps, *D1 · red* by default) in your words |

### `wait-until`: wait for the simulation

| Field | Values | Default | |
|---|---|---|---|
| `part`, `field` | as `value`'s, *required* | | |
| `above` or `below` | a number, one *required* | | the condition |
| `max` | 0…60000 ms | 10000 | it gives up after this |

## What the kit writes by itself

Only the numbers: a `value`'s reading, the oscilloscope's scale and times, and the defaults named
above (the oscilloscope's title, trace names and note, a part's short label), each of which a step
can replace. Captions are always the timeline's.

## Checks

`node bin/protoboard-iso.js check <circuit>` reads the circuit's timeline. A shape, size or file
problem leaves the page without a tour (`TOUR_SHAPE`, `TOUR_FIELD`, `TOUR_ACTION`, `TOUR_MOVE`,
`TOUR_JSON`, `TOUR_TOO_LARGE`…); an unknown part or control, an `ms` outside its move's range, a
broken rhythm, a value the next caption takes away within a second (`TOUR_VALUE_HIDDEN`), a pin a part does not have (`TOUR_UNKNOWN_PIN`), a mark it does not have (`TOUR_NO_MARK`), a bench in a circuit not simulated (`TOUR_BENCH_NOT_SIMULATED`), a symbol or an inside view a part's kind does not have (`TOUR_NO_SYMBOL`, `TOUR_NO_INSIDE`) or a
timeline over ten minutes is a warning and it still plays. Caps: 100 kB, 200
steps, 280 characters a text, ten minutes.

## Recording

```bash
node scripts/render-frames.js examples/tours/npn-switch-build.json --format both --lang es --check
node scripts/assemble.js examples/out/video/npn-switch-build/vertical -o video.mp4
```

The frames, their checksums, the subtitles and `timeline.json` (when each step really ran and what
was on screen) are written to `examples/out/video/<timeline>/<format>/`; see
[stage-and-video.md](stage-and-video.md#recording-a-video).
