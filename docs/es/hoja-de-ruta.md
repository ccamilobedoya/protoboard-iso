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
- ✅ `bb830` igual a la protoboard real: de atrás hacia adelante − + j…f | e…a − + (de pie, columna 1 arriba: + − a…j + −); las filas junto al canal se buscan por posición
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
- ✅ Comparar algunos circuitos con Falstad CircuitJS como segunda referencia (etapa 3, fase 6: [falstad.md](falstad.md))
- ⬜ Eventos durante el transitorio (presionar un botón en un momento dado) y una gráfica del transitorio en la página
- ⬜ Chips: 555 y amplificador operacional por comportamiento
- ⬜ Placas de desarrollo en la simulación (nivel 2, junto con la simulación eléctrica completa): el estado de cada pin fijado en el circuito (`"D13": "high"`, ciclo de PWM), salidas como fuentes con su resistencia interna, entradas de alta impedancia con pull-up opcional, pines 5V y 3V3 como reguladores con sus límites; avisos de corriente por pin, 5 V en un pin de 3,3 V, una salida en corto a tierra. Correr el programa real (avr8js para el UNO, Wokwi para el ESP32) es un paso posterior y aparte
- ✅ Inductores (axiales, anillos de colores en µH; resistencia del alambre; transitorio), diodos Zener (1N47xxA, ruptura con rodilla suave o brusca), reguladores lineales (78xx, LM317, con caída mínima y su corriente propia), termistor NTC y fotorresistencia (resistencia según `temperature` / `light`), zumbador pasivo (avisa con continua)
- ✅ Baterías dibujadas como componentes y simuladas como fuentes: formato, química, celdas en serie, estado de carga, voltaje medido, interruptor del portapilas; autonomía estimada; avisos de cortocircuito, sobrecorriente y de cargar una pila alcalina ([simulacion.md](simulacion.md))

## Componentes y fuentes, lo siguiente ⬜

Del inventario del curso, más o menos en el orden en que se usan:

- ✅ Placas de desarrollo, dibujadas y revisadas (nivel 1): ESP32 DevKit (30 pines) y ESP32-C3 SuperMini a caballo del canal con `pin1`, con `rowSpacing` porque las placas cambian; Arduino UNO al lado de la protoboard, con cables Dupont solo en los pines que se usan; una nota por pin en la ficha (pines de arranque, solo entrada, ADC2 y Wi-Fi, PWM…). Ejemplos `esp32-led.json`, `uno-led.json`
- ⬜ Otros módulos: reguladores AMS1117-3.3 y LM2596, cargador TP4056
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
- ✅ Modo resaltado: atenuar todo menos los componentes que se están explicando y las tiras bajo sus patas, dibujados encima aunque algo los tape, con los números de columna y las letras de fila de sus patas resaltados (`--focus`, `page.focus`, tocar en la página; [foco-y-corriente.md](foco-y-corriente.md))
- ✅ Página en el celular: la barra de botones es una sola fila que se desliza de lado
- ✅ Ver a través: volver transparente un componente para ver qué hay detrás (ficha de la página)
- ⬜ **Qué tapa a qué, planeado en conjunto** (para hacerlo bien más adelante, no a parches caso por caso): en una página con foco, las etiquetas de la simulación (voltajes, corrientes, el sello MODELO) pueden tapar los números de columna resaltados, las posiciones de los agujeros y las patas de las que hablan. Decidir una prioridad entre capas (copia del componente, tiras, etiquetas de coordenadas, de resultados, rótulos, puntas de prueba), ubicar cada etiqueta al lado de lo que taparía (evitando choques, como ya se evitan los rótulos entre sí) y revisarlo con `inspect` como el resto del dibujo
- ⬜ Tema oscuro para pantallas

## Etapa 3 — Simulación en vivo en el navegador 🔜

Objetivo: ver el circuito funcionar, como en CircuitJS de Falstad, sobre la protoboard. Diseño,
decisiones y plan por sesiones: [simulacion-en-vivo.md](simulacion-en-vivo.md).

