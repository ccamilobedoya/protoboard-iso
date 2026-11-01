# Un video sobre una pieza: diseño y plan

*[English](../en/component-focus.md)* · Hoja de ruta: [hoja-de-ruta.md](hoja-de-ruta.md), *Un video sobre una pieza* · Se apoya en [escena-y-video.md](escena-y-video.md)

Un formato de video para **una pieza concreta** (un transistor, un MOSFET, un LED, un 555): la pieza
sola y grande en el mismo escenario oscuro, sus patas encendiéndose con su nombre, su símbolo y lo
que tiene por dentro, la simulación corriendo sobre ella como en un banco de pruebas, y un movimiento
continuo a la protoboard, donde el circuito de la receta se arma a su alrededor y funciona. Todo lo
dirige la misma línea de tiempo JSON (`examples/tours/*.json`) y lo dibuja `scripts/render-frames.js`.
Más adelante, quizá, la misma vista en la página, abierta desde la ficha.

Plan del 2026-11-01. La arquitectura y las decisiones D1 a D6 las aprobó el mantenedor; D7 (la página)
queda abierta hasta un ensayo en vivo después de F4. La sesión F0 (este documento, las maquetas y las
medidas) está hecha, y el mantenedor eligió la dirección del pedestal el 2026-11-01: el diagrama de
patas técnico con el símbolo de esquema de la vitrina al lado de la pieza (ver *La dirección elegida*).

## Estado

| Sesión | Qué | Estado |
|---|---|---|
| F0 | Medir y elegir: maquetas de tres direcciones sobre la página real, medidas de zoom y bandas, este documento, las decisiones en `PLANNING.md` | ✅ dirección elegida el 2026-11-01 |
| F1 | El pedestal: `scene` y `land` | ✅ 2026-11-01 |
| F2 | Anatomía: `pin` y orientación | ✅ construida el 2026-11-01; falta aprobar un fotograma de cada una |
| F3 | El banco: `bench` | ✅ construida el 2026-11-01; falta aprobar un fotograma |
| F4 | `symbol` e `inside` | ⬜ |
| F5 | La pieza en la página (interactiva), solo si D7 lo dice | ⬜ abierta |
| F6 | Banco de líneas de tiempo y guía | ⬜ |

**Todo se pide** (el mantenedor, 2026-11-01): el pedestal muestra solo lo que piden los pasos de su
línea de tiempo. El diagrama de patas, el banco, el símbolo y el «por dentro» son cada uno de un paso,
que los enciende y los apaga; ninguno se dibuja por defecto, y un video puede usar cualquiera, en
cualquier orden, o ninguno.

**Para revisar más adelante** (el mantenedor, después de ver el video de F1 el 2026-11-01): los
subtítulos de un video sobre una pieza (sus palabras, su tamaño y sus tiempos); y si el pedestal
necesita un zoom inicial sobre la pieza o basta con el encuadre como lo presenta F1. Las dos se juzgan
en F6, con las cuatro líneas de tiempo.

## El formato

Seis tiempos, de 25 a 35 s, primero en vertical. Los nombres de acción son los del plan; F1 a F5 los
fijan contra el código.

| Tiempo | s | Acciones |
|---|---|---|
| 1 Gancho | 0–1,5 | `scene part Q1` (corte), `caption` con el nombre de la pieza y una idea |
| 2 Anatomía | 1,5–6 | `pin Q1.E`, `pin Q1.B`, `pin Q1.C` (400 ms entre ellos, un `label` corto), `caption` con la orientación |
| 3 Cómo funciona | 6–16 | `bench on`, `flow on ramp 600`, `symbol on` (opcional), `inside on` (opcional), `set` + `value` + `probe` como hoy |
| 4 A la protoboard | 16–20 | `symbol off`, `inside off`, `bench off`, `land Q1` (la protoboard sube), `assemble` |
| 5 Funcionando | 20–28 | como los videos de hoy: `focus`, `set`, `value` |
| 6 Cierre | 28–30 | `frame board travel`, `caption`, `focus []` |

