# Simulación en vivo (etapa 3): diseño y plan

*[English](../en/live-simulation.md)* · Hoja de ruta: [hoja-de-ruta.md](hoja-de-ruta.md), etapa 3

La página para embeber (`out/<nombre>.html`) tendrá una simulación real que corre en el
navegador, al estilo de CircuitJS de Falstad:
- tiempo continuo, con los condensadores cargándose a la vista;
- deslizadores que vuelven a resolver al instante;
- la corriente como puntos que se mueven por los conductores reales y el voltaje (tensión) como color;
- componentes que avisan cuando se pasan de sus límites.

Sigue siendo el mismo archivo con el mismo nombre, sin compilación y sin red: funciona dentro de un iframe o de una vista web de un wiki, en el celular.

Esta página es la referencia del trabajo, que toma varias sesiones. Cada sesión termina con las pruebas en verde y con esta página y la hoja de ruta al día.

## Estado

- Fases 0 y 1 hechas (`ff4070f`): archivo *golden*, vista de conductores por los caminos reales,
  corriente convencional, velocidad proporcional, paleta de los rieles con degradado empinado
  dentro de los cuerpos.
- Fase 2 hecha: `src/sim/devices/`. Hoy un dispositivo tiene `build(part, h)` (los elementos y lo
  que necesita su lectura) en vez del par `params` + `elements` del esbozo de abajo; la fase 3 lo
  separa cuando introduzca el programa compilado (los parámetros tendrán que ser JSON plano).

## Decisiones

| Decisión | Por qué |
|---|---|
| **Solo corriente convencional**, de + a −, como Falstad. Se quita la vista de electrones | Una sola dirección que leer, la misma del simulador con el que se compara. Revierte la decisión del 2026-10-13. Los textos de las sondas conservan una nota breve: los electrones van al revés. |
| **Velocidad de los puntos proporcional** a la corriente, con escala automática según la corriente mayor, un deslizador de velocidad y un botón de escala logarítmica | La mitad de la corriente se ve a la mitad de velocidad: se ven las proporciones y Kirchhoff. El botón log sirve para circuitos con µA y A juntos. |
| **Vista de conductores** («rayos X»). La protoboard va velada y los componentes, tenues. Cada conductor es un camino continuo y grueso (tira → pata → cuerpo → pata → cable), con color según el voltaje y los puntos encima. Tocar un componente lo devuelve a opacidad completa | Lo que hay que ver es el camino de la corriente. Como se dibuja sobre una imagen velada, no hay que esconder nada detrás de los componentes. Se descartaron las líneas sobre el dibujo realista (los puntos se veían a través de los cuerpos) y los símbolos de esquema. |
| **Deslizadores** automáticos en la ficha de cada componente ajustable, más un panel con los que declare el circuito (`page.controls`) | Explorar queda libre, y una lección igual puede poner al frente los dos o tres que importan. |
| **Límites a la vista**. Cada dispositivo informa su *esfuerzo* (valor / límite) de corriente, potencia, voltaje y voltaje inverso. Los tres niveles son iguales para todos y la marca «se excedió» se queda | Uno de los objetivos de simular a este nivel es saber si un componente aguanta un voltaje antes de probarlo. |
| Sin bandera nueva: el motor se embebe cuando el circuito pide `page.results` o `page.flow` | Las dos ya son opcionales, así que nunca se muestra un valor pendiente de predicción. |
| El osciloscopio (V e I contra el tiempo) es el último ítem de la etapa | Sirve para RC, rectificadores y luego el 555, pero lo demás no lo necesita. |

## Cómo se ve

- La protoboard va velada y los componentes, a un 25 % de opacidad.
- Cada conductor es un camino grueso: la tira metálica entre los agujeros en uso, sube por una pata, atraviesa el cuerpo, baja por la otra pata y sigue el arco del cable.
- **Color = voltaje**, en una escala fija hasta el voltaje mayor de las fuentes: rojo (+) → gris (0) → azul (−).
  - Coincide con los rieles y se lee con daltonismo.
  - Se escogió sobre la verde/roja de Falstad el 2026-10-14.
  - Dentro de un cuerpo el color cambia siguiendo una curva en S empinada: la caída se ve en el centro del componente que la produce, sin dejar de ser degradado.
