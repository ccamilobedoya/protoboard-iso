# Servidor MCP

*[English](../en/mcp.md)*

`mcp/server.js` expone el kit como herramientas del [Model Context
Protocol](https://modelcontextprotocol.io), para que cualquier asistente compatible (Claude
Code, Claude Desktop, otros agentes) retome, inspeccione y cambie circuitos con entradas
tipadas y respuestas cortas y estructuradas. Es una capa delgada sobre las mismas funciones
de la línea de comandos (ver [interfaz-para-agentes.md](interfaz-para-agentes.md)).

Vive en su propio paquete (`mcp/package.json`) porque necesita el SDK de MCP y Zod; el kit en
sí sigue sin dependencias. Las herramientas se definen en `mcp/tools.js`; `mcp/server.js` las
registra y corre sus funciones en un hilo aparte (*worker*, `mcp/kit-worker.js`); el servidor
mismo es `mcp/core.js`. En un anfitrión con MCP Apps, `layout` además muestra la página en vivo del
circuito en la conversación: [mcp-apps.md](mcp-apps.md).

**Recarga el kit solo.** Antes de cada llamada, el servidor mira si el código del kit (`src/`,
`mcp/tools.js`) cambió desde que arrancó su *worker*; si cambió, arranca uno nuevo, así que las
respuestas y las páginas que escribe salen siempre del código actual, y esa respuesta termina con
una nota que lo dice. Antes, un servidor que llevaba rato prendido seguía escribiendo páginas con
la interfaz vieja hasta que alguien lo reconectaba. Cambiar el nombre de una herramienta, agregar
una o cambiar sus entradas sigue pidiendo reconectar (`/mcp` en Claude Code): la nota avisa cuándo.

## Instalar y probar

```bash
cd mcp && npm install          # @modelcontextprotocol/sdk, zod (+ @resvg/resvg-js opcional, para PNG)
npm run test:mcp               # desde la raíz del repositorio: pruebas de punta a punta con el cliente MCP
```

Variables de entorno:

| Variable | Por defecto | Qué es |
|---|---|---|
| `PROTOBOARD_ROOT` | la carpeta actual | la única carpeta que el servidor lee y escribe; rechaza rutas fuera de ella |
| `PROTOBOARD_LANG` | `en` | idioma por defecto de las respuestas y de los archivos (`en`, `es`); el `"lang"` del propio circuito y el argumento `lang` de cada herramienta ganan sobre él |
| `PROTOBOARD_APPS` | `auto` | la página en vivo del circuito dentro de anfitriones con MCP Apps: `auto` a un cliente que anuncia la extensión, `on` a todo cliente, `off` a ninguno ([mcp-apps.md](mcp-apps.md)) |
| `PROTOBOARD_DEV` | sin definir | `1`: las herramientas corren en un worker que se reinicia cuando cambia el código del kit (para trabajar en el kit; el `.mcp.json` de este repositorio lo pone) |
| `PROTOBOARD_APPS_DEBUG` | sin definir | `1`: el visor reporta lo que responde el anfitrión a `<raíz>/.protoboard/app-report.jsonl` ([mcp-apps.md](mcp-apps.md)) |

## Registrarlo

**Claude Code, en este repositorio:** el `.mcp.json` de la raíz registra
`node mcp/server.js` con `PROTOBOARD_ROOT=.`. Claude Code pide aprobarlo la primera vez.

Si `node` no está en el PATH con el que arranca Claude Code (por ejemplo, con nvm), regístralo
con rutas absolutas en tu alcance local; tiene prioridad sobre `.mcp.json`:

```bash
claude mcp add --scope local protoboard-iso -e PROTOBOARD_ROOT="$HOME/circuits" -e PROTOBOARD_LANG=es \
  -- "$(command -v node)" "$PWD/mcp/server.js"
claude mcp get protoboard-iso     # debe decir: Connected
```

Córrelo desde el clon (`$PWD/mcp/server.js`). `PROTOBOARD_ROOT` es una carpeta tuya para los
circuitos (`mkdir "$HOME/circuits"` antes), no el clon; para guardarlos con un proyecto (por ejemplo, la
carpeta de un curso), apúntalo a esa carpeta.

**Otros clientes:** un servidor stdio con el comando `node`, como argumento la ruta absoluta de
`mcp/server.js`, y las variables de arriba.

### Claude Desktop con un clic

La extensión de escritorio es este servidor en un solo archivo que Claude Desktop instala, con lo
que necesita adentro (sin clon, sin `npm install`, sin archivo de configuración). Con ella, el
tablero en vivo del circuito aparece dentro de la conversación ([mcp-apps.md](mcp-apps.md)).

