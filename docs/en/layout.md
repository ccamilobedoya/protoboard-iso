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
| MCP | tool `layout` (`target`, `parts`, `nets`, `supplies`, `board`, `title`, `netLabels`, `page`, `clearance`, `check_only`) |
| CLI | `node bin/protoboard-iso.js layout <new target> <spec.json \| -> [--check] [--json]` (exit 0 approved, 2 changes) |
| Code | `import { autoLayout, validateSpec, checkNets } from './src/layout.js'` |
| Bench | `npm run layout-bench [-- spec.json …]` (runs `examples/layout/*.json`) |

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
column. Each group not yet joined (union-find over the jumpers placed so far) is joined to the
nearest group already in the net, with the **shortest pair of free holes that passes `tryOps`**:

- cost = straight length + 1 if the two holes are not in the same column (a straight jumper reads
  better); pairs shorter than two pitches are skipped (too short to see);
- rail holes only within 6 columns of the group (a jumper does not run along the board to reach a
  rail);
- the first 40 pairs are tried; none passes → `LAYOUT_WIRE_FAILED`.

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

### The answer

`{ circuit, placed: [{ id, type, pins, rails, shared }], wires, columns, problems, sequence, check,
review, tries, ms }`; `formatLayout` writes it for the CLI and the MCP tool (texts `layout.*` in
`src/i18n/`).

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

## Measured (2026-10-18, `npm run layout-bench`)

| Spec | Result | Jumpers | Columns | Tries | Time |
|---|---|---|---|---|---|
| `regulator-led.json` (4 parts, 4 nets) | approved | 2 | 30 | 4 | 0.3 s |
| `two-rail-supply.json` (10 parts, 10 nets: the course's M2 supply) | approved | 7 | 36 | **8 of 8** | 1.5 s |

On the first try both are geometrically right and every net is correct; what blocks is only
visibility (`PART_HIDDEN`: "R2 is 41 % visible; LED2 covers 59 % of it"). The loop fixes it, but the
two-rail supply needs every try it has: one more part of that kind and it would come back with
CHANGES.

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

1. **Visibility is not in the placement check.** Step 2 knows bodies and leads but not what hides
   what in the isometric drawing, so tall parts in front (LEDs, electrolytics, regulators) hide low
   ones behind them and only the relayout loop finds it. A cheap estimate in `tryOps` (how tall the
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

## See also

- [agents.md](agents.md): how the layout agent uses it (step 0 of its loop).
- [agent-interface.md](agent-interface.md): `suggest`, operations and the review it relies on.
- [code-map.md](code-map.md): where `layout.js` sits among the rest.
