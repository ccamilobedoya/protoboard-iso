# El sensor ultrasónico de distancia (HC-SR04)

*[English](../en/ultrasonic-sensor.md)*

El HC-SR04 mide distancia con sonido: una cápsula (`T`) envía una ráfaga corta de 40 kHz, la otra
(`R`) escucha su eco, y el módulo deja `ECHO` en alto mientras el sonido va y vuelve. El programa de
una placa lo arranca con un pulso de 10 µs en `TRIG` y mide `ECHO` con `pulseIn`
([microcontroladores.md](microcontroladores.md#pulsein)). El kit lo simula como una pequeña máquina
de estados con reloj propio, como el PIR y el módulo táctil ([sensores-temporizados.md](sensores-temporizados.md)),
así que los tiempos que lee el aprendiz son los del módulo: el programa obtiene la ida y vuelta al
microsegundo.

```json
{ "id": "U2", "type": "ultrasonic-sensor" }
```

Lee la `distance` del ambiente (cm) y su `temperature` (°C, que fija la velocidad del sonido)
([ambiente.md](ambiente.md)); `distance` y `temperature` en la pieza son sus valores propios y ganan
sobre los del ambiente, y su ficha tiene un deslizador propio de `distance`. El código está en
`src/sim/devices/ultrasonic.js` (la máquina es la función pura `sonarAdvance`), sus números en
`ULTRASONIC` de `src/sim/models.js`, el tipo en `src/parts/types/ultrasonic.js` y el dibujo en
`src/parts/packages/ultrasonic.js`. Recetas: `uno-distance`, `esp32-distance`, `distance-alarm-uno`
([recetas.md](recetas.md)); línea de tiempo `examples/tours/uno-distance.json`.

## Pines y campos

Pines `VCC`, `TRIG`, `ECHO`, `GND`, como los marca la placa, de izquierda a derecha con las cápsulas
hacia uno. El módulo se para sobre sus cuatro pines: una placa de 45 × 20 mm con dos cápsulas de
16 mm de diámetro.

| Campo | Por defecto | |
|---|---|---|
| `part` | `"HC-SR04"` | el único número de parte por ahora |
| `distance` | 50 | cm, su valor propio del campo (entonces no sigue al ambiente) |
| `temperature` | 20 | °C, su valor propio del campo |

## La máquina y sus tiempos

```text
espera ──TRIG en alto ≥ 10 µs, luego en bajo──▶ ráfaga ──(250 µs)──▶ eco ──(2·d / v)──▶ espera
ECHO en bajo                                    ECHO en bajo         ECHO en alto
                                                un TRIG ahora se ignora ──────────────┘
```

- `TRIG` lee alto desde 2,0 V, así que un pin de 3,3 V lo maneja. Debe quedar en alto 10 µs o más;
  un pulso de 5 µs no se toma. La medición empieza cuando `TRIG` baja.
- La ráfaga (ocho ciclos de 40 kHz, 200 µs, y unos 50 µs propios del módulo) dura 250 µs; luego
  sube `ECHO`.
- `ECHO` queda en alto durante la ida y vuelta, `2·d / v` con `v = 331,3 + 0,606·T` m/s: 5 824 µs a
  100 cm y 20 °C (los «58 µs por cm» de siempre), 577 µs a 10 cm y 25 °C, 23,3 ms a 400 cm,
  3 018 µs a 50 cm y 0 °C. Fuera de 2 a 400 cm, o por debajo de 4,5 V, nada responde: `ECHO` queda
  en alto 38 ms («sin eco»).
- El ancho queda fijo cuando sale la ráfaga: un deslizador movido durante el eco (en esta pieza o en
  otra) no cambia la medición en curso, y el motor conserva `phase`, `clock` y `width` al reconstruir.
- `ECHO` es una salida push-pull a `VCC` detrás de 20 Ω, así que en alto da 5 V. La alimentación
  toma 2 mA esperando y 15 mA mientras mide.

El elemento estampa `ECHO` con el estado del final del paso que se resuelve y le dice al motor
cuándo llega su próximo flanco (`until()`), así que `engine.advance` termina un paso justo en la
subida y en la bajada de `ECHO` y el programa ve cada flanco a su tiempo, sea cual sea el paso de la
página. No se modelan: el cono de 15° del haz, la resolución de 0,3 cm del temporizador del propio
módulo (el ancho del eco es exacto) ni las superficies blandas o inclinadas que no devuelven eco.

## Una placa de 3,3 V: el divisor en ECHO

El módulo necesita 5 V (el `VIN` del ESP32 DevKit, los 5 V del USB), así que su `ECHO` es de 5 V.
Directo a un GPIO de un chip de 3,3 V empuja corriente por el diodo de protección del pin: lo dice
la revisión propia de la placa (`SIM_PIN_OVERVOLTAGE`). Un divisor de 1 kΩ desde `ECHO` sobre 2 kΩ a
tierra deja 5 V · 2 / 3 = 3,33 V en el pin, todavía un HIGH claro; `TRIG` no necesita nada. La receta
`esp32-distance` lo trae.

## Límites y avisos

| Código | Cuándo |
|---|---|
| `SIM_IC_SUPPLY` | `VCC` por encima de 5,5 V |
| `SIM_REVERSE_VOLTAGE` | `VCC` invertido más de 0,3 V |
| `SIM_MODULE_LOW_SUPPLY` | `VCC` por debajo de 4,5 V: responde «sin eco» (por debajo de 2,5 V está apagado, `ECHO` en alta impedancia) |
| `SIM_OVER_CURRENT` | `ECHO` entregando más de 20 mA |

Los 250 µs de `TRIG` a `ECHO` y los 20 Ω de `ECHO` son cifras propias del kit, no de la hoja de
datos; un osciloscopio en el banco resolvería ambas. La primera suposición para la salida, 100 Ω,
dejaba el centro del divisor en 3,23 V, por debajo de los 3,33 V que se leen en el banco, así que el
kit toma 20 Ω (la salida de un chip de 5 V con poca carga).
