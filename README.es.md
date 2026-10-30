# protoboard-iso

*[Read in English](README.md)*

**Circuitos de protoboard que puedes copiar en tu propia protoboard.** Dices qué componentes hay y
qué va conectado con qué; el kit pone cada componente en agujeros reales y a su tamaño real, agrega
los cables, revisa el circuito, lo dibuja en SVG isométrico y lo simula en una página que se puede
embeber en una lección.

![Un temporizador 555 que hace parpadear un LED, montado por el kit](docs/img/hero.png)

- **Dibujado a escala**: resistencias con sus bandas de colores reales, LED, condensadores,
  transistores, reguladores, chips, placas de desarrollo (ESP32, Arduino UNO), baterías. Vista de
  frente y desde atrás.
- **Revisado**: solo con los agujeros el kit sabe qué está conectado, y avisa de tiras en corto,
  agujeros ocupados, patas que no alcanzan y componentes que se montan unos sobre otros.
- **Simulado** (un modelo, y lo dice): voltajes, corrientes, un osciloscopio, LED que se encienden,
  avisos cuando un componente pasa de su límite, y hasta un programa de Arduino corriendo.
- **Hecho para asistentes**: un skill (`SKILL.md`), un servidor MCP y tres agentes, para que un
  asistente de IA describa el circuito y el kit haga la geometría. Nunca calcula un agujero a mano.
- **Sin dependencias**: JavaScript simple, Node ≥ 20 o un navegador. En inglés y en español.

