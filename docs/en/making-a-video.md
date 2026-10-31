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
- **A control.** A slider moves by itself with `set` and `"move": "travel"` (`ms` 1200 to 1800). A
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
  cycles in the box, a steeper edge), not that it "goes slower".
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
