# Circuit file format (version 1)

*[Español](../es/formato-circuito.md)*

Keys are in English, so the format is the same in every language.

```json
{
  "version": 1,
  "title": { "en": "LED with a resistor", "es": "LED con resistencia" },
  "board": "bb830",
  "view": "front",
  "netLabels": { "T+": "+5 V", "T-": "GND" },
  "parts": [ … ]
}
```

| Field | Required | Meaning |
|---|---|---|
| `version` | no | Format version, `1`. |
| `revision` | no | Set by `apply` and `undo`; do not edit by hand. |
| `title` | no | A string, or one string per language. Goes into the SVG `<title>`. |
| `board` | no | `bb830` (default) or `bb400`; or `auto`, an elastic board: the cross-section of a bb400 (rows a–j, four rails, the centre channel) and as many columns as the circuit uses, in steps of six; its holes never move as it grows, so a circuit can go from `bb400` to `auto` with `{"op":"circuit","board":"auto"}`. Not a real board: on the bench, join several. `double` (elastic) and `bb830x2`: two boards side by side for a wide development board, see [Two boards side by side](#two-boards-side-by-side). |
| `view` | no | Default view: `front`, `back`, `front-left`, `back-right`. The command line `--view` wins. |
| `clearance` | no | Minimum gap between part bodies, mm. Closer parts are reported as notes. Use 3 or more for teaching layouts. |
| `netLabels` | no | Text printed next to a rail, by rail id. A labelled rail counts as connected to a supply. |
| `lang` | no | Language of everything made from this circuit: drawing labels, the page, messages (`en`, `es`). A language asked for in the call (`--lang`, MCP `lang`) wins. |
| `supplies` | no | Simulation: where the power comes from, e.g. `[{ "id": "V1", "voltage": 5 }]` (between T+ and T-). A [battery](#battery) part is a source too. See [simulation.md](simulation.md). |
| `page` | no | The embeddable page. With a source the simulation runs by default; `simulation: false` turns it all off (a value to predict), `results: false` only the values of the tapped part (and the lit LEDs), `flow: false` only the Current button; `focus` (parts in focus when it opens), `start` (`dc` or `zero`: how the live simulation starts), `theme` (`auto`, the default, follows the system; `light` or `dark` fixes it; `?theme=` in the link wins), `controls` (a panel of sliders and buttons: part or supply, field, optional range and label), `tour` (a timeline: the name of a JSON file beside the circuit, read only from its folder, or the timeline itself; *See how it works* in the ⋯ menu plays it, see [stage-and-video.md](stage-and-video.md)). See [focus-and-flow.md](focus-and-flow.md). |
| `parts` | yes | List of parts. |

## Holes

- Main grid: row letter and column, `a1` … `j63` (`a1` … `j30` on `bb400`; rows k–t too on a
  double board, below).
- Rails: `T-`, `T+` (top: the back pair, next to row j), `B-`, `B+` (bottom: the front pair,
  next to row a), followed by the column the hole lines up with: `T+9`, `B-24`. On `bb830` rail holes exist at columns 3–7, 9–13, 15–19, 21–25,
  27–31, 33–37, 39–43, 45–49, 51–55, 57–61.
- Upper or lower case both work.

Connected groups: rows a–e of one column; rows f–j of one column; each rail along the
whole board.

Layout of `bb830`, from the back of the drawing to the front: `− +` (T rails), rows `j…f`, the
channel, rows `e…a`, `− +` (B rails), with column 1 on the left. Held upright with column 1
at the top, it reads `+ − a…j + −` from left to right, as on the maintainer's board.

### Two boards side by side

An ESP32 DevKit is 0.9" to 1.1" between its headers on a PCB about 11 holes wide: on one board it
covers every free hole of one header's strips. On the bench, two boards are clipped together along
their long edge with the rail strips between them taken off (most boards have detachable rail
strips), and the DevKit straddles the joint. Board `double` (elastic, like `auto`) and `bb830x2`
(two `bb830`) model that. From the back of the drawing to the front:

```text
U- U+  t s r q p | o n m l k  · joint ·  j i h g f | e d c b a  B- B+
```

- The front board is a single board without its back rails: rows a–j and rails `B-`, `B+` as usual.
- The back board's rows continue the alphabet away from the front: its rows a…j are k…t (strips
  `12:k-o` and `12:p-t`). Its rails, behind row t, are `U-` (outermost) and `U+`. There are no `T`
  rails: those are the ones taken off. A supply with no `positive`/`negative` goes to `U+`/`U-`.
- One empty pitch lies between rows j and k (`junction` in the board's spec, `doubleBoard` in
  `src/board/board.js`): it assumes each main block ends one pitch past its outer row, so the two
  blocks butted together keep one 0.1" lattice. **Measure your boards**: if the joint differs, the
  holes of the back board are off by that much.
- Nothing straddles the joint but a development board: a DIP or a button goes across a channel of
  either board. A DevKit with pin 1 in row j has its other row in p (`rowSpacing` 9): each header
  keeps free rows on its own board's strip (h…f and r…t). `layout` moves a circuit there by itself
  when one board is not enough (see [layout.md](layout.md)).
- The column numbers are printed along the two outer edges; at the joint the two boards' numbers
  would overlap.

## Parts

Every part has `id` (unique), `type` and `pins` (or `pin1` for DIP chips). `pins` is either a list in pin order or
an object by pin name:

```json
{ "id": "D1", "type": "led", "pins": ["e9", "e10"] }
{ "id": "D1", "type": "led", "pins": { "anode": "e9", "cathode": "e10" } }
```

Any part can also have `description` (how it is used in this circuit, shown in its card in the
page: a plain string, shown as it is in every language, or `{ "en": …, "es": … }`; leave it out
when the learner should find it out; see [focus-and-flow.md](focus-and-flow.md)) and `model`
(simulation values that override the typical ones; see [simulation.md](simulation.md)).

### resistor

| Field | Default | |
|---|---|---|
| `value` | — | `"330"`, `"4k7"`, `"4.7k"`, `"1M"`, `"2R2"`, or a number in ohms |
| `tolerance` | `"5%"` | sets the last band; ≤ 2 % switches to 5 bands and a blue body |
| `bands` | from tolerance | `4` or `5` |
| `power` | `"1/4"` | `"1/8"`, `"1/4"`, `"1/2"`, `"1"`: body size; `"3"`, `"5"`, `"10"`: a cement resistor |

Pins `1`, `2`. The bands read from pin 1 (the tolerance band is next to pin 2).

From 3 W up it is a **cement resistor**: a white ceramic box (5 W: 22 × 9.5 × 9 mm; 10 W: 48 mm
long) lying on the board, with the power, value and tolerance letter printed on top instead of
bands (`5W 10ΩJ`; J = 5 %). The simulator checks its power against the rating.

### capacitor

| Field | Default | |
|---|---|---|
| `value` | — | `"100n"`, `"10u"`, `"470µF"` |
| `kind` | electrolytic from 1 µF | `ceramic` or `electrolytic` |
| `voltage` | `25` | electrolytic rating, V; with the value it sets the can size |
| `diameter`, `height` | from the table | mm, to match a real part |

Ceramic pins `1`, `2` (the three-digit code is printed on it). Electrolytic pins `+`, `-`;
the stripe faces `-`, and the value is printed up the sleeve (`100µF 25V`), repeated around
it as on real parts, so each view shows one copy.

### led

`color`: `red` (default), `green`, `yellow`, `blue`, `white`, `orange`. `size`: `5`
(default) or `3`. Pins `anode`, `cathode`. The flange is flat on the cathode side, and the
anode lead is the longer one: its extra length shows as a small kink above the board.

### diode

`part` (pins `A`, `K`; the band marks `K`):

| part | kind | body |
|---|---|---|
| 1N4007 (default), 1N4001…1N4006 | rectifier, 1 A | DO-41 |
| 1N5399 | rectifier, 1.5 A | DO-15 |
| 1N5408 | rectifier, 3 A | DO-201AD |
| 1N4148 | signal | glass |
| 1N5819, 1N5822 | Schottky, 1 A / 3 A | DO-41 / DO-201AD |
| FR107, FR207 | fast recovery, 1 A / 2 A | DO-41 / DO-15 |

### zener

Zener diode, 1 W, orange glass body. `value`: the Zener voltage, `"5V1"` (as printed on the
part), `"5.1"` or `5.1`; or `part`: `1N4728A` (3.3 V) … `1N4751A` (30 V). Pins `A`, `K`; the band
marks `K`. In use it goes in reverse: `K` towards the positive side, with a series resistor.

### bridge

Bridge rectifier in a KBP case: four diodes in one flat body standing on four leads in a
row, `+ ~ ~ −`. `part`: `KBP307` (default; 3 A) or any KBP2xx (2 A) / KBP3xx (3 A), e.g.
`KBP206`, `KBP210`. Pins `+`, `AC1`, `AC2`, `-`. Its leads are 3.8 mm apart, so on the board they
go in one row with neighbours one or two holes apart (`BRIDGE_SHAPE` otherwise), e.g.
`e10, e11, e13, e14`. The bevelled corner and the printed `+` mark the `+` pin. The simulator
uses four diodes (about 1.0 V each at the rated current).

### module

A development board. Not simulated yet: its pins only join the groups their holes are in.

| part | where | placement |
|---|---|---|
| `ESP32-DEVKIT` (also `ESP32`) | straddles the channel, 30 pins | `pin1` (EN), and `rowSpacing` |
| `ESP32-C3-SUPERMINI` (also `ESP32-C3`) | straddles the channel, 16 pins | `pin1` (5V), and `rowSpacing` |
| `UNO` (also `ARDUINO-UNO`) | beside the board | `pins` of the pins in use only |
| `DESPI-C02` (also `DESPI`) | beside the board | `pins` of the pins in use only; `rese`, `panel` |

**Straddling boards** are placed like a DIP chip: pin 1 and the rest follow down that row,
then back along the other row, `rowSpacing` holes away across the channel (DevKit 9, that is
0.9"; C3 SuperMini 6). Boards differ (0.9", 1.0" and 1.1" DevKits exist): measure yours and set
`rowSpacing`. With pin 1 in the front half the board reads from the front. A wrong `pin1`
says which rows it can go in. The PCB covers the holes under it; a DevKit leaves about one
free row in front.

```json
{ "id": "U1", "type": "module", "part": "ESP32-DEVKIT", "pin1": "c5" }
```

Pin names are the ones printed on the board: DevKit `EN`, `VP`, `VN`, `D34` … `D13`, `GND`,
`VIN` down one side, `D23`, `D22`, `TX0`, `RX0` … `D15`, `GND2`, `3V3` down the other; C3
SuperMini `5V`, `GND`, `3V3`, `GPIO4` … `GPIO0` and `GPIO5` … `GPIO21`.

**The UNO** lies beside the board, behind it (`"side": "back"`, default) or in front
(`"front"`), USB on the left; `offset` moves it along (mm). List only the pins in use: each
gets a Dupont lead from its header to the hole, coloured by default (5V and VIN red, 3V3
orange, ground black, signals in turn), or as `wires` says.

```json
{ "id": "A1", "type": "module", "part": "UNO", "pins": { "D13": "j20", "GND": "T-27" }, "wires": { "D13": "yellow" } }
```

UNO pins: `D0` … `D13`, `A0` … `A5`, `SCL`, `SDA`, `AREF`, `IOREF`, `RESET`, `3V3`, `5V`, `VIN`
and the three grounds `GND`, `GND2` (power header) and `GND3` (by D13).

**In the simulation** (ESP32 DevKit, ESP32-C3 SuperMini, UNO; [microcontrollers.md](microcontrollers.md)):
`"io"` sets each GPIO by printed name, GPIO name or number, `high`, `low`, `input`, `input_pullup` or
`input_pulldown` (unlisted pins are inputs), and the board on USB is a 5 V source with its 3.3 V
regulator (`"usb": false` to power it from the circuit instead). `"program"` runs a sketch: the name
of a `.ino` file beside the circuit, or its text (`setup()`, `loop()`, `delay()` in simulated time):

```json
{ "id": "U1", "type": "module", "part": "ESP32-DEVKIT", "pin1": "c5", "io": { "D13": "high", "D27": "input_pullup" } }
{ "id": "U1", "type": "module", "part": "ESP32-DEVKIT", "pin1": "c5", "program": "blink.ino" }
```

**GooDisplay's DESPI-C02 e-paper adapter** also lies beside the board, its 8 right-angle pins
towards it and a Dupont lead on each pin in use (`pins`, `wires`, `side`, `offset`, as the UNO).
Pins: `BUSY`, `RES`, `D/C`, `CS`, `SCK`, `SDI`, `GND`, `3.3V`. `"rese": "0.47"` or `"2.2"` (as
sold) draws the P3 switch in that position: 0.47 for UltraChip controllers such as the
GDEY075T7's UC8179. With `"panel": true` the 7.5" GDEY075T7 panel is drawn with its flat cable
in the P1 connector. Its card is titled "Adapter board".

```json
{ "id": "EP1", "type": "module", "part": "DESPI-C02", "rese": "0.47", "panel": true, "pins": { "BUSY": "j20", "SCK": "j16", "SDI": "j10", "GND": "j23", "3.3V": "j24" } }
```

In the page, a board's card lists the pins in use, each with a short note (strapping pin,
input only, ADC2 not with Wi-Fi, PWM, shared with the USB…).

