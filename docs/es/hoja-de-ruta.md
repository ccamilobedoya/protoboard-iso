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

- ✅ Líneas guía que nunca se cruzan: verticales siempre que se pueda, y las inclinadas después, en la fila con menos cruces (cero en todos los ejemplos, con prueba)
- ⬜ Líneas guía que no pasen sobre otros componentes (quedan notas `LEADER_OVER_PART`)
- ✅ Etiquetas de patas de la capa `pins` que no se montan entre sí ni sobre los anillos de los agujeros (con prueba)
- ✅ LED: lado plano en la pestaña del cátodo
- ✅ LED: pata del ánodo más larga (un quiebre pequeño sobre la protoboard)
- ✅ Electrolítico: signos «−» en la franja
- ✅ Electrolítico: valor impreso a lo largo de la funda, una copia por vista
- ✅ Modos de etiqueta: `labels: 'both' | 'id' | 'value' | false` (`--labels`, `render` del MCP)
- ⬜ Comparar el orden y los colores de los rieles con la protoboard real (`bb830.js`)
- ✅ Potenciómetro (de pie, perilla al frente, marca del cursor), pulsador de 6×6 a caballo del canal (pares internos, `SWITCH_BYPASSED`), chips DIP colocados con `pin1` (NE555, LM358, 74HC595, CD4017); `suggest` los coloca; ejemplo `controls-and-ics.json`
- ✅ Más encapsulados: trimmer multivuelta (3296W), pines de cabecera, zumbador pasivo, gota del NTC, fotorresistencia, baterías al lado de la protoboard (portapilas AA/AAA/18650, batería de 9 V con su broche, LiPo plana), DIP-14 y otros chips (LM324, LM393, UA741, NE5532, LM386, ULN2003, ULN2803, PC817)
- ⬜ Pintor: ordenar mejor los cables frente a componentes altos (partir arcos largos, sesgo de profundidad)
- ✅ **Página para embeber** (`out/<nombre>.html`, comando `page`, `render` con `page: true`): un archivo autónomo por circuito, reescrito con cada cambio con el mismo nombre; dos vistas, de cerca o toda la protoboard, con o sin etiquetas, arrastrar para moverse, rueda o pellizco para acercar. Las etapas 2 a 4 hacen crecer esta misma página ([embeber.md](embeber.md))
- ✅ `check --json`; códigos de salida documentados (0 bien, 1 errores o cambio rechazado, 2 `review` pide cambios)
- ✅ JSON Schema del archivo de circuito (hecho en la etapa 1.5: `schema/`)

## Etapa 1.5 — Interfaz para agentes ✅

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
- ✅ **Consultas**: `at <agujero>`, `node <nodo>`, `free [near]`, `suggest <componente> between <nodo> and <nodo>` (posiciones válidas ordenadas por separación y visibilidad)
- ✅ **Servidor MCP** (`mcp/`, paquete propio para que el núcleo siga sin dependencias): `list_circuits`, `get_circuit`, `inspect`, `query`, `apply_ops`, `undo`, `history`, `render`, `catalog`; `.mcp.json` del proyecto
- ✅ `SKILL.md` prefiere las herramientas MCP y usa la línea de comandos como respaldo; herramienta `create_circuit`; documentación `docs/es/mcp.md`
- ✅ `review`: veredicto a partir de mediciones con perfiles `lesson` / `draft` (línea de comandos y herramienta MCP), la definición de «terminado» compartida
- ✅ Roles de agentes (`.claude/agents/`): `circuit-layout`, `circuit-reviewer`, `parts-librarian`; comparten el estado por los archivos, no por el chat; encargos y ciclo en `docs/es/agentes.md`
- ⬜ Probar el ciclo de agentes con circuitos reales de clase y ajustar los encargos y el perfil `lesson`

## Etapa 2 — Simulación (primero DC) ✅ (v0.2)

Objetivo: el voltaje (tensión) de cada nodo y la corriente de cada componente, calculados por el kit.
Guía: [simulacion.md](simulacion.md).

