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
- Fase 2 hecha (`af639b0`): `src/sim/devices/`; islas flotantes ancladas en DC.
- Fase 3 hecha: `compile.js` → programa → `engine.js`; los dispositivos tienen `params` (JSON) y
  `elements`; `node/bundle.js`; el script de la página en `page/client/` (main, view, focus,
  card, tooltip). El motor agrupado pesa ≈ 50 kB sin comentarios; el script de la página, ≈ 12 kB.
  Una escalera RC/diodo de 40 secciones corre ≈ 12 000 pasos/s en Node (`test/engine.test.js`).
- Fase 4 hecha: `page/client/live.js` corre el programa embebido (entrada `live-page.js`; las
  páginas sin resultados ni corriente usan `static-page.js` y no llevan motor). Interfaz del
  motor paso a paso: `start`, `step`, `read`, `stresses`, `timeConstants`. Lo visual compartido en
  `sim/look.js` y las líneas de la ficha en `sim/lines.js` (los dos se pueden agrupar). Pruebas en
  `test/live.test.js` (jsdom, cuadros movidos con `window.protoboardLive.tick`).
- Fase 5 hecha: controles y límites. Cada dispositivo puede tener `controls(p)` y un `set(p, field,
  value)` puro; los controles de las fuentes (voltaje de la fuente de banco, carga de la batería) y
  las cuentas de los deslizadores (log, E24, niveles de esfuerzo) en `sim/controls.js` (se puede
  agrupar). `engine.controls()` y `engine.set()`. Página: `page/client/controls.js` (deslizadores
  en la ficha, panel `page.controls`, pulsador momentáneo) y `page/client/limits.js` (contornos,
  marcas que se quedan, panel de avisos); `stress` por componente en la respuesta DC de
  `simulate`; `check` revisa `page.controls`. Pruebas en `test/sliders.test.js`.
- Fase 6 hecha: [falstad.md](falstad.md). `sim/falstad.js` exporta el programa al formato de
  texto de CircuitJS, dibujado como esquema (`sim/falstad-layout.js`); cada dispositivo tiene
  `falstad(d, f)`; botón *Abrir en Falstad* en la página en vivo, con el estado de ese momento
  (`engine.program()`) y **⚠ n** con los equivalentes. Comparación: 7 casos en
  `test/falstad/cases/`, referencias en `test/falstad/refs/`, `scripts/falstad.js`; 5 coinciden
  dentro de 1 µV, el MOSFET (sin λ en Falstad) y el Zener (otra rodilla) con su tolerancia.
- Fase 7 hecha: el osciloscopio en la ficha del componente tocado.
  - `sim/recorder.js`: búfer circular por componente, grabado desde el arranque.
  - `sim/scope.js`: qué grafica cada tipo, con el gancho `scope` del dispositivo.
  - `page/client/scope.js`: el dibujo, reutilizable para una lista de trazas.
  - La ventana muestra desde t = 0 hasta 10 constantes de tiempo y solo después avanza; sin C ni L,
    el reloj de pared (10 a 20 s).
  - Solo donde la ficha muestra resultados. Pruebas en `test/scope.test.js`.
  - Los valores por debajo de 1e-15 se escriben como 0: es redondeo del simulador.
- Fase 8 hecha: el generador de señales.
  - `sim/generator.js`: las ondas de Falstad (seno, cuadrada, triangular).
  - Una fuente `kind: "generator"`, que el motor pone en su valor en cada paso (en el transitorio y
    en vivo) y que da `engine.periods()`.
  - Deslizadores de frecuencia y amplitud.
  - La página corre a un período por segundo, con al menos 100 pasos por período y una ventana de
    4 períodos.
  - Falstad: la misma fuente. En el modo exacto va adelantada un paso, porque Falstad usa la fuente
    al empezar cada paso y el kit al terminarlo.
  - Comparación con transitorios: `rc-square` (5 nV) y `rectifier-half-wave` (1 mV, la tolerancia
    de Newton en el diodo).
  - Pruebas en `test/generator.test.js`.
