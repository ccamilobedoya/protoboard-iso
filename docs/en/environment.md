# The environment: what the sensors read

*[Español](../es/ambiente.md)*

A sensor is a function from a magnitude of the world (light, temperature, distance…) to something
electrical: a resistance, a voltage, a contact that opens. The magnitudes live in one place shared
by the whole circuit, its **environment**. A learner changes the light, not the photoresistor: every
part that senses light receives the new value at once.

Nothing is drawn on or near the breadboard for it. There is no lamp that moves closer, no hand over
the sensor: light is "on at a level", and each magnitude is shown by a small **indicator** (a sun, a
thermometer, a gauge) beside its slider in the page, in a sensor's card, and in a box of its own in
a video.

The code is `src/sim/environment.js` (it imports nothing, so the page bundles it); the indicator is
`src/page/client/gauge.js`. Example circuits: `examples/environment.json` (light and temperature set
by hand) and `examples/environment-cycle.json` (the light in a slow cycle); the timeline
`examples/tours/environment.json` makes a video of the first.

## The fields

| Field | Unit | Slider | Limit | Scale | Default | Kind |
|---|---|---|---|---|---|---|
| `light` | lx | 0.1…10 000 | 0…10⁶ | log | 300 | level |
| `temperature` | °C | −20…100 (step 1) | −55…150 | linear | 25 | level |
| `humidity` | %RH | 0…100 | 0…100 | linear | 50 | level |
| `moisture` | % (soil) | 0…100 | 0…100 | linear | 30 | level |
| `water` | mm (level) | 0…40 | 0…1000 | linear | 0 | level |
| `rain` | | off / on | 0…1 | | 0 | switch |
| `distance` | cm | 2…400 | 0…1000 | linear | 50 | level |
| `field` | G (magnetic) | −500…500 | −10 000…10 000 | linear | 0 | level |
| `motion` | | off / on | 0…1 | | 0 | switch |
| `touch` | | off / on | 0…1 | | 0 | switch |
| `vibration` | | off / on | 0…1 | | 0 | switch |
| `sound` | dB | 30…110 | 0…140 | linear | 40 | level |
| `tilt` | | off / on | 0…1 | | 0 | switch |
| `angle` | ° | 0…360 | 0…360 | linear | 0 | level |
| `reflectance` | % (of white paper's) | 0…100 | 0…100 | linear | 80 | level |
| `beam` | (1 = blocked) | off / on | 0…1 | | 0 | switch |

The slider's range is what the page offers; the limit is what a value may be at all (a circuit, a
`set` or a program outside it is clamped, and `check` says so). Today the thermistor and the
photoresistor (`temperature`, `light`), the LM35 (`temperature`), the tilt switch (`tilt`) and the
LM393 sensor modules ([sensor-modules.md](sensor-modules.md): `rain`, `moisture`, `light`, `beam`,
`distance` and `reflectance`, `field`, `vibration`, and `angle` for an encoder disc) and the KY-040
rotary encoder ([rotary-encoder.md](rotary-encoder.md): `angle` is the target its shaft turns to) read it; the
other fields are ready for the sensors that come next. `reflectance` (the surface under a line
follower or in front of an obstacle sensor) and `beam` (something in an optical slot) came with
those modules.
The HC-SR04 ultrasonic module ([ultrasonic-sensor.md](ultrasonic-sensor.md)) reads `distance` and
`temperature`, which sets the speed of sound.

## In the circuit

`environment` is optional, at the top level of the circuit file:

```json
{
  "environment": {
    "light": 300,
    "temperature": { "value": 25 },
    "rain": true,
    "sound": { "program": { "kind": "toggle", "high": 90, "low": 40, "on": 2, "off": 3 } }
  }
}
```

Each field is a number (a switch takes `true` or `false` too), or `{ value, program, range }`. With
a program, the value at t = 0 is the program's and a `value` beside it is not used.

### The range of a field

`range` is `[min, max]`, the span the slider and the indicator show for that field in this circuit,
so the needle crosses the dial for the values that matter:

```json
{ "environment": { "distance": { "value": 30, "range": [2, 40] } } }
```

