# Falstad: abrir el circuito allá y comparar los dos simuladores

*[English](../en/falstad.md)*

[CircuitJS de Falstad](https://www.falstad.com/circuit/) es el simulador de circuitos en el
navegador más usado para aprender. El kit lo usa de dos maneras:

1. **Abrir en Falstad**: la página en vivo de cada circuito tiene un enlace en su menú ⋯ que abre el mismo
   circuito en CircuitJS, como está en ese momento (los deslizadores, el pulsador, la carga de la
   batería).
2. **Segunda referencia**: unos circuitos de prueba se corren en los dos simuladores con los
   mismos modelos, y una prueba comprueba que den lo mismo.

Las dos usan el mismo exportador: `toFalstad(program, opciones)` en `src/sim/falstad.js`.

## El botón

- Aparece solo en la página en vivo, o sea siempre que el circuito se pueda simular y `page.simulation` no sea false.
  Falstad muestra todos los valores, así que sigue la misma regla de predicción que los
  resultados.
- Cada vez que se toca, exporta el circuito de nuevo con el estado del motor
  (`engine.program()`): lo que se ve es lo que se abre.
- Si algún componente se exporta como un **equivalente** o queda fuera, al lado aparece
  **⚠ n**. Al tocarlo se abre la lista en la pestaña *Circuito* del inspector. La exportación se hace de todas
  maneras.

| En el kit | En Falstad | Aviso |
|---|---|---|
| Resistencia, condensador, bobina (con su resistencia de alambre), potenciómetro, cable | La misma pieza | — |
| Diodo, LED (con su color), transistor bipolar | La misma pieza, con el modelo del kit (líneas `34` y `32`) | — |
| Pulsador | El interruptor momentáneo de Falstad: se mantiene presionado con el mouse | — |
| Fuente de banco | Fuente ideal (con su resistencia interna, si tiene) | Solo si su límite de corriente está actuando |
| Generador de señales | La fuente de Falstad con la misma onda, más su resistencia de salida | — |
| Batería | Fuente con su resistencia interna en serie | Sí: la carga no baja con el uso |
| NTC, fotorresistencia | Resistencia fija con su valor de ahora | Sí: los sensores de Falstad siguen otra curva |
| Zumbador | Su bobina, como resistencia | Sí |
| Puente rectificador | Cuatro diodos con el mismo modelo | Sí |
| Darlington (TIP120, BC517) | Sus dos transistores y sus dos resistencias | Sí |
| Zener | El Zener de Falstad, calibrado para dejar pasar 5 mA al mismo voltaje | Sí: la rodilla es distinta |
| MOSFET | El MOSFET de Falstad (misma Vth y k) | Sí: se enciende de golpe y no tiene λ |
| Regulador (78xx, LM317) | Nada | Sí: el LM317 de Falstad es un subcircuito que solo entra con su formato XML |
| Chips y placas | Nada | Sí: el kit todavía no los simula |
| Pines de cabecera | Nada | — |

### Cómo se dibuja en Falstad

Como un esquema de libro (`src/sim/falstad-layout.js`):

- Cada nodo es una **fila**, un cable horizontal, ordenada por su voltaje (tensión) en DC según
  el kit: el más alto arriba, la tierra abajo. La corriente baja por la página.
- Los componentes de dos patas van **de pie** entre las filas de sus dos nodos. Los que están en
  serie (un nodo solo con ellos dos, uno por arriba y otro por abajo) comparten columna, uno
  detrás del otro: la resistencia y el LED quedan en una sola línea.
- Los **cables de puente** de la protoboard unen sus grupos en un solo nodo: en el esquema no
  aparecen (en el modo exacto sí, como su resistencia de 0,05 Ω).
- Un transistor ocupa dos columnas: colector y emisor (drenador y fuente) suben y bajan derecho
  a sus filas; la base (compuerta) sale a la izquierda. Un potenciómetro va centrado en media
  fila, con el cursor cableado a la derecha.
- Las columnas empiezan por las fuentes y siguen el circuito hacia afuera. Después se prueban
  otros órdenes, moviendo una columna a la vez, y se queda el que tenga menos cruces entre los
  cables de las filas y los componentes, y después los cables más cortos.
- Cada nodo lleva una etiqueta con el nombre de su grupo en la protoboard (`T+`, `9:f-j`): dónde
  está en la protoboard, y lo que lee la comparación (`getNodeVoltage`). Hay un símbolo de tierra
  en la tierra. Los nodos que solo necesita Falstad se llaman como el componente con un número
  (`BT1.1`, entre la fuente y la resistencia interna de la batería).

Un circuito con nodos sueltos (sin voltaje en DC) sigue saliendo bien conectado, pero su orden
de filas es el de aparición y se ve menos ordenado.

### Detalles del formato

- Es el formato de texto de CircuitJS (una línea por elemento), el que Falstad todavía importa.
  Su formato nuevo es XML; el kit podrá pasar a él para el λ del MOSFET y el LM317.
- El enlace lleva el texto en `?cct=` con `encodeURI`: Falstad lo lee con `decodeURI`, que deja
  codificados `:` y otros caracteres reservados. Los nombres se escapan como lo hace Falstad
  (`T+` → `T\p`).
- El voltaje térmico de Falstad (25,865 mV) es un poco distinto del del kit (25,852 mV): el
  coeficiente de emisión se escala para que las dos curvas sean la misma.
- El paso de tiempo sale de las constantes de tiempo del circuito, como en la página en vivo.

## La comparación

Los casos son archivos de circuito en `test/falstad/cases/`. Para cada uno, el exportador escribe
la versión **exacta** (`exact: true`):

- los cables y los contactos del pulsador conservan sus resistencias pequeñas (0,05 Ω y 0,1 Ω);
- el potenciómetro va como sus dos resistencias, porque el de Falstad mueve el cursor en pasos
  (0,3 se vuelve 0,302);
- condensadores y bobinas usan Euler hacia atrás, como el kit.

Falstad corre cada caso hasta que los voltajes (tensiones) se quietan y devuelve el voltaje de
cada etiqueta. Los casos con un generador de señales (`TRANSIENT` en `test/falstad/cases.js`) se
corren desde t = 0 hasta `stop` y se guardan paso a paso (con `ontimestep`), con el paso de Falstad;
la prueba corre el transitorio del kit con ese mismo paso y compara muestra por muestra. Falstad
pone cada fuente en su valor al empezar el paso y el kit al terminarlo: en el modo exacto el
generador va adelantado un paso (un desfase de 2π·f·h) para que los dos usen el mismo valor. Eso se guarda en `test/falstad/refs/<caso>.json`, junto con el texto exportado.
`test/falstad.test.js` compara el kit con esas referencias **sin red**:

- con el mismo modelo, la diferencia debe ser menor que 1 µV;
- los casos con un modelo distinto en Falstad tienen su tolerancia y su razón en `ALLOWED`;
- un caso sin referencia, o cuya referencia se corrió con otra exportación (cambió un modelo o
  el exportador), se salta y lo dice: hay que correrlo otra vez.

Resultado del 2026-10-15:

| Caso | Diferencia mayor | Por qué |
|---|---|---|
| `voltage-divider` | 45 nV | mismo modelo |
| `led-resistor` | 41 pV | mismo modelo |
| `bjt-active` (2N3904 en región activa) | 99 nV | mismo modelo (Gummel–Poon reducido a Ebers–Moll) |
| `darlington-button` (TIP120, pulsador) | 8 pV | mismo modelo |
| `bridge-rectifier` | 58 pV | mismo modelo |
| `mosfet-saturation` (2N7000) | 57 mV | Falstad sin λ: 3 % menos corriente |
| `pot-zener` | 67 mV en el Zener; 0 en el potenciómetro | la rodilla del Zener |
| `rc-square` (transitorio, 952 pasos) | 5 nV | mismo modelo |
| `rectifier-half-wave` (transitorio, 500 pasos) | 1 mV | la tolerancia de Newton en el diodo |

### Correr los casos en Falstad

```bash
node scripts/falstad.js list                       # estado de cada referencia
node scripts/falstad.js snippet [casos…]           # función para la consola de Falstad
node scripts/falstad.js snippet --playwright -o f  # lo mismo para un navegador con Playwright
node scripts/falstad.js save resultado.json        # guarda las referencias
node scripts/falstad.js url <caso|archivo>         # el enlace normal (como el botón)
```

La función abre o usa `https://www.falstad.com/circuit/circuitjs.html`, importa cada caso con
`window.CircuitJS1.importCircuit`, lo corre hasta que se quieta y lee `getNodeVoltage`. Devuelve
el JSON para `save` y también lo deja en `window.falstadResult`. `save` no guarda un caso cuyo
texto no sea la exportación de hoy.

Para agregar un caso: un archivo de circuito en `test/falstad/cases/` (que pase `check`), correrlo
en Falstad y guardar. Si Falstad lo modela distinto a propósito, su tolerancia y la razón van en
`ALLOWED`.

## Desde el MCP y la línea de comandos

- `simulate` con `falstad: true` agrega el enlace y los avisos a la respuesta.
- `node scripts/falstad.js url <archivo>` imprime el enlace.

## Agregar un tipo de componente

Cada módulo de dispositivo puede tener `falstad(d, f)`
([agregar-componentes.md](agregar-componentes.md) §5). Recibe el dispositivo compilado (`d.pins`,
`d.params`) y el constructor `f`: `f.resistor`, `f.capacitor`, `f.inductor`, `f.wire`,
`f.diode`, `f.bjt`, `f.mosfet`, `f.pot`, `f.pushButton`, `f.voltage`, `f.inner(id)` (un nodo
propio), `f.pin(d, nombre)`, `f.exact` y `f.note(código, parámetros)`. Un equivalente siempre
lleva su nota (`falstad.*` en `src/i18n`). Sin `falstad`, el componente queda fuera con la nota
`falstad.missing`.
