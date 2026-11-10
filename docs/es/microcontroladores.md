# Microcontroladores en la simulación

*[English](../en/microcontrollers.md)*

Cómo simula el kit las placas de desarrollo (ESP32 DevKit, ESP32-C3 SuperMini, Arduino UNO): no el
procesador, sino lo que se ve en los pines. Cada GPIO se comporta eléctricamente como el real, y un
programa corto con las funciones de Arduino decide, en el tiempo, qué hace cada pin. El mismo código
sirve para todas las placas; lo que cambia son los números de cada familia.

Planeado con el mantenedor el 2026-10-26. Las fases M1 a M5 están hechas.

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
- Primera placa: el **ESP32 DevKit** (la más común en los kits de principiante), después el UNO y el C3.

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
  (`1000UL`). Una división entre enteros sigue siendo entera, como en C (`7 / 2` → 3,
  `analogRead(A0) / 4` → 127 con 510): el traductor sabe qué términos son enteros (literales,
  variables y funciones de tipo entero, `analogRead`, `millis` …, conversiones, `#define` enteros) y
  respeta que `*`, `/` y `%` se agrupan de izquierda a derecha.
- **Lo que puede llamar** (`src/sim/program.js`): `pinMode` (`INPUT`, `OUTPUT`, `INPUT_PULLUP`,
  `INPUT_PULLDOWN`), `digitalWrite`, `digitalRead`, `delay`, `delayMicroseconds`, `millis`,
  `micros`, `pulseIn` y `pulseInLong` ([más abajo](#pulsein)), `Serial.begin/print/println` (sus últimas líneas salen en la ficha de la placa),
  `analogRead` (el valor del ADC), `map`, `constrain`, `min`, `max`, `abs`, `log` (logaritmo natural, para la ecuación B de un termistor), `random` (una secuencia
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
- **Lo que no corre:** clases (salvo los objetos de tres bibliotecas, [más abajo](#objetos-de-biblioteca-dht-bme280-bmp280)), punteros, plantillas, macros con parámetros, otras librerías (un
  `#include` distinto del de Arduino se avisa: `SIM_PROGRAM_LIBRARY`); llamar a una función que nadie
  define devuelve 0 (`SIM_PROGRAM_UNSUPPORTED`); una línea que no entiende lo detiene
  (`SIM_PROGRAM_ERROR`, con la línea); un archivo que falta (`SIM_PROGRAM_FILE`).
- **Un programa es entrada externa** (CLAUDE.md, «External input»): su JavaScript solo nombra lo
  que da el entorno de ejecución (los nombres propios del programa llevan `$`, `Serial.<método>` es
  el único miembro, los índices son números, las cadenas quedan fuera del código), los arreglos
  tienen un tope de 100 000 elementos, un programa de más de 65 536 caracteres no se lee
  (`SIM_PROGRAM_TOO_LARGE`) y un archivo `.ino` fuera de la carpeta del circuito tampoco
  (`SIM_PROGRAM_OUTSIDE`). Pruebas: `test/attack.test.js`.
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

## pulseIn

`pulseIn(pin, valor)` y `pulseIn(pin, valor, timeout)` (y `pulseInLong`, lo mismo aquí) devuelven el
ancho del próximo pulso en `valor` en el pin, en microsegundos enteros, o 0 si `timeout`
(microsegundos, 1 000 000 por defecto) pasa antes, contado desde la llamada, como el de Arduino: un
pulso que ya va cuando se llama se deja pasar primero. El HC-SR04 es para lo que sirve
([sensor-ultrasonico.md](sensor-ultrasonico.md)): `pulseIn(ECHO, HIGH, 30000)` es la ida y vuelta
del sonido.

- **Cómo espera.** Es un generador del entorno de ejecución que el traductor llama con `yield*`, como
  las funciones propias. Lee el pin con los umbrales de la placa (los de `digitalRead`) al final de
  cada paso, y entre dos miradas devuelve el paso (entrega un valor propio del entorno, nunca un
  número, así que el `delay` de un programa no puede hacerse pasar por él). El ancho es el tiempo
  entre el paso que vio empezar el pulso y el que lo vio terminar.
- **Su precisión: los pasos terminan en los flancos.** Mirar al paso de la página (1 ms) leería un
  eco de 5,8 ms al milisegundo, y un paso tan fino como para leerlo al microsegundo haría que la
  página se arrastrara. Así que el motor termina un paso en cada evento que nombra un elemento
  (`until()`, segundos desde ahora): `engine.advance(h)` toma h en trozos que terminan en cada evento
  que cae dentro (como mucho 1 000 por llamada, ninguno a menos de un nanosegundo). Un programa
  nombra cuándo despierta (el fin de un `delay` o un `delayMicroseconds`, el timeout de `pulseIn`),
  así que `delayMicroseconds(10)` es un pulso de 10 µs en el pin; un sensor temporizado nombra su
  próximo flanco (el HC-SR04: el fin de su ráfaga, el fin de su eco), así que el programa ve subir y
  bajar `ECHO` a su tiempo y `pulseIn` lee 5 824 µs para 100 cm a 20 °C sea cual sea el paso de la
  página. Un pulso de algo que no nombra flancos (un pulsador, un RC) se lee a un paso.
- **Cuesta unos pocos pasos, no un paso fino.** El paso de la página sigue como estaba (`stepHint()`
  y el ritmo no cambian): `uno-blink` toma 1 000 pasos por segundo simulado antes y después;
  `uno-distance` (una medición cada 100 ms) toma unos 1 050, los cinco aterrizajes más o menos de
  cada medición.
- **Es seguro.** `pulseIn` es un nombre más de `SKETCH_API`, sin ningún acceso a miembros nuevo. Un
  timeout que no es un número, negativo (sin signo, un número enorme en C) o mayor que 3 000 000 µs
  se recorta a `LIMITS.pulseInMicros` (3 s); un timeout de 0 devuelve 0 enseguida. Un
  `while (1) pulseIn(…)` sobre un pin que nada maneja espera como mucho un timeout por paso y
  devuelve el paso; `test/attack.test.js` tiene estos casos.
- **En la ficha:** mientras mira su pin, el programa de la placa espera hasta su timeout.
- No corre así: `transient()` (el `simulate --transient` de la CLI) avanza con su paso fijo, así que
  allí un pulso se lee a un paso.

## Objetos de biblioteca (DHT, BME280, BMP280)

Un programa puede usar las clases de tres bibliotecas, como lo hacen los ejemplos de los propios
sensores ([sensores-de-biblioteca.md](sensores-de-biblioteca.md)):

```cpp
#include <DHT.h>
DHT dht(2, DHT11);          // una declaración GLOBAL: pin y tipo
Adafruit_BME280 bme;        // #include <Wire.h>, <Adafruit_Sensor.h>, <Adafruit_BME280.h>
Adafruit_BMP280 bmp;        // #include <Adafruit_BMP280.h>
```

| Clase | Métodos |
|---|---|
| `DHT` | `begin()`, `readTemperature()`, `readTemperature(true)` (°F), `readHumidity()`, `computeHeatIndex(t, h, false)` (°C; con `true` o sin nada, °F) |
| `Adafruit_BME280` | `begin()` (dirección 0x77), `begin(dirección)` (verdadero o falso), `readTemperature()`, `readPressure()` (Pa), `readHumidity()`, `readAltitude(presionMarHpa)` |
| `Adafruit_BMP280` | lo mismo sin `readHumidity`, y `begin(dirección, chipid)` |

También `Wire.begin()` (con o sin pines: se acepta y no hace nada; las bibliotecas arrancan el bus, y
un sensor responde solo en los pines I2C por defecto de la familia), `isnan(x)`, `NAN`, `F("texto")`
(el texto mismo) y las constantes `DHT11` y `DHT22`. `DHT22` se avisa (`SIM_PROGRAM_NOT_IN_KIT`):
todavía no está en el kit y sus lecturas dan `NaN`. Esos cinco includes no dan aviso. `Serial.print`
de un float escribe dos decimales (`24.00`, como Arduino), de `NaN` `nan` y de un infinito `inf`.

- **Tiempos:** una lectura real del DHT detiene el programa 25 ms; una que la biblioteca responde
  desde su caché de 2 s no toma nada; el `begin()` de un BME280 / BMP280 toma 100 ms. Esperan como
  `delay` (un generador del runtime, llamado con `yield*`), así que `millis()` alrededor lo muestra.
- **Cómo sigue siendo seguro.** El traductor acepta una declaración solo en el nivel superior y solo
  como `DHT nombre(pin, tipo);`, `Adafruit_BME280 nombre;` o `Adafruit_BMP280 nombre;`, con un nombre
  que no sea del runtime (`Serial`, `Wire`, el de una clase, una función o una constante) ni esté ya
  usado. El nombre del objeto nunca se escribe en el JavaScript: la declaración se vuelve
  `__new(<objeto>, <clase>, args)` y `dht.readHumidity()` se vuelve `(yield* __lib(0, 2))`, números
  de la propia tabla del traductor (`src/sim/libraries.js`). Al nombre de un objeto debe seguirle
  `.método(`; cualquier otra cosa (`dht.constructor`, `dht["x"]`, `dht` solo, una declaración dentro
  de una función, una llamada fuera de una) se rechaza (`SIM_PROGRAM_ERROR`); un método que no está en
  la lista de su clase se avisa y devuelve 0, sin que su nombre llegue al código. Como mucho
  `LIMITS.libraryObjects` (16) objetos. El runtime también revisa los números (un entero dentro de sus
  propios arreglos). Pruebas en `test/attack.test.js`.
- Cómo encuentra la placa el sensor de una llamada: [sensores-de-biblioteca.md](sensores-de-biblioteca.md#cómo-encuentra-la-placa-un-sensor).

## El plan

| Fase | Qué | Estado |
|---|---|---|
| **M1** | Modelo de pines con estados fijos (`io`), la placa con USB como fuente, límites y avisos | ✅ 2026-10-26 |
| **M2** | El programa: el `.ino` junto al circuito (o su texto), traducido a JavaScript; `pinMode`, `digitalWrite`, `digitalRead`, `delay`, `millis`, `Serial`; corre entre pasos de tiempo, `delay` espera en tiempo simulado; la página lo corre en tiempo real | ✅ 2026-10-26 |
| **M3** | PWM como una onda cuadrada real en el tiempo (`analogWrite`, `ledcWrite`), `tone`, el paso que necesita en la página y el brillo promediado del LED, el monitor serie en la ficha de la placa | ✅ 2026-10-26 |
| **M4** | Recetas con su programa: `esp32-led`, `esp32-button`, `uno-blink`, `uno-button`, `uno-pot-pwm`, `c3-blink`, `c3-pot-pwm`; probado potenciómetro → ADC → PWM con los números de cada placa | ✅ 2026-10-26 |
| **M5** | `pulseIn` (2026-11-10): una espera en tiempo simulado que mide entre los pasos que terminan en los flancos; `engine.advance` aterriza en los eventos de cada elemento; recetas `uno-distance`, `esp32-distance`, `distance-alarm-uno` con el HC-SR04 | ✅ 2026-11-10 |
| **M6** | Objetos de biblioteca (2026-11-10): `DHT`, `Adafruit_BME280`, `Adafruit_BMP280` como números de la tabla del traductor; la placa le pregunta al sensor conectado donde lo busca la biblioteca; recetas `uno-dht11`, `esp32-bme280`, `uno-bmp280-altitude` | ✅ 2026-11-10 |
| después | Un panel propio de consola serie en la página, `analogRead` con la curva real del ADC del ESP32, interrupciones (`attachInterrupt`), versiones simplificadas de librerías comunes, firmware real del UNO con avr8js como modo opcional, las dos filas de pines del ESP32 en un circuito (el límite del montaje) | — |

El programa maneja la memoria que guardan los pines (`gpioStage`: `mode`, `level`, `pull`) a
través de un elemento sin corriente propia (el controlador de la placa), así que el motor solo
aprendió a correr los programas en t = 0 (`settle`) y a decirle a la página que hay uno
(`hasProgram`).

## Ver también

- [simulacion.md](simulacion.md): el simulador y sus modelos.
- [formato-circuito.md](formato-circuito.md): el componente `module` y sus campos.
- [recetas.md](recetas.md): `esp32-led`, `esp32-button`.
