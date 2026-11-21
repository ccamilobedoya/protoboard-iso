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
  corre la página, desde el encendido (como empieza la página: su punto de DC, o los capacitores
  descargados con `page.start: "zero"`), durante esos segundos simulados: el mismo motor y el
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
    sobre 30 r/min, un pin o la salida de un amplificador sobre la mitad de su riel);
  - **las lecturas al final**, como las imprime el punto de DC, y cada aviso de la ejecución.

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
  pasar el tiempo termina con `SIM_PROGRAM_STUCK`.

  ```text
  $ protoboard-iso simulate alarma --run 1 --env distance=10 --lang es
  Ejecución desde el encendido (como empieza la página) — un modelo, no una medición: 1 s en pasos de 1 ms (1000 pasos).
  Serial (10 líneas, en orden):
    844 µs     10
    …
  Salidas en el tiempo:
    D1 (LED): encendido el 100 % del tiempo · cambios: 1 (encendido 857 µs → 1 s)
    U1.D9 (pin): 9,92 Hz, encendido el < 1 % del tiempo (periodo 101 ms) · cambios: 20
  Lecturas a los 1 s:
  …
  ```

  La respuesta de `layout` trae lo mismo en una línea para un circuito que cambia solo (el
  programa de una placa, un 555, un generador, un amplificador operacional junto a un capacitor):
  `Comportamiento, primeros 2 s (simulado, un modelo): D1 1 Hz, encendido el 50 % del tiempo`, de
  una ejecución acotada a 25 000 pasos de la simulación (así el mismo circuito da la misma línea en
  cualquier máquina; tarda más o menos lo que los 0,8 s de tiempo de la máquina que reemplazó,
  `BEHAVIOUR_STEPS` en `src/sim/run.js`) y un paso no menor que una veinte milésima de ella; pasado
  el límite dice que no se midió (`la ejecución necesitaba más de 25 000 pasos de la simulación`) y
  nombra `simulate --run 2`.

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
{ ok: true, run: { seconds: 1, step: 0.001, steps: 1000, start: 'dc' },
  serial: { count: 10, lines: [{ t: 0.00084, text: '10' }, …] },    // kept: cuando se recorta
  outputs: [{ id: 'D1', kind: 'led', onShare: 0.999, changes: 1, frequency: null, period: null, duty: null,
              intervals: [[0.00086, 1]] }, …],                         // una salida aún encendida cierra al final
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
| `SIM_UNSUPPORTED`, `SIM_DEFAULT_MODEL` | un componente que todavía no se simula (los chips que no son el 555), o una referencia sin modelo propio |

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
  nada. El aviso nombra el pin de la placa (`U1.D10`).

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
  (`Arreglo aplicado: R3 = 200 Ω en serie con BZ1.`); nada más lo aplica
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
  como aviso; `apply` guarda un cambio que lo agrega y lo marca con ⚠.
- `SIM_PART_NOT_SIMULATED`: un componente conectado al circuito sin modelo de simulación (un
  74HC595, un LM386, un CD4017…; `catalog` los marca): se dibuja y sus pines quedan abiertos, así
  que lo que hace, y lo que maneja, no se sabe. Un componente sin conectar a nada no es una duda.
- `SIM_OUTPUT_NEVER_ON`: un componente cuyo trabajo es mostrar o mover algo (un LED, un chip de un
  LED RGB, un segmento de un display, un zumbador, un relé, un motor, un láser), conectado a un
  circuito con fuente, que está apagado en todos los estados que visita el kit: en reposo, con cada
  control, en cada extremo del ambiente, con cada salida del programa, luego cada campo de un
  ambiente declarado y cada control que ofrece la página, y una ejecución (los primeros 2 s cuando el
  circuito cambia solo, y después cada uno de esos estados sostenido 0,5 s y soltado). Los
  componentes que nunca se encienden son una sola duda (`D1, D2 nunca se encienden`); un chip o
  segmento que nunca enciende mientras los demás sí se nombra (`DS1: dp`); un relé dice lo más que
  recibió su bobina y la corriente de cierre que necesita (una bobina alimentada desde la salida de
  un módulo sensor: 3,2 mA de 53,6 mA). Un relé manejado por encima de la cuarta parte de su
  corriente de cierre que no cierra es `SIM_RELAY_UNDERDRIVEN`. No se dice cuando el programa de la
  placa no se puede correr tal como está escrito (su propia duda lo dice). Las dos cifras de la
  ejecución son supuestas (`src/sim/index.js`).
- Todo aviso sobre el programa de una placa: el archivo no encontrado (`SIM_PROGRAM_FILE`, que dice
  la carpeta donde buscó el kit: la del circuito, junto a `circuit.json`), fuera de la carpeta,
  demasiado grande, un error de sintaxis con su línea, una llamada que el simulador no conoce
  (`shiftOut()`), una librería o una clase que no está en el kit, sin `setup()`/`loop()`
  (`SIM_PROGRAM_IGNORED` sigue siendo una nota). También `SIM_PROGRAM_STOPPED`, un programa que se
  detuvo con un error en reposo, y `SIM_PROGRAM_STUCK`, un programa que nunca deja pasar el tiempo:
  `setup()` o una llamada de `loop()` que nunca vuelve y nunca espera (`void loop() { while (1) {} }`).
  Lo dice el propio ejecutor del programa (`stuck`, `src/sim/program.js`): un avance gastó todo su
  presupuesto de pasos dentro de una sola llamada, nunca esperando; un `loop()` que vuelve sin
  `delay()` es un programa que funciona.
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
| regulador | salida = referencia + su voltaje (GND + 5 V en un 7805, ADJ + 1,25 V en un LM317), o unos 2 V por debajo de la entrada si esta no alcanza (1,1 V en el AMS1117); su corriente propia (5 mA; 50 µA por ADJ); en el módulo AMS1117, el LED de encendido con su resistencia de OUT a GND, contado en lo que consume | 7805 con 9 V; fórmula del LM317 con Iadj; salida y caída del AMS1117 según su hoja de datos |
| placa con microcontrolador (ESP32 DevKit, ESP32-C3, UNO) | cada GPIO en su estado de `io`: una salida es el riel lógico o tierra tras 17 Ω (ESP32) o 40 Ω (UNO), una entrada no toma corriente y puede tener un pull de 45 kΩ / 35 kΩ; diodos de protección al riel y a tierra; con USB, una fuente de 5 V con su regulador de 3,3 V y el consumo propio del chip ([microcontroladores.md](microcontroladores.md)) | VOH = VDD − I·R; corriente del pull-up; 5 V en un pin del ESP32 |
| amplificador operacional (LM358, LM324, µA741, NE5532) | de comportamiento, DC y baja frecuencia (sin ancho de banda ni velocidad de subida): salida = ganancia·(V+ − V−) centrada en la mitad de la fuente, limitada con suavidad entre swingLow por encima de la fuente negativa y swingHigh por debajo de la positiva (LM358: 5 mV y 1,5 V; 741: 2 V cada uno), detrás de su resistencia de salida; corriente desde la pata positiva cuando entrega y hacia la negativa cuando recibe; las entradas no toman corriente; un amplificador sin nada conectado se deja fuera; límites: fuente total, corriente de salida (cortocircuito), potencia | no inversor 1 + R2/R1 e inversor −R2/R1 con menos de 1 mV de error; seguidor; VOH = VCC − 1,5 V, VOL de pocos mV |
| comparador (LM393) | colector abierto: OUT unido a la fuente negativa por 60 Ω mientras V− > V+, abierto si no (necesita un pull-up) | estados activo y abierto, el LED que maneja |
| temporizador NE555 | de comportamiento: su divisor de 5 kΩ pone CTRL en 2/3 de VCC; THR por encima de CTRL desactiva el biestable (salida baja, descarga activa), TRIG por debajo de CTRL/2 lo activa, RESET por debajo de 0,7 V lo mantiene en bajo; el biestable cambia entre pasos de tiempo; salida alta unos 0,9 V por debajo de VCC tras 8 Ω, baja tras 7,5 Ω; descarga 18 Ω; consumo propio 3 mA a 5 V; límites 16 V, 200 mA, 600 mW. En DC muestra su estado al encender (salida alta): un astable solo oscila en un transitorio o en la página en vivo | astable: f = 1,44 / ((R1 + 2·R2)·C) con 4 % de margen y su ciclo útil; la tabla de verdad del biestable |
| inductor | resistencia del alambre en serie; un corto en DC, Euler implícito en el transitorio | RL: I·(1 − e^(−t/τ)) |
| termistor, fotorresistencia | resistencias cuyo valor sale de la temperatura (ecuación B) o de la luz (curva GL55) | ecuación B a 50 °C; GL5528 a 10 lx |
| zumbador | su bobina, 16 Ω | — |
| zumbador activo (TMB12A05) | una carga que casi no toma nada bajo 1,5 V, sube suave hasta 5 V / 30 mA = 167 Ω a los 2,0 V y se queda ahí; suena (2,3 kHz, unos 85 − 40·log10(5/V) dB a 10 cm) desde 2,0 V entre sus pines, de + a −, sin histéresis; al revés son 100 kΩ, en silencio, y avisa por encima de 1 V; sobre 7,5 V `SIM_IC_SUPPLY`, sobre 35 mA (desde unos 5,8 V) solo la nota `SIM_BUZZER_CURRENT` | 30 mA a 5 V, 19,8 mA y sonando con 3,3 V; en silencio y bajo 1 mA a 1 V |
| sensor Hall lineal 49E | una fuente de Vs/2 + 1,4 mV/G · (Vs/5) · campo mantenida en [0,95 V, Vs − 0,95 V] tras 50 Ω, 6 mA de la alimentación; esfuerzos: alimentación sobre 8 V o invertida; avisos: bajo 2,7 V, más de 1,5 mA de salida | 2,500 / 2,640 / 2,360 V a 0 / +100 / −100 G y 5 V; 1,742 V a +100 G y 3,3 V; 4,05 V en el tope |
| módulo sensor de voltaje | 30 kΩ de VIN a S y 7,5 kΩ de S a GND, un miliohmio que une − y GND; esfuerzo: la de 30 kΩ sobre 100 mW | S = 2,40 V y 0,32 mA con 12 V de entrada |
| LED | Shockley + 10 Ω, Vf a 20 mA según el color; `"model": { "vf": 2.95 }` lo cambia | ecuación de la malla resuelta aparte |
| LED RGB, display de 7 segmentos | un LED por chip entre su pata y la común (cátodo o ánodo), cada uno con su hoja de datos: RGB (YSL-R596CR3G4B5C-C10) rojo 2,0 V, verde y azul 3,2 V a 20 mA, 20 mA cada uno; segmentos del 5161AS / 5161BS 2,1 V a 20 mA, 20 mA y 40 mW cada uno; las dos patas comunes del display unidas por 0,05 Ω; esfuerzos por chip, con el nombre de su pata (`D1.R`); `"model": { "R": { "vf": 1.9 } }` cambia un chip | el Vf de cada chip a 20 mA según su hoja de datos; la común por cualquiera de sus patas |
| interruptor deslizante, de inclinación | como un interruptor: el contacto que cierra su posición es su resistencia (SS-12D00 30 mΩ; SW-520D 10 Ω, el límite de la hoja), el abierto no está; esfuerzos: corriente (0,3 A; 25 mA) y el voltaje que sostiene un contacto abierto (30 V; 12 V) | caída del contacto I·R; la posición abierta no lleva nada |
| relé (SRD-05VDC-SL-C) | su bobina de 70 Ω en serie con 0,1 H (cifra del kit: la hoja de datos no la da) y 10 kΩ en paralelo (sus pérdidas, cifra del kit: acotan el pico de una bobina sin diodo a cerca de I·R, 0,7 kV), y una armadura con histéresis que se activa al 75 % de 5 V (53,6 mA) y se suelta bajo el 10 % (7,1 mA), y cambia entre pasos de tiempo 5 ms (al activarse) o 2 ms (al soltarse) después de que su corriente cruzó el umbral (el recorrido del kit, dentro de los 10 ms y 5 ms de la hoja de datos); contacto de 0,1 Ω cerrado, 100 MΩ abierto (hoja de datos Songle SRD); esfuerzos: el I·R de la bobina sobre 6 V, un contacto sobre 10 A, el pico (una bobina cortada sin nada en paralelo, invertida más allá de 5 V) | 71 mA a 5 V; tiempo de activación τ·ln(I∞ / (I∞ − Iact)) + 5 ms; se mantiene entre los umbrales; el pico sin diodo, cerca de 1 V con un 1N4007 |
| motor DC (RE-140RA) | V = R·I + L·dI/dt + k·ω y J·dω/dt = k·I − b·ω − T_carga como elementos MNA: una resistencia, un inductor y un girador ideal cuyo otro lado es el eje, un nodo cuyo voltaje es ω, con J como un condensador y b como una conductancia a tierra y la carga como un freno (un par contra el giro, tanh de ω sobre 1 rad/s); R, k y b del punto sin carga y la corriente de bloqueo de la hoja de datos a su voltaje nominal (RE-140RA-12240: 7,69 Ω, 5,20 mV·s/rad, 0,518 µN·m·s), J de 1 g·cm² y L de 1 mH cifras del kit (hoja de datos Mabuchi RE-140RA); esfuerzos: voltaje sobre el tope de su rango, un bloqueo (frenado por su carga) sobre su corriente de máxima eficiencia | 4800 r/min y 50 mA libre a 3 V, 0,39 A bloqueado; el arranque contra la solución de dos polos resuelta aparte, τ = J·R / (k² + R·b) ≈ 25 ms |
| LM35 | una fuente de comportamiento: 10 mV/°C · T (nunca bajo 0 V) tras 0,4 Ω (regulación de carga 0,4 mV/mA) mientras +VS le deje 1,5 V (cifra del kit), 56 µA propios desde +VS (TI SNIS159H); esfuerzos: alimentación sobre 30 V o invertida, salida sobre 10 mA; notas: alimentación bajo 4 V, una temperatura que su grado no mide | 250 mV a 25 °C dentro de ±1,5 °C (LM35DZ); 56 µA; 0,4 mV a 1 mA |
| MOSFET | ley cuadrática con encendido suave, k a partir de Rds(on) | ley cuadrática resuelta aparte, Rds(on) |
| BJT | Ebers–Moll, β constante; TIP120 como Darlington con sus dos resistencias | Ebers–Moll resuelto aparte; hFE ≥ 1000 |
| fuente de banco, batería | fuente ideal, límite opcional; batería: fem según formato, química, celdas y carga, detrás de su resistencia interna | cortocircuito, ley de Ohm con la resistencia interna |

Cualquier campo del modelo se puede cambiar por componente con `"model": { … }` (por ejemplo, el
voltaje directo de un LED medido en el banco).

## Todavía no

Los chips que no son el 555, los amplificadores operacionales ni el LM393 (lógica, optoacopladores, el
LM386, los arreglos ULN) quedan sin conectar y se avisa, igual que el adaptador DESPI-C02; una placa con
microcontrolador corre su programa (`"program"`, con PWM y `tone`;
[microcontroladores.md](microcontroladores.md)). Los amplificadores operacionales todavía no
tienen ancho de banda ni velocidad de subida: una señal rápida sale como si el chip fuera ideal (un oscilador de relajación con realimentación positiva sí corre: Newton se detiene en los bordes del rango lineal a lo sumo dos veces por cálculo, así cambia de riel; uno con un LM358, 47 kΩ y 10 nF oscila a unos 920 Hz, y la fórmula de libro da 968 Hz con rieles ideales). El 555 todavía no tiene recorridos en la vista de conductores: su corriente
se ve en sus patas y sus tiras. Los eventos en un momento dado son para una ejecución (`--press`, `--at`), no para `--transient`; no hay
autocalentamiento, ni descarga de la batería con el tiempo (`charge` es fija en cada cálculo).
La animación (etapa 3) leerá estos mismos resultados.
