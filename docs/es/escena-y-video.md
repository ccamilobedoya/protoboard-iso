# Escena y video: diseño y plan

*[English](../en/stage-and-video.md)* · Hoja de ruta: [hoja-de-ruta.md](hoja-de-ruta.md), *Escena y video*

La página viva aprende a **contar** un circuito paso a paso: una línea de tiempo declarativa que la
página reproduce como un recorrido, y que un script convierte en los fotogramas de un video corto,
bajo un solo reloj externo, para que el mismo archivo dé las mismas imágenes cada vez. Un asistente
escribe la línea de tiempo una vez; de ahí en adelante nada lo necesita. El aspecto de ese relato (la
*escena*) es un tema de la página, elegido entre maquetas hechas sobre la página real.

Plan del 2026-10-30, tras una revisión de la página viva con los skills de UI/UX instalados en local
en este repositorio (`interface-design`, los de ingeniería de diseño y `taste-skill`; lista en
`.claude/skills/SOURCES.md`). Las maquetas fueron hojas de estilo sobre la página de la receta
`npn-switch`, capturadas en un navegador real en celular, escritorio, 1080 × 1920 y 1920 × 1080; se le
mostraron al mantenedor en una galería privada. Cada sesión termina con las pruebas en verde, esta
página y la hoja de ruta al día.

## Estado

- ✅ V0 · Red de seguridad (2026-10-30): `test/frames/` tiene tres casos (`npn-switch` a 390 × 760,
  `rc-square` a 1280 × 800, `led-resistor` a 900 × 620), cada uno con sus llamadas a `tick`, el
  SHA-256 de la página y del PNG, y el navegador que los hizo. `node scripts/frames.js [--runs n]
  [--out dir] [--write]` los dibuja en Chromium sin cabeza (Playwright, dependencia de desarrollo)
  bajo el reloj falso de Playwright, instalado y pausado antes de cargar la página, nunca avanzado:
  `requestAnimationFrame` nunca se dispara y `performance.now()` queda quieto, así que solo `tick`
  mueve la página. `npm run verify` lo corre con `--runs 2`; en CI (`CI` definida, otras fuentes)
  con `--determinism`: solo que los dos renders coincidan, no los hashes guardados. Sin Playwright o sin navegador, o con
  hashes escritos por otro navegador, el caso queda SKIPPED (salida 2), nunca aprobado.
- ✅ V1 · Un reloj (2026-10-30): `src/page/client/director.js`, solo con `?director=1` en una página
  viva (`window.protoboardLive.director`, `body.director`). `start(cues)` (señales `{ at, run(director) }`,
  el gancho por el que pasa el reproductor de V2), `frame(destino, { ms, ease })` (una caja, `board`,
  `parts` o el id de una pieza), `set(id, campo, valor, { ms, ease })` (números por la curva, por
  razones en una escala log; botones al instante) y `tick(ms)`: señales, cámara (`frameAt` en
  `view.js`), controles y luego la simulación con puntos, halo, colores y etiquetas repintados en
  cada tick. Con el director un cuadro no tiene presupuesto de tiempo de pared (a lo sumo 20 000
  pasos), `protoboardLive.tick` pasa por él, el `frameTo` de la página se mueve con su reloj, los
  puntos se mueven también con movimiento reducido y el freno de los textos de los límites lee su
  tiempo; el ciclo de `requestAnimationFrame` de la página llama `tick` con el tiempo que pasó.
  `test/director.test.js` reproduce una secuencia con el reloj del sistema hecho para fallar; los
  hashes de V0 no cambiaron (solo los de las páginas: el script creció).
- ✅ V2 · Línea de tiempo y reproductor (2026-10-30): `src/tour.js` lee `page.tour` (un archivo JSON
  junto al circuito, por medio de `src/beside.js`, el lector que comparten los `.ino`, o la línea de
  tiempo misma), la revisa (`TOUR_*` en `check`) y le da a la página sus pasos en orden, con los
  textos en el idioma de la página. `schema/timeline.schema.json` describe el formato; el ritmo
  necesita el orden de los pasos, así que lo informa `check` (`TOUR_RHYTHM_SLOW`: dos `push`
  seguidos; `TOUR_RHYTHM_HIT`: dos golpes a menos de un respiro, 400 ms). Los siete movimientos son
  una tabla, `src/page/client/moves.js` (duración, rango para `ms`, cubic-bezier), escrita como
  tokens `--move-<nombre>-ms` y `--move-<nombre>-ease`. Los problemas de forma, tamaño y archivo
  dejan la página sin recorrido; un componente o control desconocido, un `ms` fuera de rango o un
  ritmo roto es un aviso y el recorrido igual corre. Topes en `src/limits.js` (100 kB, 200 pasos,
  280 caracteres por texto, diez minutos) y casos en `test/attack.test.js`. El reproductor,
  `src/page/client/tour.js`, convierte los pasos en señales del director: *Ver cómo funciona* en el
  menú ⋯ de una página viva con recorrido; un toque en cualquier lugar o Escape lo detiene donde
  está, y al final la página queda como la dejó. Mientras corre, el director tiene el tiempo
  (`page.direct`); con movimiento reducido sus movimientos son cortes (no en una grabación,
  `?director=1`, que lo arranca con `protoboardLive.tour.play()`). El director ganó `hold`
  (`wait-until`, que corre los pasos siguientes; `max`, 10 s por defecto), `tween` (la `ramp` de los
  puntos, la cuenta de 500 ms del valor), `after` y `stop`. Por ahora, hasta sus fases: el subtítulo
  es una caja simple arriba (la capa y los tamaños del video llegan con V4), `probe` abre la ficha
  con su osciloscopio (el recuadro es M11) e `insert` pone la pieza en foco (la bajada es M15, V6).
  `examples/npn-switch.json` y `examples/tours/npn-switch.json`: `test/tour.test.js` lo reproduce en
  jsdom a tamaño de celular y de escritorio y obtiene los mismos subtítulos, valores, controles y
  foco a los mismos tiempos. Un repintado ya no busca sus elementos cada vez (de 120 ms a 2 ms por
  tick en jsdom). Los hashes de V0 no cambiaron.
