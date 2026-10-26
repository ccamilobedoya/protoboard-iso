# Design system: the page (calm instrument workbench)

Chosen by the maintainer on 2026-10-16, from a palette generated in Google Stitch ("Calm Instrument
Workbench"), adapted to the kit's rules. It covers the page's chrome (toolbar, card, panels,
oscilloscope), not the drawing of the board and parts. Read by the `interface-design` skill;
the UX pass implements it in `src/page/style.js` as tokens on `:root`.

## Direction

- **Feel:** a lab notebook next to a bench instrument. Calm, precise, quiet; the circuit leads,
  the chrome stays in the background until it is needed.
- **Who:** a self-taught adult learning electronics at the bench, often on a phone or an iPad,
  usually inside a lesson note (a notes app's web view, iframe ~460 px high).
- **Signature:** the toolbar as an instrument's front panel, grouped by job; values in a
  monospaced, tabular face like a meter's readout; the oscilloscope as a dark well cut into
  the panel.
- **Depth:** borders only (hairlines), flat surfaces, no drop shadows. A dark well for the scope.

## Tokens (light)

| Token | Value | Use |
|---|---|---|
| `--bench` | `#F3F1EA` | page background, button fill (breadboard cream) |
| `--well` | `#E8E5DC` | toolbar, recessed areas, hover, explanation boxes |
| `--card` | `#FFFFFF` | card and panels |
| `--ink` | `#1A1A1A` | text |
| `--ink-2` | `#4A4A47` | secondary text (kind of part, control names) |
| `--ink-3` | `#6E6C66` | metadata (section headers, clock, revision, hints) |
| `--hair` | `rgba(26,26,26,.14)` | panel borders, dividers |
| `--hair-strong` | `rgba(26,26,26,.25)` | button borders |
| `--rail-blue` | `#1B6EC2` | the accent: active state, values, sliders, focus ring |
| `--rail-blue-deep` | `#145596` | border of an active button |
| `--rail-red` | `#D93829` | warnings and limits only |
| `--rail-red-ink` | `#A82A1E` | warning text on light surfaces |
| `--scope` | `#0D1418` | oscilloscope screen |
| `--trace-v` / `--trace-v-ink` | `#F5A623` / `#8A5A00` | voltage trace / its name on the card |
| `--trace-i` / `--trace-i-ink` | `#00E5FF` / `#00687A` | current trace / its name on the card |
| `--scope-grid` | `rgba(255,255,255,.08)`, dashed | scope grid |

Red and blue keep their breadboard meaning: blue is the one accent, red means "attention".
Nothing else gets color in the chrome. Amber and cyan live only in the scope.

## Tokens (dark, draft to tune)

`--bench #1E1D1B`, `--well #272623`, `--card #2C2B28`, `--ink #ECEAE4`, `--ink-2 #C4C1B8`,
`--ink-3 #9A978E`, `--hair rgba(255,255,255,.10)`, `--hair-strong rgba(255,255,255,.18)`,
`--rail-blue #6FA8E8`, `--rail-red #E8705F`, ink of the traces `#F5B84A` / `#5FE3F5`. Scope unchanged.
Chosen by `prefers-color-scheme` and by a page parameter (for a note app whose theme differs
from the system's). The board drawing keeps its own light colors inside a framed canvas.

## Type

- **Interface text:** `system-ui` stack, with Lato if present (the page loads no fonts: no network).
- **Values, clock, units, scope scales:** `ui-monospace, "JetBrains Mono", Menlo, Consolas,
  monospace` with `font-variant-numeric: tabular-nums`. JetBrains Mono is used only if installed.
- **Section headers:** 11 px, uppercase, `--ink-3`, monospaced. Hierarchy from weight and color,
  not size: card title 15/600, values 13/500, metadata 11–12/400.

## Shape and spacing

- 4 px grid. Radius 4 px on buttons and inputs, 6 px on panels and the scope; circles only for
  status dots and probe ends.
- Buttons 28 px high with a fine pointer, 40 px on touch (`@media (pointer: coarse)`).
- Focus ring: `0 0 0 1px var(--bench), 0 0 0 2px var(--rail-blue)`.

## Left out of the Stitch file, on purpose

- **Web fonts** (Space Grotesk, Arimo, JetBrains Mono): the page has no network or dependencies,
  and embedding three fonts would add weight to every page.
- **Phosphor glow** on the traces (`filter: drop-shadow`): no CSS filters on animated pages
  (they made the page crawl, see docs/en/code-map.md).
- **Machine-panel labels** ("SEC_01 // TRIGGER") and uppercase everywhere: this is for a learner,
  not a lab technician; plain Spanish labels.
- **Its Material-style color list** (surface #fcf9f8, primary #00559e…): it disagrees with its
  own prose; the bench values above are the ones kept.

## Implemented (UX pass, U2, 2026-10-16)

Tokens in `src/page/style.js`. Two gaps found in the mock-up are closed: the drawing's
background, veil, labels and result tags take the tokens in the page, and the scope traces are
classes (`.scope-trace.v / .i`). Token names in the code: `--accent` (rail blue), `--danger`
(rail red), `--warn`, `--canvas` (behind the board), `--veil`, `--tag-v` / `--tag-i`.

## Gaps found in the mock-up of 2026-10-16 (closed)

- The drawing's own background and the dim veil are white in the SVG, so the cream stops at the
  canvas; they need tokens from the renderer too (light and dark).
- The trace colors are constants in `page/client/live.js` (`SCOPE_V`, `SCOPE_I`): move them to tokens.
