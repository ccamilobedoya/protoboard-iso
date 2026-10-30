# Agentes

*[English](../en/agents.md)*

Tres subagentes de Claude Code, definidos en `.claude/agents/`, reparten el trabajo para que
la conversación principal se mantenga liviana. Comparten el estado **por los archivos** (el
circuito, su historial con el autor de cada cambio y el informe derivado), nunca por el chat.
Usan las herramientas MCP ([mcp.md](mcp.md)) y, si no están, la línea de comandos.

| Agente | Hace | Modifica |
|---|---|---|
| `circuit-layout` (montaje) | arma o cambia un circuito a partir de un encargo: una receta o uno nuevo con `layout` (camino A), cambios y arreglos con `suggest` → prueba en seco → aplicar → `review` (camino B); al final, `simulate` para los avisos | el circuito (con `layout` y `apply_ops`) |
| `circuit-reviewer` (revisor) | veredicto a partir de mediciones (`review`, `inspect`, conexiones), con arreglos ya probados en seco | nada |
| `parts-librarian` (bibliotecario) | agrega componentes al kit desde hojas de datos: referencias, encapsulados, tipos, pruebas, documentación | el código del kit |

## `review`: la definición de «terminado» que todos comparten

```bash
node bin/protoboard-iso.js review <objetivo> [--profile lesson|draft] [--views front,back] [--explain] [--json]
```

Convierte `check` e `inspect` (en las dos vistas) en un veredicto, así todos los agentes y
todas las personas reciben la misma respuesta:

| Perfil | Bloquea |
|---|---|
| `lesson` (por defecto) | errores y avisos, etiquetas que tapan componentes o se montan entre sí, componentes más cerca que `clearance`, un componente tapado en **todas** las vistas (menos del 70 % a la vista desde su mejor vista), una red del `spec` del circuito que ya no está conectada |
| `draft` | solo errores y avisos |

Entre los errores y avisos están los componentes que ocupan el mismo espacio y, desde el
2026-10-16, una pata o un cable que atraviesa otro componente (`LEAD_THROUGH_PART`,
`WIRE_THROUGH_PART`): la pata de una resistencia doblada por encima de unos pines de cabecera, un
cable por debajo de un regulador. Todo lo demás son notas (patas sin conectar, líneas guía, texto
pequeño, un componente tapado solo en una vista: usar la otra). Cada punto que bloquea nombra sus
componentes y las vistas donde aparece; `--explain` (`explain: true`) agrega las reglas del perfil.
Código de salida 0 si se aprueba y 2 si hay que cambiar algo. También existe como herramienta MCP
(`review`).

## Menos llamadas por circuito

Medido el 2026-10-16: un agente de montaje que rehízo una fuente de dos rieles necesitó 68
llamadas y unos 185 000 tokens. Lo que lo reduce:

- `catalog` sin `name` es una lista compacta (unos 2 KB en vez de 20); `name` da los campos y un
  ejemplo real de un tipo solo cuando hace falta.
- `suggest` con `parts` coloca una cadena de componentes en una llamada, cada uno según los
  anteriores, nombrando patas ya colocadas como grupos (`"R1.2"`); con `profile: "lesson"` deja
  fuera lo que la revisión bloquearía, así hay menos rondas de revisión. Además mide más
  candidatos cuando los primeros fallan, en vez de responder «no hay posición».
- `netlist` revisa todas las conexiones contra el encargo en una llamada (antes era un `query
  node` por tira).
- Desde el 2026-10-17 (después de dos corridas con un modelo más pequeño que se encerraron
  solas): `suggest` reserva espacio para lo que viene. Una tira con una pata sola, y cada grupo
  que nombra una pieza posterior de la cadena, conserva un agujero utilizable por cada conexión
  pendiente: que no esté debajo de un cuerpo y que un cable de prueba desde ahí pase la misma
  evaluación que una colocación. En una cadena también prueba las piezas que cuelgan de la que
  coloca y, si ninguna de sus seis mejores posiciones las deja caber, se queda con la mejor y una
  nota `DEPENDENT_BLOCKED`. Cuando nada cabe dice por qué (`reasons`), así el agente no repite la
  misma llamada; también coloca las piezas que van al lado de la protoboard (interruptor, UNO), y
  una pieza que cuelga de otra que falló lo dice. `create_circuit`, `inspect` y `catalog name:
  bb400` dan el mapa de la protoboard (los rieles tienen agujeros por grupos: en una bb400 no
  existe `B-7`), y un agujero que no existe nombra los más cercanos. `between` acepta `null` para una pata que va a
  una tira libre, y `set` rechaza los campos que el tipo de pieza no tiene (un `set` con `{"field":
  …, "value": …}` se guardaba sin aviso y la descripción no quedaba). Cuando una pieza no cabe en el grupo pedido, `suggest` la pone en
  una tira libre cercana y la une con un cable en el mismo lote (nota `VIA_WIRE`; `via: false` lo
  apaga); un cuerpo pegado a otro paga en la puntuación, y una pata sin grupo pedido nunca cae en un
  riel.
