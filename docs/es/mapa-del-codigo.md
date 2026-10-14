# Mapa del código

*[English](../en/code-map.md)*

Dónde vive cada cosa y cómo se hablan las piezas. Léelo primero al volver al código (personas y
asistentes por igual); las razones de diseño están en [planeacion.md](planeacion.md) y las guías
de uso en las demás páginas de `docs/`.

## Tres recorridos

```
                        ┌─▶ comprobaciones (circuit/checks.js) ─▶ observaciones
circuit.json ─▶ build ──┤
 (circuit/build.js)     └─▶ componentes + netlist ─┬─▶ escena (render/scene.js) ─▶ SVG (render/svg.js)
                                                    │      ▲ capas: board, parts, labels, annotations,
                                                    │      │ veil, strips, spotlight, flow, results, probes
                                                    └─▶ simulate (sim/) ─▶ resultados ─┘
                                                                           └─▶ texto (sim/format.js)

página (page.js) = un SVG interactivo por vista + JSON para la ficha ─▶ out/<nombre>.html
                    └─ en el navegador: page/script.js (comportamiento), page/style.js (CSS)
```

1. **Dibujo.** `src/index.js` (`renderCircuit`, `sceneFor`, `addLayers`) arma la escena: la
   protoboard y los componentes como primitivas ordenadas por profundidad (algoritmo del pintor),
   las etiquetas como globos por encima de todo y después las capas opcionales. `render/svg.js`
   la escribe. `inspect.js` mide esa misma escena, así los números y el dibujo nunca difieren.
2. **Simulación.** `sim/index.js` convierte la netlist y el `def.electrical` de cada componente en
   elementos MNA (`sim/mna.js`), resuelve DC o transitorio y lee los resultados por grupo,
   componente y pata. El dibujo nunca depende de ella; solo agrega capas cuando se le piden.
3. **Página.** `page.js` dibuja cada vista con `interactive: true` (cada elemento marcado con
   `data-part`, tiras y sondas listas pero ocultas) y escribe un JSON (`#page-data`) con lo que dice
   cada ficha. `page/script.js` solo cambia clases y reglas CSS; nunca vuelve a dibujar.

## Módulos

| Ruta | Qué hace |
|---|---|
| `core/` | vectores, cámara isométrica y vistas, unidades (`parseValue`, `formatValue`) |
| `geometry/primitives.js` | prismas, tornos, tubos, calcomanías, texto sobre planos (3D, milímetros) |
| `board/` | protoboards como datos (`boards/bb830.js`), agujeros y grupos, dibujo de la protoboard |
| `parts/types/` | qué *es* un componente: valor → bandas, patas, etiqueta, modelo `electrical` |
| `parts/packages/` | formas físicas con medidas de hoja de datos; `expandPin1` para DIP |
| `parts/db.js` | referencias: encapsulado, orden de patas, modelo |
| `parts/describe.js` | qué texto `describe.*` dice qué es cada tipo de componente |
| `parts/colors.js` | todos los colores: materiales, bandas, LED, cables, grupos |
| `circuit/build.js` | archivo de circuito → componentes colocados, netlist, observaciones |
| `circuit/checks.js` | comprobaciones de colocación, idiomas de las descripciones |
| `render/scene.js` | algoritmo del pintor, globos de las etiquetas, encuadre (`fit`) |
| `render/svg.js` | escritor de SVG; `tagParts` agrega `data-part`; capas opcionales solo si tienen algo |
| `render/focus.js` | velo, tiras metálicas, copias en primer plano (foco estático) |
| `render/coverage.js`, `inspect.js`, `annotate.js` | medir el dibujo; capas de anotación |
| `ops.js`, `diff.js`, `node/workspace.js` | operaciones con inversa, diferencia en seco, historial, deshacer, salidas |
| `query.js`, `query-format.js`, `review.js` | preguntas, colocaciones, veredicto a partir de mediciones |
| `schema.js` | JSON Schemas armados desde los registros (`npm run schemas`) |
| `sim/models.js` | valores típicos de los dispositivos, cada uno con su fuente |
| `sim/mna.js` | solucionador lineal, estampado, modelos de los elementos, Newton, subida de fuentes |
| `sim/index.js` | fuentes, componentes → elementos, grupos flotantes, DC y transitorio, lecturas, avisos |
| `sim/format.js` | resultados como texto; `partLines` para la ficha (cada una con su clave de explicación) |
| `sim/overlay.js` | etiquetas de resultados (corriente por componente, voltaje por grupo) con `data-q` y `data-probe` |
| `sim/flow.js` | corriente por las tiras (Kirchhoff) y por los componentes; puntos en movimiento |
| `sim/probes.js` | «de dónde sale un valor»: puntas para voltajes, flechas para corrientes |
| `page.js`, `page/script.js`, `page/style.js` | la página para embeber |
| `i18n/` | todas las frases; `pickLanguage` decide el idioma |
| `bin/protoboard-iso.js` | línea de comandos |
| `mcp/server.js` | servidor MCP (paquete propio); sus herramientas llaman a las mismas funciones |

## Convenciones fáciles de romper

- **Idioma.** `pickLanguage(pedido, circuit.lang, por defecto)`: un `--lang` o `lang` del MCP
  explícito gana, luego el `lang` del circuito y luego el idioma por defecto (inglés, o
  `PROTOBOARD_LANG` en el servidor MCP). Los archivos escritos tras un cambio siguen la misma
  regla (`outputLang` en `workspace.js`).
- **Los textos para quien aprende** van en `src/i18n`, nunca en el código: `describe.*` (qué es un
  tipo de componente), `explain.*` (qué significa un valor), `probe.*` (de dónde sale un valor),
  `page.*`, `sim.*`. Cada tipo de componente necesita su `describe.*` en cada idioma (lo comprueba
  una prueba).
- **Textos del circuito**: `title` y la `description` de cada componente son un texto plano (se
  muestra tal cual) o un texto por idioma (`check` avisa si falta uno). La `description` de un
  componente es cómo se usa en *este* circuito; se omite cuando quien aprende debe descubrirlo.
- **Las capas** se escriben siempre en el orden de `addLayers`. Una página las muestra u oculta
  solo con CSS; lo interactivo nuevo debe seguir la misma idea (marca en el SVG, regla en el CSS).
- **Atributos `data-*`**: `data-part` (id del componente), `data-node` (grupo), `data-q` (magnitud de
  una etiqueta de resultados, que es también su clave de explicación), `data-probe` (`node:<grupo>` o
  `part:<id>`), `data-flow`.
- **Los resultados son un modelo** y pueden adelantar una predicción: se dibujan solo si se piden
  (`sim`, `flow`), y en una página solo si el circuito lo pide (`page.results`, `page.flow`) y solo
  para el componente tocado.
- **Los elementos SVG no tienen la propiedad `hidden`**; usa el atributo. Los scripts de la página se
  prueban con jsdom (`test/focus.test.js`), que sigue la especificación del DOM.
- **Los agentes dependen del kit** (`.claude/agents/*.md`): se actualizan con cualquier cambio de
  herramienta, comando, operación o formato; `npm run test:mcp` detecta herramientas que ya no existen.

## Pruebas

`npm test` (node:test, sin dependencias; jsdom solo para los scripts de la página) y
`npm run test:mcp`. Los modelos del simulador se comprueban contra referencias independientes en
`test/sim.test.js`; el comportamiento de la página en `test/focus.test.js` y `test/page.test.js`;
los textos en `test/describe.test.js` y `test/i18n.test.js`.
