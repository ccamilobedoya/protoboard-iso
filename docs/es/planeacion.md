# Planeación: arquitectura, decisiones y buenas prácticas

*[English](../../PLANNING.md)* · Etapas y estado: [hoja-de-ruta.md](hoja-de-ruta.md) ·
Arquitectura completa: [arquitectura.md](arquitectura.md)

## 1. Para qué

Ayudar a aprender electrónica **viendo** los circuitos tal como se montan en una
protoboard: tamaños reales, bandas de colores reales, orientación real. Más adelante,
verlos funcionar (la corriente circulando, el voltaje (tensión) como color), como en el
simulador de Falstad, pero sobre el montaje físico en vez de sobre un esquema.

El kit se usa de dos maneras, y las dos definen el diseño:

1. **Un asistente de IA, como skill.** El asistente escribe unas 15 líneas de JSON y el kit
   hace todos los cálculos. El asistente nunca calcula a mano la geometría, el código de
   colores ni los valores eléctricos. Así las respuestas son baratas, rápidas y correctas.
2. **Personas, como librería.** Sin dependencias, funciona en Node y en el navegador, con un
   código que se puede leer para entender cómo funciona.

## 2. La arquitectura en una página

```
circuit.json ──▶ tipo ──▶ encapsulado ──▶ primitivas ──▶ cámara + pintor ──▶ SVG
                  │                             ▲
                  └──▶ agujeros ──▶ netlist ──▶ comprobaciones   (después: ──▶ simulador ──▶ animación)
```

| Capa | Responsabilidad | Carpeta |
|---|---|---|
| Tipo | Qué *es* el componente: valor → bandas, C·V → tamaño, nombres de patas, modelo eléctrico | `src/parts/types/` |
| Encapsulado | Forma física: medidas reales, reglas de las patas, armado con primitivas | `src/parts/packages/` |
| Referencias | Encapsulado + orden de patas + modelo de componentes reales | `src/parts/db.js` |
| Primitivas | Prisma, torno, tubo, calcomanías, texto sobre planos | `src/geometry/` |
| Protoboard | Posición de los agujeros y grupos conectados, como datos | `src/board/` |
| Circuito | Resolver, colocar, netlist, comprobaciones | `src/circuit/` |
| Dibujo | Cámara, sombreado, algoritmo del pintor, SVG | `src/core/`, `src/render/` |
| Traducción | Cada frase que ve el usuario | `src/i18n/` |
| Simulador | (etapa 2) MNA sobre la netlist y las descripciones `electrical` | `src/sim/` |

**Decisiones clave** (el registro completo está en la sección 5):

- **Geometría en 3D, en milímetros.** La proyección es lineal, así que cualquier vista es
  solo otra cámara. Los componentes nunca dependen de la cámara.
- **La orientación sale de los agujeros.** Cada componente se arma en el marco que definen
  su primer y su último agujero. En TO-220 y TO-92, el orden de las patas decide hacia dónde
  mira (pata 1 a la izquierda, impresión hacia ti).
- **La protoboard es la netlist.** Las conexiones salen solo de los agujeros usados.
- **Tipo ≠ encapsulado.** El significado eléctrico y la forma física van separados, así que
  las formas se comparten (el 1N4007 y las resistencias son axiales).
- **El dibujo nunca depende de la simulación.** El simulador lee la netlist y `electrical`;
  la animación lee los resultados del simulador. Cada capa se prueba por separado.
- **SVG autónomo.** Colores fijos, tamaño explícito, fondo blanco, sin variables CSS ni
  scripts, para que funcione como imagen en cualquier documento.

## 3. Consideraciones

### Colocación y tamaños
- Cada encapsulado usa las medidas de la hoja de datos. Las reglas de las patas (`span`,
  `inline`) salen de ahí: una resistencia de 1/4 W (cuerpo de 6,3 mm + 1 mm de doblez a
  cada lado) necesita ≥ 8,3 mm → 4 agujeros.
