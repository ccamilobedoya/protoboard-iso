# Mapa del código

*[English](../en/code-map.md)*

Dónde vive cada cosa y cómo se hablan las piezas. Léelo primero al volver al código (personas y
asistentes por igual); las razones de diseño están en [planeacion.md](planeacion.md) y las guías
de uso en las demás páginas de `docs/`.

## Tres recorridos

```text
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
| `parts/packages/` | formas físicas con medidas de hoja de datos; `expandPin1` para DIP y pines; `battery.js` queda al lado de la protoboard (su `build` recibe la protoboard); `small.js`: gota, LDR, zumbador, pines; `trimmer.js`; `sip.js`: puente KBP (`kbp`); `devboard.js` (placas ESP32 a caballo del canal) `uno.js` (UNO al lado de la protoboard) y `despi.js` (adaptador e-paper DESPI-C02 y su panel), con lo que comparten en `offboard.js` (texto impreso, cable Dupont); datos en `parts/modules.js`; `axial.js` también dibuja las resistencias de cemento (`shape: 'box'`); `ams1117.js`: el módulo AMS1117 de pie sobre pines en ángulo (sus piezas de una sola cara, `side`); `switch.js`: basculante KCD1 y pulsador de enclavamiento 7 × 7 sobre la mesa, cableados con `wireToHole` (`offboard.js`) |
| `parts/db.js` | referencias: encapsulado, orden de patas, modelo; `lookupPartNumber` acepta otros nombres (L7805CV, 2SC1815) |
| `parts/batteries.js` | formatos y químicas de baterías: medidas, curva de voltaje, resistencia interna, capacidad; `batteryModel` |
| `parts/sensors.js` | fórmulas de los sensores (NTC, fotorresistencia) y la tabla GL55xx; sin imports, para que el motor del navegador pueda incluirlas |
| `parts/describe.js` | qué texto `describe.*` dice qué es cada tipo de componente |
| `parts/colors.js` | todos los colores: materiales, bandas, LED, cables, grupos |
| `circuit/build.js` | archivo de circuito → componentes colocados, netlist, observaciones |
| `circuit/checks.js` | comprobaciones de colocación (agujeros, patas, conexiones, cuerpos que chocan, patas y cables que atraviesan otros componentes), idiomas de las descripciones |
| `render/scene.js` | algoritmo del pintor, globos de las etiquetas, encuadre (`fit`) |
| `render/svg.js` | escritor de SVG; `tagParts` agrega `data-part`; capas opcionales solo si tienen algo |
| `render/focus.js` | velo, tiras metálicas, etiquetas de columna y fila (`coords`), copias en primer plano (foco estático) |
| `render/coverage.js`, `inspect.js`, `annotate.js` | medir el dibujo; capas de anotación |
| `ops.js`, `diff.js`, `node/workspace.js` | operaciones con inversa, diferencia en seco, historial, deshacer, salidas; `relayoutTarget` (volver a montar en una sola revisión) |
| `limits.js` | topes de tamaño de la entrada externa (bytes del circuito, componentes, operaciones, largo del programa) y sus errores; los comprueban `ops.js`, `node/workspace.js`, `sim/compile.js` y `sim/sketch.js` (CLAUDE.md, «External input») |
| `parts/resolve.js` | un componente a partir de lo que escribe una persona (`resolvePart`: número de parte, módulo, alias como KCD1 o resistencia; `closestNames` si no lo conoce), `pinsOf`; los alias en `PART_ALIASES` |
| `parts/pin-names.js` | una pata a partir de lo que escribe una persona (`findPin`: el nombre exacto sin distinguir mayúsculas, luego sinónimos como K/cathode, DISCH/DIS, VDD/VCC, luego números de GPIO en las placas; nada si no es única); la usan los circuitos, `query`, `suggest` y `layout` |
| `recipes/` | circuitos de clase como especificaciones de `layout`, un módulo de datos por receta (`led-resistor.js`, `npn-switch.js`…); `index.js`: el registro, `expandRecipe` (nombre + valores → especificación, solo los valores que lista cada receta), `resolveRecipe` (un pedido a `layout` con `recipe` → especificación, para la consola y el MCP), las entradas del catálogo ([recetas.md](recetas.md)) |
| `layout.js` | un circuito entero a partir de sus componentes y redes (`validateSpec` primero: todos los problemas de una vez; `autoLayout`: capas, reglas de colocación comprobadas solo con geometría, cables, se rehace mientras la revisión bloquea algo), `checkNets` (redes pedidas contra las armadas), `formatLayout`; CLI `layout`, MCP `layout`; cómo funciona y cómo cambiarlo: [montaje-automatico.md](montaje-automatico.md), banco `npm run layout-bench` |
| `query.js`, `query-format.js`, `review.js` | preguntas, colocaciones (`suggest`, `suggestMany`; grupos por agujero, nombre o pata ya colocada; reserva espacio para las conexiones que faltan con cables de prueba, mira un nivel adelante y da `reasons` cuando nada cabe), veredicto a partir de mediciones (lo que bloquea, con sus componentes y vistas) |
| `nets.js` | el circuito como redes: grupos unidos por cables, con sus patas (MCP `netlist`, CLI `nets`); `checkNets`: las redes pedidas contra el circuito (la usan `layout` y `review` para el `spec` de un circuito) |
| `node/catalog.js` | lo que conoce el kit, compacto o una entrada en detalle con sus campos (`TYPE_FIELDS`, al día con el esquema gracias a una prueba) y un ejemplo de `examples/` |
| `schema.js` | JSON Schemas armados desde los registros (`npm run schemas`) |
| `sim/models.js` | valores típicos de los dispositivos, cada uno con su fuente (diodos, tabla Zener, LED, transistores, reguladores) |
| `sim/mna.js` | solucionador lineal, estampado, modelos de los elementos (capacitor, inductor), unión con ruptura Zener, regulador, Newton, subida de fuentes |
| `sim/index.js` | fuentes, componentes → elementos a través de sus dispositivos, grupos flotantes (anclados en DC), DC y transitorio, lecturas, avisos a partir de los esfuerzos |
| `sim/devices/` | un archivo por tipo de componente: elementos, lectura, límites como esfuerzos, líneas de la ficha, etiqueta de corriente, texto de la sonda; `index.js` los lista y describe la interfaz; `shared.js`, lo común; un dispositivo puede aceptar (`accepts`) solo algunos componentes de su tipo (`timer.js` toma el NE555 entre los circuitos integrados, `opamp.js` los amplificadores operacionales y comparadores, `mcu.js` las placas con microcontrolador: pines en su estado de `io`, la placa con USB como fuente, su programa corrido por `sim/program.js` a partir del JavaScript que `sim/sketch.js` hace del programa de Arduino); el programa guarda el dispositivo de cada componente por su tipo de lectura (`deviceOfProgram`) |
| `sim/format.js` | resultados como texto; `partLines` para la ficha (cada una con su clave de explicación) |
| `sim/overlay.js` | etiquetas de resultados (corriente por componente, voltaje por grupo) con `data-q` y `data-probe` |
| `sim/look.js`, `sim/lines.js` | se pueden agrupar: colores de voltaje, velocidad de los puntos, degradado en los cuerpos, brillo y calor (look); las líneas de la ficha con los textos que se le pasan (lines) |
| `page/client/live.js` | la página en vivo: corre el motor, mueve los puntos, repinta colores, etiquetas y ficha, controles de tiempo |
| `page/client/controls.js`, `page/client/limits.js` | página en vivo: deslizadores (ficha y panel `page.controls`) y el pulsador momentáneo; contornos de esfuerzo (reglas en `#stress`), marcas que se quedan y el panel de avisos (en `.side`) |
| `sim/controls.js` | se puede agrupar: controles de las fuentes, cuentas de los deslizadores (log, E24), niveles de esfuerzo; los controles de cada dispositivo están en su módulo (`controls`, `set`) |
| `sim/paths.js` | vista de conductores: caminos de la corriente por componente (`paths` del paquete o una recta de respaldo), corriente de las tiras (Kirchhoff), colores de voltaje, puntos de corriente convencional |
| `sim/probes.js` | «de dónde sale un valor»: puntas para voltajes, flechas para corrientes |
| `page.js`, `page/client/`, `page/style.js` | la página para embeber; `page/client/main.js` es la entrada de su script (módulos view, focus, card, tooltip); `view.js`: encuadre, gestos según el contexto, botones de zoom; `bar.js`: el menú ⋯ (`page.menuAdd`) y la ayuda de primera vez; `icons.js`: los íconos de línea, compartidos con `page.js`; `inspector.js`: la caja de la ficha (`.info`) y de los paneles del circuito (`.side`), pestañas, panel u hoja inferior, mantener a la vista los componentes elegidos |
| `scripts/ux-shots.js` | capturas de páginas en cinco tamaños, solas y dentro de una nota (un fragmento de Playwright), para la pasada de experiencia de uso |
| `scripts/readme-images.js`, `docs/img/` | las imágenes del README y de los ejemplos, dibujadas por el kit a partir de recetas y ejemplos (PNG); `live-page.png` es una captura de `ux-shots.js` |
| `scripts/demo-site.js`, `.github/workflows/pages.yml` | el sitio de demostración en GitHub Pages: cada receta y cada ejemplo con fuente como página en vivo (en, es) y un índice; lo genera el flujo de trabajo, nunca se sube |
| `scripts/verify.js`, `scripts/setup.js`, `scripts/hooks/` | `npm run verify`: toda la verificación en un comando (pruebas con cobertura, lint, knip, jscpd, MCP, golden, los avisos esperados de los ejemplos en `test/fixtures/examples-issues.json`), sale con 0/1/2; `npm run setup` activa los hooks de git (pre-commit `--quick`, pre-push todo) |
| `scripts/report-status.js` | la línea `STATUS:` con que termina cada informe de agente, comprobada contra el informe |
| `.github/workflows/ci.yml`, `.github/dependabot.yml`, `scripts/github-ruleset.js` | la CI: `npm run verify` en cada push y pull request, en las versiones de Node que promete `engines`, con gitleaks fijado por suma de control; actualizaciones semanales agrupadas (npm en la raíz y en `mcp/`, las acciones, todas fijadas por SHA); el ruleset de `main` (los trabajos de la CI obligatorios, sin push forzado) y el escaneo de secretos, que aplica el dueño |
| `CHANGELOG.md` | qué cambió en cada versión; cada una publicada tiene una etiqueta `v<versión>` y la más nueva es la de `package.json` (`test/changelog.test.js`) |
| `biome.jsonc`, `knip.json`, `.jscpd.json`, `.c8rc.json` | solo herramientas de desarrollo: reglas de lint (y por qué algunas están apagadas), puntos de entrada, tope de copias, umbrales de cobertura |
| `node/bundle.js` | el agrupador pequeño: módulos ES permitidos → un solo script clásico para la página (motor, script de la página) |
| `sim/generator.js` | el generador de señales (se puede agrupar): las ondas (las de Falstad), su pico; el motor pone la fuente en `waveAt` antes de cada paso |
| `sim/recorder.js`, `sim/scope.js`, `page/client/scope.js` | osciloscopio (se pueden agrupar): grabación por componente (y por tira en uso, clave `node:<grupo>`) desde el arranque, qué grafica cada tipo (gancho `scope`), el dibujo en la ficha (una lista de trazas, pantalla de 10 × 4) |
| `page/client/view.js` `stripAt`, `page/client/card.js` `selectNode`, `sim/lines.js` `nodeLines` | la ficha de una tira (fase 9): el toque se encuentra por posición en `hits` (las tiras quedan debajo de los componentes), qué está conectado, su voltaje respecto a tierra y la corriente de cada pata |
| `sim/falstad.js`, `sim/falstad-layout.js`, `page/client/falstad.js` | exportar a CircuitJS de Falstad (se puede agrupar): cada dispositivo escribe su parte con `falstad(d, f)`; el acomodo la dibuja como esquema (nodos en filas por voltaje, componentes en serie en una columna, el orden de columnas con menos cruces); el botón *Abrir en Falstad* de la página en vivo, con sus avisos. Comparación: `test/falstad/`, `scripts/falstad.js` ([falstad.md](falstad.md)) |
| `sim/compile.js`, `sim/engine.js` | compilar: circuito → programa (JSON plano, solo Node); motor: corre un programa (sin dependencias, va dentro de las páginas) |
| `i18n/` | todas las frases; `pickLanguage` decide el idioma |
| `bin/protoboard-iso.js` | línea de comandos |
| `mcp/server.js`, `mcp/tools.js`, `mcp/kit-worker.js` | servidor MCP (paquete propio): `tools.js` define las herramientas, que llaman a las mismas funciones; `server.js` las registra y las corre en un *worker* que reinicia cuando cambia el código del kit |

