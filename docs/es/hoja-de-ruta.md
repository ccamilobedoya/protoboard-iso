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
- 🔜 Chips: 555 por comportamiento ✅ (2026-10-26: `sim/devices/timer.js`, comparadores en CTRL y CTRL/2 con el divisor interno de 5 kΩ, un biestable que cambia entre pasos de tiempo, etapas de salida y de descarga según la hoja de datos del NE555; la receta `555-astable` parpadea en la página en vivo; probado contra f = 1,44 / ((R1 + 2·R2)·C). Amplificadores operacionales ✅ (2026-10-26: `sim/devices/opamp.js`, LM358, LM324, µA741, NE5532, y el comparador LM393 con su colector abierto; todavía sin ancho de banda ni velocidad de subida; recetas `opamp-comparator`, `lm393-comparator`, `opamp-follower`, `opamp-noninverting`, `opamp-inverting`). Ninguno de los dos se exporta todavía a Falstad, y el 555 no tiene recorridos en la vista de conductores
- ✅ **Microcontroladores en la simulación** ([microcontroladores.md](microcontroladores.md), planeado el 2026-10-26): no el procesador sino sus pines, el mismo modelo para el ESP32 DevKit, el ESP32-C3 SuperMini y el UNO con los números de cada familia, y un programa corto con las funciones de Arduino
  - ✅ M1 (2026-10-26): modelo de pines (`sim/devices/mcu.js`, `MCUS` en `models.js`): salidas como el riel o tierra tras su resistencia, entradas con pull-up o pull-down opcional, diodos de protección; la placa con USB es una fuente (no hace falta otra) con su regulador de 3,3 V; el estado de cada GPIO en `"io": { "D13": "high", "D27": "input_pullup" }`; la ficha muestra el USB, el riel y cada pin (estado, voltaje, corriente, lo que lee, ADC); avisos de corriente por pin, 5 V en un pin de 3,3 V (`SIM_PIN_OVERVOLTAGE`), errores en `io`. `esp32-led`, `esp32-button` y `uno-led` se simulan
  - ✅ M2 (2026-10-26): el programa (`"program"`: un `.ino` junto al circuito, o su texto) en el subconjunto de C++ de Arduino, traducido a generadores (`sim/sketch.js`) y corriendo entre pasos de tiempo (`sim/program.js`): `pinMode`, `digitalWrite`, `digitalRead`, `delay`, `millis`, `Serial` (líneas en la ficha de la placa), `analogRead`; se repite en t = 0 hasta que sus pines se estabilizan; la página lo corre en tiempo real; `esp32-led` parpadea, `esp32-button` imprime lo que lee
  - ✅ M3 (2026-10-26): PWM como una onda cuadrada real en el tiempo (`analogWrite`, `ledcWrite` en las dos formas del núcleo, `tone`/`noTone`); la página acorta su paso para él (`engine.stepHint`) y promedia el brillo de un LED en los pasos (`engine.glow`); el monitor serie en la ficha de la placa. Después: un panel propio de consola, la curva real del ADC del ESP32
  - ✅ M4 (2026-10-26): recetas con su programa: `esp32-led`, `esp32-button`, `uno-blink`, `uno-button`, `uno-pot-pwm`, `c3-blink`, `c3-pot-pwm` (todas `DONE` en una llamada); división entera en cualquier expresión, como en C
  - Después: interrupciones, versiones simplificadas de librerías comunes, firmware real del UNO con avr8js como modo opcional
- ✅ Inductores (axiales, anillos de colores en µH; resistencia del alambre; transitorio), diodos Zener (1N47xxA, ruptura con rodilla suave o brusca), reguladores lineales (78xx, LM317, con caída mínima y su corriente propia), termistor NTC y fotorresistencia (resistencia según `temperature` / `light`), zumbador pasivo (avisa con continua)
- ✅ Baterías dibujadas como componentes y simuladas como fuentes: formato, química, celdas en serie, estado de carga, voltaje medido, interruptor del portapilas; autonomía estimada; avisos de cortocircuito, sobrecorriente y de cargar una pila alcalina ([simulacion.md](simulacion.md))

## Componentes y fuentes, lo siguiente ⬜

De un kit de principiante habitual, más o menos en el orden en que se usan:

- ✅ Placas de desarrollo, dibujadas y revisadas (nivel 1): ESP32 DevKit (30 pines) y ESP32-C3 SuperMini a caballo del canal con `pin1`, con `rowSpacing` porque las placas cambian; Arduino UNO al lado de la protoboard, con cables Dupont solo en los pines que se usan; una nota por pin en la ficha (pines de arranque, solo entrada, ADC2 y Wi-Fi, PWM…). Ejemplos `esp32-led.json`, `uno-led.json`
- ✅ Adaptador e-paper GooDisplay DESPI-C02 al lado de la protoboard (pines acodados con cables Dupont, interruptor RESE, pistas de prueba, conector FPC) y, a pedido, el panel GDEY075T7 de 7,5" con su cable plano (`panel: true`); ficha «Placa adaptadora». Ejemplo `epaper-esp32.json`
- ⬜ Fuente de banco dibujada al lado de la protoboard, con sus caimanes en los rieles (hoy `supplies` no se dibuja)
- ⬜ Descarga de la batería con el tiempo en un transitorio (la carga baja con la corriente), para lecciones de autonomía
- ⬜ Módulo elevador (boost) como fuente por comportamiento
- ✅ Puente rectificador KBP (`bridge`: cuatro diodos en un cuerpo, simulado), resistencias de cemento (3, 5 y 10 W, valor impreso encima); ejemplo `rectifier.json`
- ✅ Portapilas: paredes de los extremos tan altas como las pilas, para que el botón + nunca asome por encima
- ⬜ Pila de botón (CR2032) en su portapilas

Lo habitual en un banco que el kit todavía no dibuja (2026-10-16):

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
- ⬜ Instrumentos sobre el circuito: puntas del multímetro en una tira (el multímetro virtual de la etapa 4), la punta del osciloscopio y la salida de un generador de banco, cables del analizador lógico

## Circuitos más rápidos para las clases (de la prueba de la fuente de dos rieles) ⬜

El 2026-10-16 un `circuit-layout` sin contexto rehízo una fuente de dos rieles a partir de las
notas y la foto del estudiante: 19 min, 68 llamadas y unos 185 000 tokens (la mitad del presupuesto
de una sesión) para copiar la foto, y el resultado pasó la revisión con resistencias atravesando
otros componentes, tres piezas reemplazadas por pines sueltos y sin simulación (falta el
interruptor). La regla del mantenedor desde entonces: **la misma función, no el mismo dibujo**. Su
especificación es `examples/layout/two-rail-supply.json`, guardada para rehacerla con las mejoras
de abajo y comparar.

- ✅ Encargo: `Target: <nombre>` sin prefijo `circuits/`; `Fidelity: functional` por defecto; el agente de montaje revisa cada pieza con `catalog` primero y suelta una restricción después de tres intentos ([agentes.md](agentes.md))
- ✅ El servidor MCP se recarga cuando el código del kit cambió desde que arrancó: sus herramientas corren en un *worker* que reinicia (`mcp/kit-worker.js`), y esa respuesta lo dice; si cambió la lista de herramientas, todavía pide reconectar ([mcp.md](mcp.md))
- ✅ El MCP quita un prefijo `circuits/` (o el nombre de la propia raíz) que no existe bajo la raíz (anidó `circuitos/circuits/…`); el ejemplo de `targetArg` ya no lo sugiere
- ⬜ Etiquetas en cualquier grupo, no solo en los rieles (`netLabels` para tiras, p. ej. `"8:a-e": "TP3"`), dibujadas en la protoboard y en la ficha, revisadas por el revisor: los puntos de prueba son de lo que tratan las clases de medición
- ✅ Las patas y los cables que atraviesan otro componente son avisos (`LEAD_THROUGH_PART`, `WIRE_THROUGH_PART`, `checkCrossings`: muestras de cada pata contra las primitivas convexas de los demás), así que todo perfil los bloquea y `suggest` los evita; encontró la pata de R2 atravesando los pines en una fuente de dos rieles, y dos ejemplos del kit (corregidos)
- ✅ `suggest` da en cada colocación el cuerpo más cercano y su holgura (`nearest`), acepta un `profile` de revisión (deja fuera lo que bloquearía, en las dos vistas) y mide más candidatos (hasta 48) mientras pasen menos que `limit`
- ✅ Colocar varias piezas a la vez: `suggest` con `parts` (CLI `--parts`), cada una según las anteriores, con un solo lote de add en la respuesta; los grupos se pueden nombrar por una pata ya colocada (`R1.2`, `U1.OUT`) en todas partes
- ✅ `review`: cada punto que bloquea nombra sus componentes (`parts`) y vistas (`views`); `--explain` (`explain: true`) agrega las reglas del perfil
- ✅ `catalog`: una lista compacta por defecto (2 KB en vez de 20); `name` (un tipo, número de parte o módulo) da patas, encapsulado, campos y un ejemplo real de `examples/`; el registro completo con `format: "json"` (`src/node/catalog.js`)
- ✅ Herramienta MCP `netlist` (CLI `nets`): redes como grupos unidos por cables, con sus patas, etiquetas y las patas solas en su red (`src/nets.js`)
- ⬜ Un marcador «representa a» para una pieza que el kit todavía no tiene: dibujado plano, sin choques, con nombre en la ficha (solo mientras la pieza está pendiente)
- ⬜ Fotos: una tabla para una protoboard de pie (riel izquierdo = B+/B−, derecho = T−/T+; las filas de la foto son las columnas del kit) y un dibujo con la cuadrícula anotada para comparar con una foto
- ⬜ Medir otra vez: rehacer la fuente de dos rieles con estas mejoras (`Fidelity: functional`) y comparar tiempo, llamadas y tokens

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

- ✅ **Recetas** (2026-10-26, [recetas.md](recetas.md)): quince circuitos de clase como especificaciones de `layout` en `src/recipes/` (`led-resistor`, `divider`, `npn-switch`, `potentiometer-led`, `mosfet-switch`, `button-pullup`, `button-pulldown`, `rc-square`, `555-astable`, `regulator-7805`, `regulator-ams1117`, `bridge-rectifier`, `zener-regulator`, `esp32-led`, `esp32-button`), llamadas por nombre con solo los valores (`layout { recipe: "npn-switch", values: { R1: "1k" } }`, en la consola `--recipe` / `--values`); solo cambian los identificadores que lista cada receta, dentro de opciones o rangos (los errores `RECIPE_*` dicen qué se permite); nunca con `parts` ni `nets`; `catalog` las lista con sus valores y detalla una por nombre; el circuito guarda `spec.recipe`, y la misma llamada con valores nuevos conserva los agujeros de cada pieza. Las quince terminan en `DONE` en una llamada en `layout-bench` y en `test/recipes.test.js` (también con cada opción de componente) y se simulan sin forzar ninguna pieza. `SKILL.md`, las instrucciones del MCP («primero las recetas») y el agente de montaje empiezan por ellas. Reemplaza las «plantillas» de la etapa 5
- ✅ **La especificación como estado deseado** (2026-10-20): el circuito guarda lo que se le pidió a `layout` (`spec`: redes con los nombres de patas resueltos, fuentes que nombran patas, los id de sus cables); `review` revisa esas redes en todo circuito que las tenga (`SPEC_NET_MISSING`, `SPEC_NETS_SHORTED`); `layout` sobre un destino que ya existe lo vuelve a montar en una sola revisión (`undo` trae el anterior), dando solo lo que cambia, y cada pieza y cable prueba primero sus agujeros actuales (un segundo LED en el 555 no movió nada); `rename` también cambia el spec. Va dentro de `circuit.json` en vez de un `spec.json` aparte, así el historial y `undo` lo cubren
- ✅ **Reparaciones dentro de `layout`** (2026-10-20): lo que deja el ciclo de reintentos (una red aparte, un cable que nombra un punto bloqueante) se traza otra vez con `suggest` (perfil lesson, `VIA_WIRE`) y se queda solo si mejora; una red de tierra sin riel va al riel − que usan las otras, o si no a `B-` (notas `LAYOUT_REPAIRED`, `LAYOUT_GROUND_TO_RAIL`)
- ✅ Encontrado de paso: el perfil lesson bloqueaba una pieza por oculta en todas las vistas si bajaba del 85 % visible en cada una, y contaba como dos vistas dos piezas que la tapaban en la misma. Ahora bloquea cuando su mejor vista muestra menos del 70 % (`hiddenBelow`): las dos del banco pasan al primer intento (la fuente de dos rieles: 8 intentos y 1,5 s → 1 intento y 0,3 s) y el 555 astable pasa
- 🔜 El encargo lleva las redes en JSON (o el nombre de una receta: hecho el 2026-10-26, la línea `Recipe:`, y un circuito de receta es una llamada a `layout` desde la conversación principal) en vez de prosa («R1 entre T+ y el ánodo del LED») que el agente tiene que traducir; un circuito de receta se monta con una sola llamada a `layout` desde la conversación principal, y el agente queda para `CHANGES`

**El algoritmo** (límites ya listados en [montaje-automatico.md](montaje-automatico.md))

- 🔜 Visibilidad en la revisión al ubicar: desde el 2026-10-26 un cable paga 12 mm por cada cuerpo que cruza visto desde arriba, y se comparan a la vez todos los grupos ya unidos de la red (no primero el más cercano por columna): el 555 astable pasó del 70 % al 100 % visible en su mejor vista y de 3 intentos a 1. Desde el 2026-10-31 una candidata paga por encerrar el camino de una pieza alta a su riel, y el ciclo de reintentos mueve la pieza (y después el enlace) cuando mover un cable no sirvió. Falta: una estimación barata de qué tapa qué en cada vista, para que el primer intento pase más seguido (montaje-automatico.md, límites 1–2)
- ✅ Placas anchas (ESP32 DevKit) que tapan las tiras: desde el 2026-10-26 la placa se ubica por su pata 1 para que las patas en redes conserven una fila libre fuera de su circuito impreso, y un grupo al que no llega ningún cable espera al resto de su red (los rieles al final): un circuito en una sola fila de pines sale listo (`esp32-led`, `esp32-button`). Desde el 2026-10-31 una pata que la placa tapa se informa en un intento (`LAYOUT_PIN_COVERED`, 0,5 s en vez de 19 s). Desde el 2026-10-31 las redes en las dos filas de pines van en dos protoboards lado a lado (board `double`, sin los rieles del medio, filas k–t y rieles `U±` atrás): layout la elige solo (`LAYOUT_DOUBLE_BOARD`), con el DevKit sobre la unión y una tira libre bajo cada fila de pines (`examples/esp32-two-boards.json`). Falta: medir la unión entre dos protoboards reales (`junction`, se supone un paso vacío)
- ✅ Un banco más grande (2026-10-26): `layout-bench` corre todas las recetas después de `examples/layout/`, y los cuatro circuitos de esta revisión son recetas (`npn-switch`, `potentiometer-led`, `555-astable`, `esp32-led` / `esp32-button`)
- ✅ Banco de montaje con medidas (2026-10-31): `scripts/layout-metrics.js` (cables, mm de cable, columnas, agujeros por mitad, cruces del canal) y `layout-bench --save` / `--compare` contra `.claude/state/layout-bench.json` (fuera de git), para comparar un cambio de `src/layout.js` con una línea base; una especificación puede llevar `bench.expect` para un caso aún no resuelto. Especificaciones nuevas en `examples/layout/`: `esp32-both-headers`, `uno-many-pins` y `opamp-stage-chain`, las tres terminaban en `CHANGES` entonces (las dos últimas en `DONE` desde el ítem de abajo)
- ✅ Lados, puntajes y árboles de expansión (2026-10-31, [montaje-automatico.md](montaje-automatico.md) pasos 2a–3): la mitad de cada componente se elige a partir de las redes antes de ubicar (una partición a través del canal, `src/layout-sides.js`), un cursor por mitad, candidatas con puntaje (los DIP y los pulsadores por sus huellas, no con `suggest`), los cables de cada red como árbol de expansión mínima; medido contra el banco: cables 139 → 132, cable 2154 → 1711 mm, redes que cruzan el canal 24 → 20, `uno-many-pins` y `opamp-stage-chain` en `DONE` (el segundo en 1,1 s, antes 8–10 s)

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
  - ⬜ El formato XML de Falstad: el λ del MOSFET y el LM317 propio de Falstad (hoy los reguladores van como una fuente ideal)
  - ✅ Placas y reguladores como equivalentes (placas con microcontrolador como fuentes de USB, de riel lógico y de GPIO; 78xx, LM317 y AMS1117 como una fuente ideal; los rieles se nombran desde la placa, también los de la doble). Falta: los dos casos de comparación (`regulator-7805`, `esp32-gpio`) esperan referencias corridas en Falstad; los amplificadores, el 555 y los demás chips siguen sin exportarse
  - ✅ Casos con transitorio en la comparación, muestreados en los mismos instantes (fase 8)
  - ✅ Dibujado como esquema en Falstad (`sim/falstad-layout.js`): nodos como filas ordenadas por voltaje, componentes de pie entre ellas, los que van en serie en una columna, los puentes unidos a su nodo, el orden de columnas con menos cruces
- ✅ Fase 7: osciloscopio en la ficha del componente tocado: V e I contra el tiempo en una pantalla oscura de 10 × 4, dos gráficas apiladas con su propia escala, grabado desde el arranque para todos los componentes (`sim/recorder.js`), qué grafica cada tipo en su dispositivo (`scope`: Vce e Ic en un transistor), desde t = 0 hasta 10 constantes de tiempo y después avanza (reloj de pared sin C ni L), solo donde la ficha muestra resultados; al cerrar la ficha se va. Plan: [simulacion-en-vivo.md](simulacion-en-vivo.md#fases-7-a-9-osciloscopio-generador-de-señales-y-sondas-plan-del-2026-10-15)
- ✅ Fase 8: generador de señales como fuente (`kind: "generator"`: seno, cuadrada y triangular con las formas de Falstad; frecuencia, amplitud de pico, desplazamiento, salida de 50 Ω si no se da), que el motor sigue paso a paso; deslizadores de frecuencia y amplitud; la página va al ritmo de su período; a Falstad como su propia fuente; casos con transitorio en la comparación, muestra por muestra (RC con onda cuadrada dentro de 5 nV, rectificador de media onda dentro de 1 mV). Ejemplos `half-wave-rectifier.json`, `rc-square-wave.json`
- ✅ Fase 9: sondas en los nodos: tocar una tira en uso abre su ficha (se encuentra por dónde cae el toque, porque las tiras quedan debajo de los componentes; cada pata en la ficha de un componente abre también su tira, y cada pata en la ficha de una tira, su componente): qué es una tira, qué está conectado y dónde, los componentes conectados al frente junto con esa tira; con resultados, su voltaje respecto a tierra con las puntas roja y negra dibujadas, la corriente de cada pata que entra o sale de la tira (Kirchhoff) y su osciloscopio, grabado desde el arranque como el de los componentes
- ⬜ Más adelante, cuando una lección lo necesite: fijar trazas en un panel de osciloscopio de dos canales (la gráfica se escribe para una lista de trazas)

## Experiencia de uso (transversal) ⬜

Pedido del mantenedor (2026-10-15): la página ya tiene muchas funciones útiles, y vienen más. Hay que
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
- ⬜ U7 · Probarlo con el mantenedor en el celular, el iPad y dentro de una app de notas, y ajustar

## Escena y video (transversal) ⬜

Pedido del mantenedor (2026-10-30): la página debe contar un circuito paso a paso, verse a la altura,
y dar videos cortos sin un asistente en el ciclo. Diseño, maquetas y plan por sesiones en
[docs/es/escena-y-video.md](escena-y-video.md): una línea de tiempo declarativa (un JSON por video),
un solo reloj externo, una gramática de ritmo de siete movimientos, un tema `stage` elegido entre
maquetas, y un exportador de fotogramas. Decisiones tomadas con el mantenedor el 2026-10-30: C oscura para video como tema `stage`, la A
clara sigue en las lecciones, la retícula en página y video, la primera tanda de movimientos, el
recorrido desde V2.

- ✅ V0 · Red de seguridad: un *golden* de fotogramas (receta, tamaño, llamadas a `tick`, hash del PNG) en `test/frames/`, `scripts/frames.js` (el reloj falso de Playwright), un paso de `npm run verify`; saltado sin navegador, nunca aprobado
- ✅ V1 · Un reloj: `director.js`; cámara, interpolaciones, puntos, halo y colores escritos por `tick`; `?director=1`; `test/director.test.js` (sin reloj del sistema, la misma página dos veces)
- ✅ V2 · Línea de tiempo y reproductor: el formato JSON y su esquema, los siete movimientos como tokens, `wait-until`, *Ver cómo funciona* en la página, topes y casos de ataque; `examples/npn-switch.json` con su recorrido, `test/tour.test.js`
- ✅ V3 · El dibujo que cuenta: las propias coordenadas impresas de la tabla encendidas (los mismos calcos; las columnas sin número reciben uno en el mismo formato), tapadas por las piezas como la impresión; la capa de corriente en planta (una pastilla en cada aterrizaje, una recta a través de las piezas de dos patas y a lo largo de los cables, un tramo corto por pata en las demás); etiquetas de resultado a tamaño fijo de pantalla y fuera de su pieza; rótulos cortos en reposo y el encuadre calculado con ellos
- ✅ V4 · La escena: la dirección elegida como `[data-theme="stage"]`, la retícula de agujeros continuada bajo el dibujo, la capa de subtítulos, un rótulo y sin etiquetas en un fotograma, el margen reservado, franjas seguras medidas
- 🔜 V5 · Fotogramas (construida, el video de prueba espera aprobación): `scripts/render-frames.js` (Playwright, solo desarrollo) → secuencia PNG + `timeline.json`; comando de ffmpeg documentado; un video de prueba de 45 s con tres recetas aprobado en el celular
- ✅ V6 · Los movimientos elegidos (M1 a M16 en el plan), cada uno con prueba en jsdom (`test/moves.test.js`) y fotograma *golden* (`test/frames/move-*.json`), de `examples/tours/npn-switch-moves.json` y `npn-switch-build.json`; pasos nuevos `raise` (M16), `assemble` (M4, M5), `pulse` (M7), `probe` en una grabación como recuadro de osciloscopio (M11). Cada decisión de un movimiento es un campo opcional de la línea de tiempo, documentado en `docs/es/linea-de-tiempo.md` (2026-10-31). Queda para decidir: el pulso al cargar
- ✅ V7 · Banco y guía: la guía `docs/es/hacer-un-video.md` (en: `making-a-video.md`), `render-frames.js --parts` y `--validate`, `TOUR_VALUE_HIDDEN`, rótulos cortos que siguen a un control; nueve líneas de tiempo de recetas en `examples/tours/`, seis escritas por un modelo mediano solo con la guía; el *golden* en `npm run verify` (desde V0)

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

- ✅ Plantillas: circuitos comunes donde solo cambian los valores: ahora son las **recetas** de «Circuitos con un modelo pequeño», arriba (2026-10-26)
- ✅ Colocación automática a partir de una netlist, respetando `clearance`: `layout` (2026-10-17)
- ⬜ Adaptadores: importar y exportar `diagram.json` de Wokwi (✅ el enlace a Falstad CircuitJS: etapa 3, fase 6)

## Etapa 6 — Publicación 🔜

El repositorio ya es público en GitHub. La meta: que quien llegue lo entienda en un minuto, lo
pruebe sin instalar nada y lo pueda instalar como skill, plugin o paquete. Planeada el 2026-10-26
después de revisar licencias y datos privados.

**A · Limpieza** ✅ (2026-10-26)
- ✅ Licencias revisadas: MIT; sin dependencias en tiempo de ejecución; las del servidor MCP son MIT, ISC o BSD; `@resvg/resvg-js` (MPL-2.0) es de desarrollo u opcional y nunca se redistribuye; sin fuentes, imágenes ni código de terceros en git; Falstad solo por su formato de texto
- ✅ Se quitó el contexto privado de la documentación (nombres, rutas privadas, la app de notas, equipos propios); historial de git revisado: sin nombres de equipos ni ids de notas
- ✅ Reglas de privacidad en `CLAUDE.md` y `PLANNING.md`; `test/privacy.test.js` sobre los archivos versionados y nuevos (patrones genéricos + un `privacy.local.txt` de palabras personales fuera de git)
- ✅ `package.json`: `repository`, `homepage`, `bugs`, palabras clave; Node ≥ 20 (el 18 ya no tiene soporte)

**B · README e imágenes** ✅ (2026-10-26)
- ✅ README (en/es) reescrito: qué es, pruébalo en un minuto, de una descripción a una lección en seis imágenes, la página, recetas, tres formas de usarlo, qué es y qué no es, documentación separada en usar y desarrollar, contribuir, créditos
- ✅ `scripts/readme-images.js`: las imágenes del README y de los ejemplos dibujadas por el kit (`docs/img/`); `live-page.png` es una captura (`scripts/ux-shots.js`)
- ✅ `scripts/demo-site.js` y `.github/workflows/pages.yml`: cada receta y cada ejemplo con fuente como página en vivo, en inglés y español, con un índice
- ✅ Activar GitHub Pages (Settings → Pages → Source: GitHub Actions) para que funcione el enlace a la demostración del README: activado, comprobado el 2026-10-29 (la demostración responde y el flujo corre en cada push)
- ⬜ Un GIF o video corto de la página en vivo (la corriente circulando, el osciloscopio, un deslizador); hecho con el exportador de fotogramas de *Escena y video* (V5)

**C · Ejemplos** ✅ (2026-10-26)
- ✅ `examples/README.md` (en/es): las tres formas de describir un circuito (a mano, `layout`, receta), los ejemplos por tema con una miniatura cada uno, `common-mistakes.json` marcado como mal a propósito, cómo agregar uno

**D · Lo que necesita un proyecto público**
- ✅ Integración continua en GitHub Actions: `npm test`, `npm run test:mcp`, `node scripts/golden.js`, `npm run examples`, `npm run layout-bench`, en Node 20, 22 y 24 — hecho como C01 de «Herramientas del repositorio» (2026-10-29): `npm run verify` en Node 22 y 24; el banco de layout queda fuera (mide tiempo)
- ⬜ `CONTRIBUTING.md` (en/es), sobre todo cómo agregar un componente; `CODE_OF_CONDUCT.md`; `SECURITY.md`; `CHANGELOG.md`
- ⬜ Plantillas de issues: componente nuevo, dibujo incorrecto, simulación incorrecta
- ⬜ Versión 0.3.0, etiqueta de git y release en GitHub; descripción, temas e imagen para compartir del repositorio
- ⬜ Formato de circuito versionado con notas de migración
- ⬜ Decidir la línea de copyright (hoy «protoboard-iso contributors») y el campo `author`

**E · Empaquetar el skill**
- ⬜ Plugin de Claude Code: `.claude-plugin/plugin.json` y un `marketplace.json` en este repositorio, con el skill, los tres agentes y el servidor MCP (`/plugin marketplace add …`). Por resolver: el servidor MCP necesita `npm install` (agruparlo en un solo archivo, o publicarlo en npm y arrancarlo con `npx`); rutas de `.mcp.json` con `${CLAUDE_PLUGIN_ROOT}`; revisar qué prefijo pone un plugin a los nombres de las herramientas MCP y actualizar las listas de los agentes (`npm run test:mcp` detecta nombres viejos)
- ⬜ Un zip del skill para claude.ai o la API, solo con la línea de comandos (sin dependencias): `scripts/pack-skill.js` con `SKILL.md`, `bin`, `src`, `schema`, la documentación esencial y los ejemplos, sin pruebas ni notas de desarrollo; antes, comprobar que haya Node donde corren esos skills
- ⬜ Paquetes en npm: `protoboard-iso` (línea de comandos, `npx protoboard-iso`) y el servidor MCP como segundo paquete (hoy `files` deja fuera `mcp/`); después, listarlo en los directorios de servidores MCP
- ⬜ Evaluaciones del skill: unos cuantos pedidos («un LED con su resistencia a 9 V») que deben terminar en `review` APPROVED, para comprobar que el skill se activa y que un modelo pequeño lo usa bien
- ⬜ `AGENTS.md` (ver «Circuitos con un modelo pequeño»)

**F · Lanzamiento**
- ⬜ Release publicada, demostración en línea, un anuncio corto con el GIF

## Herramientas del repositorio ✅

Comprobaciones y protecciones del propio repositorio, no de los circuitos. Planeadas el 2026-10-29
tras una revisión de solo lectura en `11d6de2`, en el orden en que rinden: primero la seguridad,
después el falso verde, la CI, el contexto y los agentes, el consumo y el proceso. Cada ítem dice
qué agregar y, después de «Hoy», por qué; el código entre paréntesis nombra la comprobación. Los
nombres de archivo siguen las convenciones del repositorio: las comprobaciones son suites de
`node:test` en `test/`, las herramientas son `scripts/*.js`, los datos y las opciones van en JSON y
las decisiones en el registro de `PLANNING.md`.

**A · Seguridad** ✅ (2026-10-29)
- ✅ Lista de lo que nunca se versiona (N03): `test/privacy.test.js` también falla con archivos versionados cuyo nombre coincide con una lista que no distingue mayúsculas (`local.env`, `*.env`, claves SSH, `*.pem`, `*.srl`, `CLAUDE.local.md`, `privacy.local.txt`). Hoy: solo `.gitignore`, que `git add -f` se salta — hecho el 2026-10-29: `NEVER_COMMIT` en `test/privacy/scan.js`, los mismos nombres en `.gitignore`
- ✅ Revisión de privacidad más firme (N06): `gitleaks` (solo en desarrollo), términos privados comparados después de normalizar a NFC, nombres de archivo leídos con `git ls-files -z`, un archivo ilegible contado como hallazgo y un juego de casos en `test/privacy/cases/` que deben coincidir y que no. Hoy: patrones genéricos y `privacy.local.txt` (la única lista fuera del repositorio), pero sin `gitleaks` ni casos que prueben que los patrones funcionan — hecho el 2026-10-29: la revisión en `test/privacy/scan.js` (`-z`, NFC, archivos ilegibles y expresiones inválidas como hallazgo, más formatos de secretos); sus casos en `test/privacy.test.js` (en la prueba y no en una carpeta `cases/`: los archivos con tilde, los agregados con `-f` y los ilegibles solo existen en un repositorio de usar y tirar); gitleaks 8.30 sobre el historial, los cambios sin commit y los archivos nuevos, probado antes en un repositorio de usar y tirar con un token en cada lugar (omitido si no está instalado)
- ✅ Opciones de Claude Code compartidas (N07): `.claude/settings.json` con `permissions.deny` para las rutas de secretos, un hook `PreToolUse` que impide leerlas o escribirlas y un hook `Stop` que avisa del trabajo sin commit. Hoy: solo un `.claude/settings.local.json` fuera de git — hecho el 2026-10-29: `.claude/settings.json` (36 reglas `deny`), `.claude/hooks/guard-secrets.js` y `stop-uncommitted.js`, `test/hooks.test.js`; los hooks en `.claude/hooks/` y no en `scripts/hooks/` (que queda para los hooks de git de N04)
- ✅ Regla de entrada externa y prueba de ataque (N14): una regla en `CLAUDE.md` (topes de tamaño, rutas confinadas a la carpeta del circuito, nada de `eval` ni `new Function` sobre la entrada) y una prueba que le da circuitos, operaciones y programas hostiles. Hoy: `src/sim/program.js` corre el programa traducido con `new Function`, `src/sim/compile.js` lee `"program"` con `join(folder, name)`, así que `../` sale de la carpeta, y nada limita el tamaño de un circuito, un programa o una lista de operaciones — hecho el 2026-10-29: `src/limits.js`, el archivo de programa confinado (`SIM_PROGRAM_OUTSIDE`), el traductor solo escribe nombres propios (`$`), `Serial.<método>`, índices numéricos y cadenas en `__str`; `test/attack.test.js`. De paso: `x / a[i]` con enteros indexaba el cociente; ahora el índice pertenece a su arreglo
- ✅ Revisión de licencias de las dependencias, sin red (O02): una prueba que lee los `node_modules` instalados (raíz y `mcp/`) y falla con una licencia fuera de una lista permitida, con `license-exceptions.json` para las conocidas (`@resvg/resvg-js`, MPL-2.0). Hoy: las licencias se revisaron a mano una vez (etapa 6, A); nada revisa una dependencia nueva — hecho el 2026-10-29: `test/licenses.test.js` sobre los dos archivos de bloqueo (sin instalar nada), `license-exceptions.json` con `@resvg/resvg-js` atado al uso de desarrollo u opcional; también comprueba que la raíz no tenga `dependencies` de ejecución

**B · Sin falso verde** ✅ (2026-10-29)
- ✅ Hooks de git (N04): `scripts/hooks/pre-commit` (privacidad y pruebas rápidas) y `scripts/hooks/pre-push` (la verificación completa), activados por `scripts/setup.js` (`git config core.hooksPath scripts/hooks`). Hoy: no hay hooks de git — hecho el 2026-10-29: `scripts/hooks/`, `npm run setup` (y `-- --off`)
- ✅ Un comando de verificación con tres salidas (N05): `scripts/verify.js` (`npm run verify`) corre los pasos de «How to verify a change» de `CLAUDE.md` y sale con 0 (pasa), 1 (falla) o 2 (un paso no pudo correr, por ejemplo el servidor MCP sin `npm install`). Se llama `verify` y no `review` porque `review` ya es la revisión de circuitos. Hoy: cada paso se corre a mano y un paso saltado parece aprobado — hecho el 2026-10-29: `scripts/verify.js`; también los avisos de los ejemplos contra `test/fixtures/examples-issues.json` (`--write-examples`), y lint, knip, jscpd y cobertura al llegar Q01
- ✅ Bloque de humo en el README (N12): marcar los comandos de prueba rápida del README con `<!-- smoke -->` y correrlos en la CI. Hoy: nada demuestra que esos comandos siguen funcionando — hecho el 2026-10-29: `<!-- smoke -->` en los dos README, corridos por `test/readme.test.js` (parte de `npm test`); encontró que el README en español prometía «APPROVED» donde la revisión dice «APROBADO»
- ✅ Pruebas sin el reloj real (N15): `mock.timers` de `node:test`, nombres temporales únicos por prueba y una comprobación que falla con `setTimeout` en `test/`. Hoy: `test/page.test.js` y `test/sliders.test.js` usan el reloj real — hecho el 2026-10-29: `test/clock.js` instalado en cada ventana de jsdom (`mock.timers` no llega a los temporizadores propios de una ventana), `test/clock.test.js` falla con una llamada al reloj real sin un motivo `// real clock:` (una prueba de velocidad y una fecha de archivo conservan uno)
- ✅ Herramientas de Node, solo en desarrollo (Q01): un linter (Biome), umbrales de cobertura con c8, `knip` que bloquea con archivos y exportaciones sin uso, `jscpd` para las copias; `parseArgs` estricto en `bin/`. Hoy: solo `node:test`, sin linter, cobertura ni código muerto — hecho el 2026-10-29: Biome solo como lint (`biome.jsonc`, código muerto quitado), c8 en 97/97/93/88 %, knip en cero (`@public` para las primitivas de los encapsulados), jscpd por debajo del 1 % (hoy 0,10 %), la línea de comandos rechaza opciones desconocidas y valores que faltan (`test/cli.test.js`); `npm audit fix` para `undici` (raíz) y `body-parser`, `fast-uri`, `qs` (mcp/)
- ✅ Documentos (Q05): `lychee --offline` (enlaces y anclas) y `markdownlint-cli2` en `npm run verify`. Hoy: nada revisa los documentos; los enlaces relativos a archivos resuelven en `11d6de2`, las anclas no se revisan — hecho el 2026-10-29 con una prueba propia sin red en su lugar (`test/docs.test.js`: 392 enlaces, anclas con la regla de GitHub, los bloques de código dicen su lenguaje, sin líneas en blanco dobles); lychee y markdownlint-cli2 quedaron fuera (ver el registro de decisiones)
- ✅ Prueba estática de los agentes (A02): `test/agents.test.js` comprueba que cada agente declara `model:` y que ninguno remite al lector a un archivo privado. Hoy: `npm run test:mcp` ya falla cuando un agente nombra una herramienta MCP que no existe o que no está en sus `tools:`, pero `parts-librarian` no tiene `model:` y nada lo detecta — hecho el 2026-10-29: `test/agents.test.js`; `parts-librarian` recibió `model: sonnet`, y los tres agentes ya no mandan a leer `CLAUDE.local.md` (la mitad de N02)
- ✅ Una línea de estado por informe de agente (A04): cada informe (`LAYOUT REPORT`, `REVIEW REPORT`, el del bibliotecario) termina en una línea `STATUS:`, como ya hace `layout`, con un validador en `scripts/report-status.js` que usa el banco de agentes. Hoy: los informes tienen formato fijo, pero no una última línea única que leer, y nada los comprueba — hecho el 2026-10-29: los tres formatos de informe terminan en `STATUS:`, `scripts/report-status.js` la comprueba contra el informe; agentes.md (en/es)

**C · CI y versiones** ✅ (2026-10-29)
- ✅ CI (C01): `.github/workflows/ci.yml` corre `npm run verify` en cada push y pull request, sin `privacy.local.txt` (la prueba de privacidad debe pasar solo con los patrones genéricos) y con las acciones fijadas por SHA. Es el mismo ítem que la CI de la etapa 6, D: hacerlo una sola vez. Hoy: solo `pages.yml`, que no corre pruebas — hecho el 2026-10-29: Node 22 y 24 (Node 20 ya no tiene soporte; `engines` sube a 22), gitleaks 8.30.1 por suma de control, también fijadas las acciones de la demostración; `test/ci.test.js`
- ✅ `.github/dependabot.yml` (C02): npm para la raíz y para `mcp/`, y `github-actions`. Hoy: no hay — hecho el 2026-10-29: semanal, con las menores y los parches agrupados por ecosistema
- ✅ Proteger `main` (C03): `scripts/github-ruleset.js` (con `gh api`) para que lo corra el dueño: un ruleset para `main` (CI obligatoria, sin push forzado) y el escaneo de secretos con protección al hacer push. Hoy: nada protege `main` — hecho el 2026-10-29: `scripts/github-ruleset.js` (muestra el plan; `--apply` lo hace); los administradores pueden saltarlo, porque el mantenedor sube a main; ⬜ el dueño lo corre con `--apply`
- ✅ `CHANGELOG.md`, versión y tags (N11): un registro de cambios a partir de la versión de `package.json`, un tag por etapa o fase, `engines` que coincidan con lo que prueba la CI (raíz y `mcp/`). Comparte el `CHANGELOG.md` y la versión 0.3.0 de la etapa 6, D. Hoy: no hay registro de cambios ni tags, y la versión es 0.2.0 aunque la página en vivo y los microcontroladores vinieron después — hecho el 2026-10-29: `CHANGELOG.md` (0.1.0, 0.2.0, Unreleased), etiquetas `v0.1.0` y `v0.2.0` en los commits que tenían esas versiones, `engines` >=22 en los dos paquetes, `test/changelog.test.js`; la 0.3.0 queda en la etapa 6, D

**D · Contexto y agentes** ✅ (2026-10-29)
- ✅ `model:` y `tools:` cerrados por rol (A01): cada agente declara los dos, y el revisor de solo lectura no recibe ninguna herramienta que escriba. Hoy: `parts-librarian` no tiene `model:`, y `circuit-reviewer` (solo lectura, solo pruebas en seco) tiene `apply_ops`, que también aplica — hecho el 2026-10-29: `parts-librarian` declara `model: sonnet`; el revisor tiene `try_ops` (una herramienta MCP nueva: apply_ops solo en seco) en lugar de `apply_ops`, y conserva Bash para el `--dry-run` del CLI; `test/agents.test.js` exige eso a los roles de solo lectura
- ✅ Banco de agentes (A03): `scripts/agent-bench.js`, como `layout-bench.js`: tres encargos fijos corridos con `claude -p --output-format json`, con sus líneas de estado, llamadas y costo comparados con la corrida anterior. Hoy: nada mide si un cambio en el kit dejó mejores o peores a los agentes — hecho el 2026-10-29: `scripts/agent-bench.js` (por omisión el plan, `--run` para gastar), resultados en `.claude/state/agent-bench.json`; `test/agent-bench.test.js` lo comprueba sin correrlo; ⬜ una primera corrida con `--run` como referencia
- ✅ Opciones con nombre (A05): `project.json` con `review_rounds` (hoy «dos rondas como máximo») y `briefs_per_agent` (cuándo empezar un agente nuevo), citados por `CLAUDE.md`, `docs/en/agents.md` y los agentes. Hoy: los límites están en prosa en varios archivos — hecho el 2026-10-29: `project.json` (`review_rounds` 2, `briefs_per_agent` 1, `context_kb` 48), citado por `CLAUDE.md` y agentes.md (en/es); ninguna prosa repite los números
- ✅ Bloque de opciones generado en `CLAUDE.md` (N01): un bloque entre marcas `<!-- generated: project.json -->`, escrito desde `project.json` y comprobado por una prueba. Hoy: no hay — hecho el 2026-10-29: `scripts/project-options.js` (`npm run options -- --write`), `test/project.test.js` falla si queda viejo
- ✅ `CLAUDE.local.md.example` y ningún archivo privado en los agentes (N02): agregar el ejemplo (300 palabras como máximo: qué va en el archivo privado) y cambiar en los tres agentes «lee `CLAUDE.local.md` para la ruta» por una pista genérica (Node instalado con un gestor de versiones puede no estar en el `PATH`). Hoy: no hay ejemplo, y los tres agentes remiten al archivo privado — hecho el 2026-10-29: el ejemplo (228 palabras), citado desde `CLAUDE.md`; lo de los agentes, con A02
- ✅ Presupuesto del contexto de arranque (N08): una prueba que suma `CLAUDE.md`, los agentes y `.mcp.json` contra `context_kb` de `project.json`, y una forma de leer el contexto real de arranque en la línea de estado. Hoy: nada lo mide — hecho el 2026-10-29: `scripts/context-size.js` (hoy 44,0 KB, `context_kb` 48), la cifra real con `/context` en una sesión

**E · Consumo** ✅ (2026-10-29)
- ✅ Registro de consumo (B01): un hook `Stop` y `SubagentStop` (`scripts/hooks/usage.js`) que suma tokens, costo, llamadas y aciertos de caché en un `.claude/state/usage.jsonl` ignorado por git. Hoy: no queda registro de lo que cuesta el trabajo de circuitos, así que «el trabajo de circuitos debe correr en un modelo pequeño» no se puede comprobar — hecho el 2026-10-29: `.claude/hooks/usage.js` en Stop y SubagentStop (tokens, llamadas, herramientas, aciertos de caché; el costo queda vacío: las transcripciones no lo traen, el banco de agentes sí), `--summary`

**F · Proceso y documentos** ✅ (2026-10-29)
- ✅ Prueba de paridad inglés–español (I01): cada documento de `docs/en/` tiene su copia en `docs/es/` (y `README`, `ROADMAP`, `PLANNING`, `examples/README`), con los mismos títulos y bloques de código; cada par se declara una vez. Hoy: 22 pares mantenidos a mano, nada los comprueba — hecho el 2026-10-29: `test/parity.test.js`, los pares por sus enlaces de idioma; encontró cuatro decisiones que faltaban en el registro en español (agregadas) y una oración que faltaba en el formato del circuito en inglés (agregada)
- ✅ Estado por decisión (N09): cada entrada del registro de decisiones de `PLANNING.md` (y `planeacion.md`) lleva un estado, y una reemplazada dice «reemplazada por N»; una prueba lo comprueba. Hoy: las entradas no tienen estado, y quien lee no sabe cuáles siguen en pie — hecho el 2026-10-29: una columna de estado en los dos registros (76 vigentes, 5 reemplazadas del todo o en parte), `test/decisions.test.js`
- ✅ Índice de los documentos (N18): `docs/en/README.md` y `docs/es/README.md` con un bloque generado, una línea por documento (título y para qué sirve), y un paso de `npm run verify` que falla cuando queda viejo. Hoy: el README y el mapa del código enlazan documentos, pero nada los lista todos — hecho el 2026-10-29: `docs/en/README.md`, `docs/es/README.md`, `scripts/docs-index.js`; la comprobación vive en `test/docs.test.js` (parte de `npm test`, y así de `npm run verify`)

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
