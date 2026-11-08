# Changelog

What changed in each version, newest first. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow
[Semantic Versioning](https://semver.org/) (before 1.0, a minor version may change the circuit
format or the tools). Each released version has a git tag `v<version>`; `test/changelog.test.js`
checks that the newest one is the version in `package.json`. The roadmap (`ROADMAP.md`) has the
detail.

## [Unreleased]

### Added

- A timeline's `captionLines`: captions of 3 lines, with the oscilloscope and the circuit lower.
- Timed sensors (S3; `docs/en/timed-sensors.md`): the HC-SR501 PIR motion module (`pir-sensor`: 30 s
  warm-up, a delay, the H/L jumper, 2.5 s of rest) and the TTP223 touch module (`touch-sensor`:
  momentary or toggle, 220 or 60 ms response, 0.5 s of calibration) read the environment's `motion`
  and `touch`; their card says the phase and the time left, and up close a bar drains with it. A
  device lists the keys of its elements in `state` and `engine.set` carries them (a slider no
  longer restarts a timer); an element may give `maxStep()` and `span()` for the page's step and
  real-time pace. Recipes `pir-lamp`, `pir-uno`, `touch-toggle-led`, `touch-uno`; examples and tours
  `pir-lamp`, `touch-toggle-led`.
- The environment (sensors, S0; `docs/en/environment.md`): a circuit's `environment` (light,
  temperature, humidity, distance… 14 fields, each a value or a program: toggle, cycle, ramp,
  keyframes) that every sensor reads unless the part gives its own value. The thermistor, the
  photoresistor, the LM35 and the tilt switch follow it; their own control detaches them, and their
  card says which. `check` reports `ENV_*`. The engine's controls with the id `environment`,
  `engine.resume`, `engine.attach`, `engine.environment`; programs run on simulated time (in real
  time when nothing else in the circuit changes with time).
- The page's *Environment* section (`page.controls` entries `{ "environment": "light" }`, or all of
  it with `page.environment`), each field with its indicator (a gauge, a sun, a thermometer, a lamp;
  `page/client/gauge.js`) and *Pause* / *Resume* for a program; a sensor's card shows the indicator
  and *Follow the environment*.
- Timelines: `set` with `environment` (the indicator shows while it moves), the `gauge` step (the
  indicator in a corner of the video), `value` of `vout`; `render-frames.js --parts` lists the
  environment. Examples `environment.json`, `environment-cycle.json` and the tour
  `tours/environment.json`.

### Changed

- The compact `catalog` groups part types by family (`family` in each type definition, `FAMILIES` in `parts/types/index.js`) and cuts a long list of part numbers to the first few with a count (`catalog name` has them all): and lists each recipe by name and title, without its values (`catalog` with the recipe's name gives them): about 3.3 KB instead of 5 KB, room for more types (budget 4600).
- A part's pin rows no longer jump while the camera moves: an arrangement holds while its pins stay
  lit, chosen with room for the push. The rows are in their own module, `page/client/pinout-rows.js`.
- The `mosfet-switch` and `npn-switch` recipes lay out with a clearance of 3, so their wires do not
  run into each other on screen.
- The READMEs' images drawn again with 0.9.1 (the shade of an LED that is off), the count of recipes
  (32) and the parts showcase's description with the new parts.

## [0.9.1] - 2026-11-04

Fixes found trying 0.9.0 on a phone and a tablet.

### Fixed

- **The part's view up close in the page**: Back is a short land of 350 ms (the part comes down its
  3 mm with the camera, the board already in place under a lightening veil) instead of the video's
  1.5 s, and entering takes 450 ms; the page's bar going or coming back no longer makes the drawing
  jump (`keepStill`: the view box keeps every point still on screen when the area changes), so the
  pinout's leaders are laid out on the final frame. A video's `land` is unchanged.
- **Lights follow the simulation at once**: LEDs and a 7-segment display's segments are painted on
  every frame (they lagged up to a quarter of a second, and a digit seemed to change in slow motion);
  PWM is still averaged, over the last 20 ms of simulated time.
- **An LED that is off**: its shade is the LED's own visible faces, so it sits exactly on the dome
  and flange (it overhung beside the flange).
