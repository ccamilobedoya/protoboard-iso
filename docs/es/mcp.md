# Servidor MCP

*[English](../en/mcp.md)*

`mcp/server.js` expone el kit como herramientas del [Model Context
Protocol](https://modelcontextprotocol.io), para que cualquier asistente compatible (Claude
Code, Claude Desktop, otros agentes) retome, inspeccione y cambie circuitos con entradas
tipadas y respuestas cortas y estructuradas. Es una capa delgada sobre las mismas funciones
de la línea de comandos (ver [interfaz-para-agentes.md](interfaz-para-agentes.md)).

Vive en su propio paquete (`mcp/package.json`) porque necesita el SDK de MCP y Zod; el kit en
sí sigue sin dependencias. Las herramientas se definen en `mcp/tools.js`; `mcp/server.js` las
registra y corre sus funciones en un hilo aparte (*worker*, `mcp/kit-worker.js`).

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

## Registrarlo

**Claude Code, en este repositorio:** el `.mcp.json` de la raíz registra
`node mcp/server.js` con `PROTOBOARD_ROOT=.`. Claude Code pide aprobarlo la primera vez.

Si `node` no está en el PATH con el que arranca Claude Code (por ejemplo, con nvm), regístralo
con rutas absolutas en tu alcance local; tiene prioridad sobre `.mcp.json`:

```bash
claude mcp add --scope local protoboard-iso -e PROTOBOARD_ROOT=$PWD -e PROTOBOARD_LANG=es \
  -- "$(command -v node)" "$PWD/mcp/server.js"
claude mcp get protoboard-iso     # debe decir: Connected
```

Para usarlo desde otro proyecto (por ejemplo, la carpeta de un curso con sus propios
circuitos), corre el mismo comando desde ese proyecto con `PROTOBOARD_ROOT` apuntando a él.

**Claude Desktop y otros clientes:** un servidor stdio con el comando `node`, como argumento
la ruta absoluta de `mcp/server.js`, y las variables de arriba.

## Herramientas

| Herramienta | Hace | ¿Modifica archivos? |
|---|---|---|
| `list_circuits` | circuitos bajo la raíz (archivos con `parts`, carpetas con `circuit.json`) | no |
| `get_circuit` | el JSON del circuito, su revisión y observaciones de colocación; un circuito hecho con `layout` trae `spec` (las redes que se le pidieron) | no |
| `create_circuit` | carpeta de circuito nueva a partir de un circuito completo con sus agujeros, escrito a mano (no sobrescribe); sin posiciones fijas, mejor `layout` | sí |
| `inspect` | el dibujo en números; `part` para un solo componente | no |
| `query` | `kind: at \| node \| free` con `ref` | no |
| `netlist` | el circuito como redes: grupos unidos por cables, las patas de cada una (`R1.1@d20`), etiquetas, patas solas en su red | no |
| `layout` | un circuito de clase habitual por su nombre: `recipe` y solo los `values` que cambian ([recetas.md](recetas.md)); si no, un circuito entero ubicado en una llamada a partir de sus componentes (sin agujeros, en el orden de la señal; números de parte, módulos y alias) y sus redes (patas y rieles; valen los nombres de pata usuales: `D1.K`, `U1.VIN`, `U1.GPIO4`): capas por distancia a la fuente, reglas por tipo de pieza, cables, redes de tierra a un riel −, la revisión de redes y la revisión lesson, con reintentos y reparación cable por cable. Sobre un destino que ya existe, lo vuelve a montar en una sola revisión dando solo lo que cambia (`expect_revision`; las piezas conservan sus agujeros; `undo` lo deshace). Las redes quedan en el circuito (`spec`). Termina en `STATUS: DONE \| CHANGES \| FIX_SPEC \| SPEC_OK`; `check_only` solo revisa. El algoritmo: [montaje-automatico.md](montaje-automatico.md) | sí |
| `suggest` | posiciones válidas para un componente nuevo, cada una con su operación `add` y el cuerpo más cercano (`nearest`: componente y holgura); `profile` deja fuera también lo que esa revisión bloquea; `parts` coloca varios en orden y responde un solo lote | no |
| `apply_ops` | lote atómico; primero `dry_run`, luego `expect_revision`, `author`, `note` | sí |
| `try_ops` | el mismo lote, solo en seco: qué arreglaría y qué introduciría; para los roles de solo lectura (el revisor) | no |
| `undo` | deshace el último cambio (revisión nueva) | sí |
| `review` | APROBADO o CAMBIOS a partir de mediciones, perfil `lesson` o `draft`; cada punto que bloquea nombra sus componentes (`parts`) y vistas (`views`); `explain: true` agrega las reglas del perfil; un circuito con `spec` también tiene sus redes revisadas | no |
| `history` | revisiones, autores, notas, operaciones | no |
| `render` | escribe el SVG; con `png_width` devuelve también una imagen PNG; con `page: true` reescribe la página para embeber ([embeber.md](embeber.md)); con `sim: true` dibuja los resultados de la simulación; `focus: [ids]` atenúa lo demás; `flow: true` la capa de corriente | solo salidas |
| `simulate` | voltajes de los grupos y corrientes de los componentes, un modelo ([simulacion.md](simulacion.md)); `analysis: dc \| transient`, `stop`, `step`, `start`; `falstad: true` agrega el enlace que abre el circuito en Falstad ([falstad.md](falstad.md)) | no |
| `catalog` | sin `name`: una lista compacta (tipos con sus patas, números de parte por tipo, módulos, baterías, protoboards, vistas, operaciones); y las recetas con sus valores; con `name` (un tipo, número de parte, módulo o receta): patas, encapsulado, los campos que acepta y un componente real de `examples/` para copiar (de una receta, sus componentes, redes y valores con sus límites); `format: "json"` sin `name`: todos los registros completos | no |