### mosfet, bjt

`part` picks the package and the pin names, in package order (pin 1, 2, 3):

| part | type | package | pins |
|---|---|---|---|
| IRLZ44N, IRF520, IRF9540 | mosfet | TO-220 | G, D, S |
| 2N7000 | mosfet | TO-92 | S, G, D |
| 2N2222A, 2N2907A, 2N3904, 2N3906, 2N5551, 2N5401 | bjt | TO-92 | E, B, C |
| S8050, S8550, S9012, S9013, S9014, S9015, S9018 | bjt | TO-92 | E, B, C |
| BC547, BC548, BC549, BC550, BC557, BC558, BC337, BC327 | bjt | TO-92 | C, B, E |
| BC517 (Darlington) | bjt | TO-92 | C, B, E |
| C1815 (2SC1815), A1015 (2SA1015) | bjt | TO-92 | E, C, B |
| TIP120 | bjt | TO-220 | B, C, E |

Pin 1 is on the left when you look at the printed face with the leads down, so listing
the holes left to right as seen from the front makes the print face the front.

A part not in the table: give `package` (`TO-220`, `TO-92`) and `pinNames`.

### potentiometer

`value` (end-to-end resistance, default `"10k"`), `position` (wiper, 0…1, default 0.5: the
white mark on the knob shows it). Pins `1`, `W` (wiper), `3`, three neighbouring holes in a
row; pin 1 on the left seen from the knob.

