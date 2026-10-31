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
| MCP | tool `layout` (`target`, `recipe` and `values`, or `parts`, `nets`, `supplies`; `board`, `title`, `netLabels`, `page`, `clearance`, `check_only`) |
| CLI | `node bin/protoboard-iso.js layout <new target> <spec.json \| -> [--check] [--json]`, or `--recipe <name> [--values '<json>']` (exit 0 done, 2 changes) |
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

- `parts`: no `pins`, in signal order (the order breaks ties, see step 1). A part is a type with
  its fields, or only a part number, module or alias (`"7805"`, `"KCD1"`, `"UNO"`, `"resistencia"`):
  `resolvePart` (`src/parts/resolve.js`) fills in the type.
- `nets`: each one a list of pin references (`"D1.K"`, case-insensitive pin names) and rails
  (`"T-"`, `"B+"`), or `{ pins, color }`. A pin alone (`["D1.A"]`) is fine: it is where a supply
  will connect. Two nets that share a pin or a rail are one net (`["T-", "B-"]` bridges the grounds).
- `supplies`: as in a circuit, except that `positive` and `negative` may name a pin; it becomes a
  free hole of that pin's strip once placed.
- `board` (`auto` by default: the elastic board that grows in length, or two side by side when a
  development board needs it, see [Two boards](#two-boards-a-devkit-on-both-headers-since-2026-10-31)),
  `clearance` (1 mm by default), `title`, `lang`, `netLabels`, `page`: copied into the circuit.

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
field is `on`), a net naming a part or a pin that is not there (with the pins it has), and a part
in no net (a warning). Any error → nothing is placed and every problem comes back together, so the
caller fixes them all in one round. `check_only` / `--check` stops here.

Pin names are read as people write them (`findPin`, `src/parts/pin-names.js`): the part's own name
first, ignoring case, then synonyms (`A`/`anode`, `K`/`cathode`, `VIN`/`IN`, `VOUT`/`OUT`,
`DISCH`/`DIS`, `THRESHOLD`/`THR`, `VDD`/`VCC`, `VSS`/`GND`, `3.3V`/`3V3`, `E`/`emitter`, `G`/`gate`…)
and GPIO numbers on a board (`GPIO4`, `IO4`, `4` → the DevKit's `D4`), only when exactly one pin
matches. The nets come back with the part's own names (`D1.K` → `D1.cathode`), so the steps below
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

**`tryOps` (the acceptance test).** Apply the `add` operation, rebuild the circuit **geometry only**
(`buildCircuit`: occupancy, lead lengths, body overlap, crossings, clearance; milliseconds, nothing
is drawn) and accept only if it adds no error and no new blocking problem compared to the circuit
before (`blocking` = errors, warnings and `TOO_CLOSE` notes). `FLOATING_PIN` is tolerated because the
jumpers come later. A place in `forbid` is skipped. The answers are remembered for the whole call
(by circuit and operation), so a relayout that repeats the first steps does not build them again.

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

So the spec is the desired state: a change of connections is new nets and `layout` again; values,
descriptions and fine touches stay operations (`apply_ops`).

### The answer

`{ status, circuit, placed: [{ id, type, pins, rails, shared }], wires, columns, problems, sequence,
check, review, tries, ms }`; `formatLayout` writes it for the CLI and the MCP tool (texts `layout.*` in
`src/i18n/`).

`status` is the one verdict of the whole answer, and the text ends with it in a line of its own, so
a caller (above all a small model) that reads only the last line knows what to do:

| `STATUS:` | Means | Next |
|---|---|---|
| `DONE` | every net is there, nothing failed to place, the review approves | report |
| `CHANGES` | created, but a net, a placement or the review left something (✖) | fix only those, with `suggest` and `apply_ops`, then `review` |
| `FIX_SPEC` | nothing created: the spec has errors | fix every ✖ and call again |
| `SPEC_OK` | `check_only`: the spec is consistent | call again without it |

Before 2026-10-20 the text ended with the review's verdict, which could say APPROVED with a net
missing. The CLI exits 0 only for `DONE` (1 for `FIX_SPEC`, 2 for `CHANGES`).

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
from the front and 69 % from the back no longer blocks; it reads well.

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
  the baseline (jumpers, wire length, column span, holes, crossings, tries, status) with its sign,
  the cases new or missing, and a totals line (jumpers, wire mm, crossings, cases `DONE`). Time is
  saved but never compared. With spec files as arguments, put them before the flags.
- A spec in `examples/layout/` may carry `"bench": { "expect": "changes", "why": "…" }`: a case the
  algorithm cannot solve yet. The bench removes the key before laying out, prints the case as
  `EXPECTED CHANGES` and does not count it as failed; everything else must be `DONE` for exit
  code 0. When such a case starts to end `DONE`, remove its `bench` key. Today: none
  (`esp32-both-headers.json` ends `DONE` on two boards since 2026-10-31).

The MCP server reloads the kit when its code changes, so the agents use the new algorithm on their
next call.

## Known limits and where to improve

In order of what would pay most:

1. **Visibility is still found mostly by the relayout loop.** A jumper pays for each body it
   crosses (step 3), and a candidate pays for enclosing a tall part's way to its rail (step 2b), but
   placement still does not know what hides what in the isometric drawing: an UNO's leads arching
   over the board, a long jumper across a half over a resistor, a tall LED in front of a low part.
   The loop finds them (one to five tries in the bench). A cheap estimate of each view (how tall a
   body is and what lies behind it), or measuring the visibility of the chosen candidate only,
   would make more first tries pass.
2. **Each candidate builds the whole circuit.** `tryOps` rebuilds every part's geometry to check
   one more; that is most of the time (the checks are remembered across tries, which helps the
   loop, not the first try). An incremental check (only what the new part touches) would let the
   algorithm try many more candidates in the same time.
3. **The loop forbids one place at a time** and starts over. With several blocking items it can
   still spend its tries in one area; forbidding a small region, or retrying only the parts after
   the victim, would converge faster.
4. **One source, two lines.** The layers start from one part, so a circuit with two inputs or a
   feedback loop is placed in the order given after the first branch; the cursors never go back, so
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
