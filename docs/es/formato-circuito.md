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
| `board` | no | `bb830` (por defecto) o `bb400`. |
| `view` | no | Vista por defecto: `front`, `back`, `front-left`, `back-right`. Manda `--view` si se da en la línea de comandos. |
| `clearance` | no | Separación mínima entre cuerpos, en mm. Los componentes más cercanos se informan como notas. Para montajes de clase, 3 o más. |
| `netLabels` | no | Texto junto a un riel, por id del riel. Un riel con etiqueta cuenta como conectado a una fuente. |
| `lang` | no | Idioma de todo lo que se genera a partir del circuito: etiquetas del dibujo, la página, mensajes (`en`, `es`). Un idioma pedido en la llamada (`--lang`, `lang` del MCP) gana. |
| `supplies` | no | Simulación: de dónde sale la energía, por ejemplo `[{ "id": "V1", "voltage": 5 }]` (entre T+ y T-). Ver [simulacion.md](simulacion.md). |
| `page` | no | La página para embeber: `results` (botón con los resultados de la simulación), `flow` (capa de corriente), `focus` (componentes en foco al abrirla). Ver [foco-y-corriente.md](foco-y-corriente.md). |
| `parts` | sí | Lista de componentes. |

## Agujeros

- Rejilla principal: letra de la fila y número de la columna, `a1` … `j63` (`a1` … `j30`
  en `bb400`).
- Rieles: `T-`, `T+` (arriba), `B+`, `B-` (abajo), seguidos de la columna con la que se
  alinea el agujero: `T+9`, `B-24`. En `bb830` hay agujeros de riel en las columnas 3–7,
  9–13, 15–19, 21–25, 27–31, 33–37, 39–43, 45–49, 51–55 y 57–61.
- Da igual mayúsculas o minúsculas.

Grupos conectados: las filas a–e de una columna; las filas f–j de una columna; cada riel
a lo largo de toda la protoboard.

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
| `power` | `"1/4"` | `"1/8"`, `"1/4"`, `"1/2"`, `"1"`: tamaño del cuerpo |

Patas `1`, `2`. Las bandas se leen desde la pata 1 (la banda de tolerancia queda junto a
la pata 2).

### capacitor

| Campo | Por defecto | |
|---|---|---|
| `value` | — | `"100n"`, `"10u"`, `"470µF"` |
| `kind` | electrolítico desde 1 µF | `ceramic` (cerámico) o `electrolytic` (electrolítico) |
| `voltage` | `25` | voltaje (tensión) nominal del electrolítico, en V; junto con el valor define el tamaño |
| `diameter`, `height` | según la tabla | mm, para igualar una pieza real |

Patas del cerámico: `1`, `2` (lleva impreso el código de tres cifras). Del electrolítico:
`+`, `-`; la franja mira hacia `-`.

### led

`color`: `red` (rojo, por defecto), `green`, `yellow`, `blue`, `white`, `orange`. `size`:
`5` (por defecto) o `3`. Patas `anode` (ánodo), `cathode` (cátodo).

### diode (diodo)

`part`: `1N4007` (por defecto), `1N4148`, `1N5819`. Patas `A`, `K`; la banda marca `K`.

### mosfet, bjt (transistor bipolar)

`part` define el encapsulado y los nombres de las patas, en el orden del encapsulado
(pata 1, 2, 3):

| part | tipo | encapsulado | patas |
|---|---|---|---|
| IRLZ44N, IRF520, IRF9540 | mosfet | TO-220 | G, D, S |
| 2N7000 | mosfet | TO-92 | S, G, D |
| 2N2222A, 2N3904, 2N3906 | bjt | TO-92 | E, B, C |
| BC547, BC557 | bjt | TO-92 | C, B, E |
| TIP120 | bjt | TO-220 | B, C, E |

La pata 1 queda a la izquierda cuando miras la cara impresa con las patas hacia abajo;
si pones los agujeros de izquierda a derecha vistos desde el frente, la cara impresa mira
al frente.

Si el componente no está en la tabla: indica `package` (`TO-220`, `TO-92`) y `pinNames`.

### potentiometer (potenciómetro)

`value` (resistencia de extremo a extremo, por defecto `"10k"`), `position` (cursor, 0…1, por
defecto 0,5: la marca blanca de la perilla lo muestra). Patas `1`, `W` (cursor), `3`, en tres
agujeros vecinos en línea; la pata 1 a la izquierda vista desde la perilla.

### button (pulsador)

Pulsador táctil de 6 × 6 mm. Patas `1`, `2`, `3`, `4`: la 1 y la 2 están siempre unidas por
dentro, igual que la 3 y la 4; al presionar se unen los dos pares. Va **a caballo del canal
central**: la 1 y la 2 en la misma columna, una a cada lado (por ejemplo, `e10` y `f10`), y la 3
y la 4 dos columnas más allá (`e12`, `f12`). Girado 90° (la 1 y la 3 en la misma tira) queda
siempre cerrado: el verificador avisa `SWITCH_BYPASSED`. `color` da el color del botón;
`pressed` es para el simulador.

### ic (circuito integrado)

Chips en encapsulado DIP, de la tabla de referencias: NE555, LM358, 74HC595, CD4017. Se
colocan con **`pin1`** en vez de listar todos los agujeros:

```json
{ "id": "U1", "type": "ic", "part": "NE555", "pin1": "f28" }
```

Con la pata 1 en la fila delantera junto al canal (`f`) se lee desde el frente, con la muesca
a la izquierda; con la pata 1 en la fila de atrás (`e`) el chip queda girado. Los nombres de
las patas salen de la referencia (`GND`, `TRIG`, `OUT`… en el 555), así se puede revisar con
qué se conecta cada una.

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
