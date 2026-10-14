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
- **Lo que muestra hoy:** la vista del circuito y la opuesta (`front` ↔ `back`, `front-left` ↔
  `back-right`), de cerca o toda la protoboard, con o sin etiquetas; arrastrar para moverse
  (mouse o un dedo), rueda o pellizco para acercar, doble clic para acercar (los botones
  vuelven al encuadre). Sobre el dibujo, un dedo mueve el dibujo y no la página que lo
  contiene. Sin JavaScript sigue mostrando la primera vista, de cerca y con etiquetas.
- **Resultados de la simulación**, solo si el circuito tiene `"page": { "results": true }` (y
  `supplies`): un botón *Simulación (modelo)* los muestra; quedan ocultos hasta presionarlo, así
  una página nunca adelanta un valor que alguien debe predecir ([simulacion.md](simulacion.md)).
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