- ✅ V3 · El dibujo que cuenta (2026-10-30), en el orden de su encargo: (1) la capa de corriente
  en planta, por defecto (`style` de `conductorPieces`/`flowOps` en `src/sim/paths.js`; `page.flow`
  acepta `{ "style": "plan" | "real" }`, `render --flow` sigue al circuito): una pastilla en cada
  aterrizaje (una línea redonda de 6 px con borde del color del fondo), una recta a través de las
  piezas de dos patas y los cables, un tramo corto de un paso por pata en las demás (uno al lado del
  otro si las patas van en fila), los pares de un pulsador y su puente mientras está apretado (de
  sus `poles`; la página muestra el puente por `data-bridge`), el nombre de la red de un riel junto
  a su pastilla, las piezas en foco encima de la capa al 50 %, grosores sin cambio; dos líneas planas
  sobre una misma línea se corren de lado (0,9 mm); las piezas fuera de la tabla conservan sus
  caminos reales. (2) Coordenadas: `coordOps` enciende la propia impresión de la tabla
  (`decalTextOp`, compartido con `scene.js`); se acabaron las píldoras. (3) Etiquetas de resultado:
  una etiqueta de corriente nunca encima del componente que mide (se prueban más lugares); en la
  página una transformación (atributo) sobre el centro de cada etiqueta las deja en 13 px de pantalla al acercarse y nunca más grandes que como se
  colocaron. (4) La página en reposo: rótulos cortos (`src/render/short-labels.js`, capa
  `shortlabels`) y el botón Etiquetas para las cajas; el encuadre de cerca calculado con los
  componentes y sus rótulos cortos; *MODELO* en la barra; Etiquetas y Corriente conservan su palabra
  en el celular; botones de zoom callados hasta el primer toque. El pulso al cargar (medio) queda
  para los movimientos (V6). (5) `inspect`: `TAG_OVER_PART`, `COORD_COVERED`, `FLOW_COLLINEAR`.
  `test/plan.test.js`: cero choques en cada ejemplo con cada uno de sus primeros componentes en foco
  (y 456 escenas, las dos vistas y los dos encuadres, revisadas una vez a mano). Las imágenes de los
  ejemplos, la imagen de corriente del README y los hashes de V0 cambiaron a propósito.
- ✅ V4 · La escena (2026-10-30): `[data-theme="stage"]` en `src/page/style.js`, el cuaderno de
  noche (pizarra `#151a21`, la cuadrícula de ingeniería en azul pálido, tinta tiza `#efe9da`, la
  serifa del sistema para los subtítulos, valores en ámbar); lo toman `page.theme`, `?theme=` y el
  `theme` de una línea de tiempo. Su versión de día, `[data-theme="notebook"]` (papel crema `#f4efe2`,
  la cuadrícula en tinta azul `#184f8f`, tinta casi negra, etiquetas de corriente en terracota
  `#a3461f`; la C de la primera vuelta), es un tema más para lecciones y videos: el de las lecciones
  por defecto sigue siendo el banco claro. Quien lee elige entre los cinco (como el dispositivo,
  banco, banco de noche, cuaderno, cuaderno de noche) en el menú ⋯; la elección se guarda en el
  navegador para todas las páginas del mismo sitio (`page/client/themes.js`, `main.js`); `?theme=`
  en un enlace sigue ganando, y una grabación conserva el de la línea de tiempo. La retícula de agujeros sigue más allá de la tabla en todos
  los temas (`src/render/hole-grid.js`): un patrón SVG dentro del dibujo, sobre la propia red
  isométrica de la tabla (2,54 mm, marcas mayores cada cinco agujeros por las columnas numeradas
  5, 10, 15…), así que se mueve y se escala con la tabla como la cuadrícula de un lienzo o de un
  mapa; sus marcas conservan su tamaño en pantalla y las menores se desvanecen cuando se
  amontonan (`view.js`); puntos en el banco, líneas en la escena. El banco oscuro es el *banco de noche* (lienzo `#121211`,
  la barra sin fondo). Una grabación (`?director=1`) toma el tema de la línea de tiempo (la escena
  por defecto; `?theme=` gana), oculta la barra y los controles, los rótulos, los rótulos cortos y
  las etiquetas de resultado, y conserva un rótulo: el rótulo corto de la pieza contada
  (`page.told`, que fijan en el recorrido `frame` sobre una pieza, `focus` e `insert`; `focus.js`).
  Ahí el subtítulo es la capa del video (`body.director .tour-caption`): sin caja, sus tamaños como
  fracción del ancho (`--cap-text` 56 px, `--cap-number` 44, `--cap-line` 30 a 1080 de ancho; 52 a
  1920), desde el 16 % del alto en vertical, la mitad izquierda en horizontal. El margen
  reservado: `insetFrame` y `stageInset` en `view.js` (vertical: libres el 40 % de arriba y el 25 %
  de abajo; horizontal: la mitad izquierda), que usan `fitFrame` y el director para `board`,
  `parts` y una pieza. `scripts/stage-shots.js` saca las capturas de las maquetas de la página real
  (escena y banco oscuro, celular y escritorio, en reposo y con un toque; grabaciones de 1080 × 1920
  y 1920 × 1080) y mide en el DOM las reglas del fotograma (franja y tamaños del subtítulo, la pieza
  contada y su rótulo en el área libre, un rótulo, sin etiquetas, sin barra); `test/stage.test.js`.
  Los hashes de V0 cambiaron a propósito (la retícula). Faltan las puertas de contraste y de tamaño
  de toque en un navegador real (las del mantenedor).
- 🔜 V5 · Fotogramas (2026-10-30), construida; falta que el mantenedor apruebe el video de prueba en
  un celular. `scripts/render-frames.js <timeline.json> [--format vertical|horizontal|both] [--fps 30]
  [--lang] [--tail ms] [--check]`: el circuito es un archivo con el nombre del `circuit` de la línea
  de tiempo, a su lado o una carpeta arriba, o si no la receta de ese nombre; su página con la línea
  de tiempo como recorrido, abierta con `?director=1` al tamaño del formato en Chromium sin cabeza
  bajo un reloj falso en pausa; por fotograma, `tick(1000 / fps)` y un PNG, hasta que el recorrido
  termina y `--tail` más. Escribe `frames/NNNNNN.png`, `frames.sha256`, `captions.srt` y
  `timeline.json` (subtítulos y valores con los tiempos en que estuvieron en pantalla, cada paso con
  el tiempo en que corrió, del `log` del recorrido, y las reglas del fotograma medidas en cada
  subtítulo y cada segundo, la pieza contada solo donde la cámara está quieta); `--check` dibuja otra
  vez en un navegador nuevo y compara cada fotograma. Chromium corre sin repintados parciales y con
  todas las etapas del compositor hechas antes de dibujar un cuadro (`CHROMIUM_ARGS` en
  `stage-shots.js`): sin eso, más o menos una corrida de cada cinco dibujaba uno o dos fotogramas con
  unas pocas unidades de color de diferencia; con eso, doce corridas seguidas coincidieron. Líneas de tiempo del video de prueba: `examples/tours/`
  (`led-resistor`, `npn-switch`, `potentiometer-led`, que cierran en la tabla entera). De paso: el
  margen reservado toma el margen lateral del subtítulo, un fotograma horizontal puede mostrar hasta
  tres anchos de tabla, y las reglas del fotograma permiten no tener rótulo (la tabla entera). `--no-captions` deja fuera la capa de
  subtítulos. `scripts/assemble.js <carpetas…> -o video.mp4 [--burn]` une carpetas de fotogramas en
  un video H.264 con ffmpeg si está instalado (si no, imprime el comando y sale con 2) y escribe los
  subtítulos al lado; `--burn` los dibuja en la imagen. En una grabación una pieza se encuadra con
  su rótulo corto, así el rótulo también queda en el área libre. Cómo sacar el video: *Grabar un
  video*, abajo.
