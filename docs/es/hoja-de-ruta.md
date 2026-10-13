# Hoja de ruta

*[English](../../ROADMAP.md)* · Diseño y reglas: [planeacion.md](planeacion.md)

Cada etapa termina en algo que sirve por sí solo. Una etapa está **terminada** cuando su
lista está completa, `npm test` pasa, los ejemplos se dibujan desde las dos vistas y
alguien miró los dibujos (`npm run examples && npm run preview`).

Leyenda: ✅ hecho · 🔜 lo siguiente · ⬜ planeado

---

## Etapa 1 — SVG estático con posicionamiento correcto ✅ (v0.1)

Objetivo: entra un JSON y sale un dibujo isométrico fiel, con la colocación revisada.

- ✅ Mundo en milímetros, cámara isométrica exacta, vistas con nombre (`front`, `back`, `front-left`, `back-right`)
- ✅ Primitivas: prisma/caja, torno, tubo, calcomanías (polígono, círculo, rectángulo), texto sobre planos 3D
- ✅ Algoritmo del pintor con descarte de caras traseras y sombreado por cara relativo a la cámara
- ✅ Protoboards como datos: `bb830` y `bb400`, rieles continuos, `split` opcional
- ✅ Encapsulados: axial, LED de 5 y 3 mm, electrolítico radial, cerámico de disco, TO-220, TO-92, cable (arco o plano)
- ✅ Tipos: resistencia (4 o 5 bandas, IEC 60062), capacitor (código «104», tamaño según C·V), LED, diodo, MOSFET, BJT, cable
- ✅ Tabla de referencias (`src/parts/db.js`)
- ✅ Netlist a partir de las tiras de la protoboard
- ✅ Comprobaciones: agujero ocupado, patas en corto, separación de patas, patas en línea, pata suelta, choque de cuerpos
- ✅ Traducción: inglés y español, mensajes, etiquetas y separador decimal
- ✅ Línea de comandos: `render`, `check`, `netlist`, `parts`; `--view`, `--lang`, `--fit parts`, `--no-labels`
- ✅ Etiquetas como globos en filas **por encima del componente más alto** (el texto nunca tapa un componente), con líneas guía
- ✅ Encuadre de cerca (`fit: 'parts'`)
- ✅ Separación mínima opcional (`clearance`, en mm) para montajes de clase; vitrina con más espacio
- ✅ SVG dividido en los grupos `board`, `parts`, `labels` y `annotations` (listo para mostrar al pasar el mouse y ocultar)
- ✅ La escena como lista de dibujo compartida por el escritor de SVG, el inspector y las anotaciones
- ✅ `inspect`: posiciones (agujero, mm, px), visibilidad y quién tapa, problemas de etiquetas y líneas guía, tamaño del texto; en texto o `--json`
- ✅ Capas de anotación `--annotate pins,nodes,boxes,grid|all`
- ✅ Las etiquetas esquivan las etiquetas impresas de los rieles
- ✅ Ejemplos, pruebas (node:test), galería y vista previa en PNG
- ✅ Documentación en inglés y español; `SKILL.md`

### Pulido de la etapa 1 (pequeño, en cualquier momento) 🔜

- ⬜ Líneas guía que no se crucen entre sí ni atraviesen componentes (filas ordenadas por profundidad, trazado en codo)
- ⬜ Que las etiquetas de patas de la capa `pins` no se monten entre sí (medido por `inspect`, como las etiquetas)
- ⬜ Llevar a cero las notas de `inspect` que quedan en los ejemplos (líneas guía que se cruzan, componentes detrás de Q1)
- ⬜ LED: lado plano en la pestaña del cátodo; pata del ánodo más larga cuando `standoff` es alto
- ⬜ Electrolítico: signos «−» en la franja; valor impreso en la funda
- ⬜ Opción de etiqueta (`labels: 'value' | 'id' | 'both'`)
- ⬜ Comparar el orden y los colores de los rieles con la protoboard real (`bb830.js`)
- ⬜ Más encapsulados: potenciómetro (trimmer y de panel), pulsador de 6×6, DIP-8/14/16 (555, amplificadores operacionales) sobre el canal central, pines de cabecera, zumbador, conector de batería de 9 V
- ⬜ Pintor: ordenar mejor los cables frente a componentes altos (partir arcos largos, sesgo de profundidad)
- ⬜ Documentar los códigos de salida de `check`; salida JSON para herramientas (`--json`)
- ⬜ JSON Schema del archivo de circuito (autocompletado en el editor, validación fuera del kit)

## Etapa 1.5 — Interfaz para agentes 🔜

Objetivo: cualquier asistente o agente puede retomar un circuito existente, entenderlo con
un informe corto y cambiarlo con operaciones pequeñas y validadas, cuyo efecto se mide antes
de aplicarlas. Las mismas operaciones moverán después el editor interactivo.

