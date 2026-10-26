# Montaje automático: el algoritmo que ubica un circuito entero

*[English](../en/layout.md)*

`layout` convierte una lista de componentes (sin agujeros) y las redes que los unen en un
circuito ubicado, cableado y revisado, en alrededor de un segundo, sin que quien lo llama tenga
que probar y corregir. Esta página explica cómo funciona paso a paso, qué números lo gobiernan y
cómo cambiarlo sin romperlo. El código es un solo archivo, `src/layout.js` (unas 500 líneas); la
decisión de diseño está en [planeacion.md](planeacion.md) (2026-10-17).

Puntos de entrada; todos llaman a `autoLayout(spec, { profile, checkOnly })`:

| Desde | Llamada |
|---|---|
| MCP | herramienta `layout` (`target`, `recipe` y `values`, o `parts`, `nets`, `supplies`; `board`, `title`, `netLabels`, `page`, `clearance`, `check_only`) |
| Consola | `node bin/protoboard-iso.js layout <objetivo nuevo> <spec.json \| -> [--check] [--json]`, o `--recipe <nombre> [--values '<json>']` (sale con 0 si queda listo, 2 si hay cambios) |
| Código | `import { autoLayout, validateSpec, checkNets } from './src/layout.js'`; una receta pasa antes a especificación con `resolveRecipe` (`src/recipes/index.js`) |
| Banco de pruebas | `npm run layout-bench [-- spec.json …]` (corre `examples/layout/*.json` y todas las recetas) |

Una **receta** ([recetas.md](recetas.md)) es una especificación guardada en el kit para un circuito
de clase habitual, que se llama por su nombre con solo los valores que cambian; se convierte en una
especificación común antes de que corra todo lo de abajo.

## La especificación

```json
{
  "board": "auto",
  "parts": [
    { "id": "U1", "part": "7805" },
    { "id": "S1", "part": "KCD1", "on": true },
    { "id": "R1", "type": "resistor", "value": "1k" }
  ],
  "nets": [
    ["S1.2", "U1.IN"],
    { "pins": ["U1.GND", "T-"], "color": "black" }
  ],
  "supplies": [{ "id": "V1", "voltage": 12, "positive": "S1.1", "negative": "T-" }],
  "netLabels": { "T-": "GND" }
}
```

- `parts`: sin `pins`, en el orden de la señal (el orden desempata, ver el paso 1). Un componente
  es un tipo con sus campos, o solo una referencia, un módulo o un alias (`"7805"`, `"KCD1"`,
  `"UNO"`, `"resistencia"`): `resolvePart` (`src/parts/resolve.js`) completa el tipo.
- `nets`: cada una, una lista de patas (`"D1.K"`; el nombre de la pata no distingue mayúsculas) y
  rieles (`"T-"`, `"B+"`), o `{ pins, color }`. Una pata sola (`["D1.A"]`) vale: es donde se
  conectará una fuente. Dos redes que comparten una pata o un riel son una sola red
  (`["T-", "B-"]` une las tierras).
- `supplies`: como en un circuito, salvo que `positive` y `negative` pueden nombrar una pata; una
  vez ubicada, se vuelve un agujero libre de su tira.
- `board` (por defecto `auto`: la protoboard elástica, que crece a lo largo), `clearance` (1 mm por
  defecto), `title`, `lang`, `netLabels`, `page`: pasan tal cual al circuito.

## El flujo

```
spec ─▶ 0 validar ─▶ 1 capas ─▶ 2 ubicar ─▶ 3 cables ─▶ fuentes ─▶ 4 verificar ─┐
          │ (todos los problemas                                                │
          │  juntos, nada ubicado)        ◀── se rehace, prohibiendo un lugar ──┤ algo bloquea
          ▼                                                                      ▼
       inválida                                                   el mejor intento: circuito + informe
```

`autoLayout` corre `validateSpec` una vez y después `layoutOnce` hasta `TRIES` veces. Cada
`layoutOnce` empieza con la protoboard vacía, así un intento nunca hereda los errores del
anterior; solo pasa de uno a otro el conjunto de lugares prohibidos (`forbid`).

