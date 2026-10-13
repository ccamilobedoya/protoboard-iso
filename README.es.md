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

Las claves del JSON están en inglés para que cualquiera pueda reutilizarlo; los mensajes
y las etiquetas salen en el idioma que elijas.

La protoboard decide las conexiones: las filas a–e de una columna son un nodo, las f–j
otro y cada riel uno más. Solo con los agujeros el kit sabe qué está conectado y avisa
de tiras en corto, agujeros ocupados, patas que no alcanzan y cuerpos que se chocan.

## Usarlo como skill

Clona o enlaza esta carpeta en tu directorio de skills, por ejemplo
`ln -s "$PWD" ~/.claude/skills/protoboard-iso`. El asistente carga `SKILL.md` cuando
aparece un circuito en protoboard.

## Documentación

| | Español | English |
|---|---|---|
| Cómo está construido | [docs/es/arquitectura.md](docs/es/arquitectura.md) | [docs/en/architecture.md](docs/en/architecture.md) |
| Formato del archivo de circuito | [docs/es/formato-circuito.md](docs/es/formato-circuito.md) | [docs/en/circuit-format.md](docs/en/circuit-format.md) |
| Agregar un componente o una protoboard | [docs/es/agregar-componentes.md](docs/es/agregar-componentes.md) | [docs/en/adding-parts.md](docs/en/adding-parts.md) |
| Traducir | [docs/es/traducir.md](docs/es/traducir.md) | [docs/en/translating.md](docs/en/translating.md) |
| Inspeccionar y anotar | [docs/es/inspeccionar-y-anotar.md](docs/es/inspeccionar-y-anotar.md) | [docs/en/inspect-and-annotate.md](docs/en/inspect-and-annotate.md) |
| Interfaz para agentes (retomar, cambiar, deshacer) | [docs/es/interfaz-para-agentes.md](docs/es/interfaz-para-agentes.md) | [docs/en/agent-interface.md](docs/en/agent-interface.md) |
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
