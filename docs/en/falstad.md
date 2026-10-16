# Falstad: open the circuit there, and compare both simulators

*[Español](../es/falstad.md)*

[Falstad's CircuitJS](https://www.falstad.com/circuit/) is the most used in-browser circuit
simulator for learning. The kit uses it in two ways:

1. **Open in Falstad**: each circuit's live page has a link in its ⋯ menu that opens the same circuit in
   CircuitJS, as it is at that moment (sliders, push button, battery charge).
2. **Second reference**: a few test circuits run in both simulators with the same models, and a
   test checks that they agree.

Both use one exporter: `toFalstad(program, options)` in `src/sim/falstad.js`.

## The button

- Only in the live page, that is when the circuit asks for `page.results` or `page.flow`:
  Falstad shows every value, so it follows the same prediction rule as the results.
- Each tap exports again from the engine's state (`engine.program()`): what you see is what
  opens.
- When a part goes as an **equivalent** or is left out, **⚠ n** appears beside it; tapping it
  opens the list in a side panel. The export happens anyway.

| In the kit | In Falstad | Note |
|---|---|---|
| Resistor, capacitor, inductor (with its winding resistance), potentiometer, wire | The same element | — |
| Diode, LED (with its colour), bipolar transistor | The same element, with the kit's model (`34` and `32` lines) | — |
| Push button | Falstad's momentary switch: hold it with the mouse | — |
| Bench supply | Ideal source (with its internal resistance, if any) | Only if its current limit is acting |
| Signal generator | Falstad's source with the same wave, plus its output resistance | — |
| Battery | Source with its internal resistance in series | Yes: its charge does not run down |
| NTC, photoresistor | Fixed resistor at its value now | Yes: Falstad's sensors follow other curves |
| Buzzer | Its coil, as a resistor | Yes |
| Bridge rectifier | Four diodes with the same model | Yes |
| Darlington (TIP120, BC517) | Its two transistors and two resistors | Yes |
| Zener | Falstad's Zener, set to pass 5 mA at the same voltage | Yes: another knee |
| MOSFET | Falstad's MOSFET (same Vth and k) | Yes: sharp turn-on, no λ |
| Regulator (78xx, LM317) | Nothing | Yes: Falstad's LM317 is a subcircuit only its XML format can bring in |
| Chips and boards | Nothing | Yes: the kit does not simulate them yet |
| Header pins | Nothing | — |

### How it looks in Falstad

As a textbook schematic (`src/sim/falstad-layout.js`):

- Every net is a **row**, a horizontal wire, ordered by its DC voltage from the kit: the highest
  on top, ground at the bottom. Current flows down the page.
- Two-lead parts **stand** between the rows of their two nets. Parts in series (a net with only
  those two, one from above and one from below) share a column, end to end: the resistor and the
  LED in one line.
- The breadboard's **jumpers** join their groups into one net: they do not appear in the
  schematic (in exact mode they do, as their 0.05 Ω).
- A transistor takes two columns: collector and emitter (drain and source) go straight up and
  down to their rows; the base (gate) leaves to the left. A potentiometer stands centred on a half
  row, its wiper wired to the right.
- Columns start with the supplies and follow the circuit outwards. Then other orders are tried,
  moving one column at a time, keeping the one with the fewest crossings between the rows' wires
  and the parts, then the shortest wires.
- Each net carries a label with its breadboard group's name (`T+`, `9:f-j`): where it is on the
  board, and what the cross-check reads (`getNodeVoltage`). A ground symbol on the ground. Nodes
  only Falstad needs are named after the part with a number (`BT1.1`, between a battery's source
  and its internal resistance).

A circuit with floating nets (no DC voltage) still comes out correctly connected, but its rows
keep their order of appearance and it looks less tidy.

### Format details

- CircuitJS's text format (one line per element), which Falstad still imports. Its new format is
  XML; moving to it would bring the MOSFET's λ and the LM317.
- The link carries the text in `?cct=` with `encodeURI`: Falstad reads it with `decodeURI`, which
  leaves `:` and other reserved characters encoded. Names are escaped as Falstad does
  (`T+` → `T\p`).
- Falstad's thermal voltage (25.865 mV) differs slightly from the kit's (25.852 mV): emission
  coefficients are scaled so both curves are the same.
- The time step comes from the circuit's time constants, as in the live page.

## The comparison

The cases are circuit files in `test/falstad/cases/`. For each, the exporter writes the **exact**
version (`exact: true`):

- wires and the push button's contacts keep their small resistances (0.05 Ω, 0.1 Ω);
- the potentiometer goes as its two resistors (Falstad's slider moves in steps: 0.3 becomes
  0.302);
- capacitors and inductors integrate with backward Euler, as the kit does.

Falstad runs each case until the voltages settle and returns every label's voltage, stored in
`test/falstad/refs/<case>.json` with the exported text. Cases with a signal generator (`TRANSIENT`
in `test/falstad/cases.js`) run from t = 0 to `stop` and are recorded step by step (`ontimestep`)
with Falstad's step; the test runs the kit's transient with that same step and compares sample by
sample. Falstad sets each source to its value at the start of a step, the kit at its end: in exact
mode the generator is one step ahead (a 2π·f·h phase) so both use the same value. `test/falstad.test.js` compares the kit
with those references **offline**:

- with the same model, they must agree within 1 µV;
- cases where Falstad's model differs carry their tolerance and reason in `ALLOWED`;
- a case with no reference, or one run on another export (a model or the exporter changed), is
  skipped and says so: run it again.

Results on 2026-10-15:

| Case | Largest difference | Why |
|---|---|---|
| `voltage-divider` | 45 nV | same model |
| `led-resistor` | 41 pV | same model |
| `bjt-active` (2N3904, active region) | 99 nV | same model (Gummel–Poon reduced to Ebers–Moll) |
| `darlington-button` (TIP120, push button) | 8 pV | same model |
| `bridge-rectifier` | 58 pV | same model |
| `mosfet-saturation` (2N7000) | 57 mV | Falstad has no λ: 3 % less current |
| `pot-zener` | 67 mV at the Zener; 0 at the potentiometer | the Zener's knee |
| `rc-square` (transient, 952 steps) | 5 nV | same model |
| `rectifier-half-wave` (transient, 500 steps) | 1 mV | Newton's tolerance at the diode |

### Running the cases in Falstad

```bash
node scripts/falstad.js list                       # state of each reference
node scripts/falstad.js snippet [cases…]           # a function for Falstad's console
node scripts/falstad.js snippet --playwright -o f  # the same for a Playwright browser
node scripts/falstad.js save result.json           # store the references
node scripts/falstad.js url <case|file>            # the plain link (as the button)
```

The function opens or uses `https://www.falstad.com/circuit/circuitjs.html`, imports each case
with `window.CircuitJS1.importCircuit`, runs it until it settles and reads `getNodeVoltage`. It
returns the JSON for `save` and keeps it in `window.falstadResult`. `save` refuses a case whose
text is not today's export.

Adding a case: a circuit file in `test/falstad/cases/` (passing `check`), run it in Falstad, save.
If Falstad models it differently on purpose, its tolerance and reason go in `ALLOWED`.

## From the MCP and the command line

- `simulate` with `falstad: true` adds the link and the notes to its answer.
- `node scripts/falstad.js url <file>` prints the link.

## Adding a kind of part

Each device module may have `falstad(d, f)` ([adding-parts.md](adding-parts.md) §5). It gets the
compiled device (`d.pins`, `d.params`) and the builder `f`: `f.resistor`, `f.capacitor`,
`f.inductor`, `f.wire`, `f.diode`, `f.bjt`, `f.mosfet`, `f.pot`, `f.pushButton`, `f.voltage`,
`f.inner(id)` (a node of its own), `f.pin(d, name)`, `f.exact` and `f.note(code, params)`. An
equivalent always comes with its note (`falstad.*` in `src/i18n`). Without `falstad`, the part is
left out with the note `falstad.missing`.
