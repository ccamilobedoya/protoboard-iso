# Foco y capa de corriente

*[English](../en/focus-and-flow.md)*

Dos formas de señalar lo importante de un dibujo, hechas con las mismas piezas
(`src/render/focus.js`, `src/sim/flow.js`) para imágenes estáticas y para la página interactiva.

## Foco: atenuar lo demás

Un velo blanco cubre todo; los componentes en foco y las **tiras metálicas bajo sus patas** se
dibujan otra vez encima. Se ven aunque otro componente los tape (como una radiografía), y las
tiras muestran con qué está unida de verdad cada pata dentro de la protoboard. Los **números de
columna y las letras de fila** de sus patas se resaltan donde la protoboard los imprime
(etiquetas oscuras arriba y abajo de la rejilla, y en los dos extremos de cada fila), así se leen
los agujeros y se encuentran en la protoboard real; los agujeros de riel solo tienen columna.

```bash
node bin/protoboard-iso.js render <objetivo> --focus Q1 --fit parts     # imagen estática, por ejemplo para una lección
```

MCP: `render` con `focus: ["Q1"]`. En un circuito, `"page": { "focus": ["R1", "D1"] }` abre la
página con esos componentes en foco (los que explica la lección).

## En la página: tocar un componente

- **Toca o haz clic en un componente** (o en su etiqueta): lo demás se atenúa, el componente y
  sus tiras pasan al frente y se abre una **ficha**: nombre y valor, el tipo de componente (al
  tocarlo explica qué es ese tipo de componente y cómo funciona, desde el kit), qué hace **en este
  circuito** (su `description`, a la vista), y adónde va cada pata y qué más hay ahí («B → c17, columna 17 (filas a–e) —
  con R1 (2)»).
- **Ver a través** (en la ficha) vuelve transparente el componente, para ver qué hay detrás.
- **Toca la protoboard** (o *Cerrar*) para quitar el foco.
- Con `"page": { "results": true }` la simulación está siempre activa, sin botón: el componente
  tocado muestra sobre la protoboard su corriente simulada y el voltaje de sus grupos, y en la
  ficha todos sus valores. Nada más lleva etiqueta: todas a la vez son demasiado para leer.
- **Cada valor se explica solo.** Toca una línea de la ficha («Capacitancia: 100 µF», «Ic: 8,82 mA»,
  «saturado»…) para abrir qué significa; con mouse, al pasar por encima aparece el mismo texto en un
  cuadro pequeño. Los textos están en `src/i18n` (`explain.*`), traducidos como todo lo demás.
- **De dónde sale un valor.** Pasar el mouse por una etiqueta de resultados, o tocarla (queda fija
  hasta tocarla otra vez; el foco, el atenuado y la ficha no cambian), dibuja cómo se mide: en un
  voltaje, una punta roja (+) en esa tira y una negra (−) donde está conectada la tierra de la
  fuente, con las dos tiras resaltadas; en una corriente, flechas que suben por la pata por donde
  entra y bajan por la que sale (Ic: entra por el colector, sale por el emisor). Una línea lo dice
  con palabras. Los voltajes del dibujo siempre se miden desde la tierra; Vbe o Vce de la ficha son
  entre dos patas, así que difieren por la pequeña caída en los cables de regreso (0,05 Ω cada uno
  en el modelo).
- En la página, el dibujo no lleva `<title>` (los navegadores lo mostrarían como globo en todas
  partes); su nombre va en `aria-label`. Los archivos SVG estáticos conservan su título.

Dos clases de texto, a propósito:

- **Qué es un tipo de componente** lo trae el kit (`describe.*` en `src/i18n`, en cada idioma) y
  queda detrás del tipo en la ficha («Transistor bipolar ⓘ»): quien aprende lo abre cuando quiere.
- **Cómo se usa en este circuito** es la `description` del propio circuito y se ve directamente en
  la ficha. Se omite cuando quien aprende debe descubrirlo. Un texto plano se muestra tal cual en
  cualquier idioma; un texto por cada idioma del kit se muestra en el idioma de la página (`check`
  avisa si falta alguno):

```json
{ "id": "Q1", "type": "bjt", "part": "2N2222A", "pins": { "E": "c16", "B": "c17", "C": "c18" },
  "description": { "en": "NPN transistor: the small base current controls the large collector current.",
                   "es": "Transistor NPN: la corriente pequeña de la base controla la grande del colector." } }
```

## La capa de corriente

`"page": { "flow": true }` (necesita `supplies`) agrega dos botones, *Componentes* y
*Corriente*. En *Corriente* todo se atenúa, aparecen las tiras en uso y **unos puntos se
mueven** por las tiras y a través de cada componente:

- **La velocidad** crece con la corriente, en escala logarítmica (un microamperio se arrastra, un
  amperio corre); por debajo de 1 µA nada se mueve.
- **El sentido**: el de los electrones por defecto (de − a +); *Corriente convencional* los
  invierte.
- La corriente en cada tramo de una tira sale de la ley de corrientes de Kirchhoff: recorriendo la
  tira, es la suma de lo que entró por los agujeros de atrás.
- El foco funciona encima: toca un componente para traerlo al frente mientras los puntos siguen
  moviéndose.
- Si el dispositivo tiene activado «reducir movimiento», los puntos se quedan quietos.

Las imágenes estáticas también pueden mostrar la capa (`render --flow`, MCP `flow: true`): los
puntos se dibujan pero no se mueven.

Como los resultados, la capa de corriente es un **modelo** y solo está en la página cuando el
circuito lo pide: muestra qué componentes conducen, y eso puede adelantar una respuesta que
alguien debe predecir.