## Convenciones fáciles de romper

- **Privacidad.** El repositorio es público: nada de nombres, correos, rutas privadas, nombres de
  equipos, ids de la app de notas ni los equipos propios del mantenedor en ningún archivo versionado.
  `test/privacy.test.js` revisa los archivos versionados y nuevos con patrones genéricos y con las
  palabras personales de un `privacy.local.txt` fuera de git (CLAUDE.md, «Privacy»), y los nombres
  que nunca se versionan; la revisión está en `test/privacy/scan.js` (nombres leídos con
  `git ls-files -z`, texto en NFC), probada con sus casos en la prueba.
- **Entrada externa.** Un circuito, unas operaciones o un programa pueden venir de cualquiera:
  topes de tamaño en `limits.js`, un archivo de programa solo desde la carpeta del circuito, nada
  de la entrada corre como código (un programa solo a través de `sim/sketch.js`, cuya salida no
  nombra nada más que el entorno de ejecución), todo texto escapado. `test/attack.test.js` le da
  entradas hostiles (CLAUDE.md, «External input»).
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
- **Piezas en una cara de una placa de pie** (el módulo AMS1117): llevan además `side`, la normal
  de esa cara. Vistas desde esa cara, el pintor las dibuja después de la placa (`on`); desde la
  otra, justo antes, así la placa las tapa y solo se ve lo que asoma por el costado.
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
  (`sim`, `flow`), y en una página siempre que el circuito se pueda simular (`pageSimulation` en
  `sim/index.js`: resultados siempre activos y el botón Corriente por defecto con fuente;
  `page.results: false`, `page.flow: false`, o `page.simulation: false` para las dos), y solo para
  el componente tocado. Los LED encendidos son la capa `lights` (`lightOps` en `sim/paths.js`), que
  se dibuja con los resultados.
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
  prueban con jsdom (`test/focus.test.js`), que sigue la especificación del DOM;
  `loadPage(html, { embedded: true })` en `test/page.test.js` carga una página dentro de un iframe.