- **Los puntos** se mueven por los caminos en la dirección de la corriente convencional.
- **Los LED brillan** según su corriente. Resistencias, reguladores y transistores toman un **tinte de calor** según potencia / potencia máxima.
- **Esfuerzo**, igual para todos los componentes:

  | Nivel | Esfuerzo | Se ve |
  |---|---|---|
  | bien | < 80 % | nada |
  | cerca del límite | 80–100 % | contorno ámbar |
  | excedido | > 100 % | contorno rojo pulsante, insignia ⚠, aviso con el valor y el límite («LED1: 38 mA, máximo 30 mA») |

  Cuando se excede, el componente queda marcado «se excedió» hasta que se reinicie la simulación, aunque el deslizador vuelva o el pico haya sido breve. Un panel de avisos los lista, y tocar uno enfoca el componente.

## Arquitectura

### Módulos de dispositivo: un archivo por tipo de componente

Hoy lo que el simulador sabe de un tipo de componente está repartido en siete lugares:
- `prepare()`, `partReading()`, `pinCurrents()` y `limitIssues()` en `sim/index.js`;
- `partLines` en `sim/format.js`;
- `sim/overlay.js`;
- las sondas de `page.js`.

Todo eso pasa a **un módulo por tipo de componente** en `src/sim/devices/`. La clave es el tipo de componente, no `electrical.kind`, porque `'R'` abarca resistencia, termistor, fotorresistencia y zumbador, y cada uno necesita controles distintos.

```js
// src/sim/devices/ldr.js
export const ldr = {
  types: ['ldr'], kind: 'R',                       // las lecturas conservan kind 'R' y su objeto sensor
  params: (part) => ({ model, light, maxPower }),  // compilar (Node): componente resuelto → datos JSON
  controls: { light: { min: 0, max: 10000, scale: 'log', unit: 'lx' } },
  elements: (p, { pin }) => ({ main: resistor(pin(0), pin(1), ldrResistance(p.model, p.light)) }),
  read, limits, lines,                              // pinCurrents, tag y probe: opcionales, con valor por defecto
};
```

`limits` devuelve esfuerzos `{ quantity, value, max, ratio, code }`. Los avisos de hoy se arman a partir de ellos, así que no cambian.

**Agregar un tipo de componente** lleva esto, y no queda ningún `switch` en otra parte:
- su tipo en `parts/types/`;
- un archivo en `devices/` y una línea en `devices/index.js`;
- `paths` en su paquete, si se quiere;
- sus claves i18n;
- una prueba contra una referencia independiente.

Las fórmulas que necesitan los deslizadores viven en módulos sin imports y `parts/types/more.js` las importa de ahí:
- `src/parts/sensors.js`: fotorresistencia y NTC;
- `src/parts/batteries.js`, que ya cumple.

### Compilar (Node) y motor (navegador y Node)

- **`src/sim/compile.js`** (solo Node). Pasa el circuito a un **programa** en JSON plano con:
  - nodos;
  - dispositivos (`type`, `pins`, `params`);
  - controles;
  - las tomas de cada tira, para Kirchhoff;
  - el orden de los segmentos animados.
- **`src/sim/engine.js`** (sin dependencias). Recibe el programa y da un motor con `dc()`, `step(h)`, `set(device, field, value)`, `read()`, `issues()` y `timeConstants()`.
  - Lo usan `simulate()`, la CLI y el MCP. Su salida no cambia.
- **`mna.js`** conserva su API; el `Stamper` reutiliza sus búferes.
  - Sin reutilizar la LU ni estampar por partes, porque son de 10 a 40 incógnitas. Una prueba de rendimiento decide si eso cambia.
- **Si un paso falla**, se divide `h` hasta cuatro veces. Si sigue fallando, la página se pausa con un mensaje.

### Un agrupador pequeño (`src/node/bundle.js`)

