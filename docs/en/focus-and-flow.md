# Focus and the current layer

*[Español](../es/foco-y-corriente.md)*

Two ways to point at what matters in a drawing, built from the same pieces
(`src/render/focus.js`, `src/sim/flow.js`) for static images and for the interactive page.

## Focus: dim the rest

Everything is covered by a white veil; the parts in focus, and the **metal strips under their
leads**, are drawn again on top. They show even where another part covers them (like an
X-ray), and the strips show what each lead is really joined to inside the board. The
**column numbers and row letters** of its leads light up where the board prints them (dark
tags above and below the grid, and at both ends of each row), so the holes can be read off
and found on a real board; rail holes only have their column.

```bash
node bin/protoboard-iso.js render <target> --focus Q1 --fit parts     # static image, e.g. for a lesson
```

MCP: `render` with `focus: ["Q1"]`. In a circuit, `"page": { "focus": ["R1", "D1"] }` opens the
page with those parts in focus (the ones a lesson is about).

## In the page: tap a part

- **Tap or click a part** (or its label): the rest dims, the part and its strips come to the
  front, and a **card** opens: name and value, the kind of part (tap it to read what that kind
  of part is and how it works, from the kit), what it does **in this circuit** (its
  `description`, shown directly), and where each pin goes and what else is there ("B → c17, column 17 (rows a–e) — with R1 (2)").
- **The card lives in the inspector**: a panel on the right on a wide screen, a bottom sheet on a
  phone (three heights: a strip with the name and the values, half, full; drag it or tap its head).
  Its head stays at the top: the name, **See through** (the eye: makes the part transparent, to see
  what is behind it) and **Close** (✕). On a phone with the sheet folded, a line under it shows a
  *MODEL* chip and the main values, each in a fixed slot so a changing value never pushes the others
  (open, the *Simulation* section says the same, so the line hides). Then what it is, its values, its oscilloscope, its controls, and the pins, folded. When the
  inspector opens over the part, the drawing moves so the part stays in view.
- **The Circuit tab** of the inspector holds what concerns the whole circuit: the controls panel,
  the warnings and the Falstad notes. With nothing tapped it is what the inspector shows (on a
  phone, folded to a strip at the bottom so the circuit is free).
- **Tap the board** (or ✕) to clear the focus.
- With `"page": { "results": true }` the simulation is always on, with no button: the tapped
  part shows its simulated current and the voltages of its groups on the board, and all its
  values in the card.
  Nothing else is labelled: every tag at once is too much to read.
- **Every value explains itself.** Tap a line of the card ("Capacitance: 100 µF", "Ic: 8.82 mA",
  "saturated"…) to open what it means; with a mouse, hovering shows the same text in a small box.
  The texts live in `src/i18n` (`explain.*`), translated like everything else.
- **Where a value comes from.** Hovering a result tag, or tapping it (it stays until tapped again;
  the focus, the dimming and the card do not change), draws how it is measured: for a voltage, a
  red probe (+) on that strip and a black probe (−) where the supply's ground is clipped, both
  strips lit; for a current, arrows up the lead where it goes in and down the lead where it comes
  out (Ic: in at the collector, out at the emitter). A line says it in words. Voltages on the board
  are always measured from ground; the card's Vbe or Vce are between two pins, so they differ by
  the small drop in the return wires (0.05 Ω each in the model).
- The drawing has no `<title>` in the page (browsers would show it as a tooltip everywhere); its
  name goes to `aria-label`. Static SVG files keep their title.

Two kinds of text, on purpose:

- **What a kind of part is** comes from the kit (`describe.*` in `src/i18n`, every language) and
  stays behind the part's kind in the card ("Bipolar transistor ⓘ"): the learner opens it when
  they want it.
- **How it is used in this circuit** is the circuit's own `description`, shown directly in the
  card. Leave it out when the learner should work it out. A plain string is shown as it is in
  every language; one text per language of the kit is shown in the page's language (`check`
  reports a missing one):

```json
{ "id": "Q1", "type": "bjt", "part": "2N2222A", "pins": { "E": "c16", "B": "c17", "C": "c18" },
  "description": { "en": "NPN transistor: the small base current controls the large collector current.",
                   "es": "Transistor NPN: la corriente pequeña de la base controla la grande del colector." } }
```

## The current layer: the conductor view

`"page": { "flow": true }` (needs `supplies` or a battery part) adds the *Current* button
(pressed: the current layer; pressed again: the parts). With it the board and the parts are veiled, and **every conductor in use is drawn
as one thick line** along its real path: the metal strip between the holes in use, up a lead,
through the body, down the other lead, along the arc of a jumper wire. On top, **dots move**:

