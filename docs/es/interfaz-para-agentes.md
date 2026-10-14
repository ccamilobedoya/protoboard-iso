# Interfaz para agentes: retomar, inspeccionar, cambiar

*[English](../en/agent-interface.md)*

Cómo un asistente, un agente o un script retoma un circuito existente y lo cambia sin
riesgo. Todos los comandos existen también en la API y como herramientas del servidor MCP
([mcp.md](mcp.md)).

## Objetivos

Un **objetivo** es el lugar donde vive un circuito:

| Objetivo | Circuito | Historial | Salidas |
|---|---|---|---|
| una carpeta, `circuits/led/` | `circuit.json` | `history.jsonl` | `out/` |
| un archivo, `examples/led.json` | el archivo | `led.history.jsonl` al lado | `out/` al lado |

El archivo del circuito es la **única fuente de verdad**. El historial y las salidas se
derivan de él; las salidas (`<nombre>.front.svg`, `<nombre>.html`, `<nombre>.report.json`) se
pueden borrar y regenerar cuando sea. `<nombre>.html` es la página para embeber en la
documentación: ver [embeber.md](embeber.md).

## Retomar el trabajo

```bash
node bin/protoboard-iso.js history <objetivo>            # qué pasó, quién y por qué
node bin/protoboard-iso.js inspect <objetivo> --json     # el dibujo en números (o leer out/<nombre>.report.json)
node bin/protoboard-iso.js check <objetivo>              # observaciones de colocación y grupos conectados
```

Leer números, no imágenes: `inspect` da el agujero y la posición de cada pata, la
visibilidad y los problemas de etiquetas (ver [inspeccionar-y-anotar.md](inspeccionar-y-anotar.md)).

## Consultas: preguntar en vez de calcular

```bash
node bin/protoboard-iso.js query <objetivo> at h12                     # quién está en el agujero, su grupo
node bin/protoboard-iso.js query <objetivo> node 9:f-j                 # un grupo por nombre o por cualquier agujero (h9)
node bin/protoboard-iso.js query <objetivo> free --near f10 --limit 10 [--empty]
node bin/protoboard-iso.js suggest <objetivo> --part '{"type":"resistor","value":"1k"}' --between 10:f-j,T-
node bin/protoboard-iso.js suggest <objetivo> --part '{"type":"mosfet","part":"IRLZ44N"}' --connect '{"D":"h20"}'
```

- **`at`**: el grupo del agujero, quién lo ocupa, los agujeros usados y libres del grupo.
- **`node`**: todos los agujeros de un grupo (`9:f-j`, `T+` o cualquier agujero suyo),
  usados y libres, y la etiqueta del riel si la tiene.
- **`free`**: agujeros libres, primero los más cercanos a `--near` (un agujero, un grupo o un
  número de columna); `--empty` deja solo grupos que nadie usa todavía.
- **`suggest`**: posiciones válidas para un componente **nuevo**, de mejor a peor.
  `--between a,b` da los grupos de un componente de dos patas, en el orden de las patas;
  `--connect '{"pata":"grupo o agujero"}'` nombra los grupos de algunas patas (las demás van
  a tiras libres y vacías). `--near` centra la búsqueda y `--window` (mm, por defecto 20) la
  amplía.

Cómo funciona `suggest`: una pasada geométrica rápida por todos los juegos de agujeros que
cumplen las reglas de las patas y los grupos pedidos; luego mide la mejor docena igual que
una prueba en seco. Descarta las posiciones que agregan un error o un aviso; ordena el resto
por separación cercana a la ideal, alineación con la cuadrícula, distancia al centro, notas
nuevas (líneas guía cruzadas, componentes demasiado cerca) y el componente menos visible. Los
de tres patas prefieren la pata 1 a la izquierda, para que la impresión mire a la vista
frontal. Cada posición trae la operación `add` lista para aplicar:

```
Posiciones para R2 (Resistencia, axial), de mejor a peor; 12 medidas:
  1. 1→i10, 2→T-11 · separación 10,5 mm · puntuación 5,3 · componente menos visible 81 %
Para usar la primera (revisa con una prueba en seco y luego aplica):
  protoboard-iso apply <objetivo> --ops '[{"op":"add","part":{…,"pins":["i10","T-11"]}}]' --dry-run
```

Si nada cabe, dice por qué: `NO_PLACEMENT`, o `NO_PLACEMENT_RAIL` cuando se le pide a un
componente de tres patas que llegue directo a un riel (no puede: va en tiras libres y se
agrega un cable).

## Operaciones

Un circuito se cambia con operaciones pequeñas en vez de reescribir el archivo. Un lote es
**atómico**: se aplican todas las operaciones o ninguna.

| Operación | Ejemplo | Inversa |
|---|---|---|
| `add` | `{ "op": "add", "part": { "id": "C1", "type": "capacitor", "value": "100n", "pins": ["g12", "g13"] } }` | `remove` |
| `remove` | `{ "op": "remove", "part": "D2" }` | `add` (en la misma posición) |
| `move` | `{ "op": "move", "part": "W1", "pins": ["j11", "T-11"] }` | `move` de vuelta |
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
  ✖ nuevo: nota: D1: la pata cathode está en columna 10 (filas f–j), que no toca nada más.
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
2. Preguntar en vez de calcular: `query` para agujeros y grupos, `suggest` para dónde va un
   componente nuevo. Luego proponer un lote de operaciones; `apply --dry-run`.
3. Si la diferencia no introduce nada indeseado, aplicar con `--expect-revision`, un autor y
   una nota que diga por qué.
4. `review <objetivo>` hasta que diga APROBADO (perfiles en [agentes.md](agentes.md)).
5. Nunca editar `circuit.json` a mano mientras otros trabajan en él, ni editar las salidas.

## Agentes

Los roles de montaje, revisor y bibliotecario, construidos sobre estas herramientas: [agentes.md](agentes.md).

## Códigos de salida (línea de comandos)

| Código | Significado |
|---|---|
| 0 | todo bien |
| 1 | errores en el circuito, un cambio rechazado (`REVISION_MISMATCH`, operaciones mal formadas), nada que deshacer o ninguna posición encontrada |
| 2 | `review` pide cambios |

Todos los comandos que informan algo aceptan también `--json` (`check`, `inspect`, `apply`, `undo`, `history`, `query`, `suggest`, `review`).