### 0. Validar (`validateSpec`)

Todo lo que una especificación puede tener mal, de una pasada y antes de ubicar nada: un `id` que
falta o se repite, un nombre que el kit no conoce (con los más parecidos), un campo que el tipo
del componente no usa (`UNKNOWN_FIELD`, de `strayFields` en `src/parts/fields.js`: `"state": "on"`
en un interruptor, cuyo campo es `on`), una red que nombra un componente o una pata que no existe
(con las patas que sí tiene) y un componente que no está en ninguna red (aviso). Con cualquier
error no se ubica nada y vuelven todos los problemas juntos, así se corrigen en una sola ronda.
`check_only` / `--check` se detiene aquí.

Los nombres de las patas se leen como los escribe la gente (`findPin`, `src/parts/pin-names.js`):
primero el nombre propio de la pata, sin distinguir mayúsculas; luego sinónimos (`A`/`anode`,
`K`/`cathode`, `VIN`/`IN`, `VOUT`/`OUT`, `DISCH`/`DIS`, `THRESHOLD`/`THR`, `VDD`/`VCC`, `VSS`/`GND`,
`3.3V`/`3V3`, `E`/`emitter`, `G`/`gate`…) y números de GPIO en una placa (`GPIO4`, `IO4`, `4` → el
`D4` del DevKit), solo cuando coincide exactamente una pata. Las redes vuelven con los nombres
propios (`D1.K` → `D1.cathode`), así los pasos siguientes nunca ven un alias. Los circuitos,
`query` y `suggest` leen las patas igual.

### 1. Capas: el orden de la señal desde la fuente

Una búsqueda en anchura sobre las redes, como en los esquemas al estilo Sugiyama: el componente de
la fuente es la capa 0 (el de la primera fuente cuyo `positive` nombra una pata; si no hay, el
primer componente), sus vecinos en cualquier red la capa 1, y así. **Los rieles no unen
componentes** en este paso: un riel de tierra volvería vecinos a todos con todos. Se ubican por
capas; dentro de una capa, y para los que la búsqueda no alcanza, en el orden dado. Resultado: la
protoboard se lee de izquierda a derecha en el orden de la señal (fuente → diodo → interruptor →
regulador → carga).

### 2. Ubicar cada componente (reglas comprobadas solo con geometría)

Dos cosas avanzan con el recorrido: un **cursor de columna** (empieza en 2) y la **mitad** de la
protoboard donde va el componente (`T`, filas f–j junto a los rieles de arriba, o `B`, filas a–e
junto a los de abajo). La mitad es la del primer riel que nombran sus redes; si no hay, la del
componente anterior en una red; si tampoco, `B`.

Cada regla arma una lista de candidatas (juegos de agujeros, de la mejor a la peor); gana la
primera que acepta `tryOps`:

| Tipo de componente | Cómo se reconoce | Candidatas |
|---|---|---|
| Fuera de la protoboard (interruptor, Arduino, adaptador e-paper) | `resolve` responde `MODULE_PINS` | cada pata en un agujero libre de la tira de su red (del canal hacia afuera); si no, una tira nueva en el cursor, en la fila `e`/`f`, a dos columnas una de otra. De un interruptor solo cuentan las patas en uso y sus pares. |
| Placa de desarrollo sobre el canal (ESP32 DevKit, C3 SuperMini) | tipo `module` con un encapsulado que se ubica por la pata 1 | la pata 1 en cada fila y columna cerca del cursor, puntuada por los agujeros libres que conserva en su tira cada pata que está en una red, fuera de la placa y de lo que sobresale su circuito impreso; se prueban las seis mejores. Un DevKit cuyas redes usan una sola fila de pines queda con la pata 1 en la fila `c` y la fila `a` libre (desde el 2026-10-26) |
| Tres en línea (TO-220, TO-92, módulo AMS1117) | encapsulado `inline`, tres patas | tres tiras vacías seguidas dentro de `SPAN` columnas desde el cursor; las altas (`TALL`) en la fila `b`/`g`, las demás en `c`/`h` |
| Dos patas con un riel en una de sus redes (un capacitor o un LED a tierra) | encapsulado `span`, dos patas, `max ≥ 2` pasos | de pie: una pata en el riel y la otra en la fila de al lado, en la tira del componente anterior si queda del mismo lado; si no, en una tira nueva |
| Dos patas, en otro caso (una resistencia en serie) | encapsulado `span`, dos patas | a lo largo de una fila: una pata en la tira del componente anterior y la otra `k`, `k+1` o `k+2` columnas más allá (`k` = la separación mínima del encapsulado), en una tira vacía; después, cualquier par de tiras vacías en la 2.ª–4.ª fila desde el riel |
| Cualquier otro (chip DIP, pulsador), o si ninguna candidata pasó | — | `suggest` cerca del cursor (`limit: 1`, hasta 24 candidatas, sin reservar espacio ni cable puente); si también falla, `LAYOUT_PART_FAILED` con sus razones |

