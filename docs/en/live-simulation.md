# Live simulation (stage 3): design and plan

*[Español](../es/simulacion-en-vivo.md)* · Roadmap: [ROADMAP.md](../../ROADMAP.md), stage 3

The embeddable page (`out/<name>.html`) gets a real simulation running in the browser, in the
spirit of Falstad's CircuitJS: continuous time, capacitors charging in front of you, sliders
that re-solve at once, current drawn as dots moving along the real conductors, voltage as
colour, and parts that show when they are pushed past their limits. Same file, same name, no
build step, no network: it keeps working inside an iframe or a wiki web view, on a phone.

This page is the reference for the work, which spans several sessions. Each session ends with
the tests green, this page and the roadmap up to date.

## Status

- Phases 0–1 done (`ff4070f`): golden file, conductor view on real paths, conventional current,
  proportional speed, rail palette with steep shading inside bodies.
- Phase 2 done (`af639b0`): `src/sim/devices/`; floating islands anchored in DC.
- Phase 3 done: `compile.js` → program → `engine.js`; devices have `params` (JSON) and
  `elements`; `node/bundle.js`; the page script in `page/client/` (main, view, focus, card,
  tooltip). Engine bundle ≈ 50 kB without comments; page script ≈ 12 kB. A 40-section RC/diode
  ladder runs ≈ 12 000 steps/s in Node (`test/engine.test.js`).
- Phase 4 done: `page/client/live.js` runs the embedded program (entry `live-page.js`; pages
  without results or flow use `static-page.js` and carry no engine). Engine step API:
  `start`, `step`, `read`, `stresses`, `timeConstants`. Shared looks in `sim/look.js`, card lines
  in `sim/lines.js` (both bundleable). Tests in `test/live.test.js` (jsdom, frames driven by
  `window.protoboardLive.tick`).
- Phase 5 done: controls and limits. Each device may have `controls(p)` and a pure
  `set(p, field, value)`; supplies' controls (bench voltage, battery charge) and the slider maths
  (log, E24, stress levels) in `sim/controls.js` (bundleable). `engine.controls()` and
  `engine.set()`. Page: `page/client/controls.js` (card sliders, `page.controls` panel, momentary
  push button) and `page/client/limits.js` (outlines, latched marks, warnings panel); `stress` per
  part in the DC answer of `simulate`; `check` reviews `page.controls`. Tests in
  `test/sliders.test.js`.
- Phase 6 done: [falstad.md](falstad.md). `sim/falstad.js` exports the program to CircuitJS's text
  format, drawn as a schematic (`sim/falstad-layout.js`); each device has `falstad(d, f)`; an
  *Open in Falstad* button in the live page, with the state at that moment (`engine.program()`)
  and **⚠ n** listing the equivalents. Cross-check: 7 cases in `test/falstad/cases/`, references
  in `test/falstad/refs/`, `scripts/falstad.js`; 5 agree within 1 µV, the MOSFET (no λ in
  Falstad) and the Zener (another knee) within their tolerance.
- Phase 7 done: the oscilloscope in the tapped part's card.
  - `sim/recorder.js`: a ring buffer per part, recorded from the start.
  - `sim/scope.js`: what each kind plots, through the device's `scope` hook.
  - `page/client/scope.js`: the drawing, reusable for a list of traces.
  - The screen shows from t = 0 up to 10 time constants and only then scrolls; with no C or L,
    the wall clock (10 to 20 s).
  - Only where the card shows the results. Tests in `test/scope.test.js`.
  - Values under 1e-15 are written as 0: they are the solver's rounding.
- Phase 8 done: the signal generator.
  - `sim/generator.js`: Falstad's waves (sine, square, triangle).
  - A `kind: "generator"` supply, which the engine sets to its value at every step (transient and
    live) and which gives `engine.periods()`.
  - Frequency and amplitude sliders.
  - The page runs one period a second, with at least 100 steps per period and a window of 4
    periods.
  - Falstad: the same source. In exact mode it is one step ahead, because Falstad uses the source
    at the start of each step and the kit at its end.
  - Transient cross-check: `rc-square` (5 nV) and `rectifier-half-wave` (1 mV, Newton's tolerance
    at the diode).
  - Tests in `test/generator.test.js`.
