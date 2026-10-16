# Pasada de experiencia de uso: diseño y plan

*[English](../en/ux-pass.md)* · Hoja de ruta: [hoja-de-ruta.md](hoja-de-ruta.md), *Experiencia de uso*

La etapa 3 dejó la página con muchas funciones útiles: vistas, encuadre, etiquetas, la capa de
corriente, los controles de tiempo, Falstad, fichas de componentes y de tiras con sus valores,
deslizadores y osciloscopio, un panel de controles y avisos. Llegaron de a una fase a la vez y
ahora compiten entre sí y con el circuito, sobre todo en el celular y dentro de una nota de la
lección. Esta pasada reorganiza toda la página alrededor de un solo modelo de interacción antes
de que la etapa 4 agregue más.

Plan del 2026-10-16, a partir de una revisión de la página en vivo (escritorio, tableta, celular,
embebida a 900 y 390 px) con los skills de UI/UX instalados en local en este repositorio
(`interface-design` y los de diseño de Emil Kowalski; lista en `.claude/skills/SOURCES.md`). El
sistema visual está en [`.interface-design/system.md`](../../.interface-design/system.md). Cada
sesión termina con las pruebas en verde, esta página y la hoja de ruta al día.

## Estado

- ✅ U0 (2026-10-16): `scripts/ux-shots.js`; el juego de «antes» son las capturas de la revisión.
- ✅ U1 (2026-10-16): gestos según el contexto, botones de zoom, doble toque a un componente,
  pantalla completa. Revisado en Chromium con emulación táctil dentro de un iframe: un dedo y la
  rueda desplazan la nota, dos dedos mueven y pellizcan en los dos sentidos, Ctrl + rueda acerca,
  un toque abre la ficha, un doble toque encuadra el componente. Falta probarlo en el celular y el
  iPad del mantenedor (Safari). El mantenedor la probó en la página de prueba: funciona.
- ✅ U2 (2026-10-16): cada color de la página es un token (claro y oscuro, de `system.md`); el tema
  sigue al sistema, `page.theme` lo fija y `?theme=` en el enlace gana; en la página el fondo del
  dibujo, el velo, las etiquetas y las etiquetas de resultados toman los tokens; las trazas del
  osciloscopio también; base táctil (*hover* solo con ratón, respuesta en `:active`, sin destello al
  tocar, objetivos de 40 px al tacto).
- ✅ U3 (2026-10-16): la barra en una fila agrupada por lo que hace (vista: Girar, Toda la
  protoboard; capas: Etiquetas, Corriente; tiempo: Pausa/Seguir, Encender, reloj), íconos con
  etiquetas que se ocultan en pantallas angostas, el menú ⋯ (velocidad de los puntos, Abrir en
  Falstad con su ⚠ n, ¿Qué se puede tocar?, revisión) con teclado y foco resueltos, un aviso de
  límites en la barra, la ayuda de primera vez sobre el dibujo. Revisado a 390 px: nada se desliza
  de lado (el reloj se oculta por debajo de 400 px).
- ✅ U4 (2026-10-16): el inspector: una caja con pestañas (Componente o Tira, Circuito), la ficha con
  un encabezado que queda arriba (título, ojo, ✕) y un resumen (una etiqueta MODELO y los valores),
  las patas plegadas, los paneles del circuito en la pestaña Circuito; panel a la derecha en
  pantallas anchas, hoja inferior en el celular (asomada, media, completa; se arrastra 1:1 con
  resistencia en los extremos y cae según la velocidad al soltar; tocar su encabezado la sube); los
  componentes elegidos quedan en la zona libre; el sello MODELO del dibujo pasa a una insignia en la
  esquina del cuadro que dice DC o *en el tiempo*. Revisado en Chromium con emulación táctil (toque,
  lanzar hacia arriba, hacia abajo, tocar el encabezado).
  - Después de que el mantenedor la probó (2026-10-16): la línea de resumen solo aparece con la hoja
    plegada (abierta, repetía la sección Simulación) y cada valor tiene una casilla fija (8,5ch,
    monoespaciada) para que un valor que cambia de largo ya no empuje a los demás; la ficha se
    desplaza hasta el final a media altura (espacio abajo para la parte de la hoja que queda fuera de
    la pantalla) y se desplaza también en Safari (`touch-action: none` pasó de `main` a los SVG del
    dibujo).
