# Making a video of a circuit

*[Español](../es/hacer-un-video.md)*

A step-by-step guide, from a recipe's name to an `.mp4` for a phone. Everything is measured by the
kit: you write one JSON file (the timeline) and run three commands. Nothing is worked out by hand:
not a hole, not a value, not a position on the screen. The reference of every step and option is
[timeline.md](timeline.md); the design behind it, [stage-and-video.md](stage-and-video.md).

What you need: `npm install` once (Playwright and its Chromium, for the frames) and, for the last
step only, ffmpeg (`apt install ffmpeg`, or a static build).

## 1. Choose the circuit and list what it has

A timeline tells one circuit: a recipe's name (`led-resistor`, `npn-switch`…, the list is in
[recipes.md](recipes.md)) or a circuit file. It must have a source (a supply, a battery, a
generator, a board on USB): a video shows the simulation.

```bash
node scripts/render-frames.js --parts npn-switch
```

prints whether it is simulated and everything a timeline can name:

```text
npn-switch: simulated (a timeline can play)
parts (frame, focus, insert, assemble, raise, label):
  S1   button
       readings (value, wait-until): current
       set pressed = false
  R1   resistor 1k
       readings (value, wait-until): current, voltage, power
       set resistance = 1000 Ω 10…100000 (log)
  D1   led red
       readings (value, wait-until): current, voltage, power, brightness
  W1   wire red
supplies (not drawn on the board: only set):
  V1   bench
       set voltage = 5 V 0…30
strips (probe "node"):
  3:f-j    S1.1 R2.1 W1.2
  T+       W1.1
```

Use only these ids, readings, controls and strips. A `value` needs a reading the part lists; a
`set` needs a control it lists, with a value in its range. A supply (a bench supply, a generator)
is not drawn on the board: it can be `set`, never framed or focused; show its effect on a part
that is drawn.

## 2. Write the story before the steps

One idea per video, in four beats (12 to 25 s in all):

1. **Hook** (0 to 1.5 s): the circuit and a caption that names what it does. `"target": "parts"`
   frames the parts tight; `"board"` the whole board, which leaves a small circuit small.
2. **Where** (≈ 1.5 s): the camera arrives on the part that matters; focus on it; the current
   comes up.
3. **Why** (one to three beats of 2 to 3 s each): one caption each, a reading large (`value`), a
   control that moves (`set`) so the cause and the effect are seen together.
