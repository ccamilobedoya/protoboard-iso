# Simulación

*[English](../en/simulation.md)*

El kit calcula el voltaje (tensión) de cada grupo conectado y la corriente de cada componente,
a partir del mismo archivo de circuito que dibuja la protoboard. Todo resultado es un
**modelo**: tiras ideales, valores típicos de los componentes, sin temperatura. La respuesta en
texto, el dibujo y la página lo dicen.

```bash
node bin/protoboard-iso.js simulate <objetivo> [--lang es] [--json]                 # punto de operación en DC
node bin/protoboard-iso.js simulate <objetivo> --transient 5,1m [--start zero|dc]    # 5 s en pasos de 1 ms
node bin/protoboard-iso.js render <objetivo> --sim --fit parts                       # resultados dibujados sobre la protoboard
node bin/protoboard-iso.js render <objetivo> --sim --focus D1                        # solo la corriente de D1 y el voltaje de sus grupos
```

En la página, la simulación está siempre activa cuando el circuito tiene fuente, pero nunca llena
la protoboard de números: **toca un componente** para ver su corriente, el voltaje de los grupos
bajo sus patas y, en su ficha, todos sus valores; los LED brillan con su corriente, y el botón
*Corriente* (sin presionar) muestra los conductores coloreados por voltaje, con la corriente en
movimiento.

MCP: la herramienta `simulate` (mismas opciones) y `render` con `sim: true`.

> **Primero quien aprende.** Nunca se muestra un resultado que alguien debe predecir. Los
> resultados se dibujan solo si se piden (`--sim`); la página para embeber los tiene por defecto,
> solo los del componente que se toca, así que un circuito con un valor pendiente de predicción
> los apaga: `"page": { "simulation": false }` (todo) o `"page": { "results": false }` (los
> valores; el brillo de los LED se va con ellos).

## La alimentación: baterías y `supplies`

Hay dos formas de decir de dónde sale la energía, y el simulador trata las dos igual (una
fuente ideal detrás de una resistencia interna):

