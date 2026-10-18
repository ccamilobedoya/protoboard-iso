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

**A new circuit without fixed positions: let `layout` place it.** Give the parts (no pins, in
signal order; a part number or alias is enough: `{"id": "U1", "part": "7805"}`) and the nets
(`[["U1.OUT", "R1.1"], {"pins": ["U1.GND", "T-"], "color": "black"}]`), and it places every part,
adds the jumpers, checks the nets and reviews, in about a second:
`node <skill>/bin/protoboard-iso.js layout <new folder> spec.json` (MCP tool `layout`; `--check`
only validates the spec). Then fix only what it lists as blocking, with the operations below.
How the algorithm works and how to improve it: `docs/en/layout.md`.

By hand, or to change a circuit:

1. Write the circuit file (format below; full reference in `docs/en/circuit-format.md`).
   Start from the closest file in `examples/` when one fits.
2. Check it: `node <skill>/bin/protoboard-iso.js check circuit.json --lang en`.
   Fix every `error` and every `warning` unless the warning is the point of the lesson
   (for example, showing a shorted strip on purpose).
3. Render it: `node <skill>/bin/protoboard-iso.js render circuit.json -o out.svg --view front`.
   Use `--view back` when parts hide each other from the front, and `--fit parts` for a
   close-up of the area with parts (best on phones). To embed the circuit in documentation,
   use the page `node <skill>/bin/protoboard-iso.js page <target>` (`out/<name>.html`, rewritten on
   every change): see `docs/en/embedding.md`.
4. Inspect it: `node <skill>/bin/protoboard-iso.js inspect circuit.json` (same options as
   `render`). It reports every lead's hole and position, how visible each part is and what
   covers it, and labels or leader lines on top of something. Fix what it reports before
   anyone looks at the picture; look at a picture only for style.
5. `--annotate pins,nodes,boxes,grid` (or `all`) adds hole names, connected groups, part
   boxes and full column numbers: use it to point at exact holes or to teach the strips.
6. Voltages and currents: add a source, either `"supplies": [{ "id": "V1", "voltage": 5 }]` (a
   bench supply on the rails, not drawn), a signal generator (`"kind": "generator"`, `waveform`
   sine/square/triangle, `frequency`, `amplitude` peak, `offset`) or a `battery` part (drawn
   beside the board: `format` AA/AAA/18650/9V/pouch, `cells` in series, `chemistry`, `charge`),
   and run
   `node <skill>/bin/protoboard-iso.js simulate circuit.json` (or `render --sim`). Never compute
   them by hand, and never show a value a learner is asked to predict. See `docs/en/simulation.md`.
   The page of a circuit with a source runs the simulation by itself, nothing to add: values of
   the tapped part, its oscilloscope, LEDs glowing, and the **Current** button in the bar (not
   pressed). For a value the learner must predict first, turn it off:
   `"page": { "simulation": false }` (or only `"results": false` / `"flow": false`).

## Prefer the MCP tools

If the `protoboard-iso` MCP server is connected (tools `list_circuits`, `layout`, `inspect`,
`query`, `netlist`, `suggest`, `apply_ops`, `undo`, `history`, `review`, `render`, `simulate`,
`catalog`, `create_circuit`), use them instead of the CLI: typed inputs, short answers, same
functions. The CLI commands below are the fallback. Setup: `docs/en/mcp.md`. To spend few calls:
`layout` for a new circuit; otherwise `catalog` once (compact), `suggest` with `parts` and `profile: "lesson"` for a chain of parts (later ones name
earlier pins, `"R1.2"`), one `netlist` to check the connections, then `review`.

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

- Holes: `a1`…`j63` (row letter + column; j at the back, a at the front); rails `T-`, `T+`
  (top, next to j), `B-`, `B+` (bottom, next to a)
  plus the column they line up with, e.g. `T+9`. Rail holes come in groups of five:
  columns 3–7, 9–13, 15–19… (6, 8, 14, 20… do not exist).
- Rows a–e of one column are connected; so are f–j. Each rail is one connection along
  the whole board.
- `pins` is a list in the part's pin order, or an object by pin name.

