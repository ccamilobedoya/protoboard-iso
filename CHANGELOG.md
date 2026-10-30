# Changelog

What changed in each version, newest first. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow
[Semantic Versioning](https://semver.org/) (before 1.0, a minor version may change the circuit
format or the tools). Each released version has a git tag `v<version>`; `test/changelog.test.js`
checks that the newest one is the version in `package.json`. The roadmap (`ROADMAP.md`) has the
detail.

## [Unreleased]

### Added

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
  in length; **recipes**: lesson circuits by name with only their values.
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

[Unreleased]: https://github.com/ccamilobedoya/protoboard-iso/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/ccamilobedoya/protoboard-iso/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/ccamilobedoya/protoboard-iso/releases/tag/v0.1.0
