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
- ✅ Protoboard elástica `auto`: la sección de una bb400 y tantas columnas como use el circuito (2026-10-17)
- ✅ `layout`: un circuito entero ubicado por un algoritmo a partir de sus componentes y redes, en alrededor de un segundo (2026-10-17)
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
- ✅ Resultados en la línea de comandos y el MCP (`simulate`, texto o JSON) y en la página para embeber, solo los del componente tocado (desde el 2026-10-18 por defecto con fuente, con los LED encendidos y el botón Corriente; `"page": { "simulation": false }` la apaga)
- ✅ Comparar algunos circuitos con Falstad CircuitJS como segunda referencia (etapa 3, fase 6: [falstad.md](falstad.md))
- ⬜ Eventos durante el transitorio (presionar un botón en un momento dado) y una gráfica del transitorio en la página
- ⬜ Chips: 555 y amplificador operacional por comportamiento
- ⬜ Placas de desarrollo en la simulación (nivel 2, junto con la simulación eléctrica completa): el estado de cada pin fijado en el circuito (`"D13": "high"`, ciclo de PWM), salidas como fuentes con su resistencia interna, entradas de alta impedancia con pull-up opcional, pines 5V y 3V3 como reguladores con sus límites; avisos de corriente por pin, 5 V en un pin de 3,3 V, una salida en corto a tierra. Correr el programa real (avr8js para el UNO, Wokwi para el ESP32) es un paso posterior y aparte
- ✅ Inductores (axiales, anillos de colores en µH; resistencia del alambre; transitorio), diodos Zener (1N47xxA, ruptura con rodilla suave o brusca), reguladores lineales (78xx, LM317, con caída mínima y su corriente propia), termistor NTC y fotorresistencia (resistencia según `temperature` / `light`), zumbador pasivo (avisa con continua)
- ✅ Baterías dibujadas como componentes y simuladas como fuentes: formato, química, celdas en serie, estado de carga, voltaje medido, interruptor del portapilas; autonomía estimada; avisos de cortocircuito, sobrecorriente y de cargar una pila alcalina ([simulacion.md](simulacion.md))

## Componentes y fuentes, lo siguiente ⬜

Del inventario del curso, más o menos en el orden en que se usan:

- ✅ Placas de desarrollo, dibujadas y revisadas (nivel 1): ESP32 DevKit (30 pines) y ESP32-C3 SuperMini a caballo del canal con `pin1`, con `rowSpacing` porque las placas cambian; Arduino UNO al lado de la protoboard, con cables Dupont solo en los pines que se usan; una nota por pin en la ficha (pines de arranque, solo entrada, ADC2 y Wi-Fi, PWM…). Ejemplos `esp32-led.json`, `uno-led.json`
- ✅ Adaptador e-paper GooDisplay DESPI-C02 al lado de la protoboard (pines acodados con cables Dupont, interruptor RESE, pistas de prueba, conector FPC) y, a pedido, el panel GDEY075T7 de 7,5" con su cable plano (`panel: true`); ficha «Placa adaptadora». Ejemplo `epaper-esp32.json`
- ⬜ Fuente de banco dibujada al lado de la protoboard, con sus caimanes en los rieles (hoy `supplies` no se dibuja)
- ⬜ Descarga de la batería con el tiempo en un transitorio (la carga baja con la corriente), para lecciones de autonomía
- ⬜ Módulo elevador (boost) como fuente por comportamiento
- ✅ Puente rectificador KBP (`bridge`: cuatro diodos en un cuerpo, simulado), resistencias de cemento (3, 5 y 10 W, valor impreso encima); ejemplo `rectifier.json`
- ✅ Portapilas: paredes de los extremos tan altas como las pilas, para que el botón + nunca asome por encima
- ⬜ Pila de botón (CR2032) en su portapilas

Lo que tiene el banco del curso y el kit todavía no dibuja (del inventario, 2026-10-16):