- una **batería** (`"type": "battery"`), dibujada al lado de la protoboard con sus dos cables en
  agujeros: formato, química, celdas en serie, estado de carga (ver
  [formato-circuito.md](formato-circuito.md#battery-batería)). Un circuito con batería no necesita
  `supplies`.
- **`supplies`**, sin dibujar: una fuente de banco o una batería enganchada a dos grupos.

```json
{ "id": "BT1", "type": "battery", "format": "AA", "cells": 4, "pins": { "+": "T+3", "-": "T-3" } }
```

Las celdas en serie se suman: 4 pilas AA alcalinas dan 6 V nominales con 4 × 0,25 Ω por
dentro, así que con 330 Ω entregan 6 V / 331 Ω = 18,1 mA y quedan 5,98 V en sus bornes. Su ficha
muestra el voltaje (tensión) en vacío (fuerza electromotriz), el voltaje en los bornes, la
caída interna, la corriente y la potencia entregadas, y una autonomía estimada (capacidad /
corriente).

| Formato | Químicas (la primera, por defecto) | Por celda: nominal · llena | Resistencia interna | Capacidad | Corriente máxima |
|---|---|---|---|---|---|
| AA | alkaline, nimh | 1,5 V · 1,6 V; 1,2 V · 1,4 V | 0,25 Ω; 0,03 Ω | 2,5 Ah; 2,0 Ah | 1 A; 2 A |
| AAA | alkaline, nimh | igual que AA | 0,35 Ω; 0,05 Ω | 1,15 Ah; 0,8 Ah | 0,5 A; 1 A |
| 18650 | li-ion, lifepo4 | 3,7 V · 4,2 V; 3,2 V · 3,4 V | 0,03 Ω | 3,5 Ah; 1,5 Ah | 10 A; 4,5 A |
| 9V | alkaline (seis celdas por dentro) | 9 V · 9,6 V | 1,7 Ω | 0,55 Ah | 0,3 A |
| pouch | lipo (103450) | 3,7 V · 4,2 V | 0,08 Ω | 2,0 Ah | 2 A |

Sin `charge`, una batería está en su voltaje nominal. Con `charge` (0…1), el voltaje en vacío
sigue la curva de su química (li-ion: 3,0 V vacía, 3,75 V a la mitad, 4,2 V llena) y la
resistencia interna sube al vaciarse (cuatro veces en las alcalinas). Un `voltage` medido gana
sobre los dos. `switch: "off"` la desconecta.

### `supplies`

```json
"supplies": [{ "id": "V1", "voltage": 5, "positive": "T+", "negative": "T-", "currentLimit": 0.5 }]
```

| Campo | Qué es | Por defecto |
|---|---|---|
| `id` | nombre en los resultados | `V1`, `V2`… |
| `kind` | `bench` (fuente de banco), `battery` (batería) o `generator` (generador de señales, abajo) | `bench` |
| `voltage` | voltios | obligatorio, salvo en una batería con `format` o `chemistry` |
| `format`, `chemistry`, `cells`, `charge`, `capacity` | una batería descrita como una batería dibujada | — |
| `positive`, `negative` | agujero (`"T+9"`) o grupo (`"T+"`, `"12:f-j"`) de cada cable | `T+`, `T-` |
| `currentLimit` | límite de la fuente de banco, A: por encima, la fuente sostiene la corriente (corriente constante, CC) y su voltaje baja | ninguno |
| `internalResistance` | Ω | banco 0; batería según su formato, o 0,25 Ω por cada celda de 1,5 V si solo trae el voltaje |

**Generador de señales** (`"kind": "generator"`): una fuente cuyo voltaje (tensión) cambia con el
tiempo, como la salida de generador de un osciloscopio de banco.

```json
"supplies": [{ "id": "G1", "kind": "generator", "waveform": "sine", "frequency": 50, "amplitude": 10 }]
```

| Campo | Qué es | Por defecto |
|---|---|---|
| `waveform` | `sine` (seno), `square` (cuadrada) o `triangle` (triangular) | `sine` |
| `frequency` | Hz | obligatorio |
| `amplitude` | voltios de pico (la mitad del pico a pico) | 1 |
| `offset` | desplazamiento de continua, voltios | 0 |
| `resistance` | resistencia de salida, Ω (la de un generador de banco típico) | 50 |

Las ondas son las de Falstad: el seno empieza en el desplazamiento subiendo, la cuadrada empieza
arriba y la triangular empieza abajo. En DC vale su valor en t = 0; en el transitorio y en la página
en vivo sigue la onda paso a paso. Su ficha no existe (no es un componente dibujado), pero el
panel de controles puede llevar su frecuencia y su amplitud (`"field": "frequency"` /
`"amplitude"`). En la página, el tiempo corre a un período por segundo y el paso da al menos 100
por período. Ejemplos `half-wave-rectifier.json` y `rc-square-wave.json`.

El negativo de la primera fuente es la **tierra** (0 V); sin `supplies`, el de la primera
batería. Una segunda fuente sin conexión con la
primera alimenta un circuito aparte, medido desde su propio negativo.

Un `voltage` negativo (`-5`) es la misma fuente al revés: se simula con sus terminales
intercambiados y se lee como está escrito (`V1 -5 V … escrita en negativo: T- es el riel positivo, no
T+`); la respuesta de `layout` trae una línea `Nota:` que dice que el riel llamado + es el más bajo.
Su control (el deslizador de la página, `--set V1=-9`) también va como está escrito: de −30 V a 0,
en −5 V.

Se fijan con una operación, como cualquier campo del circuito:
`{ "op": "circuit", "supplies": [ … ] }`.

## Análisis

- **DC (punto de operación).** Los capacitores quedan abiertos; todo lo demás, en su estado
  estable. Método de Newton sobre análisis nodal modificado (MNA); si no converge, las fuentes
  se suben poco a poco desde el 10 %. Newton converge cuando una iteración no mueve ningún voltaje
  más de 1 µV + 1 ppm o, cuando sus correcciones dejan de achicarse, cuando las ecuaciones de
  Kirchhoff ya cuadran en cada nodo (1 pA más una milmillonésima de los términos de la fila): un nodo que solo
  sostienen las fugas, como el lado DC de un puente mientras sus diodos bloquean, no queda mejor
  fijado que eso.
- **Transitorio.** `stop` y `step` en segundos; los capacitores empiezan descargados y los
  inductores sin corriente (`start: "zero"`, la fuente se enciende en t = 0), o en sus valores de
  DC (`start: "dc"`).
  Euler implícito con paso fijo; se guardan como mucho 400 muestras (`points`). Un circuito cuya
  placa corre un programa avanza como lo hace la página (abajo, «Una ejecución»): trozos de 1 ms
  como mucho que terminan en cada evento del programa y de los módulos temporizados, así un pulso
  de 10 µs o un eco quedan en su momento; la respuesta trae entonces una nota que nombra `--run`,
  que dice lo que imprimió el programa y cómo cambian sus salidas.
- **Una ejecución** (`simulate <objetivo> --run <segundos>`, MCP `run_s`). El circuito como lo
  corre la página, desde donde empieza la página (su punto de reposo, el punto de DC, con cada
  capacitor ya en su voltaje de DC; o todo descargado con `page.start: "zero"`), o desde el que se
  pide con `--start zero|dc` (MCP `start`), durante esos segundos simulados. Su primera línea dice
  cuál en palabras claras (`Ejecución desde su punto de reposo, como empieza la página` o
  `Ejecución desde todo descargado`): un capacitor detrás de 22 kΩ que un circuito real tarda
  segundos en cargar ya está cargado en una ejecución desde el punto de reposo. Usa el mismo motor y el
  mismo paso (`sim/pace.js`), el programa de la placa con `pulseIn`, los sensores de biblioteca, el
  encoder y los módulos temporizados. Responde lo que un asistente necesita para decir si el
  circuito hace lo que se pidió:
  - **Serial**: lo que imprimió el programa, cada línea con su tiempo, en orden, y cuántas (una
    historia larga guarda sus primeras y últimas líneas, `runSerialLines` en `src/limits.js`);
  - **las salidas en el tiempo**, una por cada componente que muestra algo (un LED, un chip de un
    LED RGB, un segmento de un display, un zumbador, un relé, un motor), la salida de cada
    amplificador operacional y cada pin que maneja un programa (`U1.D13`): la parte del tiempo que
    estuvo encendida, cuántas veces cambió, los tramos en que estuvo encendida (`intervals`) y,
    cuando cambia con regularidad (cada periodo a menos del 10 % de su media, sin el primero del
    arranque), su frecuencia, periodo y ciclo útil. Los flancos se buscan entre pasos: un pin en el
    paso en que su programa lo cambió, un LED que maneja un pin en la mitad de ese paso, y lo más
    lento donde cruza su nivel (un LED al 5 % de su corriente nominal, un relé cerrado, un motor
    sobre 30 r/min, un pin o la salida de un amplificador sobre la mitad de su riel). Un zumbador
    pasivo se dice por cuándo se oye: suena mientras su corriente cambia al menos cada 50 ms (un
    tono de 20 Hz o más; `SOUND_GAP`, supuesto), así que su línea da los pitidos (la parte de la
    ejecución en que suena, cuántas veces y cada cuánto empieza) y la frecuencia del tono aparte
    (`BZ1 (zumbador): pita 2 Hz (cada 500 ms), sonando el 20 % del tiempo · pitidos: 4 · tono
    2 kHz`); con corriente continua está en silencio (solo chasquea). Un zumbador activo suena con
    continua: su línea es cuándo suena, como antes;
  - **las lecturas al final**, como las imprime el punto de DC, y cada aviso de la ejecución, una vez
    cada uno en su lectura más fuerte y con cuándo llegó (`en su punto más fuerte de la ejecución, a
    los 10 ms, con D9 en alto`): una cifra de una ejecución es de ese momento, no del punto de DC (un
    motor en un pin toma más al arrancar que girando estable, y empuja corriente de vuelta al pin
    puesto en bajo mientras frena). El daño del punto de DC también nombra su estado: en un pin de la
    placa que el programa pone en alto ahí, `con D9 en alto, como el programa lo pone primero`.

  Estímulos, cada uno se puede repetir: `--env light=0.5,distance=10` (campos del ambiente, en las
  unidades del catálogo, dentro del rango del campo: un campo desconocido o un valor fuera de él es
  un error de entrada, salida 1), `--set RV1=0.8,SW1=on` (un control: la posición de un
  potenciómetro, un interruptor, un campo propio de un sensor como `U2=30` en un LM35;
  `ID.campo=valor` cuando tiene varios), `--press SW1@0.5+0.2` (presionado a los 0,5 s durante
  0,2 s), `--at 1.0:light=0.1` (un campo o un control que cambia en un momento). Un sensor que lee
  un campo por un valor propio sigue el campo que fija la ejecución, y la ejecución lo dice
  (`RUN_ENV_ATTACHED`). `--env` y `--set` sirven también para el punto de DC y para
  `--transient`. No se guarda nada: el archivo del circuito y su historial quedan como estaban.
  Acotada: a lo sumo `runSeconds` (60) de tiempo simulado (más se recorta, `RUN_CAPPED`) y `runMs`
  (15 s) de tiempo de la máquina (`RUN_BUDGET`: termina donde llegó); un programa que nunca deja
  pasar el tiempo termina con `SIM_PROGRAM_STUCK`. Una ejecución que cubre menos de lo pedido lo dice
  en la línea bajo su encabezado (el aviso, luego `Cada cifra de abajo cubre los primeros 60 s de los
  120 s pedidos, no toda la ejecución.`), cada encabezado de después nombra su tramo (`Salidas en el
  tiempo en los primeros 60 s:`, `Lecturas a los 60 s:`), y `--json` trae `run.ran` (los segundos
  cubiertos) junto a `run.seconds` (los pedidos).

  ```text
  $ protoboard-iso simulate alarma --run 1 --env distance=10 --lang es
  Ejecución desde su punto de reposo, como empieza la página (los capacitores ya en sus voltajes de DC; start zero la corre desde todo descargado) — un modelo, no una medición: 1 s en pasos de 1 ms (1000 pasos).
  Serial (10 líneas, en orden):
    844 µs     10
    …
  Salidas en el tiempo:
    D1 (LED): encendido el 100 % del tiempo · cambios: 1 (encendido 857 µs → 1 s)
    U1.D9 (pin): 9,92 Hz, encendido el < 1 % del tiempo (periodo 101 ms) · cambios: 20
  Lecturas a los 1 s:
  …
  ```

  Un pin se informa por lo que el programa le escribe (un pin cargado por debajo de la mitad del riel
  sigue en alto; su voltaje caído está en las lecturas, con `(a través de su resistencia de salida de
  40 Ω)` en un pin que lleva más de 1 mA).

  La respuesta de `layout` trae lo mismo en una línea para un circuito que cambia solo (el
  programa de una placa, un 555, un generador, un amplificador operacional junto a un capacitor):
  `Comportamiento, primeros 2 s desde su punto de reposo, como empieza la página (simulado, un modelo): D1 1 Hz, encendido el 50 % del tiempo`, de
  una ejecución acotada a 25 000 pasos de la simulación (así el mismo circuito da la misma línea en
  cualquier máquina; tarda más o menos lo que los 0,8 s de tiempo de la máquina que reemplazó,
  `BEHAVIOUR_STEPS` en `src/sim/run.js`) y un paso no menor que una veinte milésima de ella (un ritmo de menos de 50 de esos pasos por periodo
  se mide otra vez en el paso propio de la página, como lo mide `simulate --run`, dentro del mismo
  límite; con menos de cinco periodos enteros dice `unos` con dos cifras); pasado
  el límite dice que no se midió (`la ejecución necesitaba más de 25 000 pasos de la simulación`) y
  nombra `simulate --run 2`.
- **Dos estados de reposo** (un enclavamiento de transistores, un flip-flop). Su punto de DC puede
  ser el equilibrio entre sus dos estados estables, los dos transistores a medias, en el que un
  circuito real nunca se queda. Después del punto de DC de un circuito con dos transistores o más (y
  sin placa, 555 ni amplificador operacional), el kit empuja la base o la compuerta de cada
  transistor 50 mV, hacia arriba y hacia abajo, con 1 nF en cada nodo (lo que tiene un nodo real), y
  lo deja asentarse: un punto estable recoge el empujón, un punto de equilibrio se escapa a un estado
  a cada lado (`restingStates` en `src/sim/run.js`; el signo de la ganancia del lazo diría lo mismo,
  pero el sistema tiene fuentes e interruptores cuyas filas no son dinámica, así que el empujón usa
  el motor que corre la página). Cada estado se resuelve otra vez sin las capacitancias agregadas,
  así sus lecturas son las del circuito. La respuesta de `layout` dice entonces `Dos estados de
  reposo (un modelo): … al encenderlo queda en uno de los dos, y el kit no puede decir en cuál` y las
  lecturas de cada estado (`1. Q1 apagado, Q2 conduce · batería BT1 8,98 V · D1 4,54 mA …`) en vez
  de la línea `Lecturas`; el punto de DC de `simulate` agrega el aviso `SIM_TWO_STATES` y `states`
  en `--json`; `--run` desde el punto de reposo empieza desde el primer estado y lo dice (`run.state`,
  `run.states` en `--json`). Ninguna receta ni ejemplo tiene dos.

## Resultados

`simulate(circuit)` (JSON con `--json` o `format: "json"`):

```js
{ analysis: 'dc', model: true, ok: true, ground: 'T-',
  nodes:    { 'T+': 5, '9:f-j': 1.76, … },               // voltios; null = flotante
  supplies: { V1: { voltage, current, power, mode: 'CV' | 'CC' } },
  parts:    { R1: { voltage, current, power, pins: { '1': 5, '2': 1.76 } },
              D1: { …, brightness: 0.49 },                // LED: corriente / 20 mA
              Q1: { currents: { C, B, E }, vbe, vce, beta, region: 'off' | 'active' | 'saturation' },
              M1: { currents: { D, G, S }, vgs, vds, region: 'off' | 'linear' | 'saturation' },
              BT1: { voltage, current, power, emf, drop, runtime, charge, on },   // current: la que entrega
              U1: { vin, vout, headroom, current, quiescent, power, state: 'regulating' | 'dropout' },
              RT1: { …, sensor: { kind: 'thermistor', temperature, resistance } } },
              // solo en DC: cada componente frente a sus límites (bien < 80 %, cerca ≤ 100 %, excedido)
              // D1.stress: [{ quantity: 'current', value, max, unit: 'A', ratio, level: 'fine' | 'near' | 'exceeded' }]
  issues: [ … ] }
```

Una ejecución (`--run`, `run_s`):

```js
{ ok: true, start: 'dc',                                          // el inicio usado
  run: { seconds: 1, ran: 1, step: 0.001, steps: 1000, start: 'dc', page: 'dc' },   // seconds pedidos, ran cubiertos; page: el inicio de la página
  serial: { count: 10, lines: [{ t: 0.00084, text: '10' }, …] },    // kept: cuando se recorta
  outputs: [{ id: 'D1', kind: 'led', onShare: 0.999, changes: 1, frequency: null, period: null, duty: null,
              intervals: [[0.00086, 1]] }, …],                         // una salida aún encendida cierra al final
  // un zumbador pasivo agrega sound (los mismos campos, cuándo se oye, y starts) y tone:
  //   { id: 'BZ1', kind: 'buzzer', onShare: 0.1, frequency: 2000, …,   // su corriente, cada ciclo
  //     sound: { onShare: 0.2, changes: 8, starts: 4, frequency: 2, period: 0.5, duty: 0.2, intervals },
  //     tone: { frequency: 2000, period: 0.0005 } }
  boards: 1, readings: { … la forma del punto de DC, al final … }, issues: [ … ] }
```

Componentes de dos patas: `voltage` = primera pata − segunda, y `current` va de la primera pata a
la segunda a través del componente. Las corrientes de los transistores son positivas cuando
entran por la pata. El transitorio trae `times` y las mismas magnitudes como listas.

## Avisos

| Código | Cuándo |
|---|---|
| `SIM_OVER_POWER` | una resistencia por encima de su potencia (`power`: "1/4" W por defecto) o un transistor por encima de lo que aguanta su encapsulado |
| `SIM_OVER_CURRENT` | un LED con más de 30 mA; un diodo, inductor, regulador o batería por encima de su máximo |
| `SIM_REVERSE_VOLTAGE` | una pieza alimentada al revés: un LED con más de 5 V en inversa; un regulador, amplificador operacional, 555 o placa de desarrollo cuyo pin de alimentación queda a más de 0,5 V por debajo de su pin de tierra ("cualquier voltaje inverso en una alimentación queda fuera de sus especificaciones: en un circuito real se puede destruir"; la línea nombra los dos pines y el voltaje; 0,5 V es solo un piso de ruido, ninguna hoja de datos lo da); módulos de sensores sobre su cifra. Los umbrales están en un solo sitio: `REVERSE_LIMITS` en `src/sim/models.js` |
| `SIM_RELAY_UNDERDRIVEN` | un relé cuya bobina lleva más que su corriente de suelta y menos que la de cierre, con la armadura en reposo: lo manejan, pero no cierra. No es daño: `checkHazards` lo devuelve en `doubts` (con el estado donde se halló), `simulate` en sus notas |
| `SIM_CAP_REVERSED`, `SIM_CAP_OVER_VOLTAGE` | un electrolítico al revés; cualquier capacitor por encima de su voltaje |
| `SIM_SUPPLY_LIMITED` | una fuente de banco en su límite de corriente (corriente constante) |
| `SIM_SHORT_CIRCUIT` | una fuente sin límite que entrega más de 3 A; una batería cuya carga es de menos de medio ohmio |
| `SIM_BATTERY_OFF`, `SIM_BATTERY_CHARGING`, `SIM_BATTERY_REVERSE` | una batería apagada; corriente que entra en ella (aviso fuerte si es alcalina, que no se recarga) |
| `SIM_REG_DROPOUT`, `SIM_REG_HOT` | un regulador sin voltaje de entrada suficiente para regular; disipando más de lo que aguanta un TO-220 sin disipador (2 W) |
| `SIM_BUZZER_DC` | corriente continua por un zumbador pasivo (el activo suena con continua: no le aplica) |
| `SIM_RELAY_COIL`, `SIM_RELAY_KICK` | la bobina de un relé con más de su 120 % (6 V); su bobina cortada sin nada en paralelo, con el voltaje invertido muy por encima de la fuente (un diodo en paralelo con la bobina lo limita a cerca de 1 V) |
| `SIM_MOTOR_VOLTAGE`, `SIM_MOTOR_STALL` | un motor DC sobre el tope de su rango de voltaje; frenado por su carga, tomando su corriente de bloqueo |
| `SIM_FLOATING` | grupos sin camino de corriente continua hasta la fuente (por ejemplo, la compuerta de un MOSFET sin conectar) |
| `SIM_PIN_OVERVOLTAGE`, `SIM_PIN_UNKNOWN`, `SIM_PIN_STATE`, `SIM_PIN_INPUT_ONLY` | un pin de un microcontrolador fuera de su riel (diodos de protección conduciendo), en un estado de CC de la revisión (lo más alto que llega allí) o en un momento de la ejecución de la revisión, con ese tiempo (el eco de 5 V de un HC-SR04 en un pin de un ESP32, bajo en reposo; `variant: 'run'`); una entrada de `io` que no nombra un GPIO conectado, un estado que no conoce o una salida en un pin que solo puede ser entrada |
| `SIM_IC_SUPPLY` | un chip alimentado por encima de su máximo (555: 16 V; LM358: 32 V; 741: 36 V en total) |
| `SIM_IC_INPUT_OPEN`, `SIM_IC_INPUT_LEVEL` (y `SIM_IC_SUPPLY_RANGE`) | un chip lógico (74HC595, CD4017) alimentado por debajo de su mínimo (2 V; 3 V: `SIM_IC_SUPPLY_RANGE`); una entrada suya al aire (no está definida en un chip real: el kit la toma como baja y lo dice); una entrada que queda entre sus niveles bajo y alto (0,3 y 0,7 de su alimentación): un pin de 3,3 V en un chip a 5 V nunca lee alto |
| `SIM_UNSUPPORTED`, `SIM_DEFAULT_MODEL` | un componente que todavía no se simula (el adaptador DESPI-C02), o una referencia sin modelo propio |

`review` corre este mismo análisis en DC y lista como **peligro** (`hazards`) cada esfuerzo que pasa
su límite (los códigos que nombran un componente y un máximo: `SIM_OVER_CURRENT`, `SIM_OVER_POWER`,
`SIM_REVERSE_VOLTAGE`, `SIM_IC_SUPPLY`, …; no los de la fuente, nodos flotantes ni notas): el veredicto
pasa a APROBADO CON AVISOS, sin bloquear, y `layout` termina en `STATUS: WARNINGS`. Lee el punto en DC
en reposo y otra vez en cada uno de estos estados, uno a la vez y todo lo demás en reposo
(`src/sim/index.js`, `checkHazards`):

- **Cada control que el estudiante mueve con la mano**: un pulsador (o el de un codificador rotatorio)
  oprimido, un interruptor en su otra posición (uno basculante, un botón con enclavamiento, uno
  deslizante, uno de inclinación inclinado), un potenciómetro o un trimmer en cada extremo de su
  recorrido.
- **Cada campo del ambiente que sigue un sensor, abajo y arriba de su rango** (el `range` del
  circuito para él, si no el del registro), un campo a la vez: un circuito que funciona a mitad
  del rango puede dejar de funcionar a oscuras o con calor. Una fuente de banco con `voltage`
  negativo es la misma fuente al revés, así que lo que alimenta al revés se juzga con la regla de
  arriba. Una línea de daño termina diciendo qué le pasa a ese tipo de pieza (se quema, se
  recalienta, el pin se puede dañar…), y un arreglo calculado deja el LED encendido y el motor por
  encima del piso de su rango de voltaje, o el kit dice que no lo tiene.
- Límite, tal como está hoy: una pieza con pines sin conectar la saltan los límites, así que un 555
  suelto con la alimentación invertida y los demás pines al aire no se marca. Un relé con menos de un
  cuarto de su corriente de cierre tiene una fuga, no un manejo, y no se avisa; si el aviso sale en
  varios estados, se da el de mayor corriente de bobina, con su estado.
- **Cada salida del programa de una placa puesta en alto** (desde el 2026-11-16): los pines que el
  programa ya volvió salidas cuando espera por primera vez (su `setup()` y su `loop()` hasta el primer
  `delay`: los modos de pin del punto en DC, así que `pinMode`, y los `digitalWrite`, `tone`,
  `analogWrite` y `ledcWrite` que vuelven salida un pin ahí). Cada uno se sostiene en alto con
  `engine.drive` mientras el programa sigue corriendo; un pin que ya está en alto en reposo no agrega
  nada. El aviso nombra el pin de la placa (`U1.D10`). Cuando el programa corre, los estados son en
  cambio las combinaciones de sus salidas que vio la ejecución de la revisión (cada una una vez, las
  altas en alto y el resto en bajo: `… con D2 + D5 en alto`), así que un sketch que nunca sube dos
  pines a la vez nunca se juzga con los dos juntos; la línea Revisado ya no lista entonces las
  combinaciones de salidas del programa como no revisadas. Sin programa, o si no puede correr, cada
  salida sola como arriba.

Un peligro que solo aparece en uno de esos estados dice en cuál (`… más que su máximo de 30 mA, con S1
oprimido.`, `… con D10 en alto.`; en JSON `hazards[].when: { part, field, value }` o `{ part, pin, name,
value: 1 }`); uno que ya está en reposo se lista una sola vez, en reposo. Medido en una placa que
parpadea dos LED y hace sonar un zumbador (tres salidas, dos puestas en alto): la revisión tardaba
16,0 ms y tarda 16,5 ms con los estados del programa (casi todo es compilar el circuito).

### El arreglo

Para cada circuito con peligros, el kit calcula con su propio simulador el cambio más simple que
quita **todos** los peligros en **todos** los estados de arriba, y lo dice como información; no
cambia nada (`src/fix.js`):

```text
Para arreglarlo: una resistencia de 200 Ω en serie con BZ1 deja el pin D10 de U1 en 19,4 mA (máximo 40 mA).
Para arreglarlo: R1 = 360 Ω deja a R1 en 140 mW (máximo 250 mW) y a D1 en 19,7 mA (máximo 30 mA).
El kit no tiene un arreglo calculado para esto.
```

- **Un componente al revés se voltea.** Para un peligro de voltaje inverso los candidatos son el
  componente con sus dos patas intercambiadas (`Para arreglarlo: voltea BZ1 (intercambia su 1 y su 2)`),
  y luego cada fuente o batería con sus cables intercambiados (`Para arreglarlo: intercambia los
  cables de BT1 (su + y su −)`), el primero que quita todos los peligros en todos los estados
  (`fix.kind` `swap` o `swap-supply`). Nunca se ofrece una resistencia en serie para un peligro
  inverso (solo silencia un zumbador): si ningún intercambio lo quita, el kit no tiene arreglo calculado.
- **Candidatos, en este orden**, gana el primero que lo quita todo: (1) un valor nuevo para una
  resistencia que ya está en serie con el componente forzado o su rama (el mismo componente si es una
  resistencia), (2) una resistencia nueva en serie con el componente forzado, o con cada carga del pin
  de una placa, o con el pin mismo. A lo sumo seis candidatos.
- **El valor** se busca en E24 de 10 Ω a 1 MΩ con el mismo barrido del solucionador de metas
  (`sweepResistor` en `src/recipes/solve.js`, la resistencia cambiada en su lugar). Apunta la magnitud
  forzada al **valor nominal** del componente si lo tiene (los 20 mA de un LED) y si no a **la mitad de
  su máximo** (los 40 mA de un pin → 20 mA, los 250 mW de una resistencia → 125 mW): el nominal es
  aquello a lo que el componente debe trabajar, y la mitad del máximo absoluto es el margen usual de
  uno que no lo tiene (un pin de microcontrolador «pensado para dar unos 20 mA»). Se elige el
  resultado más cercano en o bajo esa meta que quite todos los peligros; si el más cercano no lo hace
  (la resistencia agregada se recalentaría, o el daño pasa a otro componente), se prueban los valores
  siguientes hacia abajo por bisección. La meta la pone un peligro de otro componente que la
  resistencia que se cambia (la corriente de un LED, no la potencia de su propia resistencia).
- **Una resistencia que no está puesta**: el candidato (2) se prueba en el circuito compilado, no en
  el montaje: el pin se separa de su red y una resistencia de ¼ W las une, así que también se juzga su
  propia potencia. Un cambio que solo mueve el daño a otro lado no es un arreglo.
- **Una línea por circuito**: varios peligros con una causa dan un arreglo; si ninguna resistencia sola
  los quita todos, la frase fija «El kit no tiene un arreglo calculado para esto.» (en inglés: «The kit
  has no computed fix for this.»), la señal de que un asistente queda por su cuenta (y debe ensayar su
  idea con `layout --dry-run` antes de que llegue al circuito). Ejemplo: un condensador de 16 V
  directo sobre 25 V (en DC no pasa corriente, así que ninguna resistencia en serie cambia su voltaje).
- **JSON**: en la revisión, `fix: { kind: 'set', part, value, brings }` o `{ kind: 'add-series', with,
  pin, value, brings }` (`brings: [{ part, quantity, value, max, unit, when? }]`: la magnitud de cada
  peligro con el arreglo, en el estado en que se encontró), o `fix: null` con `noFix: true`. `layout`
  lo calcula una vez, sobre el circuito que guarda (no en cada intento).
- **Costo**: medido, 82 ms en el circuito del zumbador de arriba, 10 ms en un LED pedido a 50 mA,
  105 ms en un zumbador sobre 5 V a través de un transistor; solo para un circuito con peligros.
- **Se aplica solo si se pide**: `layout <objetivo> --fix` (en la herramienta MCP `fix: true`) vuelve
  a montar un circuito hecho con `layout` con su arreglo calculado, como una revisión, y lo dice
  (`Arreglo aplicado: R3 = 200 Ω en serie con BZ1.`, o para un componente al revés `Arreglo
  aplicado: BZ1 volteado (su 1 y su 2 intercambiados).`); nada más lo aplica
  ([montaje-automatico.md](montaje-automatico.md#volver-a-montar-un-circuito-que-ya-existe-desde-el-2026-10-20)).

### Lo que no pudo saber (dudas)

Un peligro es un componente que el kit ve quemarse. Una **duda** es algo que el kit no puede
garantizar, así que no puede decir que el circuito funciona: lo que no pudo comprobar en absoluto
(un componente sin modelo, un programa que no puede correr) o lo que comprobó y encontró que puede
no funcionar (un relé que puede no cerrar, un pulsador entre patas unidas): la revisión las lista en
`doubts` (con la misma forma que los peligros: `{ severity: 'warning', code, params, parts }`), basta
una para que el veredicto sea APROBADO CON AVISOS y `layout` termine en `STATUS: WARNINGS`, y ambos
las imprimen como líneas `⚠` bajo su propio encabezado (`El kit no puede confirmar que esto funcione …`), después
de los peligros (`src/sim/index.js`, `doubtsOf`). Nunca bloquean. `DONE` significa entonces lo que
dice: el kit revisó el circuito y no encontró nada que decir.

- Hallazgos del cableado que el kit reporta y nunca bloquea (`DOUBT_CODES` en
  `src/circuit/checks.js`): `BUTTON_PINS_JOINED`, un pulsador cuyos dos pines de un mismo lado (una
  sola pieza de metal) llevan dos redes distintas, así que oprimirlo no cambia nada. `check` lo lista
  como aviso; `apply` guarda un cambio que lo agrega y lo marca con ⚠. `COIL_NO_FLYBACK`, la bobina de
  un relé o un motor conmutados por el colector de un transistor, el drenador de un MOSFET o un pin de
  una placa sin un diodo en el nodo que corta el interruptor (en paralelo con la bobina, o hacia un
  riel como en un puente H): el interruptor se puede dañar al apagarse. Un motor en un interruptor
  simple o directo en una fuente no tiene interruptor que dañar.
  `SUPPLY_PINS_UNWIRED`, un componente conectado al circuito cuyas patas de alimentación no están
  conectadas las dos a algo, o están en una misma red (un LM358 con VCC y GND sueltos, un 555 con
  todas las patas en una red): no puede funcionar. Las patas de alimentación son las del propio
  componente: el `supply` de su modelo, o si no las que el kit lee por su nombre como alimentación
  positiva y tierra (VCC, VDD, V+… y GND, VSS…); una placa de desarrollo (5V, 3V3, su USB) y un
  componente que no está conectado a nada no se juzgan.
- `SIM_PART_NOT_SIMULATED`: un componente conectado al circuito sin modelo de simulación (un
  adaptador DESPI-C02, hoy el único; `catalog` lo marca): se dibuja y sus pines quedan abiertos, así
  que lo que hace, y lo que maneja, no se sabe. Las salidas que cuelgan de él se nombran en su línea
  (`así que el kit no puede decir qué hace U2 ni qué hacen D1, D2, D3, que dependen de él`): una
  salida cuyos pines llegan a un pin de ese componente por donde pasa corriente (resistencias,
  cables, interruptores, transistores, relés), no por un riel ni por otro chip (`hangingOutputs` en
  `src/sim/index.js`). Esas salidas no reciben `SIM_OUTPUT_NEVER_ON`: el kit no puede juzgarlas. Un
  componente sin conectar a nada no es una duda.
- `SIM_OUTPUT_NEVER_ON`: un componente cuyo trabajo es mostrar o mover algo (un LED, un chip de un
  LED RGB, un segmento de un display, un zumbador, un relé, un motor, un láser), conectado a un
  circuito con fuente, que está apagado en todos los estados que visita el kit: en reposo, con cada
  control, en cada extremo del ambiente, con cada salida del programa, luego cada campo de un
  ambiente declarado y cada control que ofrece la página, y una ejecución (los primeros 2 s cuando el
  circuito cambia solo, y después cada uno de esos estados sostenido 0,5 s y soltado). Con una salida
  todavía apagada y una oscilación lenta (un 555 a 0,3 Hz que da el reloj a un CD4017), la primera parte
  crece hasta dos periodos de ella (tomados como 4 veces la constante de tiempo más larga por debajo de
  30 s) y se duplica mientras sigan encendiéndose salidas tarde en ella, hasta 30 s; si ese límite, o
  los pasos o el tiempo de la corrida, llegan primero, el kit no puede saberlo: no hay duda, y la línea
  Checked dice `si cada salida se enciende (la corrida fue demasiado corta para saberlo)` (`short-run`). Los
  componentes que nunca se encienden son una sola duda (`D1, D2 nunca se encienden`); un chip o
  segmento que nunca enciende mientras los demás sí se nombra (`DS1: dp`); un relé dice lo más que
  recibió su bobina y la corriente de cierre que necesita (una bobina alimentada desde la salida de
  un módulo sensor: 3,2 mA de 53,6 mA). Un relé manejado por encima de la cuarta parte de su
  corriente de cierre que no cierra es `SIM_RELAY_UNDERDRIVEN`. Un zumbador pasivo que nunca se oye
  (con corriente continua, o sin ninguna) es `BZ1 nunca suena` (`variant: 'passive'`): suena solo con
  una corriente que cambia. No se dice cuando el programa de la
  placa no se puede correr tal como está escrito (su propia duda lo dice). Las dos cifras de la
  ejecución son supuestas (`src/sim/index.js`).
- Todo aviso sobre el programa de una placa: el archivo no encontrado (`SIM_PROGRAM_FILE`, que dice
  la carpeta donde buscó el kit: la del circuito, junto a `circuit.json`), fuera de la carpeta,
  demasiado grande, un error de sintaxis con su línea, una llamada que el simulador no conoce
  (`analogReference()`), una librería o una clase que no está en el kit, sin `setup()`/`loop()`
  (`SIM_PROGRAM_IGNORED` sigue siendo una nota). También `SIM_PROGRAM_STOPPED`, un programa que se
  detuvo con un error en reposo, y `SIM_PROGRAM_STUCK`, un programa que nunca deja pasar el tiempo:
  `setup()` o una llamada de `loop()` que nunca vuelve y nunca espera (`void loop() { while (1) {} }`).
  Lo dice el propio ejecutor del programa (`stuck`, `src/sim/program.js`): 200 000 vueltas de un
  bucle dentro de una sola llamada sin que pase el tiempo para el programa, contadas a lo largo de los
  pasos (en t = 0 un avance puede darlas todas), así que un bucle largo que termina no está atascado;
  un `loop()` que vuelve sin `delay()` es un programa que funciona. La salida por Serial toma tiempo a
  la velocidad que dio `Serial.begin` (diez bits por carácter; el programa espera cuando su búfer de
  envío, 64 bytes en un UNO y 128 en un ESP32, se llena), así que un bucle que imprime 100 000 líneas
  deja pasar el tiempo como en una placa y no está atascado.
- Cualquier otro aviso o error que dé la simulación en reposo o en uno de los estados de arriba (con
  su `when`) que no sea un peligro ni esté ya bloqueando: ningún aviso que imprima el simulador puede
  quedar invisible para `layout`. `SIM_FLOATING` lo es solo cuando en los nodos flotantes hay un
  componente simulado conectado al circuito por otra pata (la compuerta de un MOSFET al aire); los
  nodos por fuera del circuito (componentes sin conectar a nada, lo que solo toca un componente sin
  simular) no.
- Un circuito con fuente cuyo punto en DC no se resuelve (`SIM_NO_CONVERGENCE`) o cuya fuente no es
  válida (`SIM_BAD_SUPPLY`). Un circuito sin ninguna fuente no es una duda: su línea Revisado dice que
  no se pudo simular nada.

### Lo que no revisa

Después de los peligros, la revisión y `layout` (cuando el circuito quedó armado) imprimen una línea
con lo que la revisión cubrió y lo que no, para este circuito (`Revisado: en reposo, 3 salidas del
programa. No revisado: picos al conmutar, combinaciones de salidas del programa.`; JSON `checked: {
rest, controls, outputs, notChecked: [código…], skipped?, unsimulated?, programs? }`). Los códigos, solo los que
aplican:

- `switching`, **picos al conmutar** (el programa de una placa, un 555, un generador): un pin PWM, un
  tono, la salida de un 555 o una onda del generador se juzgan en su punto en DC; los picos que muestra
  un transitorio no se encuentran.
- `combinations`, **combinaciones** de controles y salidas (dos pulsadores oprimidos a la vez, dos pines
  en alto a la vez), cuando hay dos o más: se mueve uno a la vez.
- `environment`, **lo que los sensores leen del ambiente** (luz, temperatura, movimiento, toque, el
  trimmer de un módulo…): se leen como el circuito los deja, con el `environment` del circuito o con un
  valor propio del componente (la `light` de una LDR). Otros deslizadores (el de una
  resistencia, la carga de un motor) y los controles de las fuentes también.
- `limit`, **estados pasado el límite**: a lo sumo 24 (primero los controles, en el orden de los
  componentes, luego los pines); la revisión también dice cuántos revisó (`Estados revisados por daño:
  24 de 30 …`; JSON `hazardStates: { checked, total, controls, outputs }`).
- `unsimulated`, **componentes dibujados pero no simulados** (`SIM_UNSUPPORTED`; cada uno también es una duda).
- `short-run`, **si cada salida se enciende**: la corrida de la revisión llegó a su límite antes de que una oscilación lenta las encendiera (ver `SIM_OUTPUT_NEVER_ON`).
- `program`, **el programa de una placa donde el kit no puede correrlo** (JSON `programs`: las placas
  con una duda de programa).
- `no-source` / `no-simulation`, **no se pudo simular nada** (no hay fuente, u otra razón que dicen los
  avisos del simulador).
- Un pin que el programa vuelve salida después de su primera espera (sin `pinMode` en `setup()`) no
  está en los estados.

Si no queda nada: `No revisado: nada que aplique a este circuito.`

## Modelos

Todos en `src/sim/models.js`, cada uno comprobado una vez en `test/sim.test.js` contra una
referencia independiente (una fórmula de libro resuelta aparte, o el dato de la hoja de datos).

| Componente | Modelo | Referencia en las pruebas |
|---|---|---|
| cable | 0,05 Ω (cable y dos contactos) | — |
| resistencia, potenciómetro | ley de Ohm; cursor: R(1–W) = posición · R | divisor, serie y paralelo |
| pulsador | 0,1 Ω presionado; los pares siempre unidos | el LED prende solo mientras se presiona |
| interruptor (KCD1, enclavamiento 7 × 7) | cada contacto cerrado en su posición, 50 mΩ / 0,1 Ω; los abiertos no están; esfuerzo por encima de 3 A / 100 mA | ley de Ohm por el contacto; NC y NO se intercambian |
| capacitor | abierto en DC; Euler implícito en el transitorio | V·(1 − e^(−t/RC)) |
| diodo | Shockley + resistencia en serie, según la referencia | Vf de la hoja de datos |
| diodo Zener | el diodo más una ruptura en inversa: rodilla suave por debajo de unos 5,5 V (efecto Zener) y brusca por encima (avalancha), detrás de parte de Zzt; exactamente Vz con la corriente de prueba Izt (tabla de los 1N47xxA) | 1N4733A: 5,1 V a 49 mA |
| puente rectificador | cuatro diodos (AC1 y AC2 suben a +, − sube a cada una), Shockley + resistencia en serie, cerca de 1,0 V cada uno a la corriente nominal (KBP2xx 2 A, KBP3xx 3 A) | la misma polaridad de salida al invertir la entrada; Kirchhoff en sus patas |
| regulador | salida = referencia + su voltaje (GND + 5 V en un 7805, ADJ + 1,25 V en un LM317), o unos 2 V por debajo de la entrada si esta no alcanza (1,1 V en el AMS1117); su corriente propia (5 mA; 50 µA por ADJ); en el módulo AMS1117, el LED de encendido con su resistencia de OUT a GND, contado en lo que consume; su entrada máxima absoluta: 35 V del 7805 al 7818, 40 V el 7824, 40 V de entrada a salida el LM317, 15 V el AMS1117 | 7805 con 9 V; fórmula del LM317 con Iadj; salida y caída del AMS1117 según su hoja de datos |
| placa con microcontrolador (ESP32 DevKit, ESP32-C3, UNO) | cada GPIO en su estado de `io`: una salida es el riel lógico o tierra tras 17 Ω (ESP32) o 40 Ω (UNO), una entrada no toma corriente y puede tener un pull de 45 kΩ / 35 kΩ; diodos de protección al riel y a tierra; con USB, una fuente de 5 V con su regulador de 3,3 V y el consumo propio del chip ([microcontroladores.md](microcontroladores.md)) | VOH = VDD − I·R; corriente del pull-up; 5 V en un pin del ESP32 |
| amplificador operacional (LM358, LM324, µA741, NE5532) | de comportamiento, DC y baja frecuencia (sin ancho de banda ni velocidad de subida): salida = ganancia·(V+ − V−) centrada en la mitad de la fuente, limitada con suavidad entre swingLow por encima de la fuente negativa y swingHigh por debajo de la positiva (LM358: 5 mV y 1,5 V; 741: 2 V cada uno), detrás de su resistencia de salida; corriente desde la pata positiva cuando entrega y hacia la negativa cuando recibe; las entradas no toman corriente; un amplificador sin nada conectado se deja fuera; límites: fuente total, corriente de salida (cortocircuito), potencia | no inversor 1 + R2/R1 e inversor −R2/R1 con menos de 1 mV de error; seguidor; VOH = VCC − 1,5 V, VOL de pocos mV |
| comparador (LM393) | colector abierto: OUT unido a la fuente negativa por 60 Ω mientras V− > V+, abierto si no (necesita un pull-up) | estados activo y abierto, el LED que maneja |
| temporizador NE555 | de comportamiento: su divisor de 5 kΩ pone CTRL en 2/3 de VCC; THR por encima de CTRL desactiva el biestable (salida baja, descarga activa), TRIG por debajo de CTRL/2 lo activa, RESET por debajo de 0,7 V lo mantiene en bajo; el biestable cambia entre pasos de tiempo; salida alta unos 0,9 V por debajo de VCC tras 8 Ω, baja tras 7,5 Ω; descarga 18 Ω; consumo propio 3 mA a 5 V; límites 16 V, 200 mA, 600 mW. En DC muestra su estado al encender (salida alta): un astable solo oscila en un transitorio o en la página en vivo | astable: f = 1,44 / ((R1 + 2·R2)·C) con 4 % de margen y su ciclo útil; la tabla de verdad del biestable |
| registro de desplazamiento 74HC595 | lógica: el flanco de subida de SRCLK desplaza y mete SER en la etapa de QA, SRCLR en bajo borra el registro, el flanco de subida de RCLK lo copia a los latches (los dos en el mismo instante: los latches reciben el registro de antes del desplazamiento), OE en alto deja QA…QH abiertas, QH' sigue la última etapa del registro; entradas altas sobre 0,7·VCC y bajas bajo 0,3·VCC, que conservan su nivel en medio; oye cada cambio de un pin de una placa en orden (un `shiftOut` no toma tiempo simulado) y, en una cadena, la entrada del chip siguiente después del flanco compartido; salidas de 30 Ω a VCC y 25 Ω a GND (VOH 4,32 V / VOL 0,15 V a 6 mA, 4,5 V); consumo propio 8 µA a 6 V; ceros al encender (los de un chip real no están definidos); límites 6 V, ±35 mA por salida, 70 mA por VCC o GND, 750 mW; una entrada al aire se toma como baja y se avisa (NXP 74HC595) | MSBFIRST pone el bit 7 en QH; lo contrario con LSBFIRST; la corriente de un LED por la ley de mallas con 330 Ω + 30 Ω; dos encadenados; OE, SRCLR; un pin de 3,3 V en un chip a 5 V avisado |
| contador de décadas CD4017 | lógica: el flanco de subida de CLK con CE en bajo avanza la cuenta (también el flanco de bajada de CE con CLK en alto), MR en alto la reinicia de inmediato; una de Q0…Q9 en alto, CO en alto en las cuentas 0–4; una Qn en MR cuenta hasta n (un paso de tiempo después); entradas como las del 74HC595 (el Schmitt del reloj); salidas de unos 400 Ω cerca del riel a 5 V, 192 Ω a 10 V, 221 Ω a 15 V (interpoladas), que se quedan en 3,35 mA a 5 V (IOH 3,2 mA a 2,5 V) y crecen como (VDD − 1,5 V)² por encima [supuesto]; límites 15 V, 100 mW por transistor de salida, 500 mW; cuenta 0 al encender; los pulsadores del kit no rebotan (TI CD4017B) | un LED sin resistencia a 5 V por la fórmula de la salida (unos 3,3 mA); el orden y el periodo de una carrera con un 555; pulsaciones contadas; CE y MR fijos |
| inductor | resistencia del alambre en serie; un corto en DC, Euler implícito en el transitorio | RL: I·(1 − e^(−t/τ)) |
| termistor, fotorresistencia | resistencias cuyo valor sale de la temperatura (ecuación B) o de la luz (curva GL55) | ecuación B a 50 °C; GL5528 a 10 lx |
| zumbador | su bobina, 16 Ω | — |
| zumbador activo (TMB12A05) | una carga que casi no toma nada bajo 1,5 V, sube suave hasta 5 V / 30 mA = 167 Ω a los 2,0 V y se queda ahí; suena (2,3 kHz, unos 85 − 40·log10(5/V) dB a 10 cm) desde 2,0 V entre sus pines, de + a −, sin histéresis; al revés son 100 kΩ, en silencio, y avisa por encima de 1 V; sobre 7,5 V `SIM_IC_SUPPLY`, sobre 35 mA (desde unos 5,8 V) el aviso `SIM_BUZZER_CURRENT` | 30 mA a 5 V, 19,8 mA y sonando con 3,3 V; en silencio y bajo 1 mA a 1 V |
| sensor Hall lineal 49E | una fuente de Vs/2 + 1,4 mV/G · (Vs/5) · campo mantenida en [0,95 V, Vs − 0,95 V] tras 50 Ω, 6 mA de la alimentación; esfuerzos: alimentación sobre 8 V o invertida; avisos: bajo 2,7 V, más de 1,5 mA de salida | 2,500 / 2,640 / 2,360 V a 0 / +100 / −100 G y 5 V; 1,742 V a +100 G y 3,3 V; 4,05 V en el tope |
| módulo sensor de voltaje | 30 kΩ de VIN a S y 7,5 kΩ de S a GND, un miliohmio que une − y GND; esfuerzo: la de 30 kΩ sobre 100 mW | S = 2,40 V y 0,32 mA con 12 V de entrada |
| LED | Shockley + 10 Ω, Vf a 20 mA según el color; `"model": { "vf": 2.95 }` lo cambia | ecuación de la malla resuelta aparte |
| LED RGB, display de 7 segmentos | un LED por chip entre su pata y la común (cátodo o ánodo), cada uno con su hoja de datos: RGB (YSL-R596CR3G4B5C-C10) rojo 2,0 V, verde y azul 3,2 V a 20 mA, 20 mA cada uno; segmentos del 5161AS / 5161BS 2,1 V a 20 mA, 20 mA y 40 mW cada uno; las dos patas comunes del display unidas por 0,05 Ω; esfuerzos por chip, con el nombre de su pata (`D1.R`); `"model": { "R": { "vf": 1.9 } }` cambia un chip | el Vf de cada chip a 20 mA según su hoja de datos; la común por cualquiera de sus patas |
| interruptor deslizante, de inclinación | como un interruptor: el contacto que cierra su posición es su resistencia (SS-12D00 30 mΩ; SW-520D 10 Ω, el límite de la hoja), el abierto no está; esfuerzos: corriente (0,3 A; 25 mA) y el voltaje que sostiene un contacto abierto (30 V; 12 V) | caída del contacto I·R; la posición abierta no lleva nada |
| relé (SRD-05VDC-SL-C) | su bobina de 70 Ω en serie con 0,1 H (cifra del kit: la hoja de datos no la da) y 10 kΩ en paralelo (sus pérdidas, cifra del kit: acotan el pico de una bobina sin diodo a cerca de I·R, 0,7 kV), y una armadura con histéresis que se activa al 75 % de 5 V (53,6 mA) y se suelta bajo el 10 % (7,1 mA), y cambia entre pasos de tiempo 5 ms (al activarse) o 2 ms (al soltarse) después de que su corriente cruzó el umbral (el recorrido del kit, dentro de los 10 ms y 5 ms de la hoja de datos); contacto de 0,1 Ω cerrado, 100 MΩ abierto (hoja de datos Songle SRD); esfuerzos: el I·R de la bobina sobre 6 V, un contacto sobre 10 A, el pico (una bobina cortada sin nada en paralelo, invertida más allá de 5 V) | 71 mA a 5 V; tiempo de activación τ·ln(I∞ / (I∞ − Iact)) + 5 ms; se mantiene entre los umbrales; el pico sin diodo, cerca de 1 V con un 1N4007 |
| motor DC (RE-140RA) | V = R·I + L·dI/dt + k·ω y J·dω/dt = k·I − b·ω − T_carga como elementos MNA: una resistencia, un inductor y un girador ideal cuyo otro lado es el eje, un nodo cuyo voltaje es ω, con J como un condensador y b como una conductancia a tierra y la carga como un freno (un par contra el giro, tanh de ω sobre 1 rad/s); R, k y b del punto sin carga y la corriente de bloqueo de la hoja de datos a su voltaje nominal (RE-140RA-12240: 7,69 Ω, 5,20 mV·s/rad, 0,518 µN·m·s), J de 1 g·cm² y L de 1 mH cifras del kit (hoja de datos Mabuchi RE-140RA); esfuerzos: voltaje sobre el tope de su rango, un bloqueo (frenado por su carga) sobre su corriente de máxima eficiencia | 4800 r/min y 50 mA libre a 3 V, 0,39 A bloqueado; el arranque contra la solución de dos polos resuelta aparte, τ = J·R / (k² + R·b) ≈ 25 ms |
| LM35 | una fuente de comportamiento: 10 mV/°C · T (nunca bajo 0 V) tras 0,4 Ω (regulación de carga 0,4 mV/mA) mientras +VS le deje 1,5 V (cifra del kit), 56 µA propios desde +VS (TI SNIS159H); esfuerzos: alimentación sobre 30 V o invertida, salida sobre 10 mA; notas: alimentación bajo 4 V, una temperatura que su grado no mide | 250 mV a 25 °C dentro de ±1,5 °C (LM35DZ); 56 µA; 0,4 mV a 1 mA |
| MOSFET | ley cuadrática con encendido suave, k a partir de Rds(on) | ley cuadrática resuelta aparte, Rds(on) |
| BJT | Ebers–Moll, β constante; TIP120 como Darlington con sus dos resistencias; `off` solo cuando su base está bajo el umbral y no lleva más de 10 µA (un Darlington a 0,9 V que lleva 1,7 mA está `active`; un MOSFET igual, `saturation`) | Ebers–Moll resuelto aparte; hFE ≥ 1000 |
| fuente de banco, batería | fuente ideal, límite opcional; batería: fem según formato, química, celdas y carga, detrás de su resistencia interna | cortocircuito, ley de Ohm con la resistencia interna |
| arreglo Darlington (ULN2003, ULN2803) | cada canal como lo dibuja la hoja de datos de TI: IN por 2,7 kΩ a un par Darlington (Ebers–Moll, β 50 cada uno, 7,2 kΩ y 3 kΩ a GND) cuyos colectores son OUT a través de 1 Ω, y un diodo de protección de OUT a COM (1,7 V a 350 mA); una entrada al aire queda apagada; un canal sin nada conectado se deja fuera; esfuerzos por canal (con nombre `U1.OUT1`): 500 mA, 50 V en OUT, 30 V en IN, los 500 mA del diodo; 2,5 A por GND; 1,8 W (cifra del kit para un DIP); con COM en la alimentación de la bobina, la revisión de diodo de protección lo cuenta como el diodo | VCE(sat) 0,9, 1,0, 1,2 V a 100, 200, 350 mA; enciende desde unos 2,2 V a 200 mA (VI(on) de la hoja de datos bajo 2,4 V) |
| optoacoplador (PC817) | el LED infrarrojo (Shockley, 1,2 V a 20 mA) y un fototransistor (Ebers–Moll) cuya base recibe una corriente de CTR·I_F / (β + 1), así que el colector toma el 170 % de la corriente del LED (el medio, en escala logarítmica, del 50 % al 600 % de la hoja de datos; las piezas reales varían varias veces) hasta saturarse en unos 0,1 V; los dos lados no comparten ningún nodo, cada uno se lee contra su propia tierra; esfuerzos: LED 50 mA, 6 V en inversa, 70 mW; colector 50 mA, 35 V, 6 V en inversa, 150 mW; 200 mW en total (Sharp PC817); sin su velocidad de conmutación | VF 1,2 V a 20 mA; Ic / I_F = 1,7 en activa; bajo 0,5 V saturado |
| amplificador de audio (LM386) | el lazo de ganancia de la hoja de datos de TI: IN+ − IN− sobre 150 Ω en serie con los 1,35 kΩ entre las patas 1 y 8 (y lo que haya entre ellas), su corriente por 2 · 15 kΩ: ganancia 20 al aire, unos 200 con 10 µF entre las patas 1 y 8; la salida en la mitad de la alimentación, recortada suavemente a 1 V de cada riel (0,2 V de ancho: un recorte brusco traba un transitorio), tras 0,25 Ω con un límite suave de 1 A (cifras del kit); entradas de 50 kΩ a GND; 4 mA propios; BYPASS en la mitad de la alimentación; esfuerzos: 15 V de alimentación, ±0,4 V en una entrada, 1,25 W; una duda fuera de 4–12 V; sin su ancho de banda, la distorsión ni el refuerzo de graves de la pata 1 a la 5 | 4,5 V en reposo con 9 V; 1,0 V de pico con 50 mV (ganancia 20), unos 0,9 V con 5 mV y 10 µF (180 a 1 kHz), 38 con 1,2 kΩ en serie |

Cualquier campo del modelo se puede cambiar por componente con `"model": { … }` (por ejemplo, el
voltaje directo de un LED medido en el banco).

## Todavía no

Todos los chips del kit se simulan (el 555, los amplificadores operacionales, el LM393, el 74HC595, el
CD4017, los arreglos ULN, el PC817 y el LM386); el adaptador DESPI-C02 queda sin conectar y se avisa; una placa con
microcontrolador corre su programa (`"program"`, con PWM y `tone`;
[microcontroladores.md](microcontroladores.md)). Los amplificadores operacionales todavía no
tienen ancho de banda ni velocidad de subida: una señal rápida sale como si el chip fuera ideal (un oscilador de relajación con realimentación positiva sí corre: Newton se detiene en los bordes del rango lineal a lo sumo dos veces por cálculo, así cambia de riel; uno con un LM358, 47 kΩ y 10 nF oscila a unos 920 Hz, y la fórmula de libro da 968 Hz con rieles ideales). El 555 todavía no tiene recorridos en la vista de conductores: su corriente
se ve en sus patas y sus tiras. Los eventos en un momento dado son para una ejecución (`--press`, `--at`), no para `--transient`; no hay
autocalentamiento, ni descarga de la batería con el tiempo (`charge` es fija en cada cálculo).
La animación (etapa 3) leerá estos mismos resultados.