- ✅ **Operaciones** sobre un circuito: `add`, `remove`, `move`, `set`, `rename`, `circuit`; atómicas, validadas y cada una con su inversa
- ✅ **Prueba en seco con diferencia**: qué arregla y qué introduce un lote de operaciones (observaciones de `check` + problemas de `inspect`)
- ✅ **Historial y deshacer**: `history.jsonl` junto al circuito, número de revisión, autor y nota por cambio; `undo` aplica la inversa
- ✅ **Control de revisión**: `--expect-revision` para que dos agentes nunca se pisen
- ✅ **Informe derivado**: `report.json` junto a las salidas, para que retomar sea leer números y no imágenes
- ✅ **JSON Schemas** del archivo de circuito y de las operaciones (editores, esquemas de las herramientas MCP)
- ✅ Línea de comandos: `apply`, `undo`, `history`; todos los comandos aceptan un archivo o una carpeta
- ✅ Documentación: `docs/en/agent-interface.md` / `docs/es/interfaz-para-agentes.md`
- 🔜 **Consultas**: `at <agujero>`, `node <nodo>`, `free [near]`, `suggest <componente> between <nodo> and <nodo>` (posiciones válidas ordenadas por separación y visibilidad)
- ⬜ **Servidor MCP** (`mcp/`, paquete propio para que el núcleo siga sin dependencias): `list_circuits`, `get_circuit`, `inspect`, `query`, `apply_ops`, `undo`, `history`, `render`, `catalog`; `.mcp.json` del proyecto
- ⬜ `SKILL.md` prefiere las herramientas MCP y usa la línea de comandos como respaldo
- ⬜ Roles de agentes (`.claude/agents/`): montaje, revisor, bibliotecario; comparten el estado por los archivos, no por el chat

## Etapa 2 — Simulación (primero DC) ⬜

Objetivo: el voltaje (tensión) de cada nodo y la corriente de cada componente, calculados por el kit.

- ⬜ Fuentes: fuente de banco en los rieles (campo `supplies`), batería como componente
- ⬜ Solver MNA, DC lineal: resistencias, cables, fuentes de voltaje (`src/sim/`)
- ⬜ Diodos y LED: modelo de Shockley, iteración de Newton, parámetros por color
- ⬜ Capacitores: análisis transitorio, Euler implícito
- ⬜ MOSFET (ley cuadrática) y BJT (Ebers–Moll simplificado)
- ⬜ Cada modelo comprobado una vez contra una referencia (Falstad o un valor de libro) y guardado como prueba
- ⬜ Resultados estáticos sobre el SVG: voltajes de nodo, corrientes, potencia; rotulados como **modelo**
- ⬜ Resultados expuestos por `inspect` y por las herramientas MCP (voltajes y corrientes por nodo y componente)

## Estilo visual y temas (transversal, después de la etapa 2) ⬜

Objetivo: dibujos que primero enseñen. Realismo donde ayuda a reconocer un componente;
calma en todo lo demás, para que los componentes resalten.

- ⬜ Sistema de temas: cada color sale de una paleta con nombre (`theme: 'realistic' | 'study' | …`), ningún color fijo dentro de los encapsulados
- ⬜ Tema `study`: una protoboard menos realista y más estética (plana, de tono apagado, agujeros e impresión más suaves, bordes discretos) para que resalten los componentes y los cables
- ⬜ Revisar las paletas de componentes (cables, LED, bandas) por contraste y para personas con daltonismo; las bandas siguen fieles a IEC 60062
- ⬜ Modo resaltado: atenuar todo menos los componentes o tiras que se están explicando
- ⬜ Tema oscuro para pantallas

## Etapa 3 — Animación en el navegador ⬜

Objetivo: ver el circuito funcionar.

- ⬜ Módulo de navegador que dibuja la misma escena en un SVG vivo (o canvas) en cada cuadro
- ⬜ Electrones recorriendo patas y cables, velocidad proporcional a la corriente, del − al +
- ⬜ Voltaje como color en tiras y patas, con una escala fija
- ⬜ Brillo del LED según su corriente; tinte de calor según la potencia
- ⬜ Controles deslizantes para valores y voltaje de la fuente, que vuelven a resolver al instante

## Etapa 4 — En el celular o la tableta ⬜

Objetivo: abrir un enlace y explorar.

- ⬜ Página interactiva de un solo archivo (sin compilación)
- ⬜ Zoom dinámico: pellizcar y rueda del mouse, desplazamiento, doble toque en un componente para acercarse; más detalle al acercarse (números de agujero, marcas de los componentes)
- ⬜ Etiquetas solo al pasar el mouse o al tocar (el SVG estático conserva los globos por encima de los componentes)
- ⬜ Multímetro virtual: puntas en agujeros; voltímetro en paralelo; el amperímetro obliga a abrir el circuito
- ⬜ Cambiar entre vista frontal y trasera; tocar una tira resalta todo lo conectado a ella
- ⬜ Modo predicción: lecturas ocultas hasta que el estudiante se compromete con una respuesta

## Etapa 5 — Escribir circuitos más rápido ⬜

- ⬜ Plantillas: circuitos comunes donde solo cambian los valores (LED + resistencia, divisor, RC, transistor como interruptor)
- ⬜ Colocación automática a partir de una netlist («R1 entre 5V y n1»), respetando `clearance` para que las clases nunca queden apretadas
- ⬜ Adaptadores: importar y exportar `diagram.json` de Wokwi; exportar un enlace de Falstad CircuitJS

## Etapa 6 — Publicación ⬜

- ⬜ Primera versión pública en GitHub, v0.x; plantillas de issues; guía de contribución
- ⬜ Paquete en npm; formato de circuito versionado con notas de migración
- ⬜ Sitio con la galería de ejemplos
