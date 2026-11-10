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
| `SIM_BUZZER_DC` | corriente continua por un zumbador pasivo (el activo suena con continua: no le aplica) |
| `SIM_RELAY_COIL`, `SIM_RELAY_KICK` | la bobina de un relé con más de su 120 % (6 V); su bobina cortada sin nada en paralelo, con el voltaje invertido muy por encima de la fuente (un diodo en paralelo con la bobina lo limita a cerca de 1 V) |
| `SIM_MOTOR_VOLTAGE`, `SIM_MOTOR_STALL` | un motor DC sobre el tope de su rango de voltaje; frenado por su carga, tomando su corriente de bloqueo |
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
| zumbador activo (TMB12A05) | una carga que no toma nada por debajo de 1,5 V y, desde 2,5 V, 5 V / 30 mA = 167 Ω (suavizado entre las dos); suena a 2,3 kHz desde 3,5 V entre sus pines, de + a −; al revés no toma nada y avisa por encima de 0,5 V | 30 mA a 5 V; en silencio y bajo 1 mA a 1 V |
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
tienen ancho de banda ni velocidad de subida: una señal rápida sale como si el chip fuera ideal. El 555 todavía no tiene recorridos en la vista de conductores: su corriente
se ve en sus patas y sus tiras. No hay eventos durante un transitorio (presionar un botón en un momento dado), ni
autocalentamiento, ni descarga de la batería con el tiempo (`charge` es fija en cada cálculo).
La animación (etapa 3) leerá estos mismos resultados.
