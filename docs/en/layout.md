# Layout: the algorithm that places a whole circuit

*[Español](../es/montaje-automatico.md)*

`layout` turns a list of parts (without holes) and the nets that join them into a placed, wired
and reviewed circuit, in about a second, with no trial and error by whoever calls it. This page
explains how it works step by step, which numbers steer it, and how to change it without breaking
it. The code is one file, `src/layout.js` (about 500 lines); the design decision is in
[PLANNING.md](../../PLANNING.md) (2026-10-17).

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
- `board` (`auto` by default: the elastic board that grows in length), `clearance` (1 mm by
  default), `title`, `lang`, `netLabels`, `page`: copied into the circuit.

## The pipeline

```
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

### 2. Place each part (rules, checked by geometry only)

Two pieces of state move along: a **column cursor** (starts at 2) and the **half** of the board the
part goes in (`T`, rows f–j next to the top rails, or `B`, rows a–e next to the bottom ones). The
half is the one of the first rail the part's nets name, else the one of the part before it in a
net, else `B`.

Each rule builds a list of candidates (hole sets, best first); the first one that `tryOps` accepts
wins:

| Part kind | How it is recognised | Candidates |
|---|---|---|
| Off the board (switch, Arduino, e-paper adapter) | `resolve` answers `MODULE_PINS` | each lead in a free hole of the strip of its net (from the channel outwards), else a fresh strip at the cursor in row `e`/`f`, two columns apart. A switch keeps only the pins in use and their partners. |
| Development board over the channel (ESP32 DevKit, C3 SuperMini) | type `module` with a package placed by pin 1 | pin 1 in every row and column near the cursor, scored by the free holes each pin in a net keeps on its strip outside the board and its overhanging PCB; the best six are tried. A DevKit whose nets use one header lands with pin 1 in row `c`, leaving row `a` free (since 2026-10-26) |
| Three in a row (TO-220, TO-92, AMS1117 module) | package `inline`, three pins | three consecutive empty strips within `SPAN` columns of the cursor; tall ones (`TALL`) in row `b`/`g`, others in `c`/`h` |
| Two leads, a rail in one net (a capacitor or LED to ground) | package `span`, two pins, `max ≥ 2` pitches | upright: one lead in the rail, the other in the row next to it, on the strip of the part before it when that is on the same side, else on a fresh strip |
| Two leads, otherwise (a resistor in series) | package `span`, two pins | along a row: one lead on the strip of the part before it, the other `k`, `k+1` or `k+2` columns on (`k` = the package's minimum span), on an empty strip; then any two empty strips in the 2nd–4th rows from the rail |
| Anything else (DIP chip, button), or no candidate passed | — | `suggest` near the cursor (`limit: 1`, up to 24 candidates, no room reservation, no via jumper); if that fails too, `LAYOUT_PART_FAILED` with its reasons |

**`tryOps` (the acceptance test).** Apply the `add` operation, rebuild the circuit **geometry only**
(`buildCircuit`: occupancy, lead lengths, body overlap, crossings, clearance; milliseconds, nothing
is drawn) and accept only if it adds no error and no new blocking problem compared to the circuit
before (`blocking` = errors, warnings and `TOO_CLOSE` notes). `FLOATING_PIN` is tolerated because the
jumpers come later. A place in `forbid` is skipped.

After each part the cursor moves to two columns past its rightmost lead, or past the right edge of
its body for parts on the board, so stages never pile up; the elastic board grows with it
(`headroom: SPAN + 12` columns).

Why rows `b`/`g` for tall parts: measured, in rows c–e and h–j one side of their strips ends up
behind the body in one of the two views, so a hole that is free is still unusable.

### 3. Jumpers

For each net: the groups it touches (the strips of its placed pins, and its rails), sorted by
column. Each group not yet joined (union-find over the jumpers placed so far) is joined to a group
already in the net, with the **cheapest pair of free holes that passes `tryOps`**, all the joined
groups weighed together (since 2026-10-26; before, the nearest group by column was tried first):

- cost = straight length + 1 if the two holes are not in the same column (a straight jumper reads
  better) + `OVER_COST` (12 mm) for each body its line crosses seen from above (a jumper arches over
  what lies between its holes and hides it: a way round a chip, or to a farther strip of the net,
  wins when it is short); pairs shorter than two pitches are skipped (too short to see);
- rail holes only within 6 columns of the group (a jumper does not run along the board to reach a
  rail);
- the first 80 pairs per group are tried; none passes → the group waits until the rest of the net is joined
  (a rail is joined last) and is tried once more against all of it (since 2026-10-26: a button's
  ground strip that cannot reach the board's covered GND strip reaches the − rail instead); still
  none → `LAYOUT_WIRE_FAILED`, naming the nearest group by column (where the repair goes).

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
item names some parts; of those, the one **placed last** (`sequence`: parts, then jumpers) loses
its place: its `forbidKey` (`"<id> <pins>"`, or `"wire <holes>"` for a jumper, since jumper ids are
renumbered) goes into `forbid`, and the layout runs again from scratch. It stops when a try is
perfect, when no new place can be forbidden, or after `TRIES`. The best try is kept, by
`score = 100 × (nets wrong) + 10 × problems + blocking items`.

Laying out again is simpler and more predictable than patching a layout in place: one try takes
0.05–0.2 s.

### Repairs and conventions (since 2026-10-20)

- **Ground to a rail.** Before laying out, a net with a ground pin (`GND`, `GND2`, `VSS`, `0V`, or a
  supply's `negative`) and no rail gets the − rail the other nets use, else `B-` (`groundToRail`),
  with a note `LAYOUT_GROUND_TO_RAIL`. It is what any breadboard does: one short jumper per strip
  instead of a chain along the board. The spec kept in the circuit is what was asked, without it.
- **Repair.** When the best try is still not perfect, `repair` takes it once more, jumper by jumper:
  a net left apart (`LAYOUT_WIRE_FAILED`) and each jumper named by a blocking item are routed again
  with `suggest` (lesson profile: it measures what a wire hides in both views, and may go through a
  free strip, `VIA_WIRE`). A repair is kept only when the score improves (nets, problems, blocking),
  with a note `LAYOUT_REPAIRED`.

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
| `SPAN` | 8 | columns past the cursor where a part may look for room |
| `TALL` | `TO-220`, `ams1117-module` | three-in-a-row packages that go in row b/g |
| `BESIDE` | `switch`, `module`, `battery` | bodies off the board: only their holes move the cursor |
| `HALF_ROWS` | T: j…f, B: a…e | rows of each half, from the rail inwards |
| `PALETTE` | orange, green, yellow, blue, white, violet | jumper colours of nets without a rail |
| `TRIES` | 8 | relayouts at most |
| cursor start | 2 | first column used |
| jumper search | 40 pairs, rail holes within 6 columns, length ≥ 2 pitches | step 3 |
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

## Changing the algorithm

1. **Measure first**: `npm run layout-bench` and keep the output. Add the spec of any real circuit
   that came out badly to `examples/layout/` (a spec, not a circuit: `parts` without pins, `nets`),
   so it stays a regression case.
2. Change `src/layout.js`. Where each kind of change goes:
   - a new part kind or a better place for one → a branch of step 2 (the `if (beside) … else if
     (pkg?.inline …) … else if (pkg?.span …)` chain); a part kind without a rule already works
     through the `suggest` fallback, only slower and less tidy;
   - the order of parts → step 1 (`layer`, `order`);
   - what counts as acceptable while placing → `tryOps` and `blocking`;
   - jumpers → `pairs` (cost) and `join`;
   - when to give up or what to forbid → `autoLayout` (`score`, the victim choice, `TRIES`).
3. `npm run layout-bench` again: every spec still APPROVED, and compare tries, jumpers, columns and
   time. Then `npm test` (`test/layout.test.js`: placement, nets check, names, one-pass validation,
   unknown fields) and `npm run test:mcp`.
4. Write down why in the decision log of [PLANNING.md](../../PLANNING.md) and
   [planeacion.md](../es/planeacion.md), and update this page and its Spanish twin.

The MCP server reloads the kit when its code changes, so the agents use the new algorithm on their
next call.

## Known limits and where to improve

In order of what would pay most:

1. **Visibility is only partly in the placement check.** Since 2026-10-26 a jumper pays for each
   body it crosses (step 3), which took the 555 astable from 70 % to 100 % visible in its best view
   and from 3 tries to 1. Step 2 still knows bodies and leads but not what hides what in the
   isometric drawing, so tall parts in front (LEDs, electrolytics, regulators) hide low ones behind
   them and only the relayout loop (and the repair, for jumpers) finds it; the RESET-to-VCC jumper
   of a 555 still crosses the chip, as on any bench. A cheap estimate in `tryOps` (how tall the
   new body is and how close the low parts behind it are, in each view), or measuring visibility
   for the chosen candidate only (`inspect` on one part), would make the first try pass and free
   the loop for real conflicts.
2. **The loop forbids one place at a time** and starts over. With several blocking items it can
   spend all its tries on one area. Forbidding a small region, or retrying only the parts after the
   victim, would converge faster.
3. **One source, one line.** The layers start from one part; a circuit with two inputs or a
   feedback loop is laid out in the order given after the first branch. The cursor never goes back,
   so a long circuit only grows in length: there is no second line of stages.
4. **Two-lead parts with neither end on a rail and no part before them** fall back to any empty
   pair of strips near the cursor, which may be far from where they connect; the jumpers then make
   up for it.
5. **DIP chips and buttons** go through `suggest`, which works but is slower and does not know about
   the cursor's stages beyond `near`.
6. **Wide boards cover their strips.** An ESP32 DevKit across the channel covers 11 rows with its
   PCB: only one header's strips keep a free row (row `a` with pin 1 in `c`). Since 2026-10-26 the
   board is placed so the pins in its nets keep that row, which covers a circuit on one header
   (`esp32-led`, `esp32-button`). Nets on both headers (`3V3` and `D4`) still leave one side with no
   hole: reaching it through the board's other pin of the same name (`GND2`), or a second board
   width with the DevKit off the board, would fix it.

## See also

- [agents.md](agents.md): how the layout agent uses it (step 0 of its loop).
- [agent-interface.md](agent-interface.md): `suggest`, operations and the review it relies on.
- [code-map.md](code-map.md): where `layout.js` sits among the rest.
