# Embedding a circuit in documentation

*[Español](../es/embeber.md)*

Every circuit has one page meant to be embedded: `out/<name>.html`, next to its other
outputs. It is a single self-contained file (inline SVG, a few lines of CSS and script, no
network, no build), so it works in an iframe, a wiki "web view" or a notes app.

```bash
node bin/protoboard-iso.js page <target> [--lang es] [--fit parts|board] [-o page.html]
```

- **Rewritten on every change.** `create`, `apply` and `undo` (CLI or MCP) rewrite it with
  the other outputs, always under the same name. An embed of that file always shows the latest
  revision; the page carries it in `<meta name="revision">` and in its toolbar.
- **What it shows today:** the circuit view and its opposite (`front` ↔ `back`,
  `front-left` ↔ `back-right`), close-up or whole board, labels on or off; drag to move
  (mouse or one finger), wheel or pinch to zoom, double-click to zoom in (the buttons reset
  the frame). Inside the drawing, one finger moves the drawing, not the host page. Without
  JavaScript it still shows the first view, close-up, with labels. On a narrow screen (a
  phone) the buttons sit in one row that scrolls sideways, leaving the room to the drawing.
- **Simulation results**, only if the circuit has `"page": { "results": true }` (and
  `supplies`): always on, shown only for the part that is tapped, so the board never fills with
  numbers; leave it off while someone is asked to predict them ([simulation.md](simulation.md)).
- **Tap a part** to focus it and open its card; optional current layer (`"page": { "flow": true }`).
  See [focus-and-flow.md](focus-and-flow.md).
- **Tap a strip** in use (or a pin in a part's card) to open the strip's card: what a strip is,
  what is clipped to it, those parts brought forward; with the results, its voltage to ground
  (with the probes drawn), the current of each lead into or out of it and its oscilloscope.
- **Live simulation**: with `results` or `flow`, the page carries the simulator and runs it
  (about 60 kB more): values, colours and dots follow it, and a circuit with capacitors or
  inductors gets *Pause* and *Switch on (t = 0)* and a clock. See
  [focus-and-flow.md](focus-and-flow.md) and [live-simulation.md](live-simulation.md).
- **It fills its frame.** The drawing scales to the width and height of the iframe (or the
  browser window), so the host decides the size.
- **The same page grows.** Simulation results, animation and the virtual multimeter (stages
  2 to 4 in the [roadmap](../../ROADMAP.md)) are planned for this page, so an embed made
  today gets them without changing its link.

## How to embed it

1. Serve the circuit folder with any static file server (the page needs nothing else).
2. Point the host at `…/<circuit>/out/<circuit>.html`:
   - plain HTML: `<iframe src="…/led/out/led.html" style="width:100%;height:480px;border:0"></iframe>`;
   - a wiki or notes app with a "web view" or "embed URL" block: use the same URL.
3. If the host is on another origin, allow it to frame the page (for example the header
   `Content-Security-Policy: frame-ancestors <host origin>`).

The script runs inside the iframe, isolated in the file server's origin: it never touches
the host page.

## Live or frozen

An embed of the page is **live**: it follows every change to the circuit. For a record that
must not change (how a circuit looked in a given session), either embed a copy of the
circuit (its own folder) or attach a static SVG instead (`render`, which writes
`out/<name>.<view>.svg`) as a picture.

## From the MCP server

The tools `create_circuit`, `apply_ops` and `undo` return the page path in `files.pageFile`.
For a circuit made before the page existed, `render` with `page: true` writes it.
