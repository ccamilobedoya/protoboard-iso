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

## La capa de corriente: la vista de conductores

`"page": { "flow": true }` (necesita `supplies` o una batería) agrega los botones *Componentes* y
*Corriente*. En *Corriente* la protoboard y los componentes quedan velados y **cada conductor en
uso se dibuja como una línea gruesa** por su camino real: la tira metálica entre los agujeros en
uso, sube por una pata, atraviesa el cuerpo, baja por la otra pata, sigue el arco de un cable.
Encima, **unos puntos se mueven**:

- **Color = voltaje (tensión)**, medido desde tierra, en una escala que termina en el voltaje
  mayor del circuito: gris en 0 V, rojo hacia +, azul hacia − (los colores de los rieles). Dentro de
  un cuerpo el color pasa del voltaje de una pata al de la otra en una curva en S empinada, así la
  caída se ve en el centro del componente que la produce. Un
  conductor flotante queda pálido.
- **El sentido**: corriente convencional, de + a −, como en CircuitJS de Falstad.
- **La velocidad es proporcional** a la corriente: la corriente mayor del circuito va a 60 px/s y
  la mitad, a la mitad, así se ven las proporciones y Kirchhoff. En la página en vivo la escala es
  la corriente mayor desde el arranque, así una corriente que se apaga (un condensador que se
  carga) se ve frenando. *Velocidad logarítmica* cambia a
  escala logarítmica (un microamperio se arrastra, un amperio corre) para circuitos con corrientes
  muy distintas. Por debajo de 1 µA nada se mueve.
- La corriente en cada tramo de una tira sale de la ley de corrientes de Kirchhoff: recorriendo la
  tira, es la suma de lo que entró por los agujeros de atrás.
- El foco funciona encima: toca un componente para traerlo al frente mientras los puntos siguen
  moviéndose.
- Si el dispositivo tiene activado «reducir movimiento», los puntos se quedan quietos.

Los caminos salen de los paquetes (`paths` en `build()`, ver
[agregar-componentes.md](agregar-componentes.md)); un paquete sin ellos usa rectas desde cada
agujero hasta el centro de sus agujeros, a ras de la protoboard.

Las imágenes estáticas también pueden mostrar la capa (`render --flow`, MCP `flow: true`): los
puntos se dibujan pero no se mueven.

La etapa 3 convierte esto en una simulación en vivo en la página (tiempo, deslizadores, límites a
la vista): [simulacion-en-vivo.md](simulacion-en-vivo.md).

Como los resultados, la capa de corriente es un **modelo** y solo está en la página cuando el
circuito lo pide: muestra qué componentes conducen, y eso puede adelantar una respuesta que
alguien debe predecir.

## La página en vivo

Con `results` o `flow`, la página corre el simulador por su cuenta (el mismo motor de la línea
de comandos, incluido en ella). Al cargar muestra los valores en DC, como antes; después:

- **Tiempo**: un circuito con condensadores o bobinas tiene *Pausa*, *Encender (t = 0)*
  (condensadores descargados, todo vuelve a empezar) y un reloj. El tiempo simulado corre de modo
  que la constante de tiempo más larga tome unos 2 s, sea del tamaño que sea; un paso pesado pasa
  a cámara lenta. `"page": { "start": "zero" }` abre encendida en t = 0 y corriendo.
- **Los puntos** avanzan con una fase acumulada, así nunca saltan cuando la corriente cambia; la
  escala de velocidad es la corriente mayor desde el arranque.
- **Un LED encendido** tiene un halo del color de su luz alrededor del domo, encima de la vista de
  conductores (el LED blanco, un poco amarillo, para que se note sobre una página blanca). Su opacidad sigue su corriente frente a la
  nominal en escala de raíz, como la ve el ojo: con una décima de la corriente nominal se ve claro.
- **Las etiquetas quedan encima**: la etiqueta del componente tocado se copia por encima de la capa
  de corriente (`spotlabels`), así los puntos nunca la tapan.
- **Cuatro veces por segundo**: los colores de los conductores, los LED encendidos, un tinte de calor en resistencias, reguladores y transistores (potencia
  frente a la nominal, desde un quinto de ella), las etiquetas de resultados, los textos de las
  sondas y la ficha abierta.
- Los resultados siguen siendo un **modelo** y se activan por circuito, como antes.