**`tryOps` (la prueba de aceptación).** Aplica la operación `add`, reconstruye el circuito **solo
con geometría** (`buildCircuit`: ocupación, largo de las patas, cuerpos que se cruzan, cruces,
separación; milisegundos, sin dibujar nada) y acepta solo si no agrega un error ni un problema
bloqueante nuevo respecto al circuito anterior (`blocking` = errores, avisos y notas `TOO_CLOSE`).
`FLOATING_PIN` se tolera porque los cables vienen después. Un lugar que está en `forbid` se salta.

Después de cada componente, el cursor pasa a dos columnas más allá de su pata más a la derecha, o
del borde derecho de su cuerpo si está sobre la protoboard, así las etapas no se amontonan; la
protoboard elástica crece con él (`headroom: SPAN + 12` columnas).

Por qué las filas `b`/`g` para las piezas altas: se midió que en las filas c–e y h–j un lado de sus
tiras queda detrás del cuerpo en una de las dos vistas, así que un agujero libre no se puede usar.

### 3. Cables puente

Por cada red: los grupos que toca (las tiras de sus patas ya ubicadas y sus rieles), ordenados por
columna. Cada grupo que aún no está unido (unión-búsqueda sobre los cables ya puestos) se une al
grupo más cercano que ya está en la red, con **el par de agujeros libres más corto que pasa
`tryOps`**:

- costo = largo en línea recta, + 1 si los dos agujeros no están en la misma columna (un cable
  recto se lee mejor); los pares de menos de dos pasos se saltan (demasiado cortos para verse);
- agujeros de riel solo a 6 columnas o menos del grupo (un cable no recorre la protoboard para
  llegar a un riel);
- se prueban los primeros 40 pares; si ninguno pasa, el grupo espera a que el resto de la red quede
  unido (el riel se une al final) y se prueba una vez más contra todo eso (desde el 2026-10-26: la
  tira de tierra de un pulsador que no alcanza la tira GND tapada por la placa llega al riel −); si
  tampoco, `LAYOUT_WIRE_FAILED`.

Color: el `color` de la red; si no tiene, negro para una red con un riel `−`, rojo para una con un
riel `+` y, si no, el siguiente de `PALETTE` (uno por red).

Después, las **fuentes**: una pata nombrada se vuelve un agujero libre de su tira.

### 4. Verificar

- `checkNets(circuit, nets)`: las redes eléctricas construidas (tiras unidas por cables) frente a
  las pedidas, después de fundir las pedidas que comparten una pata o un riel. **Faltantes**: patas
  de una red que no están en su grupo principal. **En corto**: dos redes pedidas en el mismo grupo.
- `review(circuit, { profile: 'lesson', views: ['front', 'back'] })`: la misma revisión que corre
  un agente, que además mide la visibilidad en el dibujo (lo único que el paso 2 no comprueba).

### El ciclo de reintentos (`autoLayout`)

