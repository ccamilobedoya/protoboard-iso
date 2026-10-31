# Líneas de tiempo: cada paso y cada opción

*[English](../en/timeline.md)*

Una línea de tiempo es el guion de un video y del recorrido de una página (*Ver cómo funciona*): un
archivo JSON de pasos, cada uno en un tiempo, cada uno haciendo una cosa. Quien la escribe decide
todo lo que se dice y se muestra; el kit no escribe ningún texto propio en un subtítulo. Todas las
opciones de abajo son opcionales salvo las que dicen *obligatorio*: si se dejan fuera, el paso hace
lo que el kit hace por defecto, así que una línea de tiempo corta ya se ve bien y una larga puede
controlar cada movimiento.

Esta página es la referencia. El plan y las decisiones detrás están en
[escena-y-video.md](escena-y-video.md); el esquema es `schema/timeline.schema.json` (los editores
completan y revisan los campos con él). Líneas de tiempo de ejemplo: `examples/tours/`.

## El archivo

```json
{
  "$schema": "../../schema/timeline.schema.json",
  "circuit": "npn-switch",
  "format": "vertical",
  "theme": "stage",
  "steps": [
    { "at": 0, "do": "frame", "target": "board", "move": "cut" },
    { "at": 0, "do": "caption", "text": { "en": "A transistor as a switch", "es": "Un transistor como interruptor" } }
  ]
}
```

| Campo | Valores | Por defecto | Qué es |
|---|---|---|---|
| `circuit` | el nombre de un archivo de circuito (junto a la línea de tiempo o una carpeta arriba) o de una receta | ninguno | el circuito que cuenta (para `scripts/render-frames.js`) |
| `format` | `vertical` (1080 × 1920), `horizontal` (1920 × 1080) | `vertical` | el tamaño del video |
| `theme` | `stage`, `notebook`, `light`, `dark` | `stage` | el aspecto de la página en una grabación |
| `steps` | una lista de pasos, *obligatorio* | | lo que pasa |

Un circuito reproduce su línea de tiempo en su página cuando `page.tour` nombra el archivo (leído
junto al circuito, nunca fuera de su carpeta) o contiene la línea de tiempo misma.

## Pasos y tiempo

Cada paso tiene `at` (ms desde el comienzo, *obligatorio*) y `do` (la acción, *obligatorio*). Los
pasos con el mismo `at` arrancan juntos, en el orden escrito. Un `wait-until` detiene el reloj: los
pasos siguientes se corren lo que duró la espera.

Los textos (`text`, `line`, `label`, `title`, `note`) son planos (`"text": "Hola"`) o uno por idioma
(`"text": { "en": "Hello", "es": "Hola" }`); la página toma su idioma, si no el inglés, si no el
primero. A lo sumo 280 caracteres cada uno. Un texto siempre se muestra como texto, nunca se lee
como marcado.

### Movimientos: cuánto dura y por qué curva

Los pasos que mueven algo llevan un `move`, una de siete palabras, para que el ritmo sea el mismo
en todos los videos:

| `move` | Duración (rango de `ms`) | Curva | Para |
|---|---|---|---|
| `cut` (corte) | 0 | ninguna | un cambio de plano o de estado |
| `arrival` (llegada) | 750 (600…900) | quint out | la cámara cae sobre una pieza |
| `travel` (viaje) | 1500 (1200…1800) | quart in-out | de un lugar a otro lejano |
| `push` (empuje) | 5000 (3000…8000) | cubic out | un acercamiento lento mientras habla el subtítulo |
| `hit` (golpe) | 150 (120…180) | quint out | aparece un valor, se hunde un botón |
| `breath` (respiro) | 800 (400…1200) | quieto | un descanso |
| `anticipation` (anticipación) | 250 hacia atrás, luego una llegada | retroceso, luego quint out | el movimiento clave de un video, una vez |