- Envuelve cada módulo permitido en una función y reescribe los imports con nombre relativos.
- La gramática es restringida y lanza un error ante cualquier otra cosa: solo exportaciones con nombre, sin `export default`, sin `export *`, sin ciclos.
- **Módulos permitidos**:
  - `sim/{engine,mna,models}.js`;
  - `sim/devices/**`;
  - `parts/{batteries,sensors}.js`;
  - `core/units.js`;
  - `page/client/**`.

  Un import fuera de la lista lanza error: así el motor queda libre de geometría y de i18n.
- Se descartaron los scripts de módulo con URL `data:` y los *import maps*: los CSP estrictos de iframes y vistas web los bloquean, y jsdom no los ejecuta.

El script de la página pasa de una cadena larga (`page/script.js`) a módulos reales que se pueden probar, en `src/page/client/`: `main`, `view`, `focus`, `card`, `live`, `paint`, `controls` y `scope`. La página conserva **un solo `<script>` sin atributos**, al final; los scripts JSON van antes.

### Caminos reales (`src/sim/paths.js`, reemplaza a `flow.js`)

- **`paths` en los paquetes.** Un paquete puede devolver `paths` desde `build()`: por pata, una polilínea 3D desde el agujero (z = 0) hasta un centro común a todas las patas, con el índice donde empieza el cuerpo.
  - Primero `axial`, `wire` (la línea central del tubo, que ya calcula), `led`, `battery` y `to92`; los demás a medida que se toquen.
  - Sin `paths`: del agujero al centro, como hoy.
- **Lo que produce `paths.js`.**
  - Piezas de puntos: una por pata y una por tramo de tira entre agujeros.
  - Piezas de color: la tira con el voltaje de su nodo, la pata con el de su pin y el cuerpo en tres tramos.
  - `addLayers` las proyecta en cada vista a una capa `live`, con una operación de dibujo `path` nueva. Agrega además una envolvente por cuerpo para el brillo y el calor.
- **Las imágenes estáticas** usan las mismas piezas con la solución DC (`render --flow`): puntos quietos y colores.

### El bucle de cuadros (`client/live.js`)

- **Avance del tiempo.** Cada cuadro avanza el tiempo simulado según la velocidad, en pasos fijos `h`, con un máximo de 8 ms de trabajo; si se atrasa, pasa a cámara lenta.
  - Velocidad por defecto: la constante de tiempo más larga cada 2 s. Las constantes salen de la matriz linealizada: τ = C·R_Thévenin y L/R.
  - Se calcula al cargar y al reiniciar, no con cada deslizador: si R crece 100×, se tiene que ver 100× más lento.
- **Puntos.** Son trazos SVG; el script escribe `stroke-dashoffset` a partir de una fase acumulada, como el `curcount` de Falstad.
  - La velocidad cambia sin saltos y el zoom sale del `viewBox`.
  - Velocidad ∝ I / pico, con el pico suavizado. Solo se anima la vista visible.
- **Colores, brillo, calor, etiquetas y ficha** se refrescan a 4 Hz, para que se puedan leer.
- **Reproducir, pausar, reiniciar y velocidad** solo aparecen si el circuito tiene un condensador o una bobina.
  - Reiniciar es «encender en t = 0», con los condensadores descargados.
  - El arranque es `page.start` (por defecto `'dc'`, con los valores de hoy).
- **Carga.** El DC se resuelve de inmediato al cargar, sin esperar.
- **Sin `requestAnimationFrame`** (jsdom) no se programa nada; las pruebas mueven los cuadros con `window.protoboardTest.tick(ms)`.
- **Con «reducir movimiento»** se actualizan los colores y los puntos quedan quietos.

### Controles

- **En la ficha**, según los `controls` del dispositivo:
  - resistencia: valor (log);
  - potenciómetro: posición;
  - fuente: voltaje;
  - batería: carga;
  - luz (log);
  - temperatura.
- **El pulsador** es momentáneo: conduce mientras se mantiene presionado, sobre el componente o con un botón en la ficha.
- **El panel** sale de `page.controls: [{ part | supply, field, min, max, scale, label }]`. Lo revisa `check` y queda descrito en el esquema.
- **`engine.set()`** actualiza los parámetros y rearma el sistema.
  - Conserva el estado por clave: voltajes de nodo por nombre, memoria de condensadores y bobinas, voltajes de juntura por elemento.
  - Recalcula las islas flotantes.
  - Un circuito estático vuelve a resolver el DC al instante; uno que corre sigue avanzando.

