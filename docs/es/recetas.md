# Recetas: circuitos de clase por su nombre

*[English](../en/recipes.md)*

Una receta es una especificación de `layout` que el kit guarda para un circuito de clase habitual:
sus componentes con valores por defecto, en orden de señal, sus redes y su fuente. Se llama por su
nombre con solo los valores que cambian, y sale lista (`STATUS: DONE`) en una llamada: cada receta
es un caso de `npm run layout-bench` y de `test/recipes.test.js`. Quien la llama no tiene que
resolver nada, así que un modelo pequeño, o un asistente que nunca ha visto el kit, obtiene un
circuito revisado al primer intento.

```json
{ "target": "interruptor", "recipe": "npn-switch", "values": { "R1": "470", "D1": "green", "V1": 9 } }
```

```bash
node bin/protoboard-iso.js layout interruptor --recipe npn-switch --values '{"R1":"470","V1":9}'
```

## Las recetas

| Receta | Circuito | Valores (por defecto, opciones o rango) |
|---|---|---|
| `led-resistor` | LED con resistencia en serie | R1 = 330, D1 = red, V1 = 5 V (1,5–15) |
| `divider` | Divisor de voltaje (salida donde se unen R1 y R2) | R1 = 10k, R2 = 10k, V1 = 9 V (1–30) |
| `npn-switch` | Pulsador → resistencia de base → transistor NPN que enciende un LED | R1 = 1k (base), R2 = 330, D1 = red, Q1 = 2N2222A (2N2222A, 2N3904, BC547, BC337, S8050), V1 = 5 V (3–12) |
| `potentiometer-led` | Cursor de un potenciómetro que regula un LED | RV1 = 10k, R1 = 330, D1 = red, V1 = 5 V (3–12) |
| `mosfet-switch` | Pulsador → MOSFET de nivel lógico que enciende un LED, con pull-down en la compuerta | R1 = 220 (compuerta), R2 = 10k (pull-down), R3 = 330, D1 = red, Q1 = IRLZ44N (IRLZ44N, 2N7000), V1 = 5 V (3–12) |
| `button-pullup` | Pulsador a tierra con pull-up; un LED muestra la salida | R1 = 1k (pull-up), R2 = 330, D1 = green, V1 = 5 V (3–12) |
| `button-pulldown` | Pulsador a la fuente con pull-down; un LED muestra la salida | R1 = 10k (pull-down), R2 = 330, D1 = green, V1 = 5 V (3–12) |
| `rc-square` | RC cargado por una onda cuadrada de un generador de señales | R1 = 1k, C1 = 1u, G1 = 100 Hz (0,1–100000) |
| `555-astable` | NE555 astable que hace parpadear un LED | R1 = 1k, R2 = 10k, C1 = 10u, R3 = 330, D1 = red, V1 = 9 V (4,5–15) |
| `regulator-7805` | Regulador 78xx, sus condensadores y un LED piloto | U1 = 7805 (7805, 7806, 7808, 7809), R1 = 1k, D1 = red, V1 = 9 V (7–35) |
| `regulator-ams1117` | Módulo AMS1117 que alimenta un LED | U1 = AMS1117-3.3 (AMS1117-3.3, AMS1117-5.0), R1 = 220, D1 = red, V1 = 5 V (4,5–15) |
| `bridge-rectifier` | Puente, condensador de filtro y un LED, con una senoidal en los rieles de arriba | C1 = 470u, R1 = 1k, D1 = red, G1 = 12 V de pico (3–30) |
| `zener-regulator` | Zener y su resistencia en serie que sostienen una carga | R1 = 470, D1 = 1N4733A (cualquier 1N47xx), R2 = 1k (carga), V1 = 9 V (3–30) |
| `esp32-led` | ESP32 DevKit que hace parpadear un LED en D13, con su programa | R1 = 220, D1 = red, U1 = su programa (`program`) |
| `esp32-button` | ESP32 DevKit que lee un pulsador en D27 (pull-up interno) e imprime lo que lee | U1 = su programa (`program`) |
| `uno-blink` | Arduino UNO que hace parpadear un LED en D13 | R1 = 220, D1 = red, U1 = su programa (`program`) |
| `uno-button` | Arduino UNO: un pulsador en D2 (pull-up interno) enciende un LED en D13 | R1 = 220, D1 = green, U1 = su programa |
| `uno-pot-pwm` | Arduino UNO: un potenciómetro en A0 regula un LED en D9 (ADC y PWM a 490 Hz) | RV1 = 10k, R1 = 220, D1 = red, U1 = su programa |
| `uno-rgb-led` | Arduino UNO que mezcla los colores de un LED RGB (cátodo común) con PWM en D9, D10 y D11, una resistencia por chip | R1, R2, R3 = 220 (rojo, verde, azul), U1 = su programa |
| `uno-seven-segment` | Arduino UNO que cuenta de 0 a 9 en un display de 7 segmentos (5161AS, cátodo común), los segmentos a–g en D2–D8 con una resistencia cada uno | R1 … R7 = 220 (segmentos a … g), U1 = su programa |
| `slide-switch-leds` | Un interruptor deslizante (SPDT) elige cuál de dos LEDs se enciende: la fuente en su común, un LED rojo en la pata 1 y uno verde en la 2 | R1, R2 = 330 (LED rojo, verde) |
| `tilt-alarm` | Un interruptor de inclinación (SW-520D) pone en corto un LED mientras está derecho; al voltearlo se abre y el LED se enciende | R1 = 330 |
| `relay-npn` | Un pulsador maneja un NPN que maneja la bobina de un relé, con un 1N4007 en paralelo con la bobina; el contacto del relé enciende un LED | R1 = 1k (base), R2 = 330 (LED, en el contacto), Q1 = 2N2222A (2N2222A, BC337, S8050) |
| `motor-npn` | Un potenciómetro fija la velocidad de un motor DC a través de un TIP120 como seguidor de emisor, con un 1N4007 en paralelo con el motor | RV1 = 0,8 (la posición del cursor, 0–1), M1 = 0 (carga, mN·m, 0–3) |
| `lm35-uno` | Arduino UNO que lee un LM35 en A0 y escribe la temperatura en el monitor serie (10 mV por °C) | U2 = 25 (°C), U1 = su programa |
| `pir-lamp` | Un módulo de movimiento PIR mantiene OUT alto durante su retardo; OUT maneja un NPN que enciende un LED, a 5 V; el interruptor de movimiento del ambiente y el retardo en la página | U1 = 5 (retardo, s; también mode y warmup), R1 = 4.7k (base), R2 = 330, D1 = yellow |
| `pir-uno` | Arduino UNO: la salida OUT de un módulo PIR en D2; el programa escribe MOTION y el instante de cada movimiento nuevo con `millis()` | U2 = 5 (retardo, s), U1 = su programa |
| `touch-toggle-led` | Un módulo táctil TTP223 en modo alterna enciende un LED directo desde su pin I/O, a 3,3 V; la resistencia mantiene la corriente bajo los 4 mA con que se garantiza su nivel alto | U1 = toggle (toggle, momentary), R1 = 470, D1 = red |
| `touch-uno` | Arduino UNO: un módulo táctil TTP223 en D2, alimentado con el pin de 3,3 V del UNO (su salida es entonces de 3,3 V, sobre los 3 V que pide un HIGH); el programa escribe TOUCH y RELEASE | U2 = momentary (momentary, toggle), U1 = su programa |
| `c3-blink` | ESP32-C3 SuperMini que hace parpadear un LED en GPIO3 | R1 = 220, D1 = red, U1 = su programa |
| `c3-pot-pwm` | ESP32-C3: un potenciómetro en GPIO4 regula un LED en GPIO3 (ADC y PWM a 1 kHz) | RV1 = 10k, R1 = 220, D1 = red, U1 = su programa |
| `opamp-comparator` | LM358 que compara un potenciómetro con la mitad de la fuente; un LED en su salida | RV1 = 10k (cursor en 30 %), R1 = 10k, R2 = 10k, R3 = 330, D1 = red, U1 = LM358 (LM358, LM324), V1 = 5 V (5–30) |
| `lm393-comparator` | Comparador LM393: su colector abierto hunde la corriente de un LED alimentado desde la fuente | RV1 = 10k (cursor en 30 %), R1 = 10k, R2 = 10k, R3 = 330, D1 = red, V1 = 5 V (3–30) |
| `opamp-follower` | Seguidor de voltaje con LM358: la salida copia un potenciómetro y alimenta un LED | RV1 = 100k, R1 = 330, D1 = red, U1 = LM358 (LM358, LM324), V1 = 9 V (5–30) |
| `opamp-noninverting` | Amplificador no inversor con LM358, ganancia 1 + R2/R1, una senoidal del generador en V+ | R1 = 10k, R2 = 20k, U1 = LM358 (LM358, LM324), V1 = 9 V (5–30), G1 = 0,5 V de pico (0,01–5) |
| `opamp-inverting` | Amplificador inversor con LM358, ganancia −R2/R1 alrededor de la mitad de la fuente (un divisor en V+) | R1 = 10k, R2 = 20k, U1 = LM358 (LM358, LM324), V1 = 9 V (5–30), G1 = 0,5 V de pico (0,01–3) |
| `ldr-night-light` | Una fotorresistencia y una resistencia en un divisor manejan la base de un NPN; el LED se enciende a oscuras (siente `light`) | R1 = 10k (divisor), R2 = 10k (base), R3 = 330, D1 = red, V1 = 5 V (3–12) |
| `ldr-comparator` | LM393 que compara el divisor de una fotorresistencia con la referencia de un potenciómetro; el LED se enciende a oscuras (siente `light`) | RV1 = 0,5 (la posición de la referencia, 0–1), R1 = 10k, R2 = 10k (pull-up), R3 = 330, D1 = red, V1 = 5 V (3–30) |
| `lm35-comparator` | LM393 que compara un LM35 con una referencia de unos 0,42 V de un divisor; el LED se enciende por encima de unos 42 °C (siente `temperature`) | R1 = 10k, R2 = 910, R3 = 330, D1 = red |
| `ntc-follower` | Divisor con termistor NTC copiado por un seguidor LM358 hacia una carga de 10k (siente `temperature`) | TH1 = 10k, R1 = 10k, R2 = 10k (carga), V1 = 9 V (5–30) |
| `thermistor-uno` | Arduino UNO que lee un divisor con NTC en A0 y escribe `T=<°C>` cada segundo con la ecuación B (siente `temperature`) | TH1 = 10k, R1 = 10k, U1 = su programa (`program`) |
| `rain-alarm` | Un módulo de lluvia MH-RD cuyo DO, en bajo cuando está mojado, enciende un PNP (S8550) que activa un zumbador | U1 = 0,5 (umbral, 0,05–0,95), R1 = 1k (base) |
| `soil-led` | Un módulo de suelo YL-69 que enciende un LED hacia su DO con el suelo húmedo | U1 = 0,5 (umbral), R1 = 470, D1 = verde |
| `light-switch-module` | El módulo LDR-LM393 de 3 pines que enciende un LED hacia su DO con luz | U1 = 0,5 (umbral), R1 = 470, D1 = amarillo |
| `line-follower-uno` | Arduino UNO que lee un seguidor de línea TCRT5000 (DO en D2, AO en A0) y escribe LINE / NO LINE | U2 = 0,5 (umbral), U1 = su programa |
| `obstacle-buzzer` | Un módulo de obstáculos FC-51 que absorbe por su OUT la corriente de un zumbador | U1 = 0,5 (umbral), R1 = 470 |
| `hall-counter-uno` | Arduino UNO que cuenta las pasadas de un imán con un KY-024 (DO en D2, flancos de bajada) | U2 = 0,5 (umbral), U1 = su programa |
| `encoder-uno` | Arduino UNO: un encoder rotativo KY-040 en D2 (CLK), D3 (DT) y D4 (SW), alimentado con el pin de 5 V; el programa cuenta clics (CLK cae, DT dice hacia dónde), escribe la cuenta cuando cambia y la pone en cero con el pulsador | U2 = 0 (bounce, ms), U1 = su programa |
| `encoder-dimmer-uno` | lo mismo, con un LED en D9 (por R1) cuyo brillo PWM sigue a la cuenta, 13 cuentas por clic, la cuenta retenida entre 0 y 20 | R1 = 220, D1 = green, U1 = su programa |
| `laser-tripwire` | Un láser KY-008 siempre encendido y un módulo LDR-LM393: corta el haz (el `beam` del ambiente) y DO enciende el LED con un NPN | U1 = 0,1 (umbral), R1 = 1k (base), R2 = 330, D1 = rojo |
| `laser-uno` | Arduino UNO que hace parpadear un KY-008 a 1 Hz con un NPN (D7) e imprime una fotorresistencia en A0 | R1 = 10k (divisor), R2 = 1k (base), U1 = su programa |
| `uno-distance` | Arduino UNO que mide distancia con un HC-SR04 (TRIG D9, ECHO D10, `pulseIn`, `us / 58`); ambiente `distance` 30 cm (rango 2–100) y 20 °C | U1 = su programa |
| `esp32-distance` | ESP32 DevKit con un HC-SR04 en VIN (5 V): ECHO por un divisor de 1 kΩ / 2 kΩ para que el pin de 3,3 V vea 3,33 V | R1 = 1k, R2 = 2k, U1 = su programa |
| `distance-alarm-uno` | `uno-distance` con un LED en D13 que se enciende a menos de 15 cm | R1 = 220, D1 = rojo, U1 = su programa |