- **The relay** sits on the table with its pins at its leads' ends, and its faces carry the print and
  the coil and contact diagram; **the motor's** pulley mark shows at all 16 angles.
- **Parts on one support keep their depth order** (the UNO's reset button was painted over its USB
  socket).
- **The 7-segment digit is drawn upright** on the case: the real 10° lean, added to the isometric
  skew, read as crooked (the inside view, face on, still leans).

## [0.9.0] - 2026-11-04

Every part type up close, seven parts a starter kit has, and a bridge rectifier that keeps running.

### Added

- **A part up close for every type** (`test/pinout.test.js` `COMPLETE`; only the wire, the
  development boards and pin headers stay pending, with their reasons): the text of each pin, the
  package's mark, a symbol and an inside view drawn from the simulation, with its legend, for the
  resistor, capacitor, inductor, diode, Zener, bridge rectifier, potentiometer, NTC thermistor,
  photoresistor, push button, switches, regulator, battery and buzzer. New mark kinds: `bands`,
  `either`, `knob`, `face`, `bevel`, `pairs`, `common`, `lead`, `plus`.
- **An RGB LED** (`rgb-led`, common cathode or anode) and **a one-digit 7-segment display**
  (`seven-segment`, 5161AS and 5161BS), one LED per chip or segment (device `LEDS`), each with its
  own stress (`D1.R`, `DS1.a`); recipes `uno-rgb-led` and `uno-seven-segment`.
- **A slide switch** (`slide-switch`, SS12D00G3), **a tilt switch** (`tilt-switch`, SW-520D) and
  **the LM35 temperature sensor** (`temperature-sensor`, 10 mV/°C, a temperature slider); recipes
  `slide-switch-leds`, `tilt-alarm` and `lm35-uno`.
- **A 5 V relay** (`relay`, SRD-05VDC-SL-C, beside the board): a coil with inductance, an armature
  with hysteresis and travel time, and the coil's kick when it is cut off without a diode
  (`SIM_RELAY_KICK`); recipe `relay-npn`.
- **A small DC motor** (`motor`, RE-140RA): back-EMF, inertia, friction and a load slider, its shaft
  a gyrator to a node whose voltage is its speed; start-up spike and stall (`SIM_MOTOR_STALL`);
  recipe `motor-npn`.

### Changed

- On a phone the page's pinout rows shrink together to 65 %, then a row still too long ends in "…",
  so none runs off the screen.

### Fixed

- **The live bridge rectifier no longer freezes** at its first zero crossing (9.85 ms): Newton
  accepts a solution whose every row balances once its updates stop shrinking, and
  `engine.advance(h)` splits a failed step instead of halving the step for good.
- The tests' throwaway repositories no longer inherit a git hook's variables (a commit from a linked
  worktree wrote into the real repository).

## [0.8.0] - 2026-11-03

A payoff the eye reads, and a video that opens on its result. Folds in the prereleases made on video
branches (0.8.0-b.1, c.1, c.2 and d.1); the fifth version of the same short was chosen, and this is
what it uses.

### Added

- **A recording's speed of time**: the timeline's `pace` (s of simulated time per s of video); the
  page, the oscilloscope, `compare`, the payoff, `timeline.json` (`pace`) and `render-frames.js
  --parts --pace` follow it.
- **The comparing box in words**: with an LED in the circuit it says the change as a proportion
  ("on ×5 · off the same"; `probe` `change`, `ratio` by default, `times` for the seconds), measured by
  `compareCycles`; laid out in bands, the name and the marks on plates on top, the trace in the
  middle, the change at the bottom in the accent. `probe` `reading` and `clock` leave out the value
  now and the window's end.
- **A comparing box in the timeline's own words** (`probe` `say`): `{k}` and `{k2}` filled from the
  simulation (how many times longer on, and off), so a script's sentence, checked with its other
  texts, replaces the kit's. Example `555-compare-say.json`.
- **A caption's emphasis** (`em`): words of its text or second line drawn bolder (700) and 15 %
  larger, in the caption's colour (the accent stays for data rows and traces); its contrast read in
  its own colour; `TOUR_EM_MISSING` when the words are not there.