Los tiempos 1 y 2 tienen la misma coreografía en todos los videos de la serie: se reconoce, y a un
modelo pequeño le resulta barato escribirla con la guía.

## Arquitectura: el pedestal es el mismo circuito

El pedestal no es un segundo dibujo: es la página del propio circuito con la protoboard y las demás
piezas ocultas. Una acción `scene` en modo `part` (1) oculta la protoboard (la retícula de agujeros de
fondo sigue), (2) oculta las piezas no nombradas, (3) levanta la pieza con el mecanismo de `raise`
(`liftPart` en `page/client/focus.js`) y (4) la encuadra. Volver a la protoboard (`land`) deshace eso
con movimientos: la pieza baja, la protoboard aparece, `assemble` trae lo demás.

Por qué: la continuidad entre pedestal y protoboard sale gratis (la pieza es el mismo elemento SVG, en
su sitio real), la simulación ya corre (la pieza nunca sale del circuito, como con `raise`), los
controles (`set`) y las lecturas (`value`, `probe`) ya funcionan, y la capa de corriente en planta ya
tiene un tramo por pata (V3), la base del banco: cada pata muestra lo que le llega del resto del
circuito.

Descartado por ahora (vuelve si F1 lo pide): un circuito «banco» generado por tipo de pieza, dibujado
en un segundo SVG sin protoboard, con un fundido o un viaje al circuito real. Da un banco más literal
(fuente dibujada, pinzas), pero es el primer dibujo sin protoboard y dos circuitos que mantener a la
par.

## Decisiones

| # | Decisión | Elegido | Alternativa |
|---|---|---|---|
| D1 | Cámara en el pedestal | la cámara isométrica fija, sin órbitas (sigue la decisión del 2026-10-30); `flip` para la otra cara | órbitas solo en `scene part` |
| D2 | Rótulos de patas, símbolo, por dentro | gráficos 2D en el espacio de la pantalla, anclados a la proyección de cada pata (líneas guía) | calcos 3D sobre la pieza |
| D3 | Datos nuevos | por **tipo** (símbolo, por dentro, el orden en que se cuentan las patas) en `src/parts/types/*`; por **número de parte** (la función de cada pata, la marca de orientación) en `db.js` | todo por número de parte |
| D4 | Primera tanda de piezas | BJT `2N2222A`, el MOSFET de `mosfet-switch`, LED, `NE555`, cada uno con su receta final (`npn-switch`, `mosfet-switch`, `led-resistor`, `555-astable`) | solo BJT y LED |
| D5 | Banco | la capa de corriente en planta, solo de la pieza, con los tramos alargados hasta una pastilla por pata que lleva el voltaje (tensión) y la corriente de la pata | fuente y pinzas dibujadas |
| D6 | Transición | **B, la protoboard sube**: la pieza no se mueve en pantalla, la protoboard aparece debajo (se quita el velo, con un viaje de cámara que compensa), luego `assemble` | A, la pieza baja con `insert` |
| D7 | Página | **abierta**: se decide con un ensayo en vivo. Después de F4, un prototipo rápido en la página detrás de `?focusView=1`, probado en un celular y una tableta; entonces F5 como está escrita, cambiada o descartada (el video no la necesita) | hacerla desde el inicio; no hacerla nunca |

## Medidas (F0)

`scripts/focus-mockups.js` abre en Chromium la página real de `npn-switch` (Q1, un TO-92) y de la
receta `555-astable` (U1, un DIP-8) como grabación (`?director=1`, tema `stage`, 1080 × 1920 y
1920 × 1080), pone la pieza en un pedestal como lo haría F1 (una línea de tiempo con `focus`, `raise`
de 3 mm y `frame` sobre la pieza con un `zoom`, más CSS que oculta la protoboard y las demás piezas), y
mide la pieza en pantalla. Los números están en `examples/out/focus-mockups/measurements.json`; las
tablas son de la corrida del 2026-11-01. «Área libre» es lo que una grabación deja libre para el dibujo
(`STAGE_INSET` en `page/client/view.js`): en vertical, del 40 % al 75 % del alto y del 6,7 % al 93,3 %
del ancho; en horizontal, la mitad derecha, del 9 % al 91 % del alto.