- ✅ U5 (2026-10-16): movimiento, revisado contra el estándar de `review-animations`. Tokens
  (`--ease-out`, `--ease-in-out`, `--ease-drawer`, `--t-press`). Girar: inmediato (el
  mantenedor probó una vuelta de 260 ms y prefirió sin transición), conserva el zoom y el componente
  enfocado en el mismo punto de la pantalla. Encuadre (Toda la
  protoboard, botones de zoom, doble toque, mantener libre un componente): 220 ms *ease-out*, y un
  gesto lo toma al instante. Entradas: el menú ⋯ crece desde su botón (150 ms), el panel del
  escritorio entra deslizándose, la hoja del celular sube desde el borde. Respuesta al presionar
  (`scale(0.96)`) en los botones de la barra, del zoom y del encabezado de la ficha. Encontrado en
  el camino: prender o apagar Etiquetas o una capa reiniciaba el encuadre; ahora solo lo cambian
  Girar y Encuadrar.
- Sigue: U6.

## Para quién y para qué

- **Quién:** un adulto que aprende electrónica por su cuenta en el banco, con la lección abierta
  en una app de notas (una vista web de Trilium: un iframe de unos 460 px de alto dentro de una
  página que se desplaza), muchas veces en el celular o el iPad, a veces en el escritorio.
- **Qué hace:** mira cómo está montado un circuito, toca un componente o una tira para entenderlo,
  lee sus valores, mueve un deslizador, mira la corriente o el osciloscopio, gira la protoboard
  para ver las tiras.
- **Cómo se debe sentir:** tranquila y precisa, como una libreta de laboratorio al lado de un
  instrumento de banco. El circuito es el único foco; la interfaz se queda quieta hasta que se
  necesita.

## Lo que encontró la revisión

Capturas y la tabla completa: `~/proyectos/electronica/diagramas/vista-previa-kit/ux/`
(`index.html`, `findings.md`), en el equipo del mantenedor.

| # | Gravedad | Hallazgo |
|---|---|---|
| 1 | Bloquea | **El desplazamiento queda atrapado al embeber.** La rueda siempre acerca (`view.js`, `preventDefault`) y `main` tiene `touch-action: none`, así que no se puede bajar por la nota pasando el circuito. En el celular el iframe puede llenar la pantalla y dejar al lector atrapado. |
| 2 | Bloquea | **Celular: la interfaz tapa el circuito.** El panel de controles queda abierto sobre un cuarto de la pantalla; la ficha (abajo a la izquierda, hasta el 55 % de alto) tapa el componente que se tocó. |
| 3 | Bloquea | **Una barra plana.** 13 controles con el mismo peso: dos filas en el escritorio, tres filas embebida a 900 px (≈ 95 de 460 px); en el celular una fila de 1844 px con la barra de desplazamiento oculta, así que *Corriente*, *Pausa* y *Falstad* no se encuentran. |
| 4 | Corregir | *Cerrar* y *Ver a través* están al final de la ficha, debajo del osciloscopio. |
| 5 | Corregir | Los componentes pequeños cuestan de tocar: el centro de R1 abrió W1 (gana el cable de encima). |
| 6 | Corregir | El sello MODELO se dibuja en coordenadas de la protoboard y se sale de la pantalla (x = −221 px); dice *DC* en una página que corre un transitorio. Decir «modelo» es una regla del curso. |
| 7 | Corregir | Girar la protoboard y cambiar el encuadre son instantáneos y reinician el zoom y la posición. |
| 8 | Corregir | No hay zoom ni reinicio visibles; el doble clic solo acerca. |
| 9 | Corregir | Sin tokens (≈ 30 valores hex en `style.js`), sin tema oscuro; las etiquetas crecen con el zoom y quedan más grandes que cualquier texto de la interfaz. |
| 10 | Nota | El *hover* no está limitado al ratón, no hay respuesta al presionar, no se quita el destello al tocar, botones de 25 px. |
| 11 | Nota | La ayuda *Toca un componente…* está en la barra como si fuera otro control. |
| 12 | Nota | El encuadre vertical deja vacía la parte de arriba. |

Una maqueta solo con la paleta nueva (CSS inyectado, 2026-10-16) no hizo que la página se viera
bien: el problema es la estructura, no los colores. Por eso esta pasada empieza por los gestos, la
distribución y la jerarquía, y deja la paleta como tokens para afinar al final.

## Principios

Tomados de los skills y de la revisión; cada fase se revisa contra ellos.

1. **El circuito manda.** La interfaz nunca tapa más de un 15 % del cuadro en el escritorio ni un
   30 % en el celular, y nunca el componente que se explica: cuando se abre un panel, el cuadro se
   mueve para que el componente elegido quede en la zona libre.