1. Descarga `protoboard-iso-<versión>.mcpb` de las
   [versiones publicadas](https://github.com/ccamilobedoya/protoboard-iso/releases) del repositorio
   (`SHA256SUMS`, a su lado, trae su suma de verificación).
2. Haz doble clic en él (o arrástralo a **Settings > Extensions** en Claude Desktop) y confirma la
   instalación.
3. Elige la **carpeta de circuitos**: donde se guardan tus circuitos; el kit solo lee y escribe
   ahí. Por defecto es una carpeta `Protoboard` en tus documentos; si no existe, se crea con el
   primer circuito.
4. **Enciende la extensión**, en los ajustes de la extensión: Claude Desktop la instala apagada.
5. En una conversación nueva, pide un circuito («un LED con su resistencia a 9 V»).

El diálogo de instalación avisa de que la extensión obtiene acceso a todo lo que hay en el
computador. Claude Desktop muestra ese aviso con toda extensión local, haga lo que haga. Esta, según
su código, solo lee y escribe dentro de la carpeta de circuitos (una ruta fuera de ella se rechaza) y
no hace ninguna petición de red; el aviso es de la aplicación, no algo que esta extensión pida más
allá de eso. La especificación de MCPB no tiene un campo del manifiesto para encender una extensión
al instalarla ni para cambiar el aviso, y no documenta que firmar un paquete cambie ninguna de las
dos cosas ([MANIFEST.md](https://github.com/modelcontextprotocol/mcpb/blob/main/MANIFEST.md),
[CLI.md](https://github.com/modelcontextprotocol/mcpb/blob/main/CLI.md)).

La extensión corre con el Node.js que trae Claude Desktop, así que no se instala nada más; pone
`PROTOBOARD_APPS=on`, porque solo es para un anfitrión que muestra el tablero. No trae el
rasterizador opcional de PNG (`render` con `png_width` responde que el PNG no está disponible en esta
instalación, y que el SVG y la página sí; el tablero y las páginas no lo necesitan). La construye la publicación de cada versión
(`scripts/pack-mcpb.js` con la CLI oficial `mcpb`); un clon arma la misma carpeta con
`npm run pack-mcpb -- --out <carpeta>`.

La configuración manual de abajo es la alternativa: para un clon que cambias, o para fijar
`PROTOBOARD_LANG`.

### Claude Desktop

Abre el archivo desde **Settings > Developer > Edit Config** (crea `claude_desktop_config.json`
si no existe y muestra dónde está), agrega el servidor en `mcpServers`, guarda, y cierra Claude
Desktop por completo y vuélvelo a abrir:

```json
{
  "mcpServers": {
    "protoboard-iso": {
      "command": "node",
      "args": ["/ruta/absoluta/a/protoboard-iso/mcp/server.js"],
      "env": {
        "PROTOBOARD_ROOT": "/ruta/absoluta/a/mis-circuitos",
        "PROTOBOARD_LANG": "es"
      }
    }
  }
}
```

- `args` lleva la ruta absoluta de `mcp/server.js` dentro del clon, después de `cd mcp && npm install`.
- `PROTOBOARD_ROOT` es una carpeta tuya donde se guardarán los circuitos (créala antes). **No** es
  el clon: el servidor solo lee y escribe dentro de ella.
- `PROTOBOARD_LANG` es `en` o `es`.
- Claude Desktop arranca el servidor con su propio PATH. Si `node` está instalado con nvm (u otro
  gestor de versiones) puede que no lo encuentre: pon la ruta absoluta de `node` en `command`
  (`command -v node` la muestra en macOS y Linux; `where node` en Windows).
- En Windows escribe las rutas con barras invertidas dobles o con barras normales:

```json
"command": "C:\\Program Files\\nodejs\\node.exe",
"args": ["C:\\protoboard-iso\\mcp\\server.js"],
"env": { "PROTOBOARD_ROOT": "C:/mis-circuitos" }
```

Cada circuito es una carpeta bajo la raíz; la página de cada uno es `out/<nombre>.html` dentro de
ella, y cada respuesta de `layout`, `apply_ops` y `undo` dice su ruta absoluta: haz doble clic
para abrirla.

## Herramientas

| Herramienta | Hace | ¿Modifica archivos? |
|---|---|---|
| `list_circuits` | circuitos bajo la raíz (archivos con `parts`, carpetas con `circuit.json`) | no |
| `get_circuit` | el JSON del circuito, su revisión y observaciones de colocación; un circuito hecho con `layout` trae `spec` (las redes que se le pidieron) | no |
| `create_circuit` | carpeta de circuito nueva a partir de un circuito completo con sus agujeros, escrito a mano (no sobrescribe); sin posiciones fijas, mejor `layout` | sí |
| `inspect` | el dibujo en números; `part` para un solo componente | no |
| `query` | `kind: at \| node \| free` con `ref` | no |
| `netlist` | el circuito como redes: grupos unidos por cables, las patas de cada una (`R1.1@d20`), etiquetas, patas solas en su red | no |
| `layout` | un circuito de clase habitual por su nombre: `recipe` y solo los `values` que cambian ([recetas.md](recetas.md)); si no, un circuito entero ubicado en una llamada a partir de sus componentes (sin agujeros, en cualquier orden: primero el dado, luego los que dan las redes; números de parte, módulos y alias) y sus redes (patas y rieles; valen los nombres de pata usuales: `D1.K`, `U1.VIN`, `U1.GPIO4`): capas por distancia a la fuente, reglas por tipo de pieza, cables, redes de tierra a un riel −, la revisión de redes y la revisión lesson, con reintentos y reparación cable por cable. Sobre un destino que ya existe, lo vuelve a montar en una sola revisión dando las redes nuevas y, si cambian componentes, la lista completa (`expect_revision`; las piezas conservan sus agujeros; `undo` lo deshace). Las redes quedan en el circuito (`spec`). Termina en `STATUS: DONE \| WARNINGS \| CHANGES \| FIX_SPEC \| SPEC_OK`; `check_only` solo revisa; `dry_run` es un ensayo: la misma respuesta y el mismo `STATUS`, terminando en `Ensayo: no se guardó nada.`, sin escribir nada ni mostrar tablero (para ensayar una idea antes de que llegue al circuito); `fix: true` solo, sobre un circuito hecho con `layout`, aplica el arreglo calculado del kit (`Para arreglarlo`) como una revisión y dice `Arreglo aplicado: …`. El algoritmo: [montaje-automatico.md](montaje-automatico.md) | sí |
| `suggest` | posiciones válidas para un componente nuevo, cada una con su operación `add` y el cuerpo más cercano (`nearest`: componente y holgura); `profile` deja fuera también lo que esa revisión bloquea; `parts` coloca varios en orden y responde un solo lote | no |
| `apply_ops` | lote atómico; primero `dry_run`, luego `expect_revision`, `author`, `note` | sí |
| `try_ops` | el mismo lote, solo en seco: qué arreglaría y qué introduciría; para los roles de solo lectura (el revisor) | no |
| `undo` | deshace el último cambio (revisión nueva) | sí |
| `review` | APROBADO, APROBADO CON AVISOS (`hazards`: componentes que la simulación en DC pasa de un máximo, en reposo, con un control accionado o con una salida del programa de una placa en alto; no bloquean; luego el arreglo calculado por el kit, `fix`, o `noFix`; `doubts`: lo que el kit no pudo comprobar, un componente sin simular, un programa que no puede correr, también APROBADO CON AVISOS; y la línea `checked` de lo que se revisó y lo que no) o CAMBIOS a partir de mediciones, perfil `lesson` o `draft`; cada punto que bloquea nombra sus componentes (`parts`) y vistas (`views`); `explain: true` agrega las reglas del perfil; un circuito con `spec` también tiene sus redes revisadas | no |
| `history` | revisiones, autores, notas, operaciones | no |
| `render` | escribe el SVG; con `png_width` devuelve también una imagen PNG; con `page: true` reescribe la página para embeber ([embeber.md](embeber.md)); con `sim: true` dibuja los resultados de la simulación; `focus: [ids]` atenúa lo demás; `flow: true` la capa de corriente | solo salidas |
| `simulate` | voltajes de los grupos y corrientes de los componentes, un modelo ([simulacion.md](simulacion.md)); `analysis: dc \| transient`, `stop`, `step`, `start`; `falstad: true` agrega el enlace que abre el circuito en Falstad ([falstad.md](falstad.md)) | no |
| `catalog` | sin `name`: una lista compacta (tipos agrupados por familia, cada uno con sus patas y sus primeros números de parte, `… (+N más)` para el resto; módulos, baterías, protoboards, vistas, operaciones); y las recetas, solo sus nombres por grupo (`catalog` con el nombre de la receta da su título, componentes, redes y valores); con `name` (un tipo, número de parte, módulo o receta): patas, encapsulado, los campos que acepta y un componente real de `examples/` para copiar, y de un componente lo que su tarjeta en la página dice que es (`about`), qué hace cada pata (`pinRoles`) y los límites con que lo revisa el simulador (`limits`: valores nominales y máximos con sus unidades; `limitFields`, los campos de los que dependen, como `power` en una resistencia) (de una receta, sus componentes, redes y valores con sus límites); `format: "json"` sin `name`: todos los registros completos | no |

**Grupos por pata.** Donde una herramienta pide un grupo (`between` y `connect` de `suggest`,
`query node`), una pata de un componente ya colocado nombra el grupo donde está: `"R1.2"`, `"U1.OUT"`.

**Destinos** relativos a la raíz, como los muestra `list_circuits`. Un destino que empieza con una
carpeta que no existe ahí (`circuits/led` o `circuitos/led` cuando la raíz ya es la carpeta de
circuitos) se lee sin ella, así el circuito no queda anidado un nivel más abajo.

Todas responden en texto legible, o en JSON con `format: "json"`. Los errores vuelven como
errores de la herramienta con un mensaje legible (`isError`), nunca como una caída. Las de
solo lectura llevan `readOnlyHint`, para que los clientes puedan permitirlas sin preguntar.

El servidor envía además **instrucciones**, la misma guía del skill del plugin (`plugin-src/SKILL.md`) en pocas líneas: qué
herramienta para qué tarea (primero las recetas: un circuito de clase habitual → `layout` con `recipe`; otro circuito nuevo → `layout`; otras conexiones en un circuito hecho con
`layout` → `layout` otra vez; un valor o un arreglo → `apply_ops`), qué significa cada `STATUS:`, el
ciclo de operaciones, cómo revisar (`review`, `netlist`, `simulate`, sin mostrar nunca un valor por
predecir), los agujeros y la simulación de la página. Nunca reescribir los archivos de circuito; PNG
solo cuando importa el estilo.

## Qué guarda el servidor y dónde

El servidor no guarda en memoria nada que importe: un anfitrión puede correr dos procesos suyos para una
sesión (Claude Desktop lo hace), y cualquiera puede morir o duplicarse en cualquier momento. Lo que guarda
está en disco, en la raíz:

- **Los circuitos**: `circuit.json`, `history.jsonl` y `out/` de cada carpeta, o un archivo de circuito.
  Dos procesos pueden cambiar un mismo circuito: el cambio se hace bajo un candado (una carpeta
  `circuit.json.lock`, que se toma si pasa de 30 s), así que `expect_revision` se cumple para una sola de
  dos llamadas simultáneas y la otra recibe `REVISION_MISMATCH`.
- **`.protoboard/`**, la carpeta oculta propia del servidor (`list_circuits` y la búsqueda de circuitos
  de la raíz la ignoran), escrita con un archivo temporal que se renombra:
  - `selection.json`: lo último que tocó el usuario en el tablero vivo (MCP Apps), a lo sumo los últimos
    32 circuitos, nada de más de 24 horas ([mcp-apps.md](mcp-apps.md)).
  - `pages/<hash del circuito>.<revisión>.<id>.json`: la página armada que se entrega al visor en
    trozos; las 2 revisiones más nuevas por circuito, a lo sumo 64 archivos y 64 MB en total, nada de
    más de 7 días, podado cada vez que se escribe uno.
  - `app-report.jsonl`, solo con `PROTOBOARD_APPS_DEBUG=1`: a lo sumo 256 KB, una línea por reporte.

Borrar `.protoboard/` en cualquier momento es seguro: todo lo que tiene se reconstruye o solo se olvida.
Por defecto las herramientas corren dentro del proceso del servidor; con `PROTOBOARD_DEV=1` (puesto en el
`.mcp.json` de este repositorio) corren en un worker que se reinicia cuando cambia el código del kit, una
comodidad para trabajar en el kit. El servidor termina cuando su stdin termina o se cierra.

## Ejemplo de sesión

```text
layout    {target: "parpadeo", recipe: "555-astable", values: {C1: "22u"}}
                                     → … STATUS: DONE · rev 0
layout    {target: "interruptor", parts: [...], nets: [["R2.2", "D1.A"], ["D1.K", "Q1.C"], …]}
                                     → … STATUS: DONE · rev 0
get_circuit {target: "interruptor"}  → el circuito con spec.nets
layout    {target: "interruptor", nets: <spec.nets con un cambio>, expect_revision: 0}
                                     → … STATUS: DONE · rev 1 (todo lo demás en su lugar)
apply_ops {target, ops: [{op: "set", part: "R2", value: "470"}], dry_run: true} → qué arregla / qué introduce
apply_ops {target, ops, expect_revision: 1, author: "claude", note: "LED menos brillante"} → rev 2
review    {target}                   → APROBADO (redes revisadas contra el spec; APROBADO CON AVISOS si un componente se quemaría)
undo      {target}                   → rev 3, R2 vuelve a 330
```

Un circuito hecho a mano pasa en cambio por el ciclo de operaciones: `inspect`, luego `suggest`
(`parts` para una cadena, `profile: "lesson"`), `apply_ops` en seco, `netlist`, `review`.

## Los agentes usan estas herramientas

Los subagentes de `.claude/agents/` nombran estas herramientas ([agentes.md](agentes.md)). Si
una herramienta cambia de nombre, desaparece o cambia sus entradas, actualiza los agentes en el
mismo cambio; `npm run test:mcp` falla si un agente nombra una herramienta que el servidor ya
no tiene.