**Cuánto del área libre ocupa la pieza** (ancho × alto, como parte del área libre), y el tamaño de su
marcado impreso (el tamaño de letra en pantalla, a través de la matriz del dibujo):

| `zoom` del `frame` | TO-92 vertical | marcado | DIP-8 vertical | marcado | TO-92 horizontal | DIP-8 horizontal |
|---|---|---|---|---|---|---|
| 1 (el de hoy) | 15 % × 40 % (140 × 269 px) | 16 px | 33 % × 40 % (311 × 269 px) | 31 px | 21 % × 40 % | 40 % × 35 % |
| 1,5 | 22 % × 60 % | 24 px | 50 % × 60 % | 47 px | 31 % × 60 % | 60 % × 52 % |
| 2 | 30 % × 80 %, fuera del área | 32 px | 67 % × 80 %, fuera | 63 px | fuera | fuera |
| 3 | fuera | 48 px | fuera | 94 px | fuera | fuera |

Lo que dicen:

- **Manda el alto de la pieza, no su ancho.** El encuadre de una pieza es su caja 2,5 veces
  (`partBox`), ajustada al área libre: con zoom 1 una pieza levantada ocupa el 40 % del alto del área
  libre y solo del 15 % (TO-92) al 33 % (DIP-8) de su ancho. Por encima de 1,5 la pieza sale del área
  libre por arriba (la banda del subtítulo) en los dos formatos, porque el centro del encuadre incluye
  la elevación.
- **Con zoom 1 el marcado de un TO-92 mide 16 px en un cuadro de 1080 de ancho**: se lee en un celular
  a pantalla completa, pequeño. Con 1,5 mide 24 px. El del DIP-8 mide 31 px con zoom 1. El SVG escala
  sin pérdida: no aparecieron costuras entre las piezas convexas en ningún zoom probado (hasta 5).
- **El límite inferior del encuadre no estorba.** `clampBox` mantiene el encuadre de al menos un
  doceavo del ancho de la protoboard; un TO-92 en vertical lo toca solo con zoom 4.
- **Un diagrama de patas bajo la pieza cabe con zoom 1** (las filas de texto entre la pieza y el 75 %),
  no con 1,5. Una vitrina con la pieza grande (zoom 1,6) cabe para el TO-92 en los dos formatos; para
  el DIP-8 en vertical, los números de la fila de atrás, escritos sobre el cuerpo, entran en la banda
  del subtítulo.
- Propuesta sin aprobar: `scene part` no debería reusar el encuadre de una pieza con un zoom. Debería
  ajustar la caja de la pieza (sin el margen de 2,5) a un área de pedestal dentro del área libre: la
  parte de arriba (cerca del 55 % de su alto) cuando van rótulos o banco bajo la pieza, toda en una
  vitrina. F1 mide y fija esa parte; el zoom queda para la línea de tiempo que quiera más o menos.

**Contraste** de los colores de las maquetas sobre el fondo del escenario `#151a21` (WCAG 2.2; texto
4,5:1, líneas y pastillas 3:1): texto de los rótulos `--ink` 14,4:1, la línea del tipo `--ink-3` 6,8:1,
líneas guía y letras de patas `--accent` 9,9:1, la lectura de una pastilla `--cap-value` 11,7:1, las
pastillas en la escala de voltaje 6,8:1 (0 V), 4,3:1 (la mitad) y 3,5:1 (el máximo). Todos pasan.

## Hallazgos para las sesiones

- **F1, un error que arreglar primero.** Una pieza levantada y enfocada otra vez (un paso `focus` o
  `label` después de un `raise`) desaparece: el foco copia el cuerpo de la pieza, que `liftPart` dejó
  invisible mientras está en el aire, así que las copias también quedan invisibles. Las maquetas fuerzan
  las copias visibles; F1 lo arregla en `applyFocus` (las copias de una pieza levantada conservan su
  opacidad) con un caso en jsdom.
