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
| 2026-10-16 | Sondas en los nodos (fase 9): una tira se encuentra por dónde cae el toque (la página lleva los agujeros de cada tira en la pantalla), no por un área de toque en el dibujo; un componente gana donde está dibujado, y las fichas se enlazan entre sí (pata de un componente → su tira, pata de una tira → su componente); la ficha de la tira muestra qué está conectado y, con resultados, su voltaje respecto a tierra, la corriente de cada pata que entra o sale de la tira y su osciloscopio; por debajo de 1 nA una pata no muestra corriente | Un área de toque encima de los componentes les robaría sus toques, y una debajo quedaría tapada por el velo y la vista de conductores; un componente tapa a menudo su tira en la pantalla, de ahí los enlaces. El voltaje respecto a tierra es lo que mide un osciloscopio real; la lista de corrientes de las patas deja comprobar la ley de corrientes de Kirchhoff en cualquier tira. El simulador deja escapar picoamperios (un condensador cargado), que no son una corriente para leer. |
| 2026-10-16 | Pasada de experiencia de uso planeada (docs/es/experiencia-de-uso.md): un solo modelo de interacción (la barra para la vista y el tiempo; un inspector para lo tocado, con una pestaña Circuito para controles, avisos y notas de Falstad; panel a la derecha en pantallas anchas, hoja inferior en el celular); gestos según el contexto (embebida: un dedo y la rueda desplazan la página que la contiene, dos dedos y Ctrl/⌘ + rueda acercan); tokens de `.interface-design/system.md` (paleta de banco, claro y oscuro), solo en la página, así el SVG estático queda idéntico; movimiento solo para el giro, el encuadre y la hoja; fases U0–U7, primero los gestos | La revisión (escritorio, tableta, celular, embebida) encontró que la página atrapa el desplazamiento dentro de una nota, tapa el componente tocado en el celular y entierra los controles en una barra plana; una maqueta solo con la paleta no ayudó, así que la estructura va antes que el color. Varias decisiones esperan al mantenedor (en el plan). |
| 2026-10-16 | Decisiones de la pasada de experiencia de uso y U1: una página embebida se comporta como un mapa embebido (un dedo y la rueda sola desplazan la nota; dos dedos mueven y acercan; Ctrl/⌘ + rueda o pellizcar en el panel táctil acercan; un aviso corto cuando se intenta de la otra forma; Pantalla completa en los botones de zoom); sola o en pantalla completa, el dibujo toma todos los gestos como antes; doble toque o doble clic encuadra el componente tocado. También elegido: el inspector como panel sobre el cuadro en el escritorio, en el celular solo la etiqueta del componente elegido, el tema sigue al sistema y `page.theme` y `?theme=` lo cambian | Elegido por el mantenedor después de la revisión: dentro de una lección la nota tiene que desplazarse, y un patrón conocido no hay que enseñarlo. Embebida, el tacto va por los eventos táctiles porque el navegador debe conservar el desplazamiento con un dedo; revisado en Chromium con emulación táctil, falta Safari en los dispositivos. |
| 2026-10-16 | U2: los colores de la página como tokens en `:root` (claro; oscuro por `prefers-color-scheme` salvo `<html data-theme>`), `page.theme` (`auto`, `light`, `dark`) y `?theme=` por encima; el dibujo se recolorea en la página con CSS sobre sus atributos de presentación (fondo, velo, etiquetas, etiquetas de resultados por `data-q`), así el SVG estático queda idéntico; la protoboard conserva sus colores en oscuro; los colores del osciloscopio como clases; ningún hex fuera de los bloques de tokens (probado); base táctil (*hover* limitado, `:active`, 40 px con puntero grueso) | Un solo lugar para el color abarata el tema y el ajuste posterior; una nota de la lección puede estar oscura cuando el sistema no, de ahí el ajuste y el enlace; un velo oscuro atenúa la protoboard en modo oscuro como el claro lo hace en modo claro. |
| 2026-10-16 | U3, la barra: una fila agrupada por lo que hace (Girar y Toda la protoboard como un solo botón de dos estados, Etiquetas y Corriente como interruptores, el tiempo con íconos), las etiquetas se ocultan en pantallas angostas en vez de una fila que se desliza de lado, lo que se usa menos en un menú ⋯ (velocidad de los puntos, Falstad, la ayuda otra vez, la revisión) que los módulos llenan con `page.menuAdd`; la ayuda sale de la barra a un mensaje de primera vez sobre el dibujo (recordado en `localStorage` cuando se puede); un aviso ⚠ n en la barra cuando se pasó un límite; el estado presionado como un acento suave en vez de un botón relleno | Trece botones iguales ocupaban dos o tres filas, o una fila de 1844 px en el celular; dos botones para una sola elección duplicaban la barra. Un estado presionado más tranquilo deja el circuito como foco. |
| 2026-10-16 | U4, el inspector: una caja para la ficha (`.info`) y los paneles del circuito (`.side`) con pestañas; un panel de 300 px a la derecha en pantallas anchas (los botones de zoom pasan abajo a la izquierda), una hoja inferior en el celular asomada (encabezado y resumen de la ficha), media y completa, que se arrastra 1:1 con resistencia en los extremos y cae según la velocidad proyectada al soltar (la deceleración 0,998 de Apple); sin nada tocado muestra la pestaña Circuito, plegada en el celular; el cuadro se corre para que los componentes elegidos queden en la zona libre; el encabezado de la ficha (título, ojo y ✕ como íconos) queda arriba, sigue una línea de resumen (etiqueta MODELO, valores), las patas van plegadas; el sello MODELO del dibujo se oculta en la página y una insignia en la esquina del cuadro dice DC o en el tiempo | La ficha tapaba el componente tocado y los controles un cuarto del celular; para cerrar había que bajar hasta el final; el sello se salía del cuadro. Una caja y un modelo (barra para la vista y el tiempo, inspector para lo tocado y el circuito) es lo que pedía el plan. |
| 2026-10-16 | La línea de resumen de la ficha solo con la hoja plegada, valores en casillas fijas; los gestos (`touch-action`) en los SVG del dibujo, no en `main` | Pedido del mantenedor: la línea repetía la sección Simulación y saltaba cuando los valores cambiaban de largo (−7,04 nA después de 48 mA), lo que los skills de experiencia de uso señalan (números que se mueven mientras se leen, un elemento que no se gana su lugar). Con `touch-action: none` en `main` la ficha de adentro no se desplazaba en el celular, y a media altura su final quedaba debajo de la pantalla. |
| 2026-10-16 | U5, movimiento: el giro inmediato (se probó una vuelta de 260 ms y el mantenedor prefirió ninguna), que conserva el zoom y el lugar en pantalla del componente enfocado; el encuadre se desliza 220 ms ease-out para botones y código (`frameTo`, un bucle de requestAnimationFrame porque el viewBox no es CSS) y sigue a los gestos al instante (`setBox`); entradas con `@starting-style` (el menú desde su botón, el panel del escritorio) y una hoja que sube desde el borde; respuesta al presionar; movimiento reducido: fundidos, sin desplazamiento. El encuadre ya no se reinicia al cambiar Etiquetas o una capa | El estándar de review-animations (menos de 300 ms, ease-out para entrar, ease-in-out para moverse en pantalla, interrumpible, solo transform y opacity; el viewBox es la excepción que necesita el dibujo). Conservar el zoom y el lugar del componente al girar es lo que evita que el estudiante pierda su lugar. |
| 2026-10-16 | U6 reducida a dos puntos (el mantenedor descartó los de etiquetas): los toques que no caen en nada toman un componente a pocos píxeles (más con el dedo), tocar otra vez el componente abierto abre el de debajo (después de 350 ms, así el doble toque sigue encuadrando), según el componente abierto y no el punto de la pantalla; en una pantalla vertical el encuadre de cerca son los componentes y las etiquetas tal como están dibujados (incluida la capa `under`: placas y paneles al lado de la protoboard), margen del 6 %, centrado sobre la hoja, y se vuelve a encuadrar cuando la hoja aparece | Un cable sobre una resistencia le robaba los toques; un encuadre ancho en una pantalla alta dejaba los componentes chicos con espacio vacío arriba. El dibujo se puede mover al abrir una ficha, así que «otra vez» no puede ser una posición en la pantalla. |
| 2026-10-16 | El servidor MCP corre las herramientas en un hilo aparte (*worker*) y lo reinicia cuando cambia el código del kit (la fecha más nueva bajo `src/` y las herramientas, mirada antes de cada llamada), en vez de solo avisar | Un servidor que llevaba rato prendido seguía escribiendo páginas con la interfaz vieja; cada *worker* tiene su propia caché de módulos, así que uno nuevo carga el código nuevo sin que el cliente se reconecte. Recorrer las fechas cuesta alrededor de un milisegundo. Los nombres y las entradas de las herramientas quedan como se registraron al arrancar: cambiarlos sigue pidiendo reconectar, y la respuesta lo dice. |
| 2026-10-16 | Las patas y los cables que atraviesan otro componente son avisos (`LEAD_THROUGH_PART`, `WIRE_THROUGH_PART`): cada pata se muestrea cada 0,5 mm contra las primitivas convexas de los demás componentes, con 0,2 mm de profundidad; un cable sobre otro cable no se informa | La revisión de cuerpos solo comparaba cuerpos, así que la pata de una resistencia por encima de unos pines pasaba. Las primitivas son convexas por regla, así que la prueba de punto dentro de los planos es exacta donde las cajas eran generosas; es aviso (no una regla solo de `lesson`) porque está mal físicamente en cualquier montaje, y así `suggest` lo evita sin más. Cables apilados sobre cables son normales en una protoboard real. |
| 2026-10-16 | `suggest` acepta un perfil de revisión y `parts` (varios a la vez, en el orden dado, cada uno con lo mejor dado lo anterior); los grupos se pueden nombrar por una pata ya colocada (`R1.2`) | Menos llamadas y menos rondas de revisión para un agente de montaje; el orden dado es predecible y cada pieza ve las anteriores. Buscar entre órdenes costaría más de lo que ahorra en circuitos de clase. |
| 2026-10-16 | `catalog` responde una lista compacta por defecto y una entrada en detalle con `name`; los campos por tipo son una lista explícita (`TYPE_FIELDS`) que una prueba compara con el esquema | El registro completo eran unos 20 KB por llamada. Sacar los tipos de las descripciones del esquema sería frágil; una lista explícita con prueba no se desfasa sin que nadie lo note. |
| 2026-10-17 | `suggest` reserva espacio para lo que viene: una tira con una pata sola y cada grupo que nombra después una cadena (`reserve`) conservan un agujero utilizable por conexión pendiente, comprobado con un cable de prueba que pasa por la misma evaluación; en una cadena se prueban las piezas que cuelgan de la colocada en sus seis mejores posiciones (si no, se queda la mejor con `DEPENDENT_BLOCKED`); sin colocación, la respuesta trae `reasons` | Dos corridas de montaje con un modelo más pequeño sellaron la tira de salida de un regulador (un capacitor tomó su último agujero visible) y gastaron decenas de llamadas repitiendo el mismo `suggest`. Contar agujeros libres no basta: los que quedan detrás de un cuerpo alto están libres pero ocultos, así que la prueba usa el criterio de la revisión. Buscar sobre todos los órdenes queda fuera (costo); un nivel de anticipación atrapa el callejón sin salida más común. |
| 2026-10-17 | (Reemplazado el mismo día por la protoboard elástica `auto`: el mantenedor prefiere una sola protoboard que crece a lo largo, no protoboards reales unidas; quien la arme ve cómo une las suyas.) Protoboards unidas (`bb400x2`, `bb400x3`, `bb830x2`): una sola protoboard para el kit, con las columnas numeradas de corrido, cada tramo con sus márgenes y cada riel puenteado en la junta por un cable que dibuja la protoboard (sus dos agujeros de riel quedan tomados), así los rieles siguen siendo un grupo; el primer tramo conserva los agujeros de la protoboard sola | El mantenedor pidió una protoboard flexible: un circuito con regulador en una bb400 salió apretado y difícil de leer. En el banco son dos protoboards unidas con puentes en los rieles, así el modelo sigue siendo físico y la simulación honesta; que el primer tramo no cambie deja crecer un montaje sin mover piezas. La alternativa, rieles partidos por protoboard, obligaba a dar un lado (`T-:L`) en cada fuente y cada referencia a un riel. |
| 2026-10-17 | `layout`: un circuito entero ubicado por un algoritmo a partir de sus componentes y redes, con el flujo ubicar → enrutar → verificar de las herramientas de diseño: capas por distancia a la fuente (como los esquemas al estilo Sugiyama), colocación por reglas según el tipo de pieza comprobada solo con geometría (sin dibujar), cables con el par de agujeros más corto que pasa, y después la verificación de redes y la revisión; mientras la revisión bloquea algo, se rehace sin la posición de la última pieza o cable que nombra | Un agente de montaje gastaba 40–80 llamadas por circuito, y las cadenas de `suggest` tardaban 12–22 s porque cada candidata se dibujaba y medía en dos vistas. Las comprobaciones geométricas toman milisegundos, así que un montaje entero tarda alrededor de un segundo y es predecible. La regla de filas para piezas altas (a, b, f, g) se midió: en c–e y h–j un lado de sus tiras queda tapado. Rehacer el montaje es más simple que parcharlo. |
| 2026-10-18 | La página corre la simulación siempre que el circuito se pueda simular (una fuente: supplies o una batería): resultados siempre activos (componente tocado, osciloscopio, límites), el botón Corriente en la barra sin presionar y los LED brillando con su corriente sobre la protoboard (una capa `lights` encima de los componentes, ya no solo dentro de la capa de corriente). `page.results: false` y `page.flow: false` apagan cada uno; `page.simulation: false`, los dos. Reemplaza la entrada del 2026-10-14 «sin bandera nueva» de simulacion-en-vivo.md | Lo pidió el mantenedor: los circuitos del curso salían sin el botón Corriente y con los LED apagados porque nadie se acordaba de `page.flow`. Un primer intento esa misma semana puso los resultados detrás de un botón Simulación nuevo; no era lo pedido y se revirtió. La regla de predicción funciona ahora al revés: se apaga (`page.simulation: false`) en un circuito con un valor pendiente de predicción. |
| 2026-10-20 | El trabajo de circuitos (montar, arreglar, revisar) debe correr en un modelo pequeño con poco razonamiento; el desarrollo del kit apunta a eso: el criterio va en las herramientas y los reportes, no en lo que piensa el agente | Lo pidió el mantenedor. Una tarea de circuitos hecha en una conversación con un modelo grande gasta muchos tokens razonando lo que el kit podría hacer (ubicar, enrutar, decir qué está mal y cómo arreglarlo). Los agentes ya corren en `sonnet`; una tarea que necesita más es un hueco que hay que cerrar en el kit. |
| 2026-10-20 | Los nombres de las patas se leen como los escribe la gente (`findPin`: nombre exacto, luego grupos de sinónimos, luego números de GPIO; solo si coincide una sola), en todo lugar donde se nombra una pata; `layout` termina en una sola línea `STATUS:` (`DONE`, `CHANGES`, `FIX_SPEC`, `SPEC_OK`), que también fija el código de salida de la consola; el agente de montaje se divide en dos caminos (A: `layout`, B: operaciones), con `layout` y `simulate` en sus herramientas; un test exige que cada herramienta que nombran las instrucciones de un agente esté en su lista | Una revisión con cuatro circuitos de clase: ninguno pasó al primer intento por los nombres de las patas (`D1.K` en un LED, `U1.DISCH` en un 555), y cada uno es una vuelta para un modelo pequeño; `layout` podía decir «Revisión: APROBADO» con una red sin conectar; el archivo del agente decía «layout primero» sin tener la herramienta, y «catalog primero» junto a «sin catalog antes de layout». Un alias se acepta solo si nombra una sola pata, así nunca escoge la equivocada en silencio. El resto de la revisión (recetas, la especificación como estado deseado, reparaciones en `layout`, AGENTS.md, prompts MCP) está en la hoja de ruta. |
| 2026-10-20 | El spec de layout se guarda dentro del circuito (`spec`: redes, fuentes que nombran patas, los id de los cables de layout), no en un `spec.json` aparte; `review` revisa esas redes; `layout` sobre un destino que ya existe lo vuelve a montar en una sola revisión de operaciones (quitar + circuit + agregar), y cada pieza y cable prueba primero sus agujeros actuales; `rename` también lo cambia. Las redes de tierra sin riel van a un riel −; una pasada de reparación vuelve a trazar, una vez, los cables que deja el ciclo de reintentos. El «oculto en todas las vistas» del perfil lesson pasa a ser «mejor vista bajo el 70 %» (`hiddenBelow`), contado por vista | Un modelo pequeño describe mejor un estado deseado que planear una secuencia de operaciones, y las conexiones pedidas se perdían después de la primera llamada, así que nada podía revisarlas luego. Dentro del circuito, el historial y `undo` cubren el spec sin un mecanismo nuevo. Probar primero los agujeros actuales deja el montaje del estudiante donde está. El umbral del 85 % (el de nota del inspector) y una doble cuenta en una misma vista hacían bloquear un 555 visible al 73 % y al 69 %, y gastar los 8 intentos en la fuente de dos rieles: medido, las dos pasan ahora al primer intento. |
| 2026-10-26 | Recetas: los circuitos de clase habituales como especificaciones de `layout` dentro del kit (`src/recipes/`, un módulo de datos por receta), llamadas con `recipe` y solo los `values` que lista cada receta (el campo principal por identificador, o algunos campos permitidos; opciones y rangos); nunca con `parts` ni `nets`; `catalog` las lista y las detalla (sin herramienta nueva; el nombre de una receta no puede tapar el de un componente); el circuito guarda `spec.recipe` hasta que se monta con otras redes. Cada receta debe terminar en `DONE` en una llamada (banco y pruebas, también con cada opción). Encontrado en el camino y arreglado en `layout`: una placa de desarrollo sobre el canal se ubica por su pata 1 para que sus patas en redes conserven agujeros libres fuera de su circuito impreso, y un grupo de una red al que no llega ningún cable espera al resto de la red (los rieles al final) | Un modelo pequeño acierta un circuito habitual solo si no le queda nada por resolver; con los identificadores y las redes fijos cada receta sigue siendo un montaje probado, y solo cambian los valores. Una herramienta más le cuesta a cada agente; el catálogo es donde ya se buscan los nombres. Módulos de datos y no JSON, para que `src/` no lea archivos y los títulos lleven los dos idiomas. Los fallos del ESP32 eran del algoritmo (una tira tapada), así que se arreglaron ahí; el del puente era de la receta (un condensador alto junto a un cable al riel), así que la receta deja su lado de continua fuera de los rieles. |
| 2026-10-26 | El NE555 se simula con un modelo de comportamiento: el divisor interno y el consumo propio como resistencias, y un elemento (`timerCore`) para comparadores, biestable, salida y descarga, cuyo biestable cambia solo cuando se acepta un paso, con los voltajes de ese paso; un dispositivo puede aceptar solo algunos componentes de su tipo (`accepts`), así los demás circuitos integrados siguen sin simularse | Cada paso resuelve una etapa lineal, así que no hay problemas nuevos de convergencia; el error de conmutación es un paso de tiempo, muy por debajo de lo que se ve (el astable queda un 2 % más lento que la fórmula del libro, como un 555 real con su pata de descarga por encima de tierra). Un dispositivo para el 555 en vez de un subcircuito a nivel de transistores: la ficha muestra lo que muestra el diagrama de bloques de la hoja de datos. |
| 2026-10-26 | Los cables pagan 12 mm de cable por cada cuerpo que cruza su línea vista desde arriba, y un grupo se une a la red donde sale más barato, comparando todos los grupos ya unidos | Un cable pasa en arco sobre lo que queda entre sus agujeros; la regla de «el más cercano primero» mandaba THR a TRIG justo por encima del 555 cuando había libre un cable corto a la tira del condensador de tiempo. Es una penalización, no una prohibición: cruzar sigue siendo posible cuando es la única forma (RESET a VCC). |
| 2026-10-26 | Los amplificadores operacionales, una fila de comportamiento por amplificador: V(o) − V(vee) = un límite suave de ganancia·vd + S/2, con vd limitado entre iteraciones de Newton (se detiene justo dentro del rango lineal la primera vez que iba a salir y sigue la segunda); el LM393 como un interruptor suave de OUT a su pata negativa; los amplificadores sin nada conectado se dejan fuera; varios dispositivos por tipo de componente, y el programa nombra el dispositivo de cada componente por su tipo de lectura | Un límite es lo que se ve en un banco (una salida que se queda por debajo del riel) sin un modelo a nivel de transistores; con realimentación, Newton rebotaba entre los rieles porque la pendiente casi no existe en saturación, y detenerse dentro del rango, donde la pendiente es 1, hace que el paso siguiente sea casi exacto. Todavía sin ancho de banda: las clases son ganancias en DC y en frecuencias de audio. |