- Fase 9 hecha: las sondas en los nodos.
  - Un toque que no cae en un componente busca una tira en uso debajo (`stripAt` en
    `page/client/view.js`): la página lleva, por vista, los agujeros de cada tira en uso en la
    pantalla (`hits`, `strips`), y un toque a menos de 0,7 de la separación entre agujeros cae en
    esa tira. Las tiras quedan debajo de los componentes, así que un componente gana donde está
    dibujado; cada pata en la ficha de un componente abre su tira, y cada pata en la ficha de una
    tira, su componente.
  - La ficha de la tira (`selectNode` en `page/client/card.js`; `page.open` es `node:<grupo>`): qué
    es una tira o un riel, qué está conectado y dónde; los componentes conectados pasan al frente
    con esa tira sola, y las coordenadas de los agujeros en uso.
  - Con resultados: su voltaje respecto a tierra, con las puntas de su etiqueta de voltaje
    dibujadas (roja en la tira, negra en tierra); la corriente de cada pata que entra o sale de la
    tira (`nodeLines` en `sim/lines.js`), para leer la ley de corrientes de Kirchhoff línea por
    línea; su osciloscopio con una traza, grabado desde el arranque como el de los componentes
    (clave `node:<grupo>`).
  - Sin resultados: sin valores y sin grabar nada (la regla de predicción).
  - Pruebas en `test/node-card.test.js`.
- Siguiente: la pasada de experiencia de uso de la página (hoja de ruta) y luego la etapa 4.

## Decisiones

| Decisión | Por qué |
|---|---|
| **Solo corriente convencional**, de + a −, como Falstad. Se quita la vista de electrones | Una sola dirección que leer, la misma del simulador con el que se compara. Revierte la decisión del 2026-10-13. Los textos de las sondas conservan una nota breve: los electrones van al revés. |
| **Velocidad de los puntos proporcional** a la corriente, con escala automática según la corriente mayor, un deslizador de velocidad y un botón de escala logarítmica | La mitad de la corriente se ve a la mitad de velocidad: se ven las proporciones y Kirchhoff. El botón log sirve para circuitos con µA y A juntos. |
| **Vista de conductores** («rayos X»). La protoboard va velada y los componentes, tenues. Cada conductor es un camino continuo y grueso (tira → pata → cuerpo → pata → cable), con color según el voltaje y los puntos encima. Tocar un componente lo devuelve a opacidad completa | Lo que hay que ver es el camino de la corriente. Como se dibuja sobre una imagen velada, no hay que esconder nada detrás de los componentes. Se descartaron las líneas sobre el dibujo realista (los puntos se veían a través de los cuerpos) y los símbolos de esquema. |
| **Deslizadores** automáticos en la ficha de cada componente ajustable, más un panel con los que declare el circuito (`page.controls`) | Explorar queda libre, y una lección igual puede poner al frente los dos o tres que importan. |
| **Límites a la vista**. Cada dispositivo informa su *esfuerzo* (valor / límite) de corriente, potencia, voltaje y voltaje inverso. Los tres niveles son iguales para todos y la marca «se excedió» se queda | Uno de los objetivos de simular a este nivel es saber si un componente aguanta un voltaje antes de probarlo. |
| Sin bandera nueva: el motor se embebe cuando el circuito pide `page.results` o `page.flow` | Las dos ya son opcionales, así que nunca se muestra un valor pendiente de predicción. |
| El osciloscopio (V e I contra el tiempo) va al final de la etapa, con el generador de señales y las sondas (fases 7 a 9) | Sirve para RC, rectificadores y luego el 555, pero lo demás no lo necesita. |

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
  - Velocidad ∝ I / pico, donde el pico es la corriente mayor desde el arranque (no baja solo, así una corriente que se apaga se ve frenando). Solo se anima la vista visible.
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

Como quedó (fase 5):

| Control | Componente o fuente | Deslizador | Notas |
|---|---|---|---|
| `resistance` | resistencia | log, dos décadas a cada lado del valor del archivo, se detiene en valores E24 | el rango se queda alrededor del valor del archivo (`nominal`) |
| `temperature` | termistor NTC | −20…100 °C, de a 1 °C | `ntcResistance` |
| `light` | fotorresistencia | 0,1…10 000 lx, log | `ldrResistance` |
| `position` | potenciómetro, trimmer | 0…100 % | |
| `pressed` | pulsador | momentáneo | se mantiene en el dibujo o con *Mantén presionado*; *Dejar presionado* lo deja así hasta volver a tocarlo |
| `on` | interruptor (KCD1, enclavamiento 7 × 7) | alternar (`toggle`) | *Encender* / *Apagar*; se queda como se deja |
| `voltage` | fuente de banco | 0…30 V, de a 0,1 V | |
| `charge` | batería (componente o fuente) | 0…100 % | fem y resistencia interna con `batteryModel`; no hay si su voltaje se midió |

