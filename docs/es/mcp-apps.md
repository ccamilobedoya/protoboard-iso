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
| herramienta `page_parts { target, revision?, lang?, chunk?, id? }` | `visibility: ["app"]`: solo la llama el visor, nunca el modelo. La página del circuito en piezas (`renderPageParts`): los atributos, el marcado (el SVG de las dos vistas, la barra, el inspector), los datos y el programa de la placa, y los textos del visor en el idioma del circuito |

Las piezas nunca pasan por el modelo: el visor las pide él mismo. Una revisión anterior a la actual
se reconstruye desde el historial (cada cambio lleva su inverso: `circuitAt` en
`src/node/workspace.js`), así que una vista sigue mostrando el circuito para el que se hizo; dice
cuando hay una revisión más nueva.

De vuelta a la conversación, una cosa silenciosa:

- Tocar una pieza actualiza el contexto del modelo (`ui/update-model-context`) con una línea, de 300
  caracteres como máximo, 400 ms después del último toque: la pieza, su valor y, con los resultados
  encendidos, su voltaje y su corriente como los muestra la tarjeta («Abierta en la protoboard: R1,
  Resistencia: 330 Ω, Voltaje (tensión): 7,08 V, Corriente: 21,5 mA.»).
- El visor no manda mensajes al chat (`ui/message`). Tenía un botón «Preguntar por esta pieza» que lo
  hacía; en Claude Desktop pone el texto en la caja de mensaje del usuario bajo un aviso («Use caution
  before running this prompt…»), lo que genera desconfianza, así que se probó y se quitó. El visor
  habla con el modelo solo por la actualización silenciosa de contexto de arriba. La página suelta
  nunca tiene el puente: solo está en el script del visor.
- El texto de la especificación no lista ninguna capacidad del anfitrión para `ui/update-model-context`,
  pero los anfitriones y el esquema de ext-apps sí: Claude anuncia `updateModelContext {text, image}`. El
  visor envía la actualización solo donde el anfitrión la anuncia (o no dio ninguna lista de
  capacidades). La especificación dice que el anfitrión PUEDE aplazar el contexto hasta el siguiente
  mensaje del usuario, PUEDE deduplicarlo, y responde `-32000` si lo niega. Claude Desktop lo acepta
  (resultado `{}`), pero el modelo no conocía la pieza tocada (véase `selection`).

## `selection`: el modelo lee lo tocado a través del servidor