Mientras un intento no sea perfecto (redes mal, un problema, o la revisión bloquea algo), cada
ítem bloqueante nombra algunos componentes; de ellos, el **último ubicado** (`sequence`: primero
los componentes, después los cables) pierde su lugar: su `forbidKey` (`"<id> <patas>"`, o
`"wire <agujeros>"` para un cable, porque los cables se renumeran) entra en `forbid`, y el montaje
se rehace desde cero. Se detiene cuando un intento es perfecto, cuando ya no hay un lugar nuevo
que prohibir o después de `TRIES`. Se queda el mejor intento, según
`puntaje = 100 × (redes mal) + 10 × problemas + ítems bloqueantes`.

Rehacer el montaje es más simple y predecible que parcharlo: un intento tarda 0,05–0,2 s.

### Reparaciones y convenciones (desde el 2026-10-20)

- **La tierra, al riel.** Antes de montar, una red con una pata de tierra (`GND`, `GND2`, `VSS`, `0V`,
  o el `negative` de una fuente) y sin riel recibe el riel − que usan las otras redes, o si no `B-`
  (`groundToRail`), con la nota `LAYOUT_GROUND_TO_RAIL`. Es lo que se hace en cualquier protoboard: un
  cable corto por tira en vez de una cadena a lo largo de la placa. El spec guardado en el circuito
  es lo que se pidió, sin la convención.
- **Reparación.** Si el mejor intento todavía no es perfecto, `repair` lo toma una vez más, cable por
  cable: una red que quedó aparte (`LAYOUT_WIRE_FAILED`) y cada cable que nombra un punto bloqueante
  se trazan de nuevo con `suggest` (perfil lesson: mide lo que tapa un cable en las dos vistas y puede
  pasar por una tira libre, `VIA_WIRE`). Una reparación se queda solo si mejora el puntaje (redes,
  problemas, bloqueantes), con la nota `LAYOUT_REPAIRED`.

### Volver a montar un circuito que ya existe (desde el 2026-10-20)

`layout` guarda en el circuito lo que se le pidió, como `spec`: las redes (con los nombres de las
patas ya resueltos), las fuentes que nombran patas y los id de sus propios cables (`spec.wires`). Con
eso:

- **`review` revisa las conexiones** de todo circuito con `spec`, también después de cambios a mano:
  una red que ya no está unida bloquea (`SPEC_NET_MISSING`), y dos unidas también (`SPEC_NETS_SHORTED`).
- **`layout` sobre un destino que ya existe lo vuelve a montar** en una sola revisión (quita todas las
  piezas, fija los campos y agrega las nuevas: `relayoutTarget`), así `undo` trae el montaje anterior.
  Lo que no se da sale del circuito (`specFromCircuit`: sus piezas sin agujeros y sin los cables de
  layout, las redes y fuentes guardadas, la placa, el clearance, el título, las etiquetas y la
  página). Cada pieza y cada cable **prueba primero los agujeros que ya tiene**, así agregar un LED no
  mueve nada más (medido con el 555: un segundo LED y su resistencia, y todo lo demás en su lugar).
  `expect_revision` lo protege.
- La operación `rename` también cambia el nombre en el spec. Un circuito sin `spec` (hecho a mano)
  solo se vuelve a montar si la llamada da sus redes (si no, `LAYOUT_NO_SPEC`); entonces sus cables se
  dejan fuera, porque las redes ya dicen qué unen.

Así el spec es el estado deseado: cambiar conexiones es dar redes nuevas y volver a llamar `layout`;
valores, descripciones y retoques finos siguen siendo operaciones (`apply_ops`).

### La respuesta

`{ status, circuit, placed: [{ id, type, pins, rails, shared }], wires, columns, problems, sequence,
check, review, tries, ms }`; `formatLayout` la escribe para la consola y la herramienta MCP (textos
`layout.*` en `src/i18n/`).

`status` es el veredicto único de toda la respuesta, y el texto termina con él en su propia línea:
quien lea solo la última línea (sobre todo un modelo pequeño) sabe qué hacer.

