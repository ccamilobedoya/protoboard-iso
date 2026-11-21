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
| MCP | herramienta `layout` (`target`, `recipe` y `values`, o `parts`, `nets`, `supplies`; `board`, `title`, `netLabels`, `environment`, `page`, `clearance`, `check_only`, `dry_run`, `fix`, `budget_s`) |
| Consola | `node bin/protoboard-iso.js layout <objetivo nuevo> <spec.json \| -> [--check] [--dry-run] [--json] [--budget <segundos>]`, o `--recipe <nombre> [--values '<json>']`, o `layout <objetivo> --fix [--dry-run]` (sale con 0 si queda listo, 2 si hay cambios) |
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

- `parts`: sin `pins`, en cualquier orden: el orden dado se prueba primero y desempata (paso 1), y
  si deja algo por arreglar se prueban también los órdenes que dan las redes ([Cualquier orden](#cualquier-orden-los-órdenes-que-dan-las-redes-desde-el-2026-11-16)). Un componente
  es un tipo con sus campos, o solo una referencia, un módulo o un alias (`"7805"`, `"KCD1"`,
  `"UNO"`, `"resistencia"`): `resolvePart` (`src/parts/resolve.js`) completa el tipo.
- `nets`: cada una, una lista de patas (`"D1.K"`; el nombre de la pata no distingue mayúsculas) y
  rieles (`"T-"`, `"B+"`), o `{ pins, color }`. Una pata sola (`["D1.A"]`) vale: es donde se
  conectará una fuente. Una pata que aparece en varias redes las une: quedan como una sola red, donde
  estaba la primera, con sus patas en el orden en que llegaron (nota `LAYOUT_NETS_JOINED`: «Las
  redes 1, 2, 3 comparten U1.D8»), el mismo circuito que el spec con las patas en una sola lista
  (desde el 2026-11-20; antes cada una se cableaba aparte y la pata de una placa podía quedarse sin
  lugar). Dos redes que comparten un riel siguen siendo dos, unidas por el riel (`["T-", "B-"]` une
  las tierras).
- `supplies`: como en un circuito, salvo que `positive` y `negative` pueden nombrar una pata; una
  vez ubicada, se vuelve un agujero libre de su tira.
- `board` (por defecto `auto`: la protoboard elástica, que crece a lo largo, o dos lado a lado cuando
  una placa de desarrollo lo pide, ver
  [Dos protoboards](#dos-protoboards-un-devkit-en-las-dos-filas-de-pines-desde-el-2026-10-31)),
  `clearance` (1 mm por defecto), `title`, `lang`, `netLabels`, `environment`, `page`: pasan tal cual al circuito.

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
en un interruptor, cuyo campo es `on`), un campo que el tipo no sabe leer (el `resolve` del propio
componente: el `"abc"` de una resistencia dice que lleva una resistencia como `330` o `4k7`, un color
de LED que no existe lista los colores; un componente cableado pata por pata, `MODULE_PINS`, se deja
a su colocación), una red que nombra un componente o una pata que no existe (con las patas que sí
tiene; no para un componente cuyos campos no se pudieron leer) y un componente que no está en
ninguna red (aviso). Con cualquier
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

**`tryOps` (la prueba de aceptación).** Agrega el componente y comprueba **solo la geometría**
(ocupación, largo de las patas, cuerpos que se cruzan, cruces, separación; sin dibujar nada), y
acepta solo si no agrega un error ni un problema bloqueante nuevo respecto al circuito anterior
(`blocking` = errores, avisos y notas `TOO_CLOSE`). Desde el 2026-11-20 el componente se construye
solo y se comprueba con los componentes cuyas cajas le quedan cerca o que comparten una tira con él
(`addedOnly`): cada comprobación de ubicación trata de un componente o de un par, así que la
respuesta es la misma que da construir todo, en un tiempo que no crece con el circuito. Si la
protoboard crece con el componente, se vuelven a dibujar los componentes que están al lado (siguen
su tamaño).
`FLOATING_PIN` se tolera porque los cables vienen después. Un lugar que está en `forbid` se salta.
Las respuestas se recuerdan durante toda la llamada (por circuito y operación), así un reintento
que repite los primeros pasos no los vuelve a construir.

**Lo que tapa (desde el 2026-11-20).** Un lugar que la geometría acepta se mide luego como la
revisión mide un dibujo (`src/layout-sight.js`): el componente, los que se le superponen en pantalla
y lo que tapa a esos, pintados de lejos a cerca en las dos vistas a 2 px/mm, en un marco alrededor
de ellos. Si se deja a sí mismo, o a un componente que tapa más que antes, por debajo de
`SEEN_SHARE` (75 %) en su mejor vista, se prueba la candidata siguiente; la primera por costo se usa
solo si ninguna se libra. Los cables (paso 3) se miden igual. Corre como una segunda búsqueda, solo
cuando la primera (el ciclo de reintentos sin medir, como siempre ubicó el montaje) termina con algo
que bloquea, desde una lista de prohibidos vacía; se queda la mejor de las dos, la primera si
empatan. El ciclo arregla todas las recetas (`laser-uno` deja 5 componentes tapados en su primer
intento y ninguno en el sexto), así que una receta queda exactamente como antes (las recetas se
publican y se filman), y un circuito grande que el ciclo no arregla (diez LED de una pata, un UNO con
un 74HC595 y ocho LED) se mide cuando termina su primera búsqueda. Hasta el 2026-11-20 la segunda
búsqueda empezaba después del primer intento cuando ese intento dejaba más de 5 componentes tapados
(`HIDDEN_SETTLED`): una receta estaba justo en 5, así que un componente más en una receta la habría
movido. La regla ahora depende de cómo termina la primera búsqueda, nunca de una cuenta; su precio
son los intentos de la primera búsqueda en un circuito grande (diez LED de una pata: 9 intentos y
4,5 s en vez de 2 y 1,8 s, con carga 2).

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

### Cualquier orden: los órdenes que dan las redes (desde el 2026-11-16)

El ciclo de reintentos de arriba repara un lugar a la vez; lo que no puede cambiar es el orden en que
se ubican los componentes, y ese orden lo daba quien llama. El mismo circuito escrito de dos maneras
podía terminar `DONE` de una y `CHANGES` de la otra (medido: una resistencia agregada en serie con un
zumbador, escrita al final de los componentes y no antes del zumbador, sobre el circuito ya ubicado:
`No cabe ningún cable` y la red del zumbador suelta). Las capas del paso 1 no ayudan ahí: una red de
tierra que pasa por el pin `GND` de una placa hace a cada componente vecino de la placa, así que todos
quedan en la capa 1 y decide el orden dado.

Por eso `autoLayout` (`inAnyOrder`) monta primero en el orden dado, igual que antes: una
especificación que termina `DONE` (o `WARNINGS`) queda tal cual y no cuesta nada más. Solo si termina
`CHANGES` prueba los órdenes que dan las redes (`signalOrders`), cada uno ubicado tal como está (sin
capas), y se queda con el mejor resultado: primero las redes y la revisión, luego los cables, luego
las columnas. Los dos órdenes salen solo de las redes, así que son los mismos sea cual sea el orden en
que vinieron los componentes:

- **la fuente**: el componente del pin positivo de una fuente, si no una placa con microcontrolador,
  si no el primer componente en un riel +, si no el primero en las redes;
- **solo redes de señal**: una red con un riel, un pin de tierra o de alimentación (`GND`, `5V`,
  `3V3`, `VIN`, `VCC`…) o un borne de una fuente alimenta etapas y no las encadena; solo alcanza
  componentes a los que no llegan las redes de señal. Los empates van por dónde aparece primero un
  componente en las redes;
- **por distancia a la fuente**, las fuentes primero: `U1, R1…R7, DS1` (el display después de las
  siete resistencias que lo alimentan);
- **desde el otro extremo**: el recorrido en profundidad desde la fuente, al revés, así cada
  componente va antes del que lo maneja y las patas de una placa caen en tiras que ya tienen sus
  componentes: `BZ1, R3, D2, R2, D1, R1, U1`.

La respuesta lo dice en una nota (`LAYOUT_ORDER_FROM_NETS`: «se montaron en el orden que dan sus
redes (…)»), y `order` y `keepOrder` en el resultado dejan que un segundo montaje de la misma llamada
(las metas de una receta) use otra vez ese orden.

Medido sobre todas las recetas con sus componentes barajados (`test/layout-order.test.js` guarda una
muestra de catorce, tres barajas con semilla cada una): donde el orden dado falla, uno de los dos
termina `DONE`, salvo `esp32-distance` (en la protoboard doble solo terminan `DONE` los órdenes con el
divisor antes del DevKit y el sensor después; la prueba la nombra). El banco no cambia: cada
especificación termina igual, con la misma ubicación, porque todas terminan `DONE` en su propio orden.
Un montaje que falla y se recupera cuesta sus intentos fallidos: 4,3 s en el caso medido de arriba
(3,2 s de ellos, el orden dado que falla), contra 0,6 s con la resistencia escrita antes del
zumbador; unos 9 s en la variante con transistor de ese circuito con su arreglo (nueve componentes y
una placa). Sobre todas las recetas barajadas tres veces: 0,26 s en promedio donde el orden dado
funciona, 2,3 s (a lo sumo 7 s) donde falla.

### Lo que prueba el montaje antes de CHANGES (desde el 2026-11-20)

La misma especificación da siempre el mismo circuito, así que enviarla otra vez no ayuda; lo que
les sirvió a los asistentes que recibieron `CHANGES` fue una prueba que haría una persona: poner
otro componente de primero, o llevar el circuito a la protoboard más grande, **montado otra vez
sobre el circuito ya hecho** (cada componente prueba primero los huecos que tiene ahí, como en un
segundo montaje de un objetivo). `inAnyOrder` ahora lo hace solo antes de responder `CHANGES`
(`withTrials`), desde su mejor intento, cada prueba con a lo sumo `TRIAL_TRIES` intentos del ciclo
de reintentos, en este orden, y se queda con la primera que termina sin `CHANGES` (si no, la mejor
con el mismo rango):

1. **los órdenes que dan las redes otra vez**, desde el mejor intento (`LAYOUT_ORDER_FROM_NETS`);
2. **la protoboard doble**, cuando un punto bloqueante nombra una placa de desarrollo (un módulo con
   GPIO: un UNO, un DevKit) junto con otro componente (lo tapa a él o a una tira suya) y la
   especificación no nombra su protoboard: en el orden dado y luego en los órdenes de las redes
   (`LAYOUT_TRIED_DOUBLE`, `LAYOUT_TRIED_DOUBLE_ORDER`: «se montó en la protoboard doble … porque U1
   tapaba a U2 en una sola»);
3. **los componentes más altos de primero**, luego **los más anchos** (por el cuerpo en el dibujo
   del mejor intento; una placa de desarrollo y un componente al lado de la protoboard no se
   mueven), con las capas empezando por ellos (`LAYOUT_TRIED_TALLEST`, `LAYOUT_TRIED_WIDEST`).

Nada eléctrico cambia y no se le pregunta a nadie; la respuesta trae una nota que dice qué cambió
respecto a la especificación escrita. Una prueba corre solo mientras el límite de tiempo alcanza.
Cuando la respuesta sigue en `CHANGES`, cada línea ✖ va seguida del único cambio de la
especificación que el kit probaría después (`next` en el punto: la primera prueba que el límite
dejó sin hacer; si no, la protoboard doble cuando se nombra una placa de desarrollo y el circuito no
está en una; si no, poner de primero el componente tapado y luego el que lo tapa; si no, «muévelo
con suggest»), y una línea dice qué se probó (`layout.tried`).

Medido en las tres especificaciones con las que los asistentes recibieron `CHANGES`
(`test/layout-trials.test.js`, carga 2–3 en una máquina de cuatro núcleos; antes: `CHANGES` en 14,
38 y 35 s): un cable puente bajo un módulo ultrasónico, `DONE` en 20–27 s (los órdenes de las redes
desde el mejor intento); un contador de siete segmentos con botón, `DONE` en 36 s (igual); un UNO que
tapa medio 74HC595, `WARNINGS` (el registro de desplazamiento no se simula) en 32 s, en una sola
protoboard, con los órdenes de las redes antes de cualquier prueba (con la segunda búsqueda de «Lo
que tapa»; antes de ella, la prueba de la protoboard doble lo resolvía en 1,3 s). El banco no cambia:
cada especificación termina `DONE` en su propio orden, así que no corre ninguna prueba.

### Tamaño y límite de tiempo: calcular primero, nunca desbocarse (desde el 2026-11-20)

**El tamaño, antes de ubicar.** `estimateSize` (en `autoLayout`, cuando el spec es válido; también
con `--check`) acota por abajo las columnas que toma el spec, solo con sus componentes y sus redes,
en mucho menos de un segundo: una tira lleva patas de una sola red eléctrica, así que una red sin
riel necesita una tira por cada cinco patas, y una pata sin red una tira para ella sola (`sides`
tiras por columna: 2, o 4 en la protoboard doble); un chip a caballo del canal (un DIP) toma ahí sus
columnas enteras. Frente a las columnas hasta las que puede crecer la protoboard
(`LIMITS.boardColumns`, 600, en `auto` y `double`; las suyas en una fija):

- más que la protoboard: `STATUS: FIX_SPEC`, sale con 1, no se crea nada, una línea con los números
  (`LAYOUT_TOO_LARGE`: «hacen falta unas 1600 columnas y hay 600 (401 componentes). En una
  protoboard caben unos 150 componentes: divídelo en dos o más circuitos»);
- cabe, pero un intento de la búsqueda tarda más que el límite de tiempo (`SECONDS_PER_PART`, 0,12 s
  por componente sobre la protoboard, medido): una primera nota lo dice (`LAYOUT_SEARCH_LONG`) y lo
  intenta igual.

Es una cota, no una adivinanza del montaje: nunca rechaza lo que la búsqueda puede ubicar. Todas
las recetas, los ejemplos de montaje y los circuitos de ejemplo quedan por debajo de media
protoboard (`test/layout-size.test.js`).

**El límite de tiempo.** `layout` recibe un límite de tiempo de reloj: 60 s por defecto
(`BUDGET_SECONDS`), en la consola `--budget <segundos>`, en el MCP `budget_s`, como mucho
`LIMITS.layoutSeconds` (300; más que eso queda en eso, con una nota `LAYOUT_BUDGET_CAPPED`). La
búsqueda lo mira antes de cada componente, cada cable, cada intento, cada orden y cada reparación, y
`suggest` antes de cada candidata que mide. Cuando se acaba, la búsqueda se detiene donde está y
responde con el mejor intento hasta ahí, `STATUS: CHANGES`, y una línea: «La búsqueda se detuvo en
su límite de tiempo de 60 s con su mejor intento hasta ahí: N componentes sin colocar, M redes sin
unir, K puntos de la revisión abiertos. Las opciones: un límite mayor … o un circuito más pequeño»
(`LAYOUT_BUDGET`). El circuito se escribe igual (sale con 2, como todo `CHANGES`). El arreglo
calculado de sus peligros no se busca entonces (segundos de simulaciones, para un circuito que
todavía hay que arreglar).

**El mismo spec, el mismo circuito.** Nada de la búsqueda depende del reloj salvo el límite de
tiempo: dos corridas de un spec dan el mismo `circuit.json`, y un límite que se acabó es la única
fuente de diferencia, y su línea lo dice.

**Memoria.** Un componente se agrega sin copiar el circuito (`addOne`; `applyOps` lo copia entero),
se construye solo en una protoboard que comparten las candidatas del mismo tamaño (`builtAlone`), y
la memoria de las comprobaciones de geometría guarda como mucho `MEMO_STATES` (1500) estados, y antes
de cada revisión solo los pasos de ese intento. `buildCircuit` guarda sus dos últimos resultados por
el texto del circuito (una revisión construía el mismo circuito cinco o seis veces), y la trama del
inspector guarda las celdas de cada componente en una lista tipada, no en un Set
(`src/render/coverage.js`); las dos dan las mismas cifras (`test/recipe-visibility.test.js`).
Doscientas resistencias en serie con una pila de 9 V: `DONE` en un intento, unos 6 s, 0,62 GB; por
la consola, con su página, unos 1,05–1,1 GB (abajo).

### Costo: lo que hacía lentos los circuitos grandes (medido el 2026-11-20)

Perfilado con `node --cpu-prof` y contadores en la búsqueda, con una pata de un UNO que maneja diez y
veinte LED con sus resistencias (en la 0.12.1 diez tardaban 59 s y terminaban `CHANGES`, veinte no
terminaban en 120 s, un spec parecido se quedó sin memoria):

- **Cada candidata reconstruía el circuito entero.** `tryOps` llamaba a `buildCircuit` sobre todo:
  la geometría 3D de cada componente desde cero (el torneado de una resistencia, la cúpula de un
  LED) y las comprobaciones de cada par. Diez pares: 2849 comprobaciones de unos 15 componentes cada
  una en 24 intentos, 34 s de 92 s; el costo de un intento crecía con el cuadrado de los
  componentes. Ahora, el componente solo frente a los que tiene cerca.
- **La memoria guardaba una construcción entera por candidata**, con el circuito entero escrito como
  clave: 2,9 GB de memoria residente para diez pares; además `applyOps` copiaba el circuito entero
  por cada candidata.
- **Los intentos no convergían.** Cada intento terminaba con de tres a nueve componentes o cables
  tapados en las dos vistas (`PART_HIDDEN`), el ciclo movía un lugar por intento, y los órdenes que
  dan las redes corrían ocho intentos más cada uno, uno de ellos el mismo orden ya montado: 24
  intentos y el `suggest` de la reparación (cada candidata un dibujo entero, 13 s). Ahora la
  visibilidad se mide al ubicar cuando el primer intento muestra que el ciclo no lo arregla, y un
  orden igual al ya montado se salta.

Medido el 2026-11-20, con carga media de 1 a 1,5 (un proceso cada uno, memoria residente máxima),
antes → después:

| Caso | Antes (código de la 0.12.1) | Después |
|---|---|---|
| pata D8 de un UNO → diez LED con 220 Ω, un programa que la maneja | `CHANGES`, 24 intentos, 64 s, 2,9 GB | `WARNINGS` (la pata por encima de su corriente), 2 intentos, 3,0 s, 0,4 GB |
| lo mismo con veinte | no terminó en 180 s | `WARNINGS`, 3 intentos, 8,3 s, 0,5 GB |
| UNO + 74HC595 + ocho LED (18 componentes) | `WARNINGS`, 20 intentos, 37 s, 2,8 GB | `WARNINGS`, 12 intentos, 9,4 s, 0,6 GB |
| doscientas resistencias en serie con una pila de 9 V | sin memoria, salida 134 | `DONE`, 1 intento, 5,6 s, 0,62 GB; la consola con su página 8,8 s, 1,04–1,11 GB |
| todas las recetas (60) / con los ejemplos de montaje (65) | 16,7 s / 20,9 s | 15,9 s / 17,7 s, todas `DONE` |

Frente al kit justo antes de este trabajo (con las dudas y la línea `Comportamiento`), las recetas
pasaron de 26,5 s a 15,6 s y ninguna se volvió más lenta en más de 10 %. Ubicaciones: todas las
recetas y los ejemplos de montaje quedan como en la 0.12.1 salvo los cuatro cuyas redes de tierra
ahora son una (`uno-button`, `encoder-dimmer-uno`, `clap-switch`, `esp32-both-headers.json`).

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

**Aplicar el arreglo del kit** (`layout <objetivo> --fix`; en la herramienta MCP `fix: true`; desde
el 2026-11-16). Sobre un circuito hecho con `layout`, el kit toma el arreglo que su revisión imprime
para el circuito tal como está (`Para arreglarlo`, [simulacion.md](simulacion.md#el-arreglo)) y monta
el circuito con él como una revisión (`fixRequest` en `src/layout.js`, `specWithFix` en
`src/fix.js`): `set`, el valor nuevo de la resistencia (y el de la receta, en un circuito de receta);
`add-series`, una resistencia nueva con el siguiente número R del circuito entre el pin y la red en
la que estaba (`["U1.D10", "R3.1"]`, `["R3.2", "BZ1.1"]`), escrita justo antes del componente con
el que queda en serie; `swap`, un componente puesto al revés, volteado (sus dos patas intercambiadas
en las redes); `swap-supply`, los cables de una fuente intercambiados (una fuente de banco sin rieles
propios recibe los de la protoboard, escritos al revés; una batería como componente, sus dos patas en
las redes). La respuesta es la de cualquier `layout`, con una línea más antes de `STATUS:`:
`Arreglo aplicado: R3 = 200 Ω en serie con BZ1.` (`Applied the fix: R3 = 200 Ω in series with
BZ1.`), `Arreglo aplicado: BZ1 volteado (su 1 y su 2 intercambiados).` o `Arreglo aplicado:
intercambiados los cables de V1 (su + y su −).`; `--dry-run` lo vuelve un ensayo; `undo` devuelve el circuito (y su aviso). El kit nunca
aplica un arreglo por su cuenta, solo con esta petición. Donde no hay nada que aplicar lo dice y no
cambia nada: sin peligro (`LAYOUT_FIX_NONE`, no es un error: sale con 0), sin arreglo calculado
(`LAYOUT_FIX_NO_FIX`: «El kit no tiene un arreglo calculado para esto.»), un circuito sin `spec`
(`LAYOUT_FIX_NO_SPEC`), con una especificación o valores además (`LAYOUT_FIX_AND_SPEC`); los tres
últimos salen con 1 (en la herramienta MCP: un error).

Así el spec es el estado deseado: cambiar conexiones es dar redes nuevas y volver a llamar `layout`;
valores, descripciones y retoques finos siguen siendo operaciones (`apply_ops`).

### La respuesta

`{ status, circuit, placed: [{ id, type, pins, rails, shared }], wires, columns, problems, sequence,
check, review, tries, solved?, advice?, readings?, programs?, changeable?, ms }`; `formatLayout` la escribe para la
consola y la herramienta MCP (textos `layout.*` en `src/i18n/`).

Después del veredicto de la revisión y sus peligros (⚠), las líneas de peligro de la propia revisión:
el arreglo calculado por el kit (`Para arreglarlo: …`, o «El kit no tiene un arreglo calculado para
esto.»; JSON `review.fix`, `review.noFix`), qué hacer con ellos y, cuando el circuito quedó armado, la
línea `Revisado`: lo que la revisión de peligros cubrió en este circuito y lo que no
([simulacion.md](simulacion.md#el-arreglo); JSON `review.checked`):

```text
Tal como está conectado, esto dañaría:
  ⚠ aviso: Por U1.D10 pasan 88,3 mA, más que su máximo de 40 mA: el pin se puede dañar, con D10 en alto.
Para arreglarlo: una resistencia de 200 Ω en serie con BZ1 deja el pin D10 de U1 en 19,4 mA (máximo 40 mA).
Déjalo así si mostrar la falla es la idea. Díselo al usuario antes de cambiar nada.
Revisado: en reposo, 3 salidas del programa. No revisado: picos al conmutar, combinaciones de salidas del programa.
```

Cuando el circuito quedó armado (`DONE` o `WARNINGS`, un circuito nuevo o `layout` otra vez sobre
uno), la respuesta dice además lo que necesita una respuesta al usuario, para que baste una llamada y
cada número y opción que repita un asistente salga del kit (`src/layout-answer.js`). Después de las
líneas de la revisión y antes de las de la página y `STATUS:`:

```text
Resuelto: R1 = 470 Ω (E24) para D1 a 15 mA: 15,2 mA simulados, 2 % por encima (valores vecinos: 430 Ω 16,6 mA · 510 Ω 14,1 mA)
Para revisar: D1 queda al 107 % de su nominal de 20 mA con R1 = 330 Ω; con R1 = 360 Ω daría 19,7 mA.
Lecturas (en reposo, un modelo): fuente 9 V · D1 20,6 mA, brillo 103 % del de 20 mA
Programa U1 (sketch de Arduino):
  // Blink: D13 on for half a second, off for half a second.
  …
Se puede cambiar (layout con la receta y values): R1 = 330 (resistencia limitadora) · D1 = green · V1 = 9 V [1,5…15] · D1 current (una meta: {"D1":{"current":"15mA"}})
```

- **Resuelto** (`solved: [{ id, goal, target, values, result, error, hazard, reachable, neighbours, kept?, when? }]`):
  solo cuando la llamada dio una meta de la receta ([recetas.md](recetas.md#metas-un-resultado-en-lugar-de-un-valor)):
  los valores estándar elegidos, el resultado que da el simulador con ellos, a qué distancia de la
  meta y de qué lado, los valores vecinos con sus resultados, `fuera de alcance` cuando ningún valor
  estándar del rango llega. Las dos líneas de arriba nunca salen juntas: la primera es de una
  llamada, la segunda de otra.
- **Para revisar** (`advice: [{ id, goal, value, rated, knob, suggest }]`): solo sin meta en la llamada, para un
  circuito de receta con `STATUS: DONE` y sus lecturas a la vista, cuyo componente con meta trabaja
  por encima de su valor nominal: cuánto, y el valor estándar que lo dejaría lo más cerca del nominal
  sin pasarlo. Solo información: no se cambia nada.
- **Difícil de ver** (`review.hidden: [{ part, visible, by }]`): un componente (no un puente) que se ve
  menos del 50 % en todas las vistas que dejó layout, una línea por componente con lo que se ve en su
  mejor vista y lo que lo tapa. Solo información: no cambia el estado (las reglas propias de la
  revisión siguen bloqueando un componente tapado en todas las vistas de una lección).
- **Lecturas** (`readings: { sources: [{ id, kind, voltage, current }], parts: [{ id, kind, current,
  brightness? }] }`): el punto de operación en DC del simulador, el que imprime `simulate`. Primero
  las fuentes (una fuente de banco, una batería por su id, el USB de una tarjeta; cada una una vez), luego los componentes cuyo
  trabajo es ser accionados: los LEDs (corriente y brillo), luego zumbadores, motores, bobinas de
  relé y láseres. A lo sumo cuatro en el texto, y después cuántos más lista `simulate`. Se omiten
  cuando el circuito no tiene fuente, el punto en DC no se puede resolver, una tarjeta corre un
  programa (el programa decide qué se enciende; un punto en reposo en el tiempo cero engañaría), una
  fuente es un generador (lo que importa es la señal, no su valor en reposo) o un temporizador está
  armado como astable (nunca reposa: su TRIG y su THR comparten red con un condensador, y su DIS o su
  OUT está en esa red o a una resistencia de ella, como en la receta `555-astable`; un temporizador
  armado como monoestable o como detector conserva sus lecturas), y cuando la página oculta
  los resultados (`page.simulation` o `page.results` en false: un valor que el aprendiz debe
  predecir primero).
- **Programa** (`programs: [{ part, text, truncated, file?, omitted? }]`): el sketch de cada tarjeta
  tal como está guardado (el texto, o el archivo `.ino` en la carpeta del circuito, junto a `circuit.json`, leído solo dentro de su
  carpeta), cada línea con dos espacios de sangría. Pasadas 80 líneas o 4 000 caracteres, las
  primeras 40 líneas y una línea que dice cuántas se dejaron fuera y dónde está el texto completo.
  Todo salto de línea que pueda ver un lector (`\r`, `\u2028` y parecidos) termina ahí también una
  línea, así que ninguna línea de un sketch puede pasar por la línea `STATUS:`.
- **Se puede cambiar** (`changeable: [{ id, field, value, role?, min?, max?, choices? }]`): para un
  circuito hecho con una receta, lo que la receta acepta, con el valor que tiene ahora el circuito,
  su papel y sus opciones (`[a | b]`) o su rango (`[min…max]`); un programa es `(sketch)`, nunca su
  texto. Los mismos límites que imprime `catalog <receta>`. Sus metas van al final (`{ id, goal, set, example }`), cada una con
  los `values` que la piden.

**Un ensayo** (`--dry-run`; en la herramienta MCP `dry_run: true`, la palabra que usa `apply_ops`):
todo lo anterior, sobre el circuito como quedaría después de la llamada (un objetivo nuevo, o uno que
ya existe montado otra vez), con la misma respuesta y el mismo `STATUS`, sin escribir nada: ni archivo
del circuito, ni historial, ni página, ni revisión, ni carpeta de salidas; en un anfitrión MCP con el
visor no se muestra tablero (como `try_ops`). Su última línea antes de `STATUS:` lo dice: `Ensayo: no
se guardó nada.` (`Trial: nothing was saved.`); la línea de la página no va. Así se ensaya una idea que
el kit no calculó (un arreglo propio de un asistente) antes de que llegue al circuito. Un ensayo que
termina `CHANGES` dice lo que es en su línea `STATUS` (`tal como se ensayó, el circuito quedaría con
… puntos marcados con ✖ arriba (no se creó nada)`), no que se creó un circuito. `check_only` /
`--check` sigue revisando solo la especificación.

`status` es el veredicto único de toda la respuesta, y el texto termina con él en su propia línea:
quien lea solo la última línea (sobre todo un modelo pequeño) sabe qué hacer.

| `STATUS:` | Significa | Sigue |
|---|---|---|
| `DONE` | están todas las redes, nada quedó sin ubicar y la revisión aprueba | reportar |
| `WARNINGS` | armado y con las redes bien, pero cada línea ⚠ de arriba hay que decírsela al usuario antes de decir que funciona: un componente que se dañaría tal como está conectado (un peligro), o algo que el kit no puede confirmar que funcione (una duda, bajo «El kit no puede confirmar que esto funcione»: un componente sin simular, un programa que no corre, un relé que puede no cerrar, un pulsador entre patas unidas, un aviso de la simulación; [simulacion.md](simulacion.md#lo-que-no-pudo-saber-dudas)); la revisión es aprobada con avisos | decirle primero cada una al usuario, en palabras simples; dejar el circuito como lo pidió salvo que quiera un cambio; para un peligro ofrecer el arreglo del kit (`Para arreglarlo`), o si no hay, ensayar antes una idea con `--dry-run` |
| `CHANGES` | se creó, pero una red, una ubicación o la revisión dejaron algo (✖); en un ensayo no se creó nada | arreglar solo eso con `suggest` y `apply_ops`, luego `review`; tras un ensayo, probar otra idea o aplicar esta |
| `FIX_SPEC` | no se creó nada: la especificación tiene errores | arreglar cada ✖ y volver a llamar |
| `SPEC_OK` | `check_only`: la especificación es coherente | volver a llamar sin él |

Antes del 2026-10-20 el texto terminaba con el veredicto de la revisión, que podía decir APROBADO
con una red sin conectar. La consola sale con 0 con `DONE` y `WARNINGS` (1 con `FIX_SPEC`, 2 con `CHANGES`).

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
| `TRIAL_TRIES` | 2 | intentos del ciclo de reintentos que recibe cada prueba antes de `CHANGES` («Lo que prueba el montaje antes de CHANGES»); las pruebas que sirvieron tomaron uno o dos |
| `SEEN_SHARE` | 75 % | un lugar que deja a un componente por debajo de esta parte en su mejor vista se usa solo si ningún otro se libra (`src/layout-sight.js`; la revisión bloquea por debajo de 70 %) |
| `MEMO_STATES` | 1500 | estados que guarda la memoria de un montaje |
| `BUDGET_SECONDS`, `LIMITS.layoutSeconds` | 60 s, 300 s | el límite de tiempo de la búsqueda por defecto, y como mucho |
| `SECONDS_PER_PART` | 0,12 s | un intento por componente sobre la protoboard, para la nota de que un spec pasa del límite |
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
  tiempo, estado) con su signo, los casos nuevos o ausentes y una línea de totales (cables, mm de
  cable, cruces, casos `DONE`, ms). El tiempo se compara desde el 2026-11-20 (antes y después de un
  cambio en el costo de la búsqueda); en una máquina compartida con otro trabajo es ruidoso, así que
  hay que comparar con la misma carga. Si se pasan archivos de especificación, van antes de las
  banderas; `--budget <segundos>` le da a cada montaje ese límite de tiempo.
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

1. **La visibilidad se mide lugar por lugar solo en circuitos grandes, y gana el primero por costo
   cuando ninguno se libra** (desde el 2026-11-20, «Lo que tapa»). Un mejor recurso (el menos tapado,
   sin irse a un lugar raro y lejano: probado, hacía terminar `uno-seven-segment` en `CHANGES`) haría
   pasar más primeros intentos.
2. **La página y la revisión de un circuito largo se llevan la mayor parte de su memoria.** Con
   doscientas resistencias (una protoboard de 400 columnas) la página sola llega a unos 0,6 GB (dos
   vistas interactivas, 17 MB de HTML), y el proceso de la consola a 1,04–1,11 GB: la geometría de
   los dibujos es basura que el motor recoge tarde. Se midió una trama más gruesa para marcos anchos
   y no ahorró nada.
3. **El ciclo prohíbe un lugar a la vez** y empieza de nuevo. Con varios ítems bloqueantes todavía
   puede gastar sus intentos en una sola zona; prohibir una región pequeña, o rehacer solo los
   componentes posteriores a la víctima, convergería más rápido.
4. **Una fuente, dos líneas.** Las capas salen de un solo componente, así que un circuito con dos
   entradas o con realimentación se ubica en el orden dado después de la primera rama (los órdenes que
   dan las redes se prueban solo si falla); los cursores
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
