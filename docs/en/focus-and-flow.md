# Focus and the current layer

*[Español](../es/foco-y-corriente.md)*

Two ways to point at what matters in a drawing, built from the same pieces
(`src/render/focus.js`, `src/sim/flow.js`) for static images and for the interactive page.

## Focus: dim the rest

Everything is covered by a white veil; the parts in focus, and the **metal strips under their
leads**, are drawn again on top. They show even where another part covers them (like an
X-ray), and the strips show what each lead is really joined to inside the board.

```bash
node bin/protoboard-iso.js render <target> --focus Q1 --fit parts     # static image, e.g. for a lesson
```

MCP: `render` with `focus: ["Q1"]`. In a circuit, `"page": { "focus": ["R1", "D1"] }` opens the
page with those parts in focus (the ones a lesson is about).

## In the page: tap a part

- **Tap or click a part** (or its label): the rest dims, the part and its strips come to the
  front, and a **card** opens: name and value, the kind of part (tap it to read what that kind
  of part is and how it works, from the kit), what it does **in this circuit** (its
  `description`, shown directly), and where each pin goes and what else is there ("B → h17, column 17 (rows f–j) — with R1 (2)").
- **See through** (in the card) makes the part transparent, to see what is behind it.
- **Tap the board** (or *Close*) to clear the focus.
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
{ "id": "Q1", "type": "bjt", "part": "2N2222A", "pins": { "E": "h16", "B": "h17", "C": "h18" },
  "description": { "en": "NPN transistor: the small base current controls the large collector current.",
                   "es": "Transistor NPN: la corriente pequeña de la base controla la grande del colector." } }
```

## The current layer

`"page": { "flow": true }` (needs `supplies`) adds two buttons, *Parts* and *Current*. In
*Current*, everything is dimmed, the strips in use appear, and **dots move** along the strips
and through every part:

- **Speed** grows with the current, on a logarithmic scale (a microampere crawls, an ampere
  races); below 1 µA nothing moves.
- **Direction**: electrons by default (from − to +); *Conventional current* reverses them.
- The current in each piece of a strip comes from Kirchhoff's current law: walking along the
  strip, it is the sum of what entered at the holes behind.
- Focus works on top: tap a part to bring it forward while the dots keep moving.
- With "reduce motion" set in the device, the dots stay still.

Static images can show the layer too (`render --flow`, MCP `flow: true`): the dots are drawn but
do not move.

Like the results, the current layer is a **model** and is only in the page when the circuit
asks: it shows which parts conduct, which can give away an answer someone is asked to predict.