- 🔜 V6 · Los movimientos elegidos (2026-10-30), la primera tanda hecha; faltan M4, M5, M7 y M11.
  Cada movimiento tiene su prueba en jsdom (`test/moves.test.js`, valores a tiempos dados) y su
  fotograma *golden* (`test/frames/move-*.json`); la línea de tiempo de ejemplo es
  `examples/tours/npn-switch-moves.json` (y `led-resistor` para M10). M1 llegada y M14 cierre: un
  `focus` con `move` trae el velo, las tiras y las coordenadas con la cámara, o se los lleva (con la
  capa de corriente el velo se queda); el cierre termina en un subtítulo, sin QR. M2 empuje, M6 la
  corriente arranca (`ramp`) y M9 el valor cuenta ya estaban en el reloj desde V2. M8: el halo de un
  LED sube a su brillo en 180 ms por la curva del golpe y se apaga de una vez (un LED es rápido; lo
  que el ojo sigue es la luz que llega); en reposo al cargar, inmediato con movimiento reducido. M12:
  el subtítulo anterior se va en 200 ms (una copia que se desvanece encima) y después cada línea sube
  desde su base dentro de una máscara (`clip-path` en cada línea), 400 ms con la curva de llegada,
  90 ms entre líneas; el valor sube igual al aparecer. M15 (`insert`): la pieza empieza 12 mm arriba
  (`page.data.lift`, unidades de pantalla por milímetro de z) y baja en 700 ms; en el aire la pieza
  de abajo no se ve, su rótulo sube con ella y el circuito entero queda sin corriente (puntos quietos,
  luces apagadas), porque en el banco sacar una pieza abre el circuito; al asentar, los puntos suben
  en 600 ms (M6) y la luz en 180 ms (M8). M16 (`raise`, cambiado a pedido del mantenedor el mismo día: no en cada toque, sino un paso opcional de
  la línea de tiempo para resaltar una pieza en un video): la pieza sube 3 mm (`mm`, hasta 12) por su
  movimiento, una llegada por defecto, más lenta que un toque, y se queda arriba hasta un `raise` a
  0 mm; sigue en el circuito (la simulación no cambia) y entra en foco. Al terminar o detenerse un
  recorrido en la página, toda pieza levantada vuelve a sus agujeros. Las dos usan `liftPart` (`focus.js`): cada copia de la pieza y de su rótulo en un grupo
  con `transform`. M10 (un deslizador que se mueve solo) es un `set` con `travel`, sin código nuevo.
  M3 (giro) y M13 (coordenadas) ya corrían como señales del reloj: solo se agregaron a la línea de
  tiempo y a la red de seguridad. `scripts/frames.js` acepta casos con `tour` (una grabación,
  `?director=1`) y lanza Chromium con las opciones del compositor de `stage-shots.js` (sin ellas un
  fotograma difería de vez en cuando). De paso: `render-frames.js` tomaba como circuito otra línea de tiempo
  con el nombre del circuito junto a la suya; ahora la salta. Los hashes de V0 no cambiaron.
  Pendientes: M4 (armar el circuito: las piezas que aún no bajan deben estar ocultas), M5 (cables
  que se trazan), M7 (un pulso por el camino), M11 (osciloscopio en recuadro); el pulso al cargar
  (V3) tampoco se hizo.
- ⬜ V7: sin empezar. Las decisiones de abajo las tomó el mantenedor el 2026-10-30 (segunda vuelta); lo que sigue abierto lo dice.

## Para quién y para qué

- **Quién:** el mismo aprendiz de la página (un adulto autodidacta en el banco, casi siempre en el
  celular), más quien ve un video vertical de 30 a 60 s en un *feed* y tiene tres segundos para
  decidir si se queda.
- **Qué ve:** el circuito ya funcionando (o fallando) como gancho, luego el porqué, una pieza a la
  vez, con el valor que importa escrito grande, y la página al final.
- **Cómo debe hacerse:** desde un archivo de línea de tiempo, sin asistente en el ciclo, para que dos
  corridas den fotogramas idénticos y un video nuevo de una receta cueste un archivo, no una sesión.

## Qué hay (medido el 2026-10-30)

- **Un reloj determinista.** `window.protoboardLive.tick(ms, steps)` avanza la simulación sin
  `requestAnimationFrame`; `set(id, field, value)` mueve un control; `currents()`, `recording(id)`,
  `reading` y `engine.controls()` dan los números para rotular (`src/page/client/live.js`).
- **Una cámara.** `frameTo` (220 ms, salida fuerte), `fitTo`, `fitFrame` (encuadre vertical),
  `flipView` (inmediato por decisión del 2026-10-16); con `prefers-reduced-motion` todo movimiento es
  inmediato (`src/page/client/view.js`). La cámara es un `viewBox`: un encuadre son cuatro números.
- **Foco.** El velo, las tiras en rayos X, las copias de las piezas contadas y sus rótulos encima de
  la corriente (`src/render/focus.js`, capas `veil`, `strips`, `coords`, `spotlight`, `spotlabels`).
- **Corriente.** Puntos por los conductores reales, movidos por una fase acumulada por cuadro; color
  del conductor por voltaje; halo del LED y calor (`src/sim/paths.js`, `src/sim/look.js`). En una
  página viva el `@keyframes dots` de CSS está apagado (`body.live .dots { animation: none }`), así
  que los puntos ya siguen el reloj de la página.
- **Temas.** Todo color de la página es un token en `:root`, claro y oscuro, elegido por el sistema,
  `page.theme` o `?theme=` (`src/page/style.js`, `.interface-design/system.md`).
- **Capturas.** `scripts/ux-shots.js` escribe las páginas y una función de Playwright que las captura
  a cinco tamaños; PNG desde SVG con resvg (`src/node/raster.js`, dependencia opcional de desarrollo).
- **Falta.** La cámara y los cambios de deslizador corren con `requestAnimationFrame` y hora de pared;
  no hay formato de línea de tiempo, ni capa de subtítulos, ni encuadre que reserve un margen, ni
  exportador de fotogramas.

## Decisiones (2026-10-30)

