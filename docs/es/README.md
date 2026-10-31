# Documentos

*[English](../en/README.md)*

Cada guía del kit en español, con para qué sirve. La hoja de ruta y la planeación están también
aquí ([hoja-de-ruta.md](hoja-de-ruta.md), [planeacion.md](planeacion.md)); su referencia en inglés
está en la raíz.

<!-- generated: the documents of this folder (npm run docs-index -- --write) -->
- [Agentes](agentes.md): Tres subagentes de Claude Code, definidos en `.claude/agents/`, reparten el trabajo para que la conversación principal se mantenga liviana.
- [Agregar un componente, un encapsulado o una protoboard](agregar-componentes.md): Empieza por el cambio más pequeño que funcione.
- [Arquitectura](arquitectura.md): La separación entre **tipo** y **encapsulado** es lo que permite reutilizar: un diodo 1N4007 y una resistencia comparten el encapsulado axial; un MOSFET IRLZ44N y un transistor TIP120 comparten el TO-220.
- [Embeber un circuito en la documentación](embeber.md): Cada circuito tiene una página pensada para embeberse: `out/<nombre>.html`, junto a sus otras salidas.
- [Escena y video: diseño y plan](escena-y-video.md): La página viva aprende a **contar** un circuito paso a paso: una línea de tiempo declarativa que la página reproduce como un recorrido, y que un script convierte en los fotogramas de un video corto, bajo un solo reloj externo, para que el mismo archivo dé las mismas imágenes cada vez.
- [Pasada de experiencia de uso: diseño y plan](experiencia-de-uso.md): La etapa 3 dejó la página con muchas funciones útiles: vistas, encuadre, etiquetas, la capa de corriente, los controles de tiempo, Falstad, fichas de componentes y de tiras con sus valores, deslizadores y osciloscopio, un panel de controles y avisos.
- [Falstad: abrir el circuito allá y comparar los dos simuladores](falstad.md): [CircuitJS de Falstad](https://www.falstad.com/circuit/) es el simulador de circuitos en el navegador más usado para aprender.
- [Foco y capa de corriente](foco-y-corriente.md): Dos formas de señalar lo importante de un dibujo, hechas con las mismas piezas (`src/render/focus.js`, `src/sim/flow.js`) para imágenes estáticas y para la página interactiva.
- [Formato del archivo de circuito (versión 1)](formato-circuito.md): Las claves van en inglés para que el formato sea el mismo en todos los idiomas.
- [Hacer un video de un circuito](hacer-un-video.md): Una guía paso a paso, desde el nombre de una receta hasta un `.mp4` para el celular.
- [Hoja de ruta](hoja-de-ruta.md): Cada etapa termina en algo que sirve por sí solo.
- [Inspeccionar y anotar un dibujo](inspeccionar-y-anotar.md): Dos herramientas para saber exactamente qué contiene un dibujo, sin tener que mirarlo.
- [Interfaz para agentes: retomar, inspeccionar, cambiar](interfaz-para-agentes.md): Cómo un asistente, un agente o un script retoma un circuito existente y lo cambia sin riesgo.
- [Líneas de tiempo: cada paso y cada opción](linea-de-tiempo.md): Una línea de tiempo es el guion de un video y del recorrido de una página (*Ver cómo funciona*): un archivo JSON de pasos, cada uno en un tiempo, cada uno haciendo una cosa.
- [Mapa del código](mapa-del-codigo.md): Dónde vive cada cosa y cómo se hablan las piezas.
- [Servidor MCP](mcp.md): `mcp/server.js` expone el kit como herramientas del [Model Context Protocol](https://modelcontextprotocol.io), para que cualquier asistente compatible (Claude Code, Claude Desktop, otros agentes) retome, inspeccione y cambie circuitos con entradas tipadas y respuestas cortas y estructuradas.
- [Microcontroladores en la simulación](microcontroladores.md): Cómo simula el kit las placas de desarrollo (ESP32 DevKit, ESP32-C3 SuperMini, Arduino UNO): no el procesador, sino lo que se ve en los pines.
- [Montaje automático: el algoritmo que ubica un circuito entero](montaje-automatico.md): `layout` convierte una lista de componentes (sin agujeros) y las redes que los unen en un circuito ubicado, cableado y revisado, en alrededor de un segundo, sin que quien lo llama tenga que probar y corregir.
- [Planeación: arquitectura, decisiones y buenas prácticas](planeacion.md): Ayudar a aprender electrónica **viendo** los circuitos tal como se montan en una protoboard: tamaños reales, bandas de colores reales, orientación real.
- [Recetas: circuitos de clase por su nombre](recetas.md): Una receta es una especificación de `layout` que el kit guarda para un circuito de clase habitual: sus componentes con valores por defecto, en orden de señal, sus redes y su fuente.
- [Simulación en vivo (etapa 3): diseño y plan](simulacion-en-vivo.md): La página para embeber (`out/<nombre>.html`) tendrá una simulación real que corre en el navegador, al estilo de CircuitJS de Falstad:
- [Simulación](simulacion.md): El kit calcula el voltaje (tensión) de cada grupo conectado y la corriente de cada componente, a partir del mismo archivo de circuito que dibuja la protoboard.
- [Traducir](traducir.md): Hay dos cosas que traducir, y son independientes.
<!-- /generated -->
