# Inspeccionar y anotar un dibujo

*[English](../en/inspect-and-annotate.md)*

Dos herramientas para saber exactamente qué contiene un dibujo, sin tener que mirarlo.

## `inspect`: el dibujo en números

```bash
node bin/protoboard-iso.js inspect examples/led-resistor.json [--view back] [--fit parts] [--scale 8] [--lang es] [--json]
```

Arma la misma escena que dibujaría `render` e informa:

| Para cada componente | Qué es |
|---|---|
| patas | cada pata: agujero (`c9`), grupo conectado (`9:a-e`), posición en la protoboard en mm y en pantalla en px |
| caja | el rectángulo de pantalla que ocupa el componente, en px |
| visible | qué parte del componente no tapan los demás, y quién tapa el resto |
| etiqueta | el texto del globo, su fila y su posición |

| Problemas que detecta | Gravedad |
|---|---|
| `PART_HIDDEN`: un componente se ve menos del 85 % (menos del 50 %: aviso) | nota / aviso |
| `LABEL_COVERS_PART`, `LABEL_OVERLAP`: una etiqueta tapa un componente u otra etiqueta | aviso |
| `LABEL_HIDES_TEXT`: una etiqueta tapa una etiqueta impresa de riel («+5 V») | nota |
| `LEADER_CROSSING`, `LEADER_OVER_PART`: líneas guía que se cruzan o pasan sobre componentes | nota |
| `TEXT_TOO_SMALL`: marcas de los componentes de menos de 6 px de alto a esta escala | nota |

También incluye las observaciones de colocación de `check`. `--json` imprime el informe
completo, para herramientas y pruebas.

**Cómo se mide lo visible.** Cada polígono de cada componente se rellena, en el orden en
que se pinta, en una cuadrícula de una celda por píxel que recuerda qué componente pintó
cada celda por última vez (`src/render/coverage.js`). La parte visible de un componente
son las celdas que pintó y que al final siguen siendo suyas. Se mide exactamente lo que se
dibuja.

Los umbrales están en `INSPECT_LIMITS` (`src/inspect.js`).

## `--annotate`: capas extra sobre el dibujo

```bash
node bin/protoboard-iso.js render circuito.json -o salida.svg --annotate pins,nodes
node bin/protoboard-iso.js render circuito.json -o salida.svg --annotate all
```

| Capa | Dibuja |
|---|---|
| `pins` | el nombre del agujero en cada pata, con un anillo sobre el agujero |
| `nodes` | cada grupo conectado en uso, coloreado sobre la protoboard, un color por grupo (las etiquetas de las patas toman el mismo color) |
| `boxes` | una caja punteada y el id alrededor de cada componente: lo que ocupa exactamente en pantalla |
| `grid` | todas las columnas numeradas, no solo 1, 5, 10… |

Las etiquetas de las patas buscan un lugar libre alrededor de su agujero, así que nunca se
montan entre sí ni sobre el anillo de un agujero. Se pueden combinar; `all` activa todas. Van en su propio grupo,
`<g class="annotations">`; `nodes` y `grid` se imprimen sobre la protoboard misma, por
debajo de los componentes. Sirven para señalar un agujero exacto, para enseñar cómo se
conectan las tiras o para revisar un montaje.

En la API: `renderCircuit(circuit, { annotate: ['pins', 'nodes'] })` e
`inspectCircuit(circuit, options)` / `formatReport(report, lang)`.