**Grupos por pata.** Donde una herramienta pide un grupo (`between` y `connect` de `suggest`,
`query node`), una pata de un componente ya colocado nombra el grupo donde está: `"R1.2"`, `"U1.OUT"`.

**Destinos** relativos a la raíz, como los muestra `list_circuits`. Un destino que empieza con una
carpeta que no existe ahí (`circuits/led` o `circuitos/led` cuando la raíz ya es la carpeta de
circuitos) se lee sin ella, así el circuito no queda anidado un nivel más abajo.

Todas responden en texto legible, o en JSON con `format: "json"`. Los errores vuelven como
errores de la herramienta con un mensaje legible (`isError`), nunca como una caída. Las de
solo lectura llevan `readOnlyHint`, para que los clientes puedan permitirlas sin preguntar.

El servidor envía además **instrucciones**, la misma guía de `SKILL.md` en pocas líneas: qué
herramienta para qué tarea (primero las recetas: un circuito de clase habitual → `layout` con `recipe`; otro circuito nuevo → `layout`; otras conexiones en un circuito hecho con
`layout` → `layout` otra vez; un valor o un arreglo → `apply_ops`), qué significa cada `STATUS:`, el
ciclo de operaciones, cómo revisar (`review`, `netlist`, `simulate`, sin mostrar nunca un valor por
predecir), los agujeros y la simulación de la página. Nunca reescribir los archivos de circuito; PNG
solo cuando importa el estilo.

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
review    {target}                   → APROBADO (redes revisadas contra el spec)
undo      {target}                   → rev 3, R2 vuelve a 330
```

Un circuito hecho a mano pasa en cambio por el ciclo de operaciones: `inspect`, luego `suggest`
(`parts` para una cadena, `profile: "lesson"`), `apply_ops` en seco, `netlist`, `review`.

## Los agentes usan estas herramientas

Los subagentes de `.claude/agents/` nombran estas herramientas ([agentes.md](agentes.md)). Si
una herramienta cambia de nombre, desaparece o cambia sus entradas, actualiza los agentes en el
mismo cambio; `npm run test:mcp` falla si un agente nombra una herramienta que el servidor ya
no tiene.