- `min`/`max` son solo el rango por defecto del deslizador; `limit` es lo que el valor puede ser
  (`page.controls` puede escoger un rango dentro; `check` avisa si no).
- El estado se empareja por componente y por el orden en que el componente agregó sus elementos
  (un pulsador presionado agrega su contacto después de sus polos); se copian `vprev`, `iprev`,
  `vd`, `vgs`, `vds`, `vbe`, `vbc`. Tras un cambio el sistema se resuelve con un paso muy corto (como
  en t = 0), así un circuito en pausa también muestra el cambio. El tiempo simulado conserva su
  rapidez (una R mayor se ve cargar más despacio), pero el paso se achica si las constantes de
  tiempo nuevas lo piden.
- Los límites se revisan en cada cuadro (no solo al repintar), así un pico breve también queda marcado.
- Los deslizadores esperan a que el dedo se detenga (`page/client/controls.js`): el valor mostrado
  sigue al dedo al instante, el circuito se resuelve tras 120 ms quieto, al menos cada 300 ms en un
  arrastre largo, y al instante al soltar. El primer toque se resuelve al instante.

## Fases 7 a 9: osciloscopio, generador de señales y sondas (plan del 2026-10-15)

Para la próxima sesión. Decisiones de Cris:

| Decisión | Por qué |
|---|---|
| El osciloscopio va **en la ficha del componente seleccionado**. Al cerrar la ficha se va la gráfica | La gráfica explica ese componente, al lado de sus valores y su descripción. |
| **Sin canales fijados por ahora** (un panel con dos canales, como el ZT-703S, queda para cuando una lección lo necesite), pero el código se escribe reutilizable: la gráfica recibe una lista de trazas | No cargar la página con algo que todavía no se usa, sin cerrarle el camino. |
| **Generador de señales** como fuente (fase 8) | Sin él, el osciloscopio solo muestra encendidos y cambios; con él se ven el rizado de un rectificador, un filtro RC con onda cuadrada y, después, el 555. Es lo que trae el ZT-703S del banco. |
| **Sondas en los nodos** (fase 9): tocar una tira muestra su voltaje respecto a tierra, con su osciloscopio | Así se usa el osciloscopio real: mide voltaje contra la tierra común; la corriente no se mide directamente. |

### Fase 7: osciloscopio en la ficha

- **Grabación desde el arranque** (`sim/recorder.js`, se puede agrupar, sin DOM): en cada cuadro
  guarda, para cada componente, el tiempo y su par (voltaje, corriente) en un búfer circular
  (`Float64Array`, unas 2048 muestras). Al tocar un componente ya está su historia: un
  condensador que terminó de cargarse muestra la curva completa. *Encender (t = 0)* la borra.
- **Qué se grafica**: un gancho nuevo en los módulos de dispositivo, `scope(reading)` →
  `{ v: { key, value }, i: { key, value } }`.
  - Por defecto, dos patas: el voltaje (tensión) entre ellas y la corriente.
  - Transistor: Vce e Ic; MOSFET: Vds e Id; batería: voltaje en bornes y corriente que entrega;
    potenciómetro: voltaje del cursor e I(W).
  - El mismo gancho sirve después para las sondas (un nodo: solo voltaje).
- **Dibujo** (`page/client/scope.js`, `createScope(box, { traces, t, f })`): un SVG en la ficha con
  dos gráficas apiladas y el mismo eje de tiempo, nunca un eje doble.
  - Arriba el voltaje, abajo la corriente.
  - Cuadrícula de pantalla de osciloscopio, escala automática por traza con sus unidades
    (`formatValue`), marca de «ahora», eje de tiempo con unidades y el rótulo *modelo*.
  - Recibe una lista de trazas: así sirve para el panel de dos canales futuro y para las sondas.
  - Se redibuja con el refresco de la página (4 veces por segundo), sin filtros CSS. Al dibujar,
    se queda con el mínimo y el máximo de cada columna de píxeles, para no perder picos.
- **Tiempo**:
  - Circuitos con C o L: tiempo simulado. La pantalla muestra desde t = 0: primero 5 constantes de
    tiempo, luego se estira con el tiempo hasta 10 y solo entonces avanza, para que la carga entera
    de un condensador quede a la vista.
  - Sin C ni L: tiempo real, así el salto del pulsador y de los deslizadores se ve al instante.
  - *Pausa* congela la gráfica.