- ✅ Capa de corriente (`page.flow`), primera versión: todo atenuado, tiras visibles, puntos por las tiras y a través de los componentes, Kirchhoff en cada tira
- ✅ Fase 0: prueba *golden* de la salida del simulador (red de seguridad para las reorganizaciones): `scripts/golden.js`, `test/golden.test.js`
- ✅ Fase 1: vista de conductores: conductores por su camino real (`paths` en los paquetes: axial, LED, cable, TO-92, TO-220, pulsador, batería), con color según el voltaje; solo corriente convencional (sin vista de electrones); velocidad proporcional a la corriente con botón logarítmico; maquetas (`scripts/mockups.js`); paleta de los rieles escogida, degradado empinado dentro de los cuerpos
- ✅ Fase 2: módulos de dispositivo, un archivo por tipo de componente (`src/sim/devices/`: elementos, lectura, límites como esfuerzos, líneas de la ficha, etiqueta, sonda); salidas idénticas (archivo *golden*, páginas y dibujos byte a byte); islas flotantes ancladas en DC (una bobina aislada dejaba la matriz singular). Los controles pasan a la fase 5
- ✅ Fase 3: programa compilado (`sim/compile.js`) + motor sin dependencias (`sim/engine.js`); dispositivos separados en `params` (JSON) y `elements`; un agrupador pequeño (`node/bundle.js`), el motor agrupado corre solo y coincide con `simulate()`; el script de la página en módulos (`page/client/`); el estampador se reutiliza y resuelve en su lugar (≈ 4× más rápido, mismos resultados)
- ✅ Fase 4: simulación en vivo en la página (`page/client/live.js`, el motor y el programa compilado embebidos con `results` o `flow`): puntos con fase acumulada, colores de voltaje, brillo del LED, tinte de calor, *Pausa* / *Encender (t = 0)* y reloj en circuitos con C o L (velocidad según las constantes de tiempo), etiquetas, textos de las sondas y ficha en vivo; `page.start`
- ✅ Fase 5: deslizadores en la ficha (resistencia con paradas E24, temperatura, luz, posición del potenciómetro, voltaje de la fuente, carga de la batería) y panel `page.controls` (lo revisa `check`), pulsador momentáneo (en el dibujo o en su ficha); `engine.controls()` / `engine.set()` resuelven al instante y conservan el estado (un condensador mantiene su voltaje); límites a la vista: ámbar cerca del límite, rojo que late al pasarlo, marca que se queda hasta borrarla o reiniciar, panel de avisos; `stress` por componente en `simulate`
- ✅ Fase 6: CircuitJS de Falstad ([falstad.md](falstad.md)): exportador a su formato de texto (`sim/falstad.js`, un gancho `falstad` por dispositivo, dibujado como esquema, cada nodo con el nombre de su grupo de la protoboard), botón *Abrir en Falstad* en la página en vivo con el estado de ese momento y **⚠ n** con los componentes que van como equivalentes; comparación de 7 casos con referencias guardadas (`test/falstad/`, `scripts/falstad.js`): con el mismo modelo, dentro de 1 µV; el MOSFET y el Zener, dentro de una tolerancia explicada
  - ⬜ El formato XML de Falstad: el λ del MOSFET y el LM317 de Falstad (hoy los reguladores quedan fuera)
  - ⬜ Casos con transitorio (RC, RL) en la comparación, muestreados en los mismos instantes
  - ✅ Dibujado como esquema en Falstad (`sim/falstad-layout.js`): nodos como filas ordenadas por voltaje, componentes de pie entre ellas, los que van en serie en una columna, los puentes unidos a su nodo, el orden de columnas con menos cruces
- ⬜ Fase 7: osciloscopio (V e I contra el tiempo del componente tocado)

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
- ⬜ Adaptadores: importar y exportar `diagram.json` de Wokwi (✅ el enlace a Falstad CircuitJS: etapa 3, fase 6)

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
