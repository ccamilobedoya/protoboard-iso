# Microcontroladores en la simulación

*[English](../en/microcontrollers.md)*

Cómo simula el kit las placas de desarrollo (ESP32 DevKit, ESP32-C3 SuperMini, Arduino UNO): no el
procesador, sino lo que se ve en los pines. Cada GPIO se comporta eléctricamente como el real, y un
programa corto con las funciones de Arduino decide, en el tiempo, qué hace cada pin. El mismo código
sirve para todas las placas; lo que cambia son los números de cada familia.

Planeado con el mantenedor el 2026-10-26. Las fases M1 a M3 están hechas; sigue M4.

## Por qué no emular el procesador

| Opción | Qué hace | Para el kit |
|---|---|---|
| Emulación real (como hace Wokwi) | Corre el firmware compilado instrucción por instrucción | Para el UNO existe una librería en JavaScript (avr8js), pero hay que compilar el código antes; para el ESP32 no hay nada liviano y libre; y el kit no lleva dependencias en tiempo de ejecución |
| Pines con estados fijos | `"io": { "D13": "high" }`: la placa es una fuente en ese pin | Fase M1: sin programa, nada parpadea ni reacciona |
| **Modelo de pines + un programa sencillo** (la elegida) | Pines como los reales; un programa con las funciones de Arduino los fija entre pasos de tiempo | Encaja en el motor como el 555 (su biestable cambia entre pasos); se ve en la página en vivo, con el osciloscopio y las fichas |

Lo que necesita una clase es qué voltaje sale de un pin, cuánta corriente pasa y qué lee una entrada.
El detalle a nivel de instrucciones no aporta a eso. El firmware real del UNO con avr8js puede venir
después como modo opcional, aparte del kit.

## Decisiones (2026-10-26)

- El programa se escribe en **el subconjunto de C++ de Arduino** que usa una clase, el mismo texto
  que se subiría a la placa; un traductor pequeño del kit lo convierte en JavaScript (quita los
  tipos, `void setup()` pasa a ser una función). El código que usa librerías (GxEPD2 para el
  e-paper) no corre: esas llamadas se avisan.
- Vive en **un archivo `.ino` junto al circuito** (`<carpeta del circuito>/<nombre>.ino`), no dentro
  de `circuit.json`.
- Primera placa: el **ESP32 DevKit** (la que más usa el curso), después el UNO y el C3.

## El modelo de pines (fase M1, hecha)

`src/sim/devices/mcu.js`, con los números de cada familia en `src/sim/models.js` (`MCUS`) y los pines
de cada placa en `src/parts/modules.js` (`power`, `gpio`, `adc`, `inputOnly`).

| | ESP32, ESP32-C3 | Arduino UNO (ATmega328P) |
|---|---|---|
| Riel lógico | 3,3 V de su regulador (AMS1117 en el DevKit, ME6211 en el C3) | los 5 V del USB; 3V3 de un LP2985 (150 mA) |
| Salida | el riel o tierra tras 17 Ω (VOH = 0,8·VDD a 40 mA) | tras 40 Ω (VOH 4,2 V a 20 mA) |
| Entrada | sin corriente; pull-up o pull-down de 45 kΩ | sin corriente; pull-up de 35 kΩ (20–50 kΩ) |
| Lee 0 / 1 | por debajo del 25 % / por encima del 75 % de VDD | por debajo del 30 % / por encima del 60 % de VCC |
| ADC (en la ficha) | 12 bits sobre 0–3,1 V (C3: 0–2,5 V), lineal aquí | 10 bits sobre 0–5 V |
| Consumo propio | 40 mA (C3: 20 mA), sin radio | 45 mA (chip, puente USB, LED de encendido) |
| Límites | 40 mA por pin (máximo absoluto); un pin por encima de VDD + 0,3 V o por debajo de −0,3 V (diodos de protección conduciendo: `SIM_PIN_OVERVOLTAGE`) | lo mismo, a 5 V |

- **Alimentación:** una placa con USB (`"usb": true`, por defecto) es una fuente: 5 V tras la
  resistencia del cable en su pin de USB (VIN en un DevKit, 5V en las otras). Sin otra fuente, la
  tierra es su GND, así que `esp32-led` se simula sin nada más. `"usb": false`: la placa toma su
  alimentación del circuito por esos pines.
