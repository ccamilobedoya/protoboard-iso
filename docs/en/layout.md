# Layout: the algorithm that places a whole circuit

*[Español](../es/montaje-automatico.md)*

`layout` turns a list of parts (without holes) and the nets that join them into a placed, wired
and reviewed circuit, in about a second, with no trial and error by whoever calls it. This page
explains how it works step by step, which numbers steer it, and how to change it without breaking
it. The code is `src/layout.js` (about 1000 lines) and `src/layout-sides.js` (the side assignment,
step 2a); the design decisions are in [PLANNING.md](../../PLANNING.md) (2026-10-17, 2026-10-31).

Entry points, all calling `autoLayout(spec, { profile, checkOnly })`:

| From | Call |
|---|---|
| MCP | tool `layout` (`target`, `recipe` and `values`, or `parts`, `nets`, `supplies`; `board`, `title`, `netLabels`, `environment`, `page`, `clearance`, `check_only`, `dry_run`, `fix`, `budget_s`) |
| CLI | `node bin/protoboard-iso.js layout <new target> <spec.json \| -> [--check] [--dry-run] [--json] [--budget <seconds>]`, or `--recipe <name> [--values '<json>']`, or `layout <target> --fix [--dry-run]` (exit 0 done, 2 changes) |
| Code | `import { autoLayout, validateSpec, checkNets } from './src/layout.js'`; a recipe is turned into a spec first by `resolveRecipe` (`src/recipes/index.js`) |
| Bench | `npm run layout-bench [-- spec.json …]` (runs `examples/layout/*.json` and every recipe) |

A **recipe** ([recipes.md](recipes.md)) is a spec kept in the kit for a usual lesson circuit, called
by name with only the values that change; it becomes an ordinary spec before anything below runs.

## The spec

```json
{
  "board": "auto",
  "parts": [
    { "id": "U1", "part": "7805" },
    { "id": "S1", "part": "KCD1", "on": true },
    { "id": "R1", "type": "resistor", "value": "1k" }
  ],
  "nets": [
    ["S1.2", "U1.IN"],
    { "pins": ["U1.GND", "T-"], "color": "black" }
  ],
  "supplies": [{ "id": "V1", "voltage": 12, "positive": "S1.1", "negative": "T-" }],
  "netLabels": { "T-": "GND" }
}
```

