# Changelog

What changed in each version, newest first. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow
[Semantic Versioning](https://semver.org/) (before 1.0, a minor version may change the circuit
format or the tools). Each released version has a git tag `v<version>`; `test/changelog.test.js`
checks that the newest one is the version in `package.json`. The roadmap (`ROADMAP.md`) has the
detail.

## [Unreleased]

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

[Unreleased]: https://github.com/ccamilobedoya/protoboard-iso/compare/v0.7.0...HEAD
[0.7.0]: https://github.com/ccamilobedoya/protoboard-iso/compare/v0.6.0...v0.7.0
[0.6.0]: https://github.com/ccamilobedoya/protoboard-iso/compare/v0.5.0...v0.6.0
[0.5.0]: https://github.com/ccamilobedoya/protoboard-iso/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/ccamilobedoya/protoboard-iso/compare/v0.3.1...v0.4.0
[0.3.1]: https://github.com/ccamilobedoya/protoboard-iso/compare/v0.3.0...v0.3.1
[0.3.0]: https://github.com/ccamilobedoya/protoboard-iso/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/ccamilobedoya/protoboard-iso/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/ccamilobedoya/protoboard-iso/releases/tag/v0.1.0
