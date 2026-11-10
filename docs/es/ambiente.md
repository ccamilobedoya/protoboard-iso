# El ambiente: lo que leen los sensores

*[English](../en/environment.md)*

Un sensor es una función de una magnitud del mundo (luz, temperatura, distancia…) a algo
eléctrico: una resistencia, un voltaje (tensión), un contacto que se abre. Las magnitudes viven en
un solo lugar compartido por todo el circuito, su **ambiente**. Quien aprende cambia la luz, no la
fotorresistencia: todas las piezas que sienten la luz reciben el valor nuevo de una vez.

Para eso no se dibuja nada sobre la protoboard ni cerca de ella. No hay una lámpara que se acerque
ni una mano sobre el sensor: la luz está «encendida a un nivel», y cada magnitud se muestra con un
pequeño **indicador** (un sol, un termómetro, un medidor de aguja) junto a su deslizador en la
página, en la ficha de un sensor y en un recuadro propio en un video.

El código está en `src/sim/environment.js` (no importa nada, así que la página lo agrupa); el
indicador, en `src/page/client/gauge.js`. Circuitos de ejemplo: `examples/environment.json` (luz y
temperatura a mano) y `examples/environment-cycle.json` (la luz en un ciclo lento); la línea de
tiempo `examples/tours/environment.json` hace un video del primero.

## Los campos

| Campo | Unidad | Deslizador | Límite | Escala | Por defecto | Tipo |
|---|---|---|---|---|---|---|
| `light` | lx | 0,1…10 000 | 0…10⁶ | log | 300 | nivel |
| `temperature` | °C | −20…100 (paso 1) | −55…150 | lineal | 25 | nivel |
| `humidity` | %RH | 0…100 | 0…100 | lineal | 50 | nivel |
| `moisture` | % (suelo) | 0…100 | 0…100 | lineal | 30 | nivel |
| `water` | mm (nivel) | 0…40 | 0…1000 | lineal | 0 | nivel |
| `rain` | | no / sí | 0…1 | | 0 | interruptor |
| `distance` | cm | 2…400 | 0…1000 | lineal | 50 | nivel |
| `field` | G (magnético) | −500…500 | −10 000…10 000 | lineal | 0 | nivel |
| `motion` | | no / sí | 0…1 | | 0 | interruptor |
| `touch` | | no / sí | 0…1 | | 0 | interruptor |
| `vibration` | | no / sí | 0…1 | | 0 | interruptor |
| `sound` | dB | 30…110 | 0…140 | lineal | 40 | nivel |
| `tilt` | | no / sí | 0…1 | | 0 | interruptor |
| `angle` | ° | 0…360 | 0…360 | lineal | 0 | nivel |
| `reflectance` | % (del papel blanco) | 0…100 | 0…100 | lineal | 80 | nivel |
| `beam` | (1 = cortado) | no / sí | 0…1 | | 0 | interruptor |

El rango del deslizador es lo que ofrece la página; el límite, lo que un valor puede ser (un
circuito, un `set` o un programa por fuera se recortan, y `check` lo dice). Hoy lo leen el
termistor y la fotorresistencia (`temperature`, `light`), el LM35 (`temperature`), el interruptor
de inclinación (`tilt`) y los módulos de sensor con LM393 ([modulos-sensores.md](modulos-sensores.md):
`rain`, `moisture`, `light`, `beam`, `distance` y `reflectance`, `field`, `vibration`, y `angle` para un
disco de encoder); los demás campos quedan listos para los sensores que vienen. `reflectance` (la
superficie bajo un seguidor de línea o frente a un sensor de obstáculos) y `beam` (algo en una ranura
óptica) llegaron con esos módulos.
El módulo ultrasónico HC-SR04 ([sensor-ultrasonico.md](sensor-ultrasonico.md)) lee `distance` y
`temperature`, que fija la velocidad del sonido.

## En el circuito

`environment` es opcional, en el nivel superior del archivo del circuito:

```json
{
  "environment": {
    "light": 300,
    "temperature": { "value": 25 },
    "rain": true,
    "sound": { "program": { "kind": "toggle", "high": 90, "low": 40, "on": 2, "off": 3 } }
  }
}
```

Cada campo es un número (un interruptor admite también `true` o `false`) o `{ value, program, range }`.
Con un programa, el valor en t = 0 es el del programa y un `value` a su lado no se usa.

### El rango de un campo

`range` es `[min, max]`, el tramo que muestran el deslizador y el indicador de ese campo en este
circuito, para que la aguja cruce el dial con los valores que importan:

```json
{ "environment": { "distance": { "value": 30, "range": [2, 40] } } }
```