It works with a `program` too. The range must go up (`min` < `max`) and lie inside the field's limit
(a log field such as `light` needs `min` above 0); a switch has none. Without it, the slider's range
of the table above applies. The limit is not touched: `engine.controls()` gives the field's `min` and
`max` from the range and the same `limit`, and a value outside the range is allowed (the slider and
the dial stop at the end; the text still says the value). `page.controls` and a timeline's `gauge`
can choose another range for one panel row or one recording ([below](#the-page)).

A circuit **without** `environment` has none: every sensor keeps the value of its own part (the
part's default when it gives none), exactly as before the environment existed. A circuit **with**
one, even `{}`, gives every sensor that has no value of its own the field it senses (the field's
default when the circuit does not name it).

`check` reports, as errors: `ENV_UNKNOWN_FIELD` (a field the list above does not have),
`ENV_OUT_OF_RANGE` (a value, or a program's value, outside the field's limit), `ENV_SHAPE` (neither a
number nor `{ value, program, range }`), `ENV_BAD_PROGRAM` (a program that cannot run, and what it
needs), `ENV_BAD_RANGE` (a range that does not go up, falls outside the limit, has a 0 or negative
`min` on a log scale, or is given to a switch) and `ENV_TOO_LARGE` (more than 1000 keyframes). The
simulation leaves such a field out, clamps its value, or takes the slider's range, and runs.

### Programs

A program changes a field with simulated time, evaluated before every time step as a signal
generator's wave is:

| `kind` | Fields | What it does |
|---|---|---|
| `toggle` | `high`, `low`, `on`, `off` | `high` for `on` s, then `low` for `off` s, starting high at t = 0 |
| `cycle` | `shape` (`sine`, `square`, `triangle`), `period`, `min`, `max` | the generator's shapes: a sine starts in the middle rising, a square high first, a triangle at the bottom |
| `ramp` | `from`, `to`, `seconds` | from `from` to `to` in a straight line, then holds `to` |
| `keyframes` | `points` `[[t, v], …]`, `loop` | straight lines between the points, the last one held (or, with `loop`, from the start again) |

A program interpolates in the field's units, linearly, also on a log field: a cycle from 5 to
2000 lx spends most of its time bright. To dwell in the dark, use keyframes.

In the page, a circuit whose only thing that changes with time is a program runs in real time,
in steps of a two-hundredth of the program's span (between 1 and 20 ms); when the circuit has its
own time (a capacitor, a generator, a board's program), the program rides on that pace, so a
program of seconds in a circuit of milliseconds hardly moves: give it times on the circuit's
scale. `simulate()` in DC takes every program at t = 0; `simulate --transient` keeps the
environment as it is at t = 0 (programs run in the page and in videos).

## Which part follows a field

A device that reads the environment declares the fields it senses (`senses: ['light']`). Its part
**follows** the field unless the part gives its own value: `"light": 50` on a photoresistor,
`"temperature": 40` on a thermistor or an LM35, `"tilted": true` on a tilt switch (its own name for
`tilt`). A value on the part always wins.

A part keeps its own control in its card. Moving it **detaches** that part from the field: from then
on it keeps its own value and the environment no longer moves it. Its card says which it is, in a
line after its readings: *Follows the environment · light 300 lx*, or *Own value (not following the
environment: light)*; and below its own control it shows the indicator of each field it senses,
with *Follow the environment* to join it again. A reload brings back what the circuit says.

## The engine

`engine.controls()` lists the environment's fields as controls with the id `'environment'` and
`field` the field's name, shaped like a device's (`min`, `max`, `limit`, `scale`, `unit`, `step`,
`value`; `min` and `max` are the circuit's range for the field when it gives one; a switch has the
scale `toggle`; a programmed field `programmed` and `paused`). Then:

- `engine.set('environment', field, value)` sets it by hand (a program there **pauses** at that
  value) and solves again, as a part's control does;
- `engine.resume('environment', field)` starts a paused program again, from its own beginning at
  that moment;
- `engine.attach(id, field)` makes a part that left a field follow it again;
- `engine.environment()` gives the values now; `engine.stimuli()` the span of each running program
  (the page's pace).

The page's *Restart* starts the programs again from t = 0; values set by hand stay.

## The page

`page.controls` takes an entry of the environment besides a part's or a supply's:

```json
{ "page": { "controls": [{ "environment": "light" }, { "environment": "temperature", "min": 0, "max": 80, "label": { "en": "Room", "es": "Cuarto" } }] } }
```

`min` and `max` here override the circuit's range for that row (the same validation as for a part:
`PAGE_CONTROL_RANGE` when it does not go up or leaves the limit; a lone `min` or `max` pairs with
the circuit's other end). The row's indicator follows it, and so does its `scale` when the entry gives one (`"scale": "log"` needs
`min` above 0). A range that cannot be one is not drawn: the indicator falls back to the circuit's
range, then to the slider's, so its position stays between 0 and 1. The rows carry `data-min` and
`data-max`.

The `min` and `max` of a `page.controls` entry hold for that panel entry only: a sensor's card keeps
following the circuit's range (or the registry's). To make the card and the panel agree, put the
range in the circuit (`environment.<field>.range`).

These go in a section of their own, *Environment*, above the other controls, each row with its
indicator beside the slider (or the on/off button of a switch), and *Pause* / *Resume* for a field
a program moves. `page.environment: true` puts every field of the environment there without
listing them; it is the default when a part follows a field, and `false` leaves the section out
(the sensors still follow it).

## The indicator

A compact SVG, 44 × 44 CSS px, made once and updated in place on each change (a few attributes and
its text; no CSS filter, nothing laid out again), in the page's theme tokens so it reads in the
light, dark, notebook and stage themes:

- the default: a tachometer, an arc from min to max with a needle and the value under it (on a log
  scale where the field is log);
- `light`: a sun whose halo and rays grow with the log of the light, dark at 0.1 lx and full at
  10 klx;
- `temperature`: a thermometer whose column rises from min to max;
- a switch (`rain`, `motion`, `touch`, `vibration`, `tilt`, `beam`): a lamp that lights.

All of them span the control's `min` to `max` (the field's range in this circuit, `page.controls`'
for a panel row, or a `gauge` step's in a recording); a value outside pins the needle, the fill or
the column at the end, and the text under it still says the value. The root `<svg class="gauge">`
carries `data-pos` (the position, 0…1, on the field's scale: a log field by ratios), `data-min` and
`data-max`, kept in step with each change; a test or a script reads the dial there.

## In a timeline

Two steps ([timeline.md](timeline.md)):

- `set` with `environment` instead of `part` and `field`:
  `{ "do": "set", "environment": "light", "value": 5, "move": "travel" }`. A number moves along
  its scale (a log field by ratios, as its slider). When no gauge is up, the field's indicator shows
  in the top right corner for as long as the move lasts (a second at least), then goes.
- `gauge`: `{ "do": "gauge", "environment": "light", "on": true, "corner": "tr" }` puts the
  indicator in a box of its own in a corner of the frame (`tl`, `tr`, `bl`, `br`), as `probe` puts
  the oscilloscope; `on: false` takes it away. `min` and `max` set the dial's ends from that step on
  (`{ "do": "gauge", "environment": "distance", "on": true, "min": 2, "max": 40 }`): choose them so
  the change in the video is seen. `TOUR_GAUGE_RANGE` warns when the range does not go up, leaves
  the field's limit or is given to a switch. A `set` with no gauge up uses the field's range (the
  circuit's, else the slider's), and `engine.set` outside the range is still allowed.

`check` warns with `TOUR_UNKNOWN_ENVIRONMENT` for a field the circuit's environment does not have
(one it names or one a part follows); `render-frames.js --parts` lists the fields with the parts
that follow each. A `value` step reads an output voltage with `field: "vout"` (an LM35's, for
example).

## Adding a magnitude

One line in `FIELDS` (`src/sim/environment.js`): its unit, the slider's range, its limit, its scale,
a step if it has one, its default and its kind. Then its name in both languages
(`sim.env.field.<name>` in every file of `src/i18n/`), and the indicator takes the default gauge (a
special glyph is a branch in `gauge.js`, only where it teaches more). A sensor joins it as
[adding-parts.md](adding-parts.md#7-a-sensor-joining-the-environment) says.

## Emitters

Some parts change the environment instead of reading it: a laser module (`laser`, the KY-008) is
"on, at some power", and every sensor of light receives what it adds. Nothing is aimed or drawn, as
nothing is for a sensor: the indicator of `light` shows the sum, and the learner reads in the panel how
much of it each emitter gives.

- A device declares the fields it writes (`emits: ['light']`) and a pure
  `emit(entry, reading) → { light: lux }`: what it adds now, from its solved reading (0 when it is
  off). Only fields of the registry can be emitted. Only parts declared as emitters write: a lit LED
  does not add light (a status LED lights its own lens, not a room; if it did, a light module's own DO
  LED would flip it).
- What a sensor sees of a **level** field is the ambient value (what the circuit, the slider or a
  program says) plus the sum of what the emitters add, clamped to the field's limit; of a **switch**
  field, the ambient OR any emitter.
- **`beam` blocks the emitted light.** While the environment's `beam` is on (1: something in the way),
  the emitted share of `light` does not reach the sensors; the ambient light still does. That is how a
  tripwire is cut without drawing anything (recipe `laser-tripwire`). The rule is general: a field of
  the registry may name the switch that blocks its emitted share (`blockedBy: 'beam'` for `light`). A
  circuit with an emitter of light gets `beam` in its environment, so the panel offers the toggle.
- Emitters act only in a circuit that declares `environment` (as sensors follow it only then). An
  emitter in a circuit without one is told by `check` and the simulation: `ENV_EMITTER_ALONE` (info),
  the circuit needs `"environment": {}` for its light to reach the sensors.

### When the light arrives

- **Time steps:** what an emitter adds in step n (from the voltages solved there) is what the sensors
  see in step n + 1: one step of delay, as a board's program reads the pins of the step before. A
  laser that a pin switches off is gone from the sensors one step later. With a PWM pin the emission is
  the step's, so the light flickers with the pin, as an LED's current does (the indicator shows it
  moving; the eye of a real sensor would average it).
- **At t = 0, after a `set` and in DC `simulate()`** there is no step to wait for: the engine
  iterates (solve → emissions → the sensors feel them → solve) until every emission changes by less
  than 1e-3 of itself, or 8 rounds. A circuit with no emitter never runs it, and its time steps cost
  what they did.
- **A loop that does not settle** (a lamp whose own light turns it off: a laser powered through a
  transistor that a light sensor cuts when it is bright) keeps the last round and says
  `SIM_ENV_FEEDBACK` (a warning: which emitter, which field, which sensors). The real circuit would
  flicker or sit halfway; the page, stepping, shows it flickering. The note comes with the DC results:
  `simulate()` (the CLI, the MCP tool, the page's warnings) and `engine.dc()`, before or after a
  start, for as long as the last fixed point (the start's or a `set`'s) did not settle; one that
  settles clears it. `check` does not solve the circuit, so it never says it, and stepping adds
  nothing to it.
- **A transient** (`simulate --transient`, the MCP `simulate` tool) with emitters steps the same
  engine as the page, with the same step of delay (the environment's programs held, as in any
  transient); without emitters it runs as before.
- **`engine.dc()` on a started engine** solves the circuit as it stands, the sensors at what they last
  felt (while stepping, the light of the step before); it runs no fixed point of its own and changes
  nothing in the running engine. Before any start it is the fixed point.

### In the engine and the page

- `engine.environment()` is what the sensors see (ambient plus the share that reaches them);
  `engine.ambient()` the ambient alone; `engine.emissions()` what each emitter adds now:
  `{ light: { total, parts: { LS1: 9800 }, blocked } }` (`{}` without emitters; `blocked` for a field
  that names a blocker).
- `engine.controls()`' entry of a field keeps `value` = the ambient (the slider moves the ambient) and
  gains `emitted`, the share that reaches the sensors now (0 while it is blocked), when an emitter
  writes it. `engine.set('environment', 'light', v)` sets the ambient. `emitted` is what arrives,
  clamped by the field's limit (999 999 lx and a laser: 1 lx), while `emissions()`' `total` is all
  the emitters add.
- The page: the panel's row and the indicator of a field show what the sensors see, and the row says
  the share in words ("50 lx + 9.8 klx from LS1", or "50 lx · LS1 blocked (beam)"); the slider stays
  on the ambient. A sensor's card line ("Follows the environment · light 9.8 klx") says the seen
  value, a video's `gauge` too. The emitter's own card says what it adds ("adds 9.8 klx to the light",
  "below its threshold: no beam", "blocked (beam)").
- `render-frames.js --parts` lists, beside each field, the parts that write it.

### The KY-008 laser

Pins `S`, `+`, `−` as the board prints them; the middle one is not connected. Between `S` and `−` a
650 nm laser diode (Vf 2.2 V at 25 mA) behind a 100 Ω resistor: about 28 mA and 3 mW at 5 V, 38 mA at
6 V. Optical power P = 0.5 W/A · max(0, I − 22 mA); it adds K · P to `light`, with K = 3.33·10⁶ lx/W
(3 mW → 10 000 lx). That K is a teaching simplification: the spot of a small beam is far brighter than
a room and saturates a photoresistor, which is what a tripwire needs; the real number depends on the
spot's size. Below its 22 mA threshold it glows like a dim LED and adds nothing (`SIM_LASER_DIM`, a
note). Over 40 mA is `SIM_OVER_CURRENT`; reversed by more than 2 V, `SIM_REVERSE_VOLTAGE`. The numbers
are assumed (the usual module's parts are not marked) and named in `src/sim/devices/laser.js`. It has
no field of its own: its power is what the circuit gives it.

Recipes: `laser-tripwire` (the laser always on, an `LDR-LM393` module whose DO lights an LED through
an NPN when the beam is cut) and `laser-uno` (a UNO pin blinks the laser at 1 Hz; a photoresistor on A0
prints the light it sees); the tour `examples/tours/laser-tripwire.json`.

### Adding an emitter

`emits` and `emit` on its device ([adding-parts.md](adding-parts.md#7-a-sensor-joining-the-environment));
nothing else in `src/sim` changes. A field that something may block names its blocker in the
registry (`blockedBy`).