- ✅ Interruptores fuera de la protoboard (`switch`), sobre la mesa delante o detrás de ella, simulados como interruptores que se quedan como se dejan (*Encender* / *Apagar* en la ficha, control `on` con la escala nueva `toggle`): el basculante KCD1 (SPST, pinzas caimán en sus terminales faston) y el pulsador de enclavamiento de 7 × 7 (DPDT, un cable soldado a cada pata en uso); ejemplo `switches.json`
- ⬜ Cables con pinzas caimán fuera de la protoboard (a los rieles, a un interruptor de afuera, a la fuente)
- ✅ Módulo regulador AMS1117-3.3 (y -5.0): un número de parte de `regulator`, de pie sobre sus tres pines en ángulo `IN` · `OUT` · `GND` (la serigrafía VIN OUT GND hacia la vista de frente; el chip, los condensadores y el LED de encendido hacia la fila, a la vista desde atrás), simulado como regulador de baja caída (1,1 V) con su LED de encendido por dentro (`led`: `"1k"`, `"200"`, `"none"`); avisos de calor en su placa pequeña, entrada por encima del máximo y polaridad invertida. Las primitivas pueden ir en una cara de una placa de pie (`side`: se pintan después de la placa vistas desde esa cara, antes desde la otra)
- ⬜ Módulos reguladores y de energía, dibujados y simulados: buck LM2596 (ZX-001 sencillo y V591 con voltímetro LED), cargador TP4056 USB-C con protección, cargador solar MPPT CN3791, BMS 2S
- ⬜ **USB como fuente de alimentación de los chips**: un cable USB (computador o cargador: 5 V con su límite) a una placa de desarrollo (UNO, ESP32 DevKit, ESP32-C3, Pico) que alimenta sus pines 5V y 3V3 y lo que cuelga de ellos, dibujado y simulado; también un módulo de entrada USB-C en la protoboard
- ⬜ Más placas de desarrollo: Raspberry Pi Pico (RP2040) y ESP32-CAM con su programador MB
- ⬜ Módulos de pantalla y de entrada: OLED de 0,96" (GME12864: VCC GND SCL SDA) y de 0,91" SSD1306 por I2C, módulo encoder rotatorio EC11, switches de teclado TTC MX (bloque de teclado)
- ⬜ Módulos de sensores: el kit de 22 módulos (DHT11, BMP280, lluvia MH-RD, humedad de suelo, KY-018…), BME280, sensor de suelo capacitivo (TLC555), ultrasónico HC-SR04
- ⬜ Actuadores: servos SG90 y MG90S (cable de 3 pines), driver de motores TB6612FNG, motorreductores DC, mini bomba sumergible
- ⬜ Energía: panel solar de 6 V 2 W; portapilas de una 18650, LiPo 103450 con conector JST PH
- ⬜ En la protoboard: disipador TO-220, conectores XH, zócalos DIP
- ⬜ Instrumentos sobre el circuito: puntas del multímetro en una tira (el multímetro virtual de la etapa 4), la punta del osciloscopio y la salida del generador del ZT-703S, cables del analizador lógico

## Circuitos más rápidos para las clases (de la prueba de la fuente de dos rieles) ⬜

El 2026-10-16 un `circuit-layout` sin contexto rehízo la fuente de dos rieles de M2 a partir de las
notas y la foto del estudiante: 19 min, 68 llamadas y unos 185 000 tokens (la mitad del presupuesto
de una sesión) para copiar la foto, y el resultado pasó la revisión con resistencias atravesando
otros componentes, tres piezas reemplazadas por pines sueltos y sin simulación (falta el
interruptor). La regla del mantenedor desde entonces: **la misma función, no el mismo dibujo**. Se
guardó tal como salió (`m2-fuente-dos-rieles` en `circuitos/` del curso, revisión 6) para rehacerlo con las mejoras
de abajo y comparar.

