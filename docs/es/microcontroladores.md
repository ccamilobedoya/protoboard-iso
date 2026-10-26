# Microcontroladores en la simulación

*[English](../en/microcontrollers.md)*

Cómo simula el kit las placas de desarrollo (ESP32 DevKit, ESP32-C3 SuperMini, Arduino UNO): no el
procesador, sino lo que se ve en los pines. Cada GPIO se comporta eléctricamente como el real, y un
programa corto con las funciones de Arduino decide, en el tiempo, qué hace cada pin. El mismo código
sirve para todas las placas; lo que cambia son los números de cada familia.

Planeado con el mantenedor el 2026-10-26. La fase M1 está hecha; siguen M2 a M4.

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
- **Todavía sin PWM.** Un promedio (una conductancia al riel y otra a tierra) dejaría pasar corriente
  por dentro del chip del riel a tierra, y la corriente promedio de un LED no es su corriente al
  voltaje promedio. El PWM conmuta en el tiempo en M3.
- Pruebas: `test/mcu.test.js` (VOH con la resistencia de salida, corriente del pull-up, el UNO a 5 V,
  5 V en un pin del ESP32, errores en `io`, `usb: false`).

## El plan

| Fase | Qué | Estado |
|---|---|---|
| **M1** | Modelo de pines con estados fijos (`io`), la placa con USB como fuente, límites y avisos | ✅ 2026-10-26 |
| **M2** | El programa: el `.ino` junto al circuito, traducido a JavaScript; `pinMode`, `digitalWrite`, `digitalRead`, `delay`, `millis`; corre entre pasos de tiempo (como el biestable del 555), `delay` espera en tiempo simulado; la página lo muestra corriendo (un LED parpadea al ritmo del programa) | ⬜ |
| **M3** | `analogRead` (el ADC), PWM como una onda cuadrada real en el tiempo (`analogWrite` en el UNO, `ledcWrite` en el ESP32), `Serial.print` a un panel de consola en la página | ⬜ |
| **M4** | Recetas para el UNO y el C3 (LED, pulsador, potenciómetro con ADC y PWM), las recetas del ESP32 con su programa, documentación y agentes | ⬜ |
| después | Interrupciones (`attachInterrupt`), versiones simplificadas de librerías comunes, firmware real del UNO con avr8js como modo opcional, las dos filas de pines del ESP32 en un circuito (el límite del montaje) | — |

El programa manejará la misma memoria que los pines guardan ahora (`gpioStage`: `mode`, `level`,
`pull`), leída en cada paso, así que M2 no le agrega ningún elemento al motor.

## Ver también

- [simulacion.md](simulacion.md): el simulador y sus modelos.
- [formato-circuito.md](formato-circuito.md): el componente `module` y sus campos.
- [recetas.md](recetas.md): `esp32-led`, `esp32-button`.
