# Módulos de sensor con LM393

*[English](../en/sensor-modules.md)*

La mayoría de los sensores de un kit de inicio vienen en la misma placa pequeña: el elemento que
siente, una resistencia de 10 kΩ sobre él, un trimmer azul y un comparador LM393 con dos LED. El kit
los tiene como **un solo tipo**, `sensor-module`, un paquete y un dispositivo; el número de parte
dice qué elemento lleva.

```json
{ "id": "U1", "type": "sensor-module", "part": "YL-69", "threshold": 0.5 }
```

El código: `src/parts/sensors.js` (`SENSOR_MODULES`: la tabla de los números de parte y las fórmulas
de los elementos), `src/parts/types/sensor-modules.js` (el tipo), `src/parts/packages/sensor-module.js`
(el dibujo), `src/sim/devices/sensor-module.js` (la simulación). Recetas: `rain-alarm`, `soil-led`,
`light-switch-module`, `line-follower-uno`, `obstacle-buzzer`, `hall-counter-uno`
([recetas.md](recetas.md)); líneas de tiempo `examples/tours/soil-led.json` y `obstacle-buzzer.json`.

## La placa común

```text
VCC ─┬─ 1 kΩ ─ LED de encendido ─ GND
     ├─ 10 kΩ ─┬─ AO ─ elemento ─ GND
     │         └─ LM393 IN+
     ├─ trimmer ─ Vref ─ LM393 IN−
     ├─ pull-up de 10 kΩ ─ DO ─ colector abierto del LM393 a GND
     └─ 1 kΩ ─ LED de DO ─ DO
```

- **AO** es el punto entre los 10 kΩ y el elemento: una parte de VCC que se mueve con lo que siente
  el elemento. En las placas de 3 pines (LDR-LM393, SW-420-M, FC-51) queda adentro; la ficha igual lo
  muestra.
- **Vref** es lo que fija el trimmer: `threshold` × VCC (0 a 1, por defecto 0,5). Su deslizador es el
  control `threshold` de la pieza.
- **DO está en bajo justo mientras AO está por debajo de Vref**, y entonces se enciende el LED de DO.
  «Detectar» (mojado, húmedo, luz, un haz, blanco o cerca, un imán, un obstáculo) baja AO, así que DO
  baja; el SW-420 es la excepción, en bajo en reposo y en alto mientras vibra.
- Todo sigue a VCC (es ratiométrico): con 3,3 V, AO y Vref son dos tercios de lo que son con 5 V, y DO
  conmuta con el mismo estímulo. DO en alto **es** VCC (el pull-up va ahí), así que un módulo en 5 V
  mete 5 V a un pin de una placa de 3,3 V: lo dice la propia comprobación de la placa
  (`SIM_PIN_OVERVOLTAGE`).
- Corrientes a 5 V: unos 3,9 mA con DO en alto, 7,5 mA con DO en bajo; los infrarrojos suman los
  25 mA de su LED (unos 29 mA en total).

## Las ocho piezas

| Pieza | Pines de la placa | Campo que siente (valor propio) | Elemento | DO en bajo quiere decir |
|---|---|---|---|---|
| `MH-RD` | VCC GND AO DO | `rain` (`wetness`, 0…1) | peine de cobre, 10 MΩ seco … 5 kΩ mojado | agua en el peine |
| `YL-69` | AO DO GND VCC | `moisture` (`moisture`, %) | horquilla de suelo, 5 MΩ al aire … 4,7 kΩ en agua | suelo húmedo (desde 61 %) |
| `LDR-LM393` | DO GND VCC | `light` (`light`, lx) | fotorresistencia GL5528 | luz (desde 17,6 lx) |
| `SLOT-IR` | A0 D0 GND VCC | `beam` (`beam`, true = cortado) | LED IR y fototransistor a través de una ranura | le llega el haz |
| `TCRT5000-M` | A0 D0 GND VCC | `distance`, `reflectance` (los dos) | LED IR y fototransistor, por reflexión | blanco a menos de unos 1,5 cm |
| `KY-024` | DO + G AO | `field` (`field`, G) | interruptor Hall A3144, enciende a 160 G, apaga a 105 G | un polo sur cerca |
| `SW-420-M` | DO GND VCC | `vibration` (`vibration`) | contacto de resorte, 10 Ω cerrado | en reposo (alto mientras vibra) |
| `FC-51` | OUT GND VCC | `distance`, `reflectance` (los dos) | LED IR y receptor lado a lado | un obstáculo (9 cm para el blanco) |

