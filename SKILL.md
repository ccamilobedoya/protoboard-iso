---
name: protoboard-iso
description: Draw breadboard circuits as isometric SVG illustrations (real component sizes, colour-coded resistor bands, LEDs, capacitors, TO-220/TO-92 transistors, jumper wires) from a short JSON file, and check the placement (shorted strips, occupied holes, leads too short, overlapping bodies). Use when explaining or planning a circuit on a solderless breadboard, when someone asks to "see" or "draw" a breadboard build, or when preparing a wiring guide for an electronics lesson.
---

# protoboard-iso

Write a small JSON file that says which part goes in which hole. The kit does the rest:
geometry, colour bands, connectivity and checks. **Do not compute geometry or colour
codes yourself, and do not hand-write SVG for parts.** If something cannot be expressed
in the format, extend the kit (see `docs/en/adding-parts.md`) instead of patching the
output.

Requires Node.js 18 or newer. No npm dependencies.

## Workflow

1. Write the circuit file (format below; full reference in `docs/en/circuit-format.md`).
   Start from the closest file in `examples/` when one fits.
2. Check it: `node <skill>/bin/protoboard-iso.js check circuit.json --lang en`.
   Fix every `error` and every `warning` unless the warning is the point of the lesson
   (for example, showing a shorted strip on purpose).
3. Render it: `node <skill>/bin/protoboard-iso.js render circuit.json -o out.svg --view front`.
   Use `--view back` when parts hide each other from the front, and `--fit parts` for a
   close-up of the area with parts (best on phones).
4. Inspect it: `node <skill>/bin/protoboard-iso.js inspect circuit.json` (same options as
   `render`). It reports every lead's hole and position, how visible each part is and what
   covers it, and labels or leader lines on top of something. Fix what it reports before
   anyone looks at the picture; look at a picture only for style.
5. `--annotate pins,nodes,boxes,grid` (or `all`) adds hole names, connected groups, part
   boxes and full column numbers: use it to point at exact holes or to teach the strips.

## Prefer the MCP tools

If the `protoboard-iso` MCP server is connected (tools `list_circuits`, `inspect`, `query`,
`suggest`, `apply_ops`, `undo`, `history`, `render`, `catalog`, `create_circuit`), use them
instead of the CLI: typed inputs, short answers, same functions. The CLI commands below are
the fallback. Setup: `docs/en/mcp.md`.

## Changing an existing circuit

Never rewrite the file: use operations, dry run first (details: `docs/en/agent-interface.md`).

```bash
node <skill>/bin/protoboard-iso.js history <target>                       # what happened before
node <skill>/bin/protoboard-iso.js apply <target> --ops '[{"op":"move","part":"W1","pins":["a11","T-11"]}]' --dry-run
node <skill>/bin/protoboard-iso.js apply <target> --ops '…' --author claude --note "why" --expect-revision <n>
node <skill>/bin/protoboard-iso.js undo <target>
```

Ask, do not compute: `query <target> at c12 | node 9:a-e | free --near e10` answers what is
where; `suggest <target> --part '{"type":"resistor","value":"1k"}' --between 10:a-e,T-`
returns valid placements, best first, each with the `add` operation ready to dry-run.

Operations: `add`, `remove`, `move`, `set`, `rename`, `circuit` (schema: `schema/ops.schema.json`).

Done means `review <target>` says APPROVED (profile `lesson` for teaching layouts, `draft`
for quick sketches); it lists what must be fixed and what is only worth knowing.
The dry run tells what the change fixes and what it breaks; apply only when it introduces
nothing unintended. A target is a circuit file or a folder with `circuit.json`.

## Circuit file

```json
{
  "version": 1,
  "title": { "en": "LED with a resistor", "es": "LED con resistencia" },
  "board": "bb830",
  "netLabels": { "T+": "+5 V", "T-": "GND" },
  "parts": [
    { "id": "R1", "type": "resistor", "value": "330", "pins": ["T+9", "c9"] },
    { "id": "D1", "type": "led", "color": "red", "pins": { "anode": "e9", "cathode": "e10" } },
    { "id": "W1", "type": "wire", "color": "black", "pins": ["a10", "T-10"] }
  ]
}
```

- Holes: `a1`…`j63` (row letter + column); rails `T-`, `T+` (top), `B+`, `B-` (bottom)
  plus the column they line up with, e.g. `T+9`. Rail holes come in groups of five:
  columns 3–7, 9–13, 15–19… (6, 8, 14, 20… do not exist).
- Rows a–e of one column are connected; so are f–j. Each rail is one connection along
  the whole board.
- `pins` is a list in the part's pin order, or an object by pin name.

| type | fields | pins |
|---|---|---|
| `resistor` | `value` ("4k7"), `tolerance` ("5%", "1%"), `power` ("1/4", "1/2") | `1`, `2` (bands read from pin 1) |
| `capacitor` | `value` ("100n", "470u"), `kind` (`ceramic`, `electrolytic`), `voltage` | ceramic `1`, `2`; electrolytic `+`, `-` |
| `led` | `color` (red, green, yellow, blue, white, orange), `size` (5, 3) | `anode`, `cathode` |
| `diode` | `part` (1N4007, 1N4148, 1N5819) | `A`, `K` |
| `mosfet` | `part` (IRLZ44N, IRF520, IRF9540, 2N7000) | from the part, e.g. `G`, `D`, `S` |
| `bjt` | `part` (2N2222A, 2N3904, 2N3906, BC547, BC557, TIP120) | from the part, e.g. `E`, `B`, `C` |
| `wire` | `color`, `style` (`arc`, `flat`) | `1`, `2` |

Run `node bin/protoboard-iso.js parts` for the current list.

## Placement rules the checker enforces

- One lead per hole.
- Two leads of the same part in the same strip are shorted (warning).
- Axial bodies need room: a 1/4 W resistor needs its leads at least 4 holes apart.
- LEDs and ceramic capacitors: 1 to 3 holes apart. Electrolytics: 1 hole up to their
  lead spacing plus 2.
- TO-220 and TO-92: three neighbouring holes in a straight line. Pin 1 is on the left
  when you look at the printed face, so the hole order sets which way the part faces.
- Bodies must not overlap. For lessons, add `"clearance": 3` (mm) to the circuit file and
  spread the parts out: cramped layouts are hard to read and to build.

## Languages

Messages and labels: `--lang en` or `--lang es`. Titles can be `{ "en": …, "es": … }`.