- ✅ Fuentes: campo `supplies`: fuente de banco en los rieles con límite de corriente opcional (voltaje constante → corriente constante), batería con resistencia interna; se fijan con la operación `circuit`
- ✅ Solver MNA (`src/sim/`): LU densa con pivoteo parcial, GMIN, Newton con limitación de las uniones, subida gradual de las fuentes; resistencias, cables (0,05 Ω), potenciómetros, pulsadores
- ✅ Diodos y LED: modelo de Shockley con resistencia en serie; diodos por referencia, LED por color (Vf a 20 mA), `"model"` para cambiarlo por componente
- ✅ Capacitores: análisis transitorio, Euler implícito; empiezan descargados o en el punto de DC
- ✅ MOSFET (ley cuadrática con encendido suave, k a partir de Rds(on)) y BJT (Ebers–Moll de transporte, β constante; TIP120 como Darlington)
- ✅ Cada modelo comprobado una vez contra una referencia independiente (fórmula de libro resuelta aparte, o la hoja de datos) y guardado como prueba (`test/sim.test.js`)
- ✅ Los avisos que necesita quien aprende: potencia de más, corriente de más, voltaje inverso, electrolítico al revés, fuente en su límite, cortocircuito, grupos flotantes
- ✅ Resultados estáticos sobre el SVG (`render --sim`, capa propia `results`): voltajes de los grupos, corrientes, sello «MODELO»; las etiquetas esquivan los componentes
- ✅ Resultados en la línea de comandos y el MCP (`simulate`, texto o JSON) y en la página para embeber detrás de un botón, solo si el circuito lo pide (`"page": { "results": true }`)
- ⬜ Comparar algunos circuitos con Falstad CircuitJS como segunda referencia
- ⬜ Eventos durante el transitorio (presionar un botón en un momento dado) y una gráfica del transitorio en la página
- ⬜ Chips: 555 y amplificador operacional por comportamiento
- ✅ Inductores (axiales, anillos de colores en µH; resistencia del alambre; transitorio), diodos Zener (1N47xxA, ruptura con rodilla suave o brusca), reguladores lineales (78xx, LM317, con caída mínima y su corriente propia), termistor NTC y fotorresistencia (resistencia según `temperature` / `light`), zumbador pasivo (avisa con continua)
- ✅ Baterías dibujadas como componentes y simuladas como fuentes: formato, química, celdas en serie, estado de carga, voltaje medido, interruptor del portapilas; autonomía estimada; avisos de cortocircuito, sobrecorriente y de cargar una pila alcalina ([simulacion.md](simulacion.md))

## Componentes y fuentes, lo siguiente ⬜

Del inventario del curso, más o menos en el orden en que se usan:

- ⬜ Módulos al lado o encima de la protoboard, con pines y cables Dupont: Arduino UNO, ESP32 DevKit (a caballo del canal), módulos AMS1117-3.3 y LM2596, cargador TP4056
- ⬜ Fuente de banco dibujada al lado de la protoboard, con sus caimanes en los rieles (hoy `supplies` no se dibuja)
- ⬜ Descarga de la batería con el tiempo en un transitorio (la carga baja con la corriente), para lecciones de autonomía
- ⬜ Módulo elevador (boost) como fuente por comportamiento
- ✅ Puente rectificador KBP (`bridge`: cuatro diodos en un cuerpo, simulado), resistencias de cemento (3, 5 y 10 W, valor impreso encima); ejemplo `rectifier.json`
- ✅ Portapilas: paredes de los extremos tan altas como las pilas, para que el botón + nunca asome por encima
- ⬜ Pila de botón (CR2032) en su portapilas

## Estilo visual y temas (transversal, después de la etapa 2) ⬜

Objetivo: dibujos que primero enseñen. Realismo donde ayuda a reconocer un componente;
calma en todo lo demás, para que los componentes resalten.