2. **Un solo modelo de interacción.** La **barra** es para la vista y el tiempo; el **inspector**
   (la ficha) para lo que se tocó; la **pestaña Circuito** del inspector para lo que es de todo el
   circuito (controles, avisos, notas de Falstad). Nada flota por su cuenta.
3. **Mostrar de a poco.** Lo básico a la vista, lo demás a un paso (un menú, una sección plegada).
   La lección decide qué existe (`page.*`); la página decide qué se ve primero.
4. **Responder al presionar.** Respuesta en *pointer-down*; objetivos de 40 px al tacto; *hover*
   solo donde hay ratón (`@media (hover: hover) and (pointer: fine)`).
5. **El movimiento explica o no ocurre.** Solo se mueven el encuadre, la hoja y el panel (el giro es inmediato); menos de
   300 ms, curvas fuertes *ease-out* / *ease-in-out* como tokens; un fundido con
   `prefers-reduced-motion`. Sin filtros CSS (ver el mapa del código). Las acciones frecuentes
   (tocar un componente, prender una capa) no se animan.
6. **Tokens y temas.** Todo color de la interfaz de la página sale de un token; claro y oscuro; el
   SVG estático conserva sus colores y queda idéntico byte a byte.
7. **La misma página, el mismo enlace.** Nombre del archivo, campos `page.*` y regla de predicción
   sin cambios; un embebido de hoy sigue funcionando y recibe la interfaz nueva.

## Diseño propuesto

### Barra

Una fila de 36 px de alto (unos 48 px al tacto, con botones de 40 px), agrupada por lo que hace, ícono + etiqueta corta en
el escritorio, solo ícono en el celular (la etiqueta como `aria-label` y como ayuda emergente).
Sin desplazamiento lateral.

| Grupo | Controles | Cuándo |
|---|---|---|
| Vista | **Girar** (un botón: de frente ↔ desde atrás), **Encuadrar** (componentes ↔ toda la protoboard, un botón con dos estados) | siempre |
| Capas | **Etiquetas**, **Corriente** | Corriente con `page.flow` |
| Tiempo | **Reproducir/Pausa**, **Reiniciar (t = 0)**, reloj | páginas en vivo con C, L o generador |
| ⋯ | escala de velocidad (proporcional / logarítmica), *Abrir en Falstad ↗* con su ⚠ n, revisión, *¿Qué se puede tocar?* | siempre (los ítems según la página) |

Un grupo de zoom (+, −, encuadrar) en la esquina inferior derecha del cuadro. La ayuda *Toca un
componente o una tira* pasa a ser una píldora de primera vez sobre el cuadro que se va después del
primer toque (se recuerda en `localStorage` cuando se puede).

### Inspector

Un solo contenedor para todas las fichas, con encabezado fijo: título, ✕ y el interruptor *Ver a
través* para un componente. Orden de las secciones: qué es (tipo, valor, uso aquí) → valores con
una insignia **MODELO** → osciloscopio → sus controles → patas / conexiones (plegadas). Sin nada
elegido, el inspector muestra la pestaña **Circuito**: los deslizadores de `page.controls`, los
avisos (con *Borrar marcas*), las notas de Falstad. Un aviso además prende un punto en la barra
para que nunca pase inadvertido.

- **Ancho (≥ 760 px):** un panel a la derecha, de 300 px, sobre el cuadro; el cuadro se corre para
  que el componente elegido quede a su izquierda. Se puede plegar a una pestaña en el borde.
- **Angosto (< 760 px):** una hoja inferior con tres alturas: *asomada* (encabezado, insignia
  MODELO y los valores principales en una línea), *media*, *completa*. Se arrastra con el dedo
  (eventos de puntero, resistencia elástica en los extremos, se acomoda según la velocidad al
  soltar) y su encabezado se toca para pasar de una altura a otra. El cuadro mantiene el
  componente por encima de la hoja.

### Gestos

| Dónde | Un dedo / arrastre con ratón | Dos dedos | Rueda | Doble toque |
|---|---|---|---|---|
| Embebida (dentro de un iframe) | **desplaza la página que la contiene**; un toque sigue eligiendo | mueven y acercan | desplaza la página que la contiene; **Ctrl/⌘ + rueda** o pellizcar en el panel táctil acerca, con un aviso corto «Ctrl + rueda para acercar» la primera vez | acerca al componente tocado |
| Página completa (abierta sola, o en pantalla completa) | mueve el dibujo | mueven y acercan | acerca | acerca al componente tocado |

Un botón **Pantalla completa** (en ⋯, y en el grupo de zoom cuando está embebida) abre la página
sola (o usa la API de pantalla completa) para tener todos los gestos. Los componentes pequeños
tienen un área de toque más grande; un segundo toque en el mismo punto elige el componente de
debajo (un cable sobre una resistencia).