- Phase 9 done: probes on nodes.
  - A tap on no part looks for a strip in use under it (`stripAt` in `page/client/view.js`): the
    page carries, per view, the holes of every strip in use on screen (`hits`, `strips`), and a
    tap within 0.7 of a hole pitch of one is on that strip. Strips lie under the parts, so a part
    still wins where it is drawn; each pin of a part's card opens its strip, and each lead of a
    strip's card opens its part.
  - The strip's card (`selectNode` in `page/client/card.js`; `page.open` is `node:<group>`): what a
    strip or a rail is, what is clipped to it and where; the parts clipped to it come forward
    with that strip only, and the coordinates of the holes in use.
  - With results: its voltage to ground, with the probes of its voltage tag drawn (red on the
    strip, black on ground); the current of each lead into or out of the strip (`nodeLines` in
    `sim/lines.js`), so Kirchhoff's current law can be read line by line; its oscilloscope with
    one trace, recorded from the start like the parts' (key `node:<group>`).
  - Without results: no values and nothing recorded (the prediction rule).
  - Tests in `test/node-card.test.js`.
- Next: the pass on how the page is used (roadmap), then stage 4.

## Decisions

| Decision | Why |
|---|---|
| **Conventional current only**, + to −, like Falstad (the electrons view is removed) | One direction to read, the same as the simulator learners compare with. Reverses the 2026-10-13 choice. The probe captions keep a short note that electrons go the other way. |
| **Dot speed proportional** to the current, auto-scaled to the largest current, with a speed slider and a log-scale toggle | Half the current looks half as fast, so ratios and Kirchhoff can be seen; the log toggle is for circuits with µA and A together. |
| **Conductor view** ("X-ray"): board veiled, parts faint, every conductor drawn as one continuous thick path (strip → lead → body → lead → wire), coloured by voltage, dots on top; tapping a part brings it back | The path of the current is what a learner needs to see. Drawn over a veiled picture, nothing has to be hidden behind parts. Lines over the realistic drawing (dots showing through bodies) and schematic badges were discarded. |
| **Sliders** automatic in each adjustable part's card, plus a panel of controls the circuit declares (`page.controls`) | Exploring is free; a lesson can still put the two or three that matter in front. |
| **Limits made visible**: every device reports its *stress* (value / limit) for current, power, voltage, reverse voltage; three levels for all parts; a latched "exceeded" mark | One of the goals of simulating at this level is to tell whether a part will survive a voltage before trying it. |
| No new page flag: the engine is embedded when the circuit asks for `page.results` or `page.flow` | Both are already opt-in, so a value pending a learner's prediction is never shown. |
| The oscilloscope (V and I against time) comes at the end of the stage, with the signal generator and the probes (phases 7 to 9) | Useful for RC, rectifiers and later the 555, but not needed for the rest. |

## How it looks

- The board is veiled and the parts drawn at about 25 % opacity.
- Each conductor is one thick path: the metal strip between the holes in use, up a lead, through
  the body, down the other lead, along a jumper wire's arc.
- **Colour = voltage**, on a fixed scale from the largest supply voltage: red (+) → grey (0) →
  blue (−), matching the rails and readable with colour blindness (chosen over Falstad's
  green/red on 2026-10-14). Inside a body the colour changes along a steep S curve, so the drop
  is seen in the middle of the part that causes it, still shaded.
- **Dots** move along the paths in the direction of conventional current.
- **LEDs glow** with their current; resistors, regulators and transistors take a **heat tint**
  from power / maximum power.
