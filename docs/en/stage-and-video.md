# Stage and video: design and plan

*[Español](../es/escena-y-video.md)* · Roadmap: [ROADMAP.md](../../ROADMAP.md), *Stage and video*

The live page learns to **tell** a circuit step by step: a declarative timeline that the page plays
as a tour, and that a script turns into the frames of a short video, under one external clock, so
the same file gives the same pictures every time. An assistant writes the timeline once; from there
nothing needs it. The look of that telling (the *stage*) is a theme of the page, chosen from mock-ups
made over the real page.

Plan of 2026-10-30, after a review of the live page with the UI/UX skills installed locally in this
repository (`interface-design`, the design-engineering skills and `taste-skill`; list in
`.claude/skills/SOURCES.md`). The mock-ups were style sheets over the page of the `npn-switch` recipe,
captured in a real browser at phone, desktop, 1080 × 1920 and 1920 × 1080; they were shown to the
maintainer in a private gallery. Each session ends with the tests green, this page and the roadmap
up to date.

## Status

- ✅ V0 · Safety net (2026-10-30): `test/frames/` holds three cases (`npn-switch` at 390 × 760,
  `rc-square` at 1280 × 800, `led-resistor` at 900 × 620), each with its `tick` calls and the
  SHA-256 of the page and of the PNG, and the browser that made them. `node scripts/frames.js
  [--runs n] [--out dir] [--write]` renders them in headless Chromium (Playwright, a development
  dependency) under Playwright's fake clock, installed and paused before the page loads, never advanced:
  `requestAnimationFrame` never fires and `performance.now()` stands still, so only `tick` moves the
  page. `npm run verify` runs it with `--runs 2`; on the CI (`CI` set, other fonts) with
  `--determinism`: only that the two renders agree, not the stored hashes. Without Playwright or a browser, or with hashes
  written by another browser, a case is SKIPPED (exit 2), never passed.
