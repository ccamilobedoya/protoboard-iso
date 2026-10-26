# Ejemplos

*[English](README.md)*

Archivos de circuito para leer, copiar y cambiar. Los que tienen una fuente (de banco, una batería
o una placa conectada por USB) también corren en la
[demostración en vivo](https://ccamilobedoya.github.io/protoboard-iso/es/).

```bash
node bin/protoboard-iso.js check examples/led-resistor.json --lang es     # qué está conectado y si hay problemas
node bin/protoboard-iso.js render examples/led-resistor.json -o led.svg --fit parts --lang es
node bin/protoboard-iso.js page examples/led-resistor.json -o led.html --lang es   # la página en vivo
npm run examples -- --lang es                                             # todos los ejemplos → examples/out/ (index.html)
```

## Tres formas de describir un circuito

| Cómo | Cuándo | Ejemplo |
|---|---|---|
| **A mano**: cada componente con sus agujeros (`pins`) | Quieres cada agujero justo donde está en tu protoboard | [`led-resistor.json`](led-resistor.json) |
| **Montaje automático**: componentes sin agujeros y las redes que los unen; `layout` los ubica y cablea | Cualquier otro circuito nuevo | [`layout/regulator-led.json`](layout/regulator-led.json): `node bin/protoboard-iso.js layout mi-regulador examples/layout/regulator-led.json` |
| **Receta**: un circuito de lección habitual por su nombre, solo con los valores que cambian | El circuito es una de las [25 recetas](../docs/es/recetas.md) | `node bin/protoboard-iso.js layout mi-divisor --recipe divider --values '{"R2":"4k7"}'` |

El formato de cada campo: [formato-circuito.md](../docs/es/formato-circuito.md).

## Primeros pasos

| | |
|---|---|
| <img src="../docs/img/examples/led-resistor.png" width="280" alt="LED con resistencia"> | **[led-resistor.json](led-resistor.json)**: un LED con su resistencia limitadora a 5 V. El circuito más pequeño con simulación; las imágenes del README salen de él. |
| <img src="../docs/img/examples/voltage-divider.png" width="280" alt="Divisor de voltaje"> | **[voltage-divider.json](voltage-divider.json)**: dos resistencias de 10 kΩ parten 9 V por la mitad; la página muestra el voltaje donde se unen. |
| <img src="../docs/img/examples/controls-and-ics.png" width="280" alt="Pulsadores, potenciómetros y chips"> | **[controls-and-ics.json](controls-and-ics.json)**: pulsadores a caballo del canal central, potenciómetros y chips DIP (NE555, LM358) ubicados por su pata 1. Solo dibujo, sin fuente. |

## Fuentes de alimentación

| | |
|---|---|
| <img src="../docs/img/examples/battery-regulator.png" width="280" alt="Batería de 9 V, regulador 7805 y un LED"> | **[battery-regulator.json](battery-regulator.json)**: una batería de 9 V al lado de la protoboard, un regulador 7805 con sus condensadores y un LED. Baterías: química, celdas en serie, estado de carga. |
| <img src="../docs/img/examples/half-wave-rectifier.png" width="280" alt="Rectificador de media onda"> | **[half-wave-rectifier.json](half-wave-rectifier.json)**: un diodo y un condensador de filtro alimentados por un generador de señales de 50 Hz; el osciloscopio muestra el rizado. |
| <img src="../docs/img/examples/rectifier.png" width="280" alt="Puente rectificador"> | **[rectifier.json](rectifier.json)**: un puente rectificador, un condensador de filtro, una resistencia de cemento de 5 W como carga y un LED. |
| <img src="../docs/img/examples/switches.png" width="280" alt="Interruptores fuera de la protoboard"> | **[switches.json](switches.json)**: un interruptor basculante con pinzas caimán y uno de enclavamiento, fuera de la protoboard; *Encender/Apagar* en la página. |
| <img src="../docs/img/examples/layout-regulator-led.png" width="280" alt="Regulador de 5 V con LED piloto"> | **[layout/regulator-led.json](layout/regulator-led.json)**: una especificación para `layout` (solo componentes y redes): un 7805 y un LED piloto. |
| <img src="../docs/img/examples/layout-two-rail-supply.png" width="280" alt="Fuente de dos rieles"> | **[layout/two-rail-supply.json](layout/two-rail-supply.json)**: una especificación para `layout`: 12 V a través de un diodo de protección y un interruptor, un 7805 a 5 V y después un AMS1117 a 3,3 V, cada uno con un LED piloto. |

## Señales en el tiempo

| | |
|---|---|
| <img src="../docs/img/examples/rc-square-wave.png" width="280" alt="RC con onda cuadrada"> | **[rc-square-wave.json](rc-square-wave.json)**: una resistencia y un condensador cargados por una onda cuadrada; compara en el osciloscopio la constante de tiempo con el período. |

## Microcontroladores

| | |
|---|---|
| <img src="../docs/img/examples/esp32-led.png" width="280" alt="ESP32 encendiendo un LED"> | **[esp32-led.json](esp32-led.json)**: un ESP32 DevKit sobre el canal central enciende un LED desde D13 (el estado del pin va en `io`). Conectado por USB, es la fuente. |
| <img src="../docs/img/examples/uno-led.png" width="280" alt="Arduino UNO encendiendo un LED"> | **[uno-led.json](uno-led.json)**: un Arduino UNO al lado de la protoboard, con cables Dupont hasta un LED en D13. |
| <img src="../docs/img/examples/epaper-esp32.png" width="280" alt="ESP32 con un panel e-paper"> | **[epaper-esp32.json](epaper-esp32.json)**: un ESP32 que maneja un panel e-paper de 7,5" a través del adaptador DESPI-C02. |

Los programas (sketches de Arduino que corren en la simulación) están en las recetas de
microcontroladores: [microcontroladores.md](../docs/es/microcontroladores.md).

## El catálogo

| | |
|---|---|
| <img src="../docs/img/examples/parts-showcase.png" width="280" alt="Todos los componentes del kit"> | **[parts-showcase.json](parts-showcase.json)**: resistencias (5 % y 1 %), diodos, LED, condensadores, transistores, un módulo AMS1117 y cables, uno al lado del otro. Sus notas sobre patas sin conectar son esperadas. |
| <img src="../docs/img/examples/more-parts.png" width="280" alt="Más componentes"> | **[more-parts.json](more-parts.json)**: trimmer, Zener, inductor, termistor, LDR, zumbador, pines de cabecera, LM324, LM317, PC817 y celdas de litio. |

## Mal a propósito

| | |
|---|---|
| <img src="../docs/img/examples/common-mistakes.png" width="280" alt="Errores frecuentes en la protoboard"> | **[common-mistakes.json](common-mistakes.json)**: **este circuito está mal a propósito.** Cada componente comete un error habitual y `check` avisa de cada uno: dos patas en un agujero, una resistencia en corto a lo largo de una tira, un transistor con sus tres patas en una tira, un pulsador siempre cerrado, patas demasiado juntas para el cuerpo. Corre `node bin/protoboard-iso.js check examples/common-mistakes.json --lang es` y compara. |

## Agregar un ejemplo

Un ejemplo nuevo es un archivo de circuito aquí que pasa `check` (salvo que muestre errores a
propósito), con un `title` en inglés y en español. Después `node scripts/readme-images.js examples/`
dibuja su miniatura, y lleva una fila en este archivo y en [README.md](README.md).