- ✅ Encargo: `Target: <nombre>` sin prefijo `circuits/`; `Fidelity: functional` por defecto; el agente de montaje revisa cada pieza con `catalog` primero y suelta una restricción después de tres intentos ([agentes.md](agentes.md))
- ✅ El servidor MCP se recarga cuando el código del kit cambió desde que arrancó: sus herramientas corren en un *worker* que reinicia (`mcp/kit-worker.js`), y esa respuesta lo dice; si cambió la lista de herramientas, todavía pide reconectar ([mcp.md](mcp.md))
- ✅ El MCP quita un prefijo `circuits/` (o el nombre de la propia raíz) que no existe bajo la raíz (anidó `circuitos/circuits/…`); el ejemplo de `targetArg` ya no lo sugiere
- ⬜ Etiquetas en cualquier grupo, no solo en los rieles (`netLabels` para tiras, p. ej. `"8:a-e": "TP3"`), dibujadas en la protoboard y en la ficha, revisadas por el revisor: los puntos de prueba son de lo que tratan las clases de medición
- ✅ Las patas y los cables que atraviesan otro componente son avisos (`LEAD_THROUGH_PART`, `WIRE_THROUGH_PART`, `checkCrossings`: muestras de cada pata contra las primitivas convexas de los demás), así que todo perfil los bloquea y `suggest` los evita; encontró la pata de R2 atravesando los pines en `m2-fuente-dos-rieles`, y dos ejemplos del kit (corregidos)
- ✅ `suggest` da en cada colocación el cuerpo más cercano y su holgura (`nearest`), acepta un `profile` de revisión (deja fuera lo que bloquearía, en las dos vistas) y mide más candidatos (hasta 48) mientras pasen menos que `limit`
- ✅ Colocar varias piezas a la vez: `suggest` con `parts` (CLI `--parts`), cada una según las anteriores, con un solo lote de add en la respuesta; los grupos se pueden nombrar por una pata ya colocada (`R1.2`, `U1.OUT`) en todas partes
- ✅ `review`: cada punto que bloquea nombra sus componentes (`parts`) y vistas (`views`); `--explain` (`explain: true`) agrega las reglas del perfil
- ✅ `catalog`: una lista compacta por defecto (2 KB en vez de 20); `name` (un tipo, número de parte o módulo) da patas, encapsulado, campos y un ejemplo real de `examples/`; el registro completo con `format: "json"` (`src/node/catalog.js`)
- ✅ Herramienta MCP `netlist` (CLI `nets`): redes como grupos unidos por cables, con sus patas, etiquetas y las patas solas en su red (`src/nets.js`)
- ⬜ Un marcador «representa a» para una pieza que el kit todavía no tiene: dibujado plano, sin choques, con nombre en la ficha (solo mientras la pieza está pendiente)
- ⬜ Fotos: una tabla para la protoboard del curso de pie (riel izquierdo = B+/B−, derecho = T−/T+; las filas de la foto son las columnas del kit) y un dibujo con la cuadrícula anotada para comparar con una foto
- ⬜ Medir otra vez: rehacer `m2-fuente-dos-rieles` con estas mejoras (`Fidelity: functional`) y comparar tiempo, llamadas y tokens

## Circuitos con un modelo pequeño, y con cualquier modelo (revisión del 2026-10-20) 🔜

Objetivo: que un circuito salga bien al primer intento con un modelo barato y poco razonamiento, y
con asistentes que no son Claude, reutilizando patrones probados en vez de resolver cada circuito.
Sale de una revisión del kit, sus agentes y su documentación, y de probar `layout` con cuatro
circuitos típicos de clase: el transistor NPN como interruptor y el divisor con potenciómetro
salieron listos; el 555 astable quedó con piezas tapadas desde atrás; el ESP32 con pulsador pull-up
no encontró lugar para su cable de tierra (la placa tapa las tiras) y aun así el texto terminaba en
«Revisión: APROBADO»; y **ninguno** de los cuatro pasó al primer intento por los nombres de las
patas (`D1.K` en un LED, `U1.DISCH` en un 555).

**Errores que cuestan una vuelta cada uno (hecho el 2026-10-20)**

