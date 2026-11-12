# Sensores con tiempo: un PIR y un módulo táctil

*[English](../en/timed-sensors.md)*

La mayoría de los sensores responden de una vez: cambia la luz y cambia la resistencia. Dos módulos
del kit responden **en el tiempo**: esperan, sostienen, descansan e ignoran, y quien no lo sabe cree
que el módulo está dañado. El sensor de movimiento PIR HC-SR501 (`pir-sensor`) y el sensor táctil
TTP223 (`touch-sensor`) se simulan con una pequeña máquina de estados cada uno, así que la espera se
ve: en la ficha (una fase en palabras y el tiempo que falta), en la pieza de cerca (una barra que se
vacía) y en un video. Leen los campos `motion` y `touch` del ambiente ([ambiente.md](ambiente.md));
cada uno tiene además su propio interruptor, que lo separa del campo.

El código es `src/sim/devices/pir.js` y `touch.js` (las máquinas son las funciones puras
`pirAdvance` y `touchAdvance`), sus números `PIR` y `TOUCH` en `src/sim/models.js`, los tipos
`src/parts/types/timed-sensors.js` y los dibujos `src/parts/packages/timed-sensors.js`.

## El PIR (HC-SR501)

Patas `VCC`, `OUT`, `GND`, como las imprime la placa. Funciona de 4,5 a 20 V; `OUT` es de 3,3 V
detrás de 500 Ω mientras está activo y 0 V si no, sea cual sea la alimentación; el módulo toma
65 µA a 5 V.

| Campo | Por defecto | |
|---|---|---|
| `delay` | 5 | segundos que `OUT` queda alto (el trimmer Tx); de 2,5 a 600 (2,5 s es el trimmer al mínimo), el deslizador de 3 a 300 s |
| `mode` | `"H"` | el puente: `H` el movimiento durante el retardo lo reinicia, `L` el movimiento se ignora mientras está alto |
| `warmup` | 30 | segundos tras encenderlo con `OUT` bajo y el movimiento ignorado; 0 lo omite |
| `sensitivity` | 0.5 | el otro trimmer; informativo, el modelo no tiene alcance |
| `motion` | | el valor propio de la pieza para el campo `motion` (true o false); sin él sigue al ambiente |

```text
encendido (VCC ≥ 4,5 V)
   │
   ▼
calentamiento ──(Tw)──▶ espera ──movimiento──▶ alto ──(Tx)──▶ descanso ──(2,5 s)──▶ espera
 OUT bajo               OUT bajo               OUT alto        OUT bajo, movimiento ignorado
 movimiento ignorado    esperando              H: el movimiento reinicia Tx · L: se ignora
```

- El movimiento en `espera` pone `alto` de una vez, en el paso en que llega.
- En `H`, con el movimiento sostenido `OUT` queda alto para siempre; baja Tx después del último movimiento.
- En `L`, `OUT` baja Tx después del primer movimiento pase lo que pase; con el movimiento sostenido
  queda alto Tx, bajo 2,5 s, alto Tx… (el comportamiento que sorprende a quien aprende).
- Tras la bajada el módulo descansa 2,5 s e ignora el movimiento; si al terminar sigue habiendo
  movimiento, vuelve a subir de una vez.
- El calentamiento cuenta desde que `VCC` llega a 4,5 V por primera vez; una fuente apagada y
  encendida lo empieza de nuevo. Con menos de 4,5 V el módulo no arranca (`SIM_MODULE_LOW_SUPPLY`).
- Más de 20 V es `SIM_IC_SUPPLY`; pedirle a `OUT` más de 2 mA es `SIM_OVER_CURRENT` (es una salida
  débil: una entrada lógica o la base de un transistor, nunca una lámpara). El calentamiento es una
  nota, `SIM_PIR_WARMUP`.

Sus controles: `motion` (un interruptor), `retrigger` (el puente: true es `H`) y `delay` (deslizador logarítmico).

## El sensor táctil (TTP223)

Patas `SIG` (impresa `I/O`), `VCC`, `GND`. Funciona de 2 a 5,5 V y su salida es una etapa push-pull:
`SIG` se une a `VCC` por 150 Ω cuando está alto y a `GND` por 75 Ω cuando está bajo, así que su
nivel alto es la propia alimentación del módulo. El LED indicador de la placa no se modela (tomaría
cerca de un miliamperio de `SIG`).

| Campo | Por defecto | |
|---|---|---|
| `mode` | `"momentary"` | `momentary`: `SIG` sigue al toque; `toggle`: cada toque la invierte, soltar no hace nada |
| `activeLow` | false | la polaridad: `SIG` bajo mientras se toca (o mientras una alterna está encendida) |
| `fast` | false | la respuesta de 60 ms en vez de la de 220 ms de bajo consumo (y 7 µA en vez de 3 µA) |
| `touch` | | el valor propio de la pieza para el campo `touch` |