| Pregunta | Opciones mostradas | Decisión |
|---|---|---|
| Dirección visual del video (segunda vuelta, 2026-10-30: el mantenedor dejó A y C y las pidió en oscuro) | A oscura, *banco de noche* (los tokens oscuros de hoy, fondo casi negro, la retícula de agujeros como puntos, barra sin fondo) · C oscura, *cuaderno de noche* (fondo pizarra, la cuadrícula de ingeniería en azul pálido, tinta tiza, una voz de serifa para lo que se cuenta) | **C oscura**, como tema `stage` |
| Tema por defecto de la página en las lecciones | se queda la A clara de hoy (su modo oscuro pasa a ser A oscura, con la retícula) · la dirección del video | **se queda A** |
| Coordenadas resaltadas | un glifo derecho con halo sobre el velo · lo mismo bajo las piezas · las píldoras de hoy | **ninguna de las tres**: los propios calcos impresos de la tabla, encendidos (ver *El dibujo que cuenta*) |
| Líneas de conductor en la simulación | los cinco cambios de *El dibujo que cuenta* · solo sin tramos dentro de cuerpos con luz · otro subconjunto | reemplazada por la vista en planta (fila siguiente): sin tramos dentro de ningún cuerpo, etiquetas a tamaño fijo, el halo se queda; **los grosores quedan como hoy** (conductores 3,2 px, puntos 2,4 px), el mantenedor no vio necesidad de adelgazarlos |
| Conductores de una pieza en planta (idea del mantenedor, 2026-10-30) | caminos reales como hoy (las patas suben, cruzan el cuerpo, bajan) · *planta*: una recta por pata, a ras de la tabla, de su agujero al centro de la pieza (una X en el pulsador, una V en el transistor, una recta en resistencia o LED), las piezas vistas a través mientras se muestra la corriente · planta en la tabla, caminos reales fuera de ella | **planta**, con las reglas de *El dibujo que cuenta*: cables en planta, **una pastilla en cada aterrizaje**, una línea solo a través de piezas de dos patas y cables, un tramo corto por pata en las demás (mantenedor, 2026-10-30) |
| La página en reposo | los siete cambios de *El dibujo que cuenta* · solo los altos · ninguno por ahora | **altos y medios** |
| La retícula de agujeros continuada como fondo | página y video · solo video · no | **página y video** |
| Ritmo de la cámara al llegar a una pieza (la misma gramática mueve el encuadre de lado con el zoom fijo: un encuadre son cuatro números) | *llegada* · *viaje* · *anticipación* una vez por video | **llegada**, y *anticipación* para el momento clave |
| Movimientos que se construyen (M1 a M16 abajo) | cualquier subconjunto | **M1, M2, M6, M8, M9, M12, M14, M15, M16 primero**; M4, M5, M7, M10, M11 después; M3 y M13 solo se conectan al reloj |
| El recorrido en la página («Ver cómo funciona») | desde V2 · después del primer video | **desde V2** |
| Subtítulos en el fotograma o solo en `timeline.json` | ambos · solo JSON | **ambos** |
| Fuente de los subtítulos del video | la del sistema, como la página · una empaquetada solo para el modo director | **la del sistema** |
| Formatos de salida | vertical 1080 × 1920 · horizontal 1920 × 1080 · ambos | **ambos** (mantenedor, 2026-10-30) |

Lo que las tres direcciones comparten, sacado del propio objeto: la retícula de agujeros de 2,54 mm
de la protoboard sigue más allá de la tabla como fondo de la página. No es un adorno; es la misma
retícula.

## El fotograma

Reglas para un fotograma de video, medibles con `inspect` y las capturas (V3 agrega la medición):

- **Vertical (1080 × 1920):** el subtítulo va entre el 16 % y el 40 % de la altura; el circuito
  debajo. El 15 % de arriba y el 25 % de abajo quedan libres: ahí dibujan sus controles las
  plataformas (las franjas exactas se comprueban por plataforma en V4).
- **Horizontal (1920 × 1080):** el subtítulo a la izquierda, el circuito corrido a la derecha. La
  cámara necesita un *margen reservado* (encuadrar las piezas en la parte libre de la pantalla), que
  no existe.
- **Tamaños a 1080 px de ancho:** subtítulo 56 px, valor 44 px en la monoespaciada con cifras
  tabulares, paso 30 px; a 1920 de ancho, subtítulo 52 px. Todo por encima de 40 px, que se lee en un
  celular con el video a pantalla completa.
- **Solo la pieza contada conserva su rótulo.** Los demás se ocultan en modo director: los rótulos
  atenuados de las otras cuatro piezas tapaban media pantalla en la primera maqueta.
- **Las etiquetas de la simulación (5 V, 528 pA) no salen** en un fotograma: el valor que importa va
  en el subtítulo, grande. En la página siguen.
- **Sin filtros CSS** en nada que se mueva (decisión del 2026-10-15): halo y velo son formas
  dibujadas con opacidad.

## El dibujo que cuenta

Hallado en la segunda vuelta de maquetas (2026-10-30), con las lentes de `design-review` y las reglas
de pantallas de trabajo de `taste-skill`; cada punto es medible y es del kit (`src/render/focus.js`,
`src/sim/paths.js`, `src/sim/look.js`, `src/sim/overlay.js`, el encuadre de la página), así que sirve
por igual a la imagen estática, la página y el video.

- **Coordenadas** (regla del mantenedor, 2026-10-30): no se dibuja nada nuevo sobre la tabla. La
  protoboard ya imprime sus letras de fila y números de columna como calcos sobre su superficie
  (`draw-board.js`: `textDecal`, columnas 1, 5, 10… a 1,4 mm, filas a 1,5 mm, color `print`); la
  coordenada activa es **ese mismo calco, encendido**: el mismo glifo, el mismo tamaño, acostado sobre
  la tabla, solo cambia su color al de acento. Una columna que la tabla no numera recibe el mismo calco,
  en el mismo formato impreso, sin rotación ni estilo adicional, visible solo mientras hace falta (el
  camino `allNumbers` ya dibuja todas las columnas). Pintados sobre la tabla, las piezas los tapan como
  tapan la impresión; las píldoras de `coordOps` desaparecen.
- **Dentro de un cuerpo con luz (un LED), sin tramos de conductor:** el halo dice que pasa corriente y
  el cuerpo queda limpio; los puntos corren por las patas y se detienen en el borde del cuerpo.
- **Los demás cuerpos: dos tramos, no seis**, uno por mitad, el salto de color en el centro (la curva en
  S ya pone el cambio ahí).
- **Puntos más delgados dentro de los cuerpos** (1,6 px, frente a 2,4 en las patas), para que se vea el
  color del conductor.
- **Etiquetas de resultado a tamaño fijo de pantalla** (como las coordenadas) y nunca sobre la pieza
  que miden (prueba de choque con su caja); hoy crecen con el zoom y tapan la pieza en un acercamiento.
- **El halo del LED se queda como está**: es la señal.
- **Vista en planta de los conductores de una pieza** (maqueta del 2026-10-30, pendiente): en vez de
  los caminos 3D del paquete, cada pata es un segmento recto a ras de la tabla desde su agujero hasta
  el centro de la pieza, y los tramos del cuerpo desaparecen. Es solo un cambio de geometría: el modelo
  ya da una corriente por pata, agujero → centro, así que puntos, Kirchhoff y colores no necesitan nada
  nuevo. La regla, fijada con el mantenedor el 2026-10-30 tras tres maquetas (estrella, V, pastillas):
  **una pastilla en cada aterrizaje, una línea solo donde hay un conductor que seguir, un tramo corto
  donde la pieza se traga la corriente.** Dos patas (resistencia, LED, diodo, condensador): una recta a
  través de la pieza, de pastilla a pastilla. Tres o más patas (transistor, regulador, potenciómetro,
  pulsador, DIP, módulo): una pastilla en cada pata y un **tramo corto** de un paso (2,54 mm) desde la
  pastilla hacia el cuerpo, con los puntos de esa pata, para que se vean la dirección y el tamaño de la
  corriente de cada pata (los pocos puntos de la base frente a los muchos del colector) sin que ninguna
  línea cruce otra; ni estrella, ni V, ni bus. **Un paquete puede declarar enlaces internos**, dibujados como líneas entre sus pastillas: un pulsador
  declara sus dos pares siempre unidos y el puente que se cierra al apretar (la X de la primera
  maqueta), porque saber cómo está conectado un pulsador por dentro es la lección (mantenedor,
  2026-10-30); un potenciómetro puede declarar su pista. La mayoría de los paquetes no declaran ninguno. Los cables puente conservan su arco (el arco
  es el cable, y en planta se cruzarían sobre la tabla); las piezas fuera de la tabla (batería, placas,
  interruptores con pinzas) conservan sus caminos reales. En la capa de corriente las piezas contadas se
  dibujan a un 50 % de opacidad (el «ver a través» que ya existe para una pieza), para que las rectas
  se lean debajo del cuerpo y no pintadas en su tapa. Implementación: un `style` de `partPaths()` en
  `src/sim/paths.js` que ignora los `paths` del paquete y arma los segmentos con `part.holes` y el
  centro de la pieza (unas 40 líneas), `page.flow.style` (`real` | `plan`, por defecto `plan` cuando se
  elija), el `render --flow` estático lo sigue, las imágenes de los ejemplos cambian a propósito. Costo:
  bajo-medio. Elegida por el mantenedor el 2026-10-30.