### Girar y encuadrar

Al girar se conserva el componente enfocado (o el centro) en el mismo lugar de la pantalla y el
mismo zoom, al instante (sin transición: lo eligió el mantenedor después de probar una). Cambiar el encuadre anima el `viewBox` (≈ 200 ms, `--ease-out`). El encuadre vertical
se ajusta al espacio que dejan libre la barra y la hoja.

### Etiquetas y el sello MODELO

Como se decidió el 2026-10-12, en la página las etiquetas siguen al toque: en el celular solo se
ve la del componente elegido (y todas con *Etiquetas* prendido); en el escritorio todas, con un
tamaño máximo en pantalla para que nunca superen a la interfaz. El sello MODELO sale del dibujo y
pasa al inspector (insignia sobre los valores) y a la esquina del cuadro, con el modo correcto
(*DC* o *transitorio*).

### Sistema visual

De [`.interface-design/system.md`](../../.interface-design/system.md): crema de protoboard y
tinta, el azul del riel como único acento, el rojo del riel para avisos, el osciloscopio como un
pozo oscuro; líneas finas, sin sombras; fuentes del sistema con valores monoespaciados y tabulares;
cuadrícula de 4 px. Tokens en `:root`, tema oscuro por `prefers-color-scheme`, cambiado por `page.theme` del circuito y
por `?theme=dark|light` en el enlace (para una app de notas cuyo tema no es el del sistema). Solo en
la página, el fondo del dibujo, el velo y las cajas de las etiquetas también toman los tokens (el
SVG estático conserva sus colores).

## Inventario de funciones

| Función | Hoy | Propuesta | Se ve cuando |
|---|---|---|---|
| Vista de frente / desde atrás | 2 botones en la barra | botón Girar | el circuito tiene dos vistas |
| De cerca / toda la protoboard | 2 botones | botón Encuadrar (dos estados) + grupo de zoom | siempre |
| Etiquetas | botón | grupo Capas | siempre |
| Capa de componentes / de corriente | 2 botones | interruptor Corriente | `page.flow` |
| Velocidad proporcional / logarítmica | 2 botones | menú ⋯ | `page.flow` |
| Pausa, encender, reloj | barra (en vivo) | grupo Tiempo | en vivo, con C, L o generador |
| Abrir en Falstad, ⚠ n | barra + panel lateral | menú ⋯; notas en la pestaña Circuito | en vivo |
| Revisión | barra | menú ⋯ | siempre |
| Ayuda | barra | píldora de primera vez; *¿Qué se puede tocar?* en ⋯ | siempre |
| Ficha de componente (tipo, valor, uso, patas, resultados, osciloscopio, deslizadores, modos del pulsador, ver a través, cerrar) | caja flotante abajo a la izquierda | inspector | al tocar un componente |
| Ficha de tira (conexiones, voltaje, corrientes, osciloscopio) | la misma caja | inspector | al tocar una tira en uso |
| Puntas de una etiqueta de resultado | ayuda emergente sobre el dibujo | sin cambios | al tocar o pasar sobre la etiqueta |
| Panel de controles | panel lateral, abierto | pestaña Circuito | `page.controls` |
| Avisos, borrar marcas | panel lateral | pestaña Circuito + punto en la barra | un componente cerca de su límite o pasado |
| Arrastrar, pellizcar, rueda, doble clic | siempre capturados | según el contexto (tabla de arriba) | siempre |
| Pantalla completa | – | ⋯ y grupo de zoom | embebida |

## Fases y sesiones