- `ms` cambia la duración. Fuera del rango del movimiento, `check` avisa (`TOUR_MOVE_MS`) y el paso
  igual se reproduce como está escrito.
- `curve` reemplaza la curva del movimiento por una propia, `[x1, y1, x2, y2]` como en CSS (x entre
  0 y 1; y puede pasarse, entre −3 y 4): `[0.34, 1.56, 0.64, 1]` se pasa un poco y vuelve. Un `cut`
  sigue siendo un corte.
- El ritmo, que `check` revisa como avisos: nunca dos `push` seguidos, y un respiro (400 ms) entre
  dos `hit`.

## Acciones

### `frame`: la cámara

La cámara solo se mueve cuando un paso la mueve (y cuando el recuadro de un `probe` necesita sitio,
abajo): sin `frame` se queda donde está. En una grabación, un destino con nombre se encuadra en la
parte de la pantalla que deja libre el subtítulo.

| Campo | Valores | Por defecto | |
|---|---|---|---|
| `target` | `board`, `parts`, `here`, el id de una pieza o una lista de ids, *obligatorio* | | `here` es el encuadre de ahora, para acercar o correr desde él; una lista encuadra todas sus piezas |
| `zoom` | 0,05…20 | 1 | más cerca (más de 1) o más lejos (menos de 1), alrededor del centro del destino |
| `pan` | `[x, y]`, cada uno −3…3 | ninguno | luego corre el encuadre en fracciones de su propio tamaño: `[0.2, 0]` un quinto a la derecha, `[0, -0.1]` un décimo hacia arriba |
| `move`, `ms`, `curve` | | `arrival` | cómo llega |

En una grabación, el encuadre de una pieza incluye su rótulo corto. Para seguir algo a mano: un
`frame` sobre `here` con un `pan`, paso a paso, o un `push` con un `zoom` pequeño.

```json
{ "at": 4800, "do": "frame", "target": "D1", "zoom": 1.25, "move": "push", "ms": 4000 },
{ "at": 9000, "do": "frame", "target": "here", "pan": [0.3, 0], "move": "travel" },
{ "at": 11000, "do": "frame", "target": ["R1", "D1"], "move": "arrival" }
```

### `focus`: lo que se explica

| Campo | Valores | Por defecto | |
|---|---|---|---|
| `parts` | una lista de ids, *obligatorio*; `[]` lo quita | | las piezas que pasan al frente: lo demás se oscurece bajo un velo, se ven las tiras bajo sus patas y se encienden las coordenadas impresas de sus agujeros |
| `move`, `ms`, `curve` | | `cut` | con un movimiento, el velo, las tiras y las coordenadas llegan con él, o se van (`[]`) |

En una grabación solo la pieza contada conserva un rótulo: la última encuadrada, en foco, insertada
o levantada.

### `caption`: lo que se dice

| Campo | Valores | Por defecto | |
|---|---|---|---|
| `text` | un texto, *obligatorio* salvo con `off` | | el subtítulo |
| `line` | un texto | ninguna | una segunda línea, más pequeña |
| `off` | `true` | | quita el subtítulo |
| `enter` | `rise`, `fade`, `cut` | `rise` | cómo llegan sus líneas: subiendo desde su base detrás de una máscara, apareciendo con un fundido o de una vez |
| `in` | 0…3000 ms | 400 | cuánto tarda cada línea |
| `stagger` | 0…1000 ms | 90 | entre una línea y la siguiente |
| `out` | 0…2000 ms | 200 | cuánto tarda en irse el subtítulo anterior (el nuevo llega después) |

### `value`: una lectura, grande

| Campo | Valores | Por defecto | |
|---|---|---|---|
| `part` | un id, *obligatorio* | | |
| `field` | `current`, `voltage`, `power`, `brightness`, *obligatorio* | | lo que se lee, en A, V, W o % |
| `label` | un texto | ninguna | junto al número |
| `count` | 0…5000 ms | 500 | cuenta hasta la lectura; 0 la muestra tal cual |
| `enter`, `in` | como los de un subtítulo | `rise`, 400 | cómo llega |