- **Colour = voltage** (from ground), on a scale that ends at the largest voltage in the circuit:
  grey at 0 V, red towards +, blue towards − (the colours of the rails). Inside a body the colour
  goes from one lead's voltage to the other's along a steep S curve, so the drop shows in the
  middle of the part that causes it. A floating conductor is pale.
- **Direction**: conventional current, from + to −, as in Falstad's CircuitJS.
- **Speed is proportional** to the current: the largest current in the circuit moves at
  60 px/s, half of it at half that speed, so ratios and Kirchhoff can be seen. In the live page
  the scale is the largest current since the start, so a current that dies away (a capacitor
  charging) is seen slowing down. *Log speed* (in the bar's ⋯ menu)
  switches to a logarithmic scale (a microampere crawls, an ampere races) for circuits with very
  different currents. Below 1 µA nothing moves.
- The current in each piece of a strip comes from Kirchhoff's current law: walking along the
  strip, it is the sum of what entered at the holes behind.
- Focus works on top: tap a part to bring it forward while the dots keep moving.
- With "reduce motion" set in the device, the dots stay still.

Paths come from the packages (`paths` in `build()`, see [adding-parts.md](adding-parts.md));
a package without them gets straight lines from each hole to the middle of its holes, at board level.

Static images can show the layer too (`render --flow`, MCP `flow: true`): the dots are drawn but
do not move.

Stage 3 turns this into a live simulation in the page (time, sliders, limits made visible):
[live-simulation.md](live-simulation.md).

Like the results, the current layer is a **model** and is only in the page when the circuit
asks: it shows which parts conduct, which can give away an answer someone is asked to predict.

## The live page

With `results` or `flow`, the page runs the simulator itself (the same engine as the command
line, bundled in). At load it shows the DC values, as before; then:

- **Time**: a circuit with capacitors or inductors gets *Pause*, *Switch on (t = 0)* (capacitors
  discharged, everything starts again) and a clock. Simulated time runs so the longest time
  constant takes about 2 s, whatever its size; a heavy step falls into slow motion.
  `"page": { "start": "zero" }` opens switched on at t = 0 and running.
- **Dots** move by an accumulated phase, so they never jump when the current changes; the
  speed scale is the largest current since the start.
- **A lit LED** gets a halo of the colour of its light around its dome, over the conductor view
  (a white LED slightly yellow, so it shows on a white page). Its opacity follows its current against its rated current on a
  square-root scale, as the eye sees it: a tenth of the rated current still shows clearly.
- **Labels stay on top**: the label of a tapped part is copied above the current layer
  (`spotlabels`), so the dots never cover it.
- **Four times a second**: conductor colours, the lit LEDs,
  a heat tint on resistors, regulators and transistors (power against rated power, from a fifth
  of it), the result tags, the probe captions and the open card.
- Results remain a **model**, and opt-in per circuit like before.

## Controls and limits

In the live page every adjustable part has its controls in its card, under *Adjust (model)*: a
resistor's value (log, stopping at standard E24 values), a thermistor's temperature, a
photoresistor's light, a potentiometer's position, a bench supply's voltage, a battery's charge.
A push button conducts while it is held, on the drawing or with *Hold to press* in its card; *Keep pressed* leaves it pressed (to look at other parts while current flows) until it is tapped again. Each
change re-solves at once; a running circuit keeps going from where it was (a capacitor keeps
its voltage, so changing R while it charges shows the new time constant).

A lesson may put the two or three controls that matter in a panel (in the inspector's *Circuit* tab):

```json
"page": {
  "results": true,
  "controls": [
    { "supply": "V1", "field": "voltage", "max": 12, "label": { "en": "Supply", "es": "Fuente" } },
    { "part": "R1", "field": "resistance", "min": 100, "max": 10000 },
    { "part": "S1", "field": "pressed" }
  ]
}
```

Fields: `part` or `supply` (a drawn battery is a `part`), `field` (`resistance`, `temperature`,
`light`, `position`, `pressed`, `voltage`, `charge`), optional `min`, `max`, `scale` (`linear` |
`log`) and `label`. `check` says if a control does not exist or its range makes no sense.

**Limits.** Every part is compared with its limits (current, power, voltage, reverse voltage):
near the limit (80–100 %) it gets an amber outline; past it, a pulsing red outline, a line in
*Limits exceeded* (in the *Circuit* tab, with a ⚠ n on the bar that leads there: "D1: current reached 100 mA (maximum 30 mA) · now 4.07 mA", the latched peak and the value now; tap it to open the part) and in
its card. The mark stays even if the slider goes back or the peak was brief, until *Clear marks*
or *Switch on (t = 0)*. In `simulate`, each part's `stress` lists the same comparisons.

Controls and outlines show only in a live page (`results` or `flow`), which already follows the
rule of not giving away a pending prediction.
