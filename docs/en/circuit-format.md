# Circuit file format (version 1)

*[Español](../es/formato-circuito.md)*

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
| `board` | no | `bb830` (default) or `bb400`. |
| `view` | no | Default view: `front`, `back`, `front-left`, `back-right`. The command line `--view` wins. |
| `clearance` | no | Minimum gap between part bodies, mm. Closer parts are reported as notes. Use 3 or more for teaching layouts. |
| `netLabels` | no | Text printed next to a rail, by rail id. A labelled rail counts as connected to a supply. |
| `parts` | yes | List of parts. |

## Holes

- Main grid: row letter and column, `a1` … `j63` (`a1` … `j30` on `bb400`).
- Rails: `T-`, `T+` (top), `B+`, `B-` (bottom) followed by the column the hole lines up
  with: `T+9`, `B-24`. On `bb830` rail holes exist at columns 3–7, 9–13, 15–19, 21–25,
  27–31, 33–37, 39–43, 45–49, 51–55, 57–61.
- Upper or lower case both work.

Connected groups: rows a–e of one column; rows f–j of one column; each rail along the
whole board.

## Parts

Every part has `id` (unique), `type` and `pins`. `pins` is either a list in pin order or
an object by pin name:

```json
{ "id": "D1", "type": "led", "pins": ["e9", "e10"] }
{ "id": "D1", "type": "led", "pins": { "anode": "e9", "cathode": "e10" } }
```

### resistor

| Field | Default | |
|---|---|---|
| `value` | — | `"330"`, `"4k7"`, `"4.7k"`, `"1M"`, `"2R2"`, or a number in ohms |
| `tolerance` | `"5%"` | sets the last band; ≤ 2 % switches to 5 bands and a blue body |
| `bands` | from tolerance | `4` or `5` |
| `power` | `"1/4"` | `"1/8"`, `"1/4"`, `"1/2"`, `"1"`: body size |

Pins `1`, `2`. The bands read from pin 1 (the tolerance band is next to pin 2).

### capacitor

| Field | Default | |
|---|---|---|
| `value` | — | `"100n"`, `"10u"`, `"470µF"` |
| `kind` | electrolytic from 1 µF | `ceramic` or `electrolytic` |
| `voltage` | `25` | electrolytic rating, V; with the value it sets the can size |
| `diameter`, `height` | from the table | mm, to match a real part |

Ceramic pins `1`, `2` (the three-digit code is printed on it). Electrolytic pins `+`, `-`;
the stripe faces `-`.

### led

`color`: `red` (default), `green`, `yellow`, `blue`, `white`, `orange`. `size`: `5`
(default) or `3`. Pins `anode`, `cathode`.

### diode

`part`: `1N4007` (default), `1N4148`, `1N5819`. Pins `A`, `K`; the band marks `K`.

### mosfet, bjt

`part` picks the package and the pin names, in package order (pin 1, 2, 3):

| part | type | package | pins |
|---|---|---|---|
| IRLZ44N, IRF520, IRF9540 | mosfet | TO-220 | G, D, S |
| 2N7000 | mosfet | TO-92 | S, G, D |
| 2N2222A, 2N3904, 2N3906 | bjt | TO-92 | E, B, C |
| BC547, BC557 | bjt | TO-92 | C, B, E |
| TIP120 | bjt | TO-220 | B, C, E |

Pin 1 is on the left when you look at the printed face with the leads down, so listing
the holes left to right as seen from the front makes the print face the front.

A part not in the table: give `package` (`TO-220`, `TO-92`) and `pinNames`.

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