- **Lines as laid out**: each caption's `lines` in `timeline.json` (counted by the bands of their
  boxes); a frame rule of two at most.
- `timeline.json` gives each LED's box on the frames measured at rest (`leds`), and an event per
  blink (`led`, with `part` and `on`) and per card (`card`), so a check of the video can read whether
  it blinks and a sound can go with each blink.
- **A pedestal's `light`**: `scene` with `light`, a soft glow of a colour under the part.
- **The current in two colours** (`flow`'s `sense`): the dots coloured by the way the current runs
  through a part (a capacitor's charge, forward; its discharge, back), each side with the parts whose
  nets carry it meanwhile; thicker and on the log scale. Tested (jsdom, golden frame M39) and
  documented; no published video uses it yet.
- **A card** (`card`): a sentence alone over the screen for a moment, within the safe width and the
  platforms' bands (a frame rule). Tested (golden frame M40) and documented; no published video uses
  it yet.
- Examples `555-result-first.json` (the result first on the board, then the chip on the pedestal)
  and `555-land-focus.json`. Golden frames M34 to M41.

### Changed

- An LED that is off is drawn dark: a shade over its dome and flange (`SHADE`, `shadeOps`), in the
  parts and in their copies, faded with its light in a page. Lit, it is drawn as before.
- The `data` row as large as the caption's text (56 px at 1080 wide, 52 at 1920); told labels at
  least 48 px (`LABEL_MIN_PX`).
- **A caption's lines rise fading in**, from 60 % of their height: no frame shows half a line cut by
  its mask. Golden frames M9, M12, M15, M23 and M34.
- A scene and a land may come after steps on the board.

### Fixed

- **A focus during a land waits for the board.** A `focus` at a `land`'s time ended the land: the
  focus's strips, their numbers and the part's label floated over the empty stage, the board's ramp
  never ran, and the scene stuck in `lit` hid the strips of every later focus. The land now keeps
  its scene and the focus; its strips and coordinates fade in over 300 ms (`LAND.reveal`) once the
  board is lit. Golden frame M37.
- The caption's contrast is not read while a caption comes in or the one before fades out over it
  (a false 2.8:1).

## [0.7.0] - 2026-11-03

### Added

- **A comparing oscilloscope**: `probe` with `"compare": true` keeps the cycles before a `set` as a
  faint ghost over what comes after and writes the change of period, from the simulation, once the set's control has arrived
  ("period 148 ms → 832 ms (×5.6)"); a mark's text sits on a halo over the trace; a `title` shows in a
  compact box, whose trace is thicker.
- **A pedestal that moves**: `scene` with `"enter": "drop"` (the part falls onto it) and `"push"` (a
  slow close-in until the next camera step).
- **A data row**: `caption` with `data`, for a value not already on screen ("1 kΩ → 100 kΩ"): sans,
  tabular figures, the accent, 44 px.
- **The payoff, measured**: `src/sim/cycle.js`; `render-frames.js --parts <circuit> --what-if
  R1.resistance=100000 [--json]` prints the cycles before and after a set in simulated s and s of
  video; `timeline.json` carries them (`payoff`); `TOUR_PAYOFF_SHORT` and `TOUR_SCOPE_WINDOW` warn when
  a timeline holds less than one whole cycle after a set.
- `timeline.json` lists the moments a sound may go with (`events`: land, count, probe, mark).
- Frame rules: the first frame shows the first moment, the caption's text within 90 px a side, its
  contrast at least 4.5:1 measured on the frame, the told label at least 40 px. Golden frames M30 to M33.
- Literata (SIL Open Font License, `src/page/fonts/`) embedded in pages with a tour, as the caption's serif.

### Changed

- A recording's first frame is its first moment's: steps of the first moment that set what is seen
  run at 0 as cuts, and the first caption is whole on frame 0.
- `land` brings the board in opaque, sliding up under a veil of the stage's colour, and lightens in
  a ramp of 700 ms once the camera has opened (no see-through layer, no flash).
- The caption is one block of one rank: `line` is drawn as `text` (its look as `--cap-line-*`
  variables), 90 px from each side, on a scrim of the stage's colour.
- A chip's marking reads left to right from the camera; a recording's told label is never under
  40 px at 1080.
- `examples/tours/555-what-if.json` uses the new options and holds one whole cycle after the set.

## [0.6.0] - 2026-11-02

### Added

- **The current on the focus**: `flow` with `"scope": "focus"` draws the current only on the nets of
  the parts in focus (their strips, jumpers and leads), the rest plain board under the veil; `style`
  (`plan` or `real`) in a timeline sets how a recording draws the layer.
- **A compact oscilloscope under the caption**: `probe` with `"place": "top"` puts the box between
  the caption and the circuit (28 % to 40 %), the circuit keeping its whole band, and
  `"size": "compact"` draws it without title or note, the value inside the trace.
- **`nudge`**: a part the voice names as a cause rises a little and comes back without taking the
  focus or the told label.
- The frame rules: the told part ends above 65 % of a vertical frame, and the oscilloscope's box never
  reaches into the caption (`RULES.vertical.told`, `RULES.vertical.scope`); `render-frames.js --parts`
  prints the frame's bands.
- `examples/tours/555-close.json` uses the four; golden frames M26 to M29.

### Changed

- Five example tours (`focus-led`, `focus-mosfet`, `focus-zener`, `mosfet-switch`,
  `zener-regulator`) frame their parts in focus, so the told part stays above 65 %.

## [0.5.0] - 2026-11-02

### Added

- **A video of a circuit can open on its main part alone**: `scene` on the pedestal and a `land` with
  the other parts already in their holes (no `assemble`) bring the board, lights, labels and current
  back as they were; the timeline guide says how to write it.
- **The oscilloscope shows a change**: a `probe` in a recording takes `window` (a fixed time axis,
  from t = 0 then scrolling) and `marks` (a dashed line with the control's new value at each `set`),
  so a set that slows a 555 reads as a longer tooth after the line. `render-frames.js --parts` prints
  the oscilloscope's default window and how fast simulated time runs.
- **A solid focus**: `focus` with `solid` draws the parts in focus whole over the current layer until
  the next focus, to point at the part a `set` changes.
- `examples/tours/555-what-if.json` uses the three; golden frames M24 and M25.

## [0.4.0] - 2026-11-01

### Added

- **A video about one part**: a timeline can put one part alone on a pedestal (`scene`), light its
  pins one by one with what each does and the package's orientation mark (`pin`), set it on a bench
  whose pads read the circuit (`bench`), draw its schematic symbol or a view of its inside beside it
  (`symbol`, `inside`), and bring the breadboard up under it (`land`) for the circuit to build itself
  around it. Four timelines (`focus-npn`, `focus-mosfet`, `focus-led`, `focus-555`) and a section of
  the video guide with the six beats and their rules; `--validate` names a pin, mark, symbol or inside
  view a part does not have.
- **The part up close in the page** (`page.focusView`): *See the part up close* in a part's card, with
  the same pins, bench, symbol and inside view behind two segmented controls, a legend for the inside
  view, and drag and zoom with the texts kept on the drawing.
- Every new part type comes with its view up close, or is listed as pending with a reason
  (`test/pinout.test.js`, `docs/en/adding-parts.md` §6).

### Fixed

- An LED on a bench keeps its light with the current layer on, and dims when its resistor grows.
- A bench's pad names the new value of the part its pin is joined to after a `set`.

## [0.3.1] - 2026-11-01

### Changed

- **A calmer landing** (`?director=landing`): its tour runs at 0.75, camera moves ease in and out,
  and at the end the camera glides back to the first frame and the current layer is turned off
  again and the controls it moved go back, so the loop has no jump and starts as it began; a
  landing frames a part without its label, so the part itself sits in the middle.

## [0.3.0] - 2026-10-31

### Added

- **`?director=landing`**: a live page with a tour as the background of a site's landing, dressed
  like a recording, framed closer, looping on its own clock and respecting reduced motion.
- **Live simulation in the page** (stage 3): the conductor view, current flowing along real paths,
  lit LEDs, sliders and buttons for the parts that can change, limits with three levels and a mark
  when a part was pushed past one, an oscilloscope in the part's card, a signal generator as a
  supply, probes on nodes, and a link that opens the circuit in Falstad's CircuitJS.
- **The user-experience pass**: gestures inside an embedded page, zoom buttons, full screen, theme
  tokens and a dark theme, the inspector, motion, larger tap targets for small parts.
- **Development boards**: ESP32 DevKit, ESP32-C3 SuperMini and Arduino UNO, drawn and simulated pin
  by pin, with their programs in Arduino's C++ subset (`.ino`), PWM, `tone` and the serial monitor.
- **More parts**: batteries beside the board, regulators (78xx, LM317, AMS1117 module), bridge
  rectifier, Zener diodes, op-amps and comparators, the NE555, inductors, NTC, LDR, buzzer,
  trimmer, headers, switches beside the board, the DESPI-C02 e-paper adapter.
- **`layout`**: a whole circuit placed by an algorithm from its parts and nets, on a board that grows
  in length; **recipes**: lesson circuits by name with only their values. Its second version takes
  the channel as the axis (parts split by side, scored candidates, jumpers by a spanning tree), is
  measured by a bench, and picks a **double breadboard** by itself when a development board would
  cover a pin's strip.
- **Stage and video**: deterministic frames of the live page, a director (`?director=1`) and tours
  (`page.tour`, a timeline JSON), the `stage` and `notebook` themes with a theme picker, the plan
  view of the current layer, moves (focus, insert, assemble, pulse, probe), `render-frames.js` and
  `assemble.js` for vertical and horizontal videos with subtitles, and a guide to make one.
- **Falstad export** of development boards and linear regulators as equivalents, and of any board's
  rails.
- **Publishing**: the READMEs with images drawn by the kit, a demo site on GitHub Pages, an index of
  the examples.
- **Repository tooling**: a rule and an attack test for external input, a stronger privacy scan,
  shared Claude Code settings, a dependency licence check, `npm run verify` with git hooks, lint,
  coverage, and CI on every push.

### Changed

- Node 22 or newer (Node 20 is out of support, and the page tests need Node 22).
- The command line refuses an unknown option or one without its value (exit 2).
- Every agent report ends in a `STATUS:` line.

### Fixed

- A board's program could run any JavaScript, and its `.ino` file could be read from outside the
  circuit's folder.
- `x / a[i]` with integers indexed the quotient in a board's program.

## [0.2.0] - 2026-10-13

### Added

- **Simulation**, DC and transient (stage 2): `simulate`, results drawn on the board
  (`render --sim`), values in the page.
- **The agent interface** (stage 1.5): operations with a dry run and history, queries, `suggest`,
  `review` with profiles, the MCP server and three agents.
- **An embeddable page** per circuit, rewritten with each change under the same name.
- Push button, potentiometer and DIP chips.

## [0.1.0] - 2026-10-12

### Added

- An isometric SVG of a breadboard circuit, with parts placed in real holes at real sizes, front and
  back views, checks of the placement, `inspect` and annotation layers (stage 1).

[Unreleased]: https://github.com/ccamilobedoya/protoboard-iso/compare/v0.9.1...HEAD
[0.9.1]: https://github.com/ccamilobedoya/protoboard-iso/compare/v0.9.0...v0.9.1
[0.9.0]: https://github.com/ccamilobedoya/protoboard-iso/compare/v0.8.0...v0.9.0
[0.8.0]: https://github.com/ccamilobedoya/protoboard-iso/compare/v0.7.0...v0.8.0
[0.7.0]: https://github.com/ccamilobedoya/protoboard-iso/compare/v0.6.0...v0.7.0
[0.6.0]: https://github.com/ccamilobedoya/protoboard-iso/compare/v0.5.0...v0.6.0
[0.5.0]: https://github.com/ccamilobedoya/protoboard-iso/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/ccamilobedoya/protoboard-iso/compare/v0.3.1...v0.4.0
[0.3.1]: https://github.com/ccamilobedoya/protoboard-iso/compare/v0.3.0...v0.3.1
[0.3.0]: https://github.com/ccamilobedoya/protoboard-iso/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/ccamilobedoya/protoboard-iso/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/ccamilobedoya/protoboard-iso/releases/tag/v0.1.0
