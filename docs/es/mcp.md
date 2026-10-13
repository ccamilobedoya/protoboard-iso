# Servidor MCP

*[English](../en/mcp.md)*

`mcp/server.js` expone el kit como herramientas del [Model Context
Protocol](https://modelcontextprotocol.io), para que cualquier asistente compatible (Claude
Code, Claude Desktop, otros agentes) retome, inspeccione y cambie circuitos con entradas
tipadas y respuestas cortas y estructuradas. Es una capa delgada sobre las mismas funciones
de la línea de comandos (ver [interfaz-para-agentes.md](interfaz-para-agentes.md)).

Vive en su propio paquete (`mcp/package.json`) porque necesita el SDK de MCP y Zod; el kit en
sí sigue sin dependencias.

## Instalar y probar

```bash
cd mcp && npm install          # @modelcontextprotocol/sdk, zod (+ @resvg/resvg-js opcional, para PNG)
npm run test:mcp               # desde la raíz del repositorio: pruebas de punta a punta con el cliente MCP
```

Variables de entorno:

| Variable | Por defecto | Qué es |
|---|---|---|
| `PROTOBOARD_ROOT` | la carpeta actual | la única carpeta que el servidor lee y escribe; rechaza rutas fuera de ella |
| `PROTOBOARD_LANG` | `en` | idioma de las respuestas en texto (`en`, `es`) |

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
| `get_circuit` | el JSON del circuito, su revisión y observaciones de colocación | no |
| `create_circuit` | carpeta de circuito nueva (no sobrescribe) | sí |
| `inspect` | el dibujo en números; `part` para un solo componente | no |
| `query` | `kind: at \| node \| free` con `ref` | no |
| `suggest` | posiciones válidas para un componente nuevo, cada una con su operación `add` | no |
| `apply_ops` | lote atómico; primero `dry_run`, luego `expect_revision`, `author`, `note` | sí |
| `undo` | deshace el último cambio (revisión nueva) | sí |
| `review` | APROBADO o CAMBIOS a partir de mediciones, perfil `lesson` o `draft` | no |
| `history` | revisiones, autores, notas, operaciones | no |
| `render` | escribe el SVG; con `png_width` devuelve también una imagen PNG; con `page: true` reescribe la página para embeber ([embeber.md](embeber.md)) | solo salidas |
| `catalog` | tipos, referencias, encapsulados, protoboards, vistas, operaciones, capas | no |

Todas responden en texto legible, o en JSON con `format: "json"`. Los errores vuelven como
errores de la herramienta con un mensaje legible (`isError`), nunca como una caída. Las de
solo lectura llevan `readOnlyHint`, para que los clientes puedan permitirlas sin preguntar.

El servidor envía además **instrucciones** con el ciclo de trabajo: listar →
historial/inspeccionar → consultar/sugerir → apply_ops en seco → apply_ops con
expect_revision → deshacer si hace falta; nunca reescribir los archivos de circuito
directamente; PNG solo cuando importa el estilo.

## Ejemplo de sesión

```
list_circuits                       → circuits/led · rev 0 · 3 componentes
inspect   {target: "circuits/led"}  → … De R1 se ve el 81 %; W1 tapa el 15 %.
suggest   {target, part: {type: "resistor", value: "1k"}, between: ["10:a-e", "T-"]}
apply_ops {target, ops: <de suggest>, dry_run: true}         → qué arregla / qué introduce
apply_ops {target, ops, expect_revision: 0, author: "claude", note: "resistencia de pull-down"} → rev 1
```

## Los agentes usan estas herramientas

Los subagentes de `.claude/agents/` nombran estas herramientas ([agentes.md](agentes.md)). Si
una herramienta cambia de nombre, desaparece o cambia sus entradas, actualiza los agentes en el
mismo cambio; `npm run test:mcp` falla si un agente nombra una herramienta que el servidor ya
no tiene.
