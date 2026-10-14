# protoboard-iso

*[Leer en español](README.es.md)*

Isometric breadboard circuits in SVG, from a short JSON file. Built to learn electronics
visually: every part is drawn at its real size, resistors carry their real colour bands,
and the drawing doubles as a wiring guide you can copy onto your own breadboard.

It is two things at once:

- a **JavaScript library and command line tool** with no dependencies, that runs the same
  in Node and in the browser;
- an **agent skill** (`SKILL.md`): an AI assistant writes the JSON, the kit draws and
  checks it, so the assistant never computes geometry or colour codes by hand.

Inspired by [Anatomy](https://github.com/wheresryan22/anatomy) (isometric machines) and by
the [Falstad circuit simulator](https://www.falstad.com/circuit/) (seeing current flow).

## Quick start

```bash
node bin/protoboard-iso.js check examples/led-resistor.json
node bin/protoboard-iso.js inspect examples/led-resistor.json        # the drawing in numbers
node bin/protoboard-iso.js render examples/led-resistor.json -o led.svg
node bin/protoboard-iso.js render examples/led-resistor.json -o led-back.svg --view back --lang es
npm test
npm run examples            # all examples → examples/out/ (open index.html)
```

A circuit file:

```json
{
  "board": "bb830",
  "netLabels": { "T+": "+5 V", "T-": "GND" },
  "parts": [
    { "id": "R1", "type": "resistor", "value": "330", "pins": ["T+9", "c9"] },
    { "id": "D1", "type": "led", "color": "red", "pins": { "anode": "e9", "cathode": "e10" } },
    { "id": "W1", "type": "wire", "color": "black", "pins": ["a10", "T-10"] }
  ]
}
```

Keys in the JSON are in English so anyone can reuse it; messages, labels and the page come out in
English or Spanish: `--lang es`, `lang` in the MCP tools, or `"lang": "es"` in the circuit itself
(see [SKILL.md](SKILL.md#languages)).

The breadboard decides the connections: rows a–e of a column are one node, f–j another,
each rail one more. From the holes alone the kit knows what is connected and warns about
shorted strips, occupied holes, leads that cannot reach and bodies that overlap.

It also simulates what it draws (a model, labelled as such): give it a bench supply in
`supplies`, or a **battery** lying beside the board (AA, AAA, 18650, 9 V or LiPo; any number of
cells in series, chemistry and state of charge), and it computes voltages and currents, warns
about overloads and shorts, and shows each part's values in the embeddable page. Parts range
from resistors and LEDs to Zener diodes, bridge rectifiers, regulators, inductors, sensors, transistors and chips
([circuit-format.md](docs/en/circuit-format.md), [simulation.md](docs/en/simulation.md)).

## Use it as a skill

Clone or link this folder into your skills directory, for example
`ln -s "$PWD" ~/.claude/skills/protoboard-iso`. The assistant loads `SKILL.md` when a
breadboard circuit comes up.

## Documentation

| | English | Español |
|---|---|---|
| Code map (start here when coming back to the code) | [docs/en/code-map.md](docs/en/code-map.md) | [docs/es/mapa-del-codigo.md](docs/es/mapa-del-codigo.md) |
| How it is built | [docs/en/architecture.md](docs/en/architecture.md) | [docs/es/arquitectura.md](docs/es/arquitectura.md) |
| Circuit file format | [docs/en/circuit-format.md](docs/en/circuit-format.md) | [docs/es/formato-circuito.md](docs/es/formato-circuito.md) |
| Adding a part or a board | [docs/en/adding-parts.md](docs/en/adding-parts.md) | [docs/es/agregar-componentes.md](docs/es/agregar-componentes.md) |
| Translating | [docs/en/translating.md](docs/en/translating.md) | [docs/es/traducir.md](docs/es/traducir.md) |
| Inspecting and annotating | [docs/en/inspect-and-annotate.md](docs/en/inspect-and-annotate.md) | [docs/es/inspeccionar-y-anotar.md](docs/es/inspeccionar-y-anotar.md) |
| Agent interface (resume, change, undo) | [docs/en/agent-interface.md](docs/en/agent-interface.md) | [docs/es/interfaz-para-agentes.md](docs/es/interfaz-para-agentes.md) |
| MCP server | [docs/en/mcp.md](docs/en/mcp.md) | [docs/es/mcp.md](docs/es/mcp.md) |
| Simulation (voltages and currents, a model) | [docs/en/simulation.md](docs/en/simulation.md) | [docs/es/simulacion.md](docs/es/simulacion.md) |
| Focus and the current layer | [docs/en/focus-and-flow.md](docs/en/focus-and-flow.md) | [docs/es/foco-y-corriente.md](docs/es/foco-y-corriente.md) |
| Embedding a circuit in documentation | [docs/en/embedding.md](docs/en/embedding.md) | [docs/es/embeber.md](docs/es/embeber.md) |
| Agents (layout, reviewer, parts librarian) | [docs/en/agents.md](docs/en/agents.md) | [docs/es/agentes.md](docs/es/agentes.md) |
| Roadmap | [ROADMAP.md](ROADMAP.md) | [docs/es/hoja-de-ruta.md](docs/es/hoja-de-ruta.md) |
| Planning | [PLANNING.md](PLANNING.md) | [docs/es/planeacion.md](docs/es/planeacion.md) |

## Roadmap and planning

- [ROADMAP.md](ROADMAP.md): stages, what is done and what comes next.
- [PLANNING.md](PLANNING.md): architecture, considerations, best practices and the decision log.

Now: **stage 1 done** (static SVG with correct placement). Next: simulation (DC first),
then animation in the browser, then an interactive page for phones and tablets.

## License

MIT. See [LICENSE](LICENSE).