- ✅ A la lista de herramientas del agente de montaje le faltaba `layout` (su paso 0 decía «layout primero») y `simulate`; al revisor, `simulate`. Ahora los dos corren `simulate` una vez y reportan solo avisos, nunca valores. `npm run test:mcp` falla si las instrucciones de un agente nombran una herramienta que su lista no tiene
- ✅ El archivo del agente de montaje sin contradicciones: arriba se elige el camino (A: `layout` para un circuito nuevo, sin `catalog` antes; B: operaciones para cambios y arreglos), en vez de «catalog primero» y «sin catalog antes de layout» en el mismo archivo
- ✅ Nombres de patas como los escribe la gente (`src/parts/pin-names.js`, `findPin`): sinónimos (`A`/`anode`, `K`/`cathode`, `VIN`/`IN`, `DISCH`/`DIS`, `THRESHOLD`/`THR`, `VDD`/`VCC`, `3.3V`/`3V3`…) y números de GPIO en las placas (`GPIO4` → el `D4` del DevKit), solo cuando coincide una sola pata; en `layout`, los circuitos, `query` y `suggest`. El nombre de una pata puede llevar punto (`U2.3.3V`)
- ✅ Un solo veredicto: `layout` termina en `STATUS: DONE | CHANGES | FIX_SPEC | SPEC_OK` con lo que sigue (`status` en JSON); la consola sale con 0 solo cuando está listo

**Patrones probados en vez de resolver cada circuito**

- ⬜ **Recetas**: una biblioteca de especificaciones de `layout` para los circuitos de clase (LED + resistencia, divisor, potenciómetro, NPN y MOSFET como interruptor, pulsador con pull-up / pull-down, RC, 555 astable, 7805 y AMS1117, puente rectificador, Zener, LED y pulsador con ESP32), llamadas por nombre con solo los valores (`layout { recipe: "npn-switch", values: { R1: "1k" } }`); cada una es un caso de `layout-bench`. Reemplaza las «plantillas» de la etapa 5
- ✅ **La especificación como estado deseado** (2026-10-20): el circuito guarda lo que se le pidió a `layout` (`spec`: redes con los nombres de patas resueltos, fuentes que nombran patas, los id de sus cables); `review` revisa esas redes en todo circuito que las tenga (`SPEC_NET_MISSING`, `SPEC_NETS_SHORTED`); `layout` sobre un destino que ya existe lo vuelve a montar en una sola revisión (`undo` trae el anterior), dando solo lo que cambia, y cada pieza y cable prueba primero sus agujeros actuales (un segundo LED en el 555 no movió nada); `rename` también cambia el spec. Va dentro de `circuit.json` en vez de un `spec.json` aparte, así el historial y `undo` lo cubren
- ✅ **Reparaciones dentro de `layout`** (2026-10-20): lo que deja el ciclo de reintentos (una red aparte, un cable que nombra un punto bloqueante) se traza otra vez con `suggest` (perfil lesson, `VIA_WIRE`) y se queda solo si mejora; una red de tierra sin riel va al riel − que usan las otras, o si no a `B-` (notas `LAYOUT_REPAIRED`, `LAYOUT_GROUND_TO_RAIL`)
- ✅ Encontrado de paso: el perfil lesson bloqueaba una pieza por oculta en todas las vistas si bajaba del 85 % visible en cada una, y contaba como dos vistas dos piezas que la tapaban en la misma. Ahora bloquea cuando su mejor vista muestra menos del 70 % (`hiddenBelow`): las dos del banco pasan al primer intento (la fuente de dos rieles: 8 intentos y 1,5 s → 1 intento y 0,3 s) y el 555 astable pasa
- ⬜ El encargo lleva las redes en JSON (o el nombre de una receta) en vez de prosa («R1 entre T+ y el ánodo del LED») que el agente tiene que traducir; un circuito de receta se monta con una sola llamada a `layout` desde la conversación principal, y el agente queda para `CHANGES`

**El algoritmo** (límites ya listados en [montaje-automatico.md](montaje-automatico.md))

- ⬜ Visibilidad en la revisión al ubicar: con el umbral del 70 % casi nunca bloquea, pero todavía hay cables que pasan en arco sobre los chips (la vista de atrás del 555)
- ⬜ Placas anchas (ESP32 DevKit) que tapan las tiras: llegar a una red por otra de sus tiras o por un riel cuando ningún cable cabe en la tapada
- ⬜ Un banco más grande: las recetas y los cuatro circuitos de esta revisión en `examples/layout/`