`style`: `knob` (default) or `trimmer`, a blue multi-turn 3296W with its adjusting screw on top
and the value printed as a code (`103` = 10 kΩ).

### button

6 × 6 mm tactile push button. Pins `1`, `2`, `3`, `4`: 1–2 are always joined inside, and so
are 3–4; pressing joins the two pairs. Put it **across the centre channel**: 1 and 2 in the
same column on each side (e.g. `e10`, `f10`), 3 and 4 two columns over (`e12`, `f12`).
Turned 90° (1 and 3 in the same strip) it is always closed: the checker reports
`SWITCH_BYPASSED`. `color` sets the cap colour; `pressed` is for the simulator.

### switch

A switch that stays where it is put and does not fit the board, lying on the table beside it
(`side`: `"front"`, default, or `"back"`; `offset` in mm along the edge), its contacts pointing at
the board. Like the UNO, `pins` lists only the pins in use, each wired to its hole with a lead
ending in a Dupont male pin; `wires` chooses their colours. `on` (default `false`) is its position.

- `style: "rocker"` (default): KCD1 rocker, SPST, pins `1` and `2`; its faston tabs take
  alligator clips. On (I), 1–2 is closed (50 mΩ); off (O), open. Up to 3 A in the simulation (the
  maker gives no DC rating).