- **Los colores de la página son tokens** (`page/style.js`, `:root`, claro y oscuro): nunca un
  valor hex fuera de los bloques de tokens (`test/page.test.js` lo revisa). Los colores del dibujo en
  la página se cambian con CSS sobre los atributos de presentación del SVG (fondo, velo, etiquetas,
  etiquetas de resultados por `data-q`), así el SVG estático nunca cambia. El código del cliente pone
  clases, no colores (el osciloscopio: `kind: 'v' | 'i'`; los límites: `var(--warn)`).
- **La barra** (`page.js`, pasada de experiencia de uso U3): un botón de dos estados lleva
  `data-key`, `data-on` y `data-off` (main.js alterna entre ellos y pone `aria-pressed`); las
  opciones del menú ⋯ son `role="menuitemradio"` con `data-value` (`aria-checked`). Las etiquetas
  van en `.label` (se ocultan en una pantalla angosta, así que cada botón tiene `title`). Los módulos
  ponen lo que se usa poco en el menú con `page.menuAdd(el)`, nunca como grupos nuevos de la barra.
- **El inspector** (`inspector.js`, U4): card.js llena `.info`, los módulos en vivo ponen sus paneles
  en `.side` (`page.side`); ninguno posiciona nada. card.js llama a `page.cardChanged()` después de
  abrir o cerrar una ficha; los paneles que aparecen o se ocultan los ve un MutationObserver. El
  encabezado de la ficha (`.head`: título y botones de íconos) y `.summary` son lo que muestra la
  hoja asomada, así que van primero.
