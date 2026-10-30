# Documents

*[Español](../es/README.md)*

Every guide of the kit, in English (the reference), with what each one is for. The roadmap and the
planning live at the root: [ROADMAP.md](../../ROADMAP.md), [PLANNING.md](../../PLANNING.md).

<!-- generated: the documents of this folder (npm run docs-index -- --write) -->
- [Adding a part, a package or a board](adding-parts.md): Start with the smallest change that works.
- [Agent interface: resume, inspect, change](agent-interface.md): How an assistant, an agent or a script picks up an existing circuit and changes it safely.
- [Agents](agents.md): Three Claude Code subagents, defined in `.claude/agents/`, split the work so the main conversation stays light.
- [Architecture](architecture.md): The split between **type** and **package** is what makes parts reusable: a 1N4007 diode and a resistor share the axial package; an IRLZ44N MOSFET and a TIP120 transistor share TO-220.
- [Circuit file format (version 1)](circuit-format.md): Keys are in English, so the format is the same in every language.
- [Code map](code-map.md): Where everything lives and how the pieces talk to each other.
- [Embedding a circuit in documentation](embedding.md): Every circuit has one page meant to be embedded: `out/<name>.html`, next to its other outputs.
- [Falstad: open the circuit there, and compare both simulators](falstad.md): [Falstad's CircuitJS](https://www.falstad.com/circuit/) is the most used in-browser circuit simulator for learning.
- [Focus and the current layer](focus-and-flow.md): Two ways to point at what matters in a drawing, built from the same pieces (`src/render/focus.js`, `src/sim/flow.js`) for static images and for the interactive page.
- [Inspecting and annotating a drawing](inspect-and-annotate.md): Two tools to know exactly what a drawing contains, without having to look at it.
- [Layout: the algorithm that places a whole circuit](layout.md): `layout` turns a list of parts (without holes) and the nets that join them into a placed, wired and reviewed circuit, in about a second, with no trial and error by whoever calls it.
- [Live simulation (stage 3): design and plan](live-simulation.md): The embeddable page (`out/<name>.html`) gets a real simulation running in the browser, in the spirit of Falstad's CircuitJS: continuous time, capacitors charging in front of you, sliders that re-solve at once, current drawn as dots moving along the real conductors, voltage as colour, and parts that show when they are pushed past their limits.
- [MCP server](mcp.md): `mcp/server.js` exposes the kit as [Model Context Protocol](https://modelcontextprotocol.io) tools, so any compatible assistant (Claude Code, Claude Desktop, other agents) can resume, inspect and change circuits with typed inputs and short structured answers.
- [Microcontrollers in the simulation](microcontrollers.md): How the kit simulates development boards (ESP32 DevKit, ESP32-C3 SuperMini, Arduino UNO): not the processor, but what a learner sees at the pins.
- [Recipes: lesson circuits by name](recipes.md): A recipe is a `layout` spec the kit keeps for a usual lesson circuit: its parts with default values, in signal order, its nets and its supply.
- [Simulation](simulation.md): The kit computes the voltage of every connected group and the current through every part, from the same circuit file that draws the board.
- [Stage and video: design and plan](stage-and-video.md): The live page learns to **tell** a circuit step by step: a declarative timeline that the page plays as a tour, and that a script turns into the frames of a short video, under one external clock, so the same file gives the same pictures every time.
- [Translating](translating.md): There are two things to translate, and they are independent.
- [User experience pass: design and plan](ux-pass.md): Stage 3 left the page with many useful features: views, framing, labels, the current layer, time controls, Falstad, cards for parts and strips with their values, sliders and oscilloscope, a controls panel and warnings.
<!-- /generated -->