- `style: "latching"`: 7 × 7 mm latching push button, DPDT, pins `NC1`, `C1`, `NO1` and `NC2`,
  `C2`, `NO2` (each row a changeover, a wire soldered to each pin in use). Released, C joins NC;
  latched down (`on`), C joins NO. About 100 mA.

```json
{ "id": "S1", "type": "switch", "style": "rocker", "on": true, "pins": { "1": "a3", "2": "B+5" } }
```

In the live page its card has *Turn on* / *Turn off*; `page.controls` can put it in the panel
(`{ "part": "S1", "field": "on" }`). Example: `examples/switches.json`.

### ic

Chips in DIP packages, from the part-number table: NE555, LM358, LM324, LM393, UA741 (or
LM741), NE5532, LM386, 74HC595, CD4017, ULN2003, ULN2803, PC817 (4 pins). Place them with
**`pin1`** instead of listing every hole:

```json
{ "id": "U1", "type": "ic", "part": "NE555", "pin1": "e28" }
```

Pin 1 in the front row next to the channel (`e`) reads from the front, notch on the left;
pin 1 in the back row (`f`) turns the chip round. Pin names come from the part (`GND`,
`TRIG`, `OUT`… for the 555), so other parts can be checked against them.

### regulator

Linear voltage regulator in TO-220. `part`: `7805`, `7806`, `7808`, `7809`, `7810`, `7812`,
`7815`, `7818`, `7824` (pins `IN`, `GND`, `OUT`) or `LM317` (pins `ADJ`, `OUT`, `IN`; output
1.25 V · (1 + R2/R1)). Other names of the same part work too: `LM7805`, `L7805CV`, `LM317T`.