- **Mover el encuadre** (`view.js`, U5): los gestos usan `setBox` (al instante, y detiene cualquier
  movimiento); los botones y el código que mueven el encuadre por el estudiante usan `frameTo`
  (220 ms, interrumpible). Cambiar de vista pasa por `flipView` + `flipFrame` (inmediato); `show()` en main.js
  cambia el encuadre solo cuando cambió la vista o el encuadre.
- **Las vistas son `main > svg`**: los botones también llevan íconos svg, así que nunca se selecciona
  `main svg`. Las cajas de la interfaz dentro de `main` (el inspector, los botones de zoom) están
  en `page.inChrome`, así un toque o un gesto sobre ellas no es un toque en la protoboard.
- **Gestos según el contexto** (`page/client/view.js`, pasada de experiencia de uso U1):
  `page.embedded` (dentro de un iframe y no en pantalla completa) y `body.embedded`; embebida, el
  tacto va por los eventos táctiles (un dedo se deja al navegador, dos se manejan), la rueda sola no
  se cancela. Los cambios de gestos se revisan también en un navegador real (`scripts/ux-shots.js`,
  emulación táctil por CDP): jsdom no desplaza.
- **Opciones de Claude Code** (`.claude/settings.json`, compartido): reglas `deny` y un hook que
  mantienen las herramientas lejos de los secretos, una sola lista de nombres de secretos
  (`.claude/hooks/secret-paths.js`) para el hook y la prueba de privacidad, y un aviso del trabajo
  sin commit al terminar un turno. Las opciones personales van en `.claude/settings.local.json`.