| type | fields | pins |
|---|---|---|
| `resistor` | `value` ("4k7"), `tolerance` ("5%", "1%"), `power` ("1/4", "1/2"; "3", "5", "10" = cement) | `1`, `2` (bands read from pin 1) |
| `capacitor` | `value` ("100n", "470u"), `kind` (`ceramic`, `electrolytic`), `voltage` | ceramic `1`, `2`; electrolytic `+`, `-` |
| `led` | `color` (red, green, yellow, blue, white, orange), `size` (5, 3) | `anode`, `cathode` |
| `diode` | `part` (1N4007, 1N4001…6, 1N5399, 1N5408, 1N4148, 1N5819, 1N5822, FR107, FR207) | `A`, `K` |
| `zener` | `value` ("5V1") or `part` (1N4728A…1N4751A) | `A`, `K` (in use, K to the + side) |
| `bridge` | `part` (KBP307, KBP2xx, KBP3xx) | `+`, `AC1`, `AC2`, `-` in one row, one or two holes apart (`e10`, `e11`, `e13`, `e14`) |
| `module` | `part` (ESP32-DEVKIT, ESP32-C3-SUPERMINI: place with `pin1`, `rowSpacing`; UNO, DESPI-C02: beside the board; DESPI-C02 also `rese` ("2.2" \| "0.47"), `panel`) | straddling: printed names, from pin 1 (`EN`, `5V`); UNO, DESPI-C02: `pins` of the pins in use only, e.g. `{ "D13": "j20", "GND": "T-27" }`, `{ "BUSY": "j20", "3.3V": "j24" }` |
| `mosfet` | `part` (IRLZ44N, IRF520, IRF9540, 2N7000) | from the part, e.g. `G`, `D`, `S` |
| `bjt` | `part` (2N2222A, 2N2907A, 2N3904, 2N3906, BC547…BC550, BC557, BC558, BC337, BC327, BC517, S8050, S8550, S9012…S9018, C1815, A1015, 2N5551, 2N5401, TIP120) | from the part, e.g. `E`, `B`, `C` |
| `potentiometer` | `value` ("10k"), `position` (0…1), `style` (`knob`, `trimmer`) | `1`, `W`, `3` (in a row) |
| `button` | `color`, `pressed` | `1`, `2`, `3`, `4`; across the centre channel (1–2 and 3–4 joined inside) |
| `switch` | `style` ("rocker" KCD1, "latching" 7 × 7), `on`, `wires`, `side`, `offset` | beside the board, only the pins in use: rocker `1`, `2`; latching `NC1` `C1` `NO1` `NC2` `C2` `NO2` |
| `ic` | `part` (NE555, LM358, LM324, LM393, UA741, NE5532, LM386, 74HC595, CD4017, ULN2003, ULN2803, PC817); place with `pin1` (`"e28"`: front row, reads from the front) | from the part, e.g. `GND`, `TRIG`, `OUT` |
| `regulator` | `part` (7805…7824, LM317, AMS1117-3.3 module; also "L7805CV", "LM317T"); `led` (module: "1k", "200", "none") | 78xx `IN`, `GND`, `OUT`; LM317 `ADJ`, `OUT`, `IN`; AMS1117 `IN`, `OUT`, `GND` (in a row) |
| `inductor` | `value` ("100u"), `dcr`, `current` | `1`, `2` (axial, colour rings in µH) |
| `thermistor` | `value` (R at 25 °C), `beta`, `temperature` (°C) | `1`, `2` |
| `ldr` | `part` (GL5528…), `light` (lux) | `1`, `2` |
| `buzzer` | (passive, 12 mm) | `1`, `2`, two or three holes apart |
| `header` | `count`; place with `pin1` | `1`…`n` along the row |
| `battery` | `format` (AA, AAA, 18650, 9V, pouch), `cells`, `chemistry`, `charge`, `voltage`, `switch`, `side` | `+`, `-` (it lies beside the board; it is a power source) |
| `wire` | `color`, `style` (`arc`, `flat`) | `1`, `2` |

Run `node bin/protoboard-iso.js parts` for the current list.

## Placement rules the checker enforces

- One lead per hole.
- Two leads of the same part in the same strip are shorted (warning).
- Axial bodies need room: a 1/4 W resistor needs its leads at least 4 holes apart.
- LEDs and ceramic capacitors: 1 to 3 holes apart. Electrolytics: 1 hole up to their
  lead spacing plus 2.
- Buttons and DIP chips straddle the centre channel (`suggest` finds the spots). A button
  turned 90° is always closed (`SWITCH_BYPASSED`).
- A battery lies on the table beside the board (`side`), its red and black leads in two holes
  (usually the rails, e.g. `T+3` and `T-3`). Two batteries on the same side overlap: give one
  another `side` or an `offset`.
- TO-220, TO-92, potentiometers and trimmers: three neighbouring holes in a straight line. Pin 1 is on the left
  when you look at the printed face, so the hole order sets which way the part faces.
- Bodies must not overlap. For lessons, add `"clearance": 3` (mm) to the circuit file and
  spread the parts out: cramped layouts are hard to read and to build.

## Languages

Everything the kit writes (messages, drawing labels, the page and its cards) comes in English
or Spanish. Choose it, in this order of priority:

1. asked for in the call: `--lang es` (CLI) or `lang: "es"` (any MCP tool);
2. the circuit's own `"lang": "es"` (set it when creating the circuit, or with
   `{ "op": "circuit", "lang": "es" }`): pages and drawings rewritten after each change stay in it;
3. the default: English (the MCP server uses `PROTOBOARD_LANG`).

Texts written in the circuit (`title`, each part's `description`) are either one plain string,
shown as it is in every language, or one per language, `{ "en": "…", "es": "…" }`, shown in the
language chosen (`check` reports a missing one). A part's `description` says how it is used in
this circuit and is shown directly in its card; leave it out when the learner should work it out
(the kit's own text on what the part is stays one tap away).