- **F1.** La luz del LED (capa `lights`) no es una pieza de la parte: ocultar las demás partes debe
  ocultar también su luz, y dejar la de la pieza contada cuando es un LED.
- **F2.** En la vista de frente, la fila de atrás de un DIP queda detrás del cuerpo. La línea guía de un
  rótulo debe salir de debajo de la pieza (las maquetas dibujan las líneas bajo el dibujo, así la de una
  pata oculta sale por debajo del cuerpo), o su número va sobre el cuerpo. Qué patas quedan ocultas es
  una medida de la escena (inspect), no una suposición a partir de las filas.
- **F2.** Las líneas guía no se cruzan si cada columna de texto toma las patas de su lado del centro de
  la pieza, la más cercana en la fila de arriba.
- **F2.** La orientación es un dato, nunca una frase escrita a mano: la primera maqueta decía «muesca a
  la izquierda», y en este circuito el 555 tiene la muesca a la derecha (la pata 1 a la derecha). Un
  chip con la pata 1 a la derecha muestra el marcado al revés, como el de verdad.
- **F2.** El texto de una pata debe terminar antes de su línea guía: en horizontal, el texto más largo
  de la izquierda del 555 («5 CTRL») pasaba de su pata y la línea quedaba encima. El ancho de la
  columna se mide y el texto se acorta o la columna se mueve; nunca queda bajo una línea guía.
- **F2.** Dos patas en la misma x de pantalla (la pata 4 de atrás y la 8 de adelante en un DIP)
  comparten una sola línea vertical; cada línea toma su propia x, a unos píxeles de distancia.
- **F3.** La lectura de una pastilla necesita un piso: la pata de tierra del 555 leía 270 µV. Las
  lecturas de menos de un milivoltio se muestran como 0 V, o la escala del circuito decide las cifras.
- **F3.** Dos patas a la misma altura en pantalla (las filas opuestas de un DIP) dan tramos que se
  cruzan; las pastillas ordenadas por la posición de la pata en pantalla, con los tramos de la fila de
  atrás bajo el cuerpo, lo mantienen legible.

## Las tres direcciones (maquetas)

`node scripts/focus-mockups.js [--lang es] [--jpeg]` escribe, por pieza y formato,
`<pieza>-<dirección>-<v|h>.png` en `examples/out/focus-mockups/` (las tres de abajo y `chosen`). Nada del kit cambia: los rótulos, el
símbolo y las pastillas son HTML y SVG que el script dibuja sobre la página, y cada número de una
pastilla es la simulación de la propia página.

- **Pedestal técnico** (`technical`): un diagrama de patas como el de una hoja de datos, en letra
  monoespaciada, una fila por pata bajo la pieza con su función, líneas guía que no se cruzan, el tipo
  de pieza y su marca de orientación en una línea discreta abajo.
- **Vitrina** (`showcase`): la pieza más grande (zoom 1,6), la letra de cada pata (el número en un
  chip) en su punta, el símbolo del esquema debajo (vertical) o al lado (horizontal), pocas palabras.
- **Banco de pruebas** (`bench`): el tramo de cada pata alargado hasta una pastilla del color de su
  voltaje, la lectura grande debajo; la pieza conduciendo (el pulsador de `npn-switch` apretado).

## La dirección elegida (2026-11-01)

El mantenedor eligió **el pedestal técnico con el símbolo de esquema de la vitrina** (`chosen` en el
script: `<pieza>-chosen-<v|h>.png`), en los dos formatos:

- la pieza con el encuadre técnico (el encuadre de pieza de hoy, zoom 1: queda sitio debajo para el
  diagrama de patas), en vertical y en horizontal; no la pieza grande de la vitrina;
- el diagrama de patas como en la dirección técnica: una fila de texto monoespaciado por pata con su
  función, líneas guía que no se cruzan, el tipo de pieza y la orientación en una línea discreta abajo;