| `STATUS:` | Significa | Sigue |
|---|---|---|
| `DONE` | están todas las redes, nada quedó sin ubicar y la revisión aprueba | reportar |
| `CHANGES` | se creó, pero una red, una ubicación o la revisión dejaron algo (✖) | arreglar solo eso con `suggest` y `apply_ops`, luego `review` |
| `FIX_SPEC` | no se creó nada: la especificación tiene errores | arreglar cada ✖ y volver a llamar |
| `SPEC_OK` | `check_only`: la especificación es coherente | volver a llamar sin él |

Antes del 2026-10-20 el texto terminaba con el veredicto de la revisión, que podía decir APROBADO
con una red sin conectar. La consola sale con 0 solo con `DONE` (1 con `FIX_SPEC`, 2 con `CHANGES`).

## Los números que lo gobiernan

| Constante | Valor | Qué hace |
|---|---|---|
| `SPAN` | 8 | columnas más allá del cursor donde un componente puede buscar espacio |
| `TALL` | `TO-220`, `ams1117-module` | encapsulados de tres en línea que van en la fila b/g |
| `BESIDE` | `switch`, `module`, `battery` | cuerpos fuera de la protoboard: solo sus agujeros mueven el cursor |
| `HALF_ROWS` | T: j…f, B: a…e | filas de cada mitad, del riel hacia adentro |
| `PALETTE` | naranja, verde, amarillo, azul, blanco, violeta | colores de los cables de las redes sin riel |
| `TRIES` | 8 | reintentos como máximo |
| inicio del cursor | 2 | primera columna que se usa |
| búsqueda de cables | 40 pares, agujeros de riel a 6 columnas o menos, largo ≥ 2 pasos | paso 3 |
| `clearance` | 1 mm (por defecto en la especificación) | separación entre cuerpos; 3 para una clase más holgada |

## Medido (`npm run layout-bench`)

| Especificación | 2026-10-18 | 2026-10-20 |
|---|---|---|
| `regulator-led.json` (4 componentes, 4 redes) | aprobado · 4 intentos · 0,3 s | aprobado · **1 intento** · 0,1 s |
| `two-rail-supply.json` (10 componentes, 10 redes: la fuente de M2 del curso) | aprobado · **8 de 8** intentos · 1,5 s | aprobado · **1 intento** · 0,3 s |

El 2026-10-18 lo único que bloqueaba era la visibilidad: el perfil lesson daba por oculta en todas
las vistas una pieza apenas bajaba del 85 % visible en cada una (el umbral de nota del inspector), y
contaba como dos vistas dos piezas que la tapaban en la misma. Desde el 2026-10-20 bloquea cuando la
**mejor vista** de la pieza muestra menos del 70 % (`hiddenBelow` en `PROFILES.lesson`), contado por
vista. Un 555 que se ve 73 % de frente y 69 % desde atrás ya no bloquea; se lee bien.

Cuatro circuitos de clase más, probados el 2026-10-20: el NPN como interruptor, el divisor con
potenciómetro y el 555 astable salen aprobados al primer intento; el ESP32 DevKit con pulsador y LED
dejaba su pata de tierra aparte, porque la placa tapa esa tira (límite 6, abajo).

Desde el 2026-10-26 el banco corre también las quince recetas con sus valores por defecto, y una
receta falla si no termina en `DONE`: las quince lo logran, entre 30 y 520 ms, al primer intento
salvo `mosfet-switch` (2 intentos) y `555-astable` (3). Dos recetas pidieron cambiar el algoritmo y
no la receta: las del ESP32 (la regla de las placas y el grupo que espera, arriba); una pidió cambiar
la receta: `bridge-rectifier` deja el lado de continua fuera de los rieles y su condensador de
filtro al final, así cualquier valor habitual (100 µF a 2200 µF) deja los cables a la vista.

## Cambiar el algoritmo

1. **Medir primero**: `npm run layout-bench` y guardar la salida. Agregar a `examples/layout/` la
   especificación de cualquier circuito real que salga mal (una especificación, no un circuito:
   `parts` sin patas, `nets`), así queda como caso de regresión.