- **Los cables en la vista en planta** (maqueta del 2026-10-30, pendiente): un puente también pasa a
  ser un segmento recto a ras de la tabla de agujero a agujero, en su color de voltaje, y **cada extremo
  aterriza en una pastilla**: el punto de agujero de la tira (`stripOps` ya dibuja uno por agujero)
  crece a unos 3 px donde aterriza un conductor, relleno del color del conductor y con borde del color
  del fondo. La pastilla es lo que dice «este cable y esa resistencia están en la misma tira»: la tira
  entre ambos se dibuja en rayos X con su color de voltaje y sus puntos, y las dos pastillas cierran la
  lectura. Las líneas que se cruzan sin pastilla no están conectadas, como en un esquema. Un cable al
  riel aterriza en la pastilla del riel y la tira en rayos X del riel lleva los puntos hasta la fuente;
  **el nombre de la red se imprime junto a la pastilla del riel** (`netLabels` ya imprime uno por riel;
  el mismo calco, solo en la capa de corriente), elegido por el mantenedor el 2026-10-30. Con los arcos conservados, los pies del cable son las únicas pastillas y el
  arco se sale del plano en que está todo lo demás; la maqueta se leyó peor. Elegido por el mantenedor
  el 2026-10-30: cables en planta con pastillas, y las pastillas como regla general de arriba. Dos
  conductores planos
  sobre una misma línea (un cable a lo largo de la línea de una pieza) son raros, porque `layout` ya le
  cobra a un cable cada cuerpo que cruza; `inspect` recibe una comprobación de superposiciones
  colineales en la capa de corriente.

La página en reposo (nada tocado, sin simulación a la vista):

| Antes | Después | Por qué | Peso |
|---|---|---|---|
| La escalera de cinco cajas de rótulo manda sobre la tabla; en el celular ocupa la mitad del alto y empuja el circuito abajo | En reposo, rótulos como texto corto junto a la pieza (nombre y valor, sin caja, con halo); la guía solo al tocar; las cajas con guía quedan para el botón *Rótulos* y la imagen estática | El circuito debe liderar; impreso, no pegado encima | alto |
| En el celular la primera pantalla es media pantalla vacía arriba y una tabla pequeña abajo | El encuadre vertical en reposo se calcula con las piezas y sus rótulos cortos, no con la escalera; la tabla crece cerca del doble | La primera pantalla se gana sola | alto |
| Nada invita a tocar; la página lee como una imagen | Un pulso al cargar (la pieza principal de la receta sube 1 mm y asienta, 400 ms) o su halo tenue durante 2 s; después nada | Primer uso sin explicación, una vez por visita | medio |
| La insignia MODEL · DC simulation arriba a la izquierda es texto pequeño en un marco; lee como residuo | A la barra, a la derecha, como texto gris sin marco, u oculta en reposo y mostrada con la primera ficha | Los metadatos se demotan | medio |
| Cuatro iconos sin palabra en la barra del celular | Los dos que cambian lo que se ve (Rótulos, Corriente) conservan su palabra en el celular; Girar y Tabla quedan como icono | Los botones que cambian el estado de la página necesitan nombre | medio |
| Los botones de zoom flotan sobre la tabla con borde y fondo claro | Mismo sitio, sin borde, el color del lienzo con opacidad, aparecen al primer gesto | Un solo plano de superficies; lo que no se usa, calla | bajo |
| Las etiquetas de resultado crecen con el zoom | Tamaño fijo en pantalla, nunca sobre su pieza | Un dato que no se puede leer no es un dato | alto |

Se conserva como está: un solo acento, superficies planas con un escalón de luminosidad, 40 px de
toque, el pulso al presionar, la hoja inferior con sus tres alturas, cifras tabulares en la ficha.

## Ritmo

Lo rápido atrapa la mirada; lo lento la sostiene. Un video a una sola velocidad cansa en diez
segundos. Cada paso de una línea de tiempo nombra su movimiento con una de siete palabras, y el
reproductor traduce la palabra a una curva y una duración, así el ritmo es consistente entre videos
sin que nadie lo ajuste:

| Movimiento | Duración | Curva | Uso |
|---|---|---|---|
| `cut` (corte) | 0 ms | ninguna | un cambio de plano o de estado; el gancho, antes/después |
| `arrival` (llegada) | 600 a 900 ms | quint out, `cubic-bezier(0.22, 1, 0.36, 1)` | la cámara cae sobre una pieza (el encuadre de 220 ms de la página, alargado para video) |
| `travel` (viaje) | 1 200 a 1 800 ms | quart in-out, `cubic-bezier(0.76, 0, 0.24, 1)` | de una pieza a otra lejana sin perder el hilo |
| `push` (empuje) | 3 000 a 8 000 ms | cubic out, `cubic-bezier(0.33, 1, 0.68, 1)` | un acercamiento lento mientras habla el subtítulo |
| `hit` (golpe) | 120 a 180 ms | quint out | aparece un valor, enciende el LED, se hunde el botón; siempre seguido de un respiro |
| `breath` (respiro) | 400 a 1 200 ms | ninguna (quieto) | antes de cada golpe grande y después de cada llegada |
| `anticipation` (anticipación) | 250 ms atrás, luego una llegada | retroceso del 8 % en media senoide, luego quint out | el movimiento más importante de un video, uno |

La regla de alternancia, comprobada por el esquema de la línea de tiempo en V2: nunca dos
movimientos lentos seguidos, nunca dos golpes sin un respiro entre ellos. Las curvas son las que la
página ya nombra como tokens (`--ease-out`, `--ease-in-out`) más dos nuevas; las duraciones pasan a
ser tokens también.

## La línea de tiempo

Un archivo JSON por video. Es el guion, lo que la página reproduce como recorrido y lo que sigue el
exportador de fotogramas. Un asistente lo escribe; desde entonces nada se genera.