- el símbolo de esquema al lado de la pieza, en el espacio que el área libre deja a su derecha,
  centrado con ella (F4 une sus patas con las reales mediante líneas);
- las líneas de tiempo se llaman `focus-<pieza>.json` (`focus-npn.json`, `focus-555.json`…).

El banco (F3) sigue su plan; su aspecto se juzga cuando se construya. F1 encuadra el pedestal como la
dirección técnica: la pieza en la parte de arriba del área libre, el diagrama de patas debajo.

## Sesiones

Reglas comunes (las de [escena-y-video.md](escena-y-video.md)): cada sesión empieza leyendo
`CLAUDE.md`, el mapa del código, `escena-y-video.md`, `linea-de-tiempo.md` y este documento; comprueba
contra el código los nombres que eligió una sesión anterior; termina con `npm run verify` en verde, el
*golden* de fotogramas actualizado a propósito, la hoja de ruta (en/es) y el mapa del código, una línea
`STATUS:`, y pregunta antes de hacer commit. Cada movimiento nuevo entra a la tabla de movimientos con
número, propósito y costo, un caso en jsdom (`test/moves.test.js`) y un fotograma *golden*
(`test/frames/move-*.json`). Cada texto nuevo pasa por `t()` en todos los archivos de `src/i18n/`.

### F1 · El pedestal: `scene` y `land`

`scene` en `tour.js` con `"mode": "part" | "board"`, `"part"`, `"zoom"` y `move`/`ms`/`curve` (un
`cut` por defecto en el gancho). En modo `part`: la protoboard bajo un velo completo
(`data-scene="part"` en `main`, estilos en `style.js`, sin filtros CSS), las demás piezas con
`display: none` en una grabación (no con opacidad, para no pagar pintura), la pieza levantada
`RAISE.mm`, una etiqueta según la regla de una etiqueta, y el encuadre en la pieza (ver la propuesta de
arriba). `land` (`"part"`, `travel` de 1500 ms por defecto): la pieza baja, el velo se va en el mismo
tween y la cámara compensa para que la pieza **no se mueva en pantalla** (D6: la caja de destino con
`partBox` antes y después, interpolada con `frameAt`); luego vuelven las demás piezas, o esperan un
`assemble`. Movimientos M17 *pedestal* y M18 *la protoboard sube*. Esquema, topes, `--validate`
(`TOUR_SCENE_PART` si la pieza no existe, o es un cable o una fuente), `--parts` dice qué piezas pueden
ir al pedestal. Pruebas: jsdom en `test/tour.test.js` y `test/moves.test.js` (la posición de la pieza en
pantalla igual antes y después de `land`, ±1 px), fotogramas *golden* `move-scene.json` y
`move-land.json`, ids hostiles en `test/attack.test.js`. Terminada cuando
`examples/tours/focus-npn.json` (scene → caption → land → assemble) pasa `--validate` y
`render-frames.js --format both --check`, y en el fotograma del pedestal nada queda fuera del área
libre.

### F2 · Anatomía: `pin` y orientación

Datos: la función de cada pata por número de parte (los nombres del `NE555` ya existen; su texto por
idioma como claves `pin.<parte>.<nombre>` en `src/i18n`), y en cada paquete una marca de orientación
como dato (`orientation: { kind: 'flat' | 'notch' | 'dot' | 'long-lead' | 'stripe', at: <punto 3D> }`)
para TO-92, TO-220, DIP, LED, diodo axial y electrolítico. `pin` (`"pin": "Q1.B"`, un `"text"`
opcional, `arrival` por defecto): un rótulo 2D sobre el dibujo, anclado a la proyección de la punta de
la pata (`data-pin` en las piezas, o la posición que exponga la escena), con una línea guía que nunca
cruza la pieza; las patas encendidas se acumulan hasta `pin off`. `orientation` (o `pin` con
`"mark": true`) enciende la marca y escribe su texto. `--parts` lista las patas de cada pieza con nombre
y función; `--validate`: `TOUR_UNKNOWN_PIN`. Movimientos M19 *la pata se enciende* y M20 *llega el
rótulo*. Terminada cuando `focus-npn.json` y `focus-555.json` encienden todas sus patas, `--check` pasa
y el mantenedor aprueba un fotograma de cada una.

