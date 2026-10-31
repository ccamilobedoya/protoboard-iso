# Hacer un video de un circuito

*[English](../en/making-a-video.md)*

Una guía paso a paso, desde el nombre de una receta hasta un `.mp4` para el celular. Todo lo mide
el kit: se escribe un archivo JSON (la línea de tiempo) y se corren tres comandos. Nada se calcula a
mano: ni un agujero, ni un valor, ni una posición en la pantalla. La referencia de cada paso y
opción es [linea-de-tiempo.md](linea-de-tiempo.md); el diseño detrás, [escena-y-video.md](escena-y-video.md).

Lo que hace falta: `npm install` una vez (Playwright y su Chromium, para los fotogramas) y, solo
para el último paso, ffmpeg (`apt install ffmpeg`, o una versión estática).

## 1. Elegir el circuito y ver lo que tiene

Una línea de tiempo cuenta un circuito: el nombre de una receta (`led-resistor`, `npn-switch`…, la
lista está en [recetas.md](recetas.md)) o un archivo de circuito. Debe tener una fuente (de banco,
una batería, un generador, una placa por USB): un video muestra la simulación.

```bash
node scripts/render-frames.js --parts npn-switch
```

dice si se simula y todo lo que una línea de tiempo puede nombrar:

```text
npn-switch: simulated (a timeline can play)
parts (frame, focus, insert, assemble, raise, label):
  S1   button
       readings (value, wait-until): current
       set pressed = false
  R1   resistor 1k
       readings (value, wait-until): current, voltage, power
       set resistance = 1000 Ω 10…100000 (log)
  D1   led red
       readings (value, wait-until): current, voltage, power, brightness
  W1   wire red
supplies (not drawn on the board: only set):
  V1   bench
       set voltage = 5 V 0…30
strips (probe "node"):
  3:f-j    S1.1 R2.1 W1.2
  T+       W1.1
```

Usar solo esos identificadores, lecturas (`readings`), controles (`set`) y tiras (`strips`). Un
`value` necesita una lectura que la pieza tenga; un `set`, un control de la lista con un valor
dentro de su rango. Una fuente (de banco, un generador) no se dibuja en la protoboard: se le puede
hacer `set`, nunca encuadrarla ni enfocarla; su efecto se muestra en una pieza dibujada.

## 2. Escribir la historia antes de los pasos

Una idea por video, en cuatro tiempos (de 12 a 25 s en total):

1. **Gancho** (de 0 a 1,5 s): el circuito y un subtítulo que dice lo que hace. `"target": "parts"`
   encuadra las piezas de cerca; `"board"`, la protoboard entera, y un circuito pequeño se ve pequeño.
2. **Dónde** (≈ 1,5 s): la cámara llega a la pieza que importa; foco en ella; sube la corriente.
3. **Por qué** (de uno a tres tiempos de 2 a 3 s cada uno): un subtítulo en cada uno, una lectura
   grande (`value`), un control que se mueve (`set`), para ver juntos la causa y el efecto.
4. **Cierre** (≈ 2 s): de vuelta a la protoboard, un subtítulo que manda a la página («Pruébalo en
   la página: toca R1»), sin foco.

Cada subtítulo en inglés y en español, corto: unos 40 caracteres como mucho, para que quepa en dos
líneas en el celular (el español es más largo: contar el español; el tope es 280). Decir lo que
pasa, no el número: el número de un `value` lo escribe el kit desde la simulación. Nunca escribir un
valor propio en un subtítulo.

Elegir lecturas que cambien en la historia: en la lista de `--parts`, una pieza cuya lectura mueve
el `set` (la corriente de la resistencia de *pull-up* cuando el pulsador cierra, no un LED que sigue
apagado).

## 3. Escribir la línea de tiempo

Se guarda como `examples/tours/<nombre>.json` (el nombre del video; el circuito va en `circuit`).
Una plantilla para copiar, los cuatro tiempos de `led-resistor`:

```json
{
  "$schema": "../../schema/timeline.schema.json",
  "circuit": "led-resistor",
  "format": "vertical",
  "steps": [
    { "at": 0, "do": "frame", "target": "board", "move": "cut" },
    { "at": 0, "do": "caption", "text": { "en": "An LED needs a resistor", "es": "Un LED necesita una resistencia" } },

    { "at": 1200, "do": "frame", "target": "D1", "move": "arrival" },
    { "at": 1200, "do": "focus", "parts": ["D1"] },
    { "at": 1200, "do": "flow", "on": true, "ramp": 600 },

    { "at": 2400, "do": "caption", "text": { "en": "R1 sets the current through the LED", "es": "R1 fija la corriente que pasa por el LED" } },
    { "at": 2400, "do": "focus", "parts": ["R1", "D1"] },
    { "at": 2400, "do": "value", "part": "D1", "field": "current", "label": { "en": "through the LED", "es": "por el LED" } },
    { "at": 4400, "do": "caption", "text": { "en": "More resistance, less current", "es": "Más resistencia, menos corriente" } },
    { "at": 4400, "do": "set", "part": "R1", "field": "resistance", "value": 3300, "move": "travel", "ms": 1800 },

    { "at": 8600, "do": "frame", "target": "board", "move": "travel" },
    { "at": 8600, "do": "caption", "text": { "en": "Try it in the page: tap R1", "es": "Pruébalo en la página: toca R1" } },
    { "at": 10100, "do": "focus", "parts": [] }
  ]
}
```

