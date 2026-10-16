# User experience pass: design and plan

*[Español](../es/experiencia-de-uso.md)* · Roadmap: [ROADMAP.md](../../ROADMAP.md), *User experience*

Stage 3 left the page with many useful features: views, framing, labels, the current layer,
time controls, Falstad, cards for parts and strips with their values, sliders and oscilloscope,
a controls panel and warnings. They were added one phase at a time and now compete with
each other and with the circuit, above all on a phone and inside a lesson note. This pass
reorganises the whole page around one interaction model before stage 4 adds more.

Plan of 2026-10-16, from a review of the live page (desktop, tablet, phone, embedded at 900 and
390 px) with the UI/UX skills installed locally in this repository (`interface-design` and
Emil Kowalski's design-engineering skills; list in `.claude/skills/SOURCES.md`). The visual
system is in [`.interface-design/system.md`](../../.interface-design/system.md). Each session ends
with the tests green, this page and the roadmap up to date.

## Status

- ✅ U0 (2026-10-16): `scripts/ux-shots.js`; the "before" set is the review's screenshots.
- ✅ U1 (2026-10-16): gestures by context, zoom buttons, double tap to a part, full screen. Checked
  in Chromium with touch emulation inside an iframe: one finger and the wheel scroll the note, two
  fingers move and pinch in both directions, Ctrl + wheel zooms, a tap opens the card, a double
  tap frames the part. Tried by the maintainer on the test page: works.
- ✅ U2 (2026-10-16): every colour of the page is a token (light and dark, from `system.md`); the
  theme follows the system, `page.theme` fixes it and `?theme=` in the link wins; in the page the
  drawing's background, veil, labels and result tags take the tokens; the scope's traces too; touch
  baseline (hover only with a mouse, `:active` feedback, no tap flash, 40 px targets on touch).
- ✅ U3 (2026-10-16): the bar in one row grouped by job (view: Flip, Whole board; layers: Labels,
  Current; time: Pause/Run, Switch on, clock), icons with labels that hide on a narrow screen, the ⋯
  menu (dot speed, Open in Falstad with its ⚠ n, What can I tap?, revision) with keyboard and
  focus handled, a warnings flag on the bar, the first-time hint over the drawing. Checked at
  390 px: no sideways scrolling (the clock hides below 400 px).
- Next: U4.

## Who and what for

- **Who:** a self-taught adult learning electronics at the bench, with the lesson open in a
  notes app (a Trilium web view: an iframe about 460 px high inside a page that scrolls), often
  on a phone or an iPad, sometimes on a desktop.
- **What they do:** look at how a circuit is built, tap a part or a strip to understand it, read
  its values, move a slider, watch the current or the scope, flip the board to see the strips.
- **How it should feel:** calm and precise, like a lab notebook next to a bench instrument. The
  circuit is the one focal point; the interface stays quiet until it is needed.

## What the review found

Screenshots and the full table: `~/proyectos/electronica/diagramas/vista-previa-kit/ux/`
(`index.html`, `findings.md`), on the maintainer's machine.

| # | Severity | Finding |
|---|---|---|
| 1 | Blocker | **Scroll trap when embedded.** The wheel always zooms (`view.js`, `preventDefault`) and `main` has `touch-action: none`, so a reader cannot scroll the note past the circuit. On a phone the iframe can fill the screen and trap them. |
| 2 | Blocker | **Phone: the chrome covers the circuit.** The controls panel stays open over a quarter of the screen; the card (bottom left, up to 55 % high) covers the part that was tapped. |
| 3 | Blocker | **A flat bar.** 13 controls of equal weight: two rows on a desktop, three rows embedded at 900 px (≈ 95 of 460 px); on a phone a 1,844 px row with a hidden scrollbar, so *Current*, *Pause* and *Falstad* cannot be found. |
| 4 | Should fix | *Close* and *See through* are at the bottom of the card, below the oscilloscope. |
| 5 | Should fix | Small parts are hard to tap: R1's centre opened W1 (the wire on top wins). |
| 6 | Should fix | The MODEL stamp is drawn in board coordinates and falls off the screen (x = −221 px); it says *DC* on a page that runs a transient. Saying "model" is a rule of the course. |
| 7 | Should fix | Flipping the board and changing the framing are instant and reset the zoom and position. |
| 8 | Should fix | No visible zoom or reset; double-click only zooms in. |
| 9 | Should fix | No tokens (≈ 30 hex values in `style.js`), no dark theme; the board's labels grow with the zoom and are larger than any interface text. |
| 10 | Note | Hover not gated for touch, no press feedback, no tap-highlight reset, 25 px buttons. |
| 11 | Note | The *Tap a part…* hint sits in the bar like another control. |
| 12 | Note | Portrait framing leaves the top of the frame empty. |

A mock-up with the new palette alone (CSS injected, 2026-10-16) did not make the page look good:
the problem is the structure, not the colours. That is why this pass starts with gestures,
layout and hierarchy, and keeps the palette as tokens to tune at the end.

## Principles

Taken from the skills and the review; every phase is checked against them.

1. **The circuit leads.** The chrome never covers more than about 15 % of the frame on a desktop
   and 30 % on a phone, and never the part being explained: when a panel opens, the frame moves
   so the selected part stays in the free area.
2. **One interaction model.** The **bar** is for the view and time; the **inspector** (card) is
   for what was tapped; the **circuit tab** of the inspector is for what concerns the whole
   circuit (controls, warnings, Falstad notes). Nothing floats on its own.
3. **Progressive disclosure.** The basics in view, the rest one step away (an overflow menu, a
   collapsed section). The lesson decides what exists (`page.*`); the page decides what shows first.
4. **Respond on press.** Feedback on pointer-down; 40 px targets on touch; hover only where there
   is a mouse (`@media (hover: hover) and (pointer: fine)`).
5. **Motion explains or does not happen.** Only the flip, the sheet and the panel move; under
   300 ms, strong ease-out / ease-in-out curves as tokens; a fade with `prefers-reduced-motion`.
   No CSS filters (see the code map). Frequent actions (tap a part, toggle a layer) don't animate.
6. **Tokens and themes.** Every colour of the page's chrome from a token; light and dark; the
   static SVG keeps its own colours and stays byte-identical.
7. **Same page, same link.** File name, `page.*` fields and the prediction rule are unchanged; an
   embed made today keeps working and gets the new interface.

## Target design

### Bar

One row, 36 px high (about 48 px on touch, with 40 px buttons), grouped by what it does, icon + short label on a desktop,
icon only on a phone (the label as `aria-label` and tooltip). No sideways scrolling.

| Group | Controls | When |
|---|---|---|
| View | **Flip** (one button: front ↔ back), **Fit** (parts ↔ whole board, one button with two states) | always |
| Layers | **Labels**, **Current** | Current with `page.flow` |
| Time | **Play/Pause**, **Restart (t = 0)**, clock | live pages with C, L or a generator |
| ⋯ | speed scale (proportional / log), *Open in Falstad ↗* with its ⚠ n, revision, *What can I tap?* | always (items by page) |

A zoom cluster (+, −, fit) sits in the bottom-right corner of the frame. The hint *Tap a part or a
strip* becomes a first-time pill over the frame that goes away after the first tap (remembered in
`localStorage` when available).

### Inspector

One container for every card, with a sticky header: title, ✕, and the *See through* toggle for a
part. Order of sections: what it is (kind, value, use here) → values with a **MODEL** badge →
oscilloscope → its controls → pins / leads (collapsed). With nothing selected, the inspector shows
the **Circuit** tab: the `page.controls` sliders, the warnings (with *Clear marks*), the Falstad
notes. A warning also lights a dot on the bar so it is never missed.

- **Wide (≥ 760 px):** a panel on the right, 300 px, over the frame; the frame shifts so the
  selected part sits left of it. Collapsible to a tab on the edge.
- **Narrow (< 760 px):** a bottom sheet with three heights: *peek* (header, MODEL badge and the
  main values in one line), *half*, *full*. Dragged with the finger (pointer events, rubber band
  at the ends, snap by release velocity), and its header tapped to step. The frame keeps the part
  above the sheet.

### Gestures

| Where | One finger / mouse drag | Two fingers | Wheel | Double tap |
|---|---|---|---|---|
| Embedded (inside an iframe) | **scrolls the host page**; a tap still selects | move and zoom | scrolls the host; **Ctrl/⌘ + wheel** or a trackpad pinch zooms, with a short "Ctrl + wheel to zoom" note the first time | zooms to the tapped part |
| Full page (opened alone, or full screen) | moves the drawing | move and zoom | zooms | zooms to the tapped part |

A **Full screen** button (in ⋯, and in the zoom cluster when embedded) opens the page alone (or
uses the Fullscreen API) for the full gestures. Small parts get a larger tap area; a second tap on
the same spot picks the part underneath (a wire over a resistor).

### Flip and framing

Flipping keeps the focused part (or the centre) in the same place on screen and the same zoom; a
short transition (≈ 250 ms, `--ease-in-out`) shows that it is the same board turned over (a
horizontal squeeze and expand of the drawing; a cross-fade with reduced motion). Changing the
framing animates the viewBox (≈ 200 ms, `--ease-out`). Portrait framing fits the area left free by
the bar and the sheet.

### Labels and the MODEL stamp

As decided on 2026-10-12, labels in the page follow the tap: on a phone only the selected part's
label shows (and all with *Labels* on); on a desktop all, at a size capped on screen so they never
outgrow the interface. The MODEL stamp moves out of the drawing into the inspector (badge on the
values) and the frame's corner, with the right mode (*DC* or *transient*).

### Visual system

From [`.interface-design/system.md`](../../.interface-design/system.md): bench cream and ink,
rail blue as the one accent, rail red for warnings, the scope as a dark well; hairlines, no
shadows; system fonts with monospaced tabular values; 4 px grid. Tokens on `:root`, dark theme by
`prefers-color-scheme`, overridden by the circuit's `page.theme` and by the link's `?theme=dark|light`
(for a notes app whose theme is not the system's). In the page only, the drawing's background, veil and label boxes take the
tokens too (the static SVG keeps its colours).

## Feature inventory

| Feature | Today | Target | Shown when |
|---|---|---|---|
| Front / back view | 2 buttons in the bar | Flip button | the circuit has two views |
| Close-up / whole board | 2 buttons | Fit button (two states) + zoom cluster | always |
| Labels | button | Layers group | always |
| Parts / current layer | 2 buttons | Current toggle | `page.flow` |
| Proportional / log speed | 2 buttons | ⋯ menu | `page.flow` |
| Pause, switch on, clock | bar (live) | Time group | live, with C, L or generator |
| Open in Falstad, ⚠ n | bar + side panel | ⋯ menu; notes in the Circuit tab | live |
| Revision | bar | ⋯ menu | always |
| Hint | bar | first-time pill; *What can I tap?* in ⋯ | always |
| Part card (kind, value, use, pins, results, scope, sliders, button modes, see-through, close) | floating box, bottom left | inspector | tap a part |
| Strip card (leads, voltage, currents, scope) | same box | inspector | tap a strip in use |
| Probes of a result tag | tooltip on the drawing | unchanged | tap or hover a tag |
| Controls panel | side panel, open | Circuit tab | `page.controls` |
| Warnings, clear marks | side panel | Circuit tab + dot on the bar | a part near or past its limit |
| Drag, pinch, wheel, double-click | always captured | by context (table above) | always |
| Full screen | – | ⋯ and zoom cluster | embedded |

## Phases and sessions

| Session | Phase | Delivers |
|---|---|---|
| 1 | **U0 · Safety net** | `scripts/ux-shots.js`: writes a Playwright snippet that loads chosen pages at 1280×800, 1024×700, 390×760 and inside an iframe (900×460, 390×460) and saves screenshots (same container workflow as `scripts/falstad.js`); "before" set saved. jsdom tests for the page's structure updated as each phase changes it. |
| 1 | **U1 · Gestures and embedding** | gestures by context (embedded: one finger and wheel go to the host; two fingers, Ctrl/⌘ + wheel and pinch zoom), first-time note, double tap zooms to a part, zoom cluster (+, −, fit), Full screen. Fixes findings 1 and 8. |
| 2 | **U2 · Tokens, theme, touch baseline** | `style.js` on tokens from `system.md`; dark theme (`prefers-color-scheme`, `?theme=`); drawing background, veil and label boxes from tokens in the page; scope trace colours as tokens; touch baseline (tap highlight, gated hover, `:active`, `touch-action: manipulation`, 40 px on coarse pointers). Findings 9 (colours) and 10. |
| 3 | **U3 · The bar** | groups, inline SVG icons (no dependencies), Flip and Fit as single buttons, ⋯ menu (keyboard and focus handled), first-time pill, warnings dot; every string through `t()`. Findings 3 and 11. |
| 4–5 | **U4 · The inspector** | one container with sticky header and section order; Circuit tab (controls, warnings, Falstad notes); right panel on wide screens, bottom sheet with peek/half/full on narrow ones; the frame keeps the selected part in the free area; MODEL badge with the right mode. Findings 2, 4 and 6. |
| 6 | **U5 · Motion** | motion tokens (`--ease-out`, `--ease-in-out`, `--ease-drawer`, durations), flip keeping the focus and zoom, framing transition, sheet and panel motion, press feedback, reduced motion; checked with the `review-animations` bar. Finding 7. |
| 6 | **U6 · Details** | labels by context with a screen-size cap, larger tap areas and tap-again to pick the part underneath, portrait framing. Findings 5, 9 (labels) and 12. |
| 7 | **U7 · Try and tune** | the maintainer tries it on a phone, an iPad and inside Trilium; adjustments; `/design-review` until approved; palette tuned; docs. |

Every phase: docs in English and Spanish ([embedding.md](embedding.md),
[focus-and-flow.md](focus-and-flow.md), [code-map.md](code-map.md)), the roadmap ticked in both
languages, the decision log in `PLANNING.md`, new strings in every `src/i18n` file, screenshots
from `ux-shots` compared with the previous set.

## Decisions

Taken by the maintainer on 2026-10-16.

| Decision | Chosen | Phase |
|---|---|---|
| One finger on an embedded page | scrolls the note; **two fingers move the drawing**, like an embedded Google Map (with its short hint) | U1 ✅ |
| Inspector on a desktop | a **panel over the frame**; the frame shifts so the selected part stays free | U4 |
| Labels on a phone | **only the selected part's** (all with *Labels* on) | U6 |
| Theme | **follows the system**; a setting overrides it: `page.theme` in the circuit, and `?theme=` in the link over both | U2 |
| Palette | the tokens of `system.md`, tuned in U7 | U7 |

## Compatibility

- Same file name and `page.*` fields; an embed made today gets the new interface.
- The static SVG (`render`) and the drawings in `examples/out/` stay byte-identical: tokens and
  page-only colours are CSS in the page.
- Results, current and controls keep the prediction rule: they exist only when the circuit asks.
- Without JavaScript the page still shows the first view with labels.

## Left out on purpose

- Web fonts and the traces' glow from the Stitch file (no network; no CSS filters).
- UI libraries or frameworks: the runtime has no dependencies; controls are native HTML
  (`button`, `input type=range`, `dialog`/popover where supported) with the behaviour written once.
- Redrawing the board (the `study` theme is its own roadmap item), the virtual multimeter and
  the prediction mode (stage 4).

## Verification

- `npm test` (jsdom tests of the page) and `npm run examples` with no new issues.
- `ux-shots` at the five sizes, compared with the previous set.
- The skills' checks: `interface-design` (squint, swap, signature and token tests; the
  `design-review` approval bar), `review-animations` for U5, `mobile-native` lists what needs a
  real phone.
- The maintainer on a phone, an iPad and inside Trilium (U7).