**Cómo quedó (2026-11-01).** Los nombres cambiaron un poco frente al plan de arriba: la marca es un campo
de lo que construye el paquete, `mark: { kind: 'flat' | 'tab' | 'notch' | 'flange' | 'stripe', at, normal }`,
y una sola acción hace patas y marcas: `pin` con `pin`, `mark` (la pieza) u `off` (no hay acción
`orientation`). Los textos de las patas van por tipo de pieza (`pin.role.bjt.E`), con el número de parte
primero cuando tiene los suyos (`pin.role.NE555.TRIG`); la fila de un chip dice su número. La frase de
la marca sale de la cámara (hacia dónde mira una cara plana o una lengüeta, de qué lado queda una muesca
o una franja), así que la vista de atrás dice lo otro. Los rótulos se dibujan dentro del dibujo, en una
capa bajo la copia de la pieza (las líneas de la fila de atrás salen por debajo del cuerpo sin medir qué
queda oculto), repartidos en px de pantalla cada vez que se mueve el encuadre. Dos hallazgos de F0
pidieron una regla cada uno: una fila demasiado larga para su espacio primero se achica con las demás
(hasta el 65 %), y cuando dos columnas igual cortarían una fila, todas las filas van a una sola columna
del lado con más espacio (tampoco se cruza ninguna línea: arriba las patas más cercanas a ella); dos
patas en una misma x reciben líneas a 10 px, y se mueve la de la punta más alta, porque si no la otra
línea empezaría encima de ella (un cruce que encontró un caso en jsdom). `render-frames.js` mide el
diagrama de patas contra el área libre. Se agregó `TOUR_NO_MARK` para un `mark` en una pieza sin marca.
Al ver los primeros fotogramas, el mantenedor pidió dos cambios: la pieza en el centro (el pedestal ahora
encuadra la pieza sola, en el centro; ahí no se muestra su rótulo corto, porque el subtítulo ya la
nombra, así que el rótulo ya no corre a un lado una pieza pequeña y las filas se acomodan a su
alrededor), y sin anillo en la marca (la cara plana ya se ve en el dibujo; la
marca es solo su frase).

### F3 · El banco: `bench`

`bench` (`"on"`, `"part"`): en el pedestal, la capa de corriente en planta solo de esa pieza, con los
tramos alargados a una longitud fija de pantalla y rematados en una pastilla con el voltaje del nodo (el
color de la escala y la cifra) y, con `flow on`, los puntos de la pata; un rótulo por pastilla con el
nombre de la red, o la pieza vecina principal («→ R1 1k»); `value`, `probe` y `set` sobre piezas
ocultas siguen funcionando (la gracia: subir la resistencia de base y ver cambiar la pastilla de la
base). En `src/sim/paths.js` (un estilo `bench` derivado de `plan`) y `live.js`; las pastillas como
formas con opacidad, sin filtros. `--validate`: `TOUR_BENCH_NOT_SIMULATED`. Movimiento M21 *el banco se
conecta* (los tramos se trazan como M5, 400 ms). Terminada cuando en `focus-npn.json` el tiempo 3
muestra un `set` de R1 (oculta) cambiando la pastilla de la base y la corriente de colector, en los dos
formatos, y el mantenedor lo aprueba.

**Cómo quedó (2026-11-01).** No en `src/sim/paths.js`: la página dibuja el banco como el diagrama de patas
(`page/client/bench.js`), en px de pantalla a partir de la lectura del motor, que ya da el voltaje y la
corriente de cada pata; la escala de color, la velocidad de los puntos y su color son los de la capa de
corriente. Bajo cada pastilla: la pata, su voltaje, la corriente que entra por ella y con qué se une
(`page.js`, `benchLabel`). Los tramos bajan a un mismo nivel y van rectos a su pastilla, con las
pastillas en el orden de las patas en pantalla, así que ninguno se cruza (también las dos filas de un
chip, medido en jsdom); una lectura por debajo de un milivoltio es 0 V. Cada línea bajo una pastilla se
ajusta a nueve décimas de la separación entre pastillas, así que los ocho bloques de un chip quedan uno
al lado del otro (escalonarlos sacaba del área libre el banco del 555). El banco y el diagrama de patas
comparten el espacio bajo la pieza: cada uno apaga al otro. En el pedestal la pieza sigue sólida con la
capa de corriente encendida.

