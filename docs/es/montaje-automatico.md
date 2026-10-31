# Montaje automático: el algoritmo que ubica un circuito entero

*[English](../en/layout.md)*

`layout` convierte una lista de componentes (sin agujeros) y las redes que los unen en un
circuito ubicado, cableado y revisado, en alrededor de un segundo, sin que quien lo llama tenga
que probar y corregir. Esta página explica cómo funciona paso a paso, qué números lo gobiernan y
cómo cambiarlo sin romperlo. El código es `src/layout.js` (unas 1000 líneas) y `src/layout-sides.js`
(la elección de lados, paso 2a); las decisiones de diseño están en [planeacion.md](planeacion.md)
(2026-10-17, 2026-10-31).

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
- `board` (por defecto `auto`: la protoboard elástica, que crece a lo largo, o dos lado a lado cuando
  una placa de desarrollo lo pide, ver
  [Dos protoboards](#dos-protoboards-un-devkit-en-las-dos-filas-de-pines-desde-el-2026-10-31)),
  `clearance` (1 mm por defecto), `title`, `lang`, `netLabels`, `page`: pasan tal cual al circuito.

## El flujo

```text
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

### 2a. Lados: en qué mitad va cada componente (desde el 2026-10-31)

El canal del centro parte la protoboard en dos mitades, `T` (filas f–j, junto a los rieles T) y `B`
(filas a–e, junto a los rieles B). Una red con patas en las dos mitades necesita un cable (o un
componente) que cruce el canal, y una pata en la mitad contraria a su único riel necesita un cable
que cruce toda una mitad. Por eso, antes de ubicar nada, `assignSides` (`src/layout-sides.js`)
decide la mitad de cada componente a partir de las redes: una partición en dos que corta la menor
cantidad de redes posible, el problema clásico de las herramientas de ubicación, resuelto de la
manera clásica (pasadas de Fiduccia–Mattheyses).

- Trabaja sobre **redes eléctricas**: las redes pedidas que comparten una pata o un riel son una
  sola, como las lee `checkNets`, así que una pata puede ir a cualquier riel de su red eléctrica (el
  cátodo de un LED en `B-` cuando otra red une `T-` y `B-`).
- **Elementos**: un componente, o cada pata de un componente fuera de la protoboard (cada pata va
  donde le convenga). Un chip a caballo del canal tiene patas en las dos mitades: de la 1 a la n/2
  en su propia mitad y las demás en la otra, así que su mitad (la fila de la pata 1) entra en la
  elección. Un pulsador (la pata 1 siempre en la fila de atrás) y una placa de desarrollo que se
  ubica por la pata 1 (la fila de su pata 1 se elige antes, con la protoboard vacía) quedan fijos.
  Cada elemento pesa más o menos las columnas que ocupa en su mitad.
- **Costo** = `CROSS_WEIGHT` (8) × redes con patas en las dos mitades + `leanWeight` (12) ×
  elementos fuera de su mitad preferida + el desequilibrio entre las mitades que pase de
  `SIDE_SLACK` (10) columnas. Los rieles de una red atraen sus patas a su mitad; una red con rieles
  en las dos mitades no atrae a ninguna. La **mitad preferida**: un potenciómetro prefiere T (su
  perilla mira hacia adelante: en B tapa el camino de sus tiras hacia los rieles de adelante); una
  pata de una placa acostada detrás de la protoboard (un UNO, por defecto) prefiere T (su arco pasa
  sobre menos protoboard), y una acostada adelante prefiere B.
- **Búsqueda**: cada elemento libre, en orden, en la mitad que cuesta menos dados los anteriores
  (empates: la mitad más liviana y luego B); después, pasadas que mueven el elemento libre cuyo
  cambio más gana (empates por orden), lo bloquean, hasta moverlos todos, se quedan con el mejor
  prefijo y se detienen cuando una pasada no gana nada.

Un circuito con todos sus rieles en una mitad (un 7805 con `T+` y `T-`) se queda en esa mitad: es lo
más barato, y está bien. En una protoboard doble hay cuatro lados, de adelante hacia atrás `B`, `T`,
`K` (filas k–o) y `U` (p–t, junto a los rieles `U`): las mismas pasadas mueven un elemento a cualquier
otro lado, una red cuesta `CROSS_WEIGHT` por cada lado después del primero, y el equilibrio es entre
el lado más lleno y el más vacío; una placa sobre la unión tiene cada pata en el lado de su fila (`at`). Los circuitos con amplificadores operacionales, con el 555 y con el UNO se
reparten ahora según sus patas (la tabla de «Medido»).

### 2b. Ubicar cada componente (candidatas con puntaje, comprobadas solo con geometría)

Un **cursor de columna por mitad** (los dos empiezan en 2), así las dos mitades se llenan lado a
lado en vez de en una sola línea larga; un componente a caballo del canal empieza en el mayor de los
dos y mueve ambos.

Cada regla arma candidatas (juegos de agujeros) solo sobre tiras **vacías o que ya son de la misma
red eléctrica**: una tira con una pata de otra red, o con una pata que no está en ninguna red, nunca
se comparte, y un riel solo si está en la red eléctrica de la pata.

| Tipo de componente | Cómo se reconoce | Candidatas |
|---|---|---|
| Fuera de la protoboard (interruptor, Arduino, adaptador e-paper) | `resolve` responde `MODULE_PINS` | cada pata en su mitad: un agujero libre de una tira que su red ya tiene (del canal hacia afuera); si no, un riel de su red en esa mitad; si no, una tira nueva en el cursor de esa mitad, a dos columnas una de otra, hasta donde llegue la protoboard; cinco variantes (una fila más afuera, una columna más allá). Las patas que son, cada una, la única otra pata de una pata de un componente de tres en línea (un potenciómetro en 5V, A0 y GND) caen lado a lado en el orden de sus patas, en las filas detrás de él, y ese componente se ubica justo después: comparte las tres tiras y no necesita ningún cable detrás de su cuerpo (desde el 2026-10-31). De un interruptor solo cuentan las patas en uso y sus pares. |
| Placa de desarrollo sobre el canal (ESP32 DevKit, C3 SuperMini) | tipo `module` con un encapsulado que se ubica por la pata 1 | la pata 1 en cada fila y columna cerca del cursor, puntuada por los agujeros libres que conserva en su tira cada pata que está en una red, fuera de la placa y de lo que sobresale su circuito impreso; se prueban las seis mejores. Un DevKit cuyas redes usan una sola fila de pines queda con la pata 1 en la fila `c` y la fila `a` libre. Una pata en una red cuya tira la placa tapa entera se informa (`LAYOUT_PIN_COVERED`, abajo), y en `auto` el circuito pasa a dos protoboards (abajo) |
| Tres en línea (TO-220, TO-92, potenciómetro, módulo AMS1117) | encapsulado `inline`, tres patas | tres tiras seguidas en su mitad, en la ventana del cursor o donde ya están sus redes; las altas (`TALL`) en la fila `b`/`g`, las demás en `c`/`h` |
| Dos patas con un riel en una de sus redes (un capacitor o un LED a tierra) | encapsulado `span`, dos patas, `max ≥ 2` pasos | de pie: una pata en un riel de su red eléctrica en su mitad y la otra en la fila de al lado |
| Dos patas (cualquiera) | encapsulado `span`, dos patas | a lo largo de cualquier fila de su mitad, de `k` a `k + 3` agujeros de largo (`k` = la separación mínima del encapsulado), en los dos sentidos, en la ventana del cursor o desde una tira que sus redes ya tienen |
| Un encapsulado con huellas (chip DIP, pulsador, puente rectificador) | `pkg.footprints` | cada huella que permite el encapsulado: un DIP a caballo del canal con la pata 1 en su mitad, un pulsador a caballo del canal, un puente a lo largo de la fila `b`/`g` de su mitad |
| Cualquier otro, o si ninguna candidata pasó | — | `suggest` cerca del cursor (`limit: 3`, hasta 24 candidatas, sin reservar espacio ni cable puente; se saltan sus lugares en `forbid`); si también falla, `LAYOUT_PART_FAILED` con sus razones |

**El costo de una candidata** (mm; los empates mantienen el orden en que se armaron):

- por cada pata: nada en una tira o un riel que su red ya tiene; si no, `JUMPER_COST` (10) más la
  distancia al agujero más cercano de su red ya ubicado, o a su riel (la primera pata de una red no
  cuesta nada);
- `CURSOR_COST` (0,5) por cada columna entre la primera columna de la candidata y el cursor de su
  mitad;
- `EDGE_ROW_COST` (5) por quedar a lo largo de la fila junto a los rieles, que se guarda para los
  componentes que se paran en un riel;
- `SHADOW_COST` (25) por encerrar una tira de una pieza alta que todavía necesita un cable hasta su
  riel (o, para una pieza alta, por caer donde su tira quedaría encerrada). Una pieza alta tapa los
  agujeros entre ella y sus rieles en la vista desde su propio lado, así que ese cable solo se ve
  desde la otra vista, más allá de sus vecinos; medido: un componente en esa tira entre ella y el
  riel, o en la tira justo anterior en la mitad de atrás, lo tapa en las dos vistas.

**El orden en que se prueban**: las `MAX_TRIED` (16) más baratas, después las 8 más baratas desde el
cursor en adelante y después la más barata de cada columna y fila desde el cursor (un electrolítico
grande no cabe entre las piezas con las que compartiría tiras). Gana la primera que acepta `tryOps`
y que deja a cada pata que necesita un cable un agujero libre fuera del cuerpo del propio componente
(`reachable`: una lata de 2200 µF tapa sus propias tiras; no vale para los cuerpos levantados sobre
la protoboard, `HELD_UP`). Antes que todas se prueba donde estaba (al volver a montar); las
candidatas con un agujero bien adentro de la caja de un cuerpo que ya está en la protoboard ni
siquiera se construyen.

**`tryOps` (la prueba de aceptación).** Aplica la operación `add`, reconstruye el circuito **solo
con geometría** (`buildCircuit`: ocupación, largo de las patas, cuerpos que se cruzan, cruces,
separación; milisegundos, sin dibujar nada) y acepta solo si no agrega un error ni un problema
bloqueante nuevo respecto al circuito anterior (`blocking` = errores, avisos y notas `TOO_CLOSE`).
`FLOATING_PIN` se tolera porque los cables vienen después. Un lugar que está en `forbid` se salta.
Las respuestas se recuerdan durante toda la llamada (por circuito y operación), así un reintento
que repite los primeros pasos no los vuelve a construir.

Después de cada componente, el cursor de su mitad (las dos mitades si está a caballo del canal; la
mitad de cada pata si está fuera de la protoboard) pasa a dos columnas más allá de su pata más a la
derecha, o del borde derecho de su cuerpo si está sobre la protoboard; la protoboard elástica crece
con él (`headroom: SPAN + 12` columnas).

Por qué las filas `b`/`g` para las piezas altas: se midió que en las filas c–e y h–j un lado de sus
tiras queda detrás del cuerpo en una de las dos vistas, así que un agujero libre no se puede usar.

### 3. Cables puente: un árbol de expansión mínima por red (desde el 2026-10-31)

Por cada red: los grupos que toca (las tiras de sus patas ya ubicadas y sus rieles), y cuáles ya
unieron los cables anteriores (unión-búsqueda). Después, **Kruskal**: los pares de agujeros libres
entre dos grupos todavía no unidos, del más barato al más caro; el primero que acepta la prueba de
geometría (`tryOps`) los une, y los pares se miden de nuevo (cada cable ocupa dos agujeros) hasta
que la red queda en una sola pieza. Un par que la geometría rechazó no se vuelve a probar. Así cada
red recibe el conjunto de cables más barato que la une, en vez de una cadena que crece desde el
grupo de más a la izquierda (antes del 2026-10-31: cada grupo se unía al más cercano ya unido, con
80 pares cada uno).

- costo = largo en línea recta, + 1 si los dos agujeros no están en la misma columna (un cable
  recto se lee mejor), + `OVER_COST` (12 mm) por cada cuerpo que cruza su línea vista desde arriba
  (un cable pasa en arco sobre lo que queda entre sus agujeros y lo tapa: rodear un chip, o ir a
  una tira más lejana de la red, gana si es corto); los pares de menos de dos pasos se saltan
  (demasiado cortos para verse);
- agujeros de riel solo a 6 columnas o menos del grupo (un cable no recorre la protoboard para
  llegar a un riel); ningún agujero debajo del circuito impreso de una placa;
- `PAIRS_PER_GROUP` (40) pares por par de grupos; después de `JOIN_TRIES` (40) rechazos la red se
  rinde: `LAYOUT_WIRE_FAILED` por cada pieza que sigue aparte, que nombra el grupo más cercano por
  columna de la pieza más grande (adonde va la reparación) y los componentes de esas tiras (para el
  ciclo de reintentos);
- al volver a montar: los cables que el circuito ya tenía entre dos grupos se prueban primero.

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
ítem bloqueante nombra algunos componentes y uno de ellos pierde su lugar: su `forbidKey`
(`"<id> <patas>"`, o `"wire <agujeros>"` para un cable, porque los cables se renumeran) entra en
`forbid`, y el montaje se rehace desde cero. Cuál:

- por defecto, el **último ubicado** (`sequence`: primero los componentes, después los cables);
- un componente tapado por un cable, o un cable tapado por un componente (`PART_HIDDEN`): la primera
  vez, el cable; la siguiente vez que el mismo componente está en ese problema, el componente (mover
  cables no sirvió: sus tiras no tienen un agujero libre a la vista); después, el **enlace** del
  cable (`"link <grupo> <grupo>"`: esos dos grupos ya no se unen directamente, así la red los une de
  otra manera). Un cable encima de un componente pierde su enlace de una vez (desde el 2026-10-31);
- una red que quedó aparte (`LAYOUT_WIRE_FAILED`): el último componente ubicado en las tiras que
  ningún cable pudo unir;
- una pata tapada (`LAYOUT_PIN_COVERED`): ningún intento lo arregla, así que el ciclo se detiene ahí
  (y la reparación se salta); en `auto` todo el montaje se repite en dos protoboards (sección
  siguiente).

Se detiene cuando un intento es perfecto, cuando ya no hay un lugar nuevo que prohibir o después de
`TRIES`. Se queda el mejor intento, según
`puntaje = 100 × (redes mal) + 10 × problemas + ítems bloqueantes`.

Rehacer el montaje es más simple y predecible que parcharlo: un intento tarda 0,05–0,5 s, y los
pasos que un intento repite del anterior no se vuelven a construir (las pruebas de geometría se
recuerdan durante toda la llamada).

### Dos protoboards: un DevKit en las dos filas de pines (desde el 2026-10-31)

El circuito impreso de un ESP32 DevKit mide unos 11 agujeros de ancho y sus filas de pines quedan a
9–11 agujeros: en una sola protoboard tapa todas las filas libres de las tiras de una de ellas. Cuando
el mejor intento en `auto` (por defecto) termina con `LAYOUT_PIN_COVERED`, `autoLayout` monta otra vez
la especificación en la protoboard `double`: dos protoboards lado a lado, sin las tiras de rieles que
quedan entre ellas, con las filas k–t en la de atrás y sus rieles `U-`, `U+`
([formato-circuito.md](formato-circuito.md#dos-protoboards-lado-a-lado)). La nota
`LAYOUT_DOUBLE_BOARD` dice por qué. El DevKit va sobre la unión (pata 1 en la fila j, su otra fila en
la p), y cada fila de pines tiene filas libres en la tira de su propia protoboard. Una
especificación también la puede pedir con `"board": "double"` (o `bb830x2`). Si la doble tampoco
ayuda, se conserva la respuesta en una sola protoboard.

- **Rieles.** `T+` y `T-` no existen en una protoboard doble (son los rieles que se quitan): cuando
  layout pasa la especificación ahí por su cuenta, se vuelven `U+` y `U-`, el par de atrás, en redes,
  fuentes y etiquetas (nota `LAYOUT_DOUBLE_RAILS`); una especificación que pide `double` y nombra
  `T±` se rechaza (`NET_UNKNOWN_RAIL`, con los rieles de la protoboard).
- **Tierra.** Si las redes no nombran un riel −, una red de tierra va a los dos rieles − de afuera,
  `B-` y `U-` (`LAYOUT_GROUND_TO_RAILS`), para que los componentes de cada protoboard lleguen a tierra
  por su lado, y lleva las otras patas de tierra del mismo grupo interno de la placa (`GND2` con
  `GND`, `LAYOUT_GROUND_PARTNERS`): así cada riel − se une con la tierra de su propia fila de pines
  con un cable corto. Las patas que una placa une por dentro (`internal` en `src/parts/modules.js`)
  cuentan como un solo grupo para el árbol de cables y para `checkNets` (`internalLinks`,
  `src/nets.js`).
- **Lados.** Cuatro (`B`, `T`, `K`, `U`, paso 2a): los componentes de las redes de una fila de pines
  van al lado de esa fila, donde están sus filas libres.

`examples/layout/esp32-both-headers.json` (un LED en D4, un pulsador en D15, un potenciómetro en D34,
una resistencia en D23) sale `DONE` en 2 intentos, cerca de 1 s; `examples/esp32-two-boards.json` es
ese montaje guardado.

### Reparaciones y convenciones (desde el 2026-10-20)

- **La tierra, al riel.** Antes de montar, una red con una pata de tierra (`GND`, `GND2`, `VSS`, `0V`,
  o el `negative` de una fuente) y sin riel recibe el riel − que usan las otras redes, o si no `B-`
  (`groundToRail`), con la nota `LAYOUT_GROUND_TO_RAIL`. Es lo que se hace en cualquier protoboard: un
  cable corto por tira en vez de una cadena a lo largo de la placa. El spec guardado en el circuito
  es lo que se pidió, sin la convención.
- **Reparación.** Si el mejor intento todavía no es perfecto, `repair` lo toma una vez más, cable por
  cable: una red que quedó aparte (`LAYOUT_WIRE_FAILED`) y cada cable que nombra un punto bloqueante
  se trazan de nuevo con `suggest` (perfil lesson: mide lo que tapa un cable en las dos vistas). Una
  reparación se queda solo si mejora el puntaje (redes, problemas, bloqueantes), con la nota
  `LAYOUT_REPAIRED`. Desde el 2026-10-31 traza como máximo `REPAIRS` (4) cables, con 8 a 24
  candidatas cada uno y sin cable puente por una tira libre (una búsqueda así tardó hasta 16 s), y
  se salta cuando una pata está tapada.

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
| `SPAN` | 8 | columnas más allá del cursor donde un componente busca espacio |
| `TALL` | `TO-220`, `ams1117-module` | encapsulados de tres en línea que van en la fila b/g; su camino a los rieles se mantiene a la vista (`SHADOW_COST`) |
| `KNOBS` | `pot-vertical` | encapsulados con una perilla hacia adelante: prefieren T |
| `HELD_UP` | `TALL` y `KNOBS` | cuerpos levantados sobre la protoboard: las patas y los cables pasan por debajo de su caja |
| `BESIDE` | `switch`, `module`, `battery` | cuerpos fuera de la protoboard: solo sus agujeros mueven el cursor |
| `boardSides(spec)` | T: j…f, B: a…e (doble: también K: k…o, U: t…p) | filas de cada mitad, del riel (o de la unión) hacia adentro; de `src/board/board.js` |
| `PALETTE` | naranja, verde, amarillo, azul, blanco, violeta | colores de los cables de las redes sin riel |
| `CROSS_WEIGHT`, preferida, `SIDE_SLACK` | 8, 12, 10 | lados: una red que cruza el canal, un elemento fuera de su mitad preferida, columnas de desequilibrio que no cuestan |
| `JUMPER_COST`, `CURSOR_COST` | 10 mm, 0,5 mm por columna | el costo de una candidata: cada cable que va a necesitar, su distancia al cursor |
| `EDGE_ROW_COST`, `SHADOW_COST` | 5 mm, 25 mm | quedar a lo largo de la fila junto a los rieles; encerrar el camino de una pieza alta a su riel |
| `MAX_TRIED` | 16 | candidatas más baratas que se prueban antes que las del cursor en adelante, y después `suggest` |
| `PAIRS_PER_GROUP`, `JOIN_TRIES` | 40, 40 | pares de agujeros que se miden por par de grupos; rechazos antes de que una red se rinda |
| `OVER_COST`, `OVER_MARGIN` | 12 mm, 0,3 mm | el costo de un cable por cada cuerpo que cruza; un cable que termina en el borde de un cuerpo no lo cruza |
| `TRIES`, `REPAIRS` | 8, 4 | reintentos como máximo; cables que la reparación vuelve a trazar como máximo |
| inicio del cursor | 2 | primera columna que se usa, en cada mitad |
| `clearance` | 1 mm (por defecto en la especificación) | separación entre cuerpos; 3 para una clase más holgada |

## Medido (`npm run layout-bench`)

| Especificación | 2026-10-18 | 2026-10-20 |
|---|---|---|
| `regulator-led.json` (4 componentes, 4 redes) | aprobado · 4 intentos · 0,3 s | aprobado · **1 intento** · 0,1 s |
| `two-rail-supply.json` (10 componentes, 10 redes: una fuente de dos rieles de lección) | aprobado · **8 de 8** intentos · 1,5 s | aprobado · **1 intento** · 0,3 s |

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

El 2026-10-31 cambió la ubicación (lados a través del canal, candidatas con puntaje, un cursor por
mitad, cables como árbol de expansión; [planeacion.md](planeacion.md)). Frente al banco de esa
mañana (`npm run layout-bench -- --compare`): las 25 recetas y las dos especificaciones de antes
siguen en `DONE`, y `uno-many-pins.json` (siete patas del UNO en redes) y `opamp-stage-chain.json`
(dos etapas con LM358) ahora también; cables 139 → 132, cable 2154 → 1711 mm, redes que cruzan el
canal 24 → 20, el caso más largo 1,1 s (antes, 8–10 s). `esp32-both-headers.json` todavía necesita
una protoboard más ancha, pero lo dice en un intento, 0,5 s (antes, 19 s), sobre una protoboard de
36 columnas (antes, 54). Agujeros usados en cada mitad (T/B) antes → después, en las recetas que más
cambiaron: `555-astable` 21/10 → 11/17, `opamp-comparator` 9/26 → 23/5, `lm393-comparator`
7/31 → 26/6, `uno-button` 4/13 → 16/2, `two-rail-supply.json` 15/13 → 3/27.

## Cambiar el algoritmo

1. **Medir primero**: `npm run layout-bench` y guardar la salida. Agregar a `examples/layout/` la
   especificación de cualquier circuito real que salga mal (una especificación, no un circuito:
   `parts` sin patas, `nets`), así queda como caso de regresión.
2. Cambiar `src/layout.js`. Dónde va cada tipo de cambio:
   - un tipo de componente nuevo, o un mejor lugar para uno → una rama del paso 2b (la cadena de
     `kind`: `beside`, `board`, `inline`, `span`, `footprints`) o el costo (`costOf`); un tipo sin
     regla ya funciona por el `suggest` de reserva, solo que más lento y menos ordenado;
   - en qué mitad va un componente → paso 2a (los elementos en `layoutOnce`, `src/layout-sides.js`);
   - el orden de los componentes → paso 1 (`layer`, `order`);
   - qué se acepta al ubicar → `tryOps` y `blocking`;
   - los cables → `pairs` (costo) y el ciclo de Kruskal del paso 3;
   - cuándo rendirse o qué prohibir → `autoLayout` (`score`, la elección de la víctima, `TRIES`).
3. `npm run layout-bench` otra vez: todas las especificaciones siguen APROBADAS; comparar intentos,
   cables, columnas y tiempo. Después, `npm test` (`test/layout.test.js`: colocación, verificación
   de redes, nombres, validación de una pasada, campos desconocidos) y `npm run test:mcp`.
4. Anotar el porqué en el registro de decisiones de [planeacion.md](planeacion.md) y
   [PLANNING.md](../../PLANNING.md), y actualizar esta página y su gemela en inglés.

### Medir un cambio

`scripts/layout-metrics.js` mide lo que produjo un montaje, solo con los agujeros (sin reloj):
componentes y cables, `wireLength` (mm, en línea recta entre los dos agujeros de cada cable), las
columnas usadas (`min`, `max`, `span`) y las de la placa, los agujeros usados en la mitad de atrás
(`T`, filas f–j), la de adelante (`B`, filas a–e) y en los rieles, `channelCrossings` (redes pedidas
con patas en las dos mitades), `tries`, `ms` y la cantidad de bloqueos y problemas.

- `npm run layout-bench -- --save [archivo]` escribe las medidas de cada caso (con la fecha y la
  versión de Node) en una línea base: por omisión `.claude/state/layout-bench.json`, que no va a git
  (`.claude/state/` se ignora), así que cada copia del repositorio tiene la suya.
- `npm run layout-bench -- --compare [archivo]` corre otra vez e imprime, por caso, lo que cambió
  frente a la línea base (cables, largo de cable, ancho en columnas, agujeros, cruces, intentos,
  estado) con su signo, los casos nuevos o ausentes y una línea de totales (cables, mm de cable,
  cruces, casos `DONE`). El tiempo se guarda pero nunca se compara. Si se pasan archivos de
  especificación, van antes de las banderas.
- Una especificación de `examples/layout/` puede llevar `"bench": { "expect": "changes", "why": "…" }`:
  un caso que el algoritmo todavía no resuelve. El banco quita la clave antes de montar, imprime el
  caso como `EXPECTED CHANGES` y no lo cuenta como fallido; todo lo demás debe terminar en `DONE`
  para salir con código 0. Cuando uno de esos casos empiece a terminar en `DONE`, se le quita la
  clave `bench`. Hoy: ninguno (`esp32-both-headers.json` termina en `DONE` en dos protoboards desde
  el 2026-10-31).

El servidor MCP recarga el kit cuando cambia su código, así que los agentes usan el algoritmo nuevo
en su siguiente llamada.

## Límites conocidos y dónde mejorar

En orden de lo que más rendiría:

1. **La visibilidad todavía la encuentra sobre todo el ciclo de reintentos.** Un cable paga por cada
   cuerpo que cruza (paso 3) y una candidata paga por encerrar el camino de una pieza alta a su riel
   (paso 2b), pero la ubicación todavía no sabe qué tapa qué en el dibujo isométrico: los cables de
   un UNO que pasan en arco sobre la protoboard, un cable largo que cruza una mitad por encima de
   una resistencia, un LED alto delante de una pieza baja. El ciclo los encuentra (de uno a cinco
   intentos en el banco). Una estimación barata de cada vista (qué tan alto es un cuerpo y qué hay
   detrás), o medir la visibilidad solo de la candidata elegida, haría pasar más primeros intentos.
2. **Cada candidata construye el circuito entero.** `tryOps` vuelve a construir la geometría de
   todas las piezas para comprobar una más; eso es casi todo el tiempo (las pruebas se recuerdan
   entre intentos, lo que ayuda al ciclo, no al primer intento). Una comprobación incremental (solo
   lo que toca la pieza nueva) dejaría probar muchas más candidatas en el mismo tiempo.
3. **El ciclo prohíbe un lugar a la vez** y empieza de nuevo. Con varios ítems bloqueantes todavía
   puede gastar sus intentos en una sola zona; prohibir una región pequeña, o rehacer solo los
   componentes posteriores a la víctima, convergería más rápido.
4. **Una fuente, dos líneas.** Las capas salen de un solo componente, así que un circuito con dos
   entradas o con realimentación se ubica en el orden dado después de la primera rama; los cursores
   nunca retroceden, así que un circuito largo crece a lo largo en sus dos mitades, sin una tercera
   línea de etapas.
5. **El equilibrio entre mitades es suave.** Un circuito con todos sus rieles en una mitad se queda
   ahí (es lo más barato); la otra mitad se llena solo cuando una mitad quedaría más de `SIDE_SLACK`
   columnas más larga que la otra, o cuando las redes lo piden.
6. **La unión de la protoboard doble es un supuesto.** Un paso vacío entre las filas j y k (cada
   bloque principal termina un paso después de su fila de afuera): mide dos protoboards reales y
   cambia `junction` en `doubleBoard` (`src/board/board.js`) si es distinta. Los cables entre las
   filas de pines de las dos protoboards todavía pasan por encima del DevKit cuando una red necesita
   las dos (tres en el caso del banco).

## Ver también

- [agentes.md](agentes.md): cómo lo usa el agente de montaje (paso 0 de su ciclo).
- [interfaz-para-agentes.md](interfaz-para-agentes.md): `suggest`, las operaciones y la revisión en
  que se apoya.
- [mapa-del-codigo.md](mapa-del-codigo.md): dónde está `layout.js` entre lo demás.