`parts` (consola) las lista con su título; el `catalog` compacto (MCP) solo da sus nombres, por grupo (`basics`, `transistors`, `power`, `timing`, `op-amps`, `boards`, `sensors`, `sensor-modules`), para ser corto; `catalog` con el nombre de una receta
(`parts <nombre>` en la consola) muestra su título y su grupo, lo que enseña, sus componentes, redes, fuente, y el papel y
los límites de cada valor.

## Valores

- **Forma corta**: el campo principal del elemento. `"R1": "470"` (el valor de una resistencia),
  `"D1": "green"` (el color de un LED), `"Q1": "BC547"` (una referencia), `"V1": 9` (el voltaje de
  una fuente), `"G1": 1000` (la frecuencia o la amplitud de un generador, según la receta).
- **Forma larga**: algunos campos del elemento, `"R1": { "value": "470", "tolerance": "1%" }`.
  Además del campo principal se permiten `tolerance` y `power` en resistencias, `kind` y `voltage`
  en condensadores, `color` en LED y pulsadores, `style` y `position` en potenciómetros, y los
  campos de una fuente.
- **Solo cambia lo que la receta lista.** Cualquier otra cosa, un valor fuera de las opciones o del
  rango, o un campo no permitido, es un `FIX_SPEC` que dice qué se permite (`RECIPE_VALUE_UNKNOWN`,
  `RECIPE_VALUE_CHOICE`, `RECIPE_VALUE_RANGE`, `RECIPE_VALUE_FIELD`; una receta desconocida,
  `RECIPE_UNKNOWN`, viene con los nombres más parecidos). Los identificadores y las redes no
  cambian nunca: son lo que hace que la receta salga lista.