- **Stress**, the same for every part:

  | Level | Stress | Shown as |
  |---|---|---|
  | fine | < 80 % | nothing |
  | near the limit | 80–100 % | amber outline |
  | exceeded | > 100 % | pulsing red outline, ⚠ badge, a warning with value and limit ("LED1: 38 mA, max 30 mA") |

  Once exceeded, the part stays marked "exceeded" until the simulation is reset, even if a slider
  goes back or the peak was brief. A warnings panel lists them; tapping one focuses the part.

## Architecture

### Device modules: one file per kind of part

Today what the simulator knows about a kind of part is spread over seven places (`prepare()`,
`partReading()`, `pinCurrents()`, `limitIssues()` in `sim/index.js`, `partLines` in
`sim/format.js`, `sim/overlay.js`, the probes in `page.js`). It moves to **one module per kind
of part** in `src/sim/devices/`, keyed by part type (not by `electrical.kind`: `'R'` covers
resistor, thermistor, photoresistor and buzzer, which need different controls).

```js
// src/sim/devices/ldr.js
export const ldr = {
  types: ['ldr'], kind: 'R',                       // readings keep kind 'R' and their sensor object
  params: (part) => ({ model, light, maxPower }),  // compile (Node): resolved part → JSON-safe data
  controls: { light: { min: 0, max: 10000, scale: 'log', unit: 'lx' } },
  elements: (p, { pin }) => ({ main: resistor(pin(0), pin(1), ldrResistance(p.model, p.light)) }),
  read, limits, lines,                              // pinCurrents, tag, probe: optional, with defaults
};
```

`limits` returns stresses `{ quantity, value, max, ratio, code }`; today's warnings are built
from them, so they do not change. **Adding a kind of part** = its type in `parts/types/`, one
file in `devices/`, one line in `devices/index.js`, optional `paths` in its package, its i18n
keys, one test against an independent reference. No `switch` anywhere else.

Formulas that sliders need live in import-free modules (`src/parts/sensors.js`: photoresistor
and NTC; `src/parts/batteries.js` already is), and `parts/types/more.js` imports them from there.

### Compile (Node) and engine (browser and Node)

- `src/sim/compile.js` (Node only): circuit → **program**, plain JSON: nodes, devices (`type`,
  `pins`, `params`), controls, the taps of each strip (for Kirchhoff) and the order of the
  animated segments.
- `src/sim/engine.js` (no dependencies): program → engine with `dc()`, `step(h)`,
  `set(device, field, value)`, `read()`, `issues()`, `timeConstants()`. `simulate()`, the CLI
  and the MCP server use it; their output does not change.
- `mna.js` keeps its API; the `Stamper` reuses its buffers. No LU reuse or incremental stamping
  (10–40 unknowns): a benchmark test decides if that changes.
- A failing step halves `h` up to four times, then the page pauses with a message.

### A small bundler (`src/node/bundle.js`)

Wraps each allowed module in a function scope and rewrites relative named imports. Restricted
grammar: named exports only, no `export default`, no `export *`, no cycles; anything else
throws. Allowed: `sim/{engine,mna,models}.js`, `sim/devices/**`, `parts/{batteries,sensors}.js`,
`core/units.js`, `page/client/**`; an import outside the list throws, which is how the engine is
kept free of geometry and i18n. (Module scripts from `data:` URLs and import maps were ruled out:
strict CSPs in iframes and web views block them, and jsdom does not run them.)

The page script moves from one long string (`page/script.js`) to real, testable modules in
`src/page/client/` (`main`, `view`, `focus`, `card`, `live`, `paint`, `controls`, `scope`). The
page keeps **one attribute-less `<script>`**, last; JSON scripts go before it.

### Real paths (`src/sim/paths.js`, replaces `flow.js`)

- A package may return `paths` from `build()`: per pin, a 3D polyline from the hole (z = 0) to a
  centre shared by all pins, with the index where the body starts. First `axial`, `wire` (the
  tube centreline it already computes), `led`, `battery`, `to92`; others as they are touched.
  Without `paths`: hole → centre, as today.
