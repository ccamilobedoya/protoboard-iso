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
  se suben poco a poco desde el 10 %.
- **Transitorio.** `stop` y `step` en segundos; los capacitores empiezan descargados y los
  inductores sin corriente (`start: "zero"`, la fuente se enciende en t = 0), o en sus valores de
  DC (`start: "dc"`).
  Euler implícito con paso fijo; se guardan como mucho 400 muestras (`points`).

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

Componentes de dos patas: `voltage` = primera pata − segunda, y `current` va de la primera pata a
la segunda a través del componente. Las corrientes de los transistores son positivas cuando
entran por la pata. El transitorio trae `times` y las mismas magnitudes como listas.

## Avisos

| Código | Cuándo |
|---|---|
| `SIM_OVER_POWER` | una resistencia por encima de su potencia (`power`: "1/4" W por defecto) o un transistor por encima de lo que aguanta su encapsulado |
| `SIM_OVER_CURRENT` | un LED con más de 30 mA; un diodo, inductor, regulador o batería por encima de su máximo |
| `SIM_REVERSE_VOLTAGE` | un LED con más de 5 V en inversa |
| `SIM_CAP_REVERSED`, `SIM_CAP_OVER_VOLTAGE` | un electrolítico al revés; cualquier capacitor por encima de su voltaje |
| `SIM_SUPPLY_LIMITED` | una fuente de banco en su límite de corriente (corriente constante) |
| `SIM_SHORT_CIRCUIT` | una fuente sin límite que entrega más de 3 A; una batería cuya carga es de menos de medio ohmio |
| `SIM_BATTERY_OFF`, `SIM_BATTERY_CHARGING`, `SIM_BATTERY_REVERSE` | una batería apagada; corriente que entra en ella (aviso fuerte si es alcalina, que no se recarga) |
| `SIM_REG_DROPOUT`, `SIM_REG_HOT` | un regulador sin voltaje de entrada suficiente para regular; disipando más de lo que aguanta un TO-220 sin disipador (2 W) |
| `SIM_BUZZER_DC` | corriente continua por un zumbador pasivo |
| `SIM_FLOATING` | grupos sin camino de corriente continua hasta la fuente (por ejemplo, la compuerta de un MOSFET sin conectar) |
| `SIM_PIN_OVERVOLTAGE`, `SIM_PIN_UNKNOWN`, `SIM_PIN_STATE`, `SIM_PIN_INPUT_ONLY` | un pin de un microcontrolador fuera de su riel (diodos de protección conduciendo); una entrada de `io` que no nombra un GPIO conectado, un estado que no conoce o una salida en un pin que solo puede ser entrada |
| `SIM_IC_SUPPLY` | un chip alimentado por encima de su máximo (555: 16 V; LM358: 32 V; 741: 36 V en total) |
| `SIM_UNSUPPORTED`, `SIM_DEFAULT_MODEL` | un componente que todavía no se simula (los chips que no son el 555), o una referencia sin modelo propio |

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
| LED | Shockley + 10 Ω, Vf a 20 mA según el color; `"model": { "vf": 2.95 }` lo cambia | ecuación de la malla resuelta aparte |
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
tienen ancho de banda ni velocidad de subida: una señal rápida sale como si el chip fuera ideal. El 555 todavía no tiene recorridos en la vista de conductores: su corriente
se ve en sus patas y sus tiras. No hay eventos durante un transitorio (presionar un botón en un momento dado), ni
autocalentamiento, ni descarga de la batería con el tiempo (`charge` es fija en cada cálculo).
La animación (etapa 3) leerá estos mismos resultados.