4. **Close** (≈ 2 s): back to the board, a caption that sends to the page ("Try it in the page: tap
   R1"), the focus cleared.

Write each caption in English and Spanish, short: at most about 40 characters, so it stays within
two lines on a phone (Spanish runs longer: count the Spanish one; the cap is 280). Say what
happens, not the number: the kit writes the number of a `value` from the simulation. Never write a
value of your own into a caption.

Choose readings that change in the story: in the `--parts` list, a part whose reading the `set`
moves (a pull-up's current when the button closes, not an LED that stays dark).

## 3. Write the timeline

Save it as `examples/tours/<name>.json` (the name of the video; the circuit is its `circuit`). A
template to copy, the four beats of `led-resistor`:

```json
{
  "$schema": "../../schema/timeline.schema.json",
  "circuit": "led-resistor",
  "format": "vertical",
  "steps": [
    { "at": 0, "do": "frame", "target": "board", "move": "cut" },
    { "at": 0, "do": "caption", "text": { "en": "An LED needs a resistor", "es": "Un LED necesita una resistencia" } },

    { "at": 1200, "do": "frame", "target": "D1", "move": "arrival" },
    { "at": 1200, "do": "focus", "parts": ["D1"] },
    { "at": 1200, "do": "flow", "on": true, "ramp": 600 },

    { "at": 2400, "do": "caption", "text": { "en": "R1 sets the current through the LED", "es": "R1 fija la corriente que pasa por el LED" } },
    { "at": 2400, "do": "focus", "parts": ["R1", "D1"] },
    { "at": 2400, "do": "value", "part": "D1", "field": "current", "label": { "en": "through the LED", "es": "por el LED" } },
    { "at": 4400, "do": "caption", "text": { "en": "More resistance, less current", "es": "Más resistencia, menos corriente" } },
    { "at": 4400, "do": "set", "part": "R1", "field": "resistance", "value": 3300, "move": "travel", "ms": 1800 },

    { "at": 8600, "do": "frame", "target": "board", "move": "travel" },
    { "at": 8600, "do": "caption", "text": { "en": "Try it in the page: tap R1", "es": "Pruébalo en la página: toca R1" } },
    { "at": 10100, "do": "focus", "parts": [] }
  ]
}
```

The rules that keep it right:

- **Time.** `at` is ms from the start. Give each caption at least 2000 ms before the next (a
  reader needs about 2 s for a short line); a step that moves lasts its move (`arrival` 750 ms,
  `travel` 1500 ms, `hit` 150 ms; the table is in [timeline.md](timeline.md#moves-how-long-along-which-curve)).
  Start the next beat after the move before it has ended.
- **One thing told.** A recording keeps one label: the part last framed, focused, inserted or
  raised. Frame the part you talk about; `focus` may hold a few.
- **The current.** `flow` with `"on": true` and a `ramp` once, early: the dots, glow and colours
  come with it.
- **A control.** A slider moves by itself with `set` and `"move": "travel"` (`ms` 1200 to 1800).
  With the current layer on, point at the part it changes with a `focus` and `"solid": true` (the
  part drawn whole, not seen through). A
  button (`pressed`) changes at once with `hit`; leave a `breath` (400 ms) between two hits.
- **A reading.** `value` after the caption it belongs to, at the same `at` and written after it, or
  later (the next caption takes the value away; `--validate` warns when that is within a
  second). It counts up to the reading at the moment of the step and stays: in a circuit that
  changes in time it is that instant, not the latest (the oscilloscope shows the latest). A slow reading (a capacitor charging) waits with `wait-until` first.
- **Something that changes in time** (an RC, a 555, a generator): the oscilloscope says it better
  than a number. `probe` with a `node` (a strip from `--parts`: the one the signal is on, a
  capacitor's strip, a chip's output) for a voltage, or with a `part` and `"field": "current"`
  for a current; put it at `"at": 0`, since its trace starts when the step runs. In a recording
  the box takes the band from 56 % to 75 % of the height and the camera frames the circuit in the
  band above it, smaller: frame one or two parts, not the board, while the box is on, and take it
  away (`"off": true`) before the close. Its time axis follows the simulation's time and
  rescales by itself: after a `set` that changes a frequency, say what changes in the trace (more
  cycles in the box, a steeper edge), not that it "goes slower". To show the change itself, give
  the probe a fixed `window` (about twice the window `--parts` prints) and `"marks": true`: the
  `set` leaves a line with its new value, and the cycles after it are longer or shorter than those
  before (`examples/tours/555-what-if.json`). With `"place": "top", "size": "compact"` the box goes
  under the caption instead (28 % to 40 %) and the circuit keeps its whole band; the caption then has
  at most two lines and no `value` (the value is in the box). `examples/tours/555-close.json`.
- **The current on a crowded board.** Switch the layer on over a close frame of one or two parts in
  focus, with `"scope": "focus"` (only their nets carry it) and `"style": "real"` (along the legs),
  never over a wide shot; switch it off when the sentence is about something else.
- **A secondary part.** When the voice names a part as the cause while the subject is another,
  `nudge` it on that word: it rises a little and comes back, without taking the focus or the label
  (`raise` would take both).
- **The told part ends above 65 % of the height** (the platforms' buttons cover the bottom 35 %):
  with `parts` framed, the part in focus may fall lower; frame the parts in focus instead.
- **Rhythm.** Never two `push` in a row; never two `hit` without 400 ms between them. The check
  below names both.
- **Length.** `--validate` prints when the last step runs: keep it between 10 and 23 s, so with
  the 1 s tail and the last move the video lasts 12 to 25 s.
- **Format.** `vertical` (1080 × 1920) for a phone's feed; `horizontal` for a page. The same
  timeline gives both (`--format both`); write for vertical first.

Other moves (the circuit building itself, a part going into its holes, a flash along the path, an
oscilloscope, the back of the board) are in [timeline.md](timeline.md#actions); the
`npn-switch-build.json` and `npn-switch-moves.json` timelines use each of them.

## 4. Check it (no browser, a second)

```bash
node scripts/render-frames.js examples/tours/<name>.json --validate
```

`✔ <name>.json: 13 steps, the last at 13.0 s, no problems` (exit 0) or the problems, one per line
(exit 1). Fix every one:

| Code | Means | Fix |
|---|---|---|
| `TOUR_UNKNOWN_PART` | an id the circuit does not have | use an id from `--parts` |
| `TOUR_UNKNOWN_CONTROL` | the part has no such control (the message lists its controls) | a control from `--parts` |
| `TOUR_FIELD` | a field missing, unknown or out of range: the tour does not play | the field's table in [timeline.md](timeline.md) |
| `TOUR_MOVE`, `TOUR_ACTION` | a move or action that does not exist | one of the words the message lists |
| `TOUR_MOVE_MS` | an `ms` outside its move's range | an `ms` in the range, or another move |
| `TOUR_VALUE_HIDDEN` | the next caption takes a value away before it can be read | the value after that caption, or the caption later |
| `TOUR_RHYTHM_SLOW`, `TOUR_RHYTHM_HIT` | two slow moves in a row, two hits too close | move one step later, or change its move |
| `TOUR_TOO_LONG`, `TOUR_TEXT_TOO_LONG` | over ten minutes, a text over 280 characters | shorter |

## 5. Render the frames

```bash
# A draft: fewer frames, the same checks (about 25 s for a 15 s video).
node scripts/render-frames.js examples/tours/<name>.json --lang es --fps 10 -o /tmp/<name>-draft

# The video's frames, twice, compared frame by frame (on a quiet machine about 1 min 15 s per
# 15 s of video, format and run: --format both --check is four runs, 5 min or more).
node scripts/render-frames.js examples/tours/<name>.json --format both --lang es --check
```

Each format goes to `examples/out/video/<name>/<format>/`: `frames/000000.png…`, `frames.sha256`,
`captions.srt` and `timeline.json`. The script measures every frame at rest (at each caption and
every second) against the rules of the frame. For each format it prints (then a `video: ffmpeg …`
line, the command for that one clip by hand; step 6 does the same with `assemble.js`):

- `✔ <name> vertical: 421 frames, 14.00 s at 30 fps` — every rule held;
- `✖ … ` and then one line per problem, with its time — fix it in the timeline;
- `✔ two runs gave the same 421 frames` (with `--check`) — or `✖ two runs differ`: report it,
  it is a fault of the kit, not of the timeline;
- `SKIPPED: …` and exit 2: no Playwright or no Chromium (`npm install`). Never a pass.

The problems and their fix:

| Problem | Means | Fix |
|---|---|---|
| `D1 at … out of the free area …` | the told part stands under the caption or in a platform's band | frame it (`frame` with the part) after the step that moved the camera elsewhere, or frame a list of parts; `zoom` below 1 if it is too big |
| `the label of D1 out of the free area` | its short label falls outside | the same; or a shorter label (`label`) |
| `2 labels, not 1` | two parts told at once | frame or focus one part last |
| `caption …`, `chrome shown` | a fault of the stage, not of the timeline | report it |

`timeline.json` says when each step really ran (`steps[].t`), each caption's times and each
value shown. To look at one moment, open the frame at that time: frame = t × fps / 1000 (2.4 s at
30 fps is `frames/000072.png`). Look at few frames, only when the measures leave a doubt.

## 6. Make the video

```bash
node scripts/assemble.js examples/out/video/<name>/vertical -o <name>-vertical.mp4
```

H.264, plays on every phone, and `<name>-vertical.srt` beside it. Several clips of the same size
and fps, one after the other: name several folders. Without ffmpeg it prints the command and exits
2. Subtitles drawn into the picture instead of the caption layer: render with `--no-captions` and
assemble with `--burn`.

## 7. Add it to the bench

A timeline in `examples/tours/` is part of the kit's bench: `npm test` plays every one of them
against its circuit and fails on any warning (`test/render-frames.test.js`). Keep it there when it
is done, with its texts in both languages, and list it in the table below.

## Done when

- `--validate` says no problems;
- `render-frames.js … --format both --check` ends in `✔` for both formats and the two runs agree;
- `npm test` passes;
- the video plays (`assemble.js`), and one frame of each beat looks right.

## A video about one part

A second kind of video tells one part instead of one circuit: what it is, which leg is which, what
it does on a bench, then the circuit builds itself around it. The design is
[component-focus.md](component-focus.md); the steps it adds (`scene`, `pin`, `bench`, `symbol`,
`inside`, `land`) are in [timeline.md](timeline.md#scene-a-part-alone-on-a-pedestal-m17). Name the
file `focus-<part>.json`.

**Choose the part.** `--parts` marks what each part can do up close:

```text
  D1   led red · pedestal (scene, land, bench) · symbol · inside
       pins (pin): D1.anode (anode · the + side, in) · D1.cathode (cathode · the − side, out) · mark (pin "mark": "D1")
```

`pedestal` it can stand alone; `symbol` and `inside` it has those figures (a part without them gets
`TOUR_NO_SYMBOL`, `TOUR_NO_INSIDE`); `pins` are the names a `pin` step takes, and `mark` is there
when its package has an orientation mark (`TOUR_NO_MARK` otherwise). Only those.

**Six beats**, 25 to 33 s in all (`--validate` prints the last step at about 24 to 31 s):

| Beat | From | Steps |
|---|---|---|
| 1 Hook | 0 | `scene` (`mode` `part`, `zoom` 1.6; 1.4 for a chip), a caption: the part number and one idea; at 1400 a `frame` on the part (the camera pulls back to make room) |
| 2 Anatomy | 2000 | a `pin` per pin, 400 ms apart, in the order `--parts` lists them; 800 ms after the last, the caption "Which leg is which" (a chip: "Where pin 1 is") with `pin` `mark`; 1800 ms later the caption "Its symbol" with `symbol` on |
| 3 How it works | 2400 ms after the symbol | at one `at`: `pin` `off`, `symbol` off, `bench` on, `inside` on (if the part has it) and a caption; then `flow` on with a `ramp` (or a button `set` first and `flow` with it); one or two captions, each with a `set` 400 ms after it |
| 4 To the breadboard | ≈ 15 to 18 s | at one `at`: `bench` off, `inside` off, the caption "On the breadboard", `land`; 1800 ms later `frame` `parts` (`travel`) and `assemble` (`gap` 600) |
| 5 Working | when the assembly has ended | a caption with `focus` on the part and its load (`arrival`), a `set` 500 ms later; then a caption and a `value` 400 ms after it |
| 6 Close | 2500 ms later | `focus` `[]` (`arrival`) and a closing caption that says the idea again |

Beats 1 and 2 are the same in every video of the series: copy them, change the part, its pins and
its two lines. The assembly takes about 600 ms per part of the circuit (wires included) plus 700 ms:
start beat 5 after it, or the dots of the current come back in the middle of a caption (count every
id of the `--parts` list but the supplies).

**Look at the figures before the words.** A caption that says what happens ("the voltage stays put")
must agree with the bench's pads and the `value` in the draft: open a frame of each beat (step 5) and
read them. A `set` pushed past what the part can do (a load too heavy for a Zener) is a lesson too, but
its caption must say so.

The rules of this kind, besides the ones above:

- **400 ms between two `pin`** (they come in one by one; less and they arrive as one).
- **A chip's pins go before its symbol**: on a part with more than four pins, `pin` `off` at the same
  `at` as `symbol` on (the symbol carries the numbers and names; the rows and the symbol would
  overlap). A part of two or three pins keeps them on with the symbol.
- **`bench` before `flow`**: the bench's dots are the current layer's.
- **Everything up close off before `land`**: `bench`, `inside` and `symbol`, at the `land`'s `at` or
  before.
- **Captions never invent figures.** The bench writes every voltage and current under its pads,
  `value` writes a reading; a caption says what happens ("less current, less light"), never a number.
  The part number in the first caption is the circuit's, from `--parts`.
- **A `set` on the bench** moves a part that is not drawn (only the told part is on the pedestal):
  name it in its caption ("A bigger resistor"), its effect is read on the pads and in the inside
  view.

The `focus-led.json` timeline, beat by beat, is the template:

```json
{
  "$schema": "../../schema/timeline.schema.json",
  "circuit": "led-resistor",
  "format": "vertical",
  "steps": [
    { "at": 0, "do": "scene", "mode": "part", "part": "D1", "zoom": 1.6 },
    { "at": 0, "do": "caption", "text": { "en": "LED", "es": "LED" }, "line": { "en": "A diode that gives light", "es": "Un diodo que da luz" } },
    { "at": 1400, "do": "frame", "target": "D1" },

    { "at": 2000, "do": "pin", "pin": "D1.anode" },
    { "at": 2400, "do": "pin", "pin": "D1.cathode" },
    { "at": 3200, "do": "caption", "text": { "en": "Which leg is which", "es": "Cuál pata es cuál" } },
    { "at": 3200, "do": "pin", "mark": "D1" },
    { "at": 5000, "do": "caption", "text": { "en": "Its symbol", "es": "Su símbolo" }, "line": { "en": "A diode with two arrows of light", "es": "Un diodo con dos flechas de luz" } },
    { "at": 5000, "do": "symbol", "part": "D1", "on": true },

    { "at": 7400, "do": "pin", "off": true },
    { "at": 7400, "do": "symbol", "on": false },
    { "at": 7400, "do": "bench", "part": "D1", "on": true },
    { "at": 7400, "do": "inside", "part": "D1", "on": true },
    { "at": 7400, "do": "caption", "text": { "en": "On the bench", "es": "En el banco" }, "line": { "en": "The resistor sets its current", "es": "La resistencia fija su corriente" } },
    { "at": 7800, "do": "flow", "on": true, "ramp": 600 },
    { "at": 10000, "do": "caption", "text": { "en": "A bigger resistor", "es": "Una resistencia mayor" }, "line": { "en": "less current, less light", "es": "menos corriente, menos luz" } },
    { "at": 10400, "do": "set", "part": "R1", "field": "resistance", "value": 3300, "move": "travel", "ms": 1800 },
    { "at": 13200, "do": "set", "part": "R1", "field": "resistance", "value": 330, "move": "travel", "ms": 1200 },

    { "at": 15000, "do": "bench", "on": false },
    { "at": 15000, "do": "inside", "on": false },
    { "at": 15000, "do": "caption", "text": { "en": "On the breadboard", "es": "En la protoboard" }, "line": { "en": "The circuit builds itself around it", "es": "El circuito se arma a su alrededor" } },
    { "at": 15000, "do": "land", "part": "D1" },
    { "at": 16800, "do": "frame", "target": "parts", "move": "travel" },
    { "at": 16800, "do": "assemble", "gap": 600 },

    { "at": 20500, "do": "caption", "text": { "en": "What goes through the LED", "es": "Lo que pasa por el LED" }, "line": { "en": "the current the resistor lets through", "es": "la corriente que deja pasar la resistencia" } },
    { "at": 20500, "do": "focus", "parts": ["R1", "D1"], "move": "arrival" },
    { "at": 20900, "do": "value", "part": "D1", "field": "current", "label": { "en": "through the LED", "es": "por el LED" } },

    { "at": 24000, "do": "focus", "parts": [], "move": "arrival" },
    { "at": 24000, "do": "caption", "text": { "en": "An LED", "es": "Un LED" }, "line": { "en": "always with its resistor", "es": "siempre con su resistencia" } }
  ]
}
```

(Here beat 5 has no `set`: the LED's circuit has nothing left to change. `focus-npn.json` lets go of
the button and presses it again.)

What `--validate` adds for this kind:

| Code | Means | Fix |
|---|---|---|
| `TOUR_SCENE_PART` | a wire or a supply on the pedestal | a part `--parts` marks `pedestal` |
| `TOUR_UNKNOWN_PIN` | a pin the part does not have (the message lists its pins) | a name from `--parts` |
| `TOUR_NO_MARK` | a `mark` on a part whose package has none | leave that step out |
| `TOUR_NO_SYMBOL`, `TOUR_NO_INSIDE` | a figure the part's kind does not have | leave that step out, or tell it with captions |
| `TOUR_BENCH_NOT_SIMULATED` | a bench in a circuit without a source | a simulated circuit |

## The bench

| Timeline | Circuit | Tells |
|---|---|---|
| `led-resistor.json` | recipe `led-resistor` | the resistor sets an LED's current |
| `potentiometer-led.json` | recipe `potentiometer-led` | a potentiometer as a dimmer |
| `npn-switch.json` | `examples/npn-switch.json` | a transistor as a switch |
| `npn-switch-build.json` | `examples/npn-switch.json` | the circuit builds itself, then works |
| `npn-switch-moves.json` | `examples/npn-switch.json` | every move of the first wave (a test of the stage, not a lesson) |
| `divider.json` | recipe `divider` | two resistors share the voltage |
| `button-pullup.json` | recipe `button-pullup` | a pull-up resistor and a button |
| `mosfet-switch.json` | recipe `mosfet-switch` | a MOSFET as a switch |
| `rc-square.json` | recipe `rc-square` | a capacitor charging and discharging, on the oscilloscope |
| `zener-regulator.json` | recipe `zener-regulator` | a Zener holds the voltage under a heavier load |
| `555-astable.json` | recipe `555-astable` | a 555 blinking, and a resistor that changes its rhythm |
| `555-what-if.json` | recipe `555-astable` | a video of a circuit that opens on its chip on the pedestal, an oscilloscope with a fixed window and a mark that shows R1 slowing the blink, and R1 in a solid focus |
| `focus-npn.json` | `examples/npn-switch.json` | a video about one part: the 2N2222A |
| `focus-mosfet.json` | recipe `mosfet-switch` | a video about one part: the IRLZ44N |
| `focus-led.json` | recipe `led-resistor` | a video about one part: the LED |
| `focus-555.json` | recipe `555-astable` | a video about one part: the NE555 |
| `focus-zener.json` | recipe `zener-regulator` | a video about one part: the 1N4733A (written by a medium model from this guide alone) |