- `parts`: no `pins`, in any order: the order given is tried first and breaks ties (step 1), and
  when it leaves something to fix the orders the nets give are tried too ([Any order](#any-order-the-orders-the-nets-give-since-2026-11-16)). A part is a type with
  its fields, or only a part number, module or alias (`"7805"`, `"KCD1"`, `"UNO"`, `"resistencia"`):
  `resolvePart` (`src/parts/resolve.js`) fills in the type.
- `nets`: each one a list of pin references (`"D1.K"`, case-insensitive pin names) and rails
  (`"T-"`, `"B+"`), or `{ pins, color }`. A pin alone (`["D1.A"]`) is fine: it is where a supply
  will connect. A pin listed in several nets joins them: they become one net, where the first of
  them was, its pins in the order they came (note `LAYOUT_NETS_JOINED`: "Nets 1, 2, 3 share U1.D8"),
  the same circuit as the spec with the pins in one list (since 2026-11-20; before, each was routed
  apart and a board's pin could find no place). Two nets that share a rail stay two nets, joined
  through the rail (`["T-", "B-"]` bridges the grounds).
- `supplies`: as in a circuit, except that `positive` and `negative` may name a pin; it becomes a
  free hole of that pin's strip once placed.
- `board` (`auto` by default: the elastic board that grows in length, or two side by side when a
  development board needs it, see [Two boards](#two-boards-a-devkit-on-both-headers-since-2026-10-31)),
  `clearance` (1 mm by default), `title`, `lang`, `netLabels`, `environment`, `page`: copied into the circuit.

## The pipeline

```text
spec ─▶ 0 validate ─▶ 1 layers ─▶ 2 place ─▶ 3 jumpers ─▶ supplies ─▶ 4 verify ─┐
          │ (all problems                                                        │
          │  at once, nothing placed)          ◀── relayout, forbidding a place ─┤ blocking
          ▼                                                                       ▼
        invalid                                                        best try: circuit + report
```

`autoLayout` runs `validateSpec` once, then `layoutOnce` up to `TRIES` times. Every `layoutOnce`
starts from an empty board, so a try never inherits the mistakes of the one before; only the set
of forbidden places (`forbid`) carries over.

### 0. Validate (`validateSpec`)

Everything a spec can get wrong, in one pass, before placing anything: a missing or repeated id,
a name the kit does not know (with the closest ones), a field the part's type does not take
(`UNKNOWN_FIELD`, from `strayFields` in `src/parts/fields.js`: `"state": "on"` on a switch, whose
field is `on`), a field the type cannot read (the part's own `resolve`: a resistor's `"abc"` says it
takes a resistance such as `330` or `4k7`, an LED colour there is none of lists the colours; a part
wired pin by name, `MODULE_PINS`, is left to its placement), a net naming a part or a pin that is not
there (with the pins it has; not for a part whose fields could not be read), and a part in no net
(a warning). Any error → nothing is placed and every problem comes back together, so the
caller fixes them all in one round. `check_only` / `--check` stops here.

Pin names are read as people write them (`findPin`, `src/parts/pin-names.js`): the part's own name
first, ignoring case, then synonyms (`A`/`anode`, `K`/`cathode`, `VIN`/`IN`, `VOUT`/`OUT`,
`DISCH`/`DIS`, `THRESHOLD`/`THR`, `VDD`/`VCC`, `VSS`/`GND`, `3.3V`/`3V3`, `E`/`emitter`, `G`/`gate`…)
and GPIO numbers on a board (`GPIO4`, `IO4`, `4` → the DevKit's `D4`), only when exactly one pin
matches; on a board, `TX` and `RX` are its serial pins (the UNO's `D1`/`D0`, the C3's `GPIO21`/`GPIO20`,
the DevKit's `TX0`/`RX0`) and the DevKit's `GPIO17`/`GPIO16` its `TX2`/`RX2`. The nets come back with the part's own names (`D1.K` → `D1.cathode`), so the steps below
never see an alias. Circuits, `query` and `suggest` read pins the same way.

### 1. Layers: signal order from the source

A breadth-first search over the nets, as in Sugiyama-style schematic layout: the source part is
layer 0 (the part of the first supply whose `positive` names a pin, else the first part), its
neighbours in any net layer 1, and so on. **Rails do not join parts** here: a ground rail would make
every part a neighbour of every other. Parts are placed in layer order; within a layer, and for
parts the search never reaches, in the order given. The result: the board reads left to right in
signal order (supply → diode → switch → regulator → load).

### 2a. Sides: which half each part goes in (since 2026-10-31)

The centre channel splits the board in two halves, `T` (rows f–j, next to the T rails) and `B`
(rows a–e, next to the B rails). A net with pins on both halves needs a jumper (or a part) across
the channel, and a pin on the other half from its only rail needs a jumper across a whole half. So
before placing anything, `assignSides` (`src/layout-sides.js`) decides each part's half from the
nets: a two-way partition that cuts as few nets as it can, the classic problem of placement tools,
solved the classic way (Fiduccia–Mattheyses passes).

- It works on **electrical nets**: asked nets that share a pin or a rail are one, as `checkNets`
  reads them, so a lead may go into any rail of its electrical net (an LED's cathode into `B-` when
  another net joins `T-` and `B-`).
- **Elements**: a part, or each lead of a part off the board (each lead goes where it likes). A chip
  across the channel has pins on both halves: pins 1…n/2 on its own half, the others on the other
  one, so its half (the row of pin 1) is part of the choice. A button (pin 1 always in the back
  row) and a development board placed by pin 1 (its pin 1 row chosen first, on the empty board) are
  fixed. Each element weighs about the columns it takes on its half.
- **Cost** = `CROSS_WEIGHT` (8) × nets with pins on both halves + `leanWeight` (12) × elements off
  their lean + the imbalance between the halves beyond `SIDE_SLACK` (10) columns. A net's rails
  pull its pins to their half; a net with rails on both halves pulls nowhere. The **lean**: a
  potentiometer prefers T (its knob faces the front: on B it covers its strips' way to the front
  rails), a lead of a board lying behind the board (an UNO, by default) prefers T (it arches over
  less of the board), one lying in front prefers B.
- **Search**: each free element in order on the half that costs less given those before it (ties:
  the lighter half, then B); then passes that move the free element whose move gains most (ties by
  order), lock it, until all moved, keep the best prefix, and stop when a pass gains nothing.

A circuit whose rails are all on one half (a 7805 with `T+` and `T-`) stays on that half: that is
the cheapest, and it is right. On a double board there are four sides, front to back `B`, `T`, `K`
(rows k–o) and `U` (p–t, next to the `U` rails), the same passes move an element to any other side,
a net costs `CROSS_WEIGHT` for each side past its first, and the balance is between the fullest and
the emptiest side; a board across the joint has each pin on the side of its row (`at`). Op-amp, 555 and UNO circuits now split by their pins (the table in
"Measured").

### 2b. Place each part (scored candidates, checked by geometry only)

One **column cursor per half** (both start at 2), so the two halves fill side by side instead of in
one long line; a part across the channel starts at the larger of the two and moves both.

Each rule builds candidates (hole sets) only on strips that are **empty or already of the same
electrical net**: a strip with a pin of another net, or with a pin in no net, is never shared, and
a rail only when it is in the pin's electrical net.

| Part kind | How it is recognised | Candidates |
|---|---|---|
| Off the board (switch, Arduino, e-paper adapter) | `resolve` answers `MODULE_PINS` | each lead on its half: a free hole of a strip its net already has (from the channel outwards), else a rail of its net on that half, else a fresh strip at that half's cursor, two columns apart, as far as the board goes; five variants (a row further out, a column later). Leads that are each the only other pin of one pin of a three-in-a-row part (a potentiometer on 5V, A0 and GND) land side by side in that part's pin order, in the rows behind it, and that part is placed right after: it shares all three strips and needs no jumper behind its body (since 2026-10-31). A switch keeps only the pins in use and their partners. |
| Development board over the channel (ESP32 DevKit, C3 SuperMini) | type `module` with a package placed by pin 1 | pin 1 in every row and column near the cursor, scored by the free holes each pin in a net keeps on its strip outside the board and its overhanging PCB; the best six are tried. A DevKit whose nets use one header lands with pin 1 in row `c`, leaving row `a` free. A pin in a net whose strip the board covers whole is reported (`LAYOUT_PIN_COVERED`, below), and on `auto` the circuit goes to two boards (below) |
| Three in a row (TO-220, TO-92, potentiometer, AMS1117 module) | package `inline`, three pins | three strips in a row on its half, from the cursor's window or where its nets already are; tall ones (`TALL`) in row `b`/`g`, others in `c`/`h` |
| Two leads, a rail in one net (a capacitor or an LED to ground) | package `span`, two pins, `max ≥ 2` pitches | upright: one lead in a rail of its electrical net on its half, the other in the row next to it |
| Two leads (any) | package `span`, two pins | along any row of its half, `k` to `k + 3` holes long (`k` = the package's minimum span), either way round, from the cursor's window or from a strip its nets already have |
| A package with footprints (DIP chip, button, bridge rectifier) | `pkg.footprints` | every footprint the package allows: a DIP across the channel with pin 1 on its half, a button across the channel, a bridge along row `b`/`g` of its half |
| Anything else, or no candidate passed | — | `suggest` near the cursor (`limit: 3`, up to 24 candidates, no room reservation, no via jumper; its places in `forbid` skipped); if that fails too, `LAYOUT_PART_FAILED` with its reasons |

**The cost of a candidate** (mm; ties keep the order the candidates were made in):

- for each pin: nothing on a strip or a rail its net already has, else `JUMPER_COST` (10) plus the
  distance to the nearest hole of its net already placed, or to its rail (the first pin of a net
  costs nothing);
- `CURSOR_COST` (0.5) per column between the candidate's first column and its half's cursor;
- `EDGE_ROW_COST` (5) for lying along the row next to the rails, kept for parts standing on a rail;
- `SHADOW_COST` (25) for enclosing a strip of a tall part that still needs a jumper to its rail (or
  for a tall part, for landing where its strip would be enclosed). A tall part hides the holes
  between it and its rails in the view from its own side, so that jumper is seen only from the
  other view, past its neighbours; measured: a part on that strip between it and the rail, or on
  the strip just before it on the back half, hides it in both views.

**Tried in order**: the `MAX_TRIED` (16) cheapest, then the 8 cheapest from the cursor on, then the
cheapest at each column and row from the cursor on (a large electrolytic does not fit in the crowd
it would share strips with). The first that `tryOps` accepts, and that leaves each pin that needs a
jumper a free hole clear of the part's own body (`reachable`: a 2200 µF can covers its own strips;
not for bodies held up off the board, `HELD_UP`), wins. Where it was before (layout again) is tried
first of all; candidates with a hole well inside the box of a body already on the board are not
built at all.

**`tryOps` (the acceptance test).** Add the part and check the **geometry only** (occupancy, lead
lengths, body overlap, crossings, clearance; nothing is drawn), and accept only if it adds no error
and no new blocking problem compared to the circuit before (`blocking` = errors, warnings and
`TOO_CLOSE` notes). Since 2026-11-20 the part is built alone and checked with the parts whose boxes
come near it or that share a strip with it (`addedOnly`): every placement check is about one part
or a pair, so the answer is the one a whole build gives, in a time that does not grow with the
circuit. A board that grows with the part draws again the parts lying beside it (they follow its
size). `FLOATING_PIN` is tolerated because the
jumpers come later. A place in `forbid` is skipped. The answers are remembered for the whole call
(by circuit and operation), so a relayout that repeats the first steps does not build them again.

**What it hides (since 2026-11-20).** A place the geometry accepts is then measured as the review
measures a drawing (`src/layout-sight.js`): the part, the parts it overlaps on screen and what covers
those, painted far to near in both views at 2 px/mm in a frame around them. If it leaves itself, or
a part it covers more than before, under `SEEN_SHARE` (75 %) in its best view, the next candidate is
tried; the first one by cost is used only when none is free of it. Jumpers (step 3) are measured the
same way. It runs as a second search, only when the first (the relayout loop without it, as layout
always placed) ends with something blocking, from an empty forbid list; the better of the two is
kept, the first on a tie. The loop settles every recipe (`laser-uno` leaves 5 parts hidden on its
first try and none on its sixth), so a recipe is placed exactly as before (recipes are published
and filmed), and a large circuit the loop cannot settle (ten LEDs from one pin, an UNO with a
74HC595 and eight LEDs) is measured once its first search is over. Until 2026-11-20 the second
search started after the first try when that try left more than 5 parts hidden (`HIDDEN_SETTLED`):
one recipe sat at exactly 5, so one part more in a recipe would have moved it. The rule now depends
on how the first search ends, never on a count; its price is the first search's tries on a large
circuit (ten LEDs from one pin: 9 tries and 4.5 s instead of 2 and 1.8 s, load 2).

After each part the cursor of its half (both halves for a part across the channel; the half of each
lead for a part off the board) moves to two columns past its rightmost lead, or past the right edge
of its body for parts on the board; the elastic board grows with it (`headroom: SPAN + 12`
columns).

Why rows `b`/`g` for tall parts: measured, in rows c–e and h–j one side of their strips ends up
behind the body in one of the two views, so a hole that is free is still unusable.

### 3. Jumpers: a minimum spanning tree per net (since 2026-10-31)

For each net: the groups it touches (the strips of its placed pins, and its rails), and which of
them earlier jumpers already joined (union-find). Then **Kruskal**: the pairs of free holes between
two groups not yet joined, cheapest first; the first one the geometry check (`tryOps`) accepts
joins them, and the pairs are measured again (each jumper takes two holes) until the net is one
piece. A pair the geometry rejected is not tried again. So each net gets its cheapest spanning
set, instead of a chain grown from the leftmost group (before 2026-10-31: each group joined to the
nearest one already joined, 80 pairs each).

- cost = straight length + 1 if the two holes are not in the same column (a straight jumper reads
  better) + `OVER_COST` (12 mm) for each body its line crosses seen from above (a jumper arches over
  what lies between its holes and hides it: a way round a chip, or to a farther strip of the net,
  wins when it is short); pairs shorter than two pitches are skipped (too short to see);
- rail holes only within 6 columns of the group (a jumper does not run along the board to reach a
  rail); no hole under a board's PCB;
- `PAIRS_PER_GROUP` (40) pairs per pair of groups; after `JOIN_TRIES` (40) rejections the net gives
  up: `LAYOUT_WIRE_FAILED` for each piece still apart, naming the nearest group by column of the
  largest piece (where the repair goes) and the parts on those strips (for the relayout loop);
- laying out again: the jumpers the circuit already had between two groups are tried first.

Colour: the net's `color`, else black for a net with a `−` rail, red for one with a `+` rail, else
the next of `PALETTE` (one per net).

Then the **supplies**: a pin reference becomes a free hole of that pin's strip.

### 4. Verify

- `checkNets(circuit, nets)`: the electrical nets built (strips joined by jumpers) against the nets
  asked for, after merging the asked nets that share a pin or a rail. **Missing**: pins of a net that
  are not on its main group. **Shorted**: two asked nets on the same group.
- `review(circuit, { profile: 'lesson', views: ['front', 'back'] })`: the same review an agent runs,
  which also measures visibility in the drawing (the only check step 2 does not make).

### The relayout loop (`autoLayout`)

While a try is not perfect (nets wrong, a problem, or the review blocks something), each blocking
item names some parts, and one of them loses its place: its `forbidKey` (`"<id> <pins>"`, or
`"wire <holes>"` for a jumper, since jumper ids are renumbered) goes into `forbid`, and the layout
runs again from scratch. Which one:

- by default the one **placed last** (`sequence`: parts, then jumpers);
- a part hidden by a jumper, or a jumper hidden by a part (`PART_HIDDEN`): the first time, the
  jumper; the next time the same part is in such trouble, the part (moving jumpers did not help:
  its strips have no free hole in sight); after that, the jumper's **link** (`"link <group>
  <group>"`: those two groups are not joined directly any more, so the net joins them some other
  way). A jumper over a part loses its link at once (since 2026-10-31);
- a net left apart (`LAYOUT_WIRE_FAILED`): the part placed last on the strips no jumper could join;
- a covered pin (`LAYOUT_PIN_COVERED`): no try can fix it, so the loop stops there (and the repair
  is skipped); on `auto` the whole layout runs again on two boards (next section).

It stops when a try is perfect, when no new place can be forbidden, or after `TRIES`. The best try
is kept, by `score = 100 × (nets wrong) + 10 × problems + blocking items`.

Laying out again is simpler and more predictable than patching a layout in place: one try takes
0.05–0.5 s, and the steps a try repeats from the one before are not built again (the geometry
checks are remembered for the whole call).

### Any order: the orders the nets give (since 2026-11-16)

The relayout loop above repairs one place at a time; what it cannot change is the order the parts
are placed in, and that order came from the caller. The same circuit listed two ways could end
`DONE` one way and `CHANGES` the other (measured: a resistor added in series with a buzzer, listed
at the end of the parts instead of before the buzzer, on the circuit already placed: `No jumper fits`
and the buzzer's net left apart). Step 1's layers do not help there: a ground net through a board's
`GND` pin makes every part a neighbour of the board, so they are all in layer 1 and the order given
decides.

So `autoLayout` (`inAnyOrder`) lays the circuit out in the order given first, exactly as before: a
spec that ends `DONE` (or `WARNINGS`) stays as it is and costs nothing more. Only when it ends
`CHANGES` does it try the orders the nets give (`signalOrders`), each placed as it is (no layers),
and keep the best result: nets and review first, then jumpers, then columns. Both orders are read
from the nets alone, so they are the same whatever order the parts were listed in:

- **the source**: the part of a supply's positive pin, else a microcontroller board, else the first
  part on a + rail, else the first part in the nets;
- **signal nets only**: a net with a rail, a ground or power pin (`GND`, `5V`, `3V3`, `VIN`, `VCC`…)
  or a supply's terminal feeds stages and does not chain them; it only reaches parts the signal nets
  do not. Ties go by where a part first appears in the nets;
- **by distance from the source**, sources first: `U1, R1…R7, DS1` (the display after the seven
  resistors that feed it);
- **from the far end back**: the reverse of a depth-first walk from the source, so each part comes
  before the one that drives it and a board's leads land on strips its parts already hold:
  `BZ1, R3, D2, R2, D1, R1, U1`.

The answer then says so in a note (`LAYOUT_ORDER_FROM_NETS`: "laid out in the order their nets
give (…)"), and `order` and `keepOrder` in the result let a second layout of the same call (a
recipe's goals) use that order again.

Measured over every recipe with its parts shuffled (`test/layout-order.test.js` keeps a sample of
fourteen, three seeded shuffles each): where the order given fails, one of the two ends `DONE`,
except `esp32-distance` (on the double board only the orders with the divider before the DevKit and
the sensor after it end `DONE`; the test names it). The bench is unchanged: every spec of it ends
the same, with the same placement, since all of them end `DONE` in their own order. A layout that
fails and recovers costs its failed tries: 4.3 s for the measured case above (3.2 s of it the order
given failing), against 0.6 s with the resistor listed before the buzzer; about 9 s for the transistor
variant of that circuit with its fix (nine parts and a board). Over every recipe shuffled three
times: 0.26 s on average where the order given works, 2.3 s (at most 7 s) where it fails.

### What layout tries before CHANGES (since 2026-11-20)

The same spec always gives the same circuit, so sending it again does not help; what helped the
assistants who got `CHANGES` was a trial a person would make: list another part first, or put the
circuit on the larger board, **laid out again on the circuit already made** (every part first tries
the holes it has there, as a second layout of a target does). `inAnyOrder` now does that itself
before it answers `CHANGES` (`withTrials`), from its best try so far, each trial with at most
`TRIAL_TRIES` tries of the relayout loop, in this order, and keeps the first that ends without
`CHANGES` (else the best by the same rank):

1. **the orders the nets give again**, from the best try (`LAYOUT_ORDER_FROM_NETS`);
2. **the double board**, when a development board (a module with GPIO: an UNO, a DevKit) is named by
   a blocking item with another part (it covers it or a strip of it) and the spec does not name its
   board: in the order given, then in the orders of the nets (`LAYOUT_TRIED_DOUBLE`,
   `LAYOUT_TRIED_DOUBLE_ORDER`: "placed on the double board … because U1 covered U2 on one board");
3. **the tallest parts first**, then **the widest** (by the body on the best try's drawing; a
   development board and a part lying beside the board are not moved), with the layers starting
   from them (`LAYOUT_TRIED_TALLEST`, `LAYOUT_TRIED_WIDEST`).

Nothing electrical changes and nobody is asked; the answer carries one note saying what changed
from the spec as written. A trial runs only while the budget allows. When the answer is still
`CHANGES`, every ✖ line is followed by the one spec change the kit would try next (`next` on the
item: the first trial the budget left, else the double board when a development board is named
and the circuit is not on one, else listing the hidden part, then what hides it, first; else
"move it with suggest"), and a line says what was tried (`layout.tried`).

Measured on the three specs assistants got `CHANGES` for (`test/layout-trials.test.js`, load 2–3
on a four-core machine; before: `CHANGES` in 14, 38 and 35 s): a jumper under an ultrasonic module
`DONE` in 20–27 s (the orders of the nets from the best try); a seven-segment counter with a button
`DONE` in 36 s (the same); an UNO covering half of a 74HC595 `WARNINGS` (the shift register is not
simulated) in 32 s, on one board, by the orders of the nets before any trial (with the second search
above, "What it hides"; before it, the double board trial solved it in 1.3 s). The bench is
unchanged: every spec of it ends `DONE` in its own order, so no trial runs.

### Size and budget: calculate first, never run away (since 2026-11-20)

**The size, before placing.** `estimateSize` (in `autoLayout`, after the spec is valid; also with
`--check`) bounds from below the columns the spec takes, from its parts and nets alone, in well
under a second: a strip holds pins of one electrical net, so a net without a rail needs a strip for
every five pins and a pin in no net one of its own (`sides` strips per column: 2, or 4 on the double
board); a chip across the channel (a DIP) takes its columns there whole. Against the columns the
board can grow to (`LIMITS.boardColumns`, 600, on `auto` and `double`; a fixed board's own):

- more than the board: `STATUS: FIX_SPEC`, exit 1, nothing created, one line with the numbers
  (`LAYOUT_TOO_LARGE`: "about 1600 columns needed, 600 available (401 parts). About 150 parts fit
  one board: split it into two or more circuits");
- it fits, but one try of the search takes longer than the budget (`SECONDS_PER_PART`, 0.12 s per
  part on the board, measured): a first note says so (`LAYOUT_SEARCH_LONG`) and it tries anyway.

It is a bound, not a guess of the layout: it never refuses what the search can place. Every recipe,
layout example and example circuit stays under half the board (`test/layout-size.test.js`).

**The budget.** `layout` takes a wall-clock budget: 60 s by default (`BUDGET_SECONDS`), CLI
`--budget <seconds>`, MCP `budget_s`, at most `LIMITS.layoutSeconds` (300; more is that, with a note
`LAYOUT_BUDGET_CAPPED`). The search checks it before each part, each jumper, each try, each order
and each repair, and `suggest` before each candidate it measures. When it runs out the search stops
where it is and answers with the best try so far, `STATUS: CHANGES`, and one line: "The search
stopped at its budget of 60 s with its best try so far: N parts not placed, M nets not joined, K
review items open. The options: a larger budget … or a smaller circuit" (`LAYOUT_BUDGET`). The
circuit is still written (exit 2, as any `CHANGES`). The computed fix of its hazards is not searched
then (seconds of simulations, for a circuit still to fix). The budget is counted in work, not in
time: each placement tried (and each candidate `suggest` measures) counts 1 + the parts of the circuit
it is checked among, `WORK_PER_SECOND` (5000) for each second of budget, so the same spec stops at the
same place on every run and machine (a net of 250 resistors: about 45 s on a busy desktop, every part
placed, the same circuit twice; it took 84 s and placed 203, then 189). The wall clock is only the
outer guard: a machine slow enough to reach it first stops there, and the line says that cut is not
repeatable (`LAYOUT_BUDGET`, variant `clock`); the answer has `tried: { placements, max, byClock? }`.
The tests that are not about the budget lay out through
`test/layout-generous.js` (the largest budget, 300 s); only the budget's own tests use the default.

**What the search judges.** Each try is judged by its placement: the drawing and the nets (a
review with `electrical: false`). Hazards over states, doubts, the computed fix, the readings and
the Behaviour run are worked out once, on the circuit the whole search keeps (`judged` in
`src/layout.js`, its time in the answer's `ms`): they do not depend on where the parts sit, so they
never change which try wins. Judging every try and every trial so had made a large circuit twice
as slow (the laser and HC-SR04 on an UNO of `test/ultrasonic.test.js`: 29 s, 15 s again).

**The same spec, the same circuit.** Nothing in the search depends on the clock except the budget:
two runs of a spec give the same `circuit.json`, and a budget that ran out is the only source of
difference, which its line says.

**Memory.** A part is added without copying the circuit (`addOne`; `applyOps` copies all of it),
built alone on a board shared by the candidates of the same size (`builtAlone`), and the memo of the
geometry checks keeps at most `MEMO_STATES` (1500) states, and before each review only that try's
own steps. `buildCircuit` keeps its last two results by the circuit's text (one review built the
same circuit five or six times), and the inspector's raster keeps each part's cells in a typed list,
not a Set (`src/render/coverage.js`); both give the same figures (`test/recipe-sweep.test.js`, the visibility check).
Two hundred resistors in series on a 9 V battery: `DONE` in one try, about 6 s, 0.62 GB; through the
CLI, with its page, about 1.05–1.1 GB (below).

### Cost: what made large circuits slow (measured 2026-11-20)

Profiled with `node --cpu-prof` and counters in the search, on an UNO pin driving ten and twenty
LEDs with their resistors (on 0.12.1 ten took 59 s and ended
`CHANGES`, twenty did not end in 120 s, a similar spec ran out of memory):

- **Every candidate rebuilt the whole circuit.** `tryOps` called `buildCircuit` on all of it: every
  part's 3D geometry from the start (a resistor's lathe, an LED's dome) and the pairwise checks over
  every pair. Ten pairs: 2849 checks of about 15 parts each in 24 tries, 34 s of 92 s; the cost of a
  try grew with the square of the parts. Now the part alone, against the parts near it.
- **The memo kept a whole build per candidate**, keyed by the whole circuit written out: 2.9 GB of
  resident memory for ten pairs; `applyOps` also copied the whole circuit for each candidate.
- **The tries never converged.** Each try ended with three to nine parts or jumpers hidden in both
  views (`PART_HIDDEN`), the relayout loop moved one place per try, and the orders the nets give ran
  eight tries more each, one of them the very order already placed: 24 tries and the repair's
  `suggest` (each candidate a full drawing, 13 s). Now visibility is measured while placing once the
  first try shows the loop cannot settle it, and an order equal to the one already placed is skipped.

Measured on 2026-11-20, load average 1 to 1.5 (one process each, peak resident memory), before →
after:

| Case | Before (0.12.1 code) | After |
|---|---|---|
| UNO pin D8 → ten LEDs with 220 Ω, a program driving it | `CHANGES`, 24 tries, 64 s, 2.9 GB | `WARNINGS` (the pin over its current), 2 tries, 3.0 s, 0.4 GB |
| the same with twenty | did not end in 180 s | `WARNINGS`, 3 tries, 8.3 s, 0.5 GB |
| UNO + 74HC595 + eight LEDs (18 parts) | `WARNINGS`, 20 tries, 37 s, 2.8 GB | `WARNINGS`, 12 tries, 9.4 s, 0.6 GB |
| two hundred resistors in series on a 9 V battery | out of memory, exit 134 | `DONE`, 1 try, 5.6 s, 0.62 GB; the CLI with its page 8.8 s, 1.04–1.11 GB |
| every recipe (60) / with the layout examples (65) | 16.7 s / 20.9 s | 15.9 s / 17.7 s, all `DONE` |

Against the kit just before this work (with the doubts and the `Behaviour` line), the recipes went
from 26.5 s to 15.6 s and none got slower by more than 10 %. Placements: every recipe and layout
example is placed as on 0.12.1 except the four whose ground nets are now one (`uno-button`,
`encoder-dimmer-uno`, `clap-switch`, `esp32-both-headers.json`).

### Two boards: a DevKit on both headers (since 2026-10-31)

An ESP32 DevKit's PCB is about 11 holes wide with its headers 9 to 11 holes apart: on one board it
covers every free row of one header's strips. When the best try on `auto` (the default) ends with
`LAYOUT_PIN_COVERED`, `autoLayout` lays the spec out again on board `double`: two boards side by
side, the rail strips between them taken off, rows k–t on the back board and its rails `U-`, `U+`
([circuit-format.md](circuit-format.md#two-boards-side-by-side)). The note `LAYOUT_DOUBLE_BOARD`
says why. The DevKit goes across the joint (pin 1 in row j, its other row in p), each header with
free rows on its own board's strip. A spec may also ask for it with `"board": "double"` (or
`bb830x2`). The single-board answer is kept when the double board does not help either.

- **Rails.** `T+` and `T-` do not exist on a double board (they are the rails taken off): when
  layout moves a spec there itself, they become `U+` and `U-`, the back pair, in nets, supplies and
  labels (note `LAYOUT_DOUBLE_RAILS`); a spec that asks for `double` and names `T±` is refused
  (`NET_UNKNOWN_RAIL`, with the board's rails).
- **Ground.** With no − rail named in the nets, a ground net goes to both outer − rails, `B-` and
  `U-` (`LAYOUT_GROUND_TO_RAILS`), so each board's parts reach ground on their own side, and it
  takes the board's other ground pins of the same internal group (`GND2` for `GND`,
  `LAYOUT_GROUND_PARTNERS`): each − rail is then joined to the ground pin on its own header with a
  short jumper. Pins a board joins inside itself (`internal` in `src/parts/modules.js`) count as one
  group for the jumpers' spanning tree and for `checkNets` (`internalLinks`, `src/nets.js`).
- **Sides.** Four (`B`, `T`, `K`, `U`, step 2a): the parts of a header's nets go to that header's
  side, where its free rows are.

`examples/layout/esp32-both-headers.json` (an LED on D4, a button on D15, a potentiometer on D34,
a resistor on D23) comes out `DONE` in 2 tries, about 1 s; `examples/esp32-two-boards.json` is
that layout saved.

### Repairs and conventions (since 2026-10-20)

- **Ground to a rail.** Before laying out, a net with a ground pin (`GND`, `GND2`, `VSS`, `0V`, or a
  supply's `negative`) and no rail gets the − rail the other nets use, else `B-` (`groundToRail`),
  with a note `LAYOUT_GROUND_TO_RAIL`. It is what any breadboard does: one short jumper per strip
  instead of a chain along the board. The spec kept in the circuit is what was asked, without it.
- **Repair.** When the best try is still not perfect, `repair` takes it once more, jumper by jumper:
  a net left apart (`LAYOUT_WIRE_FAILED`) and each jumper named by a blocking item are routed again
  with `suggest` (lesson profile: it measures what a wire hides in both views). A repair is kept
  only when the score improves (nets, problems, blocking), with a note `LAYOUT_REPAIRED`. Since
  2026-10-31 it routes at most `REPAIRS` (4) jumpers, from 8 to 24 candidates each and without a
  via jumper (one search through a free strip took up to 16 s), and it is skipped when a pin is
  covered.

### Laying out again: an existing circuit (since 2026-10-20)

`layout` keeps what it was asked in the circuit, as `spec`: the nets (pin names already resolved), the
supplies that name pins, and the ids of its own jumpers (`spec.wires`). With it:

- **`review` checks the connections** of every circuit that has a `spec`, also after later changes by
  hand: a net no longer joined blocks (`SPEC_NET_MISSING`), two joined block too (`SPEC_NETS_SHORTED`).
- **`layout` on an existing target lays it out again** as one revision (remove every part, set the
  fields, add the new ones: `relayoutTarget`), so `undo` brings the old layout back. What is not
  given comes from the circuit (`specFromCircuit`: its parts without holes and without layout's
  jumpers, the kept nets and supplies, board, clearance, title, labels, page). Each part and jumper
  **first tries the holes it already has**, so adding an LED moves nothing else (measured on the 555:
  a second LED and its resistor, every other part where it was). `expect_revision` guards it.
- A `rename` operation renames the part in the spec too. A circuit without `spec` (made by hand) is
  laid out again only when the call gives its nets (`LAYOUT_NO_SPEC` otherwise); its wires are then
  left out, since the nets say what they join.

**Applying the kit's fix** (`layout <target> --fix`; the MCP tool's `fix: true`; since 2026-11-16).
On a circuit made by `layout`, the kit takes the fix its review prints for the circuit as it is
(`To fix it`, [simulation.md](simulation.md#the-fix)) and lays the circuit out with it as one
revision (`fixRequest` in `src/layout.js`, `specWithFix` in `src/fix.js`): `set`, the resistor's
new value (and the recipe's value, for a recipe circuit); `add-series`, a new resistor with the
next R number of the circuit between the pin and the net it was on (`["U1.D10", "R3.1"]`,
`["R3.2", "BZ1.1"]`), listed just before the part it is in series with; `swap`, a part in
backwards turned round (its two leads exchanged in the nets); `swap-supply`, a supply's leads
exchanged (a bench supply with no rails of its own gets the board's, written the other way round;
a battery part, its two leads in the nets). The answer is any `layout`'s, with one line more
before `STATUS:`: `Applied the fix: R3 = 200 Ω in series with BZ1.` (`Arreglo aplicado: R3 = 200 Ω
en serie con BZ1.`), `Applied the fix: turned BZ1 round (its 1 and 2 swapped).` or `Applied the
fix: swapped the leads of V1 (its + and −).`; `--dry-run` makes it a trial; `undo` brings
the circuit (and its warning) back. The kit never applies a fix by itself, only on this request.
Where there is nothing to apply it says so and changes nothing: no hazard (`LAYOUT_FIX_NONE`, not an
error: exit 0), no computed fix (`LAYOUT_FIX_NO_FIX`: "The kit has no computed fix for this."), a
circuit without `spec` (`LAYOUT_FIX_NO_SPEC`), a spec or values given too (`LAYOUT_FIX_AND_SPEC`);
the last three exit 1 (the MCP tool: an error).

So the spec is the desired state: a change of connections is new nets and `layout` again; values,
descriptions and fine touches stay operations (`apply_ops`).

### The answer

`{ status, circuit, placed: [{ id, type, pins, rails, shared }], wires, columns, problems, sequence,
check, review, tries, solved?, advice?, readings?, programs?, changeable?, ms }`; `formatLayout` writes it for the CLI
and the MCP tool (texts `layout.*` in `src/i18n/`).

After the review's verdict and its hazards (⚠), the hazard lines of the review itself: the kit's
computed fix of the hazards (`To fix it: …`, or "The kit has no computed fix for this."; JSON
`review.fix`, `review.noFix`), what to do about them, and, when the circuit was built, the
`Checked` line: what the hazard check covered for this circuit and what it did not
([simulation.md](simulation.md#the-fix); JSON `review.checked`):

```text
As wired, this would damage:
  ⚠ warning: U1.D10 carries 88.3 mA, more than its maximum 40 mA: the pin can be damaged, with D9 + D10 high.
To fix it: a 200 Ω resistor in series with BZ1 brings U1's D10 to 19.4 mA (maximum 40 mA).
Keep it if showing the failure is the point. Say so to the user before changing anything.
Checked: at rest, 3 program outputs. Not checked: peaks while switching, combinations of program outputs.
```

When the circuit was built (`DONE` or `WARNINGS`, a new circuit or `layout` again on one), the answer
also says what a reply needs, so one call is enough and every number and option an assistant repeats
comes from the kit (`src/layout-answer.js`). After the review's lines and before the page and
`STATUS:` lines:

```text
Solved: R1 = 470 Ω (E24) for D1 at 15 mA: 15.2 mA simulated, 2 % over (next values: 430 Ω 16.6 mA · 510 Ω 14.1 mA)
Worth checking: D1 is at 107 % of its rated 20 mA with R1 = 330 Ω; R1 = 360 Ω would give 19.7 mA.
Readings (at rest, a model): supply 9 V · D1 20.6 mA, brightness 103 % of 20 mA
Program U1 (Arduino sketch):
  // Blink: D13 on for half a second, off for half a second.
  …
Can change (layout with the recipe and values): R1 = 330 (current-limiting resistor) · D1 = green · V1 = 9 V [1.5…15] · D1 current (a goal: {"D1":{"current":"15mA"}})
```

- **Solved** (`solved: [{ id, goal, target, values, result, error, hazard, reachable, neighbours, kept?, when? }]`):
  only when the call gave a recipe's goal ([recipes.md](recipes.md#goals-a-result-instead-of-a-value)):
  the standard values chosen, the result the simulator gives with them, how far from the goal and on
  which side, the neighbouring values with their results, `out of reach` when no standard value in
  range gets there. The two lines above never come together: the first is one call's, the second
  another's.
- **Worth checking** (`advice: [{ id, goal, value, rated, knob, suggest }]`): only with no goal in the call, for a
  recipe circuit with `STATUS: DONE` and its readings shown, whose part with a goal runs above its
  rated value: by how much, and the standard value that would bring it nearest to the rating without
  passing it. Information only: nothing is changed.
- **Hard to see** (`review.hidden: [{ part, visible, by }]`): a part (not a jumper) under 50 %
  visible in every view layout kept, one line each with its best view's share and what covers it.
  Information only: it does not change the status (the review's own rules still block a part hidden
  in every view of a lesson).
- **Readings** (`readings: { sources: [{ id, kind, voltage, current }], parts: [{ id, kind, current,
  brightness? }] }`): the simulator's DC point, the one `simulate` prints. The sources first (a
  supply, a battery by its id, a board's USB; each once), then the parts whose job is to be driven: LEDs (current and
  brightness), then buzzers, motors, relay coils and lasers. At most four parts in the text, then how
  many more `simulate` lists. A circuit with none of those (a divider, a Zener regulator) gives instead
  the voltage of each net that is not a rail, named by its pins (`supply 5 V · R1.2 = R2.1 3.33 V`;
  `nets: [{ pins, voltage }]`), at most four. Left out when the circuit has no source, the DC point cannot be solved,
  a board runs a program (the program decides what is lit, a rest point at time zero would mislead),
  a supply is a generator (the signal is the point, not its rest value) or a timer is wired as an
  astable (it never rests: its TRIG and THR share a net with a capacitor, and its DIS or OUT is on that
  net or one resistor from it, as in the `555-astable` recipe; a timer wired as a monostable or a
  detector keeps its readings), and when the page hides the
  results (`page.simulation` or `page.results` false: a value a learner must predict first).
- **Program** (`programs: [{ part, text, truncated, file?, omitted? }]`): each board's sketch as it
  is stored (the text, or the `.ino` file in the circuit's folder, beside `circuit.json`, read only there), each line
  indented two spaces. Past 80 lines or 4 000 characters, the first 40 lines and a line saying how
  many were left out and where the whole text is. Every line break a reader may see (`\r`, `\u2028`
  and the like) ends a line there too, so no line of a sketch can pass for the `STATUS:` line.
- **Can change** (`changeable: [{ id, field, value, role?, min?, max?, choices? }]`): for a circuit
  made from a recipe, what the recipe accepts, with the value the circuit has now, its role, and its
  choices (`[a | b]`) or range (`[min…max]`); a program is `(sketch)`, never its text. The same limits
  as `catalog <recipe>` prints. Its goals come last (`{ id, goal, set, example }`), each with the
  `values` that asks for it.

**A trial** (`--dry-run`; the MCP tool's `dry_run: true`, the word `apply_ops` uses): everything
above, on the circuit as it would be after the call (a new target, or an existing one laid out
again), with the same answer and `STATUS` (whose words say it was a trial: `DONE · as tried, the
circuit would be ready … nothing was saved`, and `WARNINGS` ends `This was a trial … nothing was
saved`), and nothing written: no circuit file, no history, no page,
no revision, no outputs folder; in an MCP host with the viewer no board is shown (as `try_ops`). Its
last line before `STATUS:` says so: `Trial: nothing was saved.` (`Ensayo: no se guardó nada.`); the
page line is left out. It is how an idea the kit did not compute (a fix of an assistant's own) is
tried before it reaches the circuit. A trial that ends `CHANGES` says what it is in its `STATUS`
line (`as tried, the circuit would be left with … items marked ✖ above (nothing was created)`), not
that a circuit was created. `check_only` / `--check` still checks only the spec.

`status` is the one verdict of the whole answer, and the text ends with it in a line of its own, so
a caller (above all a small model) that reads only the last line knows what to do:

| `STATUS:` | Means | Next |
|---|---|---|
| `DONE` | every net is there, nothing failed to place, the review approves | report |
| `WARNINGS` | built and the nets are right, but each ⚠ line above must be told to the user before saying it works: a part that would be damaged as wired (a hazard), or something the kit cannot confirm works (a doubt, under "The kit cannot confirm these work": a part not simulated, a program that does not run, a relay that may not pull in, a button across joined pins, a warning of the simulation; [simulation.md](simulation.md#what-it-could-not-tell-doubts)); the review is approved with warnings | tell the user each one first, in plain words; keep the circuit as asked unless they want a change; for a hazard offer the kit's fix (`To fix it`), or with none try an idea with `--dry-run` first |
| `CHANGES` | created, but a net, a placement or the review left something (✖); in a trial nothing was created | fix only those, with `suggest` and `apply_ops`, then `review`; after a trial, try another idea or apply this one |
| `FIX_SPEC` | nothing created: the spec has errors | fix every ✖ and call again |
| `SPEC_OK` | `check_only`: the spec is consistent | call again without it |

Before 2026-10-20 the text ended with the review's verdict, which could say APPROVED with a net
missing. The CLI exits 0 for `DONE` and `WARNINGS` (1 for `FIX_SPEC`, 2 for `CHANGES`).

## The numbers that steer it

| Constant | Value | What it does |
|---|---|---|
| `SPAN` | 8 | columns past the cursor where a part looks for room |
| `TALL` | `TO-220`, `ams1117-module` | three-in-a-row packages that go in row b/g; their way to the rails is kept in sight (`SHADOW_COST`) |
| `KNOBS` | `pot-vertical` | packages with a knob towards the front: they lean to T |
| `HELD_UP` | `TALL` and `KNOBS` | bodies held up off the board: leads and jumpers pass below their box |
| `BESIDE` | `switch`, `module`, `battery` | bodies off the board: only their holes move the cursor |
| `boardSides(spec)` | T: j…f, B: a…e (double: also K: k…o, U: t…p) | rows of each half, from the rail (or the joint) inwards; from `src/board/board.js` |
| `PALETTE` | orange, green, yellow, blue, white, violet | jumper colours of nets without a rail |
| `CROSS_WEIGHT`, lean, `SIDE_SLACK` | 8, 12, 10 | side assignment: a net across the channel, an element off its lean, columns of imbalance allowed for free |
| `JUMPER_COST`, `CURSOR_COST` | 10 mm, 0.5 mm per column | a candidate's cost: each jumper it will need, its distance from the cursor |
| `EDGE_ROW_COST`, `SHADOW_COST` | 5 mm, 25 mm | lying along the row by the rails; enclosing a tall part's way to its rail |
| `MAX_TRIED` | 16 | cheapest candidates tried before those from the cursor on, and then `suggest` |
| `PAIRS_PER_GROUP`, `JOIN_TRIES` | 40, 40 | jumper pairs measured per pair of groups; rejections before a net gives up |
| `OVER_COST`, `OVER_MARGIN` | 12 mm, 0.3 mm | a jumper's cost per body it crosses; a jumper ending at a body's edge does not cross it |
| `TRIES`, `REPAIRS` | 8, 4 | relayouts at most; jumpers the repair routes again at most |
| `TRIAL_TRIES` | 2 | tries of the relayout loop each trial before `CHANGES` gets ("What layout tries before CHANGES"); the trials that worked took one or two |
| `SEEN_SHARE` | 75 % | a place that leaves a part under this share in its best view is used only when no other is free of it (`src/layout-sight.js`; the review blocks under 70 %) |
| `MEMO_STATES` | 1500 | states the memo of one layout keeps |
| `BUDGET_SECONDS`, `LIMITS.layoutSeconds` | 60 s, 300 s | the search's budget by default, and at most |
| `SECONDS_PER_PART` | 0.12 s | one try per part on the board, for the note that a spec is beyond the budget |
| cursor start | 2 | first column used, on each half |
| `clearance` | 1 mm (spec default) | gap between bodies; 3 for a roomier lesson |

## Measured (`npm run layout-bench`)

| Spec | 2026-10-18 | 2026-10-20 |
|---|---|---|
| `regulator-led.json` (4 parts, 4 nets) | approved · 4 tries · 0.3 s | approved · **1 try** · 0.1 s |
| `two-rail-supply.json` (10 parts, 10 nets: a two-rail lesson supply) | approved · **8 of 8** tries · 1.5 s | approved · **1 try** · 0.3 s |

On 2026-10-18 what blocked was only visibility: the lesson profile took a part as hidden in every
view as soon as it was below 85 % visible in each (the inspector's note threshold), and counted two
parts covering it in one view as two views. Since 2026-10-20 it blocks when the part's **best view**
shows less than 70 % of it (`hiddenBelow` in `PROFILES.lesson`), counted per view. A 555 seen 73 %
from the front and 69 % from the back no longer blocks; it reads well. A part hidden in one view
but seen well enough in another is advice: `review` lists it as a note (since 2026-11), never as a
warning beside an APPROVED, so `review` and `layout` give one verdict for one circuit.

Four more lesson circuits tried on 2026-10-20: an NPN switch, a potentiometer divider and a 555
astable come out approved at the first try; an ESP32 DevKit with a button and an LED was left with
its ground pin apart, since the board covers that strip (limit 6 below).

Since 2026-10-26 the bench also runs the fifteen recipes with their default values, and a recipe
fails the bench unless it ends in `DONE`: all fifteen do, in 30 to 520 ms, at the first try except
`mosfet-switch` (2 tries) and `555-astable` (3). Two recipes needed the algorithm, not the recipe:
the ESP32 ones (the board rule and the waiting group above); one needed the recipe:
`bridge-rectifier` keeps its DC side off the rails and its filter capacitor last, so any usual
value (100 µF to 2200 µF) leaves the jumpers in sight.

On 2026-10-31 the placement changed (sides across the channel, scored candidates, one cursor per
half, jumpers as a spanning tree; [PLANNING.md](../../PLANNING.md)). Against the bench of that morning
(`npm run layout-bench -- --compare`): all 25 recipes and the two older specs still `DONE`, and
`uno-many-pins.json` (seven UNO pins in nets) and `opamp-stage-chain.json` (two LM358 stages) now
`DONE` too; jumpers 139 → 132, wire 2154 → 1711 mm, nets across the channel 24 → 20, the longest
case 1.1 s (it was 8–10 s). `esp32-both-headers.json` still needs a wider board, but it says so in
one try, 0.5 s (it was 19 s), on a board of 36 columns (it was 54). Holes used on each half
(T/B) before → after, for the recipes that changed most: `555-astable` 21/10 → 11/17,
`opamp-comparator` 9/26 → 23/5, `lm393-comparator` 7/31 → 26/6, `uno-button` 4/13 → 16/2,
`two-rail-supply.json` 15/13 → 3/27.

## Changing the algorithm

1. **Measure first**: `npm run layout-bench` and keep the output. Add the spec of any real circuit
   that came out badly to `examples/layout/` (a spec, not a circuit: `parts` without pins, `nets`),
   so it stays a regression case.
2. Change `src/layout.js`. Where each kind of change goes:
   - a new part kind or a better place for one → a branch of step 2b (the `kind` chain: `beside`,
     `board`, `inline`, `span`, `footprints`) or the cost (`costOf`); a part kind without a rule
     already works through the `suggest` fallback, only slower and less tidy;
   - which half a part goes in → step 2a (the elements in `layoutOnce`, `src/layout-sides.js`);
   - the order of parts → step 1 (`layer`, `order`);
   - what counts as acceptable while placing → `tryOps` and `blocking`;
   - jumpers → `pairs` (cost) and the Kruskal loop of step 3;
   - when to give up or what to forbid → `autoLayout` (`score`, the victim choice, `TRIES`).
3. `npm run layout-bench` again: every spec still APPROVED, and compare tries, jumpers, columns and
   time. Then `npm test` (`test/layout.test.js`: placement, nets check, names, one-pass validation,
   unknown fields) and `npm run test:mcp`.
4. Write down why in the decision log of [PLANNING.md](../../PLANNING.md) and
   [planeacion.md](../es/planeacion.md), and update this page and its Spanish twin.

### Measuring a change

`scripts/layout-metrics.js` measures what a layout produced, from the holes only (no clock):
parts and jumpers, `wireLength` (mm, straight between each jumper's two holes), the columns used
(`min`, `max`, `span`) and the board's, the holes used in the back half (`T`, rows f–j), the front
half (`B`, rows a–e) and the rails, `channelCrossings` (asked nets with pins in both halves),
`tries`, `ms`, and the count of blocking items and problems.

- `npm run layout-bench -- --save [file]` writes the metrics of every case (with the date and the
  Node version) to a baseline: `.claude/state/layout-bench.json` by default, which is not in git
  (`.claude/state/` is ignored), so each clone keeps its own.
- `npm run layout-bench -- --compare [file]` runs again and prints, per case, what changed against
  the baseline (jumpers, wire length, column span, holes, crossings, tries, time, status) with its
  sign, the cases new or missing, and a totals line (jumpers, wire mm, crossings, cases `DONE`,
  ms). Time is compared since 2026-11-20 (before and after a change to the search's cost); on a
  machine shared with other work it is noisy, so compare at the same load. With spec files as
  arguments, put them before the flags; `--budget <seconds>` gives each layout that budget.
- A spec in `examples/layout/` may carry `"bench": { "expect": "changes", "why": "…" }`: a case the
  algorithm cannot solve yet. The bench removes the key before laying out, prints the case as
  `EXPECTED CHANGES` and does not count it as failed; everything else must be `DONE` for exit
  code 0. When such a case starts to end `DONE`, remove its `bench` key. Today: none
  (`esp32-both-headers.json` ends `DONE` on two boards since 2026-10-31).

The MCP server reloads the kit when its code changes, so the agents use the new algorithm on their
next call.

## Known limits and where to improve

In order of what would pay most:

1. **Visibility is measured place by place only for large circuits, and the first place by cost wins
   when none is free of it** (since 2026-11-20, "What it hides"). A better fallback (the least
   hidden, without a strange place far away: tried, it made `uno-seven-segment` end `CHANGES`) would
   make more first tries pass.
2. **A long circuit's page and review take most of its memory.** For two hundred resistors (a board
   400 columns long) the page alone peaks at about 0.6 GB (two interactive views, 17 MB of HTML),
   and the CLI process at 1.04–1.11 GB: the drawings' geometry is garbage the engine collects late.
   A coarser raster for wide frames was measured and saved nothing.
3. **The loop forbids one place at a time** and starts over. With several blocking items it can
   still spend its tries in one area; forbidding a small region, or retrying only the parts after
   the victim, would converge faster.
4. **One source, two lines.** The layers start from one part, so a circuit with two inputs or a
   feedback loop is placed in the order given after the first branch (the orders the nets give are
   tried only when it fails); the cursors never go back, so
   a long circuit grows in length on its two halves, with no third line of stages.
5. **Side balance is soft.** A circuit whose rails are all on one half stays there (it is the
   cheapest); the other half fills only when a half would be more than `SIDE_SLACK` columns longer
   than the other, or when the nets ask for it.
6. **The joint of the double board is assumed.** One empty pitch between rows j and k (each main
   block ending one pitch past its outer row): measure two real boards and change `junction` in
   `doubleBoard` (`src/board/board.js`) if it differs. Jumpers between the two boards' headers
   still arch over the DevKit when a net needs both (three in the bench case).

## See also

- [agents.md](agents.md): how the layout agent uses it (step 0 of its loop).
- [agent-interface.md](agent-interface.md): `suggest`, operations and the review it relies on.
- [code-map.md](code-map.md): where `layout.js` sits among the rest.
