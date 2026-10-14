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

## Pruebas

`npm test`. Agrega una prueba para todo lo que tenga una respuesta correcta: código de
colores, tamaños, reglas de las patas. Todos los ejemplos deben dibujarse desde los dos
lados sin `NaN`.

## Agentes

El agente `parts-librarian` (`.claude/agents/parts-librarian.md`) sigue esta página. Si
cambias aquí el orden de trabajo o las comprobaciones, actualiza también ese agente.
