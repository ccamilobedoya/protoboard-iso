# Agregar un componente, un encapsulado o una protoboard

*[English](../en/adding-parts.md)*

Empieza por el cambio más pequeño que funcione.

## 1. Una referencia nueva (la mayoría de los casos)

Si el componente usa un encapsulado que ya existe, basta una línea en `src/parts/db.js`:

```js
LM7805: { type: 'regulator', package: 'TO-220', pins: ['IN', 'GND', 'OUT'], model: {} },
```

El orden de las patas sale de la hoja de datos (pata 1, 2, 3). Si el `type` es nuevo, ver
el paso 2.

## 2. Un tipo nuevo

Un tipo explica qué significa lo que dice el archivo de circuito. Crea
`src/parts/types/<tipo>.js`:

```js
export default {
  type: 'potentiometer',
  pins: ['1', 'W', '3'],
  resolve(part) {
    // Leer y validar los campos del archivo de circuito.
    // Si hay un problema: return { error: { code: 'BAD_VALUE', params: { value: … } } };
    return {
      package: 'trimmer',          // qué encapsulado lo dibuja
      params: { … },               // parámetros de dibujo para ese encapsulado
      label: { value: 10e3, unit: 'Ω' },
      electrical: { kind: 'POT', resistance: 10e3 },  // para el simulador
    };
  },
};
```

Regístralo en `src/parts/types/index.js`, agrega `type.<nombre>` en cada archivo de
`src/i18n/` y una fila en `docs/*/` (formato del circuito).

## 3. Un encapsulado nuevo

Un encapsulado es solo geometría. Crea `src/parts/packages/<id>.js`:

```js
export default {
  id: 'trimmer',
  pinCount: 3,
  span: (params) => ({ min, max }),    // distancia permitida entre el primer y el último agujero, mm
  // o inline: { count: 3, pitch: 1 } para patas rígidas en línea
  build({ pins, params }) {
    // pins: posiciones de los agujeros (mm del mundo, z = 0), en el orden de las patas
    return {
      primitives: [...],   // todo lo que se dibuja
      body: [...],         // lo que cuenta para detectar choques
      anchor,              // adónde apunta la etiqueta (arriba del componente)
      paths,               // opcional: por dónde pasa la corriente, uno por pata (vista de conductores)
    };
  },
};
```

Pautas:

- **Medidas reales** de la hoja de datos, en mm.
- **La orientación sale de los agujeros.** Usa `directionBetween(pins[0], pins.at(-1))` y
  construye en ese marco; nunca supongas que el componente va a lo largo de x.
- **Arma con primitivas** de `src/geometry/primitives.js`: `lathe` (torno) para lo
  redondo, `prism` / `box` para lo extruido, `tube` para las patas (`lead()` en
  `common.js`), calcomanías para marcas e impresión.
- **Los colores** salen de `src/parts/colors.js`. Los materiales nuevos van ahí.
- **Caminos de la corriente** (`paths`, opcional): por pata, `{ points, body }`, una polilínea 3D
  desde el agujero (z = 0) que sube por la pata hasta un punto dentro del componente, común a todas
  las patas; `body` es el índice del punto donde la pata entra al cuerpo. La vista de conductores
  dibuja la corriente por ahí (`src/sim/paths.js`); sin ellos usa rectas a ras de la protoboard.
  Reutiliza los puntos con los que ya armaste las patas.
- **Primitivas convexas.** Si dos piezas de un componente se pintan en mal orden, pártelas.
- Registra el encapsulado en `src/parts/packages/index.js`, agrégalo a
  `examples/parts-showcase.json`, dibuja las dos vistas y míralas.

## Ganchos de encapsulado para formas especiales

Además de `span` e `inline`, un encapsulado puede definir:

| Gancho | Para | Ejemplo |
|---|---|---|
| `validate(pos, part) → observaciones` | formas que las reglas generales no pueden revisar | el rectángulo del pulsador, las dos filas del DIP |
| `footprints(board, params) → [[agujero, …], …]` | todos los juegos de agujeros válidos, para que `suggest` pueda colocarlo | pulsador y DIP: todos los lugares a caballo del canal |
| `expandPin1(board, pin1, params) → [agujero, …]` | colocar con `pin1` en vez de listar todos los agujeros | chips DIP, pines de cabecera |

`build` también recibe `board` (`build({ pins, params, board })`): un componente que queda fuera
de la protoboard necesita saber dónde están sus bordes (`board.spec.size`). Así lo hace la
batería; sus piezas que quedan más allá del lado lejano de la protoboard pasan solas a la capa
`under` (ver `behindBoard` en `src/index.js`).

