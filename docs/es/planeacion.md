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