- Junto con la receta se pueden dar `title`, `board`, `clearance`, `netLabels`, `environment`, `page`
  y `lang`, que reemplazan los de la receta. `parts` y `nets`, nunca (`RECIPE_AND_PARTS`).

## Recetas con un sensor real

Una receta puede llevar un `environment` y un `page` ([ambiente.md](ambiente.md)), que pasan al
circuito que produce igual que su título y sus fuentes. Las cinco recetas con sensor
(`ldr-night-light`, `ldr-comparator`, `lm35-comparator`, `ntc-follower`, `thermistor-uno`) declaran
cada una el campo que sienten en su valor por defecto (`light` 300 lx o `temperature` 25 °C) y una
entrada `page.controls` `{ "environment": "light" }` (o `temperature`): la página ofrece ese
deslizador con su indicador, una línea de tiempo puede hacerle `set`, y ninguna pieza lleva un valor
propio, así que el circuito sigue al ambiente. Nada en ellas hace de sensor: la fotorresistencia es
una GL5528, el termómetro un LM35 o un NTC de 10k (B 3950).

| Receta | Qué hace con los valores por defecto |
|---|---|
| `ldr-night-light` | La fotorresistencia queda del lado de tierra del divisor, así que el voltaje de la base sube cuando baja la luz. El LED tiene unos 9 mA hasta 100 lx, se atenúa entre 100 y 300 lx (unos 2 mA a 200 lx, donde la fotorresistencia baja a unos 2 kΩ) y está apagado (unos 0,1 mA) a 300 lx |
| `ldr-comparator` | La fotorresistencia está sobre la de 10k, así que el divisor baja con la luz; con la referencia a la mitad de la fuente la salida tira hacia abajo por debajo de unos 18 lx (la fotorresistencia igual a 10k) y el LED se enciende (unos 8 mA a 10 lx, nada a 300 lx) |
| `lm35-comparator` | El LM35 da 10 mV por °C a IN+; la referencia es 0,417 V (unos 42 °C). Por encima, la salida se suelta y R3, el pull-up de la salida, alimenta el LED hacia tierra (unos 10 mA); por debajo, la salida tira hacia abajo y el LED ve menos de 1 V (apagado). El LED no va "como en las recetas con potenciómetro" (desde la fuente, encendido con la salida baja) porque aquí la alarma debe encenderse cuando la entrada es *mayor* |
| `ntc-follower` | El NTC está del lado de la fuente, así que el voltaje sube al calentarse; el seguidor lo copia a 10k. La fuente es de 9 V: la salida de un LM358 se queda a unos 1,5 V de la fuente, y desde 5 V recortaría el voltaje que da el divisor a 60 °C |
| `thermistor-uno` | El mismo NTC sobre 10k en los 5 V del UNO, leído en A0; el programa saca la resistencia del conteo del ADC y la temperatura de `1/T = 1/T0 + ln(R/R0)/B`, y escribe `T=<valor>` cada segundo (a menos de 1,5 °C del ambiente a 25 y a 60 °C) |
| `laser-tripwire`, `laser-uno` | El láser (unos 28 mA, 3 mW) agrega unos 9,8 klx a los 50 lx del cuarto para todo sensor de luz. En la barrera el trimmer del módulo está en 0,1 (Vref 0,5 V, el cambio cerca de 300 lx): con el haz DO está en 0,2 V y el LED apagado; con `beam` encendido la fotorresistencia ve 50 lx, DO sube a unos 2 V y el LED tiene unos 9,6 mA. En `laser-uno` D7 maneja el láser con un NPN (directo desde el pin, su salida de 40 Ω deja el láser en unos 20 mA, por debajo de su umbral: sin haz); el monitor serie muestra `on  A0=1005` y `off A0=688` cada segundo |
- Junto con la receta se pueden dar `title`, `board`, `clearance`, `netLabels`, `environment`, `page` y `lang`, que
  reemplazan los de la receta. `parts` y `nets`, nunca (`RECIPE_AND_PARTS`).