- **Los agentes dependen del kit** (`.claude/agents/*.md`): se actualizan con cualquier cambio de
  herramienta, comando, operación o formato; `npm run test:mcp` detecta herramientas que ya no existen.

## Pruebas

`npm test` (node:test, sin dependencias; jsdom solo para los scripts de la página) y
`npm run test:mcp`. Los modelos del simulador se comprueban contra referencias independientes en
`test/sim.test.js` y `test/sources.test.js` (baterías, Zener, reguladores, inductores,
sensores) y contra CircuitJS de Falstad en `test/falstad.test.js` (referencias guardadas, sin red); el comportamiento de la página en `test/focus.test.js` y `test/page.test.js`;
los textos en `test/describe.test.js` y `test/i18n.test.js`; que no haya nada privado en el repositorio, en `test/privacy.test.js`; las entradas hostiles, en `test/attack.test.js`; los hooks y las opciones de Claude Code, en `test/hooks.test.js`; las licencias de las dependencias, en `test/licenses.test.js`; los comandos de prueba rápida del README, en `test/readme.test.js`; los enlaces, anclas y bloques de código de los documentos, en `test/docs.test.js`; los archivos y las líneas de estado de los agentes, en `test/agents.test.js`; la línea de comandos estricta, en `test/cli.test.js`; `npm run verify`, en `test/verify.test.js`; la CI, dependabot y el ruleset, en `test/ci.test.js`; el registro de cambios y las etiquetas, en `test/changelog.test.js`. Las pruebas de la página mueven el tiempo con `test/clock.js` (`test/clock.test.js` falla con una espera del reloj real sin un motivo `// real clock:`).