- `paths.js` gives dot pieces (one per pin, one per piece of strip between holes) and colour
  pieces (strip at its node voltage, lead at its pin's, body in three pieces). `addLayers`
  projects them per view into a `live` layer with a new `path` drawing op, plus a hull per body
  for glow and heat.
- Static images use the same pieces with the DC solution (`render --flow`): still dots and colours.

### The frame loop (`client/live.js`)

- Each frame advances simulated time by the speed, in fixed steps `h`, at most 8 ms of work;
  falling behind turns into slow motion. Default speed: the longest time constant every 2 s
  (τ = C·R_Thévenin and L/R from the linearised matrix), computed at load and on reset only, so a
  100× larger R looks 100× slower.
- Dots are SVG dashes; the script writes `stroke-dashoffset` from an accumulated phase (Falstad's
  `curcount`): speed changes without jumps, zoom comes from the `viewBox`. Speed ∝ I / peak, the
  peak being the largest current since the start (it never shrinks on its own, so a dying
  current is seen slowing down). Only the visible view is animated.
- Colours, glow, heat, tags and card refresh at 4 Hz, to stay readable.
- Play / pause / reset / speed only when the circuit has a capacitor or an inductor. Reset means
  "switched on at t = 0" (capacitors discharged); start is `page.start` (default `'dc'`, today's
  values).
- DC is solved synchronously at load. Without `requestAnimationFrame` (jsdom) nothing is
  scheduled; tests drive frames with `window.protoboardTest.tick(ms)`. With "reduce motion", colours
  update and dots stay still.

### Controls

- In the card, from the device's `controls`: resistor value (log), potentiometer position, supply
  voltage, battery charge, light (log), temperature. The push button is momentary: it conducts
  while held, on the part or with a button in the card.
- The panel comes from `page.controls: [{ part | supply, field, min, max, scale, label }]`, checked
  by `check` and described in the schema.
- `engine.set()` updates the parameters and rebuilds the system, carrying the state by key (node
  voltages by name, capacitor and inductor memory, junction voltages by element) and recomputing
  floating islands. A static circuit re-solves DC at once; a running one keeps stepping.

As built (phase 5):

| Control | Part or supply | Slider | Notes |
|---|---|---|---|
| `resistance` | resistor | log, two decades either side of the file's value, stops at E24 values | the range stays around the value in the file (`nominal`) |
| `temperature` | NTC thermistor | −20…100 °C, 1 °C steps | `ntcResistance` |
| `light` | photoresistor | 0.1…10 000 lx, log | `ldrResistance` |
| `position` | potentiometer, trimmer | 0…100 % | |
| `pressed` | push button | momentary | held on the drawing or with *Hold to press*; *Keep pressed* latches it until tapped again |
| `on` | switch (KCD1, 7 × 7 latching) | toggle | *Turn on* / *Turn off*; it stays where it is left |
| `voltage` | bench supply | 0…30 V, 0.1 V steps | |
| `charge` | battery (part or supply) | 0…100 % | emf and internal resistance from `batteryModel`; none if its voltage was measured |

- `min`/`max` are only the slider's default range; `limit` is what the value may be at all
  (`page.controls` may choose a range inside it, `check` says if it does not).
- The state is matched by part and by the order the part added its elements (a pressed button
  adds its contact after its poles); copied fields: `vprev`, `iprev`, `vd`, `vgs`, `vds`, `vbe`, `vbc`.
  After a change the system is solved with a very short step (as at t = 0), so a paused circuit
  shows the change too. Simulated time keeps its speed (a larger R is seen charging more slowly),
  but the step shrinks if the new time constants need it.
- Limits are checked every frame (not only on repaint), so a brief peak is latched too.
- Sliders are debounced (`page/client/controls.js`): the value shown follows the finger at once,
  the circuit is solved after 120 ms at rest, at least every 300 ms during a long drag, and at
  once on release. The first touch solves at once.

## Phases 7 to 9: oscilloscope, signal generator and probes (plan of 2026-10-15)

For the next session. The maintainer's decisions:

| Decision | Why |
|---|---|
| The oscilloscope lives **in the card of the selected part**; closing the card removes it | The plot explains that part, next to its values and description. |
| **No pinned channels for now** (a two-channel panel, like the ZT-703S, comes when a lesson needs it), but reusable code: the plot takes a list of traces | Keep the page light without closing the door. |
| **Signal generator** as a source (phase 8) | Without it the scope only shows switching on and changes; with it, a rectifier's ripple, an RC filter with a square wave, later the 555. The bench ZT-703S has one. |
| **Probes on nodes** (phase 9): tapping a strip shows its voltage to ground, with its scope | That is how a real scope is used: voltage against the common ground; current is not measured directly. |

### Phase 7: oscilloscope in the card

- **Recording from the start** (`sim/recorder.js`, bundleable, no DOM): every frame stores, per
  part, the time and its (voltage, current) pair in a ring buffer (`Float64Array`, about 2048
  samples). Tapping a part shows its history at once: a capacitor that finished charging shows
  the whole curve. *Switch on (t = 0)* clears it.
- **What is plotted**: a new device hook, `scope(reading)` → `{ v: { key, value }, i: { key, value } }`.
  - By default, two leads: the voltage across them and the current.
  - Transistor: Vce and Ic; MOSFET: Vds and Id; battery: terminal voltage and current delivered;
    potentiometer: wiper voltage and I(W).
  - The same hook serves the probes later (a node: voltage only).
- **Drawing** (`page/client/scope.js`, `createScope(box, { traces, t, f })`): an SVG in the card
  with two stacked plots on one time axis, never a double axis.
  - Voltage on top, current below.
  - An oscilloscope-screen grid, automatic scale per trace with units (`formatValue`), a "now"
    mark, a time axis with units and the *model* label.
  - It takes a list of traces: the future two-channel panel and the probes reuse it.
  - Redrawn at the page's refresh rate (4 times a second), no CSS filters. When drawing, it keeps
    each pixel column's minimum and maximum, so peaks are not lost.
- **Time**:
  - Circuits with C or L: simulated time. The screen shows from t = 0: first 5 time constants, then
    it stretches with the time up to 10, and only then scrolls, so a capacitor's whole charge stays
    in view.
  - With neither: wall-clock time, so a push button's or a slider's step shows at once.
  - *Pause* freezes the plot.
- **Prediction rule**: as the results. Only in the live page, only for the tapped part.
- **Tests**:
  - The recording matches `engine.transient` at the same instants (RC: 63.2 % at τ).
  - In jsdom: opening the card shows both traces, closing it removes them, a reset clears them.
  - Texts in English and Spanish.

### Phase 8: signal generator

- A new kind of supply:
  `{ "kind": "generator", "waveform": "sine" | "square" | "triangle", "frequency", "amplitude", "offset", "resistance" }`.
  `resistance` is the output resistance; the ZT-703S's is still to be confirmed on the bench.
  It will be drawn beside the board together with the bench supply (an open roadmap item).
- **Engine**: a time-dependent source; in DC, its value at t = 0.
  - The time step and the page clock also follow the period (at least 50 steps per period), not
    only the time constants.
  - Frequency and amplitude sliders.
- **Falstad**: the `v` source with its waveform, no equivalent needed.
- **Cases**:
  - a half-wave rectifier with a capacitor (ripple);
  - an RC with a square wave.

  With them, transient cases join the Falstad cross-check.

### Phase 9: probes on nodes

- Tapping a strip (a group) opens the node's card: its voltage to ground and its oscilloscope with
  one trace. It reuses the recording (node voltages are already in the reading) and `createScope`.
- Designed together with what stage 4 has pending: the virtual multimeter and highlighting what is
  connected to a tapped strip.
- ✅ Done (see the status above). Highlighting what is connected came with it; the virtual
  multimeter (probes on any two holes) stays in stage 4.

## Phases and sessions

| Session | Phase | Delivers |
|---|---|---|
| 1 | 0 · Safety net | `scripts/golden.js` → `test/fixtures/sim-golden.json`; `test/golden.test.js` (relative tolerance 1e-12): DC of every example and test circuit, RC and RL transients, text in en and es |
| 1 | 1 · Real paths | package `paths`, `sim/paths.js`, `path` op, `render --flow` on real paths with proportional speed and colour; electrons view removed; mock-ups of the conductor view; palette chosen: rails |
| 2 | 2 · Device modules | `src/sim/devices/*`, `parts/sensors.js`, stresses in the interface; no visible change |
| 3 | 3 · Compile / engine | `compile.js`, `engine.js`, `node/bundle.js`, `page/client/*` (replaces `page/script.js`); no visible change |
| 4 | 4 · Live page | engine and program embedded, frame loop, dots, voltage colour, glow, heat, time controls, live tags |
| 5 | 5 · Controls and limits | card sliders, `page.controls`, momentary button, stress levels, latched mark, warnings panel; `stress` per part in `simulate` (a new field) |
| 6 | 6 · Falstad cross-check | ✅ exporter (`sim/falstad.js`), *Open in Falstad* button, cases and references in `test/falstad/` with matched models (divider, LED + R, active BJT, Darlington and push button, bridge, MOSFET, potentiometer and Zener) |
| 7 | 7 · Oscilloscope | ✅ in the tapped part's card: recording from the start (`sim/recorder.js`), a `scope` device hook (`sim/scope.js`), `page/client/scope.js` (two stacked plots, V and I, reusable) |
| 8 | 8 · Signal generator | ✅ `generator` supply (sine, square, triangle) in the engine, the page, the sliders and Falstad; transients in the cross-check (`rc-square`, `rectifier-half-wave`) |
| 9 | 9 · Probes on nodes | ✅ a strip's card when it is tapped (or from a pin in a part's card): what is clipped to it, its voltage to ground with the probes, the current of each lead (Kirchhoff) and its oscilloscope (`stripAt`, `selectNode`, `nodeLines`) |