Con un conector local, Claude no deja que el modelo lea lo que sabe un widget, ni que llame sus
herramientas (el anfitrión responde «Widget … tools can't run: it comes from a local connector»), y la
actualización de contexto no le llegaba. El visor sí puede llamar las herramientas del servidor, así
que pasa el toque por el servidor:

- `selection_set { target, revision, part | null, line }`, solo para la app (`visibility: ["app"]`): el
  visor manda la misma línea de la actualización de contexto (de 300 caracteres como máximo; con los
  resultados apagados la página no muestra lecturas, así que la línea no las lleva), con el mismo
  retardo, y `part: null` cuando se cierra la ficha.
- `selection { target? }`, una herramienta que el modelo ve, ofrecida solo a los clientes que reciben el
  visor (unos 450 bytes con su esquema): el último toque con sus lecturas como las muestra la página,
  hace cuánto, el circuito y la revisión, y si el circuito tiene una revisión más nueva; o «No hay nada
  tocado en el tablero.» Sin `target`, la selección más reciente de cualquier circuito.

Claude Desktop arranca dos procesos del servidor stdio para una sesión, y las llamadas del visor y las
del modelo caen en procesos distintos, así que nada de lo que comparten puede vivir en la memoria de un
proceso. Por eso la selección es un archivo oculto pequeño en la raíz, `.protoboard/selection.json`
(ningún listado muestra la carpeta), escrito de forma atómica (un archivo
temporal y luego renombrado), leído en cada llamada a `selection`, con a lo sumo los últimos 32
circuitos, una selección cada uno; una entrada de más de 24 horas se ignora y se poda. Guarda la pieza
tocada y su línea (de 300 caracteres como máximo), nada más. Una raíz que no se puede escribir recurre
a la memoria del proceso, y `selection` avisa una vez que no se puede compartir. Los trozos de `page_parts` también salen de archivos (`.protoboard/pages/`, abajo). Y un servidor stdio ahora termina cuando su
stdin termina o se cierra (el transporte del SDK no lo vigila, y un anfitrión por ssh no siempre
entrega el colgado).

## Para un modelo que ve el tablero

Un cliente que recibe el visor recibe una última línea más en el texto de `layout`: el usuario ve el
circuito como tablero vivo en el chat, así que el modelo no debe generarlo ni dibujarlo, lee lo que
toca con `selection` y nunca llama las herramientas del widget (menos de 240 bytes). La descripción de `render` pierde el consejo sobre `png_width`. Cualquier otro cliente
recibe los mismos textos y descripciones de antes.

## Diagnóstico

Desde el servidor nadie puede abrir las herramientas de desarrollo de un anfitrión, así que el visor
puede reportarle. Con `PROTOBOARD_APPS_DEBUG=1` el servidor registra además la herramienta solo para
la app `app_report { event, detail }` (solo para un cliente que recibe el visor; sin la variable la
herramienta no existe) y se lo dice al visor con las piezas. Cada reporte es una línea JSON
`{t, event, detail}` añadida a `<PROTOBOARD_ROOT>/.app-report.jsonl`; el archivo deja de crecer a los
256 KB y `detail` se corta a 4 KB. El visor reporta: el resultado de `ui/initialize` (datos y
capacidades del anfitrión; el contexto aparte), cada `ui/update-model-context` con el texto enviado y
el resultado o el error (código y mensaje), los eventos `error` y `unhandledrejection`. En la configuración de Claude Desktop
(`env` del servidor): `"PROTOBOARD_APPS_DEBUG": "1"`.

El visor también tiene la vista de cerca de la pieza (el ojo de la ficha; encendida por defecto en toda
página en vivo). Suma unos 32 KB a `page_parts` en led-resistor (571 a 603 KB) y 42 KB en el 555 astable
(976 a 1018 KB).

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
  `ui/update-model-context`, `ui/notifications/size-changed`), unas 180 líneas, en vez
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
- **Tamaño y el límite del anfitrión.** El visor pesa unos 600 KB (160 KB con gzip); las piezas de una
  página van de 0,6 MB (led-resistor) a 1,5 MB (la receta más grande, `uno-seven-segment`: 1 483 598 bytes;
  el ejemplo más grande, `switches`: 1 508 890). Claude Desktop rechaza un resultado de herramienta de más
  de **983 040 bytes**, también en las llamadas que hace un visor (visto el 2026-11-14: «the document
  exceeds this tool's 983040-byte limit»), así que `page_parts` entrega la página en trozos: una llamada sin
  `chunk` devuelve un manifiesto (`revision`, `latest`, `id`, `chunks`, `bytes`, los textos del visor), y
  `chunk: n` con la `revision` y el `id` del manifiesto devuelve el n-ésimo trozo del JSON de la página
  (cortado como texto, de a lo sumo 200 KB ya escapado como JSON, nunca dentro de un carácter). Ningún
  resultado de las herramientas solo para la app pasa de `RESULT_MAX`, 256 KB, serializado (una prueba
  revisa cada receta y cada ejemplo). El visor pide cuatro trozos a la vez, reintenta una vez el que
  falle, muestra «Cargando el circuito… n/total» mientras tanto y una línea de error en el widget si un
  trozo sigue fallando (con `app_report` activo se reportan el reintento y el fallo). El `id` (un hash de
  la página armada) fija el contenido: el servidor guarda las tres últimas páginas armadas y reconstruye
  una más vieja desde el historial si ya no está, y la rechaza si ya no da el mismo `id`. Llamadas y
  tiempo desde el resultado de la herramienta hasta el primer pintado, en el anfitrión de referencia
  (mediana de tres; una llamada → trozos): led-resistor 1 → 4 llamadas, 129 → 149 ms; 555 astable 1 → 7,
  328 → 380 ms; uno-blink 1 → 4, 170 → 191 ms; uno-seven-segment 1 → 10, 605 → 594 ms. No se hizo: pedir
  después la segunda vista o los datos de la vista de cerca; los trozos bastan para el límite. La
  documentación de Claude dice que un resultado de más de unos 150 000 caracteres puede guardarse como
  archivo cuando la ejecución de código está activa; no dice si eso aplica a una llamada hecha desde la app.
- La línea de contexto y el botón siguen a la tarjeta: cuando la página en vivo reconstruye una
  tarjeta sola (cambian sus líneas), el botón se va hasta el siguiente toque.
- Solo `layout` muestra el visor. `apply_ops`, `undo` y `render` también podrían, pero un agente los
  llama muchas veces por circuito y cada llamada agregaría una vista a la conversación.
