# Agentes

*[English](../en/agents.md)*

Tres subagentes de Claude Code, definidos en `.claude/agents/`, reparten el trabajo para que
la conversación principal se mantenga liviana. Comparten el estado **por los archivos** (el
circuito, su historial con el autor de cada cambio y el informe derivado), nunca por el chat.
Usan las herramientas MCP ([mcp.md](mcp.md)) y, si no están, la línea de comandos.

| Agente | Hace | Modifica |
|---|---|---|
| `circuit-layout` (montaje) | arma o cambia un circuito a partir de un encargo: `suggest` → prueba en seco → aplicar → `review` hasta que se aprueba | el circuito (con `apply_ops`) |
| `circuit-reviewer` (revisor) | veredicto a partir de mediciones (`review`, `inspect`, conexiones), con arreglos ya probados en seco | nada |
| `parts-librarian` (bibliotecario) | agrega componentes al kit desde hojas de datos: referencias, encapsulados, tipos, pruebas, documentación | el código del kit |

## `review`: la definición de «terminado» que todos comparten

```bash
node bin/protoboard-iso.js review <objetivo> [--profile lesson|draft] [--views front,back] [--json]
```

Convierte `check` e `inspect` (en las dos vistas) en un veredicto, así todos los agentes y
todas las personas reciben la misma respuesta:

| Perfil | Bloquea |
|---|---|
| `lesson` (por defecto) | errores y avisos, etiquetas que tapan componentes o se montan entre sí, componentes más cerca que `clearance`, un componente tapado en **todas** las vistas |
| `draft` | solo errores y avisos |

Todo lo demás son notas (patas sin conectar, líneas guía, texto pequeño, un componente tapado
solo en una vista: usar la otra). Código de salida 0 si se aprueba y 2 si hay que cambiar
algo. También existe como herramienta MCP (`review`).

## El ciclo (lo maneja la conversación principal)

```
pedido del usuario
  → circuit-layout   (LAYOUT BRIEF)    → LAYOUT REPORT, circuito en la revisión n
  → circuit-reviewer (REVIEW BRIEF)    → REVIEW REPORT: APROBADO, o CAMBIOS con arreglos
  → si hay CAMBIOS: pasar los arreglos al mismo circuit-layout (como mucho dos rondas)
  → mostrar el resultado: render con fit "parts" (y annotate cuando se enseñan agujeros)
si falta un componente en cualquier momento → parts-librarian (PARTS BRIEF) → PARTS REPORT
```

El revisor también revisa la **intención**: consulta los grupos que nombra el encargo y
bloquea una conexión que falte o esté mal aunque las mediciones pasen.

## Encargos

Un agente no ve la conversación: todo lo que necesita va en el encargo. Los formatos están
en inglés porque los agentes son parte del repositorio público; el contenido puede ir en
español, y el agente responde en el idioma del encargo.

```
LAYOUT BRIEF
Target: circuits/<nombre> (new | existing, revision n)
Goal: <para qué sirve el circuito, una línea>
Connections: <una línea cada una: "R1 entre el riel T+ y el ánodo del LED", "cátodo del LED a T- por W1">
Parts: <id, tipo, valor o referencia; posiciones solo si el usuario las fijó>
Constraints: <clearance (3 por defecto para clases), zona de la protoboard, vista>
Done when: review <perfil> APPROVED
```

```
REVIEW BRIEF
Target: circuits/<nombre> · revision <n>
Profile: lesson | draft
Intent: <las conexiones que debe tener el circuito, como en el encargo de montaje>
```

```
PARTS BRIEF
Part: <referencia> · <para qué se usa>
Datasheet: <URL, si se conoce>
Needed for: <circuito o clase>
```

Las respuestas siguen los formatos del final de cada archivo de agente (`LAYOUT REPORT`,
`REVIEW REPORT`, `PARTS REPORT`).

## Mantener los agentes al día

Los agentes son parte del repositorio y **dependen del resto**: cada archivo de
`.claude/agents/` nombra herramientas MCP, comandos, operaciones, perfiles de revisión, reglas
y los formatos de encargos y respuestas. Un cambio en cualquiera de esas cosas puede obligar a
cambiar los agentes:

| Si cambias… | Actualiza |
|---|---|
| una herramienta MCP (nombre, entradas, lo que devuelve) o un comando | la lista `tools:` y las instrucciones de cada agente que la use |
| las operaciones (`src/ops.js`) o los perfiles de revisión (`src/review.js`) | las reglas y el ciclo de `circuit-layout` y `circuit-reviewer` |
| cómo se agregan componentes (`docs/*/agregar-componentes.md`, registros, esquemas) | el orden de trabajo y las comprobaciones de `parts-librarian` |
| un formato de encargo o de respuesta, o el ciclo | los archivos de los agentes y esta página (en los dos idiomas) |

Se hace en el mismo cambio. `npm run test:mcp` comprueba que cada herramienta
`mcp__protoboard-iso__…` que nombra un agente exista en el servidor, así que una herramienta
renombrada o eliminada no pasa desapercibida.

## Notas

- Los agentes se cargan cuando arranca una sesión de Claude Code en este repositorio; las
  herramientas MCP también.
- Cada agente firma sus cambios con su nombre como `author`, así `history` muestra quién
  hizo qué.
- Agentes de vida corta: uno nuevo por tarea; se reutiliza solo para las rondas de arreglos
  del mismo circuito.