- ✅ V1 · One clock (2026-10-30): `src/page/client/director.js`, only with `?director=1` in a live
  page (`window.protoboardLive.director`, `body.director`). `start(cues)` (cues `{ at, run(director) }`,
  the hook V2's player goes through), `frame(target, { ms, ease })` (a box, `board`, `parts` or a
  part's id), `set(id, field, value, { ms, ease })` (numbers along the curve, by ratios on a log
  scale; buttons at once) and `tick(ms)`: cues, camera (`frameAt` in `view.js`), controls, then the
  simulation with dots, glow, colours and tags repainted on every tick. Under the director a frame
  has no budget of wall time (at most 20 000 steps), `protoboardLive.tick` goes through it, the
  page's `frameTo` moves on its clock, dots move under reduced motion too, and the limits' text
  throttle reads its time; the page's `requestAnimationFrame` loop calls `tick` with the time that
  passed. `test/director.test.js` plays a sequence with the system clock made to throw; the V0
  hashes did not change (only the pages' hashes, the script grew).
- ✅ V2 · Timeline and player (2026-10-30): `src/tour.js` reads `page.tour` (a JSON file beside the
  circuit, through `src/beside.js`, the reader `.ino` files share, or the timeline itself), checks
  it (`TOUR_*` in `check`) and gives the page its steps in order, texts in the page's language.
  `schema/timeline.schema.json` describes the format; the rhythm needs the order of the steps, so
  `check` reports it (`TOUR_RHYTHM_SLOW`: two `push` in a row; `TOUR_RHYTHM_HIT`: two hits less
  than a breath, 400 ms, apart). The seven moves are one table, `src/page/client/moves.js`
  (duration, range for `ms`, cubic-bezier), written as tokens `--move-<name>-ms` and
  `--move-<name>-ease`. Shape, size and file problems drop the tour; an unknown part or control,
  an `ms` out of range or a broken rhythm is a warning and the tour still plays. Caps in
  `src/limits.js` (100 kB, 200 steps, 280 characters a text, ten minutes) and cases in
  `test/attack.test.js`. The player, `src/page/client/tour.js`, turns the steps into the
  director's cues: *See how it works* in the ⋯ menu of a live page with a tour, a tap anywhere or
  Escape stops it where it is, and at the end the page stays as the tour left it. While it plays
  the director has the time (`page.direct`); under reduced motion its moves are cuts (not in a
  recording, `?director=1`, which starts it with `protoboardLive.tour.play()`). The director gained
  `hold` (`wait-until`, which moves the later steps; `max`, 10 s by default), `tween` (the dots'
  `ramp`, the value's count of 500 ms), `after` and `stop`. For now, until their phases: the caption
  is a plain box at the top (the video's layer and sizes come with V4), `probe` opens the card with
  its oscilloscope (the inset is M11), and `insert` brings the part into focus (the descent is M15,
  V6). `examples/npn-switch.json` and `examples/tours/npn-switch.json`: `test/tour.test.js` plays it
  in jsdom at phone and desktop sizes and gets the same captions, values, controls and focus at
  the same times. A repaint no longer looks its elements up each time (120 ms → 2 ms a tick in
  jsdom). The V0 hashes did not change.
- ✅ V3 · The drawing that tells (2026-10-30), in the order of its brief:
  (1) the current layer as a plan, the default (`style` of `conductorPieces`/`flowOps` in
  `src/sim/paths.js`; `page.flow` takes `{ "style": "plan" | "real" }`, `render --flow` follows
  the circuit): a pad at every landing (a round line of 6 px with an edge of the background),
  a line through two-pin parts and jumpers, a stub of one pitch per pin on the others (side by
  side across a row of pins), a push button's pairs and its bridge while pressed (from its
  `poles`; the page shows the bridge by `data-bridge`), a rail's net name beside its pad, parts in
  focus drawn over the layer at 50 %, widths unchanged; two flat lines on one line move aside
  (0.9 mm); parts beside the board keep their real paths. (2) Coordinates: `coordOps` lights the
  board's own print (`decalTextOp`, shared with `scene.js`), the pills are gone. (3) Result tags:
  a current tag never over the part it measures (more places tried); in the page a transform attribute about each tag's centre keeps
  them at 13 px on screen when zooming in and never larger than placed. (4) The page at rest:
  short labels (`src/render/short-labels.js`, the `shortlabels` layer) and the Labels button for
  the boxes; the close-up frame computed with the parts and their short labels; *MODEL* in the bar;
  Labels and Current keep their word on a phone; zoom buttons quiet until the first touch. The
  pulse on load (medium) is left for the moves (V6). (5) `inspect`: `TAG_OVER_PART`,
  `COORD_COVERED`, `FLOW_COLLINEAR`. `test/plan.test.js`: zero clashes for every example with
  each of its first parts in focus (and 456 scenes, both views and frames, checked once by hand).
  The example images, the README's current image and the V0 hashes changed on purpose.
- ✅ V4 · The stage (2026-10-30): `[data-theme="stage"]` in `src/page/style.js`, the notebook at
  night (slate `#151a21`, the engineering grid in pale blue, chalk ink `#efe9da`, the system's
  serif for captions, amber values); `page.theme`, `?theme=` and a timeline's `theme` take it. Its day version, `[data-theme="notebook"]` (cream paper `#f4efe2`, the grid in blue ink `#184f8f`, near-black ink, current tags in terracotta `#a3461f`; the first round's C), is one more theme for lessons and videos alike: the lessons' default is still the light bench. The reader chooses among the five (like the device, bench, bench at night, notebook, notebook at night) in the ⋯ menu; the choice is kept in the browser for every page of the same site (`page/client/themes.js`, `main.js`); a link's `?theme=` still wins, and a recording keeps the timeline's. The
  grid of holes continues past the board in every theme (`src/render/hole-grid.js`): an SVG
  pattern in the drawing, on the board's own isometric lattice (2.54 mm, major marks every five
  holes through the numbered columns 5, 10, 15…), so it moves and scales with the board as a
  canvas's or a map's grid does; its marks keep their size on screen and the minor ones fade
  when they crowd (`view.js`); dots on the bench, lines on the stage. The
  dark bench is the *bench at night* (canvas `#121211`, the bar without a ground). A recording
  (`?director=1`) takes the timeline's theme (the stage by default; `?theme=` wins), hides the
  chrome, the labels, the short labels and the result tags, and keeps one label: the told part's
  short label (`page.told`, set by the tour's `frame` on a part, `focus` and `insert`; `focus.js`).
  The caption is the video's layer there (`body.director .tour-caption`): no box, its sizes as
  shares of the width (`--cap-text` 56 px, `--cap-number` 44, `--cap-line` 30 at 1080 wide; 52 at
  1920 wide), from 16 % of the height in portrait, the left half in landscape. The reserved margin:
  `insetFrame` and `stageInset` in `view.js` (portrait: the top 40 % and the bottom 25 % free;
  landscape: the left half), used by `fitFrame` and by the director for `board`, `parts` and a
  part. `scripts/stage-shots.js` draws the mock-ups' shots from the real page (stage and dark
  bench, phone and desk, at rest and tapped; 1080 × 1920 and 1920 × 1080 recordings) and measures
  the frame's rules on the DOM (caption band and sizes, the told part and its label in the free
  area, one label, no tags, no chrome); `test/stage.test.js`. The V0 hashes changed on purpose (the
  grid). The contrast and touch-size gates in a real browser are still to run (the maintainer's).
- 🔜 V5 · Frames (2026-10-30), built; waiting for the maintainer to approve the test video on a phone.
  `scripts/render-frames.js <timeline.json> [--format vertical|horizontal|both] [--fps 30] [--lang]
  [--tail ms] [--check]`: the circuit is a file of the timeline's `circuit` name beside it or one
  folder up, else the recipe of that name; its page with the timeline as its tour, opened with
  `?director=1` at the format's size in headless Chromium under a paused fake clock; per frame
  `tick(1000 / fps)` and a PNG, until the tour ends and `--tail` more. It writes `frames/NNNNNN.png`,
  `frames.sha256`, `captions.srt` and `timeline.json` (captions and values with the times they were
  on screen, each step with the time it ran, from the tour's `log`, and the frame's rules measured
  at every caption and every second, the told part only where the camera stands still); `--check`
  renders again in a fresh browser and compares every frame. Chromium runs with partial repaints
  off and every compositor stage done before a frame is drawn (`CHROMIUM_ARGS` in
  `stage-shots.js`): without them about one run in five drew a frame or two a few colour units
  apart; with them twelve runs in a row agreed. Timelines for the test video: `examples/tours/`
  (`led-resistor`, `npn-switch`, `potentiometer-led`, closing on the whole board). On the way: the
  reserved margin takes the caption's side margin, a landscape frame may show up to three boards'
  width, and a frame's rules allow no label (a frame of the whole board). `--no-captions` leaves the caption layer
  out. `scripts/assemble.js <dir…> -o video.mp4 [--burn]` joins frame folders into one H.264 video
  with ffmpeg when it is installed (else prints the command and exits 2) and writes the captions
  beside it; `--burn` draws them in. In a recording a part is framed with its short label, so the
  label stays in the free area too. Making the video: *Recording a video* below.
- 🔜 V6 · The chosen moves (2026-10-30), the first wave done; M4, M5, M7 and M11 remain. Each move
  has its jsdom test (`test/moves.test.js`, values at given times) and its golden frame
  (`test/frames/move-*.json`); the example timeline is `examples/tours/npn-switch-moves.json` (and
  `led-resistor` for M10). M1 arrival and M14 close: a `focus` with a `move` brings the veil, the
  strips and the coordinates in with the camera, or takes them away (with the current layer the veil
  stays); the close ends on a caption, no QR. M2 push, M6 the current starts (`ramp`) and M9 the value
  counts were on the clock since V2. M8: an LED's halo rises to its brightness in 180 ms along the
  hit's curve and goes out at once (an LED is fast; what the eye follows is the light coming); at
  rest when the page loads, at once under reduced motion. M12: the caption before leaves in 200 ms (a
  copy fading out on top), then each line rises from its baseline inside a mask (a `clip-path` on
  each line), 400 ms along the arrival's curve, 90 ms apart; a value rises the same way when it
  appears. M15 (`insert`): the part starts 12 mm up (`page.data.lift`, screen units per mm of z) and
  comes down in 700 ms; in the air the part below is not seen, its label rises with it and the whole
  circuit has no current (dots still, lights off), because on the bench taking a part out opens the
  circuit; when it lands the dots come up in 600 ms (M6) and the light in 180 ms (M8). M16 (`raise`, changed at the maintainer's request the same day: not on every tap, but an optional
  step of a timeline to set a part apart in a video): the part rises 3 mm (`mm`, up to 12) along its
  move, an arrival by default, slower than a tap, and stays up until a `raise` to 0 mm; it stays in
  the circuit (the simulation does not change) and comes into focus. When a tour in the page ends or
  stops, every lifted part goes back to its holes. Both use `liftPart` (`focus.js`): each copy of the part
  and of its label in a group that takes the `transform`. M10 (a slider that moves by itself) is a
  `set` with `travel`, no new code. M3 (flip) and M13 (coordinates) already ran as cues on the clock:
  they were only added to the timeline and the safety net. `scripts/frames.js` takes cases with
  `tour` (a recording, `?director=1`) and launches Chromium with `stage-shots.js`'s compositor flags
  (without them a frame differed now and then). In passing: `render-frames.js` took another timeline named like the circuit
  beside its own as the circuit; it now skips it. The hashes of V0 did not change. Left: M4 (the
  circuit builds itself: the parts not yet down must be hidden), M5 (wires drawn), M7 (a pulse along
  the path), M11 (the oscilloscope inset); the pulse on load (V3) was not done either.
- ⬜ V7: not started. The decisions below were taken by the maintainer on 2026-10-30 (second round); what is still open says so.

## Who and what for

- **Who:** the same learner as the page (a self-taught adult at the bench, usually on a phone),
  plus whoever sees a 30 to 60 s vertical video in a feed and has three seconds to decide to stay.
- **What they see:** the circuit already working (or failing) as the hook, then why, one part at a
  time, with the value that matters written large, and the page at the end.
- **How it must be made:** from a timeline file, without an assistant in the loop, so that two runs
  give identical frames and a new video of a recipe costs one file, not one session.

## What exists (measured on 2026-10-30)

- **A deterministic clock.** `window.protoboardLive.tick(ms, steps)` advances the simulation without
  `requestAnimationFrame`; `set(id, field, value)` moves a control; `currents()`, `recording(id)`,
  `reading` and `engine.controls()` give the numbers to label (`src/page/client/live.js`).
- **A camera.** `frameTo` (220 ms, strong ease-out), `fitTo`, `fitFrame` (portrait framing), `flipView`
  (immediate by decision of 2026-10-16); with `prefers-reduced-motion` every move is immediate
  (`src/page/client/view.js`). The camera is a `viewBox`, so a frame is four numbers.
- **Focus.** The veil, the strips in x-ray, the copies of the told parts and their labels above the
  current (`src/render/focus.js`, layers `veil`, `strips`, `coords`, `spotlight`, `spotlabels`).
- **Current.** Dots along the real conductors, moved by an accumulated phase per frame; conductor
  colour by voltage; LED glow and heat (`src/sim/paths.js`, `src/sim/look.js`). In a live page the
  CSS `@keyframes dots` is off (`body.live .dots { animation: none }`), so the dots already follow the
  page's clock.
- **Themes.** Every colour of the page is a token on `:root`, light and dark, chosen by the system,
  `page.theme` or `?theme=` (`src/page/style.js`, `.interface-design/system.md`).
- **Screenshots.** `scripts/ux-shots.js` writes the pages and a Playwright function that captures them
  at five sizes; PNG from SVG with resvg (`src/node/raster.js`, optional dev dependency).
- **Missing.** The camera and the slider changes run on `requestAnimationFrame` and wall time; there is
  no timeline format, no caption layer, no framing that keeps a margin free, and no frame exporter.

## Decisions (2026-10-30)

| Question | Options shown | Decision |
|---|---|---|
| Visual direction of the video (second round, 2026-10-30: the maintainer kept A and C and asked for both in dark) | A dark, *bench at night* (today's dark tokens, near-black ground, the hole grid as dots, no bar background) · C dark, *notebook at night* (slate ground, the engineering grid in pale blue, chalk ink, a serif voice for what is told) | **C dark**, as a `stage` theme |
| Default theme of the page in lessons | stays today's light A (its dark mode becomes A dark, with the grid) · the video's direction | **stays A** |
| Highlighted coordinates | an upright glyph with a halo above the veil · the same under the parts · today's pills | **none of the three**: the board's own printed decals, lit (see *The drawing that tells*) |
| Conductor lines in the simulation | the five changes of *The drawing that tells* · only no pieces inside bodies with light · another subset | superseded by the plan view (next row): no pieces inside any body, tags at a fixed size, the glow stays; **the widths stay as today** (3.2 px conductors, 2.4 px dots), the maintainer saw no need to thin them |
| Conductors of a part as a plan (the maintainer's idea, 2026-10-30) | real paths as today (leads up, through the body, down) · *plan*: one straight line per pin, at board level, from its hole to the part's centre (an X in a push button, a V in a transistor, a line in a resistor or LED), the parts seen through while the current shows · plan on the board, real paths off it | **plan**, with the rules in *The drawing that tells*: wires flat, **a pad at every landing**, a line only through two-pin parts and wires, a short stub per pin elsewhere (maintainer, 2026-10-30) |
| The page at rest | the seven changes of *The drawing that tells* · only the high ones · none now | **high and medium** |
| The hole grid continued as the background | page and video · video only · no | **page and video** |
| Camera rhythm on arriving at a part (the same grammar moves the frame sideways at a constant zoom: a frame is four numbers) | *arrival* · *travel* · *anticipation* once per video | **arrival**, and *anticipation* for the key moment |
| Moves to build (M1 to M16 below) | any subset | **M1, M2, M6, M8, M9, M12, M14, M15, M16 first**; M4, M5, M7, M10, M11 second; M3 and M13 only join the clock |
| The tour in the page ("See how it works") | from V2 · after the first video | **from V2** |
| Captions in the frame or only in `timeline.json` | both · JSON only | **both** |
| Typeface of the video captions | the system's, as the page · a packaged one for the director mode only | **the system's** |
| Output formats | vertical 1080 × 1920 · horizontal 1920 × 1080 · both | **both** (maintainer, 2026-10-30) |

What the three directions share, taken from the object itself: the breadboard's 2.54 mm hole grid
continues beyond the board as the page's background. It is not an ornament; it is the same grid.

## The frame

Rules for a video frame, measurable with `inspect` and the screenshots (V3 adds the measurement):

- **Vertical (1080 × 1920):** the caption sits between 16 % and 40 % of the height; the circuit
  below. The top 15 % and the bottom 25 % stay free: the platforms draw their controls there (the
  exact bands are checked per platform in V4).
- **Horizontal (1920 × 1080):** the caption at the left, the circuit shifted to the right. The camera
  needs a *reserved margin* (frame the parts in the free part of the screen), which does not exist.
- **Sizes at 1080 px wide:** caption 56 px, value 44 px in the monospaced face with tabular figures,
  step 30 px; at 1920 wide, caption 52 px. Everything above 40 px, which reads on a phone with the
  video full screen.
- **Only the told part keeps its label.** The others hide in director mode: the dimmed labels of the
  four other parts covered half of the first mock-up.
- **The simulation tags (5 V, 528 pA) do not show** in a frame: the value that matters goes in the
  caption, large. In the page they stay.
- **No CSS filters** on anything that moves (decision of 2026-10-15): glow and veil are drawn shapes
  with opacity.

## The drawing that tells

Found in the second round of mock-ups (2026-10-30), with the `design-review` lenses and the app-screen
rules of `taste-skill`; each item is measurable and belongs to the kit (`src/render/focus.js`,
`src/sim/paths.js`, `src/sim/look.js`, `src/sim/overlay.js`, the page's framing), so it serves the
static image, the page and the video alike.

- **Coordinates** (the maintainer's rule, 2026-10-30): nothing new is drawn over the board. The board
  already prints its row letters and column numbers as decals on its surface (`draw-board.js`:
  `textDecal`, columns 1, 5, 10… at 1.4 mm, rows at 1.5 mm, colour `print`); the active coordinate is
  **that same decal, lit**: same glyph, same size, lying on the board, only its colour changes to the
  accent. A column the board does not number gets the same decal, in the same printed format, with no
  rotation and no extra style, visible only while it is needed (the `allNumbers` path already draws
  every column). Painted on the board, they are covered by parts the way the print is; the pills of
  `coordOps` go away.
- **Inside a body with light (an LED), no conductor pieces:** the glow says current flows and the body
  stays clean; the dots run along the leads and stop at the body's edge.
- **Other bodies: two pieces, not six**, one per half, the colour step at the centre (the S curve
  already puts the change there).
- **Dots inside bodies thinner** (1.6 px, against 2.4 on leads), so the conductor's colour shows.
- **Result tags at a fixed screen size** (like the coordinates) and never over the part they measure
  (collision test with its box); today they scale with the zoom and cover the part in a close-up.
- **The LED's glow stays as it is**: it is the signal.
- **Plan view of a part's conductors** (mock-up of 2026-10-30, pending): instead of the package's 3D
  paths, each pin is one straight segment at board level from its hole to the part's centre, and the
  body pieces go away. It is a change of geometry only: the model already gives one current per pin,
  hole → middle, so dots, Kirchhoff and colours need nothing new. The rule, settled with the maintainer
  on 2026-10-30 after three mock-ups (star, V, pads): **a pad at every landing, a line only where there
  is a conductor to follow, a stub where the part swallows the current.** Two pins (resistor, LED,
  diode, capacitor): one line through the part, pad to pad. Three or more pins (transistor, regulator,
  potentiometer, push button, DIP, module): a pad on each pin and a **stub** of about one pitch
  (2.54 mm) from the pad towards the body, carrying that pin's dots, so the direction and the size of
  each pin's current show (the base's few dots against the collector's many) without any line crossing
  another; no star, no V, no bus. **A package may declare internal links**, drawn as lines between its pads: a push button declares
  its two always-joined pairs and the bridge that closes while pressed (the X of the first mock-up),
  because knowing how a button is wired inside is the lesson (maintainer, 2026-10-30); a potentiometer
  may declare its track. Most packages declare none. Jumper wires keep their arcs (the arc is
  the wire, and flat wires would cross on the board); parts off the board (battery, boards, clip-on
  switches) keep their real paths. In the current layer the told parts are drawn at about 50 % opacity
  (the see-through that already exists for one part), so the flat lines read as under the body, not
  painted on its top. Implementation: a `style` of `partPaths()` in `src/sim/paths.js` that ignores the
  package's `paths` and builds the segments from `part.holes` and the part's centre (about 40 lines),
  `page.flow.style` (`real` | `plan`, default `plan`), the static `render --flow` follows, the
  examples' images change on purpose. Cost: low-medium. Chosen by the maintainer on 2026-10-30.
- **Wires in the plan view** (mock-up of 2026-10-30, pending): a jumper also becomes one straight
  segment at board level from hole to hole, in its voltage colour, and **each end lands on a pad**: the
  strip's hole dot (`stripOps` already draws one per hole) grows to about 3 px where a conductor lands,
  filled with the conductor's colour and rimmed in the ground's colour. The pad is what says "this wire
  and that resistor sit on the same strip": the strip between them is drawn in x-ray with its voltage
  colour and its dots, and the two pads close the reading. Lines that cross without a pad are not
  connected, as in a schematic. A wire to a rail lands on the rail's pad and the rail's x-ray strip
  carries the dots to the supply; **the net's name is printed beside a rail pad** (`netLabels` already prints one per rail; the same
  decal, only in the current layer), chosen by the maintainer on 2026-10-30. With the arcs kept instead, the wire's feet are the
  only pads and the arc leaves the plane everything else lies in; the mock-up read worse. Chosen by the
  maintainer on 2026-10-30: flat wires with pads, and pads as the general rule above. Two flat
  conductors lying on one line (a wire along a part's own line) are rare, since `layout` already charges
  a wire for every body it crosses; `inspect` gets a check for collinear overlaps in the flow layer.

The page at rest (nothing tapped, no simulation shown):

| Before | After | Why | Weight |
|---|---|---|---|
| The ladder of five label boxes leads over the board; on a phone it takes half the height and pushes the circuit down | At rest, labels as short text beside the part (name and value, no box, a halo); the leader only on a tap; boxed labels with leaders stay for the *Labels* button and the static image | The circuit must lead; printed, not stuck on | high |
| On a phone the first screen is half empty above and a small board below | The portrait frame at rest is computed from the parts and their short labels, not the ladder; the board grows about twice | The first screen earns itself | high |
| Nothing invites a tap; the page reads as a picture | One pulse on load (the recipe's main part rises 1 mm and settles, 400 ms) or its faint glow for 2 s; then nothing | First use without explanation, once per visit | medium |
| The MODEL · DC simulation badge top left is small text in a frame; it reads as debris | Into the bar at the right as grey text without a frame, or hidden at rest and shown with the first card | Metadata is demoted | medium |
| Four icons without words in the phone's bar | The two that change what is seen (Labels, Current) keep their word on a phone; Flip and Fit stay icons | Buttons that change the page's state need a name | medium |
| The zoom buttons float over the board with a border and a light fill | Same place, no border, the canvas colour with opacity, shown at the first gesture | One plane of surfaces; what is unused stays quiet | low |
| The result tags grow with the zoom | Fixed screen size, never over their part | A value that cannot be read is not a value | high |

Kept as it is: one accent, flat surfaces with a lightness step, 40 px targets, the press feedback, the
bottom sheet with its three heights, tabular figures in the card.

## Rhythm

Fast changes catch the eye; slow ones hold it. A video at one speed tires in ten seconds. Each step
of a timeline names its move with one of seven words, and the player maps the word to a curve and
a duration, so the rhythm is consistent across videos without anyone tuning it:

| Move | Duration | Curve | Use |
|---|---|---|---|
| `cut` | 0 ms | none | a change of shot or state; the hook, before/after |
| `arrival` | 600 to 900 ms | quint out, `cubic-bezier(0.22, 1, 0.36, 1)` | the camera lands on a part (the page's 220 ms frame, lengthened for video) |
| `travel` | 1 200 to 1 800 ms | quart in-out, `cubic-bezier(0.76, 0, 0.24, 1)` | from one part to a far one without losing the thread |
| `push` | 3 000 to 8 000 ms | cubic out, `cubic-bezier(0.33, 1, 0.68, 1)` | a slow push-in while the caption speaks |
| `hit` | 120 to 180 ms | quint out | a value appears, the LED lights, the button sinks; always followed by a breath |
| `breath` | 400 to 1 200 ms | none (hold) | before each big hit and after each arrival |
| `anticipation` | 250 ms back, then an arrival | 8 % pull-back on a half sine, then quint out | the one most important move of a video |

The alternation rule, checked by the timeline's schema in V2: never two slow moves in a row, never
two hits without a breath between them. The curves are the ones the page already names as tokens
(`--ease-out`, `--ease-in-out`) plus two new ones; the durations become tokens too.

## The timeline

One JSON file per video. It is the script, what the page plays as a tour and what the frame
exporter follows. An assistant writes it; from then on nothing is generated.

```json
{
  "circuit": "npn-switch",
  "format": "vertical",
  "theme": "stage",
  "steps": [
    { "at": 0, "do": "frame", "target": "board", "move": "cut" },
    { "at": 0, "do": "caption", "text": "A transistor as a switch" },
    { "at": 1200, "do": "frame", "target": "S1", "move": "arrival" },
    { "at": 1200, "do": "insert", "part": "S1", "move": "arrival" },
    { "at": 2400, "do": "caption", "text": "Press S1: the base current lights the LED" },
    { "at": 3000, "do": "set", "part": "S1", "field": "pressed", "value": true, "move": "hit" },
    { "at": 3000, "do": "flow", "on": true, "ramp": 600 },
    { "at": 3400, "do": "frame", "target": "D1", "move": "travel" },
    { "at": 3400, "do": "value", "part": "D1", "field": "current", "label": "through the LED" },
    { "at": 5000, "do": "frame", "target": "D1", "zoom": 1.25, "move": "push", "ms": 5000 },
    { "at": 10000, "do": "frame", "target": "board", "move": "travel" },
    { "at": 10000, "do": "caption", "text": "protoboard-iso: the page does what the video does" }
  ]
}
```

- `at` is simulated wall time in ms from the start of the tour; steps with the same `at` start
  together. `ms` overrides the move's default duration (only `push` needs it).
- Actions: `frame` (`board`, `parts` or a part id, with an optional `zoom`), `focus` (part ids; with a `move` the veil comes in or leaves along it),
  `flip` (`front` | `back`), `set` (a control, tweened over the move's duration), `flow` (the current
  layer, with a `ramp` from zero), `caption` (text; a second `line` is allowed), `value` (a reading of
  a part, large, next to the caption; it counts up over 500 ms), `probe` (a strip's or part's
  oscilloscope in a corner box), `insert` (M15: the part comes down into its holes; `ms`, 700 by default), `raise` (M16: the part rises `mm`, 3 by default, and stays up, in the circuit; `mm: 0` puts it back), `wait-until` (a condition on a reading: `{ "part": "D1", "field":
  "brightness", "above": 0.5 }`; the next steps shift by the wait).
- The texts are plain or per language, like a circuit's `description`.
- Caps (`src/limits.js`): steps per timeline, text length, total duration. Texts go through
  `escapeXml`; nothing from the file runs as code.

## Moves

Each move has a named purpose (without one it is not built), a cost, and runs under the clock:

| # | Move | What it does and why | Cost |
|---|---|---|---|
| M1 | Arrival at a part | the camera goes from the board to the part with `arrival`; the veil and the focus come with it | low (exists; needs the clock) |
| M2 | Slow push | a 3 to 8 s push-in while the caption speaks | low |
| M3 | Flip to the back view | shows the strips underneath; a cut with a breath before and after, or a 300 ms fade | low |
| M4 | The circuit builds itself | parts come down one by one (M15) in the order `layout` gives, each with a small hit and a breath | medium |
| M5 | Wires draw themselves | each wire is traced end to end (stroke length) | medium |
| M6 | The current starts | on the press, the dots start from zero and reach their speed in 600 ms | low |
| M7 | A pulse along the path | one flash runs the current's path from + to − at the instant of the change | medium |
| M8 | The LED lights | the glow rises from 0 to its brightness in 180 ms instead of appearing | low |
| M9 | The value counts | the caption's figure rises from 0 to its value in 500 ms with tabular figures | low |
| M10 | Before and after | a slider moves by itself between two values in 1.5 s; the large value follows; the LED changes | medium |
| M11 | Oscilloscope in a box | the trace draws in a large corner box from t = 0 when the signal matters | medium |
| M12 | Captions that arrive | each line rises from its baseline (mask), 90 ms between lines; the previous one leaves in 200 ms | low |
| M13 | Coordinates light up | the column numbers and row letters of the part light for an instant on arrival | low (exists) |
| M14 | Closing | the camera returns to the whole board with `travel`, the veil goes, the page or a QR appears | low |
| M15 | Insertion | the part starts 12 mm above the board and comes down with `arrival` (700 ms) along the drawing's z axis (the screen's vertical); on seating, a `hit`: the current starts (M6) and the light comes on (M8); in the air it has no current and its label follows it; a shadow as a faint ellipse under it, optional (a shape, no filter). Chained, it is how M4 builds the circuit | medium-low |
| M16 | Raised part | in a video (`raise`), the part rises 3 mm with an arrival and stays up until lowered, without leaving the circuit; purpose: say "this one" (first planned on a tap in the page, 150 + 250 ms; the maintainer preferred it optional and slower, for videos only) | low |

Left out on purpose: animation libraries, real 3D, camera orbits (the isometric view is fixed),
particles and blurs, scene transitions between different circuits (ffmpeg does those).

## Architecture

- **One clock.** `page/client/director.js` (new) owns time in director mode: `start(timeline)`,
  `tick(ms)` advances the tour, the camera, the tweens and the simulation in that order, and writes
  the DOM once per tick. In the page without the director the existing loop keeps running; in the
  director the loop calls `tick` with the real elapsed time, and the exporter calls it with `1000/fps`.
- **Camera by clock.** `view.js` gets `frameAt(page, from, to, k)` (the interpolation `frameTo`
  already does, exposed) and `frameTo` keeps its `requestAnimationFrame` for the interactive page.
  A *reserved margin* option (`inset: { left, top, right, bottom }` in screen fractions) in `fitFrame`.
- **Tweens by clock.** A control moved by the director changes value each tick (`engine.set`), on the
  move's curve; the LED glow and the dot speed ramp through the same tween.
- **Captions.** A `.caption` layer in the page (hidden without the director), with the sizes above
  as tokens (`--cap-*`), and `data-live` texts for the recorded strings.
- **Stage theme.** The chosen direction as a third token set (`[data-theme="stage"]`), the hole grid
  as a `main` background (the SVG's background rect transparent in the page), the director's rules
  (labels, tags) in `style.js`.
- **Exporter.** `scripts/render-frames.js` (Playwright, dev only): opens `out/<name>.html?director=1`,
  loads the timeline, sets the viewport, and per frame calls `tick(1000/fps)` and captures a PNG;
  writes `frames/NNNNNN.png` and `timeline.json` (captions with their times, values, the moves). The
  ffmpeg command to assemble is documented, not run by the kit.
- **The tour in the page.** The same timeline, a *See how it works* button in the ⋯ menu when the
  circuit has one (`page.tour` names the file, read beside the circuit like a program, confined to
  its folder); a tap anywhere stops it and leaves the page as it is.

## Phases and sessions

| Session | Phase | Delivers | Done when |
|---|---|---|---|
| 1 | V0 · Safety net | `scripts/ux-shots.js` as it is; a frame golden: `test/frames/` with the recipe, the viewport, a list of `tick` calls and the hash of the resulting PNG (headless Chromium through the browser container or Playwright when installed; skipped, never passed, without one) | two runs of 3 recipes give identical hashes |
| 2 | V1 · One clock | `director.js` with `tick`; camera, tweens, dots, glow and colours written per tick; `?director=1`; jsdom tests driving `tick` | any sequence replays from `tick(1000/30)` without reading the system clock |
| 3 | V2 · Timeline and player | the JSON format and its schema (`npm run schemas`), the seven moves as tokens, `wait-until`, the tour button, `page.tour`, caps and `attack.test.js` cases | `npn-switch` has a timeline and the page plays it the same on a phone and a desktop |
| 4 | V3 · The drawing that tells | the coordinates as lit glyphs skipped under a part, no pieces inside bodies with light and two in the others, thin dots inside bodies, tags at a fixed size and off their part, short labels at rest and the frame computed with them, the MODEL badge into the bar | `inspect` reports zero collisions of coordinates and tags with parts; the examples' images change on purpose (`--write-examples`) |
| 5 | V4 · The stage | the chosen direction as `[data-theme="stage"]`, the hole grid, the caption layer, director rules (one label, no tags), the reserved margin, safe bands measured in the screenshots | the gallery's mock-ups come out of the real page with no extra CSS |
| 6 | V5 · Frames | `scripts/render-frames.js`, `timeline.json`, the ffmpeg command in the guide; a 45 s test video of 3 recipes | the maintainer approves the video on a phone |
| 7 | V6 · The chosen moves | one by one (M15 and M16 among them if chosen), each with a jsdom test (values at given times) and its golden frame | each chosen move appears in an example timeline |
| 8 | V7 · Bench and guide | a timeline per recipe to be recorded, the frame golden in `npm run verify`, the guide in en and es (how to write a timeline, how to get the video), roadmap, code map | a medium model makes a new video of a recipe with the guide alone |

Every phase: docs in English and Spanish, the roadmap ticked (both languages), the decision log in
`PLANNING.md`, new strings through `t()` in every `src/i18n` file, the code map updated. Each phase is
written as a complete brief (files, exact values, tests) so a medium model can execute it alone.

## Session briefs

One brief per phase, short on purpose: enough to keep the order and the decisions, not the step
list (that is written by the session itself at its start, against the code as it is). Every
session starts by reading this page, `CLAUDE.md` and the brief of its phase, checks the names
below against the code (a previous phase may have chosen others), ends with `npm test` and
`npm run verify` green, this page's *Status* and the roadmap (both languages) updated, a
`STATUS:` line, and asks before committing (message in English). Phases are built in order.

### V0 · Safety net

- **Build:** Playwright as a dev dependency and Chromium (`npx playwright install chromium`);
  `test/frames/` with one case per recipe (`npn-switch`, `rc-square`, `led-resistor`: viewport,
  the `tick(ms, steps)` calls after loading `out/<name>.html`, the PNG's SHA-256); a script in
  `scripts/` that renders and compares, `--write` to regenerate on purpose; a step of
  `npm run verify` (0 pass, 1 fail, 2 could not run; without a browser SKIPPED, never a pass).
- **Honour:** `scripts/ux-shots.js` stays; nothing visible changes.
- **Done when:** two runs over the 3 recipes give identical hashes.

### V1 · One clock

- **Build:** `page/client/director.js` with `start` and `tick(ms)`; the camera interpolated by
  the clock (`frameAt` in `view.js`, `frameTo` keeps `requestAnimationFrame` for the interactive
  page); controls tweened per tick through `engine.set`; dots, glow and colours written per tick;
  `?director=1`; jsdom tests driving `tick`.
- **Honour:** `window.protoboardLive` keeps `tick`, `set`, `currents`, `recording`; pages without
  `?director=1` do not change; no CSS filters.
- **Done when:** any sequence replays from `tick(1000/30)` without reading the system clock, and
  the V0 hashes are unchanged.

### V2 · Timeline and player

- **Build:** the JSON format of *The timeline* and its schema (`npm run schemas`); the seven moves
  of *Rhythm* as tokens (curve and duration each) with the alternation rule checked by the schema;
  the actions listed there, `insert` and `wait-until` included; `page.tour` (a file beside the
  circuit, confined to its folder) and *See how it works* in the ⋯ menu, a tap stops it; caps in
  `src/limits.js` and cases in `test/attack.test.js`; strings through `t()` in every `src/i18n`.
- **Honour:** the tour is in the page from this phase (decision); captions are plain or per
  language; nothing from the file runs as code.
- **Done when:** `npn-switch` has a timeline and the page plays it the same on a phone and a
  desktop (jsdom values at given times, plus the maintainer on a phone).

### V3 · The drawing that tells

- **Build, in this order:** (1) the current layer as a plan: `partPaths()` style `plan` in
  `src/sim/paths.js`, a pad at every landing (the strip's hole dot grown), a line through two-pin
  parts and along wires, a stub of one pitch per pin on the others, internal links a package
  declares (the push button's pairs and bridge), the net's name printed beside a rail's pad
  (`netLabels`), told parts at 50 % in the current layer, widths unchanged, `page.flow.style`
  (`real` | `plan`, default `plan`), `render --flow` follows; (2) coordinates: the board's own
  decals lit, unnumbered columns get the same decal, `coordOps`' pills removed; (3) result tags
  at a fixed screen size and off their part; (4) the page at rest: short labels beside the parts,
  the portrait frame computed with them, the MODEL badge into the bar, Labels and Current keep
  their word on a phone, zoom buttons quiet; (5) a collinear-overlap check in `inspect`.
- **Honour:** every item of *The drawing that tells*; the examples' images change on purpose
  (`npm run verify -- --write-examples`, `scripts/readme-images.js`); the static SVG keeps its
  colours.
- **Done when:** `inspect` reports zero collisions of coordinates and tags with parts; the
  maintainer approves the plan view and the page at rest on a phone.

### V4 · The stage

- **Build:** `[data-theme="stage"]` as *notebook at night* (slate ground, the engineering grid in
  pale blue, chalk ink, the system serif for captions); the hole grid as `main`'s background in
  every theme (the SVG's background rect transparent in the page); the caption layer with its
  sizes as tokens (56 / 44 / 30 px at 1080 wide, 52 at 1920); director rules (one label, no tags);
  the reserved margin in `fitFrame` (vertical: captions between 16 % and 40 %, horizontal: the
  left half); safe bands (15 % top, 25 % bottom) measured in the screenshots.
- **Honour:** the light bench theme stays the default of lessons; its dark mode is *bench at
  night* with the grid; the system's typeface, no network.
- **Done when:** the gallery's mock-ups come out of the real page with no extra CSS, at phone,
  desktop, 1080 × 1920 and 1920 × 1080. Ask the maintainer for a real browser to run the
  contrast and target gates.

### V5 · Frames

- **Build:** `scripts/render-frames.js` (Playwright, dev only): opens `out/<name>.html?director=1`,
  loads the timeline, sets the viewport (both formats), calls `tick(1000/fps)` per frame, writes
  `frames/NNNNNN.png` and `timeline.json` (captions with their times, values, moves); the ffmpeg
  command in the guide, not run by the kit; a 45 s test video of three recipes.
- **Honour:** two runs give identical frames (hashes); the runtime stays without dependencies.
- **Done when:** the maintainer approves the video on a phone.

### V6 · The chosen moves

- **Build, one by one, each with a jsdom test and a golden frame:** M1 arrival, M2 push, M6 the
  current starts, M8 the LED lights, M9 the value counts, M12 captions arrive, M14 closing, M15
  insertion, M16 raised part; then M4, M5, M7, M10, M11; M3 and M13 only join the clock.
- **Honour:** the moves table (durations, curves, purposes); transform and opacity only; reduced
  motion keeps the final state.
- **Done when:** each move appears in an example timeline and its golden frame is in the safety
  net.

### V7 · Bench and guide

- **Build:** a timeline per recipe to be recorded; the frame golden in `npm run verify`; the guide
  in English and Spanish (how to write a timeline, how to get the video, the ffmpeg command); the
  roadmap ticked; the code map; the agents' files if a tool or command changed.
- **Done when:** a medium model makes a new video of a recipe with the guide alone.

## Recording a video

Built in V5; V7 turns it into the full guide. The kit makes the frames; ffmpeg, outside the kit
(not a dependency: `apt install ffmpeg`, or a static build), makes the video, through
`scripts/assemble.js` (development only, like Playwright).

```bash
# The frames of a timeline: examples/out/video/<timeline>/<format>/frames/*.png, frames.sha256,
# captions.srt, timeline.json. --check renders twice and compares every frame.
node scripts/render-frames.js examples/tours/npn-switch.json --format both --lang es --check

# One video from one or more frame folders of the same size and fps, one after the other (H.264,
# plays on every phone and platform), and their captions beside it as video.srt.
node scripts/assemble.js examples/out/video/{led-resistor,npn-switch,potentiometer-led}/vertical -o video.mp4
```

`assemble.js` runs ffmpeg when it is installed; without it, it prints the command and exits 2. Its
`--burn` draws the captions of the clips' `timeline.json` under the picture, above the platforms'
bottom band: for frames made with `render-frames.js --no-captions` (no caption layer, the times
still recorded), when the subtitles come later. By hand, one clip:

```bash
ffmpeg -framerate 30 -i frames/%06d.png -c:v libx264 -pix_fmt yuv420p -crf 18 -movflags +faststart clip.mp4
```

`render-frames.js` exits 1 when a frame at rest breaks a rule of *The frame* (it names the time) or
when two runs differ.

## Compatibility

- Pages without `page.tour` and links without `?director=1` do not change: same chrome, same loop.
- `window.protoboardLive` keeps `tick`, `set`, `currents`, `recording`; the director adds to it.
- The static SVG keeps its own colours; the stage theme is the page's.

## Verification

- `npm test` in every phase; `test/live.test.js` and `test/sliders.test.js` stay green.
- Determinism: the frame golden (hashes) in `npm run verify`; a change of the drawing regenerates it
  on purpose (`--write`), never by accident.
- Measured, not looked at: caption sizes and safe bands from the screenshots' DOM (`inspect`-like
  numbers in the exporter's report), label count in a director frame (one), no tags.
- Looked at once per phase: the maintainer sees the video or the tour on a phone.