Las reglas que la dejan bien:

- **Tiempo.** `at` son ms desde el comienzo. Cada subtítulo, al menos 2000 ms antes del siguiente
  (leer una línea corta toma unos 2 s); un paso que se mueve dura su movimiento (`arrival` 750 ms,
  `travel` 1500 ms, `hit` 150 ms; la tabla está en [linea-de-tiempo.md](linea-de-tiempo.md)).
  El tiempo siguiente empieza cuando terminó el movimiento anterior.
- **Una cosa contada.** Una grabación deja un solo rótulo: el de la última pieza encuadrada,
  enfocada, insertada o levantada. Encuadrar la pieza de la que se habla; `focus` puede tener varias.
- **La corriente.** `flow` con `"on": true` y una `ramp`, una vez, al comienzo: con ella llegan los
  puntos, el brillo y los colores.
- **Un control.** Un deslizador se mueve solo con `set` y `"move": "travel"` (`ms` de 1200 a 1800).
  Un pulsador (`pressed`) cambia de una vez con `hit`; dejar un `breath` (400 ms) entre dos golpes.
- **Una lectura.** `value` después del subtítulo al que pertenece: con el mismo `at` y escrito
  después de él, o más tarde (el subtítulo siguiente quita el valor; `--validate` avisa cuando eso
  pasa antes de un segundo). Cuenta hasta la lectura del momento del paso y se queda: en un
  circuito que cambia con el tiempo es ese instante, no el último (el osciloscopio muestra el
  último). Una lectura lenta (un condensador que se carga) espera antes con `wait-until`.
- **Algo que cambia con el tiempo** (un RC, un 555, un generador): el osciloscopio lo dice mejor que
  un número. `probe` con un `node` (una tira de `--parts`: la de la señal, la del condensador, la
  salida de un chip) para un voltaje, o con una `part` y `"field": "current"` para una corriente;
  ponerlo en `"at": 0`, porque su traza empieza cuando corre el paso. En una grabación el recuadro
  ocupa la franja del 56 % al 75 % del alto y la cámara encuadra el circuito en la franja de
  arriba, más pequeño: mientras esté el recuadro, encuadrar una o dos piezas, no la protoboard, y
  quitarlo (`"off": true`) antes del cierre. Su eje de tiempo sigue el tiempo de la simulación y
  se reescala solo: después de un `set` que cambia una frecuencia, decir qué cambia en la traza
  (más ciclos en el recuadro, un flanco más empinado), no que «va más lento».
- **Ritmo.** Nunca dos `push` seguidos; nunca dos `hit` a menos de 400 ms. La revisión de abajo
  nombra los dos.
- **Duración.** `--validate` dice cuándo corre el último paso: entre 10 y 23 s, para que con el
  segundo de cola y el último movimiento el video dure de 12 a 25 s.
- **Formato.** `vertical` (1080 × 1920) para las redes en el celular; `horizontal` para una página.
  La misma línea de tiempo da los dos (`--format both`); escribir primero para vertical.

Los demás movimientos (el circuito que se arma solo, una pieza que entra en sus agujeros, un pulso
por el camino, un osciloscopio, la cara de atrás) están en [linea-de-tiempo.md](linea-de-tiempo.md);
las líneas de tiempo `npn-switch-build.json` y `npn-switch-moves.json` usan cada uno.

## 4. Revisarla (sin navegador, un segundo)

```bash
node scripts/render-frames.js examples/tours/<nombre>.json --validate
```

`✔ <nombre>.json: 13 steps, the last at 13.0 s, no problems` (sale con 0) o los problemas, uno por
línea (sale con 1). Arreglar todos:

| Código | Quiere decir | Arreglo |
|---|---|---|
| `TOUR_UNKNOWN_PART` | un identificador que el circuito no tiene | uno de `--parts` |
| `TOUR_UNKNOWN_CONTROL` | la pieza no tiene ese control (el mensaje dice los que tiene) | un control de `--parts` |
| `TOUR_FIELD` | un campo que falta, desconocido o fuera de rango: el recorrido no se reproduce | la tabla del campo en [linea-de-tiempo.md](linea-de-tiempo.md) |
| `TOUR_MOVE`, `TOUR_ACTION` | un movimiento o acción que no existe | una de las palabras que da el mensaje |
| `TOUR_MOVE_MS` | un `ms` fuera del rango de su movimiento | un `ms` dentro del rango, u otro movimiento |
| `TOUR_VALUE_HIDDEN` | el subtítulo siguiente quita un valor antes de que se lea | el valor después de ese subtítulo, o el subtítulo más tarde |
| `TOUR_RHYTHM_SLOW`, `TOUR_RHYTHM_HIT` | dos movimientos lentos seguidos, dos golpes muy juntos | un paso más tarde, u otro movimiento |
| `TOUR_TOO_LONG`, `TOUR_TEXT_TOO_LONG` | más de diez minutos, un texto de más de 280 caracteres | más corto |