Un valor en la pieza gana sobre el ambiente del circuito, campo por campo
([ambiente.md](ambiente.md)); mover el control propio de la pieza en su ficha la separa de ese campo.
`reflectance` va en % del papel blanco (la tinta negra, unos 10); `beam` y `reflectance` son los dos
campos que estos módulos agregaron al ambiente.

Cada elemento, en corto:

- **Lluvia, suelo, luz**: una resistencia bajo los 10 kΩ. Lluvia: R = 10 MΩ^(1 − w) · 5 kΩ^w (w la
  parte del peine mojada). Suelo: log-lineal entre 5 MΩ (0 %), 100 kΩ (10 %), 17 kΩ (40 %), 8 kΩ (70 %)
  y 4,7 kΩ (100 %). Luz: la curva de la GL5528 del kit. Una corriente continua por electrodos mojados
  los corroe: `SIM_MODULE_CORROSION` (información).
- **Ranura, seguidor de línea, obstáculo**: el LED IR propio de la placa (150 Ω, 1,25 V fijos: 25 mA a
  5 V) ilumina un fototransistor cuya corriente es proporcional a la del LED y a lo que vuelve: la
  ranura 3 mA con el haz libre (`transmittance` en la pieza para el papel, unos 0,3, que igual no la
  dispara; `slots` y `duty` la vuelven un disco de encoder sobre el `angle` del ambiente); el TCRT5000
  `reflectance` · 2 mA · g(distancia), g leída de la curva de su hoja de datos (máximo a 2,5 mm, nada
  más allá de 3 cm); el FC-51 `reflectance` · 0,5 mA / (1 + (d / 10 cm)²). Saturado, AO queda cerca de
  0,2 V.
- **Hall**: el A3144 es un enclavamiento: enciende a 160 G, apaga a 105 G y entre los dos se queda como
  está (vive en el `closed` del elemento, que el motor conserva cuando se mueve un deslizador). AO salta
  entre unos 0,09 V y VCC. El chip está especificado desde 4,5 V: con 3,3 V funciona pero dice
  `SIM_MODULE_LOW_SUPPLY`.
- **Vibración**: al sacudirlo, el contacto rebota en celdas de 10 ms ± 50 %, abierto el primer 40 % de
  cada una, con el patrón fijo por una semilla (`seed` en la pieza, si no su id), así que DO llega en
  ráfagas de unos 100 pulsos por segundo; cuando para, queda cerrado en una celda más. La página da
  pasos de 0,1 ms mientras rebota.

## Límites y avisos

| Código | Cuándo |
|---|---|
| `SIM_IC_SUPPLY` | VCC por encima de 5,5 V (lo que aguanta la placa; un aviso, así 5 V no se lee como cerca) |
| `SIM_REVERSE_VOLTAGE` | VCC invertido más de 0,3 V |
| `SIM_OVER_CURRENT` | DO absorbiendo más de 20 mA (`U1.DO`), un LED IR por encima de 60 mA (`U1.IR`), la salida Hall por encima de 25 mA |
| `SIM_MODULE_LOW_SUPPLY` | VCC por debajo de los 2 V del LM393, o de los 4,5 V del chip Hall |
| `SIM_MODULE_CORROSION` | corriente continua por un peine mojado o por el suelo (información) |

## Agregar una novena pieza

Una fila en `SENSOR_MODULES` (`src/parts/sensors.js`): sus pines en el orden en que los imprime la
placa (y `print` cuando lo impreso es distinto), los campos que siente (`own` cuando la pieza llama
distinto a uno), su elemento (uno de los ocho tipos, o uno nuevo con su fórmula en el mismo archivo y
su elemento en el dispositivo), el total del trimmer y sus parámetros con sus marcas de origen. Un
glifo en `glyph()` del paquete cuando su elemento se ve distinto. Luego su texto de descripción
(`describe.sensor-module.<pieza>`), una comprobación contra la fórmula propia del elemento en
`test/sensor-modules.test.js`, y una receta si una lección lo usa. La placa, el comparador, los LED, la
ficha, el símbolo y la vista por dentro son los mismos para todas.