Y un tipo puede declarar `internal: [['1', '2'], ['3', '4']]`: patas unidas por dentro del
componente. Entonces el verificador deja que esas patas compartan tira, avisa cuando lo hacen
patas de grupos distintos (`SWITCH_BYPASSED` en los pulsadores) y no da por suelta una pata
cuya compañera está conectada.

## 4. Una protoboard nueva

Copia `src/board/boards/bb830.js`, cambia medidas, filas, tiras y rieles, y agrégala a
`BOARDS` en `src/board/board.js`. Las filas se dan en pasos de 2,54 mm desde el borde de
atrás. `split` es la última columna de la mitad izquierda si los rieles están cortados.

## 5. Simularlo: un dispositivo

Lo que el simulador sabe de un tipo de componente vive en **un archivo** en `src/sim/devices/`
(la interfaz está descrita al comienzo de `src/sim/devices/index.js`). Un dispositivo es un
objeto simple:

```js
// src/sim/devices/inductor.js
export const inductor = {
  types: ['inductor'],               // tipos de componente que maneja
  kind: 'L',                         // la clase de lectura
  params(part) {                     // al compilar, en Node: JSON plano a partir del componente resuelto
    const e = part.def.electrical;
    return { inductance: e.inductance, dcr: e.dcr, maxCurrent: e.maxCurrent };
  },
  elements(p, h) {                   // al correr (Node o la página): elementos MNA (src/sim/mna.js), por nombre
    const mid = h.inner();
    h.add(resistor(h.at(0), mid, Math.max(p.dcr, 1e-3)));
    return { main: h.add(inductorEl(mid, h.at(1), p.inductance)) };
  },
  read: (entry, h) => twoTerminal(entry, entry.main, h),          // sus valores
  limits: (entry, r) => [stress('SIM_OVER_CURRENT', 'current', Math.abs(r.current), entry.maxCurrent, 'A')],
  lines: twoTerminalLines,           // líneas de la ficha, cada una con su texto explain.*
  tag: currentTag,                   // la etiqueta de corriente sobre la protoboard
};
```

Los ganchos de lectura reciben la *entrada*: `{ id, kind, pins, ...params, ...elements }`.
`params` tiene que ser JSON plano (viaja a la página dentro del programa compilado, ver
`src/sim/compile.js`); `elements` y lo que sigue corren también en el navegador, así que solo
importan de `src/sim` y de módulos sin imports como `src/parts/sensors.js`.

Luego se agrega a `DEVICES` (`src/sim/devices/index.js`). Es todo: el simulador, la salida en
texto, las etiquetas de resultados, las sondas y la página lo encuentran ahí.

- **Los límites son esfuerzos**: `stress(code, quantity, value, max, unit)` es un valor frente al
  límite que no debe pasar. Por encima de 1 se vuelve el aviso `code`; la etapa 3 muestra el
  cociente en niveles (bien, cerca del límite, excedido). Lo que no es un límite va con `note(...)`.
- **Los valores típicos** van en `src/sim/models.js`, con su fuente; las fórmulas que necesitará
  un deslizador (sensores), en módulos sin imports como `src/parts/sensors.js`.
- Los dispositivos que comparten `kind` comparten sus ganchos de lectura (`lines`, `tag`,
  `probe`, `currentPins`); `test/devices.test.js` lo revisa.
- **Osciloscopio**: `scope(reading)` dice qué grafica el componente en su ficha (`{ v, i }`, cada uno
  `{ label, value }` o `null`). Sin él, uno de dos patas grafica el voltaje entre ellas y su corriente.
- **Falstad**: `falstad(d, f)` dice cómo va el componente a CircuitJS (el botón *Abrir en
  Falstad* y la comparación): la misma pieza, o un equivalente con su nota (`f.note`). Sin él,
  queda fuera con un aviso. Ver [falstad.md](falstad.md).
- **Una prueba contra una referencia independiente** (un punto de la hoja de datos o una
  fórmula resuelta aparte) en `test/sim.test.js` o `test/sources.test.js`. Nunca se ajusta un
  modelo para que un ejemplo se vea bien.
- Dale `paths` al encapsulado (sección 3) para que la vista de conductores siga sus patas.

## Pruebas

`npm test`. Agrega una prueba para todo lo que tenga una respuesta correcta: código de
colores, tamaños, reglas de las patas. Todos los ejemplos deben dibujarse desde los dos
lados sin `NaN`.

## Agentes

El agente `parts-librarian` (`.claude/agents/parts-librarian.md`) sigue esta página. Si
cambias aquí el orden de trabajo o las comprobaciones, actualiza también ese agente.