El número es el de la simulación (un modelo) y lo escribe el kit; la etiqueta es tuya. Un subtítulo
nuevo se lleva el valor.

### `set`: se mueve un control

| Campo | Valores | Por defecto | |
|---|---|---|---|
| `part`, `field`, `value` | un control de la pieza (`pressed`, `resistance`, `voltage`…) y su valor nuevo, *obligatorio* | | `check` nombra los controles que tiene una pieza |
| `move`, `ms`, `curve` | | `hit` | un número se mueve por la curva (en escala log donde el deslizador lo es), un botón cambia de una vez |

Un deslizador que se mueve solo entre dos valores (M10): dos pasos `set` con `travel`.

### `flow`: la capa de corriente

| Campo | Valores | Por defecto | |
|---|---|---|---|
| `on` | `true`, `false`, *obligatorio* | | |
| `ramp` | 0…10000 ms | 0 | los puntos arrancan desde quietos hasta su velocidad (M6) |

### `pulse`: un destello por el camino de la corriente (M7)

Con la capa de corriente encendida. Cada pieza por la que pasa la corriente se enciende por turno,
según su voltaje.

| Campo | Valores | Por defecto | |
|---|---|---|---|
| `through` | una lista de ids de piezas o de tiras | todo el camino | solo las piezas de esas piezas o tiras |
| `direction` | `forward`, `back` | `forward` | de + a −, como corre la corriente, o al revés |
| `color` | `pulse`, `accent`, `value`, `voltage`, `current` o `#rrggbb` | `pulse` | los nombres son los colores del tema |
| `width` | 0,05…1 | 0,25 | la fracción del recorrido que dura encendida cada pieza: menos es un destello más corto |
| `size` | 1…12 | 4,5 | su grosor, en unidades del dibujo |
| `move`, `ms`, `curve` | | `travel` | cuánto dura el recorrido (`curve` no se usa: el destello corre parejo) |

### `insert`: una pieza entra en sus agujeros (M15)

| Campo | Valores | Por defecto | |
|---|---|---|---|
| `part` | un id, *obligatorio* | | pasa al frente |
| `enter` | `drop`, `fade`, `cut` | `drop` | baja desde arriba, aparece con un fundido o de una vez |
| `height` | 0…40 mm | 12 | desde dónde baja |
| `dark` | `true`, `false` | `true` | el circuito sin corriente hasta que entra (como en el banco: una pieza fuera abre el circuito) |
| `move`, `ms`, `curve` | | `arrival`, 700 ms | |

Al asentar, los puntos suben en 600 ms y la luz de un LED en 180 ms.

### `assemble`: el circuito se arma (M4, M5)

Las piezas salen de la tabla y luego entran una tras otra; un cable se dibuja de un extremo al
otro. Mejor antes de encender la capa de corriente.

| Campo | Valores | Por defecto | |
|---|---|---|---|
| `parts` | una lista de ids o de `{ "part", "enter", "wire", "from" }` | todas, en el orden del circuito | el orden en que entran; un objeto le da a esa pieza su propia entrada |
| `gap` | 300…3000 ms | 1100 | de una pieza a la siguiente |
| `ms` | 0…5000 ms | 700 | cuánto tarda cada pieza |
| `enter` | `drop`, `fade`, `cut` | `drop` | cómo entra una pieza (que no es cable) |
| `wire` | `draw`, `fade`, `cut` | `draw` | cómo entra un cable |
| `from` | `start`, `end` | `start` | el extremo desde el que se dibuja un cable (su primera pata o la segunda) |
| `height` | 0…40 mm | 12 | desde dónde baja |
| `dark` | `true`, `false` | `true` | sin corriente hasta que entra la última |
| `move`, `curve` | | `arrival` | la curva de cada pieza |