- Durante 0,5 s tras encenderlo el chip calibra el pad y lo ignora. Un dedo puesto en ese momento es
  la referencia: cuenta solo cuando se levanta (`held` en la ficha).
- Un cambio de `touch` se registra cuando ha durado el tiempo de respuesta; un toque más corto no se
  registra. Una alterna se invierte cuando el toque se registra, no cuando se suelta.
- `SIG` por encima de 10 mA es `SIM_OVER_CURRENT`; entre los 4 mA entregados o 8 mA recibidos con que
  se garantizan sus niveles y los 10 mA, `SIM_TOUCH_OUTPUT_SPEC` (una nota). Más de 5,5 V es
  `SIM_IC_SUPPLY` (los 5,5 V son el tope del rango de trabajo, de 2,0 a 5,5 V, y en la copia de la hoja del TTP223-BA6 que se encontró, una preliminar, también son el máximo absoluto, así que una fuente de 5 V, el 91 %, sale como «cerca» en la ficha: el aviso es correcto, no es un error en el dato de la pieza), menos de 2 V `SIM_MODULE_LOW_SUPPLY` (el código que usa también el PIR). *Confirmado
  2026-11-09:* los 10 mA del esfuerzo y los 4 mA / 8 mA de la nota son una decisión del kit a partir de
  los puntos de prueba de la hoja, no límites que la hoja dé.

Sus controles: `touch` (un interruptor) y `toggleMode`.

Los dos módulos se apagan bajo su alimentación mínima: la salida queda entonces en alta impedancia
(un pull-up externo la sube al riel, y el módulo no se alimenta por su propio pin), y una
alimentación al revés (más de 0,3 V invertidos, una cifra del kit: ninguno tiene diodo de
protección) es `SIM_REVERSE_VOLTAGE`.

## Cómo el motor lleva el estado de un dispositivo

Un deslizador en otra pieza rearma todo el sistema ([simulacion-en-vivo.md](simulacion-en-vivo.md)):
un elemento nuevo por cada pieza. El voltaje de un condensador o un pestillo sobrevive porque
`engine.js` copia las claves de su lista `STATE` entre los elementos viejos y los nuevos. Un
dispositivo con memoria propia lista las claves de sus elementos en `state`:

```js
export const pir = {
  types: ['pir-sensor'],
  state: ['phase', 'clock', 'powered'],   // se llevan, con la lista de fábrica, en engine.set
  …
};
```

Una clave se lleva solo si el elemento nuevo la define desde el principio (`phase: 0` en el literal
del elemento). Los elementos viejos aceptan el paso que estaba pendiente antes de la copia, así que
el reloj no pierde tiempo; los nuevos arrancan desde él.

Dos métodos opcionales más de un elemento sirven a la página:

- `maxStep()` (segundos, o `null`): un paso que el elemento necesita mientras cuenta tiempo;
  `engine.stepHint()` da el menor de ellos y el del PWM, y la página acorta su paso hasta él. El
  PIR pide 10 ms mientras cuenta, nada mientras espera movimiento.
- `span()` (segundos): el tiempo más corto que importa. `engine.stimuli()` lo lista junto a los
  programas del ambiente, así que un circuito cuyo único reloj es un sensor con tiempo corre en
  tiempo real (pasos de una doscientosava parte del tramo, de 1 a 20 ms) en vez de quedarse en una
  página quieta.

## Estampar el final del paso

Un elemento cambia su memoria en `accept(x, { h })`, al comenzar el paso siguiente. Si estampara el
estado que tiene, una salida cambiaría un paso después de su hora. Estos dos estampan el estado que
tendrán al **final** del paso que se resuelve (`ahead(x, ctx)`: la función pura aplicada a `ctx.h`),
así que la bajada de `OUT` se lee en el paso que termina en ella. Un control que mueve la entrada
(`motion`, `touch`) rearma el elemento y resuelve con un paso muy corto, así que un flanco de subida
se ve de inmediato. En el punto de operación (`ctx.h` ausente) no pasa tiempo.

## Agregar otro sensor con tiempo

1. La máquina de estados como función pura `(estado, h, powered, parámetros) → estado`, con una
   prueba de cada tiempo que da la hoja (unos pasos de `h`, como hace `test/timed-sensors.test.js`).
2. Un elemento con `phase`/`clock` (y lo demás que guarde) puestos en su literal, un `accept` que
   aplica la función, un `ahead` que la aplica a `ctx.h` para `stamp`/`currents`, y `maxStep`/`span`.
3. El dispositivo con `state: [...]`, `senses` y `controls`/`set` como cualquier sensor
   ([agregar-componentes.md](agregar-componentes.md#7-un-sensor-unirse-al-ambiente)).
4. La lectura lleva la fase en palabras y `left` (segundos) para la ficha, y un `length` para una barra.