**Demostración en vivo:** [todas las recetas como páginas en vivo](https://ccamilobedoya.github.io/protoboard-iso/es/)
(toca un componente, pulsa *Corriente*, dale la vuelta a la protoboard).

## Pruébalo en un minuto

<!-- smoke -->
```bash
git clone https://github.com/ccamilobedoya/protoboard-iso.git
cd protoboard-iso                      # no hay nada que instalar
node bin/protoboard-iso.js layout mi-interruptor --recipe npn-switch --values '{"R1":"470","D1":"green"}' --lang es
```

Eso monta un interruptor con transistor a partir de una **receta**, lo revisa y escribe
`mi-interruptor/`: el circuito (`circuit.json`), su historial y `out/mi-interruptor.html`, una sola
página con el dibujo y la simulación en vivo. Ábrela en un navegador. Después:

<!-- smoke -->
```bash
node bin/protoboard-iso.js simulate mi-interruptor --lang es          # voltajes y corrientes, en texto
node bin/protoboard-iso.js render mi-interruptor --view back --lang es # el dibujo desde el otro lado
node bin/protoboard-iso.js review mi-interruptor --lang es             # APROBADO o HAY QUE CAMBIAR, y por qué
```

## De una descripción a una lección

| 1. Describir | 2. Ubicado y dibujado | 3. Revisado |
|---|---|---|
| Un archivo de circuito nombra componentes y agujeros ([formato](docs/es/formato-circuito.md)), o `layout` los ubica a partir de una lista de conexiones ([montaje automático](docs/es/montaje-automatico.md)). | ![Vista de frente](docs/img/led-resistor.front.png) | ![Agujeros, nodos y cajas de los componentes anotados](docs/img/led-resistor.annotated.png) |
| **4. Desde atrás** | **5. Simulado** | **6. Corriente** |
| ![Vista desde atrás](docs/img/led-resistor.back.png) | ![Voltajes y corrientes dibujados sobre la protoboard](docs/img/led-resistor.sim.png) | ![Conductores coloreados por el voltaje, puntos para la corriente](docs/img/led-resistor.flow.png) |

El circuito de esas imágenes, [`examples/led-resistor.json`](examples/led-resistor.json) (abreviado):

```json
{
  "title": { "en": "LED with a current-limiting resistor", "es": "LED con resistencia limitadora" },
  "board": "bb830",
  "netLabels": { "T+": "+5 V", "T-": "GND" },
  "supplies": [{ "id": "V1", "voltage": 5, "currentLimit": 0.1 }],
  "parts": [
    { "id": "R1", "type": "resistor", "value": "330", "pins": ["T+9", "h9"] },
    { "id": "D1", "type": "led", "color": "red", "pins": { "anode": "f9", "cathode": "f10" } },
    { "id": "W1", "type": "wire", "color": "black", "pins": ["j10", "T-10"] }
  ]
}
```

Los agujeros son una letra de fila y una columna (`f9`); los rieles son `T+`, `T-`, `B+`, `B-` más
una columna. Las filas a–e de una columna son un nodo, f–j otro, y cada riel uno más: es todo lo
que el kit necesita para saber qué está conectado.

**La página.** Cada circuito tiene `out/<nombre>.html`, un solo archivo sin red ni compilación,
hecho para ir dentro de un iframe o de una app de notas ([embeber](docs/es/embeber.md)). Al tocar
un componente, su ficha muestra sus valores, un osciloscopio y qué significa cada valor; los
deslizadores cambian resistencias, fuentes y sensores mientras corre.

![La página en vivo: un LED tocado, con su voltaje, corriente, brillo y osciloscopio](docs/img/live-page.png)

## Recetas

Los circuitos de lección habituales salen listos por su nombre, solo con los valores que cambias
([las 25 recetas](docs/es/recetas.md)):

| | | |
|---|---|---|
| ![npn-switch](docs/img/recipes/npn-switch.png)<br>`npn-switch`: un pulsador y un transistor encienden un LED | ![regulator-7805](docs/img/recipes/regulator-7805.png)<br>`regulator-7805`: un regulador lineal y un LED piloto | ![bridge-rectifier](docs/img/recipes/bridge-rectifier.png)<br>`bridge-rectifier`: un puente, un condensador de filtro, una senoidal a la entrada |
| ![opamp-noninverting](docs/img/recipes/opamp-noninverting.png)<br>`opamp-noninverting`: un amplificador con LM358 | ![esp32-led](docs/img/recipes/esp32-led.png)<br>`esp32-led`: un ESP32 que corre un programa de parpadeo | ![uno-pot-pwm](docs/img/recipes/uno-pot-pwm.png)<br>`uno-pot-pwm`: un Arduino UNO regula un LED con un potenciómetro |

También: `led-resistor`, `divider`, `potentiometer-led`, `mosfet-switch`, `button-pullup`,
`button-pulldown`, `rc-square`, `555-astable`, `regulator-ams1117`, `zener-regulator`,
`esp32-button`, `opamp-comparator`, `lm393-comparator`, `opamp-follower`, `opamp-inverting`,
`uno-blink`, `uno-button`, `c3-blink`, `c3-pot-pwm`.

Más archivos de circuito, cada uno con lo que muestra: [examples/](examples/README.es.md).

## Tres formas de usarlo

**Línea de comandos.** `node bin/protoboard-iso.js <comando>`: `layout`, `check`, `render`,
`inspect`, `simulate`, `page`, `review`, `query`, `suggest`, `apply`, `undo`, `history`. Sin
argumentos muestra la lista completa. [Interfaz para agentes](docs/es/interfaz-para-agentes.md)
explica cómo se cambia un circuito con operaciones en vez de reescribirlo.

**Servidor MCP** (Claude Code, Claude Desktop y otros clientes MCP). En este repositorio ya lo
registra `.mcp.json`; en otro lugar:

```bash
cd mcp && npm install && cd ..
claude mcp add protoboard-iso -e PROTOBOARD_ROOT="$PWD" -e PROTOBOARD_LANG=es -- node "$PWD/mcp/server.js"
```

Después pide un circuito con palabras («un LED con su resistencia a 9 V»). Instalación y
herramientas: [docs/es/mcp.md](docs/es/mcp.md).

**Skill para agentes.** `SKILL.md` le dice a un asistente cómo usar el kit. Enlaza esta carpeta en
tu directorio de skills, por ejemplo `ln -s "$PWD" ~/.claude/skills/protoboard-iso`. Para trabajar
circuitos, el repositorio trae además tres agentes en `.claude/agents/` (uno monta, otro revisa,
otro agrega componentes): [agentes](docs/es/agentes.md).

**Como librería**, en Node o en un navegador:

```js
import { renderCircuit } from './src/index.js';
const { svg, issues } = renderCircuit(circuit, { view: 'front', lang: 'es' });
```

## Qué es y qué no es

- La simulación es un **modelo**, no una medición: cada resultado lo dice. Sirve para ver por qué
  un LED necesita una resistencia o cómo se carga un condensador; no reemplaza a SPICE. Sus
  resultados se comparan caso por caso con [el simulador de Falstad](docs/es/falstad.md).
- El catálogo cubre un kit de principiante habitual y un poco más
  ([formato del circuito](docs/es/formato-circuito.md)); los componentes nuevos siguen
  [agregar componentes](docs/es/agregar-componentes.md).
- Los mensajes, las etiquetas y las páginas salen en **inglés o español** (`--lang es`, o
  `"lang": "es"` en el circuito). Las claves del JSON quedan en inglés para que los circuitos se
  compartan entre idiomas.

## Documentación

**Usar el kit**

| | Español | English |
|---|---|---|
| Formato del circuito | [formato-circuito.md](docs/es/formato-circuito.md) | [circuit-format.md](docs/en/circuit-format.md) |
| Recetas: circuitos de lección por nombre | [recetas.md](docs/es/recetas.md) | [recipes.md](docs/en/recipes.md) |
| Montaje automático de un circuito completo | [montaje-automatico.md](docs/es/montaje-automatico.md) | [layout.md](docs/en/layout.md) |
| Simulación (un modelo) | [simulacion.md](docs/es/simulacion.md) | [simulation.md](docs/en/simulation.md) |
| Microcontroladores (ESP32, UNO) y sus programas | [microcontroladores.md](docs/es/microcontroladores.md) | [microcontrollers.md](docs/en/microcontrollers.md) |
| Foco y capa de corriente | [foco-y-corriente.md](docs/es/foco-y-corriente.md) | [focus-and-flow.md](docs/en/focus-and-flow.md) |
| Embeber un circuito en la documentación | [embeber.md](docs/es/embeber.md) | [embedding.md](docs/en/embedding.md) |
| Falstad: abrir un circuito en CircuitJS | [falstad.md](docs/es/falstad.md) | [falstad.md](docs/en/falstad.md) |
| Inspeccionar y anotar | [inspeccionar-y-anotar.md](docs/es/inspeccionar-y-anotar.md) | [inspect-and-annotate.md](docs/en/inspect-and-annotate.md) |
| Interfaz para agentes (retomar, cambiar, deshacer) | [interfaz-para-agentes.md](docs/es/interfaz-para-agentes.md) | [agent-interface.md](docs/en/agent-interface.md) |
| Servidor MCP | [mcp.md](docs/es/mcp.md) | [mcp.md](docs/en/mcp.md) |
| Agentes (montaje, revisor, bibliotecario) | [agentes.md](docs/es/agentes.md) | [agents.md](docs/en/agents.md) |

**Trabajar en el kit**

| | Español | English |
|---|---|---|
| Mapa del código (empieza aquí) | [mapa-del-codigo.md](docs/es/mapa-del-codigo.md) | [code-map.md](docs/en/code-map.md) |
| Cómo está construido | [arquitectura.md](docs/es/arquitectura.md) | [architecture.md](docs/en/architecture.md) |
| Agregar un componente o una protoboard | [agregar-componentes.md](docs/es/agregar-componentes.md) | [adding-parts.md](docs/en/adding-parts.md) |
| Traducir | [traducir.md](docs/es/traducir.md) | [translating.md](docs/en/translating.md) |
| Hoja de ruta | [hoja-de-ruta.md](docs/es/hoja-de-ruta.md) | [ROADMAP.md](ROADMAP.md) |
| Planeación y registro de decisiones | [planeacion.md](docs/es/planeacion.md) | [PLANNING.md](PLANNING.md) |
| Notas de desarrollo: simulación en vivo, pasada de experiencia de uso | [simulacion-en-vivo.md](docs/es/simulacion-en-vivo.md), [experiencia-de-uso.md](docs/es/experiencia-de-uso.md) | [live-simulation.md](docs/en/live-simulation.md), [ux-pass.md](docs/en/ux-pass.md) |

## Contribuir

Los *issues* y *pull requests* son bienvenidos, sobre todo componentes nuevos (con su hoja de
datos) y traducciones. Antes de un *pull request*: `npm test` pasa, `npm run examples` no muestra
problemas nuevos y la documentación en español sigue a la inglesa. `CLAUDE.md` tiene las reglas del
repositorio; una de ellas: nada de datos personales, rutas privadas ni nombres de equipos privados
en lo que se sube.

Las imágenes de este README las dibuja el kit: `npm install` (solo para desarrollo) y después
`node scripts/readme-images.js`.

## Créditos

Inspirado en [Anatomy](https://github.com/wheresryan22/anatomy) (máquinas isométricas) y en el
[simulador de circuitos de Falstad](https://www.falstad.com/circuit/) (ver circular la corriente).
Las medidas de los componentes salen de las hojas de datos de sus fabricantes.

## Licencia

MIT. Ver [LICENSE](LICENSE).