`AMS1117-3.3` (or `AMS1117-5.0`; also `AMS1117-3V3`) is the small regulator module standing on
three right-angle pins in a row, pins `IN`, `OUT`, `GND` (printed VIN, OUT, GND). Its board stands
over the next two rows on the side its print faces (the front with the holes in increasing
columns): use the far rows of the strip. `led`: the resistor of its power LED, `"1k"` (default),
`"200"` (some boards of the same panel) or `"none"`. The LED's current is part of what the module
draws (`quiescent`), not of the output current.

### inductor

Axial inductor with colour rings, like a fat green resistor; the rings give the value in µH.
`value`: `"100u"` (100 µH), `"10m"`. `tolerance`: default `"10%"`. `dcr` (winding resistance,
Ω) and `current` (rated, A): typical values for the size if left out. Pins `1`, `2`.

### thermistor

NTC thermistor (MF52 epoxy bead). `value`: resistance at 25 °C (default `"10k"`); `beta`: B
constant in kelvin (default 3950); `temperature`: °C the simulation uses (default 25). Pins
`1`, `2`, one or two holes apart.

### ldr

Photoresistor (light-dependent resistor). `part`: `GL5528` (default), `GL5516`, `GL5537`,
`GL5539`, `GL5549`; `light`: illuminance in lux for the simulation (default 100, a lit room).
Pins `1`, `2`, one to three holes apart.

### buzzer

Passive magnetic buzzer, 12 mm. Pins `1`, `2`, two or three holes apart. To the simulator it
is its coil (`resistance`, default 16 Ω); it warns when steady DC flows through it, since a
passive buzzer only sounds with a changing signal.

### header

A row of male header pins, to show where a module or a Dupont wire plugs in. Place it with
`pin1` and `count`; the other pins follow towards higher columns:

```json
{ "id": "J1", "type": "header", "count": 4, "pin1": "h50" }
```

Pins `1` … `n`; each is only its own hole.

### battery

A battery lying on the table beside the board, with a red and a black lead to two holes: pins
`+` and `-`. It is also a power source for the simulator (a circuit with a battery needs no
`supplies`).

| Field | Default | |
|---|---|---|
| `format` | `AA` | `AA`, `AAA` (cells in an open holder), `18650` (lithium cells in a holder), `9V` (block with its snap), `pouch` (flat LiPo, 103450) |
| `chemistry` | by format | `alkaline` (AA, AAA, 9V), `nimh` (AA, AAA), `li-ion` or `lifepo4` (18650), `lipo` (pouch) |
| `cells` | `1` | cells (or 9 V blocks) in series: the voltages add up, 4 × AA = 6 V |
| `charge` | — | 0 (empty) … 1 (full). Without it the battery is at its nominal voltage; with it the open-circuit voltage follows the chemistry's discharge curve (a full lithium cell, 4.2 V) |
| `voltage` | — | a measured open-circuit voltage: wins over the two above |
| `internalResistance`, `capacity` | by format | Ω for the whole pack; `"2000 mAh"` |
| `switch` | — | `on` or `off`: a holder with a slide switch (off: no current) |
| `side`, `offset` | nearer side edge | where it lies: `left`, `right`, `back`, `front`; mm along that edge |

```json
{ "id": "BT1", "type": "battery", "format": "AA", "cells": 4, "switch": "on", "pins": { "+": "T+3", "-": "T-3" } }
{ "id": "BT2", "type": "battery", "format": "18650", "cells": 2, "charge": 0.8, "pins": { "+": "B+60", "-": "B-60" } }
```

The figures behind each format and chemistry (voltage curve, internal resistance, capacity,
the largest current each is meant for) are in `src/parts/batteries.js`.

### wire

`color`: `red`, `black`, `blue` (default), `green`, `yellow`, `orange`, `white`, `violet`,
`grey`, `brown`. `style`: `arc` (default, flexible jumper) or `flat` (pre-cut, lying on the
board). `height`: arc height in mm.

## Issues

`check` and `render` report issues with a severity:

- `error`: the part could not be understood (unknown type, bad value, hole that does not
  exist) and is not drawn; or two leads share a hole.
- `warning`: it is drawn, but something is physically wrong or suspicious (shorted pins,
  leads that cannot reach, overlapping bodies).
- `info`: worth knowing (a pin whose strip touches nothing else).