**Cualquier modelo, no solo Claude**

- ⬜ `AGENTS.md` en la raíz (lo leen Codex, Gemini CLI, Cursor y otros) con el flujo corto; `SKILL.md` y `.claude/agents/` quedan para Claude Code
- ⬜ Prompts MCP (`build_circuit`, `review_circuit`): el procedimiento de los agentes servido por el servidor MCP, así cualquier cliente MCP lo recibe, no solo las herramientas
- ⬜ `schema/layout.schema.json`: el JSON Schema de la especificación, para modelos que generan JSON restringido por un esquema
- ✅ `SKILL.md` reordenado (2026-10-20): una tabla de qué herramienta para qué tarea, `layout` primero con un ejemplo resuelto (un test comprueba que sale `DONE`), las líneas `STATUS:`, cambiar un circuito volviéndolo a montar, el ciclo de operaciones, revisar y mostrar; el formato escrito a mano queda en `docs/es/formato-circuito.md` (11,5 KB → 8,7 KB). Las instrucciones del servidor MCP y las descripciones de sus herramientas dicen lo mismo (⬜ las recetas primero, cuando existan)
- ⬜ Banco de agentes: N encargos × modelo (un Claude pequeño, un modelo de otro proveedor), midiendo llamadas, tokens, tiempo y éxito al primer intento, para medir cada cambio del kit (sigue a «Medir otra vez», arriba)

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
- ✅ Tema oscuro para pantallas: la página (pasada de experiencia de uso, U2); el dibujo de la protoboard conserva sus colores

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
  - ✅ Casos con transitorio en la comparación, muestreados en los mismos instantes (fase 8)
  - ✅ Dibujado como esquema en Falstad (`sim/falstad-layout.js`): nodos como filas ordenadas por voltaje, componentes de pie entre ellas, los que van en serie en una columna, los puentes unidos a su nodo, el orden de columnas con menos cruces