- El servidor recarga el kit cuando cambia su código ([mcp.md](mcp.md)), así nadie tiene que
  reconectarlo después de actualizar el kit.

## `layout`: el circuito entero en una llamada (desde el 2026-10-17)

Para un circuito nuevo sin posiciones fijas, el agente de montaje empieza con `layout` (herramienta
MCP o `protoboard-iso layout <objetivo> <spec.json>`): los componentes sin patas en el orden de la
señal y las redes como listas de patas y rieles. El algoritmo ubica los componentes por capas
(distancia a la fuente) y con reglas según el tipo de pieza, agrega los cables y verifica las redes
y la revisión lesson, en alrededor de un segundo; medido con la fuente de dos rieles de `examples/layout/two-rail-supply.json` (10
componentes, 10 redes): aprobada, 7 cables, 1,8 s. Lo que no logra resolver vuelve como puntos que
bloquean para el ciclo de siempre. Los componentes se pueden dar por número de parte, módulo o
alias (`"part": "7805"`, `"KCD1"`, `"UNO"`, `"resistencia"`), así el agente no los busca antes;
una lista con errores no coloca nada y responde todos los problemas de una vez (nombres que no
conoce con los más parecidos, redes que nombran una pieza o pata que no existe con las patas que
tiene); `check_only` solo revisa. Medido con un modelo más pequeño con la misma fuente: 13
llamadas y 52 s, nueve de ellas consultas a `catalog` que esto vuelve innecesarias. Cómo funciona
el algoritmo, sus límites y cómo cambiarlo: [montaje-automatico.md](montaje-automatico.md).

Desde el 2026-10-20 (pensando en modelos pequeños): el archivo del agente empieza eligiendo camino
(A: `layout` para un circuito nuevo; B: operaciones para cambios y arreglos) en vez de un solo ciclo
largo; `layout` lee los nombres de las patas como los escribe la gente (`D1.K` para el cátodo de un
LED, `U1.DISCH`, `U1.GPIO4`, `U1.VIN`); su respuesta termina en una sola línea `STATUS:` (`DONE`,
`CHANGES`, `FIX_SPEC`) que dice qué sigue; y el agente de montaje y el revisor corren `simulate` una
vez para ver los avisos (corto, límite superado, grupo flotante), sin reportar valores. Hasta ese
día la lista de herramientas del agente de montaje no tenía `layout`; `npm run test:mcp` ahora falla
si las instrucciones de un agente nombran una herramienta que su lista no tiene.

También desde el 2026-10-20: un circuito hecho con `layout` guarda sus redes (`spec`), `review` las
revisa, y cambiar conexiones o piezas es otra llamada a `layout` sobre el mismo destino con las redes
nuevas (camino A): cada pieza conserva sus agujeros si todavía cabe, y `undo` trae el montaje
anterior. Las redes de tierra van a un riel − por convención, y lo que deja el ciclo de reintentos se
intenta una vez más cable por cable. El perfil lesson bloquea una pieza por oculta cuando su mejor
vista muestra menos del 70 % (antes, 85 % en cada vista): las dos del banco pasan al primer intento.
Detalle en [montaje-automatico.md](montaje-automatico.md).

Desde el 2026-10-26: **recetas** ([recetas.md](recetas.md)), los circuitos de clase habituales
que `layout` recibe por nombre con solo los valores que cambian (`{"recipe": "npn-switch", "values":
{"R1": "470"}}`), cada uno probado para que salga `DONE` en una llamada. Un circuito de receta no
necesita agente: la conversación principal llama a `layout` ella misma y deja al agente de montaje
para `CHANGES` (o pasa la receta en la línea `Recipe:` del encargo). El camino A del agente empieza
por la receta cuando el encargo pide uno de esos circuitos.

