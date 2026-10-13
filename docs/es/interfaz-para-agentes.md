# Interfaz para agentes: retomar, inspeccionar, cambiar

*[English](../en/agent-interface.md)*

Cómo un asistente, un agente o un script retoma un circuito existente y lo cambia sin
riesgo. Todos los comandos existen también en la API; el servidor MCP planeado expondrá
las mismas funciones como herramientas.

## Objetivos

Un **objetivo** es el lugar donde vive un circuito:

| Objetivo | Circuito | Historial | Salidas |
|---|---|---|---|
| una carpeta, `circuits/led/` | `circuit.json` | `history.jsonl` | `out/` |
| un archivo, `examples/led.json` | el archivo | `led.history.jsonl` al lado | `out/` al lado |

El archivo del circuito es la **única fuente de verdad**. El historial y las salidas se
derivan de él; las salidas (`<nombre>.front.svg`, `<nombre>.report.json`) se pueden borrar y
regenerar cuando sea.

## Retomar el trabajo

```bash
node bin/protoboard-iso.js history <objetivo>            # qué pasó, quién y por qué
node bin/protoboard-iso.js inspect <objetivo> --json     # el dibujo en números (o leer out/<nombre>.report.json)
node bin/protoboard-iso.js check <objetivo>              # observaciones de colocación y grupos conectados
```

Leer números, no imágenes: `inspect` da el agujero y la posición de cada pata, la
visibilidad y los problemas de etiquetas (ver [inspeccionar-y-anotar.md](inspeccionar-y-anotar.md)).

## Operaciones

Un circuito se cambia con operaciones pequeñas en vez de reescribir el archivo. Un lote es
**atómico**: se aplican todas las operaciones o ninguna.

| Operación | Ejemplo | Inversa |
|---|---|---|
| `add` | `{ "op": "add", "part": { "id": "C1", "type": "capacitor", "value": "100n", "pins": ["d12", "d13"] } }` | `remove` |
| `remove` | `{ "op": "remove", "part": "D2" }` | `add` (en la misma posición) |
| `move` | `{ "op": "move", "part": "W1", "pins": ["a11", "T-11"] }` | `move` de vuelta |
| `set` | `{ "op": "set", "part": "R1", "value": "4k7", "tolerance": null }` (`null` borra) | `set` con los valores anteriores |
| `rename` | `{ "op": "rename", "part": "R1", "to": "R10" }` | `rename` de vuelta |
| `circuit` | `{ "op": "circuit", "clearance": 3 }` (title, board, view, clearance, netLabels) | `circuit` con los valores anteriores |

`id` cambia solo con `rename` y `pins` solo con `move`. Esquema: `schema/ops.schema.json`.

## Prueba en seco y luego aplicar

```bash
node bin/protoboard-iso.js apply <objetivo> --ops '<json>' --dry-run --lang es
node bin/protoboard-iso.js apply <objetivo> --ops '<json>' --author claude --note "por qué" --expect-revision 3
node bin/protoboard-iso.js apply <objetivo> ops.json        # o "-" para leer de la entrada estándar
```

Los dos responden con una **diferencia**: qué observaciones y problemas del dibujo arregla
el cambio, cuáles introduce y cómo cambia la visibilidad de cada componente. Ejemplo:

```
Prueba en seco (no se guardó nada): la revisión 0 → 1 cambiaría:
  ✔ arregla: nota: De R1 se ve el 81 %; W1 tapa el 15 %.
  ✖ nuevo: nota: D1: la pata cathode está en columna 10 (filas a–e), que no toca nada más.
  visibilidad: R1 81 % → 96 %
```

Aquí el movimiento habría destapado a R1 pero desconectaba el LED: la prueba en seco lo
muestra antes de guardar nada. `--views front,back` mide las dos vistas.

**Revisiones.** Cada cambio guardado sube el `revision` del circuito y agrega una línea al
historial. `--expect-revision n` se niega a aplicar si el circuito ya no está en `n`, así
dos agentes nunca se pisan: ante `REVISION_MISMATCH`, volver a leer y reintentar.

## Historial y deshacer

```bash
node bin/protoboard-iso.js history <objetivo> [--json]
node bin/protoboard-iso.js undo <objetivo> --author claude
```

Cada línea del historial: `{ revision, time, author, note, ops, inverse, undoes? }`. `undo`
aplica la inversa del último cambio que no se haya deshecho y la registra como una revisión
nueva; si se vuelve a llamar, sigue retrocediendo.

## En la API

```js
import { applyOps, evaluate, diffEvaluations } from 'protoboard-iso';        // puro, también en el navegador
import { applyToTarget, undoTarget, readHistory } from 'protoboard-iso/workspace'; // archivos
```

## Un buen ciclo para un agente

1. `history` e `inspect --json` para entender el estado actual.
2. Proponer un lote de operaciones; `apply --dry-run`.
3. Si la diferencia no introduce nada indeseado, aplicar con `--expect-revision`, un autor y
   una nota que diga por qué.
4. Nunca editar `circuit.json` a mano mientras otros trabajan en él, ni editar las salidas.

## Lo que sigue (ver la hoja de ruta, etapa 1.5)

Consultas (`at`, `node`, `free`, `suggest`) para que las posiciones se calculen en vez de
adivinarlas, un servidor MCP que exponga todo esto como herramientas y roles de agentes
(montaje, revisor, bibliotecario) que comparten el estado por estos archivos.
