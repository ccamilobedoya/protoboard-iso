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
                                                    │      ▲ capas: under, board, parts, labels, annotations,
                                                    │      │ veil, strips, spotlight, flow, results, probes
                                                    └─▶ simulate (sim/) ─▶ resultados ─┘
                                                                           └─▶ texto (sim/format.js)

página (page.js) = un SVG interactivo por vista + JSON para la ficha ─▶ out/<nombre>.html
                    └─ en el navegador: page/client/*.js (comportamiento, agrupado por node/bundle.js), page/style.js (CSS)
```

1. **Dibujo.** `src/index.js` (`renderCircuit`, `sceneFor`, `addLayers`) arma la escena: la
   protoboard y los componentes como primitivas ordenadas por profundidad (algoritmo del pintor),
   las etiquetas como globos por encima de todo y después las capas opcionales. `render/svg.js`
   la escribe. `inspect.js` mide esa misma escena, así los números y el dibujo nunca difieren.
2. **Simulación.** `sim/index.js` convierte la netlist y el `def.electrical` de cada componente (a
   través de su dispositivo, `sim/devices/`) en
   elementos MNA (`sim/mna.js`), resuelve DC o transitorio y lee los resultados por grupo,
   componente y pata. El dibujo nunca depende de ella; solo agrega capas cuando se le piden.
3. **Página.** `page.js` dibuja cada vista con `interactive: true` (cada elemento marcado con
   `data-part`, tiras y sondas listas pero ocultas) y escribe un JSON (`#page-data`) con lo que dice
   cada ficha. `page/client/` solo cambia clases y reglas CSS; nunca vuelve a dibujar.

## Módulos

| Ruta | Qué hace |
|---|---|
| `core/` | vectores, cámara isométrica y vistas, unidades (`parseValue`, `formatValue`) |
| `geometry/primitives.js` | prismas, tornos, tubos, calcomanías, texto sobre planos (3D, milímetros) |
| `board/` | protoboards como datos (`boards/bb830.js`), agujeros y grupos, dibujo de la protoboard |
| `parts/types/` | qué *es* un componente: valor → bandas, patas, etiqueta, modelo `electrical` (`battery.js`; `more.js`: inductor, termistor, LDR, zumbador, pines) |
| `parts/packages/` | formas físicas con medidas de hoja de datos; `expandPin1` para DIP y pines; `battery.js` queda al lado de la protoboard (su `build` recibe la protoboard); `small.js`: gota, LDR, zumbador, pines; `trimmer.js`; `sip.js`: puente KBP (`kbp`); `devboard.js` (placas ESP32 a caballo del canal) `uno.js` (UNO al lado de la protoboard) y `despi.js` (adaptador e-paper DESPI-C02 y su panel), con lo que comparten en `offboard.js` (texto impreso, cable Dupont); datos en `parts/modules.js`; `axial.js` también dibuja las resistencias de cemento (`shape: 'box'`) |
| `parts/db.js` | referencias: encapsulado, orden de patas, modelo; `lookupPartNumber` acepta otros nombres (L7805CV, 2SC1815) |
| `parts/batteries.js` | formatos y químicas de baterías: medidas, curva de voltaje, resistencia interna, capacidad; `batteryModel` |
| `parts/sensors.js` | fórmulas de los sensores (NTC, fotorresistencia) y la tabla GL55xx; sin imports, para que el motor del navegador pueda incluirlas |
| `parts/describe.js` | qué texto `describe.*` dice qué es cada tipo de componente |
| `parts/colors.js` | todos los colores: materiales, bandas, LED, cables, grupos |
| `circuit/build.js` | archivo de circuito → componentes colocados, netlist, observaciones |
| `circuit/checks.js` | comprobaciones de colocación, idiomas de las descripciones |
| `render/scene.js` | algoritmo del pintor, globos de las etiquetas, encuadre (`fit`) |
| `render/svg.js` | escritor de SVG; `tagParts` agrega `data-part`; capas opcionales solo si tienen algo |
| `render/focus.js` | velo, tiras metálicas, etiquetas de columna y fila (`coords`), copias en primer plano (foco estático) |
| `render/coverage.js`, `inspect.js`, `annotate.js` | medir el dibujo; capas de anotación |
| `ops.js`, `diff.js`, `node/workspace.js` | operaciones con inversa, diferencia en seco, historial, deshacer, salidas |
| `query.js`, `query-format.js`, `review.js` | preguntas, colocaciones, veredicto a partir de mediciones |
| `schema.js` | JSON Schemas armados desde los registros (`npm run schemas`) |
| `sim/models.js` | valores típicos de los dispositivos, cada uno con su fuente (diodos, tabla Zener, LED, transistores, reguladores) |
| `sim/mna.js` | solucionador lineal, estampado, modelos de los elementos (capacitor, inductor), unión con ruptura Zener, regulador, Newton, subida de fuentes |
| `sim/index.js` | fuentes, componentes → elementos a través de sus dispositivos, grupos flotantes (anclados en DC), DC y transitorio, lecturas, avisos a partir de los esfuerzos |
| `sim/devices/` | un archivo por tipo de componente: elementos, lectura, límites como esfuerzos, líneas de la ficha, etiqueta de corriente, texto de la sonda; `index.js` los lista y describe la interfaz; `shared.js`, lo común |
| `sim/format.js` | resultados como texto; `partLines` para la ficha (cada una con su clave de explicación) |
| `sim/overlay.js` | etiquetas de resultados (corriente por componente, voltaje por grupo) con `data-q` y `data-probe` |
| `sim/look.js`, `sim/lines.js` | se pueden agrupar: colores de voltaje, velocidad de los puntos, degradado en los cuerpos, brillo y calor (look); las líneas de la ficha con los textos que se le pasan (lines) |
| `page/client/live.js` | la página en vivo: corre el motor, mueve los puntos, repinta colores, etiquetas y ficha, controles de tiempo |
| `page/client/controls.js`, `page/client/limits.js` | página en vivo: deslizadores (ficha y panel `page.controls`) y el pulsador momentáneo; contornos de esfuerzo (reglas en `#stress`), marcas que se quedan y el panel de avisos (en `.side`) |
| `sim/controls.js` | se puede agrupar: controles de las fuentes, cuentas de los deslizadores (log, E24), niveles de esfuerzo; los controles de cada dispositivo están en su módulo (`controls`, `set`) |
| `sim/paths.js` | vista de conductores: caminos de la corriente por componente (`paths` del paquete o una recta de respaldo), corriente de las tiras (Kirchhoff), colores de voltaje, puntos de corriente convencional |
| `sim/probes.js` | «de dónde sale un valor»: puntas para voltajes, flechas para corrientes |
| `page.js`, `page/client/`, `page/style.js` | la página para embeber; `page/client/main.js` es la entrada de su script (módulos view, focus, card, tooltip) |
| `node/bundle.js` | el agrupador pequeño: módulos ES permitidos → un solo script clásico para la página (motor, script de la página) |
| `sim/recorder.js`, `sim/scope.js`, `page/client/scope.js` | osciloscopio (se pueden agrupar): grabación por componente desde el arranque, qué grafica cada tipo (gancho `scope`), el dibujo en la ficha (una lista de trazas, pantalla de 10 × 4) |
| `sim/falstad.js`, `sim/falstad-layout.js`, `page/client/falstad.js` | exportar a CircuitJS de Falstad (se puede agrupar): cada dispositivo escribe su parte con `falstad(d, f)`; el acomodo la dibuja como esquema (nodos en filas por voltaje, componentes en serie en una columna, el orden de columnas con menos cruces); el botón *Abrir en Falstad* de la página en vivo, con sus avisos. Comparación: `test/falstad/`, `scripts/falstad.js` ([falstad.md](falstad.md)) |
| `sim/compile.js`, `sim/engine.js` | compilar: circuito → programa (JSON plano, solo Node); motor: corre un programa (sin dependencias, va dentro de las páginas) |
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
- **Componentes fuera de la protoboard** (baterías): se dibujan como cualquier componente;
  `sceneFor` manda a la capa `under`, que se pinta antes que la protoboard, las piezas que quedan
  más allá de una cara lateral, del lado opuesto a la cámara. Lo que mira las capas de los
  componentes (inspect, el foco, el script de la página) lee `under` y `parts` juntas.
- **Orden del pintor**: se ordenan primitivas enteras por el centro de sus caras, así que una pieza
  larga junto a otras pequeñas se corta en tajadas (pilas, paredes del portapilas). Antes de añadir
  una pista de orden, revisar si la geometría misma está bien: el botón + sobre la pared del
  portapilas sí se veía, porque la pared era demasiado baja para una vista desde 35° arriba.
- **Piezas apoyadas sobre otras**: una primitiva puede nombrar su soporte con `on` (una
  primitiva o una lista): un chip sobre una placa, el blindaje sobre el módulo ESP32, una placa
  sobre sus tiras de pines. El pintor la dibuja después de su soporte, digan lo que digan sus
  centros (`supportsFirst` en `render/scene.js`). Sirve para todo lo que va sobre una pieza grande
  y plana; cortar en tajadas (como las pilas) es para piezas largas junto a otras pequeñas.
- **Marcas repetidas alrededor de una pieza redonda** (el valor del electrolítico) llevan
  `minFacing` en el calco: solo se ve cuando mira al observador así de de frente. Las vistas
  isométricas miran a 45° de la protoboard, así que con copias cerca de las diagonales sale
  exactamente una por vista.
- **Fuentes**: la primera de `supplies` fija la tierra; sin `supplies`, la primera batería. El
  código que necesita saber «dónde está la fuente» (la punta de tierra, la corriente) debe
  atender los dos casos.
- **Las capas** se escriben siempre en el orden de `addLayers`: veil, strips, coords, spotlight, flow,
  marks (página en vivo: una caja oculta alrededor de cada componente, que se ve cuando se acerca a un
  límite o lo pasa), spotlabels (copias de las etiquetas de los componentes en foco, encima de la corriente), results, probes. Una página las muestra u oculta solo con CSS; lo interactivo nuevo debe seguir
  la misma idea (marca en el SVG, regla en el CSS). Las etiquetas de coordenadas van debajo de la
  copia en primer plano para no tapar el componente que se explica, pero las de resultados todavía
  pueden taparlas: límite conocido, pendiente de una pasada planeada sobre qué tapa a qué (ver la
  hoja de ruta, estilo visual).
- **Atributos `data-*`**: `data-part` (id del componente), `data-node` (grupo), `data-q` (magnitud de
  una etiqueta de resultados, que es también su clave de explicación), `data-probe` (`node:<grupo>` o
  `part:<id>`), `data-flow`, `data-col` / `data-row` (etiquetas de coordenadas).
- **Los resultados son un modelo** y pueden adelantar una predicción: se dibujan solo si se piden
  (`sim`, `flow`), y en una página solo si el circuito lo pide (`page.results`, `page.flow`) y solo
  para el componente tocado.
- **Controles** (`controls`, `set` de un dispositivo) corren en la página: `set` es una fórmula
  pura y solo puede importar módulos que se agrupan (`ALLOWED` en `node/bundle.js`). Un
  dispositivo que agregue sus elementos en otro orden tras un cambio pierde su estado en
  `engine.set` (se empareja por orden).
- **Orden de pintado de la vista de conductores** (`flowOps`, `paintOrder` en `sim/paths.js`):
  primero las tiras (están dentro de la protoboard), luego una línea por pata, ordenadas donde dos
  se cruzan en pantalla según cuál está más cerca ahí (orden topológico, por vista); la profundidad
  del centro solo para lo que eso deja abierto. No ordenar solo por el centro: las piezas largas
  (una resistencia) quedaban encima de un cable que las cruza. La página encuentra las piezas por
  `data-wire` / `data-seg`, nunca por su orden.
- **Nada de filtros CSS en páginas animadas** (`drop-shadow`, `blur`): todo el SVG se vuelve a
  dibujar en cada cuadro en que se mueven los puntos, y el filtro se recalcula cada vez (un contorno
  hecho así dejó la página lentísima). Dibujar la forma una vez en una capa y cambiar su `display`,
  `stroke` u `opacity`; animar en pocos `steps()`. Los puntos se saltan los cambios de
  desplazamiento demasiado pequeños para verse.
- **Los elementos SVG no tienen la propiedad `hidden`**; usa el atributo. Los scripts de la página se
  prueban con jsdom (`test/focus.test.js`), que sigue la especificación del DOM.
- **Los agentes dependen del kit** (`.claude/agents/*.md`): se actualizan con cualquier cambio de
  herramienta, comando, operación o formato; `npm run test:mcp` detecta herramientas que ya no existen.

## Pruebas

`npm test` (node:test, sin dependencias; jsdom solo para los scripts de la página) y
`npm run test:mcp`. Los modelos del simulador se comprueban contra referencias independientes en
`test/sim.test.js` y `test/sources.test.js` (baterías, Zener, reguladores, inductores,
sensores) y contra CircuitJS de Falstad en `test/falstad.test.js` (referencias guardadas, sin red); el comportamiento de la página en `test/focus.test.js` y `test/page.test.js`;
los textos en `test/describe.test.js` y `test/i18n.test.js`.
