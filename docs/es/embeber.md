# Embeber un circuito en la documentación

*[English](../en/embedding.md)*

Cada circuito tiene una página pensada para embeberse: `out/<nombre>.html`, junto a sus otras
salidas. Es un solo archivo autónomo (SVG en línea, unas líneas de CSS y de script, sin red y
sin compilación), así que funciona en un iframe, en la «vista web» de una wiki o en una app de
notas.

```bash
node bin/protoboard-iso.js page <objetivo> [--lang es] [--fit parts|board] [-o pagina.html]
```

- **Se reescribe con cada cambio.** `create`, `apply` y `undo` (por línea de comandos o por
  MCP) la reescriben con las demás salidas, siempre con el mismo nombre. Lo que embeba ese
  archivo muestra siempre la última revisión; la página la lleva en `<meta name="revision">` y
  en su barra.
- **Lo que muestra hoy:** una barra en una sola fila, agrupada por lo que hace: **Girar** (la
  vista del circuito y la opuesta, `front` ↔ `back` o `front-left` ↔ `back-right`), **Toda la
  protoboard** (↔ de cerca), **Etiquetas**, **Corriente** (siempre que el circuito se pueda simular; `page.flow: false` lo quita), los controles de
  tiempo (páginas en vivo con C, L o generador) y un menú **⋯** con lo que se usa menos: la escala
  de velocidad de los puntos, *Abrir en Falstad*, *¿Qué se puede tocar?* y la revisión. En una
  pantalla angosta (celular) las etiquetas de los botones dejan solo los íconos y nada se desliza de
  lado. Los botones de zoom están en la esquina inferior derecha (acercar, alejar, volver al
  encuadre). **Girar** da vuelta la protoboard al instante y conserva el zoom y el componente tocado
  donde estaba; los cambios de encuadre se deslizan (un fundido y sin movimiento con
  *movimiento reducido*). La primera vez que se abre una página del kit en un navegador, una ayuda corta sobre el
  dibujo dice qué se puede tocar y cómo moverse; se va al primer toque. Sin JavaScript la página
  sigue mostrando la primera vista, de cerca y con etiquetas.
- **Los gestos dependen de dónde está la página** (como un mapa embebido):

  | | Un dedo / arrastre con ratón | Dos dedos | Rueda | Doble toque o doble clic |
  |---|---|---|---|---|
  | **Dentro de un iframe** (una nota) | un dedo desplaza la nota (un toque sigue eligiendo); el ratón mueve el dibujo | mueven y acercan | desplaza la nota; **Ctrl/⌘ + rueda** o pellizcar en el panel táctil acerca | encuadra el componente (o acerca) |
  | **Sola, o en pantalla completa** | mueve el dibujo | mueven y acercan | acerca | encuadra el componente (o acerca) |

  Dentro de un iframe, un aviso corto sobre el dibujo dice cómo («Usa dos dedos…», «Usa Ctrl +
  rueda…») cuando alguien lo intenta de la otra forma, y los botones de zoom agregan **Pantalla
  completa** (la API de pantalla completa; si la página que la contiene no lo permite, se abre sola
  en una pestaña nueva). Para la pantalla completa dentro de un iframe, este debe permitirla
  (`<iframe allowfullscreen>`).
- **Clara u oscura** como el dispositivo (`prefers-color-scheme`); el circuito la puede fijar con
  `"page": { "theme": "light" | "dark" }`, y un enlace gana sobre los dos: `…/led.html?theme=dark`
  (`auto` vuelve a seguir al sistema). Solo cambian los colores de la página; la protoboard conserva
  los suyos.
- **Resultados de la simulación**, siempre que el circuito tenga fuente (`supplies` o una
  batería): siempre activos, solo para el componente que se toca, así la protoboard nunca se
  llena de números; los LED brillan con su corriente. Se apagan mientras alguien deba
  predecirlos: `"page": { "simulation": false }` (toda la simulación) o
  `"page": { "results": false }` ([simulacion.md](simulacion.md)).
- **Toca un componente** para enfocarlo y abrir su ficha; la capa de corriente es un botón de la
  barra (`"page": { "flow": false }` lo quita). Ver [foco-y-corriente.md](foco-y-corriente.md).
- **Toca una tira** en uso (o una pata en la ficha de un componente) para abrir la ficha de la
  tira: qué es una tira, qué está conectado, esos componentes al frente; con los resultados, su
  voltaje (tensión) respecto a tierra (con las puntas dibujadas), la corriente de cada pata que
  entra o sale y su osciloscopio.
- **Simulación en vivo**: siempre que el circuito se pueda simular, la página lleva el simulador y lo corre (unos
  60 kB más): los valores, los colores y los puntos lo siguen, y un circuito con condensadores o
  bobinas tiene *Pausa*, *Encender (t = 0)* y un reloj. Ver
  [foco-y-corriente.md](foco-y-corriente.md) y [simulacion-en-vivo.md](simulacion-en-vivo.md).
- **Llena su marco.** El dibujo se ajusta al ancho y al alto del iframe (o de la ventana), así
  que el tamaño lo decide quien lo embebe.
- **La misma página crece.** Los resultados de la simulación, la animación y el multímetro
  virtual (etapas 2 a 4 de la [hoja de ruta](hoja-de-ruta.md)) están pensados para esta
  página, así que lo que se embeba hoy los recibe sin cambiar el enlace.

## Cómo embeberla

1. Servir la carpeta del circuito con cualquier servidor de archivos estáticos (la página no
   necesita nada más).
2. Apuntar a `…/<circuito>/out/<circuito>.html`:
   - en HTML: `<iframe src="…/led/out/led.html" style="width:100%;height:480px;border:0"></iframe>`;
   - en una wiki o app de notas con un bloque de «vista web» o «URL embebida»: la misma URL.
3. Si quien embebe está en otro origen, hay que permitirle enmarcar la página (por ejemplo,
   con la cabecera `Content-Security-Policy: frame-ancestors <origen de la wiki>`).

El script corre dentro del iframe, aislado en el origen del servidor de archivos: nunca toca
la página que lo contiene.

## En vivo o congelado

Embeber la página es **en vivo**: sigue cada cambio del circuito. Para un registro que no debe
cambiar (cómo quedó el circuito en una sesión), embeber una copia del circuito (en su propia
carpeta) o adjuntar como imagen un SVG estático (`render`, que escribe
`out/<nombre>.<vista>.svg`).

## Desde el servidor MCP

Las herramientas `create_circuit`, `apply_ops` y `undo` devuelven la ruta de la página en
`files.pageFile`. Para un circuito creado antes de que existiera la página, `render` con
`page: true` la escribe.
