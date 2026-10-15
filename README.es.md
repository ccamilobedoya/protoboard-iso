# protoboard-iso

*[Read in English](README.md)*

Circuitos en protoboard dibujados en isométrico, en SVG, a partir de un archivo JSON
corto. Hecho para aprender electrónica de forma visual: cada componente tiene su tamaño
real, las resistencias llevan sus bandas de colores reales y el dibujo sirve también
como guía de montaje para copiarlo en tu propia protoboard.

Son dos cosas a la vez:

- una **librería de JavaScript y una herramienta de línea de comandos**, sin
  dependencias, que funciona igual en Node y en el navegador;
- un **skill para agentes** (`SKILL.md`): un asistente de IA escribe el JSON y el kit lo
  dibuja y lo revisa, así que el asistente nunca calcula a mano la geometría ni el
  código de colores.

Inspirado en [Anatomy](https://github.com/wheresryan22/anatomy) (máquinas en isométrico) y
en el [simulador de circuitos de Falstad](https://www.falstad.com/circuit/) (ver cómo
circula la corriente).

## Inicio rápido

```bash
node bin/protoboard-iso.js check examples/led-resistor.json --lang es
node bin/protoboard-iso.js inspect examples/led-resistor.json --lang es   # el dibujo en números
node bin/protoboard-iso.js render examples/led-resistor.json -o led.svg --lang es
node bin/protoboard-iso.js render examples/led-resistor.json -o led-atras.svg --view back --lang es
npm test
npm run examples -- --lang es   # todos los ejemplos → examples/out/ (abrir index.html)
```

Un archivo de circuito:

```json
{
  "board": "bb830",
  "netLabels": { "T+": "+5 V", "T-": "GND" },
  "parts": [
    { "id": "R1", "type": "resistor", "value": "330", "pins": ["T+9", "c9"] },
    { "id": "D1", "type": "led", "color": "red", "pins": { "anode": "e9", "cathode": "e10" } },
    { "id": "W1", "type": "wire", "color": "black", "pins": ["a10", "T-10"] }
  ]
}
```

Las claves del JSON están en inglés para que cualquiera pueda reutilizarlo; los mensajes,
las etiquetas y la página salen en español o inglés: `--lang es`, `lang` en las herramientas
MCP, o `"lang": "es"` en el propio circuito, que gana sobre el idioma por defecto (ver
[formato-circuito.md](docs/es/formato-circuito.md)).

La protoboard decide las conexiones: las filas a–e de una columna son un nodo, las f–j
otro y cada riel uno más. Solo con los agujeros el kit sabe qué está conectado y avisa
de tiras en corto, agujeros ocupados, patas que no alcanzan y cuerpos que se chocan.

Además simula lo que dibuja (un modelo, y lo dice): con una fuente de banco en `supplies`, o
con una **batería** al lado de la protoboard (AA, AAA, 18650, 9 V o LiPo; las celdas que se
quieran en serie, su química y su estado de carga), calcula voltajes (tensiones) y
corrientes, avisa de sobrecargas y cortocircuitos, y muestra los valores de cada componente en
la página para embeber. Los componentes van de resistencias y LED a diodos Zener, puentes rectificadores, reguladores,
inductores, sensores, transistores y chips
([formato-circuito.md](docs/es/formato-circuito.md), [simulacion.md](docs/es/simulacion.md)).

## Usarlo como skill

Clona o enlaza esta carpeta en tu directorio de skills, por ejemplo
`ln -s "$PWD" ~/.claude/skills/protoboard-iso`. El asistente carga `SKILL.md` cuando
aparece un circuito en protoboard.

## Documentación

| | Español | English |
|---|---|---|
| Mapa del código (empezar aquí al volver al código) | [docs/es/mapa-del-codigo.md](docs/es/mapa-del-codigo.md) | [docs/en/code-map.md](docs/en/code-map.md) |
| Cómo está construido | [docs/es/arquitectura.md](docs/es/arquitectura.md) | [docs/en/architecture.md](docs/en/architecture.md) |
| Formato del archivo de circuito | [docs/es/formato-circuito.md](docs/es/formato-circuito.md) | [docs/en/circuit-format.md](docs/en/circuit-format.md) |
| Agregar un componente o una protoboard | [docs/es/agregar-componentes.md](docs/es/agregar-componentes.md) | [docs/en/adding-parts.md](docs/en/adding-parts.md) |
| Traducir | [docs/es/traducir.md](docs/es/traducir.md) | [docs/en/translating.md](docs/en/translating.md) |
| Inspeccionar y anotar | [docs/es/inspeccionar-y-anotar.md](docs/es/inspeccionar-y-anotar.md) | [docs/en/inspect-and-annotate.md](docs/en/inspect-and-annotate.md) |
| Interfaz para agentes (retomar, cambiar, deshacer) | [docs/es/interfaz-para-agentes.md](docs/es/interfaz-para-agentes.md) | [docs/en/agent-interface.md](docs/en/agent-interface.md) |
| Servidor MCP | [docs/es/mcp.md](docs/es/mcp.md) | [docs/en/mcp.md](docs/en/mcp.md) |
| Simulación (voltajes y corrientes, un modelo) | [docs/es/simulacion.md](docs/es/simulacion.md) | [docs/en/simulation.md](docs/en/simulation.md) |
| Foco y capa de corriente | [docs/es/foco-y-corriente.md](docs/es/foco-y-corriente.md) | [docs/en/focus-and-flow.md](docs/en/focus-and-flow.md) |
| Falstad: abrir un circuito en CircuitJS, comparar | [docs/es/falstad.md](docs/es/falstad.md) | [docs/en/falstad.md](docs/en/falstad.md) |
| Embeber un circuito en la documentación | [docs/es/embeber.md](docs/es/embeber.md) | [docs/en/embedding.md](docs/en/embedding.md) |
| Agentes (montaje, revisor, bibliotecario) | [docs/es/agentes.md](docs/es/agentes.md) | [docs/en/agents.md](docs/en/agents.md) |
| Hoja de ruta | [docs/es/hoja-de-ruta.md](docs/es/hoja-de-ruta.md) | [ROADMAP.md](ROADMAP.md) |
| Planeación | [docs/es/planeacion.md](docs/es/planeacion.md) | [PLANNING.md](PLANNING.md) |

## Hoja de ruta y planeación

- [docs/es/hoja-de-ruta.md](docs/es/hoja-de-ruta.md): etapas, lo hecho y lo que sigue.
- [docs/es/planeacion.md](docs/es/planeacion.md): arquitectura, consideraciones, buenas prácticas y registro de decisiones.

Ahora: **etapa 1 terminada** (SVG estático con posicionamiento correcto). Lo siguiente: la
simulación (primero DC), luego la animación en el navegador y después una página
interactiva para celular y tableta.

## Licencia

MIT. Ver [LICENSE](LICENSE).
