# Arquitectura

*[English](../en/architecture.md)*

## El recorrido

```
circuit.json ──▶ tipos ──▶ encapsulados ──▶ primitivas ──▶ cámara + pintor ──▶ SVG
                   │                              ▲
                   └──▶ agujeros de la protoboard ──▶ netlist ──▶ comprobaciones
```

| Capa | Carpeta | Sabe de | No sabe de |
|---|---|---|---|
| Archivo de circuito | `examples/` | qué componente va en qué agujero | geometría |
| Tipos | `src/parts/types/` | qué *es* el componente: valor → bandas, capacitancia → tamaño de la lata, nombres de las patas, modelo eléctrico | cómo se dibuja |
| Encapsulados | `src/parts/packages/` | la forma física: tamaño del cuerpo, reglas de las patas, cómo armarlo con primitivas | valores, electricidad |
| Primitivas | `src/geometry/` | prismas, tornos (superficies de revolución), tubos, marcas y textos sobre caras | componentes |
| Protoboard | `src/board/` | dónde está cada agujero y cuáles están conectados | componentes |
| Comprobaciones | `src/circuit/checks.js` | geometría y conexiones de lo que está colocado | el dibujo |
| Dibujo | `src/core/camera.js`, `src/render/` | proyección, sombreado, orden de pintado, SVG | componentes, electricidad |
| Mensajes | `src/i18n/` | cada frase que ve el usuario | la lógica |

La separación entre **tipo** y **encapsulado** es lo que permite reutilizar: un diodo
1N4007 y una resistencia comparten el encapsulado axial; un MOSFET IRLZ44N y un transistor
TIP120 comparten el TO-220. Un componente nuevo suele ser una línea en `src/parts/db.js`.

## El espacio del mundo

Milímetros, sistema dextrógiro: **x** a lo largo de las columnas (de la 1 a la 63),
**y** hacia el fondo de la protoboard (los rieles de arriba), **z** hacia arriba. La
superficie de la protoboard es `z = 0`. Separación entre agujeros: 2,54 mm.

Cada encapsulado se arma a partir de las posiciones de sus agujeros, así que la
orientación sale de los agujeros: una resistencia de `c10` a `c14` queda a lo largo de x;
una de `a10` a `e10`, a lo largo de y. Ningún encapsulado depende de la cámara.

## Cámara y vistas

`createCamera({ view })` devuelve una proyección ortográfica. Con la elevación por defecto
(35,264°) es una vista isométrica exacta. Vistas con nombre: `front` (desde la esquina
delantera derecha), `back` (la esquina opuesta), `front-left`, `back-right`, o cualquier
`azimuth` en grados.

Como la geometría está en 3D y la proyección es lineal, la vista trasera no cuesta nada
extra. El texto impreso en la protoboard o en los componentes se coloca sobre su plano 3D
con una `matrix` de SVG, así que gira con la vista igual que la impresión real.

## Dibujo: el algoritmo del pintor

1. Primero se pinta la protoboard (está debajo de todo).
2. Las demás primitivas (un cuerpo, cada tramo de una pata o de un cable) se ordenan por la
   profundidad de su centro y se pintan de la más lejana a la más cercana.
3. Dentro de una primitiva se descartan las caras que miran hacia atrás y las demás se
   pintan de lejos a cerca; luego sus calcomanías (marcas y textos).

Las primitivas se mantienen convexas, o casi, para que esto funcione. Si dos piezas de un
mismo componente se ordenan mal, se parten (ver la aleta del TO-220 en `to220.js`).

Sombreado: cada cara toma un tono según su normal y una luz fija respecto a la cámara
(`src/render/shading.js`), así que las dos vistas se iluminan igual.

## Etiquetas

Las etiquetas son globos en filas por encima del componente más alto (`src/render/scene.js`).
Las líneas guía son verticales siempre que la caja pueda quedar justo encima de su componente
sin tapar otra línea; las demás son inclinadas y se colocan después, en la fila con menos
cruces. Las etiquetas impresas de los rieles quedan libres. `inspect` mide el resultado
(superposiciones, cruces, líneas sobre componentes) y las pruebas lo mantienen en cero cruces.

## Conexiones

`createBoard()` le da a cada agujero un nombre de nodo: `12:a-e` (columna 12, filas a–e),
`T+` (el riel + de arriba). La netlist es solo «qué patas comparten nodo». La usan las
comprobaciones y, más adelante, el simulador; el dibujo no.

## Salida

Un SVG autónomo: colores fijos, `width` y `height` explícitos, fondo blanco, sin variables
CSS ni scripts. Se puede pegar como imagen en documentos, wikis y presentaciones.

## Lo que viene

- `src/sim/` (etapa 2, hecha): análisis nodal modificado sobre la netlist y la descripción
  `electrical` de cada componente; ver [simulacion.md](simulacion.md) y `src/sim/README.md`.
- Animación: la misma escena, redibujada en el navegador con los resultados de la
  simulación (electrones recorriendo patas y cables, voltaje (tensión) como color en las tiras).
