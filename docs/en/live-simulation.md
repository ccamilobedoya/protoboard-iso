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
- Next: phase 4, the live page.

## Decisions

| Decision | Why |
|---|---|
| **Conventional current only**, + to −, like Falstad (the electrons view is removed) | One direction to read, the same as the simulator learners compare with. Reverses the 2026-10-13 choice. The probe captions keep a short note that electrons go the other way. |
| **Dot speed proportional** to the current, auto-scaled to the largest current, with a speed slider and a log-scale toggle | Half the current looks half as fast, so ratios and Kirchhoff can be seen; the log toggle is for circuits with µA and A together. |
| **Conductor view** ("X-ray"): board veiled, parts faint, every conductor drawn as one continuous thick path (strip → lead → body → lead → wire), coloured by voltage, dots on top; tapping a part brings it back | The path of the current is what a learner needs to see. Drawn over a veiled picture, nothing has to be hidden behind parts. Lines over the realistic drawing (dots showing through bodies) and schematic badges were discarded. |
| **Sliders** automatic in each adjustable part's card, plus a panel of controls the circuit declares (`page.controls`) | Exploring is free; a lesson can still put the two or three that matter in front. |
| **Limits made visible**: every device reports its *stress* (value / limit) for current, power, voltage, reverse voltage; three levels for all parts; a latched "exceeded" mark | One of the goals of simulating at this level is to tell whether a part will survive a voltage before trying it. |
| No new page flag: the engine is embedded when the circuit asks for `page.results` or `page.flow` | Both are already opt-in, so a value pending a learner's prediction is never shown. |
| Oscilloscope (V and I against time) is the last item of the stage | Useful for RC, rectifiers and later the 555, but not needed for the rest. |

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
  peak smoothed. Only the visible view is animated.
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

## Phases and sessions

| Session | Phase | Delivers |
|---|---|---|
| 1 | 0 · Safety net | `scripts/golden.js` → `test/fixtures/sim-golden.json`; `test/golden.test.js` (relative tolerance 1e-12): DC of every example and test circuit, RC and RL transients, text in en and es |
| 1 | 1 · Real paths | package `paths`, `sim/paths.js`, `path` op, `render --flow` on real paths with proportional speed and colour; electrons view removed; mock-ups of the conductor view; palette chosen: rails |
| 2 | 2 · Device modules | `src/sim/devices/*`, `parts/sensors.js`, stresses in the interface; no visible change |
| 3 | 3 · Compile / engine | `compile.js`, `engine.js`, `node/bundle.js`, `page/client/*` (replaces `page/script.js`); no visible change |
| 4 | 4 · Live page | engine and program embedded, frame loop, dots, voltage colour, glow, heat, time controls, live tags |
| 5 | 5 · Controls and limits | card sliders, `page.controls`, momentary button, stress levels, latched mark, warnings panel; `stress` per part in `simulate` (a new field) |
| 6 | 6 · Falstad cross-check | `test/falstad/*.txt`: CircuitJS export and values read there, models matched (RC, divider, LED + R, BJT switch) |
| 6 | 7 · Oscilloscope | ring buffer of V and I of the tapped part, drawn as a polyline panel |

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