```json
{
  "circuit": "npn-switch",
  "format": "vertical",
  "theme": "stage",
  "steps": [
    { "at": 0, "do": "frame", "target": "board", "move": "cut" },
    { "at": 0, "do": "caption", "text": "Un transistor como interruptor" },
    { "at": 1200, "do": "frame", "target": "S1", "move": "arrival" },
    { "at": 1200, "do": "insert", "part": "S1", "move": "arrival" },
    { "at": 2400, "do": "caption", "text": "Al apretar S1, la corriente de base enciende el LED" },
    { "at": 3000, "do": "set", "part": "S1", "field": "pressed", "value": true, "move": "hit" },
    { "at": 3000, "do": "flow", "on": true, "ramp": 600 },
    { "at": 3400, "do": "frame", "target": "D1", "move": "travel" },
    { "at": 3400, "do": "value", "part": "D1", "field": "current", "label": "por el LED" },
    { "at": 5000, "do": "frame", "target": "D1", "zoom": 1.25, "move": "push", "ms": 5000 },
    { "at": 10000, "do": "frame", "target": "board", "move": "travel" },
    { "at": 10000, "do": "caption", "text": "protoboard-iso: la página hace lo mismo que el video" }
  ]
}
```

- `at` es tiempo de pared simulado en ms desde el inicio del recorrido; los pasos con el mismo `at`
  arrancan juntos. `ms` cambia la duración por defecto del movimiento (solo `push` la necesita).
- Acciones: `frame` (`board`, `parts` o el id de una pieza, con `zoom` opcional), `focus` (con un `move`, el velo llega o se va con él; ids de
  piezas), `flip` (`front` | `back`), `set` (un control, interpolado durante el movimiento), `flow`
  (la capa de corriente, con una `ramp` desde cero), `caption` (texto; se permite una segunda
  `line`), `value` (una lectura de una pieza, grande, junto al subtítulo; cuenta hasta su valor en
  500 ms), `probe` (el osciloscopio de una tira o pieza en un recuadro), `insert` (M15: la pieza baja a sus agujeros; `ms`, 700 por defecto), `raise` (M16: la pieza sube `mm`, 3 por defecto, y se queda arriba, en el circuito; `mm: 0` la baja), `wait-until` (una condición
  sobre una lectura: `{ "part": "D1", "field": "brightness", "above": 0.5 }`; los pasos siguientes
  se corren lo que dure la espera).
- Los textos son planos o por idioma, como la `description` de un circuito.
- Topes (`src/limits.js`): pasos por línea de tiempo, largo del texto, duración total. Los textos
  pasan por `escapeXml`; nada del archivo corre como código.

## Movimientos

Cada movimiento tiene un propósito nombrado (sin él no se construye), un costo, y corre bajo el reloj:

| # | Movimiento | Qué hace y para qué | Costo |
|---|---|---|---|
| M1 | Llegada a una pieza | la cámara va de la tabla a la pieza con `arrival`; el velo y el foco llegan con ella | bajo (existe; falta el reloj) |
| M2 | Empuje lento | un acercamiento de 3 a 8 s mientras habla el subtítulo | bajo |
| M3 | Giro a la vista trasera | muestra las tiras por debajo; un corte con respiro antes y después, o un fundido de 300 ms | bajo |
| M4 | El circuito se arma | las piezas bajan una por una (M15) en el orden que da `layout`, cada una con un golpe pequeño y un respiro | medio |
| M5 | Los cables se dibujan | cada cable se traza de un extremo al otro (longitud del trazo) | medio |
| M6 | Arranca la corriente | al apretar, los puntos arrancan desde cero y llegan a su velocidad en 600 ms | bajo |
| M7 | Un pulso por el camino | un destello recorre el camino de la corriente del + al − en el instante del cambio | medio |
| M8 | El LED enciende | el halo sube de 0 a su brillo en 180 ms en vez de aparecer | bajo |
| M9 | El valor cuenta | la cifra del subtítulo sube de 0 a su valor en 500 ms con cifras tabulares | bajo |
| M10 | Antes y después | un deslizador se mueve solo entre dos valores en 1,5 s; el valor grande lo sigue; el LED cambia | medio |
| M11 | Osciloscopio en recuadro | la traza se dibuja en un recuadro grande en la esquina desde t = 0 cuando la señal importa | medio |
| M12 | Subtítulos que llegan | cada línea sube desde su base (máscara), 90 ms entre líneas; la anterior se va en 200 ms | bajo |
| M13 | Coordenadas que se encienden | los números de columna y letras de fila de la pieza se iluminan un instante al llegar | bajo (existe) |
| M14 | Cierre | la cámara vuelve a la tabla entera con `travel`, el velo se va, aparece la página o un QR | bajo |
| M15 | Inserción | la pieza empieza 12 mm por encima de la tabla y baja con `arrival` (700 ms) por el eje z del dibujo (la vertical de la pantalla); al asentar, un `hit`: arranca la corriente (M6) y enciende la luz (M8); en el aire no tiene corriente y su rótulo la acompaña; una sombra como elipse tenue debajo, opcional (una forma, sin filtro). Encadenada, es como M4 arma el circuito | medio-bajo |
| M16 | Pieza levantada | en un video (`raise`), la pieza sube 3 mm con una llegada y se queda arriba hasta bajarla, sin salir del circuito; propósito: decir «esta» (primero se pensó al tocar en la página, 150 + 250 ms; el mantenedor lo prefirió opcional y más lento, solo para videos) | bajo |

Fuera a propósito: librerías de animación, 3D real, giros de cámara (la vista isométrica es fija),
partículas y desenfoques, transiciones entre circuitos distintos (eso lo hace ffmpeg).

## Arquitectura

- **Un reloj.** `page/client/director.js` (nuevo) es dueño del tiempo en modo director:
  `start(timeline)`, `tick(ms)` avanza el recorrido, la cámara, las interpolaciones y la simulación
  en ese orden, y escribe el DOM una vez por tick. En la página sin director sigue el ciclo de hoy; en
  el director el ciclo llama `tick` con el tiempo real transcurrido, y el exportador con `1000/fps`.
- **Cámara por reloj.** `view.js` recibe `frameAt(page, from, to, k)` (la interpolación que
  `frameTo` ya hace, expuesta) y `frameTo` conserva su `requestAnimationFrame` para la página
  interactiva. Una opción de *margen reservado* (`inset: { left, top, right, bottom }` en fracciones
  de pantalla) en `fitFrame`.
- **Interpolaciones por reloj.** Un control movido por el director cambia de valor en cada tick
  (`engine.set`), con la curva del movimiento; el halo del LED y la velocidad de los puntos suben por
  la misma interpolación.
- **Subtítulos.** Una capa `.caption` en la página (oculta sin el director), con los tamaños de arriba
  como tokens (`--cap-*`), y textos en `data-live` para las cadenas grabadas.
- **Tema de escena.** La dirección elegida como tercer juego de tokens (`[data-theme="stage"]`), la
  retícula de agujeros como fondo de `main` (el rectángulo de fondo del SVG transparente en la
  página), las reglas del director (rótulos, etiquetas) en `style.js`.