- Los choques se detectan con cajas alineadas a los ejes: son generosas con los componentes
  en diagonal. Bastan para atrapar errores reales; si aparecen falsas alarmas, se cambian
  por cajas orientadas.
- Los agujeros de riel solo existen en grupos de cinco; las columnas entre grupos no existen.

### Dibujo
- **Límites del algoritmo del pintor.** Ordenar por el centro de cada primitiva funciona con
  piezas convexas y compactas. Las piezas largas o altas pueden ordenarse mal: se parten (la
  aleta del TO-220 se parte a la altura del plástico; los cables son una primitiva por tramo).
- **Oclusión.** Los componentes altos tapan agujeros y componentes de atrás. Para eso está
  la vista trasera y, más adelante, transparencia al tocar.
- **Pantallas pequeñas.** Con la escala por defecto los agujeros quedan a unos 9 px; para
  ver de cerca se usa `fit: 'parts'`, con etiquetas legibles (11 px).
- **Fuentes.** El SVG pide Helvetica/Arial/Lato/sans-serif. Los rasterizadores sin fuentes del
  sistema pierden el texto: `scripts/preview.js` les pasa los archivos de fuente.
- **Tamaño del archivo.** Una protoboard completa pesa unos 150 kB, casi todo por los 830
  agujeros. Si importa, los agujeros pasan a `<use>` de un solo símbolo (la proyección es
  afín, así que todos los agujeros tienen la misma forma).

### Etiquetas y espacio
- **SVG estático:** las etiquetas son globos en filas por encima del componente más alto,
  unidos con líneas guía, así que el texto nunca tapa un componente. **Páginas
  interactivas:** las etiquetas aparecen al pasar el mouse o al tocar; el SVG ya las agrupa
  (`<g class="labels">`) para que una página pueda mostrarlas u ocultarlas.
- Los montajes para aprender necesitan aire. `clearance` (mm) avisa cuando dos componentes
  quedan más cerca que eso; los ejemplos de aprendizaje usan 3 mm o más. La colocación
  automática futura debe respetarlo.

### Estilo visual
- Realismo solo donde ayuda a reconocer un componente (bandas, encapsulados, marcas). La
  protoboard es el fondo: debe ser tranquila para que resalten los componentes (tema
  `study`, planeado).
- Todos los colores salen de paletas, nunca fijos dentro de los encapsulados, para que los
  temas sean posibles.

### Simulación (etapa 2)
- Los resultados son un **modelo** y se rotulan así. Los LED reales, las tolerancias y los
  límites de la fuente difieren de los valores ideales.
- Un tipo de componente a la vez, cada uno comprobado una vez contra una referencia y
  congelado como prueba. Nunca se ajusta un modelo para que un ejemplo «se vea bien».

### Aprendizaje
- El dibujo debe coincidir con lo que se va a montar: mismos nombres de agujeros que la
  protoboard real, mismos colores de rieles, aspecto real de los componentes.
- Un dibujo nunca muestra lo que se le pide predecir al estudiante (el modo predicción, en
  la etapa 4, oculta las lecturas).

### Publicación
- Licencia MIT. Solo arte propio; las medidas de las hojas de datos son hechos, no arte
  protegido.
- No copiar dibujos de componentes de Fritzing (CC BY-SA) ni de Wokwi sin revisar licencias;
  leer sus formatos para hacer adaptadores sí está bien.
- Lo personal o propio de un curso queda fuera del repositorio (va en `CLAUDE.local.md`).

## 4. Buenas prácticas

### Para el skill (`SKILL.md`)
- **Corto.** Flujo, resumen del formato, reglas. Los detalles viven en `docs/` y se leen
  solo cuando hacen falta (carga por capas).
- **La descripción decide cuándo se carga el skill.** Debe decir *cuándo* usarlo (circuitos
  en protoboard, guías de montaje, «dibuja/muéstrame este circuito»).
- **El código determinista hace el trabajo.** Si el asistente tuviera que calcular algo, se
  agrega al kit.