| Sesión | Fase | Entrega |
|---|---|---|
| 1 | **U0 · Red de seguridad** | `scripts/ux-shots.js`: escribe un fragmento de Playwright que carga las páginas elegidas a 1280×800, 1024×700, 390×760 y dentro de un iframe (900×460, 390×460) y guarda capturas (el mismo flujo con el contenedor que `scripts/falstad.js`); se guarda el juego de «antes». Las pruebas jsdom de la estructura de la página se actualizan a medida que cada fase la cambia. |
| 1 | **U1 · Gestos y embebido** | gestos según el contexto (embebida: un dedo y la rueda van a la página que la contiene; dos dedos, Ctrl/⌘ + rueda y pellizcar acercan), aviso de primera vez, doble toque acerca a un componente, grupo de zoom (+, −, encuadrar), Pantalla completa. Corrige los hallazgos 1 y 8. |
| 2 | **U2 · Tokens, tema, base táctil** | `style.js` con los tokens de `system.md`; tema oscuro (`prefers-color-scheme`, `?theme=`); fondo del dibujo, velo y cajas de etiquetas con tokens en la página; colores de las trazas del osciloscopio como tokens; base táctil (sin destello al tocar, *hover* limitado, `:active`, `touch-action: manipulation`, 40 px con puntero grueso). Hallazgos 9 (colores) y 10. |
| 3 | **U3 · La barra** | grupos, íconos SVG en línea (sin dependencias), Girar y Encuadrar como un solo botón cada uno, menú ⋯ (con teclado y foco resueltos), píldora de primera vez, punto de avisos; cada texto por `t()`. Hallazgos 3 y 11. |
| 4–5 | **U4 · El inspector** | un contenedor con encabezado fijo y el orden de secciones; pestaña Circuito (controles, avisos, notas de Falstad); panel a la derecha en pantallas anchas, hoja inferior asomada/media/completa en las angostas; el cuadro mantiene el componente elegido en la zona libre; insignia MODELO con el modo correcto. Hallazgos 2, 4 y 6. |
| 6 | **U5 · Movimiento** | tokens de movimiento (`--ease-out`, `--ease-in-out`, `--ease-drawer`, duraciones), giro que conserva el foco y el zoom, transición del encuadre, movimiento de la hoja y del panel, respuesta al presionar, movimiento reducido; revisado con el estándar de `review-animations`. Hallazgo 7. |
| 6 | **U6 · Detalles** | etiquetas según el contexto con tamaño máximo en pantalla, áreas de toque más grandes y tocar otra vez para elegir el componente de debajo, encuadre vertical. Hallazgos 5, 9 (etiquetas) y 12. |
| 7 | **U7 · Probar y afinar** | el mantenedor la prueba en el celular, el iPad y dentro de Trilium; ajustes; `/design-review` hasta aprobar; paleta afinada; documentación. |

En cada fase: documentación en inglés y español ([embeber.md](embeber.md),
[foco-y-corriente.md](foco-y-corriente.md), [mapa-del-codigo.md](mapa-del-codigo.md)), la hoja de
ruta marcada en los dos idiomas, el registro de decisiones en `PLANNING.md`, los textos nuevos en
cada archivo de `src/i18n`, las capturas de `ux-shots` comparadas con el juego anterior.

## Decisiones

Tomadas por el mantenedor el 2026-10-16.

| Decisión | Elegido | Fase |
|---|---|---|
| Un dedo en una página embebida | desplaza la nota; **dos dedos mueven el dibujo**, como un mapa de Google embebido (con su aviso corto) | U1 ✅ |
| Inspector en el escritorio | un **panel sobre el cuadro**; el cuadro se corre para que el componente elegido quede libre | U4 |
| Etiquetas en el celular | **solo la del componente elegido** (todas con *Etiquetas* prendido) | U6 |
| Tema | **sigue al sistema**; un ajuste lo cambia: `page.theme` en el circuito, y `?theme=` en el enlace por encima de los dos | U2 |
| Paleta | los tokens de `system.md`, afinados en U7 | U7 |

## Compatibilidad

- El mismo nombre de archivo y los mismos campos `page.*`; un embebido de hoy recibe la interfaz nueva.
- El SVG estático (`render`) y los dibujos de `examples/out/` quedan idénticos byte a byte: los
  tokens y los colores solo de la página son CSS de la página.
- Resultados, corriente y controles siguen la regla de predicción: solo existen cuando el circuito
  los pide.
- Sin JavaScript la página sigue mostrando la primera vista con etiquetas.

## Lo que se deja por fuera a propósito

- Las fuentes web y el brillo de las trazas del archivo de Stitch (sin red; sin filtros CSS).
- Librerías o frameworks de interfaz: en ejecución no hay dependencias; los controles son HTML
  nativo (`button`, `input type=range`, `dialog`/popover donde se pueda) con el comportamiento
  escrito una vez.
- Redibujar la protoboard (el tema `study` es otro punto de la hoja de ruta), el multímetro
  virtual y el modo predicción (etapa 4).

## Verificación

- `npm test` (pruebas jsdom de la página) y `npm run examples` sin observaciones nuevas.
- `ux-shots` en los cinco tamaños, comparado con el juego anterior.
- Las revisiones de los skills: `interface-design` (pruebas de entrecerrar los ojos, de cambio, de
  firma y de tokens; el estándar de aprobación de `design-review`), `review-animations` para U5,
  `mobile-native` dice qué necesita un celular de verdad.
- El mantenedor en el celular, el iPad y dentro de Trilium (U7).