## 5. Sacar los fotogramas

```bash
# Un borrador: menos fotogramas, las mismas revisiones (unos 25 s para un video de 15 s).
node scripts/render-frames.js examples/tours/<nombre>.json --lang es --fps 10 -o /tmp/<nombre>-borrador

# Los fotogramas del video, dos veces, comparados uno por uno (con la máquina libre, cerca de
# 1 min 15 s por cada 15 s de video, formato y corrida: --format both --check son cuatro corridas,
# 5 min o más).
node scripts/render-frames.js examples/tours/<nombre>.json --format both --lang es --check
```

Cada formato va a `examples/out/video/<nombre>/<formato>/`: `frames/000000.png…`, `frames.sha256`,
`captions.srt` y `timeline.json`. El script mide cada fotograma en reposo (en cada subtítulo y cada
segundo) contra las reglas del fotograma. Por cada formato imprime (y después una línea
`video: ffmpeg …`, el comando para ese clip a mano; el paso 6 hace lo mismo con `assemble.js`):

- `✔ <nombre> vertical: 421 frames, 14.00 s at 30 fps`: se cumplió cada regla;
- `✖ …` y luego una línea por problema, con su tiempo: se arregla en la línea de tiempo;
- `✔ two runs gave the same 421 frames` (con `--check`), o `✖ two runs differ`: avisarlo, es una
  falla del kit, no de la línea de tiempo;
- `SKIPPED: …` y sale con 2: no hay Playwright o Chromium (`npm install`). Nunca cuenta como pasado.

Los problemas y su arreglo:

| Problema | Quiere decir | Arreglo |
|---|---|---|
| `D1 at … out of the free area …` | la pieza contada queda bajo el subtítulo o en la franja de una plataforma | encuadrarla (`frame` con la pieza) después del paso que llevó la cámara a otro lado, o encuadrar una lista de piezas; `zoom` menor que 1 si es muy grande |
| `the label of D1 out of the free area` | su rótulo corto cae afuera | lo mismo; o un rótulo más corto (`label`) |
| `2 labels, not 1` | dos piezas contadas a la vez | encuadrar o enfocar una sola de último |
| `caption …`, `chrome shown` | una falla de la escena, no de la línea de tiempo | avisarlo |

`timeline.json` dice cuándo corrió de verdad cada paso (`steps[].t`), los tiempos de cada subtítulo
y cada valor mostrado. Para mirar un momento, abrir el fotograma de ese tiempo: fotograma =
t × fps / 1000 (2,4 s a 30 fps es `frames/000072.png`). Mirar pocos fotogramas, solo cuando las
medidas dejan una duda.

## 6. Hacer el video

```bash
node scripts/assemble.js examples/out/video/<nombre>/vertical -o <nombre>-vertical.mp4
```

H.264, se reproduce en cualquier celular, con `<nombre>-vertical.srt` al lado. Varios clips del
mismo tamaño y fps, uno tras otro: nombrar varias carpetas. Sin ffmpeg imprime el comando y sale
con 2. Subtítulos dibujados en la imagen en lugar de la capa de subtítulos: sacar los fotogramas
con `--no-captions` y unir con `--burn`.

## 7. Agregarlo al banco

Una línea de tiempo en `examples/tours/` es parte del banco del kit: `npm test` reproduce cada una
contra su circuito y falla con cualquier aviso (`test/render-frames.test.js`). Dejarla ahí cuando
esté lista, con sus textos en los dos idiomas, y agregarla a la tabla de abajo.

## Listo cuando

- `--validate` no da problemas;
- `render-frames.js … --format both --check` termina en `✔` en los dos formatos y las dos corridas
  coinciden;
- `npm test` pasa;
- el video se reproduce (`assemble.js`) y un fotograma de cada tiempo se ve bien.

## El banco

| Línea de tiempo | Circuito | Cuenta |
|---|---|---|
| `led-resistor.json` | receta `led-resistor` | la resistencia fija la corriente de un LED |
| `potentiometer-led.json` | receta `potentiometer-led` | un potenciómetro como regulador de brillo |
| `npn-switch.json` | `examples/npn-switch.json` | un transistor como interruptor |
| `npn-switch-build.json` | `examples/npn-switch.json` | el circuito se arma solo y luego funciona |
| `npn-switch-moves.json` | `examples/npn-switch.json` | cada movimiento de la primera tanda (una prueba de la escena, no una lección) |
| `divider.json` | receta `divider` | dos resistencias se reparten el voltaje |
| `button-pullup.json` | receta `button-pullup` | una resistencia de *pull-up* y un pulsador |
| `mosfet-switch.json` | receta `mosfet-switch` | un MOSFET como interruptor |
| `rc-square.json` | receta `rc-square` | un condensador que se carga y descarga, en el osciloscopio |
| `zener-regulator.json` | receta `zener-regulator` | un Zener sostiene el voltaje con más carga |
| `555-astable.json` | receta `555-astable` | un 555 que parpadea, y una resistencia que cambia su ritmo |