- **Revisar, inspeccionar y luego mirar.** `check` antes de `render`; `inspect` responde
  en números las preguntas de colocación, visibilidad y etiquetas; mirar un dibujo (pequeño)
  solo para el estilo.
- **Medir, no adivinar a ojo.** Todo lo visual que se pueda medir se vuelve un problema de
  `inspect` y una prueba, para que nunca empeore sin que se note.
- **Se arregla el kit, no la salida.** Nunca se edita a mano un SVG generado.
- **Los agentes siguen al kit.** `.claude/agents/` nombra herramientas, comandos, operaciones,
  perfiles y formatos; cualquier cambio en eso actualiza los agentes en el mismo cambio.

### Para el código
- Sin dependencias en tiempo de ejecución. Módulos ES simples, Node ≥ 18, funciona en el
  navegador.
- Medidas reales en mm, constantes con nombre, un comentario al principio de cada módulo
  que diga para qué sirve. Identificadores y comentarios en inglés.
- Referencia nueva → `db.js`. Forma nueva → encapsulado. Significado nuevo → tipo. En ese
  orden.
- Toda frase visible pasa por `t()`; la clave se agrega en todos los idiomas (`npm test` lo
  exige).
- Pruebas para todo lo que tenga una respuesta correcta (bandas, códigos, tamaños, reglas), y
  todos los ejemplos deben dibujarse desde las dos vistas sin `NaN`.
- Commits pequeños con un mensaje claro; actualizar `ROADMAP.md` cuando cambie un ítem.

### Para la documentación
- El inglés es la referencia; la traducción al español se actualiza en el mismo cambio.
- Explicar el *porqué*, con un ejemplo resuelto. Diagramas antes que párrafos largos.
- En inglés, «voltage»; en español, «voltaje (tensión)» la primera vez en cada página.

## 5. Registro de decisiones