- **Exportador.** `scripts/render-frames.js` (Playwright, solo desarrollo): abre
  `out/<nombre>.html?director=1`, carga la línea de tiempo, fija el tamaño, y por fotograma llama
  `tick(1000/fps)` y captura un PNG; escribe `frames/NNNNNN.png` y `timeline.json` (subtítulos con
  sus tiempos, valores, los movimientos). El comando de ffmpeg para ensamblar está documentado, no lo
  corre el kit.
- **El recorrido en la página.** La misma línea de tiempo, un botón *Ver cómo funciona* en el menú ⋯
  cuando el circuito tiene una (`page.tour` nombra el archivo, leído junto al circuito como un
  programa, confinado a su carpeta); un toque en cualquier lugar lo detiene y deja la página como está.

## Fases y sesiones

| Sesión | Fase | Entrega | Terminada cuando |
|---|---|---|---|
| 1 | V0 · Red de seguridad | `scripts/ux-shots.js` como está; un *golden* de fotogramas: `test/frames/` con la receta, el tamaño, una lista de llamadas a `tick` y el hash del PNG resultante (Chromium sin cabeza por el contenedor del navegador o Playwright cuando esté instalado; sin uno se salta, nunca pasa) | dos corridas de 3 recetas dan hashes idénticos |
| 2 | V1 · Un reloj | `director.js` con `tick`; cámara, interpolaciones, puntos, halo y colores escritos por tick; `?director=1`; pruebas en jsdom que manejan `tick` | cualquier secuencia se reproduce con `tick(1000/30)` sin leer el reloj del sistema |
| 3 | V2 · Línea de tiempo y reproductor | el formato JSON y su esquema (`npm run schemas`), los siete movimientos como tokens, `wait-until`, el botón del recorrido, `page.tour`, topes y casos en `attack.test.js` | `npn-switch` tiene su línea de tiempo y la página la reproduce igual en celular y escritorio |
| 4 | V3 · El dibujo que cuenta | las coordenadas como glifos encendidos omitidos bajo una pieza, sin tramos dentro de cuerpos con luz y dos en los demás, puntos finos dentro de los cuerpos, etiquetas a tamaño fijo y fuera de su pieza, rótulos cortos en reposo y el encuadre calculado con ellos, la insignia MODEL a la barra | `inspect` reporta cero choques de coordenadas y etiquetas con piezas; las imágenes de los ejemplos cambian a propósito (`--write-examples`) |
| 5 | V4 · La escena | la dirección elegida como `[data-theme="stage"]`, la retícula, la capa de subtítulos, las reglas del director (un rótulo, sin etiquetas), el margen reservado, las franjas seguras medidas en las capturas | las maquetas de la galería salen de la página real sin CSS extra |
| 6 | V5 · Fotogramas | `scripts/render-frames.js`, `timeline.json`, el comando de ffmpeg en la guía; un video de prueba de 45 s con 3 recetas | el mantenedor aprueba el video en el celular |
| 7 | V6 · Los movimientos elegidos | uno por uno (M15 y M16 entre ellos si se eligen), cada uno con su prueba en jsdom (valores a tiempos dados) y su fotograma *golden* | cada movimiento elegido aparece en una línea de tiempo de ejemplo |
| 8 | V7 · Banco y guía | una línea de tiempo por receta que se vaya a grabar, el *golden* de fotogramas en `npm run verify`, la guía en en y es (cómo escribir una línea de tiempo, cómo sacar el video), hoja de ruta, mapa del código | un modelo mediano saca un video nuevo de una receta solo con la guía |

Cada fase: documentación en inglés y español, la hoja de ruta marcada (los dos idiomas), la bitácora
de decisiones en `PLANNING.md`, cadenas nuevas por `t()` en todo `src/i18n`, el mapa del código al
día. Cada fase se escribe como un encargo completo (archivos, valores exactos, pruebas) para que un
modelo mediano la ejecute solo.

## Encargos por sesión

Un encargo por fase, corto a propósito: lo justo para no perder el orden ni las decisiones, no la
lista de pasos (esa la escribe la propia sesión al empezar, contra el código tal como está). Cada
sesión empieza leyendo esta página, `CLAUDE.md` y el encargo de su fase, comprueba los nombres de
abajo contra el código (una fase anterior pudo elegir otros), termina con `npm test` y
`npm run verify` en verde, el *Estado* de esta página y la hoja de ruta (los dos idiomas) al día,
una línea `STATUS:`, y pregunta antes de hacer commit (mensaje en inglés). Las fases se
construyen en orden.

### V0 · Red de seguridad

- **Construir:** Playwright como dependencia de desarrollo y Chromium (`npx playwright install
  chromium`); `test/frames/` con un caso por receta (`npn-switch`, `rc-square`, `led-resistor`:
  tamaño de ventana, las llamadas a `tick(ms, steps)` tras cargar `out/<nombre>.html`, el SHA-256
  del PNG); un script en `scripts/` que dibuja y compara, `--write` para regenerar a propósito; un
  paso de `npm run verify` (0 pasa, 1 falla, 2 no pudo correr; sin navegador SKIPPED, nunca pasa).
- **Respetar:** `scripts/ux-shots.js` se queda; nada visible cambia.
- **Terminada cuando:** dos corridas sobre las 3 recetas dan hashes idénticos.

### V1 · Un reloj

- **Construir:** `page/client/director.js` con `start` y `tick(ms)`; la cámara interpolada por el
  reloj (`frameAt` en `view.js`, `frameTo` conserva `requestAnimationFrame` para la página
  interactiva); controles interpolados por tick con `engine.set`; puntos, halo y colores escritos
  por tick; `?director=1`; pruebas en jsdom que manejan `tick`.
- **Respetar:** `window.protoboardLive` conserva `tick`, `set`, `currents`, `recording`; las
  páginas sin `?director=1` no cambian; sin filtros CSS.
- **Terminada cuando:** cualquier secuencia se reproduce con `tick(1000/30)` sin leer el reloj del
  sistema, y los hashes de V0 no cambian.

### V2 · Línea de tiempo y reproductor

- **Construir:** el formato JSON de *La línea de tiempo* y su esquema (`npm run schemas`); los
  siete movimientos de *Ritmo* como tokens (curva y duración cada uno) con la regla de alternancia
  comprobada por el esquema; las acciones listadas allí, `insert` y `wait-until` incluidas;
  `page.tour` (un archivo junto al circuito, confinado a su carpeta) y *Ver cómo funciona* en el
  menú ⋯, un toque lo detiene; topes en `src/limits.js` y casos en `test/attack.test.js`; cadenas
  por `t()` en todo `src/i18n`.
- **Respetar:** el recorrido va en la página desde esta fase (decisión); los subtítulos son
  planos o por idioma; nada del archivo corre como código.
- **Terminada cuando:** `npn-switch` tiene su línea de tiempo y la página la reproduce igual en
  celular y escritorio (valores en jsdom a tiempos dados, más el mantenedor en un celular).

### V3 · El dibujo que cuenta