- ⬜ Sistema de temas: cada color sale de una paleta con nombre (`theme: 'realistic' | 'study' | …`), ningún color fijo dentro de los encapsulados
- ⬜ Tema `study`: una protoboard menos realista y más estética (plana, de tono apagado, agujeros e impresión más suaves, bordes discretos) para que resalten los componentes y los cables
- ⬜ Revisar las paletas de componentes (cables, LED, bandas) por contraste y para personas con daltonismo; las bandas siguen fieles a IEC 60062
- ✅ Modo resaltado: atenuar todo menos los componentes que se están explicando y las tiras bajo sus patas, dibujados encima aunque algo los tape (`--focus`, `page.focus`, tocar en la página; [foco-y-corriente.md](foco-y-corriente.md))
- ✅ Ver a través: volver transparente un componente para ver qué hay detrás (ficha de la página)
- ⬜ Tema oscuro para pantallas

## Etapa 3 — Animación en el navegador ⬜

Objetivo: ver el circuito funcionar.

- ⬜ Módulo de navegador que dibuja la misma escena en un SVG vivo (o canvas) en cada cuadro
- ✅ Capa de corriente (`page.flow`): todo atenuado, tiras visibles, puntos por las tiras y a través de los componentes, velocidad según la corriente (escala logarítmica), electrones de − a + o corriente convencional; Kirchhoff en cada tira
- ⬜ Puntos por el camino real de patas y cables (hoy: líneas rectas a la altura de la protoboard)
- ⬜ Voltaje como color en tiras y patas, con una escala fija
- ⬜ Brillo del LED según su corriente; tinte de calor según la potencia
- ⬜ Controles deslizantes para valores y voltaje de la fuente, que vuelven a resolver al instante

## Etapa 4 — En el celular o la tableta ⬜

Objetivo: abrir un enlace y explorar.

- ⬜ Página interactiva de un solo archivo (sin compilación): crece a partir de la página para embeber de la etapa 1, con el mismo nombre de archivo, así lo ya embebido sigue funcionando
- ⬜ Zoom dinámico: pellizcar y rueda del mouse, desplazamiento, doble toque en un componente para acercarse; más detalle al acercarse (números de agujero, marcas de los componentes)
- ⬜ Etiquetas solo al pasar el mouse o al tocar (el SVG estático conserva los globos por encima de los componentes)
- ⬜ Multímetro virtual: puntas en agujeros; voltímetro en paralelo; el amperímetro obliga a abrir el circuito
- ✅ Cambiar entre vista frontal y trasera; tocar un componente lo trae al frente con sus tiras
- ⬜ Tocar una tira resalta todo lo conectado a ella
- ⬜ Modo predicción: lecturas ocultas hasta que el estudiante se compromete con una respuesta

## Etapa 5 — Escribir circuitos más rápido ⬜

- ⬜ Plantillas: circuitos comunes donde solo cambian los valores (LED + resistencia, divisor, RC, transistor como interruptor)
- ⬜ Colocación automática a partir de una netlist («R1 entre 5V y n1»), respetando `clearance` para que las clases nunca queden apretadas
- ⬜ Adaptadores: importar y exportar `diagram.json` de Wokwi; exportar un enlace de Falstad CircuitJS

## Etapa 6 — Publicación ⬜

- ⬜ Primera versión pública en GitHub, v0.x; plantillas de issues; guía de contribución
- ⬜ Paquete en npm; formato de circuito versionado con notas de migración
- ⬜ Sitio con la galería de ejemplos

## Opcional, más adelante ⬜

Ideas que vale la pena guardar, sin fecha. Se retoman después de las etapas de arriba, o
cuando una clase las necesite.

- ⬜ **Etiquetas paramétricas elegidas por el usuario**: qué muestra cada etiqueta, por
  circuito o por componente (`name`, `value`, un título propio, una descripción corta), con
  plantillas como `"{id} · {value}"` o `"{name}: {description}"`, traducidas como todo lo demás
- ✅ **Descripción por componente** en el archivo de circuito
  (`"description": { "en": …, "es": … }`), visible en la ficha de la página, después de la descripción propia del
  kit para cada tipo de componente (`describe.*`, en cada idioma; `check` avisa si falta uno) (⬜ en las
  etiquetas y en `inspect`)
- ✅ **Etiquetas en las que se puede hacer clic** en la página interactiva: tocar una etiqueta
  o un componente abre una ficha (qué es, su descripción, sus patas y con qué se conectan,
  valores de la simulación cuando se muestran); ⬜ enlace a la hoja de datos