| Fecha | Decisión | Por qué |
|---|---|---|
| 2026-10-12 | Skill propio en vez de Anatomy | Anatomy es solo mecánico y no simula. |
| 2026-10-12 | JavaScript, sin dependencias | Debe correr en el navegador para la animación y ser fácil de reutilizar. |
| 2026-10-12 | Código, claves del JSON y documentación de referencia en inglés; documentación en español desde el inicio; sistema de traducción | Alcance público; el mantenedor aprende en español; fácil sumar idiomas. |
| 2026-10-12 | Primero agujeros explícitos; plantillas y colocación automática después | Barato y exacto; el verificador atrapa los errores. |
| 2026-10-12 | Rieles continuos por defecto | Así es la protoboard del mantenedor; `split` disponible. |
| 2026-10-12 | Geometría 3D + cámara; vista frontal y trasera | Girar no cuesta nada; el texto sigue su plano. |
| 2026-10-12 | Tipo y encapsulado separados; tabla de referencias | Se reutilizan formas; un componente nuevo es una línea. |
| 2026-10-12 | Sin modo predicción hasta que la simulación funcione | Primero que sea correcto. |
| 2026-10-12 | Formato JSON propio; adaptadores después (Wokwi, Falstad) | Que se ajuste a lo que necesitamos; interoperar más tarde. |
| 2026-10-12 | Licencia MIT | Permisiva y simple para estudiantes y docentes. |
| 2026-10-12 | Etiquetas estáticas como globos por encima de todos los componentes; en páginas interactivas, al pasar el mouse o tocar | Las etiquetas tapaban componentes y volvían ilegibles los montajes apretados. |
| 2026-10-12 | Comprobación opcional de `clearance`; vitrina con más espacio | Para aprender, los componentes no deben ir apretados. |
| 2026-10-12 | Temas más adelante: una protoboard más tranquila y estética que la realista | La protoboard no debe competir con los componentes. |
| 2026-10-12 | Informe `inspect` y raster de cobertura; la escena como lista de dibujo compartida | Leer PNG es lento para un asistente; los números son rápidos, exactos y se pueden probar. |
| 2026-10-12 | Capas de anotación (`pins`, `nodes`, `boxes`, `grid`) como opción paramétrica, no como modo de depuración | Los agujeros y grupos exactos también le sirven a quien aprende, no solo para depurar. |
| 2026-10-12 | Etapa 1.5, interfaz para agentes, antes de la simulación: operaciones con prueba en seco y diferencia, historial y deshacer, consultas, servidor MCP, roles de agentes | Los asistentes deben retomar y ajustar circuitos de forma barata y segura; los resultados de la simulación usarán las mismas herramientas. |
| 2026-10-12 | Servidor MCP en `mcp/` como paquete propio; raíz restringida con `PROTOBOARD_ROOT`; respuestas en texto o JSON; PNG solo si se pide | Herramientas tipadas para cualquier agente sin que el kit tenga dependencias; acceso seguro a archivos; las imágenes son lentas de leer. |
| 2026-10-12 | Comando `review` con perfiles como definición compartida de «terminado»; tres subagentes (montaje, revisor de solo lectura, bibliotecario) que comparten el estado por los archivos | El veredicto no debe depender del gusto de un agente; agentes pequeños mantienen liviana la conversación principal. |
| 2026-10-12 | `@resvg/resvg-js` como dependencia de desarrollo para vistas previas en PNG | Permite que un asistente revise los dibujos sin navegador; el kit sigue sin dependencias. |
| 2026-10-13 | Una página autónoma por circuito (`out/<nombre>.html`), reescrita con cada cambio con un nombre estable, como lo que se embebe; las etapas siguientes la hacen crecer en vez de crear páginas nuevas | La documentación embebe una URL una sola vez; estática hoy, interactiva después, sin editar los docs. |
| 2026-10-13 | Simulador: MNA densa con Newton, modelos típicos de hoja de datos, `supplies` en el circuito, resultados en una capa propia `results`; la página los muestra solo si el circuito lo pide, detrás de un botón | Los circuitos de protoboard son pequeños; los modelos quedan legibles y comprobables; los resultados nunca deben adelantar una predicción. |
| 2026-10-13 | Cada modelo comprobado contra una referencia independiente resuelta aparte (fórmula de libro u hoja de datos), no contra su propia salida | Una prueba que usa el mismo simulador para calcular su referencia no prueba nada. |
| 2026-10-13 | Foco como velo + componentes dibujados otra vez encima (radiografía) con las tiras bajo sus patas; la página clona los componentes enfocados al momento en vez de traer copias; las mismas capas sirven a las imágenes estáticas | Un solo mecanismo para lecciones, clics y la capa de corriente; la página sigue liviana (las copias sumarían unos 130 kB por vista). |
| 2026-10-13 | Capa de corriente: puntos en tramos rectos a la altura de la protoboard, velocidad en escala logarítmica, electrones por defecto, corriente de cada tira por Kirchhoff a lo largo de ella; se activa por circuito como los resultados | Las corrientes van de µA a A; se explica con electrones; un flujo puede adelantar una predicción. |
| 2026-10-13 | Prioridad del idioma: pedido en la llamada > `lang` del circuito > por defecto (`pickLanguage`), también para los archivos reescritos tras un cambio; textos del circuito como texto plano (tal cual) o por idioma | Un circuito conserva su idioma lo edite quien lo edite; una petición explícita sigue ganando. |
| 2026-10-13 | Dos clases de texto por componente: la descripción del kit de cada tipo (`describe.*`, detrás del tipo en la ficha) y la `description` del circuito (cómo se usa aquí, a la vista, opcional) | Quien aprende pide el texto genérico; el uso en un circuito se puede omitir a propósito para que lo descubra. |
| 2026-10-13 | `jsdom` como dependencia de desarrollo para probar los scripts de la página (las pruebas se saltan sin él) | Un DOM que sigue la especificación detecta lo que un simulacro hecho a mano esconde (los elementos SVG no tienen la propiedad `hidden`); el kit sigue sin dependencias. |
| 2026-10-13 | Las baterías son componentes: dibujadas sobre la mesa, al lado de la protoboard, con cables hasta dos agujeros, y simuladas como fuentes igual que `supplies` (fem ideal detrás de una resistencia interna); formato, química, celdas y carga dan los números (`src/parts/batteries.js`); sin `charge`, el voltaje nominal | Quien aprende monta con un portapilas, no con una fuente abstracta; un solo modelo para las dos formas las mantiene coherentes; el nominal es el que trae impreso. |
| 2026-10-13 | Capa `under`: una primitiva que queda entera más allá de una cara lateral de la protoboard, del lado que la cámara no ve, se pinta antes que la protoboard | Las piezas fuera de la protoboard deben quedar tapadas por ella sin partir el algoritmo del pintor; fuera del plano de esa cara nada más puede superponerse mal. |
| 2026-10-13 | Ruptura Zener dentro del modelo de la unión (una segunda exponencial con su propio límite), rodilla suave por debajo de ~5,5 V y brusca por encima, exactamente Vz en Izt; reguladores como fuente controlada suave (mínimo suave entre la referencia y la entrada menos la caída) con su corriente propia | Curvas típicas de piezas reales; funciones suaves mantienen la convergencia de Newton; los valores coinciden con los puntos de hoja de datos que comprueban las pruebas. |
| 2026-10-13 | Sensores como resistencias cuyo valor sale de un campo del circuito (`temperature`, `light`); el zumbador pasivo como su bobina, con aviso si le llega continua | Un modelo simple sobre el que se puede razonar; los deslizadores de la etapa 3 solo cambiarán esos campos. |
| 2026-10-14 | La vista de conductores reemplaza la primera capa de corriente: conductores por su camino real (los paquetes devuelven `paths`), con color según el voltaje (rojo + / gris 0 / azul −, los colores de los rieles), solo corriente convencional (de + a −, como Falstad), velocidad de los puntos proporcional a la corriente con un botón logarítmico; se quita la vista de electrones | Pedido del mantenedor: el camino de la corriente se tiene que leer sobre la protoboard y coincidir con el simulador con el que se compara. Revierte la decisión del 2026-10-13 (escala logarítmica, electrones por defecto). |
| 2026-10-14 | Plan de la etapa 3: módulos de dispositivo (un archivo por tipo de componente), un programa compilado que corre un motor sin dependencias embebido en la página con un agrupador pequeño, límites como esfuerzos; ver `docs/es/simulacion-en-vivo.md` | Agregar componentes debe seguir siendo un archivo; el mismo motor debe correr en Node y en la página sin compilar. |
| 2026-10-14 | Las islas flotantes (sin camino en DC a una fuente) se anclan a tierra en un nodo, solo en DC (1 S, apagado en el transitorio) | Una bobina es un corto de 10⁶ S en DC; con solo GMIN (10⁻¹²) a tierra, su isla dejaba la matriz singular. En esa isla no puede circular corriente continua, así que nada cambia; en el transitorio un condensador puede acoplarla, por eso el ancla se apaga. |
| 2026-10-14 | La página en vivo lleva el programa compilado y el motor (agrupado) solo cuando el circuito pide resultados o corriente; el tiempo simulado corre de modo que la constante de tiempo más larga tome unos 2 s; la escala de velocidad de los puntos es la corriente mayor desde el arranque (no baja sola) | Un solo motor para Node y la página mantiene los números idénticos; una escala de tiempo visual fija hace legible cualquier RC; una escala que siguiera la corriente escondería cómo se apaga la corriente de un condensador, que es justo lo que se enseña. |
| 2026-10-15 | Falstad: exportar el programa compilado al formato de texto de CircuitJS, una celda de cuadrícula por elemento y una etiqueta por pata con el nombre de su grupo de la protoboard (sin esquema); cada dispositivo se escribe a sí mismo (`falstad(d, f)`); los equivalentes siempre llevan una nota, que se ve como **⚠ n** al lado del botón *Abrir en Falstad* de la página en vivo, que exporta el estado del motor en ese momento; una variante `exact` (resistencias del kit, Euler hacia atrás, potenciómetro como dos resistencias) para la comparación, cuyos resultados de Falstad se guardan con el texto exportado y se comparan sin red | Las etiquetas hacen exacta cada conexión sin trazar cables; quien aprende abre lo que está viendo; un equivalente nunca debe pasar callado; las referencias no deben necesitar un navegador en las pruebas, y una referencia corrida sobre otra exportación está vieja, no equivocada. |
| 2026-10-15 | El dibujo en Falstad como esquema en vez de una cuadrícula de etiquetas: nodos como filas ordenadas por el voltaje en DC del kit, componentes de dos patas de pie entre ellas, los que van en serie en una columna, los puentes unidos a su nodo, transistores con la base en media fila, orden de columnas por búsqueda local sobre los cruces y luego el largo de los cables; una etiqueta por nodo con su grupo de la protoboard | Pedido de Cris: la cuadrícula funcionaba pero no se veía como un circuito. Ordenar por voltaje hace que la corriente baje por la página, como en los libros; buscar el orden de columnas es barato para circuitos de protoboard (≈ 15 ms los ejemplos). |
| 2026-10-15 | Fases 7 a 9 planeadas: el osciloscopio solo en la ficha del componente seleccionado (al cerrarla se va; todavía sin canales fijados, pero la gráfica recibe una lista de trazas), grabado desde el arranque para todos los componentes; después un generador de señales como fuente; después sondas en los nodos. Se agrega a la hoja de ruta una pasada de experiencia de uso | Pedido de Cris: la gráfica explica el componente que se está leyendo; el generador es lo que hace valioso al osciloscopio; sondear nodos es como se usa el del banco; la página ya tiene muchas funciones y hay que ordenarlas. |
| 2026-10-15 | Adaptador e-paper DESPI-C02 como placa al lado de la protoboard (como el UNO), no enchufado: sus pines acodados apuntan a la protoboard y reciben cables Dupont; el interruptor RESE y el panel de 7,5" opcional son campos; una placa puede llevar `role` («adapter»), que cambia el tipo y la descripción de su ficha; el cable Dupont y el texto impreso pasaron a `packages/offboard.js` (los dibujos del UNO, idénticos byte a byte) | Así se cablea en el banco (el ESP32 ocupa la protoboard); la posición del interruptor es el error más común con este panel, así que se ve; un adaptador no es una placa de desarrollo. |
| 2026-10-16 | Osciloscopio (fase 7): todos los componentes grabados desde el arranque en un búfer circular (un componente tocado después muestra toda su historia); se dibuja solo en la ficha abierta y solo donde la ficha muestra resultados; una gráfica por magnitud, nunca un eje doble; la pantalla empieza en t = 0, se estira hasta el doble de su ventana y solo entonces avanza; reloj de pared sin C ni L; los valores por debajo de 1e-15 se escriben como 0 en todo el kit | La carga de un condensador desde 0 es la lección, así que no debe salirse de la pantalla; un eje por gráfica se lee fácil; el redondeo del simulador («-1,52e-18 pV») volteaba la escala y llenaba la ficha de ruido. |
| 2026-10-16 | Generador de señales (fase 8) como fuente, no como componente: las tres ondas de Falstad, amplitud de pico, salida de 50 Ω por defecto; el motor pone la fuente antes de cada paso (Euler hacia atrás: el valor al final del paso); la página va al ritmo del período (uno por segundo, ≥ 100 pasos por período, una ventana de 4 períodos), y el tiempo conserva su velocidad al mover un deslizador; en la exportación exacta a Falstad la fuente va adelantada un paso, porque Falstad usa el valor al empezar el paso | Un solo modelo de fuente para DC, transitorio y en vivo; copiar las ondas de Falstad hace exacta la comparación (5 nV en un RC a lo largo de 952 pasos) sin torcer la integración del kit; quien sube la frecuencia debe ver más períodos por segundo. |