- **Construir, en este orden:** (1) la capa de corriente en planta: estilo `plan` de
  `partPaths()` en `src/sim/paths.js`, una pastilla en cada aterrizaje (el punto de agujero de la
  tira, crecido), una recta a través de las piezas de dos patas y a lo largo de los cables, un
  tramo corto de un paso por pata en las demás, los enlaces internos que declare un paquete (los
  pares y el puente del pulsador), el nombre de la red impreso junto a la pastilla de un riel
  (`netLabels`), las piezas contadas al 50 % en la capa de corriente, grosores sin cambio,
  `page.flow.style` (`real` | `plan`, por defecto `plan`), `render --flow` lo sigue; (2)
  coordenadas: los propios calcos de la tabla encendidos, las columnas sin número reciben el mismo
  calco, las píldoras de `coordOps` fuera; (3) etiquetas de resultado a tamaño fijo de pantalla y
  fuera de su pieza; (4) la página en reposo: rótulos cortos junto a las piezas, el encuadre
  vertical calculado con ellos, la insignia MODEL a la barra, Rótulos y Corriente conservan su
  palabra en el celular, botones de zoom callados; (5) una comprobación de superposiciones
  colineales en `inspect`.
- **Respetar:** cada punto de *El dibujo que cuenta*; las imágenes de los ejemplos cambian a
  propósito (`npm run verify -- --write-examples`, `scripts/readme-images.js`); el SVG estático
  conserva sus colores.
- **Terminada cuando:** `inspect` reporta cero choques de coordenadas y etiquetas con piezas; el
  mantenedor aprueba la vista en planta y la página en reposo en un celular.

### V4 · La escena

- **Construir:** `[data-theme="stage"]` como *cuaderno de noche* (fondo pizarra, la cuadrícula de
  ingeniería en azul pálido, tinta tiza, la serifa del sistema para los subtítulos); la retícula de
  agujeros como fondo de `main` en todos los temas (el rectángulo de fondo del SVG transparente en
  la página); la capa de subtítulos con sus tamaños como tokens (56 / 44 / 30 px a 1080 de ancho,
  52 a 1920); las reglas del director (un rótulo, sin etiquetas); el margen reservado en `fitFrame`
  (vertical: subtítulos entre el 16 % y el 40 %, horizontal: la mitad izquierda); las franjas
  seguras (15 % arriba, 25 % abajo) medidas en las capturas.
- **Respetar:** el tema claro de banco sigue por defecto en las lecciones; su modo oscuro es
  *banco de noche* con la retícula; la fuente del sistema, sin red.
- **Terminada cuando:** las maquetas de la galería salen de la página real sin CSS extra, en
  celular, escritorio, 1080 × 1920 y 1920 × 1080. Pedirle al mantenedor un navegador real para
  correr las puertas de contraste y de tamaño de toque.

### V5 · Fotogramas

- **Construir:** `scripts/render-frames.js` (Playwright, solo desarrollo): abre
  `out/<nombre>.html?director=1`, carga la línea de tiempo, fija el tamaño (los dos formatos),
  llama `tick(1000/fps)` por fotograma, escribe `frames/NNNNNN.png` y `timeline.json` (subtítulos
  con sus tiempos, valores, movimientos); el comando de ffmpeg en la guía, no lo corre el kit; un
  video de prueba de 45 s con tres recetas.
- **Respetar:** dos corridas dan fotogramas idénticos (hashes); el tiempo de ejecución sigue sin
  dependencias.
- **Terminada cuando:** el mantenedor aprueba el video en un celular.

### V6 · Los movimientos elegidos

- **Construir, uno por uno, cada uno con prueba en jsdom y fotograma golden:** M1 llegada, M2
  empuje, M6 arranca la corriente, M8 el LED enciende, M9 el valor cuenta, M12 subtítulos que
  llegan, M14 cierre, M15 inserción, M16 pieza levantada; después M4, M5, M7, M10, M11; M3 y M13
  solo se conectan al reloj.
- **Respetar:** la tabla de movimientos (duraciones, curvas, propósitos); solo transform y
  opacidad; el movimiento reducido conserva el estado final.
- **Terminada cuando:** cada movimiento aparece en una línea de tiempo de ejemplo y su fotograma
  golden está en la red de seguridad.

### V7 · Banco y guía

- **Construir:** una línea de tiempo por receta que se grabe; el golden de fotogramas en
  `npm run verify`; la guía en inglés y español (cómo escribir una línea de tiempo, cómo sacar el
  video, el comando de ffmpeg); la hoja de ruta marcada; el mapa del código; los archivos de los
  agentes si cambió una herramienta o un comando.
- **Terminada cuando:** un modelo mediano saca un video nuevo de una receta solo con la guía.

## Grabar un video

Construido en V5; V7 lo convierte en la guía completa. El kit hace los fotogramas; ffmpeg, fuera del
kit (no es una dependencia: `apt install ffmpeg`, o una versión estática), hace el video, por medio
de `scripts/assemble.js` (solo desarrollo, como Playwright).

```bash
# Los fotogramas de una línea de tiempo: examples/out/video/<línea>/<formato>/frames/*.png,
# frames.sha256, captions.srt, timeline.json. --check dibuja dos veces y compara cada fotograma.
node scripts/render-frames.js examples/tours/npn-switch.json --format both --lang es --check

# Un video de una o más carpetas de fotogramas del mismo tamaño y fps, una tras otra (H.264, se ve
# en cualquier celular y plataforma), con sus subtítulos al lado como video.srt.
node scripts/assemble.js examples/out/video/{led-resistor,npn-switch,potentiometer-led}/vertical -o video.mp4
```

`assemble.js` corre ffmpeg si está instalado; si no, imprime el comando y sale con 2. Su `--burn`
dibuja los subtítulos de los `timeline.json` de los clips bajo la imagen, por encima de la franja de
abajo de las plataformas: para fotogramas hechos con `render-frames.js --no-captions` (sin la capa de
subtítulos, con los tiempos igual registrados), cuando los subtítulos se ponen después. A mano, un
clip:

```bash
ffmpeg -framerate 30 -i frames/%06d.png -c:v libx264 -pix_fmt yuv420p -crf 18 -movflags +faststart clip.mp4
```

`render-frames.js` sale con 1 cuando un fotograma en reposo rompe una regla de *El fotograma* (dice
el tiempo) o cuando dos corridas difieren.

## Compatibilidad

- Las páginas sin `page.tour` y los enlaces sin `?director=1` no cambian: mismo marco, mismo ciclo.
- `window.protoboardLive` conserva `tick`, `set`, `currents`, `recording`; el director agrega.
- El SVG estático conserva sus colores; el tema de escena es de la página.

## Verificación

- `npm test` en cada fase; `test/live.test.js` y `test/sliders.test.js` siguen en verde.
- Determinismo: el *golden* de fotogramas (hashes) en `npm run verify`; un cambio del dibujo lo
  regenera a propósito (`--write`), nunca por accidente.
- Medido, no mirado: tamaños de subtítulo y franjas seguras desde el DOM de las capturas (números
  tipo `inspect` en el informe del exportador), cantidad de rótulos en un fotograma del director
  (uno), sin etiquetas.
- Mirado una vez por fase: el mantenedor ve el video o el recorrido en el celular.