2. Cambiar `src/layout.js`. Dónde va cada tipo de cambio:
   - un tipo de componente nuevo, o un mejor lugar para uno → una rama del paso 2 (la cadena
     `if (beside) … else if (pkg?.inline …) … else if (pkg?.span …)`); un tipo sin regla ya funciona
     por el `suggest` de reserva, solo que más lento y menos ordenado;
   - el orden de los componentes → paso 1 (`layer`, `order`);
   - qué se acepta al ubicar → `tryOps` y `blocking`;
   - los cables → `pairs` (costo) y `join`;
   - cuándo rendirse o qué prohibir → `autoLayout` (`score`, la elección de la víctima, `TRIES`).
3. `npm run layout-bench` otra vez: todas las especificaciones siguen APROBADAS; comparar intentos,
   cables, columnas y tiempo. Después, `npm test` (`test/layout.test.js`: colocación, verificación
   de redes, nombres, validación de una pasada, campos desconocidos) y `npm run test:mcp`.
4. Anotar el porqué en el registro de decisiones de [planeacion.md](planeacion.md) y
   [PLANNING.md](../../PLANNING.md), y actualizar esta página y su gemela en inglés.

El servidor MCP recarga el kit cuando cambia su código, así que los agentes usan el algoritmo nuevo
en su siguiente llamada.

## Límites conocidos y dónde mejorar

En orden de lo que más rendiría:

1. **La visibilidad no está en la comprobación al ubicar.** El paso 2 conoce cuerpos y patas, pero
   no qué tapa qué en el dibujo isométrico, así que las piezas altas de adelante (LED,
   electrolíticos, reguladores) tapan las bajas de atrás y solo el ciclo de reintentos (y la
   reparación, para los cables) lo descubre. Desde que el umbral de lesson pasó al 70 % casi nunca
   bloquea, pero todavía hay cables que pasan en arco sobre los chips (la vista de atrás del 555). Una estimación barata en `tryOps` (qué tan alto es el cuerpo nuevo y qué tan cerca
   están las piezas bajas detrás de él, en cada vista), o medir la visibilidad solo de la
   candidata elegida (`inspect` de un componente), haría pasar el primer intento y dejaría el
   ciclo para los conflictos de verdad.
2. **El ciclo prohíbe un lugar a la vez** y empieza de nuevo. Con varios ítems bloqueantes puede
   gastar todos sus intentos en una sola zona. Prohibir una región pequeña, o rehacer solo los
   componentes posteriores a la víctima, convergería más rápido.
3. **Una fuente, una línea.** Las capas salen de un solo componente; un circuito con dos entradas o
   con realimentación se ubica en el orden dado después de la primera rama. El cursor nunca
   retrocede, así que un circuito largo solo crece a lo largo: no hay una segunda línea de etapas.
4. **Componentes de dos patas sin riel y sin componente anterior** caen en cualquier par de tiras
   vacías cerca del cursor, que puede quedar lejos de donde se conectan; los cables lo compensan.
5. **Chips DIP y pulsadores** pasan por `suggest`, que funciona pero es más lento y no sabe de las
   etapas del cursor más allá de `near`.
6. **Las placas anchas tapan sus tiras.** Un ESP32 DevKit a caballo del canal tapa 11 filas con su
   circuito impreso: solo las tiras de una fila de pines conservan una fila libre (la `a`, con la
   pata 1 en la `c`). Desde el 2026-10-26 la placa se ubica para que las patas que están en redes
   conserven esa fila, lo que cubre un circuito en una sola fila de pines (`esp32-led`,
   `esp32-button`). Redes en las dos filas (`3V3` y `D4`) todavía dejan un lado sin agujero: llegar
   por la otra pata de la placa con el mismo nombre (`GND2`), o una protoboard más ancha con el
   DevKit fuera de ella, lo arreglaría.

## Ver también

- [agentes.md](agentes.md): cómo lo usa el agente de montaje (paso 0 de su ciclo).
- [interfaz-para-agentes.md](interfaz-para-agentes.md): `suggest`, las operaciones y la revisión en
  que se apoya.
- [mapa-del-codigo.md](mapa-del-codigo.md): dónde está `layout.js` entre lo demás.
