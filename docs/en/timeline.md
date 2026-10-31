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
broken rhythm, a value the next caption takes away within a second (`TOUR_VALUE_HIDDEN`) or a
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