Every phase: docs in English and Spanish, the roadmap ticked (both languages), the decision log in
`PLANNING.md`, new strings through `t()` in every `src/i18n` file, the code map updated.

## Compatibility

- `simulate()` and the MCP JSON keep their shape (the golden test guards it).
- `render --sim` is unchanged; `render --flow` is drawn on the real paths.
- Pages with `results` show the same DC numbers at load, now live; pages with `flow` lose the
  electrons button; circuits without `page` do not grow.

## Left out on purpose

LU reuse and incremental stamping (while the benchmark passes), a canvas renderer, a separate
`live` flag, smooth colour gradients along bodies, a schematic view.

## Verification

- `npm test` in every phase; `test/sim.test.js` and `test/sources.test.js` stay unchanged and
  green; the golden test is identical after phases 2 and 3.
- Bundler: grammar test over the allowed modules; the engine bundle in `node:vm` without globals
  gives the same DC readings as `simulate()` for every example; the page bundle runs in jsdom.
- Benchmark: a 40-node RC/diode ladder runs at least 2000 steps/s in Node.
- Page (jsdom): dot phases advance in proportion to the current; RC: after some ticks,
  V_C ≈ V(1 − e^(−t/τ)); pause freezes, reset zeroes; each slider changes the result as its pure
  formula says; raising the supply of an LED + R past the LED's maximum current marks it exceeded,
  and lowering it again keeps the mark until reset.
- Stress: each ratio computed apart (P = V²/R against the rated power…) and compared.
- Kirchhoff on the new pieces; every path starts at its hole at z = 0 and ends at the shared
  centre; no NaN in any view.