### F4 · `symbol` e `inside`

Por tipo (`src/parts/types/*` → `symbol`, `inside`), gráficos 2D en un panel del pedestal (a la
derecha en horizontal, bajo la pieza en vertical, dentro del área libre), dibujados con las primitivas
y los tokens del kit. `symbol`: el símbolo de esquema de la primera tanda con una línea de cada una de
sus patas a la pata real (los anclajes de F2). `inside`: un diagrama didáctico movido por el estado de
la simulación (las uniones del BJT y flechas de Ib e Ic con grosor según la corriente; el canal del
MOSFET que se abre con Vgs; chip y lente del LED con el brillo del motor; comparadores, biestable y
descarga del 555 siguiendo `timer.js`). Movimientos M22 *el símbolo se une* y M23 *ver por dentro*.
`--validate`: `TOUR_NO_INSIDE`. Terminada cuando las cuatro piezas tienen ambos, cada uno en una línea
de tiempo del banco con su fotograma *golden*, y el mantenedor aprueba un fotograma de cada uno.
Después, el ensayo de D7: un prototipo mínimo detrás de `?focusView=1`.

### F5 · La pieza en la página (solo si D7 lo dice)

El ⓘ del tipo de pieza en la ficha abre *Ver la pieza*: la página entra en `scene part` con el código
de F1 a F4 dirigido por el dedo (Patas, Símbolo, Por dentro, Banco; los deslizadores de la ficha siguen
vivos); ✕ o un toque en la protoboard la devuelve. Celular (hoja inferior) y escritorio (panel derecho),
foco de teclado, `aria-label` en los rótulos, movimiento reducido; `page.focusView: false` la apaga.

### F6 · Banco de líneas de tiempo y guía

Cuatro líneas de tiempo (`focus-npn`, `focus-mosfet`, `focus-led`, `focus-555`) en los dos idiomas; una
sección de `hacer-un-video.md` (y `making-a-video.md`), *Un video sobre una pieza*, con los seis
tiempos, la coreografía fija de los tiempos 1 y 2, las reglas (400 ms entre dos `pin`; `bench` antes de
`flow`; `symbol`/`inside`/`bench` apagados antes de `land`; los subtítulos nunca inventan cifras) y los
códigos nuevos de `--validate`; `linea-de-tiempo.md`, el mapa del código, la hoja de ruta, los agentes si
cambió un comando, `CHANGELOG.md`. La prueba del modelo pequeño: un modelo mediano escribe
`focus-zener.json` solo con la guía y pasa `--validate` y `--check` al primer o segundo intento.

Orden: F0 → F1 → F2 → F3 → F4 → F5 → F6. F2 y F3 son independientes entre sí; F4 necesita las dos; F6
puede empezar sus líneas de tiempo desde F3. Si falta tiempo: F4 solo para BJT y LED, y F5 después.

## Riesgos y cómo se miden

- **Una pieza pequeña en un cuadro grande**: medido arriba (zoom, tamaño del marcado, costuras); F1 fija
  el área del pedestal con estos números, no a ojo.
- **Reglas del cuadro sin protoboard**: `render-frames.js` ya mide etiquetas y área libre por
  fotograma; se extiende a rótulos, pastillas y paneles.
- **Datos que crecen con el catálogo**: primero cuatro piezas; `--parts` dice qué tiene cada una y
  `--validate` rechaza con un código lo que falta, para que un modelo pequeño no adivine.
- **Determinismo**: todo bajo el reloj del director; `--check` (dos corridas) en cada sesión.