- **Pines:** `"io"` fija cada GPIO por su nombre impreso, su nombre GPIO o su número (`"D13"`,
  `"GPIO13"`, `"13"`): `high`, `low`, `input`, `input_pullup`, `input_pulldown`. Los que no aparecen
  son entradas. Un GPIO sin nada conectado se deja fuera. Los errores son avisos y se dejan fuera: un
  pin desconocido (`SIM_PIN_UNKNOWN`), un estado desconocido (`SIM_PIN_STATE`), una salida en un pin
  que solo puede ser entrada (`SIM_PIN_INPUT_ONLY`: GPIO34–39 en el DevKit).
- **La ficha:** el voltaje y la corriente del USB, el riel lógico y, por cada pin en uso, su estado,
  voltaje, corriente, lo que lee (0, 1 o ninguno) y su valor de ADC.
- **Cada pin tiene diodos de protección** hacia el riel y hacia tierra, así que 5 V por una
  resistencia hacia un pin del ESP32 muestran la corriente que meten al chip, con el aviso.
- **El PWM no es un promedio.** Un promedio (una conductancia al riel y otra a tierra) dejaría pasar
  corriente por dentro del chip del riel a tierra, y la corriente promedio de un LED no es su
  corriente al voltaje promedio: el PWM de un programa conmuta en el tiempo (M3, más abajo).
- Pruebas: `test/mcu.test.js` (VOH con la resistencia de salida, corriente del pull-up, el UNO a 5 V,
  5 V en un pin del ESP32, errores en `io`, `usb: false`).

## El programa (fase M2, hecha)

```json
{ "id": "U1", "type": "module", "part": "ESP32-DEVKIT", "pin1": "c5", "program": "parpadeo.ino" }
```

`program` es el nombre de un archivo `.ino` junto al circuito (la carpeta de `circuit.json`), o el
texto del programa mismo (ejemplos, recetas). Es el programa que se subiría a la placa:

```cpp
const int LED = 13;
void setup() { pinMode(LED, OUTPUT); }
void loop() { digitalWrite(LED, HIGH); delay(500); digitalWrite(LED, LOW); delay(500); }
```

- **Lo que entiende** (`src/sim/sketch.js`, traducido una vez al compilar el circuito): variables y
  constantes globales, `#define NOMBRE valor`, sus propias funciones,
  `int`/`long`/`float`/`bool`/`byte`/`unsigned …` y arreglos con `{ … }`, `if`/`else`, `while`,
  `do … while`, `for`, `switch`, `break`, `continue`, `return`, los operadores que comparten C y
  JavaScript, conversiones (`(int) x`), caracteres entre comillas simples, sufijos numéricos
  (`1000UL`). Las variables enteras conservan la división entera (`7 / 2` → 3).
- **Lo que puede llamar** (`src/sim/program.js`): `pinMode` (`INPUT`, `OUTPUT`, `INPUT_PULLUP`,
  `INPUT_PULLDOWN`), `digitalWrite`, `digitalRead`, `delay`, `delayMicroseconds`, `millis`,
  `micros`, `Serial.begin/print/println` (sus últimas líneas salen en la ficha de la placa),
  `analogRead` (el valor del ADC), `map`, `constrain`, `min`, `max`, `abs`, `random` (una secuencia
  fija), las funciones de bits, `LED_BUILTIN` (2 en el DevKit, 8 en el C3, 13 en el UNO) y
  `A0`…`A5`. En un UNO, `digitalWrite(pin, HIGH)` sobre una entrada activa su pull-up, como en el
  chip real.
- **Cómo corre:** cada función pasa a ser un generador, así que `delay()` espera en tiempo simulado.
  El programa corre entre pasos de tiempo, con los voltajes del paso anterior, como el biestable del
  555: un cambio vale un paso después (1 ms en la página). En t = 0 vuelve a empezar con los voltajes
  de ese momento hasta que sus pines salen iguales (su setup puede activar un pull-up que su loop
  lee). Un loop que nunca espera recibe 2000 vueltas por paso, así la página no se congela. Cuando
  se usa un control (se presiona un pulsador), el programa sigue donde estaba.
- **En la página:** un circuito con programa corre en tiempo real (`delay(500)` es medio segundo),
  con pasos de 1 ms (más cortos, hasta 0,1 ms, si al lado hay un RC rápido). La ficha de la placa
  muestra el programa (corriendo, o en `delay()` hasta cuándo), sus líneas de Serial y cada pin.