## Fases y sesiones

| Sesión | Fase | Entrega |
|---|---|---|
| 1 | 0 · Red de seguridad | `scripts/golden.js` → `test/fixtures/sim-golden.json`; `test/golden.test.js` (tolerancia relativa 1e-12): DC de todos los ejemplos y circuitos de prueba, transitorios RC y RL, texto en en y es |
| 1 | 1 · Caminos reales | `paths` en los paquetes, `sim/paths.js`, operación `path`, `render --flow` por los caminos reales con velocidad proporcional y color; sin vista de electrones; maquetas de la vista de conductores; paleta escogida: la de los rieles |
| 2 | 2 · Módulos de dispositivo | `src/sim/devices/*`, `parts/sensors.js`, esfuerzos en la interfaz; sin cambio visible |
| 3 | 3 · Compilar / motor | `compile.js`, `engine.js`, `node/bundle.js`, `page/client/*` (reemplaza `page/script.js`); sin cambio visible |
| 4 | 4 · Página en vivo | motor y programa embebidos, bucle de cuadros, puntos, color de voltaje, brillo, calor, controles de tiempo, etiquetas en vivo |
| 5 | 5 · Controles y límites | deslizadores en la ficha, `page.controls`, pulsador momentáneo, niveles de esfuerzo, marca que se queda, panel de avisos; `stress` por componente en `simulate` (campo nuevo) |
| 6 | 6 · Comparación con Falstad | `test/falstad/*.txt`: lo exportado de CircuitJS y los valores leídos allí, con modelos igualados (RC, divisor, LED + R, interruptor con BJT) |
| 6 | 7 · Osciloscopio | búfer circular de V e I del componente tocado, dibujado como polilínea en un panel |

En cada fase:
- documentación en inglés y en español;
- la hoja de ruta marcada en los dos idiomas;
- el registro de decisiones en `PLANNING.md`;
- los textos nuevos con `t()` en todos los archivos de `src/i18n`;
- el mapa del código al día.

## Compatibilidad

- `simulate()` y el JSON del MCP mantienen su forma; la prueba *golden* lo vigila.
- `render --sim` no cambia. `render --flow` se dibuja por los caminos reales.
- Las páginas con `results` muestran los mismos números DC al cargar, ahora en vivo.
- Las páginas con `flow` pierden el botón de electrones.
- Los circuitos sin `page` no crecen.

## Lo que se deja fuera a propósito

- Reutilizar la LU y estampar por partes, mientras pase la prueba de rendimiento.
- Un dibujo en canvas.
- Una bandera `live` aparte.
- Degradados de color continuos a lo largo de los cuerpos.
- Una vista de esquema.

## Verificación

- **`npm test` en cada fase.**
  - `test/sim.test.js` y `test/sources.test.js` no se tocan y siguen en verde.
  - La prueba *golden* da idéntico tras las fases 2 y 3.
- **Agrupador.**
  - Prueba de gramática sobre los módulos permitidos.
  - El paquete del motor en `node:vm`, sin globales, da las mismas lecturas DC que `simulate()` en todos los ejemplos.
  - El paquete de la página corre en jsdom.
- **Rendimiento**: una escalera RC/diodo de 40 nodos corre al menos 2000 pasos/s en Node.
- **Página (jsdom).**
  - Las fases de los puntos avanzan en proporción a la corriente.
  - RC: tras unos cuadros, V_C ≈ V(1 − e^(−t/τ)).
  - Pausar congela y reiniciar vuelve a cero.
  - Cada deslizador cambia el resultado como dice su fórmula pura.
  - Subir la fuente de un LED + R por encima de la corriente máxima del LED lo marca como excedido; al bajarla, la marca se queda hasta reiniciar.
- **Esfuerzo**: cada cociente se calcula aparte (P = V²/R contra la potencia nominal…) y se compara.
- **Caminos.**
  - Kirchhoff se cumple en las piezas nuevas.
  - Cada camino empieza en su agujero a z = 0 y termina en el centro común.
  - Sin NaN en ninguna vista.