También sirve con un `program`. El rango debe ir de menor a mayor (`min` < `max`) y quedar dentro
del límite del campo (un campo logarítmico como `light` necesita `min` mayor que 0); un interruptor
no tiene. Sin él vale el rango del deslizador de la tabla de arriba. El límite no cambia:
`engine.controls()` da el `min` y el `max` del campo desde el rango y el mismo `limit`, y un valor
fuera del rango se admite (el deslizador y el dial se detienen en el extremo; el texto sigue diciendo
el valor). `page.controls` y el `gauge` de una línea de tiempo pueden elegir otro rango para una
fila del panel o para una grabación ([más abajo](#la-página)).

Un circuito **sin** `environment` no tiene ambiente: cada sensor conserva el valor de su propia pieza
(el valor por defecto de la pieza si no da ninguno), exactamente como antes de que existiera el
ambiente. Un circuito **con** uno, aunque sea `{}`, le da a cada sensor sin valor propio el campo que
siente (el valor por defecto del campo si el circuito no lo nombra).

`check` informa, como errores: `ENV_UNKNOWN_FIELD` (un campo que no está en la lista de arriba),
`ENV_OUT_OF_RANGE` (un valor, o un valor de un programa, fuera del límite del campo), `ENV_SHAPE` (ni
un número ni `{ value, program, range }`), `ENV_BAD_PROGRAM` (un programa que no puede correr, y qué
necesita), `ENV_BAD_RANGE` (un rango que no va de menor a mayor, queda fuera del límite, tiene un
`min` de 0 o negativo en escala logarítmica, o se da a un interruptor) y `ENV_TOO_LARGE` (más de 1000
puntos). La simulación deja ese campo por fuera, recorta su valor, o toma el rango del deslizador, y
corre.

### Programas

Un programa cambia un campo con el tiempo simulado; se evalúa antes de cada paso de tiempo, como la
onda de un generador de señales:

| `kind` | Campos | Qué hace |
|---|---|---|
| `toggle` | `high`, `low`, `on`, `off` | `high` durante `on` s, luego `low` durante `off` s; empieza en `high` en t = 0 |
| `cycle` | `shape` (`sine`, `square`, `triangle`), `period`, `min`, `max` | las formas del generador: la senoide empieza en la mitad subiendo, la cuadrada arriba, la triangular abajo |
| `ramp` | `from`, `to`, `seconds` | de `from` a `to` en línea recta, y luego se queda en `to` |
| `keyframes` | `points` `[[t, v], …]`, `loop` | rectas entre los puntos, el último se mantiene (o, con `loop`, vuelve a empezar) |

Un programa interpola en las unidades del campo, de forma lineal, también en un campo logarítmico:
un ciclo de 5 a 2000 lx pasa casi todo el tiempo con mucha luz. Para quedarse en la oscuridad, usa
`keyframes`.

En la página, un circuito en el que lo único que cambia con el tiempo es un programa corre en
tiempo real, en pasos de una doscientava parte de la duración del programa (entre 1 y 20 ms); cuando
el circuito tiene su propio tiempo (un condensador, un generador, el programa de una placa), el
programa va a ese ritmo, así que un programa de segundos en un circuito de milisegundos casi no se
mueve: dale tiempos a la escala del circuito. `simulate()` en CC toma cada programa en t = 0;
`simulate --transient` deja el ambiente como está en t = 0 (los programas corren en la página y en
los videos).

## Qué pieza sigue un campo

Un dispositivo que lee el ambiente declara los campos que siente (`senses: ['light']`). Su pieza
**sigue** el campo salvo que la pieza dé su propio valor: `"light": 50` en una fotorresistencia,
`"temperature": 40` en un termistor o un LM35, `"tilted": true` en un interruptor de inclinación (su
propio nombre para `tilt`). Un valor en la pieza siempre gana.

Una pieza conserva su propio control en su ficha. Moverlo la **desprende** del campo: desde ahí
guarda su propio valor y el ambiente ya no la mueve. Su ficha dice cuál es, en una línea después de
sus lecturas: *Sigue el ambiente · luz 300 lx*, o *Valor propio (no sigue el ambiente: luz)*; y bajo
su propio control muestra el indicador de cada campo que siente, con *Seguir el ambiente* para
volver a él. Al recargar vuelve lo que dice el circuito.

## El motor

`engine.controls()` lista los campos del ambiente como controles con el id `'environment'` y
`field` el nombre del campo, con la forma de los de un dispositivo (`min`, `max`, `limit`, `scale`,
`unit`, `step`, `value`; `min` y `max` son el rango del circuito para el campo si da uno; un
interruptor tiene la escala `toggle`; un campo con programa, `programmed` y `paused`). Además:

- `engine.set('environment', field, value)` lo cambia a mano (si tiene un programa, se **pausa** en
  ese valor) y resuelve de nuevo, como el control de una pieza;
- `engine.resume('environment', field)` reanuda un programa en pausa, desde su propio comienzo en
  ese momento;
- `engine.attach(id, field)` hace que una pieza que dejó un campo vuelva a seguirlo;
- `engine.environment()` da los valores de ahora; `engine.stimuli()`, la duración de cada programa
  que corre (el ritmo de la página).

*Reiniciar* en la página vuelve a empezar los programas desde t = 0; los valores puestos a mano se
quedan.

## La página

`page.controls` admite una entrada del ambiente además de la de una pieza o una fuente:

```json
{ "page": { "controls": [{ "environment": "light" }, { "environment": "temperature", "min": 0, "max": 80, "label": { "en": "Room", "es": "Cuarto" } }] } }
```

`min` y `max` aquí reemplazan el rango del circuito para esa fila (la misma validación que para una
pieza: `PAGE_CONTROL_RANGE` si no va de menor a mayor o sale del límite; un `min` o un `max` solo se
empareja con el otro extremo del circuito). El indicador de la fila lo sigue, y también su `scale` si la entrada la da (`"scale": "log"` necesita
`min` mayor que 0). Un rango que no puede serlo no se dibuja: el indicador vuelve al rango del
circuito y, si no, al del deslizador, así que su posición queda entre 0 y 1. Las filas llevan
`data-min` y `data-max`.

El `min` y el `max` de una entrada de `page.controls` valen solo para esa entrada del panel: la ficha
de un sensor sigue el rango del circuito (o del registro). Para que la ficha y el panel coincidan,
pon el rango en el circuito (`environment.<campo>.range`).

Van en una sección propia, *Ambiente*, encima de los demás controles, cada fila con su indicador
junto al deslizador (o el botón de encender y apagar de un interruptor), y *Pausar* / *Reanudar*
para un campo que mueve un programa. `page.environment: true` pone ahí todos los campos del ambiente
sin listarlos; es lo predeterminado cuando una pieza sigue un campo, y `false` quita la sección (los
sensores lo siguen igual).

## El indicador

Un SVG compacto, de 44 × 44 px de CSS, hecho una vez y actualizado en su sitio con cada cambio
(unos pocos atributos y su texto; sin filtros CSS, sin volver a maquetar), con los colores del tema
de la página, así que se lee en los temas claro, oscuro, cuaderno y escena:

- por defecto: un tacómetro, un arco de mínimo a máximo con una aguja y el valor debajo (en escala
  logarítmica donde el campo lo es);
- `light`: un sol cuyo halo y rayos crecen con el logaritmo de la luz, oscuro en 0,1 lx y pleno en
  10 klx;
- `temperature`: un termómetro cuya columna sube de mínimo a máximo;
- un interruptor (`rain`, `motion`, `touch`, `vibration`, `tilt`, `beam`): una lámpara que se enciende.

Todos abarcan del `min` al `max` del control (el rango del campo en este circuito, el de
`page.controls` en una fila del panel, o el de un paso `gauge` en una grabación); un valor fuera
deja la aguja, el relleno o la columna en el extremo, y el texto de abajo sigue diciendo el valor.
La raíz `<svg class="gauge">` lleva `data-pos` (la posición, de 0 a 1, en la escala del campo: un
campo logarítmico por proporciones), `data-min` y `data-max`, al día con cada cambio; una prueba o un
script lee el dial ahí.

## En una línea de tiempo

Dos pasos ([linea-de-tiempo.md](linea-de-tiempo.md)):

- `set` con `environment` en lugar de `part` y `field`:
  `{ "do": "set", "environment": "light", "value": 5, "move": "travel" }`. Un número se mueve por su
  escala (un campo logarítmico por proporciones, como su deslizador). Si no hay un indicador puesto,
  el del campo aparece en la esquina de arriba a la derecha mientras dura el movimiento (al menos un
  segundo) y luego se va.
- `gauge`: `{ "do": "gauge", "environment": "light", "on": true, "corner": "tr" }` pone el indicador
  en un recuadro propio en una esquina del cuadro (`tl`, `tr`, `bl`, `br`), como `probe` pone el
  osciloscopio; `on: false` lo quita. `min` y `max` fijan los extremos del dial desde ese paso
  (`{ "do": "gauge", "environment": "distance", "on": true, "min": 2, "max": 40 }`): elígelos para
  que el cambio del video se vea. `TOUR_GAUGE_RANGE` avisa si el rango no va de menor a mayor, sale
  del límite del campo o se da a un interruptor. Un `set` sin indicador puesto usa el rango del campo
  (el del circuito; si no, el del deslizador), y `engine.set` fuera del rango sigue permitido.

`check` avisa con `TOUR_UNKNOWN_ENVIRONMENT` si el ambiente del circuito no tiene ese campo (uno que
nombra o uno que sigue una pieza); `render-frames.js --parts` lista los campos con las piezas que
siguen cada uno. Un paso `value` lee un voltaje de salida con `field: "vout"` (el de un LM35, por
ejemplo).

## Agregar una magnitud

Una línea en `FIELDS` (`src/sim/environment.js`): su unidad, el rango del deslizador, su límite, su
escala, un paso si lo tiene, su valor por defecto y su tipo. Luego su nombre en los dos idiomas
(`sim.env.field.<nombre>` en cada archivo de `src/i18n/`), y el indicador toma el medidor por
defecto (un glifo especial es una rama en `gauge.js`, solo donde enseña más). Un sensor se une como
dice [agregar-componentes.md](agregar-componentes.md#7-un-sensor-unirse-al-ambiente).

Los emisores (una pieza que cambia el ambiente: una lámpara que alumbra la fotorresistencia de al
lado) no son parte de esto: la interfaz de dispositivos guarda el nombre `emits` para ellos, para más
adelante.
