# El circuito dentro de la conversación (MCP Apps)

*[English](../en/mcp-apps.md)*

Un piloto: cuando un anfitrión que soporta [MCP Apps](https://modelcontextprotocol.io/extensions/apps/overview)
(la extensión de MCP `io.modelcontextprotocol/ui`, especificación 2026-01-26) llama a `layout`, la
página en vivo del circuito aparece dentro de la conversación: tocar una pieza, la capa de corriente,
los deslizadores, el osciloscopio. Un anfitrión sin MCP Apps recibe exactamente las mismas
herramientas, descripciones y respuestas que antes.

## Qué recibe el anfitrión

| Pieza | Qué es |
|---|---|
| recurso `ui://protoboard-iso/board.html` | el visor, `text/html;profile=mcp-app`: el CSS de la página y su script en vivo, sin circuito (`renderAppViewer` en `src/page.js`); sin orígenes externos, así que aplica la CSP restrictiva por defecto del anfitrión |
| `_meta.ui.resourceUri` de `layout` | el anfitrión muestra el visor en cada llamada a `layout` |
| `structuredContent` de `layout` | `{ target, revision, lang }`, unas decenas de bytes; su texto es el mismo que sin MCP Apps |
| herramienta `page_parts { target, revision?, lang? }` | `visibility: ["app"]`: solo la llama el visor, nunca el modelo. La página del circuito en piezas (`renderPageParts`): los atributos, el marcado (el SVG de las dos vistas, la barra, el inspector), los datos y el programa de la placa, y los textos del visor en el idioma del circuito |

Las piezas nunca pasan por el modelo: el visor las pide él mismo. Una revisión anterior a la actual
se reconstruye desde el historial (cada cambio lleva su inverso: `circuitAt` en
`src/node/workspace.js`), así que una vista sigue mostrando el circuito para el que se hizo; dice
cuando hay una revisión más nueva.

De vuelta a la conversación, dos cosas cortas:

- Tocar una pieza actualiza el contexto del modelo (`ui/update-model-context`) con una línea, de 300
  caracteres como máximo, 400 ms después del último toque: la pieza, su valor y, con los resultados
  encendidos, su voltaje y su corriente como los muestra la tarjeta («Abierta en la protoboard: R1,
  Resistencia: 330 Ω, Voltaje (tensión): 7,08 V, Corriente: 21,5 mA.»).
- La tarjeta de la pieza tiene un botón **Preguntar por esta pieza**, que manda un mensaje al chat
  (`ui/message`). La página suelta nunca lo muestra: el puente solo está en el script del visor.

## Qué anfitriones

El servidor ofrece todo esto a un cliente que anuncia la extensión en sus capacidades
(`capabilities.extensions["io.modelcontextprotocol/ui"].mimeTypes` con `text/html;profile=mcp-app`),
como pide la especificación. Algunos anfitriones muestran MCP Apps sin anunciarlo (el `basic-host` de
referencia del repositorio ext-apps no lo anuncia); para ellos, `PROTOBOARD_APPS=on` lo ofrece a todo
cliente, `off` a ninguno, `auto` (por defecto) sigue el anuncio.

Probado solo con el `basic-host` de referencia. Claude Desktop y claude.ai no están probados.

## Cómo está hecho

- `src/page.js`: `renderPageParts` devuelve lo que es propio del circuito; `renderPage` arma el mismo
  documento con eso (cada página del sitio de demostración y de los ejemplos quedó idéntica byte a
  byte antes y después de la división); `renderAppViewer` es el visor fijo.
- `src/page/client/app.js`: el puente, escrito a mano (JSON-RPC 2.0 sobre `postMessage`:
  `ui/initialize`, `ui/notifications/initialized`, el resultado de la herramienta, `tools/call`,
  `ui/update-model-context`, `ui/message`, `ui/notifications/size-changed`), unas 180 líneas, en vez
  de empaquetar `@modelcontextprotocol/ext-apps`: ninguna dependencia nueva y nada para la revisión
  de licencias. Entrada: `app-page.js`, que arranca la página a propósito cuando las piezas ya están
  en el documento.
- `mcp/app.js` (el recurso, `page_parts`, qué herramientas enlazan el visor); `mcp/core.js` los ofrece
  según el cliente; `mcp/server.js` es stdio, `mcp/http.js` el mismo servidor por Streamable HTTP en
  127.0.0.1, solo para probar con un anfitrión local.
- `scripts/app-host-check.js <carpeta de basic-host> [--csp host|spec]` maneja un `basic-host`
  compilado con Chromium: la protoboard dibujada, un toque, la capa de corriente moviéndose, la línea
  de contexto, el mensaje, el programa de una placa, la revisión fijada y el tiempo hasta la primera
  pintada.

## Límites encontrados

- **El programa de una placa necesita `unsafe-eval`.** El programa corre como código generado
  (`new Function` en `src/sim/program.js`). La CSP por defecto de la especificación no tiene
  `unsafe-eval` y un recurso no puede pedirlo (sus metadatos de CSP solo listan orígenes). Con esa
  CSP la página dibuja y simula, pero el programa no corre (un `EvalError` que la página se traga: el
  LED se queda como empezó). `basic-host` permite `unsafe-eval`, así que ahí corre. Dos salidas,
  ninguna hecha: correr el programa con un intérprete en vez de código generado, o avanzar el
  programa en el servidor y mandar los estados de los pines.
- **Tamaño.** El visor pesa unos 600 KB (160 KB con gzip); `page_parts` responde de 430 KB
  (led-resistor) a 980 KB (555 astable), casi todo el SVG de las dos vistas. La documentación de
  Claude dice que un resultado de más de unos 150 000 caracteres puede guardarse como archivo en vez
  de llegar a la app cuando la ejecución de código está activa; no dice si eso aplica a una llamada
  hecha desde la app.
- La línea de contexto y el botón siguen a la tarjeta: cuando la página en vivo reconstruye una
  tarjeta sola (cambian sus líneas), el botón se va hasta el siguiente toque.
- Solo `layout` muestra el visor. `apply_ops`, `undo` y `render` también podrían, pero un agente los
  llama muchas veces por circuito y cada llamada agregaría una vista a la conversación.