- **Lo que no corre:** clases, punteros, plantillas, macros con parámetros, librerías (un
  `#include` distinto del de Arduino se avisa: `SIM_PROGRAM_LIBRARY`); llamar a una función que nadie
  define devuelve 0 (`SIM_PROGRAM_UNSUPPORTED`); una línea que no entiende lo detiene
  (`SIM_PROGRAM_ERROR`, con la línea); un archivo que falta (`SIM_PROGRAM_FILE`).
- Pruebas: `test/program.test.js` (el traductor, el parpadeo contra el tiempo, un pulsador leído por
  el programa a través de los pasos del motor y una reconstrucción, el archivo `.ino`).

## PWM, tone y el monitor serie (fase M3, hecha)

- **El PWM conmuta en el tiempo.** `analogWrite(pin, 0…255)`: en un ESP32 cualquier pin de salida,
  1 kHz; en un UNO sus pines PWM (3, 9, 10, 11 a 490 Hz; 5, 6 a 980 Hz), y cualquier otro pin lo
  toma como `digitalWrite` (128 o más es HIGH), como hace su núcleo. `ledcAttach(pin, frec, bits)` +
  `ledcWrite(pin, ciclo)` (núcleo 3 del ESP32) y `ledcSetup(canal, frec, bits)` +
  `ledcAttachPin(pin, canal)` + `ledcWrite(canal, ciclo)` (núcleo 2). `tone(pin, frec[, ms])` es una
  onda cuadrada a la mitad del ciclo, `noTone` la detiene. Un ciclo de 0 o lleno es un nivel fijo.
- En cada paso el pin está alto o bajo según su fase en ese instante (`levelAt` en
  `src/sim/program.js`), así que el osciloscopio muestra la onda cuadrada y la corriente es la que
  corresponde a cada mitad. Sin promedio (un promedio dejaría pasar corriente por dentro del chip
  de su riel a tierra).
- **En la página:** mientras corre un PWM o un tono, el paso se acorta a la vigésima parte de su
  período (`engine.stepHint()`, nunca por debajo de 5 µs: si la página no alcanza el tiempo real, se
  pone en cámara lenta sola). El brillo de un LED es su brillo promediado en los pasos desde la
  última vez que se pintó (`engine.glow()`), lo que ve el ojo: `analogWrite(13, 64)` lo enciende a
  un cuarto.
- **Monitor serie:** las últimas 12 líneas que imprimió el programa, en la ficha de la placa.
- La ficha muestra un pin con PWM como «PWM al 25 % a 1 kHz» con su voltaje y su corriente en ese
  instante.
- Pruebas en `test/program.test.js`: ciclo y frecuencia de `analogWrite`, las dos formas de LEDC,
  `tone` con duración, el pin sin PWM del UNO, el paso sugerido y el brillo promediado.

## El plan

| Fase | Qué | Estado |
|---|---|---|
| **M1** | Modelo de pines con estados fijos (`io`), la placa con USB como fuente, límites y avisos | ✅ 2026-10-26 |
| **M2** | El programa: el `.ino` junto al circuito (o su texto), traducido a JavaScript; `pinMode`, `digitalWrite`, `digitalRead`, `delay`, `millis`, `Serial`; corre entre pasos de tiempo, `delay` espera en tiempo simulado; la página lo corre en tiempo real | ✅ 2026-10-26 |
| **M3** | PWM como una onda cuadrada real en el tiempo (`analogWrite`, `ledcWrite`), `tone`, el paso que necesita en la página y el brillo promediado del LED, el monitor serie en la ficha de la placa | ✅ 2026-10-26 |
| **M4** | Recetas para el UNO y el C3 (LED, pulsador, potenciómetro con ADC y PWM); las recetas del ESP32 ya tienen su programa (2026-10-26) | ⬜ |
| después | Un panel propio de consola serie en la página, `analogRead` con la curva real del ADC del ESP32, interrupciones (`attachInterrupt`), versiones simplificadas de librerías comunes, firmware real del UNO con avr8js como modo opcional, las dos filas de pines del ESP32 en un circuito (el límite del montaje) | — |

El programa maneja la memoria que guardan los pines (`gpioStage`: `mode`, `level`, `pull`) a
través de un elemento sin corriente propia (el controlador de la placa), así que el motor solo
aprendió a correr los programas en t = 0 (`settle`) y a decirle a la página que hay uno
(`hasProgram`).

## Ver también

- [simulacion.md](simulacion.md): el simulador y sus modelos.
- [formato-circuito.md](formato-circuito.md): el componente `module` y sus campos.
- [recetas.md](recetas.md): `esp32-led`, `esp32-button`.