## Después del montaje

El circuito guarda `spec.recipe` (`{ name, values }`) junto a sus redes. Cambiar un valor después es
la misma llamada sobre el mismo objetivo con los valores nuevos (y `expect_revision`): cada
componente conserva sus agujeros, y `undo` trae los valores de antes. Para agregar componentes o
conexiones se llama a `layout` sobre él con `parts` y `nets` completos (`get_circuit` los muestra):
desde ahí es un circuito propio y pierde `spec.recipe`. Un valor o una descripción sola también se
cambian con `apply_ops`.

Las recetas de microcontroladores (ESP32, UNO, C3) corren un programa
([microcontroladores.md](microcontroladores.md)); `values: { "U1": "parpadeo.ino" }` pone el programa
propio en su lugar (un archivo junto al circuito, o su texto). Sus pines son fijos; las del C3 dejan
todo en su fila de pines izquierda (5V, GND, 3V3, GPIO0–4). El 555 se simula desde el 2026-10-26: su
página parpadea, en cámara lenta (el tiempo de la página sigue a la constante de tiempo más lenta).

## Agregar una receta

1. Prueba antes la especificación como una llamada normal a `layout` (o un archivo JSON con `npm run
   layout-bench -- archivo.json`) hasta que salga `DONE`, con los componentes en orden de señal.
   Cuando no salga, decide si la culpa es de la receta o del algoritmo
   ([montaje-automatico.md](montaje-automatico.md#cambiar-el-algoritmo)): una receta rodea un límite
   solo si el circuito sigue siendo el habitual.
2. `src/recipes/<nombre>.js`: un módulo de datos, con un comentario al comienzo que diga qué circuito
   es. `name`, `title` y `teaches` (`{ en, es }`), `parts`, `nets`, `supplies`, y si hace falta
   `netLabels`, `environment`, `page`, `clearance`, y `values`: para cada identificador que puede cambiar, `field`
   `netLabels`, `environment` (el del circuito, para un sensor), `page`, `clearance`, y `values`: para cada identificador que puede cambiar, `field`
   (lo que fija la forma corta) y, si hace falta, `role` (`{ en, es }`), `choices`, `min`/`max`,
   `extra` (los campos permitidos, cuando no sirven los de cada tipo).
3. Dale un `group` (una palabra de `RECIPE_GROUPS` en `src/recipes/index.js`, puesta en el propio módulo; el catálogo compacto lista las recetas por grupo, solo nombres, y una prueba falla si una receta no lo tiene; un grupo nuevo necesita sus textos `recipe.group.<nombre>` en `src/i18n/en.js` y `es.js`). Regístrala en `src/recipes/index.js` y corre `npm run schemas` (el esquema lista los nombres).
4. Agrégala a las tablas de esta página, de [recipes.md](../en/recipes.md) y de `SKILL.md`, y a la
   lista del agente `circuit-layout`. `npm test` comprueba que sale `DONE` con sus valores por
   defecto y con cada opción, que se simula sin forzar ningún componente, que su nombre no es el de
   ningún componente y que las dos páginas la nombran; `npm run layout-bench` muestra sus intentos y
   su tiempo.

## Ver también

- [montaje-automatico.md](montaje-automatico.md): el algoritmo detrás de cada receta.
- [agentes.md](agentes.md): un circuito de receta no necesita agente; la conversación principal
  llama a `layout`.
