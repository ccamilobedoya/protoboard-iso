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
| `pace` | 0.000001…1000 | the page's own | seconds of simulated time per second of video in a recording: a circuit whose cycles are too slow (or too fast) for the shot runs faster (or slower) on screen. The oscilloscope's trace, the `compare` figures, the payoff (`render-frames.js`, `timeline.json`) and `--parts --pace` follow it; the page out of a recording keeps its own |
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
| `solid` | `true`, `false` | `false` | the parts in focus drawn whole and opaque even with the current layer on (by default the current layer's lines show through them), until the next `focus`: to point at the part a `set` changes |
| `move`, `ms`, `curve` | | `cut` | with a move, the veil, strips and coordinates come in along it, or leave (`[]`) |

In a recording only the told part keeps a label: the last one framed, focused, inserted or raised.

### `caption`: what is said

| Field | Values | Default | |
|---|---|---|---|
| `text` | a text, *required* unless `off` | | the caption |
| `line` | a text | none | a second line, drawn as the first (same size, colour and face): one idea in at most two lines |
| `data` | a text | none | a data row under it, only for a value or a before → after that is not already on screen (`"1 kΩ → 100 kΩ"`, `"period ×7"`): sans with tabular figures, in the accent, as large as the text (56 px at 1080 wide, 52 at 1920); never the sentence's verb |
| `em` | a text | none | the emphasis: words of the text (else of the second line) drawn in the accent and 15 % larger (`"on longer"`); the lines are still measured as laid out, and the emphasis's contrast is read apart. Not in the text nor the line: `TOUR_EM_MISSING`, and it is drawn plain |
| `off` | `true` | | takes the caption away |
| `enter` | `rise`, `fade`, `cut` | `rise` | how its lines come in: rising from their baseline behind a mask while they fade in (no frame shows half a line cut by the mask), fading in, or at once |
| `in` | 0…3000 ms | 400 | how long each line takes |
| `stagger` | 0…1000 ms | 90 | between one line and the next |
| `out` | 0…2000 ms | 200 | how long the caption before takes to leave (the new one comes in after) |

In a recording the caption is one block of one rank: the serif (Literata, under the SIL Open Font
License, embedded in the page) at 56 px, both lines alike, 90 px from each side (a safe width of
900 px), on a scrim of the stage's colour that keeps it readable over a light board (at least 4.5:1,
measured on every checked frame). At most 32 characters a line (32 characters of the serif at 56 px
take 820 to 895 px: at the limit, a line of wide letters wraps) and two lines. The second line's look is a set of CSS variables, all defaulting
to the first line's: `--cap-line-size`, `--cap-line-ink`, `--cap-line-face`, `--cap-line-weight`.
The first caption of a recording is whole on its first frame (it does not rise in).

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
| `scope` | `all`, `focus` | `all` | `focus`: the current only on the nets that touch the legs of the parts in focus (their strips, the jumpers between them and the focused parts' own leads); the rest is plain board under the veil. It follows every later `focus` until the next `flow` step |
| `style` | `plan`, `real` | the page's (`page.flow.style`) | how the layer is drawn in this timeline: `plan`, pads and straight lines; `real`, along the strips, the legs and the jumpers. The first `flow` step that names one sets it for the whole recording; a later one that names the other is reported (`TOUR_FLOW_STYLE`) and not followed |
| `sense` | `{ "part", "forward", "back" }` | none | the current in two colours by the way it runs through `part` (a capacitor: `forward` while it charges, `back` while it discharges). Each side is `{ "color", "parts" }`: `color` (`pulse`'s names or `#rrggbb`) for the dots while it runs that way, and `parts`, the parts whose nets carry it meanwhile (instead of the focus). The dots are thicker and on the log scale, so a small current is seen moving next to a large one |

On a crowded board the whole layer reads as dots and lines without a subject: in a video, switch it
on over a close frame with one or two parts in focus and `"scope": "focus"`, and `"style": "real"`
so the current follows the parts the viewer sees.

```json
{ "at": 9000, "do": "focus", "parts": ["C1"] },
{ "at": 9400, "do": "flow", "on": true, "ramp": 600, "scope": "focus", "style": "real" }
```

A 555's charge and discharge in two colours (M39): amber while C1 fills through R1 and R2, blue while
it empties through R2 alone (amber and blue also read apart with colour blindness):

```json
{ "at": 8100, "do": "flow", "on": true, "scope": "focus", "style": "real",
  "sense": { "part": "C1", "forward": { "color": "#ffb020", "parts": ["R1", "R2", "C1"] }, "back": { "color": "#4da3ff", "parts": ["R2", "C1"] } } }
```

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

A raised part is still in the circuit: the simulation does not change. A raise brings the part into
focus and, in a recording, gives it the told label (a recording keeps one): to point at a secondary
part without taking the subject's place, use `nudge`.

### `nudge`: a secondary part noticed

A part the voice names as a cause, while the subject is another, rises a little and comes back: up
in the first 30 % of `ms` along a quint out, a rest, and down along the opposite curve. It does not
change the focus nor the told label; a part under the veil is drawn over it only while it moves. It
is the video's version of the page's "pulse on load".

| Field | Values | Default | |
|---|---|---|---|
| `part` | an id, *required* | | |
| `mm` | 1…4 | 3 | how high |
| `ms` | 600…1200 | 900 | the whole nudge: up, a rest and down |
| `curve` | a cubic-bezier | the quint out | the way up (the way down is its mirror); `[0.34, 1.56, 0.64, 1]` for a slight bounce |

It has no `move`. At most one per beat, on the word that names the part.

```json
{ "at": 12300, "do": "nudge", "part": "R1", "mm": 3, "ms": 900 }
```

### `scene`: a part alone on a pedestal (M17)

For a video about one part ([component-focus.md](component-focus.md)). In mode `part` the board, the
other parts, their labels and lights go away (the hole grid stays), the part is raised 3 mm and
framed alone in the middle of the free area, without its short label (the caption names it); it stays in the circuit, so `set`, `value` and `probe` still work.

| Field | Values | Default | |
|---|---|---|---|
| `mode` | `part`, `board`, *required* | | `board`: back to the board as a `land` does, the camera where it is |
| `part` | an id, *required* with `part` | | a part of the circuit, not a wire or a supply (`TOUR_SCENE_PART`); `render-frames.js --parts` marks those that can stand there |
| `zoom` | 0.5…3 | 1 | closer in or farther out than the part's frame |
| `enter` | `cut`, `drop` | `cut` | `drop`: the part falls onto its pedestal from 8 mm with a small bounce (700 ms) |
| `push` | 0.5…3 | none | a slow push: the camera keeps closing in to this zoom until the next step that moves it (a `frame`, `land` or `scene`), at most 8 s, so the hook is never still |
| `light` | `pulse`, `accent`, `value`, `voltage`, `current` or `#rrggbb` | none | a soft light of that colour on the pedestal under the part, until the board comes back: a hook that works as a thumbnail (the chip of a blinking circuit in a red glow, `"#ff3b2f"`) |
| `move`, `ms`, `curve` | | `cut` | with a move, the board fades along it and the camera arrives |

The chip's marking reads left to right from the camera, whichever way the chip sits on the board
(it is turned half a turn when it would read upside down; its notch still tells pin 1).

A scene may come after steps on the board (a video that opens on its result, the LED blinking on the
board, and only then shows the chip alone): the board fades along its move as at the start, a `set`
while the part is on the pedestal changes the circuit unseen (the hook's change put back before the
story starts), and a `land` brings the board back (`555-result-first.json`).

A `frame` on the part on the pedestal frames it the same way (alone, without room for its label), so a
video can open close on it (`zoom` 1.6) and pull back when its pins come in: `{ "at": 1400, "do":
"frame", "target": "Q1" }`.

### `land`: the board rises under the part (M18)

| Field | Values | Default | |
|---|---|---|---|
| `part` | an id, *required* | | the part on the pedestal |
| `move`, `ms`, `curve` | | `travel` | |

The part comes down to its holes while the camera follows it, so it stays still on screen and the
board, with the other parts, rises under it. The board comes in opaque, never seen through over the
part: it slides up from below the frame under a veil of the stage's colour, the part over the veil.
When it has touched down it lightens in a ramp of 700 ms, once the camera has opened (at the end of
the first `frame` after the land, else at the land's own end); then the focus goes. No two
consecutive frames at 30 fps differ by more than 40 in mean brightness (of 255) during a land. An `assemble` after a `land`
brings the other parts one by one (they wait unseen) and leaves the landed part in place. A `focus`
during a land (at its time or while the board lightens) is kept, but its strips and coordinates are
the board's: they stay away while it comes in and fade in over 300 ms once it is lit, never over the
empty stage with the part.

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
oscilloscope in a box of its own, from t = 0 (M11): in portrait under the caption (`place` `top`,
from 28 % to 40 %) or under the circuit (`bottom`, from 56 % to 75 %, the camera framing again what
it framed last above the box), in landscape under the caption.

| Field | Values | Default | |
|---|---|---|---|
| `part` or `node` or `off` | an id, a strip as the page names it, or `true` (one of the three, *required*) | | `off` takes it away |
| `field` | `voltage`, `current` | `voltage` | the trace in the box |
| `title` | a text (`""` for none) | the kit's (*Oscilloscope*) | the box's title |
| `label` | a text | the kit's (*Voltage*, *Current*) | the trace's name, before its value |
| `note` | a text (`""` for none) | the kit's (*model, since switching on*) | under the trace |
| `window` | 0.000001…3600 s | the kit's | in a recording, the time the box always shows: from t = 0, then scrolling, so a `set` that changes the pace shows as more or fewer cycles instead of a new scale; in s of the oscilloscope's time (simulated, or the wall clock in a circuit that does not change by itself) |
| `marks` | `true`, `false` | `false` | in a recording, a dashed line in the box at each `set` from then on, with the control's new value (*R1 → 100 kΩ*), so before and after both read |
| `place` | `bottom`, `top` | `bottom` | in a portrait recording: `bottom`, from 56 % to 75 % of the height, the circuit framed above it from 40 % to 56 %; `top`, from 28 % to 40 %, between the caption and the circuit, which keeps its whole band from 40 % to 75 % |
| `size` | `full`, `compact` | `full` | `compact`: no note, the trace's name and value inside the plot (after a `title` the step gives: "C1 · Voltage: 5.3 V"), a thicker trace, two axis labels (the top of the scale and the end of the window); for the box on top, 12 % of the height |
| `compare` | `true`, `false` | `false` | in a recording, at each `set` (it implies `marks`): the cycles before the mark stay as a faint ghost trace laid over what comes after it (shifted by whole periods), and the change is written in the box, from the simulation, once the control has arrived. With an LED in the circuit it says what the eye sees, in words and as a proportion: "on ×5 · off the same" (off is "the same" within 15 %; otherwise "off ×2"), true at any `pace`; with `change` `times`, in the oscilloscope's seconds: "on 0.08 → 0.40 s · off the same"; without one, the probed part's period: "period 148 ms → 832 ms (×5.6)" |
| `change` | `ratio`, `times` | `ratio` | how a comparing box says the change: as a proportion ("on ×5", whole from ×3 up and with one decimal under it) or in the oscilloscope's seconds, which a recording at its own `pace` does not show at that speed |
| `reading` | `true`, `false` | `true` | `false`: the trace's name without its value now ("C1 · charge", not "C1 · Voltage: 4.52 V") |
| `clock` | `true`, `false` | `true` | `compact`, `false`: no time at the end of the window |

A comparing box is laid out in three bands, so no text ever lies on the trace: on top the trace's
name and each mark's text (*R1 → 47 kΩ*), each on a plate of the screen's colour and never over the
other; the trace and its ghost in the middle, scaled to their own swing; at the bottom the change,
46 px on screen, in the accent, on its plate. Without `compare` a mark's text and the period's change
are drawn over the trace on a halo of the screen's colour.

On top the box needs a caption of at most two lines and no `value` line under it (the value is in
the box): a longer caption would reach into it, and the recording's check says so. `top` goes with
`compact`.

Without a `window` the box starts at the kit's window, stretches with the time up to twice that and
then scrolls, and a `set` that changes a time constant gives it a new window: the trace rescales by
itself and hides a change of pace. To show one, give the box a fixed `window` and `marks`. How much
time to ask for: `render-frames.js --parts` prints the kit's window and how many seconds of simulated
time a second of video shows (`555-astable`: 0.55 s, at 0.055 s a second; the timeline's `pace`
changes that speed); the time keeps that speed after a `set`, so a blink a hundred times slower takes a hundred times longer on screen too. A window
of about twice the kit's keeps several cycles before the `set` and one long one after it. Whether
the window and the time after the `set` hold one whole cycle: `render-frames.js --parts <circuit>
--what-if R1.resistance=100000` (below) and the recording's own check (`TOUR_SCOPE_WINDOW`,
`TOUR_PAYOFF_SHORT`).

```json
{ "at": 6000, "do": "probe", "part": "C1", "window": 1.1, "marks": true },
{ "at": 11500, "do": "set", "part": "R1", "field": "resistance", "value": 100000, "move": "travel", "ms": 1800 }
```

### `card`: a card

A sentence alone over the whole screen for a moment (M40): a figure to keep ("×5 on · off the same").
Large (112 and 80 px at 1080 wide), in the caption's face and colours, within the safe width and
between the platforms' bands (15 % to 65 % of the height, checked by the recording). It covers what
is under it and leaves it as it was.

| Field | Values | Default | |
|---|---|---|---|
| `text` | a text, *required* | | the sentence |
| `line` | a text | none | a second line, smaller |
| `em` | a text | none | the emphasis, as a caption's |
| `hold` | 300…5000 ms | 1500 | how long it stays whole |
| `enter` | `rise`, `fade`, `cut` | `fade` | how it comes in |
| `in`, `out` | 0…1000 ms | 250 | how long it takes to come and to go |

```json
{ "at": 24000, "do": "card", "text": { "en": "×5 on", "es": "×5 prendido" }, "line": { "en": "off the same", "es": "apagado igual" }, "em": "×5" }
```

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

The first frame is the first moment's: when a timeline starts after 0, the steps of its first
moment that set what is seen (`scene`, `frame`, `focus`, `flow`, `flip`, `label`, `caption`, `probe`)
run at 0, as cuts; at 0, a `scene` and a `caption` of that moment are cuts too. A video never opens
on the circuit as the page shows it (the result given away, and maybe the thumbnail). Those steps
are logged with `"primed": true`.

`timeline.json` also lists, for whoever adds sound, the moments a sound may go with (`events`, in
ms of the recording): `land` (the part touches down: the land's end), `count` (each new figure a
`set` moving a number or a `value` counting up shows; `shown` is the figure), `probe` (`on` true or
false: the oscilloscope's box comes or goes), `mark` (a mark drawn in it, at the `set`), `led` (each
time an LED turns on or off in the simulation, with `part` and `on`: a tick for each blink) and `card`
(`on` true or false: a card comes or goes). And the
`payoff` of each `set` that changes a number: the cycles before and after (period, an LED's time lit
and dark, in simulated s and in s of video), the time the timeline holds after it (`holdMs`) and the
time one whole cycle takes (`needMs`).