```json
{ "at": 300, "do": "assemble", "gap": 800,
  "parts": ["S1", "R1", "R2", "Q1", { "part": "D1", "enter": "fade" }, { "part": "W1", "from": "end" }, "W2", "W3", "W4"] }
```

### `raise`: resaltar una pieza (M16)

| Campo | Valores | Por defecto | |
|---|---|---|---|
| `part` | un id, *obligatorio* | | pasa al frente |
| `mm` | 0…12 | 3 | cuánto sube; se queda arriba hasta un `raise` con `"mm": 0` |
| `move`, `ms`, `curve` | | `arrival` | |

Una pieza levantada sigue en el circuito: la simulación no cambia.

### `flip`: el otro lado

| Campo | Valores | Por defecto | |
|---|---|---|---|
| `view` | `front`, `back` (las vistas de la página), *obligatorio* | | un corte; deja un respiro antes y después |

### `probe`: el osciloscopio

En la página abre la ficha de la pieza (o de la tira) con su osciloscopio. En una grabación muestra
el osciloscopio en un recuadro propio, desde t = 0 (M11): en vertical en la franja del 56 % al 75 %
de la altura (la cámara vuelve a encuadrar lo último encuadrado, encima del recuadro), en horizontal
bajo el subtítulo.

| Campo | Valores | Por defecto | |
|---|---|---|---|
| `part` o `node` u `off` | un id, una tira como la nombra la página, o `true` (uno de los tres, *obligatorio*) | | `off` lo quita |
| `field` | `voltage`, `current` | `voltage` | la traza del recuadro |
| `title` | un texto (`""` para ninguno) | el del kit (*Osciloscopio*) | el título del recuadro |
| `label` | un texto | el del kit (*Voltaje*, *Corriente*) | el nombre de la traza, antes de su valor |
| `note` | un texto (`""` para ninguna) | la del kit (*modelo, desde el encendido*) | bajo la traza |

### `label`: el nombre de una pieza en una grabación

| Campo | Valores | Por defecto | |
|---|---|---|---|
| `part`, `text` | un id y un texto (`""` para ninguno), *obligatorio* | | el rótulo corto de la pieza (el que conserva una grabación; *D1 · rojo* por defecto) con tus palabras |

### `wait-until`: esperar a la simulación

| Campo | Valores | Por defecto | |
|---|---|---|---|
| `part`, `field` | como los de `value`, *obligatorio* | | |
| `above` o `below` | un número, uno *obligatorio* | | la condición |
| `max` | 0…60000 ms | 10000 | se rinde pasado este tiempo |

## Lo que el kit escribe solo

Solo los números: la lectura de un `value`, la escala y los tiempos del osciloscopio, y los textos
por defecto nombrados arriba (el título, los nombres de traza y la nota del osciloscopio, el rótulo
corto de una pieza), que un paso puede reemplazar. Los subtítulos son siempre los de la línea de
tiempo.

## Revisión

`node bin/protoboard-iso.js check <circuito>` lee la línea de tiempo del circuito. Un problema de
forma, tamaño o archivo deja la página sin recorrido (`TOUR_SHAPE`, `TOUR_FIELD`, `TOUR_ACTION`,
`TOUR_MOVE`, `TOUR_JSON`, `TOUR_TOO_LARGE`…); una pieza o un control desconocido, un `ms` fuera del
rango de su movimiento, un ritmo roto o una línea de tiempo de más de diez minutos es un aviso y
igual se reproduce. Topes: 100 kB, 200 pasos, 280 caracteres por texto, diez minutos.

## Grabar

```bash
node scripts/render-frames.js examples/tours/npn-switch-build.json --format both --lang es --check
node scripts/assemble.js examples/out/video/npn-switch-build/vertical -o video.mp4
```

Los fotogramas, sus sumas, los subtítulos y `timeline.json` (cuándo corrió de verdad cada paso y qué
había en pantalla) se escriben en `examples/out/video/<línea>/<formato>/`; ver
[escena-y-video.md](escena-y-video.md#grabar-un-video).