## El ciclo (lo maneja la conversación principal)

```text
pedido del usuario
  → ¿una receta? layout con recipe y values desde aquí (STATUS: DONE → mostrarlo)
  → circuit-layout   (LAYOUT BRIEF)    → LAYOUT REPORT, circuito en la revisión n
  → circuit-reviewer (REVIEW BRIEF)    → REVIEW REPORT: APROBADO, o CAMBIOS con arreglos
  → si hay CAMBIOS: pasar los arreglos al mismo circuit-layout (como mucho review_rounds rondas)
  → mostrar el resultado: render con fit "parts" (y annotate cuando se enseñan agujeros)
  → para embeberlo en la documentación: out/<nombre>.html, ya reescrita (docs/es/embeber.md)
si falta un componente en cualquier momento → parts-librarian (PARTS BRIEF) → PARTS REPORT
```

El revisor también revisa la **intención**: lee la `netlist` y bloquea una conexión que falte
o esté mal aunque las mediciones pasen.

## Encargos

Un agente no ve la conversación: todo lo que necesita va en el encargo. Los formatos están
en inglés porque los agentes son parte del repositorio público; el contenido puede ir en
español, y el agente responde en el idioma del encargo.

```text
LAYOUT BRIEF
Target: <nombre> (una carpeta bajo la raíz del MCP, sin prefijo "circuits/"; new | existing, revision n)
Goal: <para qué sirve el circuito, una línea>
Recipe: <nombre y valores, {"R1": "470"}, cuando es una; entonces sin Connections ni Parts>
Connections: <una línea cada una: "R1 entre el riel T+ y el ánodo del LED", "cátodo del LED a T- por W1">
Parts: <id, tipo, valor o referencia; posiciones solo si el usuario las fijó>
Board: <bb400 | bb830 …>, may grow (si el montaje puede pasar a la protoboard elástica, auto)
Constraints: <clearance (3 por defecto para clases), zona de la protoboard, vista>
Fidelity: functional (por defecto) | exact
Page: live (por defecto: simulación activa, botón Corriente) | no simulation (un valor por predecir: page.simulation false)
Done when: review <perfil> APPROVED
```

`Fidelity: functional` (por defecto, decisión del mantenedor después de que la fuente de dos rieles
del 2026-10-16 gastó la mitad de los tokens de una sesión copiando una foto): las mismas conexiones y
el mismo comportamiento (se simula cuando tiene fuente), ningún componente atravesando a otro,
review aprobado; las posiciones de una foto son una pista, no un objetivo. `exact` solo cuando la
lección trata de dónde va cada cosa en la protoboard. Cada pieza del encargo tiene que existir en el
kit: `layout` revisa los nombres él mismo (los que no conoce vuelven con los más parecidos, sin crear
nada), y el camino B consulta un tipo en `catalog` solo si no lo ha usado. Si falta una pieza, va
primero a `parts-librarian`, no a un marcador.

```text
REVIEW BRIEF
Target: <nombre> · revision <n>
Profile: lesson | draft
Intent: <las conexiones que debe tener el circuito, como en el encargo de montaje>
```

```text
PARTS BRIEF
Part: <referencia> · <para qué se usa>
Datasheet: <URL, si se conoce>
Needed for: <circuito o clase>
```

Las respuestas siguen los formatos del final de cada archivo de agente (`LAYOUT REPORT`,
`REVIEW REPORT`, `PARTS REPORT`). Cada una termina en una sola línea `STATUS:`, así la conversación
principal sabe qué sigue sin leer el resto: montaje `DONE | CHANGES | BLOCKED`, revisión
`APPROVED | CHANGES` (la misma palabra que su veredicto), componentes `DONE | BLOCKED`.
`node scripts/report-status.js < informe` comprueba la línea y que coincida con el informe.

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
| las reglas de privacidad (`CLAUDE.md`, «Privacy»; `test/privacy.test.js`) | la regla de `parts-librarian` sobre lo que escribe |
| el algoritmo de montaje (`src/layout.js`: su especificación, lo que responde, lo que deja al ciclo) | el paso 0 de `circuit-layout`, la descripción de la herramienta MCP `layout`, [montaje-automatico.md](montaje-automatico.md) |
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
  Los números son opciones con nombre en `project.json` (`review_rounds`, `briefs_per_agent`),
  que se ven en `CLAUDE.md`.
