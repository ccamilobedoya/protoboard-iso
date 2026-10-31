# Formato del archivo de circuito (versión 1)

*[English](../en/circuit-format.md)*

Las claves van en inglés para que el formato sea el mismo en todos los idiomas.

```json
{
  "version": 1,
  "title": { "en": "LED with a resistor", "es": "LED con resistencia" },
  "board": "bb830",
  "view": "front",
  "netLabels": { "T+": "+5 V", "T-": "GND" },
  "parts": [ … ]
}
```

| Campo | ¿Obligatorio? | Qué es |
|---|---|---|
| `version` | no | Versión del formato, `1`. |
| `revision` | no | Lo ponen `apply` y `undo`; no se edita a mano. |
| `title` | no | Un texto, o uno por idioma. Va en el `<title>` del SVG. |
| `board` | no | `bb830` (por defecto) o `bb400`; o `auto`, una protoboard elástica: la sección de una bb400 (filas a–j, cuatro rieles y el canal del medio) y tantas columnas como use el circuito, de seis en seis; sus agujeros no se mueven al crecer, así un circuito pasa de `bb400` a `auto` con `{"op":"circuit","board":"auto"}`. No es una protoboard real: en el banco se unen varias. `double` (elástica) y `bb830x2`: dos protoboards lado a lado para una placa de desarrollo ancha, ver [Dos protoboards lado a lado](#dos-protoboards-lado-a-lado). |
| `view` | no | Vista por defecto: `front`, `back`, `front-left`, `back-right`. Manda `--view` si se da en la línea de comandos. |
| `clearance` | no | Separación mínima entre cuerpos, en mm. Los componentes más cercanos se informan como notas. Para montajes de clase, 3 o más. |
| `netLabels` | no | Texto junto a un riel, por id del riel. Un riel con etiqueta cuenta como conectado a una fuente. |
| `lang` | no | Idioma de todo lo que se genera a partir del circuito: etiquetas del dibujo, la página, mensajes (`en`, `es`). Un idioma pedido en la llamada (`--lang`, `lang` del MCP) gana. |
| `supplies` | no | Simulación: de dónde sale la energía, por ejemplo `[{ "id": "V1", "voltage": 5 }]` (entre T+ y T-). Una [batería](#battery-batería) también es una fuente. Ver [simulacion.md](simulacion.md). |
| `page` | no | La página para embeber. Con fuente, la simulación corre por defecto; `simulation: false` la apaga toda (un valor por predecir), `results: false` solo los valores del componente tocado (y los LED encendidos), `flow: false` solo el botón Corriente; `focus` (componentes en foco al abrirla), `start` (`dc` o `zero`: cómo arranca la simulación en vivo), `theme` (`auto`, por defecto, sigue al sistema; `light` o `dark` lo fija; `?theme=` en el enlace gana), `controls` (un panel de deslizadores y botones: componente o fuente, campo, rango y etiqueta opcionales), `tour` (una línea de tiempo: el nombre de un archivo JSON junto al circuito, leído solo desde su carpeta, o la línea de tiempo misma; *Ver cómo funciona* en el menú ⋯ la reproduce, ver [escena-y-video.md](escena-y-video.md)). Ver [foco-y-corriente.md](foco-y-corriente.md). |
| `parts` | sí | Lista de componentes. |

## Agujeros

- Rejilla principal: letra de la fila y número de la columna, `a1` … `j63` (`a1` … `j30`
  en `bb400`; también las filas k–t en una protoboard doble, más abajo).
- Rieles: `T-`, `T+` (arriba: el par de atrás, junto a la fila j), `B-`, `B+` (abajo: el par
  de adelante, junto a la fila a), seguidos de la columna con la que se alinea el agujero:
  `T+9`, `B-24`. En `bb830` hay agujeros de riel en las columnas 3–7,
  9–13, 15–19, 21–25, 27–31, 33–37, 39–43, 45–49, 51–55 y 57–61.
- Da igual mayúsculas o minúsculas.

Grupos conectados: las filas a–e de una columna; las filas f–j de una columna; cada riel
a lo largo de toda la protoboard.

Disposición de `bb830`, del fondo del dibujo hacia el frente: `− +` (rieles T), filas `j…f`, el
canal, filas `e…a`, `− +` (rieles B), con la columna 1 a la izquierda. De pie, con la columna 1
arriba, se lee `+ − a…j + −` de izquierda a derecha, como la protoboard de quien mantiene el kit.

### Dos protoboards lado a lado

Un ESP32 DevKit tiene de 0,9" a 1,1" entre sus filas de pines sobre un circuito impreso de unos 11
agujeros de ancho: en una sola protoboard tapa todos los agujeros libres de las tiras de una de
ellas. En el banco se unen dos protoboards por el lado largo, sin las tiras de rieles que quedan
entre ellas (casi todas traen los rieles desmontables), y el DevKit pasa por encima de la unión. La
protoboard `double` (elástica, como `auto`) y `bb830x2` (dos `bb830`) modelan eso. Del fondo del
dibujo hacia el frente:

```text
U- U+  t s r q p | o n m l k  · unión ·  j i h g f | e d c b a  B- B+
```

- La protoboard de adelante es una protoboard normal sin sus rieles de atrás: filas a–j y rieles
  `B-`, `B+` como siempre.
- Las filas de la de atrás siguen el alfabeto alejándose del frente: sus filas a…j son k…t (tiras
  `12:k-o` y `12:p-t`). Sus rieles, detrás de la fila t, son `U-` (el de afuera) y `U+`. No hay
  rieles `T`: son los que se quitan. Una fuente sin `positive`/`negative` va a `U+`/`U-`.
- Entre las filas j y k queda un paso vacío (`junction` en la especificación de la protoboard,
  `doubleBoard` en `src/board/board.js`): supone que cada bloque principal termina un paso después
  de su fila de afuera, así los dos bloques juntos conservan una sola retícula de 0,1". **Mide tus
  protoboards**: si la unión es distinta, los agujeros de la de atrás quedan corridos en esa medida.
- Nada pasa por encima de la unión salvo una placa de desarrollo: un DIP o un pulsador van sobre el
  canal de una de las dos. Un DevKit con la pata 1 en la fila j tiene su otra fila en la p
  (`rowSpacing` 9): cada fila de pines conserva filas libres en la tira de su propia protoboard
  (h…f y r…t). `layout` pasa solo un circuito ahí cuando una protoboard no alcanza (ver
  [montaje-automatico.md](montaje-automatico.md)).
- Los números de columna se imprimen a lo largo de los dos bordes de afuera; en la unión los de las
  dos protoboards se encimarían.

## Componentes

Cada componente tiene `id` (único), `type` y `pins` (o `pin1` en los chips DIP). `pins` es una lista en el orden de
las patas o un objeto por nombre de pata:

```json
{ "id": "D1", "type": "led", "pins": ["e9", "e10"] }
{ "id": "D1", "type": "led", "pins": { "anode": "e9", "cathode": "e10" } }
```

Cualquier componente puede llevar además `description` (cómo se usa en este circuito, se ve en su
ficha en la página: un texto plano, que se muestra tal cual en cualquier idioma, o
`{ "en": …, "es": … }`; se omite cuando quien aprende debe descubrirlo; ver [foco-y-corriente.md](foco-y-corriente.md))
y `model` (valores de simulación que reemplazan los típicos; ver [simulacion.md](simulacion.md)).

### resistor (resistencia)

| Campo | Por defecto | |
|---|---|---|
| `value` | — | `"330"`, `"4k7"`, `"4.7k"`, `"1M"`, `"2R2"`, o un número en ohmios |
| `tolerance` | `"5%"` | define la última banda; con 2 % o menos pasa a 5 bandas y cuerpo azul |
| `bands` | según la tolerancia | `4` o `5` |
| `power` | `"1/4"` | `"1/8"`, `"1/4"`, `"1/2"`, `"1"`: tamaño del cuerpo; `"3"`, `"5"`, `"10"`: resistencia de cemento |

Patas `1`, `2`. Las bandas se leen desde la pata 1 (la banda de tolerancia queda junto a
la pata 2).

Desde 3 W es una **resistencia de cemento**: una caja blanca de cerámica (5 W: 22 × 9,5 × 9 mm;
10 W: 48 mm de largo) acostada sobre la protoboard, con la potencia, el valor y la letra de
tolerancia impresos encima en lugar de bandas (`5W 10ΩJ`; J = 5 %). El simulador compara su
potencia con la nominal.

### capacitor

| Campo | Por defecto | |
|---|---|---|
| `value` | — | `"100n"`, `"10u"`, `"470µF"` |
| `kind` | electrolítico desde 1 µF | `ceramic` (cerámico) o `electrolytic` (electrolítico) |
| `voltage` | `25` | voltaje (tensión) nominal del electrolítico, en V; junto con el valor define el tamaño |
| `diameter`, `height` | según la tabla | mm, para igualar una pieza real |

Patas del cerámico: `1`, `2` (lleva impreso el código de tres cifras). Del electrolítico:
`+`, `-`; la franja mira hacia `-` y el valor va impreso a lo largo de la manga (`100µF 25V`),
repetido alrededor como en las piezas reales, así que cada vista muestra una copia.

### led

`color`: `red` (rojo, por defecto), `green`, `yellow`, `blue`, `white`, `orange`. `size`:
`5` (por defecto) o `3`. Patas `anode` (ánodo), `cathode` (cátodo). La pestaña es plana del
lado del cátodo y la pata del ánodo es la más larga: lo que le sobra se ve como un quiebre
pequeño sobre la protoboard.

### diode (diodo)

`part` (patas `A`, `K`; la banda marca `K`):

| part | clase | cuerpo |
|---|---|---|
| 1N4007 (por defecto), 1N4001…1N4006 | rectificador, 1 A | DO-41 |
| 1N5399 | rectificador, 1,5 A | DO-15 |
| 1N5408 | rectificador, 3 A | DO-201AD |
| 1N4148 | de señal | vidrio |
| 1N5819, 1N5822 | Schottky, 1 A / 3 A | DO-41 / DO-201AD |
| FR107, FR207 | recuperación rápida, 1 A / 2 A | DO-41 / DO-15 |

### zener (diodo Zener)

Diodo Zener de 1 W, cuerpo de vidrio naranja. `value`: el voltaje (tensión) Zener, `"5V1"`
(como viene impreso), `"5.1"` o `5.1`; o `part`: `1N4728A` (3,3 V) … `1N4751A` (30 V). Patas `A`,
`K`; la banda marca `K`. Se usa en inversa: `K` hacia el lado positivo, con una resistencia en
serie.

### bridge (puente rectificador)

Puente rectificador en encapsulado KBP: cuatro diodos en un cuerpo plano, de pie sobre cuatro
patas en fila, `+ ~ ~ −`. `part`: `KBP307` (por defecto; 3 A) o cualquier KBP2xx (2 A) / KBP3xx
(3 A), p. ej. `KBP206`, `KBP210`. Patas `+`, `AC1`, `AC2`, `-`. Sus patas están a 3,8 mm, así que
en la protoboard van en una misma fila, vecinas a uno o dos agujeros (si no, `BRIDGE_SHAPE`),
p. ej. `e10, e11, e13, e14`. La esquina biselada y el `+` impreso marcan la pata `+`. El
simulador usa cuatro diodos (cerca de 1,0 V cada uno a la corriente nominal).

### module (placa de desarrollo)

Una placa de desarrollo. Todavía no se simula: sus pines solo unen los grupos de sus agujeros.

| part | dónde | colocación |
|---|---|---|
| `ESP32-DEVKIT` (también `ESP32`) | a caballo del canal, 30 pines | `pin1` (EN) y `rowSpacing` |
| `ESP32-C3-SUPERMINI` (también `ESP32-C3`) | a caballo del canal, 16 pines | `pin1` (5V) y `rowSpacing` |
| `UNO` (también `ARDUINO-UNO`) | al lado de la protoboard | `pins` solo con los pines que se usan |
| `DESPI-C02` (también `DESPI`) | al lado de la protoboard | `pins` solo con los pines que se usan; `rese`, `panel` |

**Las placas a caballo del canal** se colocan como un chip DIP: la pata 1 y las demás siguen
por esa fila, y vuelven por la otra, a `rowSpacing` agujeros al otro lado del canal (DevKit 9, o
sea 0,9"; C3 SuperMini 6). Las placas cambian (hay DevKit de 0,9", 1,0" y 1,1"): mide la tuya y
ajusta `rowSpacing`. Con la pata 1 en la mitad de adelante, la placa se lee de frente. Un `pin1`
equivocado dice en qué filas puede ir. La placa tapa los agujeros que quedan debajo; una DevKit
deja más o menos una fila libre adelante.

```json
{ "id": "U1", "type": "module", "part": "ESP32-DEVKIT", "pin1": "c5" }
```

Los nombres de los pines son los impresos en la placa: DevKit `EN`, `VP`, `VN`, `D34` … `D13`,
`GND`, `VIN` por un lado, `D23`, `D22`, `TX0`, `RX0` … `D15`, `GND2`, `3V3` por el otro; C3
SuperMini `5V`, `GND`, `3V3`, `GPIO4` … `GPIO0` y `GPIO5` … `GPIO21`.

**El UNO** va al lado de la protoboard, detrás (`"side": "back"`, por defecto) o adelante
(`"front"`), con el USB a la izquierda; `offset` lo corre a lo largo (mm). Se listan solo los
pines que se usan: cada uno lleva un cable Dupont de su conector al agujero, de un color por
defecto (5V y VIN rojo, 3V3 naranja, tierra negro, señales por turno) o el que diga `wires`.

```json
{ "id": "A1", "type": "module", "part": "UNO", "pins": { "D13": "j20", "GND": "T-27" }, "wires": { "D13": "yellow" } }
```

Pines del UNO: `D0` … `D13`, `A0` … `A5`, `SCL`, `SDA`, `AREF`, `IOREF`, `RESET`, `3V3`, `5V`, `VIN`
y las tres tierras `GND`, `GND2` (conector de alimentación) y `GND3` (junto a D13).

**En la simulación** (ESP32 DevKit, ESP32-C3 SuperMini, UNO; [microcontroladores.md](microcontroladores.md)):
`"io"` fija cada GPIO por su nombre impreso, su nombre GPIO o su número: `high`, `low`, `input`,
`input_pullup` o `input_pulldown` (los que no aparecen son entradas), y la placa con USB es una fuente
de 5 V con su regulador de 3,3 V (`"usb": false` para alimentarla desde el circuito). `"program"`
corre un programa: el nombre de un archivo `.ino` junto al circuito, o su texto (`setup()`, `loop()`,
`delay()` en tiempo simulado):

```json
{ "id": "U1", "type": "module", "part": "ESP32-DEVKIT", "pin1": "c5", "io": { "D13": "high", "D27": "input_pullup" } }
{ "id": "U1", "type": "module", "part": "ESP32-DEVKIT", "pin1": "c5", "program": "parpadeo.ino" }
```

**El adaptador e-paper DESPI-C02** de GooDisplay también va al lado de la protoboard, con sus 8
pines acodados hacia ella y un cable Dupont en cada pin que se usa (`pins`, `wires`, `side`,
`offset`, como el UNO). Pines: `BUSY`, `RES`, `D/C`, `CS`, `SCK`, `SDI`, `GND`, `3.3V`.
`"rese": "0.47"` o `"2.2"` (como viene de fábrica) dibuja el interruptor P3 en esa posición: 0,47
para controladores UltraChip como el UC8179 del GDEY075T7. Con `"panel": true` se dibuja el panel
GDEY075T7 de 7,5" con su cable plano en el conector P1. Su ficha se titula «Placa adaptadora».

```json
{ "id": "EP1", "type": "module", "part": "DESPI-C02", "rese": "0.47", "panel": true, "pins": { "BUSY": "j20", "SCK": "j16", "SDI": "j10", "GND": "j23", "3.3V": "j24" } }
```

En la página, la ficha de una placa lista los pines en uso, cada uno con una nota corta (pin de
arranque, solo entrada, ADC2 no con Wi-Fi, PWM, compartido con el USB…).

### mosfet, bjt (transistor bipolar)

`part` define el encapsulado y los nombres de las patas, en el orden del encapsulado
(pata 1, 2, 3):

| part | tipo | encapsulado | patas |
|---|---|---|---|
| IRLZ44N, IRF520, IRF9540 | mosfet | TO-220 | G, D, S |
| 2N7000 | mosfet | TO-92 | S, G, D |
| 2N2222A, 2N2907A, 2N3904, 2N3906, 2N5551, 2N5401 | bjt | TO-92 | E, B, C |
| S8050, S8550, S9012, S9013, S9014, S9015, S9018 | bjt | TO-92 | E, B, C |
| BC547, BC548, BC549, BC550, BC557, BC558, BC337, BC327 | bjt | TO-92 | C, B, E |
| BC517 (Darlington) | bjt | TO-92 | C, B, E |
| C1815 (2SC1815), A1015 (2SA1015) | bjt | TO-92 | E, C, B |
| TIP120 | bjt | TO-220 | B, C, E |

La pata 1 queda a la izquierda cuando miras la cara impresa con las patas hacia abajo;
si pones los agujeros de izquierda a derecha vistos desde el frente, la cara impresa mira
al frente.

Si el componente no está en la tabla: indica `package` (`TO-220`, `TO-92`) y `pinNames`.

### potentiometer (potenciómetro)

`value` (resistencia de extremo a extremo, por defecto `"10k"`), `position` (cursor, 0…1, por
defecto 0,5: la marca blanca de la perilla lo muestra). Patas `1`, `W` (cursor), `3`, en tres
agujeros vecinos en línea; la pata 1 a la izquierda vista desde la perilla.

`style`: `knob` (perilla, por defecto) o `trimmer`, un multivuelta 3296W azul con su tornillo de
ajuste arriba y el valor impreso como código (`103` = 10 kΩ).

### button (pulsador)

Pulsador táctil de 6 × 6 mm. Patas `1`, `2`, `3`, `4`: la 1 y la 2 están siempre unidas por
dentro, igual que la 3 y la 4; al presionar se unen los dos pares. Va **a caballo del canal
central**: la 1 y la 2 en la misma columna, una a cada lado (por ejemplo, `e10` y `f10`), y la 3
y la 4 dos columnas más allá (`e12`, `f12`). Girado 90° (la 1 y la 3 en la misma tira) queda
siempre cerrado: el verificador avisa `SWITCH_BYPASSED`. `color` da el color del botón;
`pressed` es para el simulador.

### switch (interruptor)

Un interruptor que se queda en la posición en que se deja y no entra en la protoboard: va sobre
la mesa a su lado (`side`: `"front"`, por defecto, o `"back"`; `offset` en mm a lo largo del
borde), con los contactos hacia la protoboard. Como en el UNO, `pins` lista solo las patas en uso,
cada una con su cable hasta el agujero, terminado en un pin Dupont macho; `wires` elige los
colores. `on` (por defecto `false`) es su posición.

- `style: "rocker"` (por defecto): basculante KCD1, SPST, patas `1` y `2`; sus terminales faston
  llevan pinzas caimán. Encendido (I), 1–2 queda cerrado (50 mΩ); apagado (O), abierto. Hasta 3 A
  en la simulación (el fabricante no da el dato en continua).
- `style: "latching"`: pulsador de enclavamiento de 7 × 7 mm, DPDT, patas `NC1`, `C1`, `NO1` y
  `NC2`, `C2`, `NO2` (cada fila un conmutador, con un cable soldado a cada pata en uso). Suelto, C
  se une a NC; hundido (`on`), C se une a NO. Unos 100 mA.

```json
{ "id": "S1", "type": "switch", "style": "rocker", "on": true, "pins": { "1": "a3", "2": "B+5" } }
```

En la página en vivo su ficha trae *Encender* / *Apagar*; `page.controls` puede ponerlo en el
panel (`{ "part": "S1", "field": "on" }`). Ejemplo: `examples/switches.json`.

### ic (circuito integrado)

Chips en encapsulado DIP, de la tabla de referencias: NE555, LM358, LM324, LM393, UA741 (o
LM741), NE5532, LM386, 74HC595, CD4017, ULN2003, ULN2803, PC817 (4 patas). Se colocan con
**`pin1`** en vez de listar todos los agujeros:

```json
{ "id": "U1", "type": "ic", "part": "NE555", "pin1": "e28" }
```

Con la pata 1 en la fila delantera junto al canal (`e`) se lee desde el frente, con la muesca
a la izquierda; con la pata 1 en la fila de atrás (`f`) el chip queda girado. Los nombres de
las patas salen de la referencia (`GND`, `TRIG`, `OUT`… en el 555), así se puede revisar con
qué se conecta cada una.

### regulator (regulador de voltaje)

Regulador lineal en TO-220. `part`: `7805`, `7806`, `7808`, `7809`, `7810`, `7812`, `7815`,
`7818`, `7824` (patas `IN`, `GND`, `OUT`) o `LM317` (patas `ADJ`, `OUT`, `IN`; salida
1,25 V · (1 + R2/R1)). Sirven también otros nombres de la misma pieza: `LM7805`, `L7805CV`,
`LM317T`.

`AMS1117-3.3` (o `AMS1117-5.0`; también `AMS1117-3V3`) es el módulo regulador pequeño, de pie
sobre tres pines en ángulo en fila, patas `IN`, `OUT`, `GND` (impresas VIN, OUT, GND). Su placa
queda encima de las dos filas siguientes, hacia donde mira su serigrafía (el frente, con los
agujeros en columnas crecientes): usa las filas del otro extremo de la tira. `led`: la resistencia
de su LED de encendido, `"1k"` (por defecto), `"200"` (algunas placas del mismo panel) o
`"none"`. La corriente del LED es parte de lo que consume el módulo (`quiescent`), no de la
corriente de salida.

### inductor

Inductor axial con anillos de colores, como una resistencia gorda y verde; los anillos dan el
valor en µH. `value`: `"100u"` (100 µH), `"10m"`. `tolerance`: por defecto `"10%"`. `dcr`
(resistencia del alambre, Ω) y `current` (corriente nominal, A): si no se dan, los típicos para
su tamaño. Patas `1`, `2`.

### thermistor (termistor NTC)

Termistor NTC (gota de epoxi MF52). `value`: resistencia a 25 °C (por defecto `"10k"`); `beta`:
constante B en kelvin (por defecto 3950); `temperature`: los °C que usa la simulación (por
defecto 25). Patas `1`, `2`, a uno o dos agujeros.

### ldr (fotorresistencia)

Resistencia que depende de la luz. `part`: `GL5528` (por defecto), `GL5516`, `GL5537`,
`GL5539`, `GL5549`; `light`: iluminación en lux para la simulación (por defecto 100, una
habitación iluminada). Patas `1`, `2`, a entre uno y tres agujeros.

### buzzer (zumbador)

Zumbador pasivo magnético de 12 mm. Patas `1`, `2`, a dos o tres agujeros. Para el simulador es
su bobina (`resistance`, por defecto 16 Ω); avisa cuando le pasa corriente continua, porque un
zumbador pasivo solo suena con una señal que cambie.

### header (pines de cabecera)

Una fila de pines macho, para mostrar dónde se enchufa un módulo o un cable Dupont. Se coloca
con `pin1` y `count`; los demás pines siguen hacia las columnas mayores:

```json
{ "id": "J1", "type": "header", "count": 4, "pin1": "h50" }
```

Patas `1` … `n`; cada una es solo su agujero.

### battery (batería)

Una batería sobre la mesa, al lado de la protoboard, con un cable rojo y uno negro hasta dos
agujeros: patas `+` y `-`. Además es una fuente para el simulador (un circuito con batería no
necesita `supplies`).

| Campo | Por defecto | |
|---|---|---|
| `format` | `AA` | `AA`, `AAA` (pilas en un portapilas abierto), `18650` (celdas de litio en portapilas), `9V` (con su broche), `pouch` (LiPo plana, 103450) |
| `chemistry` | según el formato | `alkaline` (AA, AAA, 9V), `nimh` (AA, AAA), `li-ion` o `lifepo4` (18650), `lipo` (pouch) |
| `cells` | `1` | celdas (o baterías de 9 V) en serie: los voltajes se suman, 4 × AA = 6 V |
| `charge` | — | 0 (vacía) … 1 (llena). Sin él, la batería está en su voltaje nominal; con él, el voltaje en vacío sigue la curva de descarga de su química (una celda de litio llena, 4,2 V) |
| `voltage` | — | un voltaje medido en vacío: gana sobre los dos anteriores |
| `internalResistance`, `capacity` | según el formato | Ω de todo el paquete; `"2000 mAh"` |
| `switch` | — | `on` u `off`: un portapilas con interruptor (apagado: sin corriente) |
| `side`, `offset` | el lado más cercano | dónde queda: `left`, `right`, `back`, `front`; mm a lo largo de ese borde |

```json
{ "id": "BT1", "type": "battery", "format": "AA", "cells": 4, "switch": "on", "pins": { "+": "T+3", "-": "T-3" } }
{ "id": "BT2", "type": "battery", "format": "18650", "cells": 2, "charge": 0.8, "pins": { "+": "B+60", "-": "B-60" } }
```

Los números detrás de cada formato y química (curva de voltaje, resistencia interna,
capacidad, la corriente máxima para la que está hecha) están en `src/parts/batteries.js`.

### wire (cable de puente)

`color`: `red`, `black`, `blue` (por defecto), `green`, `yellow`, `orange`, `white`,
`violet`, `grey`, `brown`. `style`: `arc` (por defecto, cable flexible) o `flat` (cortado
a medida, pegado a la protoboard). `height`: altura del arco en mm.

## Observaciones

`check` y `render` informan observaciones con una gravedad:

- `error`: no se entendió el componente (tipo desconocido, valor ilegible, agujero que
  no existe) y no se dibuja; o dos patas comparten agujero.
- `warning` (aviso): se dibuja, pero algo está mal físicamente o es sospechoso (patas en
  corto, patas que no alcanzan, cuerpos que se chocan).
- `info` (nota): conviene saberlo (una pata cuya tira no toca nada más).