- ✅ Fase 7: osciloscopio en la ficha del componente tocado: V e I contra el tiempo en una pantalla oscura de 10 × 4, dos gráficas apiladas con su propia escala, grabado desde el arranque para todos los componentes (`sim/recorder.js`), qué grafica cada tipo en su dispositivo (`scope`: Vce e Ic en un transistor), desde t = 0 hasta 10 constantes de tiempo y después avanza (reloj de pared sin C ni L), solo donde la ficha muestra resultados; al cerrar la ficha se va. Plan: [simulacion-en-vivo.md](simulacion-en-vivo.md#fases-7-a-9-osciloscopio-generador-de-señales-y-sondas-plan-del-2026-10-15)
- ✅ Fase 8: generador de señales como fuente (`kind: "generator"`: seno, cuadrada y triangular con las formas de Falstad; frecuencia, amplitud de pico, desplazamiento, salida de 50 Ω si no se da), que el motor sigue paso a paso; deslizadores de frecuencia y amplitud; la página va al ritmo de su período; a Falstad como su propia fuente; casos con transitorio en la comparación, muestra por muestra (RC con onda cuadrada dentro de 5 nV, rectificador de media onda dentro de 1 mV). Ejemplos `half-wave-rectifier.json`, `rc-square-wave.json`
- ✅ Fase 9: sondas en los nodos: tocar una tira en uso abre su ficha (se encuentra por dónde cae el toque, porque las tiras quedan debajo de los componentes; cada pata en la ficha de un componente abre también su tira, y cada pata en la ficha de una tira, su componente): qué es una tira, qué está conectado y dónde, los componentes conectados al frente junto con esa tira; con resultados, su voltaje respecto a tierra con las puntas roja y negra dibujadas, la corriente de cada pata que entra o sale de la tira (Kirchhoff) y su osciloscopio, grabado desde el arranque como el de los componentes
- ⬜ Más adelante, cuando una lección lo necesite: fijar trazas en un panel de osciloscopio de dos canales (la gráfica se escribe para una lista de trazas)

## Experiencia de uso (transversal) ⬜

Pedido de Cris (2026-10-15): la página ya tiene muchas funciones útiles, y vienen más. Hay que
ordenarlas para que quien aprende no se pierda, sobre todo en el celular. Hoy hay:

- en la barra: vistas, encuadre, etiquetas, capa de corriente, velocidad, tiempo y *Abrir en
  Falstad*;
- en la ficha: foco, ver a través, resultados, deslizadores y el osciloscopio; la ficha de una
  tira, con enlaces entre las fichas;
- en el panel lateral: límites y avisos, el panel de controles y los equivalentes de Falstad.

El osciloscopio, el generador y las sondas llegaron con las fases 7 a 9. Conviene hacerlo ahora,
antes de la etapa 4.

Plan del 2026-10-16, a partir de una revisión de la página en vivo con los skills de UI/UX:
diseño, decisiones y sesiones en [experiencia-de-uso.md](experiencia-de-uso.md); sistema visual en
[`.interface-design/system.md`](../../.interface-design/system.md).

- ✅ Revisión de la página en vivo (escritorio, tableta, celular, embebida) e inventario de cada función: dónde vive, cuándo aparece, qué `page.*` la pide
- ✅ Sistema visual elegido: paleta de banco como tokens, claro y oscuro (`system.md`)
- ✅ U0 · Red de seguridad: `scripts/ux-shots.js`, capturas en cinco tamaños (también dentro de un iframe)
- ✅ U1 · Gestos y embebido: sin desplazamiento atrapado dentro de una nota (un dedo y la rueda van a la página que la contiene; dos dedos, Ctrl/⌘ + rueda y pellizcar acercan), botones de zoom, doble toque a un componente, pantalla completa (probado en el celular del mantenedor)
- ✅ U2 · Tokens, tema oscuro (sigue al sistema; `page.theme` y `?theme=` lo cambian), base táctil
- ✅ U3 · La barra: agrupada por lo que hace, íconos, Girar y Encuadrar como un solo botón, menú ⋯, ayuda de primera vez
- ✅ U4 · El inspector: una sola ficha con encabezado fijo, una pestaña Circuito (controles, avisos, Falstad), panel a la derecha en pantallas anchas y hoja inferior en el celular; el componente elegido nunca queda tapado; insignia MODELO con el modo correcto
- ✅ U5 · Movimiento: giro que conserva el foco, encuadre, hoja, respuesta al presionar, movimiento reducido
- ✅ U6 · Detalles: componentes pequeños más fáciles de tocar (un componente cercano, el de debajo con un segundo toque), encuadre vertical (se descartaron los puntos de etiquetas)
- ⬜ U7 · Probarlo con Cris en el celular, el iPad y dentro de Trilium, y ajustar

## Etapa 4 — En el celular o la tableta ⬜

Objetivo: abrir un enlace y explorar.

- ⬜ Página interactiva de un solo archivo (sin compilación): crece a partir de la página para embeber de la etapa 1, con el mismo nombre de archivo, así lo ya embebido sigue funcionando
- ⬜ Zoom dinámico: pellizcar y rueda del mouse, desplazamiento, doble toque en un componente para acercarse; más detalle al acercarse (números de agujero, marcas de los componentes)
- ⬜ Etiquetas solo al pasar el mouse o al tocar (el SVG estático conserva los globos por encima de los componentes)
- ⬜ Multímetro virtual: puntas en agujeros; voltímetro en paralelo; el amperímetro obliga a abrir el circuito
- ✅ Cambiar entre vista frontal y trasera; tocar un componente lo trae al frente con sus tiras
- ✅ Tocar una tira resalta todo lo conectado a ella (etapa 3, fase 9)
- ⬜ Modo predicción: lecturas ocultas hasta que el estudiante se compromete con una respuesta

## Etapa 5 — Escribir circuitos más rápido ⬜

- ⬜ Plantillas: circuitos comunes donde solo cambian los valores: ahora son las **recetas** de «Circuitos con un modelo pequeño», arriba
- ✅ Colocación automática a partir de una netlist, respetando `clearance`: `layout` (2026-10-17)
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
