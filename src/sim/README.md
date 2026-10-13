# Simulator (planned)

Nothing here yet. The drawing pipeline already produces what the simulator needs:

- `netlist.nodes`: every connected group of holes and the part pins in it;
- `part.def.electrical`: what each part is electrically (`{ kind: 'R', resistance }`,
  `{ kind: 'C', capacitance }`, `{ kind: 'LED', color }`, `{ kind: 'M', channel }`…).

The plan is modified nodal analysis (MNA), added one kind of part at a time, each one
checked once against a reference (Falstad or a textbook result) and kept as a test:

1. DC, linear: sources, resistors, wires.
2. Non-linear: diodes and LEDs (Newton iteration).
3. Transient: capacitors (backward Euler companion model).
4. Transistors: MOSFET and BJT with simple models.

The results feed the animation stage (electron flow, voltage colours, readouts). The
simulator will never need to know how a part is drawn.

---

# Simulador (planeado)

Todavía no hay nada aquí. El dibujo ya produce lo que el simulador necesita: la lista de
grupos conectados (`netlist.nodes`) y la descripción eléctrica de cada componente
(`part.def.electrical`). Se construirá por etapas, un tipo de componente a la vez, cada
uno comprobado contra una referencia y guardado como prueba.
