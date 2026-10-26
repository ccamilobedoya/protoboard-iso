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
| `esp32-led` | ESP32 DevKit que enciende un LED desde D13 | R1 = 220, D1 = red |
| `esp32-button` | ESP32 DevKit que lee un pulsador en D27 (pull-up interno) | — |

`catalog` (MCP) o `parts` (consola) las listan con sus valores; `catalog` con el nombre de una receta
(`parts <nombre>` en la consola) muestra lo que enseña, sus componentes, redes, fuente, y el papel y
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
- Junto con la receta se pueden dar `title`, `board`, `clearance`, `netLabels`, `page` y `lang`, que
  reemplazan los de la receta. `parts` y `nets`, nunca (`RECIPE_AND_PARTS`).

## Después del montaje

El circuito guarda `spec.recipe` (`{ name, values }`) junto a sus redes. Cambiar un valor después es
la misma llamada sobre el mismo objetivo con los valores nuevos (y `expect_revision`): cada
componente conserva sus agujeros, y `undo` trae los valores de antes. Para agregar componentes o
conexiones se llama a `layout` sobre él con `parts` y `nets` completos (`get_circuit` los muestra):
desde ahí es un circuito propio y pierde `spec.recipe`. Un valor o una descripción sola también se
cambian con `apply_ops`.

Lo que una receta todavía no hace: el ESP32 DevKit se dibuja y se revisa, pero no se simula (sus
recetas no tienen fuente), y sus pines son fijos (D13, D27). El 555 se simula desde el 2026-10-26: su
página parpadea, en cámara lenta (el tiempo de la página sigue a la constante de tiempo más lenta).

## Agregar una receta

1. Prueba antes la especificación como una llamada normal a `layout` (o un archivo JSON con `npm run
   layout-bench -- archivo.json`) hasta que salga `DONE`, con los componentes en orden de señal.
   Cuando no salga, decide si la culpa es de la receta o del algoritmo
   ([montaje-automatico.md](montaje-automatico.md#cambiar-el-algoritmo)): una receta rodea un límite
   solo si el circuito sigue siendo el habitual.
2. `src/recipes/<nombre>.js`: un módulo de datos, con un comentario al comienzo que diga qué circuito
   es. `name`, `title` y `teaches` (`{ en, es }`), `parts`, `nets`, `supplies`, y si hace falta
   `netLabels`, `page`, `clearance`, y `values`: para cada identificador que puede cambiar, `field`
   (lo que fija la forma corta) y, si hace falta, `role` (`{ en, es }`), `choices`, `min`/`max`,
   `extra` (los campos permitidos, cuando no sirven los de cada tipo).
3. Regístrala en `src/recipes/index.js` y corre `npm run schemas` (el esquema lista los nombres).
4. Agrégala a las tablas de esta página, de [recipes.md](../en/recipes.md) y de `SKILL.md`, y a la
   lista del agente `circuit-layout`. `npm test` comprueba que sale `DONE` con sus valores por
   defecto y con cada opción, que se simula sin forzar ningún componente, que su nombre no es el de
   ningún componente y que las dos páginas la nombran; `npm run layout-bench` muestra sus intentos y
   su tiempo.

## Ver también

- [montaje-automatico.md](montaje-automatico.md): el algoritmo detrás de cada receta.
- [agentes.md](agentes.md): un circuito de receta no necesita agente; la conversación principal
  llama a `layout`.