- **Regla de predicción**: igual que los resultados. Solo en la página en vivo y solo para el
  componente tocado.
- **Pruebas**:
  - La grabación coincide con `engine.transient` en los mismos instantes (RC: 63,2 % en τ).
  - En jsdom: abrir la ficha muestra las dos trazas, cerrarla las quita, reiniciar borra.
  - Los textos van en inglés y en español.

### Fase 8: generador de señales

- Una fuente nueva en `supplies`:
  `{ "kind": "generator", "waveform": "sine" | "square" | "triangle", "frequency", "amplitude", "offset", "resistance" }`.
  `resistance` es la resistencia de salida; la del ZT-703S está por confirmar en el banco.
  Se dibujará al lado de la protoboard junto con la fuente de banco (ítem pendiente de la hoja de
  ruta).
- **Motor**: una fuente que depende del tiempo. En DC vale su valor en t = 0.
  - El paso de tiempo y el reloj de la página también dependen del período (al menos 50 pasos por
    período), no solo de las constantes de tiempo.
  - Deslizadores de frecuencia y amplitud.
- **Falstad**: la fuente `v` con su forma de onda, sin equivalente.
- **Casos**:
  - un rectificador de media onda con condensador (rizado);
  - un RC con onda cuadrada.

  Con ellos entran los casos con transitorio a la comparación con Falstad.

### Fase 9: sondas en los nodos

- Tocar una tira (un grupo) abre la ficha del nodo: su voltaje respecto a tierra y su osciloscopio
  con una traza. Reutiliza la grabación (los voltajes de los nodos ya están en la lectura) y
  `createScope`.
- Se diseña junto con lo que la etapa 4 tiene pendiente: el multímetro virtual y que tocar una
  tira resalte lo que está conectado.
- ✅ Hecha (ver el estado arriba). Resaltar lo conectado vino con ella; el multímetro virtual
  (puntas en dos agujeros cualesquiera) sigue en la etapa 4.

## Fases y sesiones

| Sesión | Fase | Entrega |
|---|---|---|
| 1 | 0 · Red de seguridad | `scripts/golden.js` → `test/fixtures/sim-golden.json`; `test/golden.test.js` (tolerancia relativa 1e-12): DC de todos los ejemplos y circuitos de prueba, transitorios RC y RL, texto en en y es |
| 1 | 1 · Caminos reales | `paths` en los paquetes, `sim/paths.js`, operación `path`, `render --flow` por los caminos reales con velocidad proporcional y color; sin vista de electrones; maquetas de la vista de conductores; paleta escogida: la de los rieles |
| 2 | 2 · Módulos de dispositivo | `src/sim/devices/*`, `parts/sensors.js`, esfuerzos en la interfaz; sin cambio visible |
| 3 | 3 · Compilar / motor | `compile.js`, `engine.js`, `node/bundle.js`, `page/client/*` (reemplaza `page/script.js`); sin cambio visible |
| 4 | 4 · Página en vivo | motor y programa embebidos, bucle de cuadros, puntos, color de voltaje, brillo, calor, controles de tiempo, etiquetas en vivo |
| 5 | 5 · Controles y límites | deslizadores en la ficha, `page.controls`, pulsador momentáneo, niveles de esfuerzo, marca que se queda, panel de avisos; `stress` por componente en `simulate` (campo nuevo) |
| 6 | 6 · Comparación con Falstad | ✅ exportador (`sim/falstad.js`), botón *Abrir en Falstad*, casos y referencias en `test/falstad/` con modelos igualados (divisor, LED + R, BJT activo, Darlington y pulsador, puente, MOSFET, potenciómetro y Zener) |
| 7 | 7 · Osciloscopio | ✅ en la ficha del componente tocado: grabación desde el arranque (`sim/recorder.js`), gancho `scope` por dispositivo (`sim/scope.js`), `page/client/scope.js` (dos gráficas apiladas, V e I, reutilizable) |
| 8 | 8 · Generador de señales | ✅ fuente `generator` (seno, cuadrada, triangular) en el motor, la página, los deslizadores y Falstad; transitorios en la comparación (`rc-square`, `rectifier-half-wave`) |
| 9 | 9 · Sondas en los nodos | ✅ la ficha de una tira al tocarla (o desde una pata en la ficha de un componente): qué está conectado, su voltaje respecto a tierra con las puntas, la corriente de cada pata (Kirchhoff) y su osciloscopio (`stripAt`, `selectNode`, `nodeLines`) |

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
