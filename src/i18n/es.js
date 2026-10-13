// Mensajes en español. Mismas claves que en.js; si falta alguna, se usa la inglesa.

export default {
  meta: { name: 'Español', decimal: ',' },

  'severity.error': 'error',
  'severity.warning': 'aviso',
  'severity.info': 'nota',

  'node.strip': 'columna {col} (filas {rows})',
  'node.rail': 'riel {rail}',

  'check.INVALID_CIRCUIT': 'El archivo del circuito debe ser un objeto con una lista "parts".',
  'check.UNKNOWN_BOARD': 'Protoboard desconocida: "{board}". Las conocidas son: {options}.',
  'check.DUPLICATE_ID': 'Hay dos componentes llamados {part}; cada id debe ser único.',
  'check.MISSING_ID': 'El componente número {index} de la lista no tiene "id".',
  'check.UNKNOWN_TYPE': '{part}: tipo de componente desconocido, "{type}". Los conocidos son: {options}.',
  'check.UNKNOWN_PART_NUMBER': '{part}: «{number}» no está en la tabla de {type}. Agrégalo en src/parts/db.js o indica "package" y "pinNames".',
  'check.UNKNOWN_COLOR': '{part}: color desconocido, "{color}". Opciones: {options}.',
  'check.UNKNOWN_KIND': '{part}: clase desconocida, "{kind}". Opciones: {options}.',
  'check.UNKNOWN_PACKAGE': '{part}: encapsulado desconocido, "{package}". Los conocidos son: {options}.',
  'check.BAD_VALUE': '{part}: no se puede leer el valor «{value}».',
  'check.PIN_COUNT': '{part}: necesita {expected} patas ({names}) y recibió {got}.',
  'check.UNKNOWN_PIN': '{part}: no tiene ninguna pata llamada «{pin}». Sus patas son: {names}.',
  'check.MISSING_PIN': '{part}: la pata {pin} no tiene agujero.',
  'check.UNKNOWN_HOLE': '{part}: la pata {pin} va a «{hole}», que no es un agujero de esta protoboard.',
  'check.HOLE_OCCUPIED': 'En el agujero {hole} hay dos patas ({first} y {second}); en cada agujero cabe una.',
  'check.SPAN_TOO_SHORT': '{part}: las patas quedan a {span} mm y el cuerpo necesita al menos {min} mm ({holes} agujeros).',
  'check.SPAN_TOO_LONG': '{part}: las patas quedan a {span} mm; como mucho alcanzan {max} mm.',
  'check.NOT_INLINE': '{part}: sus {count} patas deben ir en línea recta, en agujeros vecinos.',
  'check.PINS_SAME_NODE': '{part}: las patas {pins} están en el mismo grupo conectado ({node}), así que quedan en corto.',
  'check.FLOATING_PIN': '{part}: la pata {pin} está en {node}, que no toca nada más.',
  'check.COLLISION': '{first} y {second} ocupan el mismo espacio.',

  'check.TOO_CLOSE': '{first} y {second} quedan a {gap} mm; este montaje pide al menos {clearance} mm.',

  'check.PART_HIDDEN': 'De {part} se ve el {visible} %; {by} tapa el {share} %.',
  'check.LABEL_COVERS_PART': 'La etiqueta de {part} tapa a {over}.',
  'check.LABEL_OVERLAP': 'Las etiquetas de {first} y {second} se montan una sobre otra.',
  'check.LABEL_HIDES_TEXT': 'La etiqueta de {part} tapa el texto impreso «{text}».',
  'check.LEADER_CROSSING': 'Las líneas guía de {first} y {second} se cruzan.',
  'check.LEADER_OVER_PART': 'La línea guía de {part} pasa por encima de {over}.',
  'check.TEXT_TOO_SMALL': '{count} textos impresos miden menos de {limit} px de alto (el menor, {smallest} px; componentes: {parts}). Usa un --scale mayor o --fit parts.',

  'inspect.scene': 'Escena: vista {view}, {scale} px/mm, encuadre de {width}×{height} px en ({x}, {y}).',
  'inspect.pin': 'pata {pin} → {hole} [{node}]  protoboard ({x}, {y}) mm  pantalla ({sx}, {sy}) px',
  'inspect.box': 'caja ({x}, {y}) {width}×{height} px · visible {visible} %',
  'inspect.hiddenBy': 'tapado por {list}',
  'inspect.label': 'etiqueta «{text}» fila {row} en ({x}, {y}) px',
  'inspect.smallest': 'Texto más pequeño: «{text}», {px} px ({part}).',
  'inspect.clean': 'Sin problemas.',
  'inspect.problems': '{count} observaciones:',

  'check.OP_UNKNOWN': 'Operación {index}: operación desconocida, "{op}". Las conocidas son: {options}.',
  'check.OP_BAD': 'Operación {index} ({op}): necesita {need}.',
  'check.OP_UNKNOWN_PART': 'Operación {index} ({op}): no hay ningún componente {part}.',
  'check.OP_DUPLICATE_ID': 'Operación {index} ({op}): ya existe un componente llamado {part}.',
  'check.REVISION_MISMATCH': 'El circuito está en la revisión {actual}, no en la {expected}: alguien lo cambió. Vuelve a leerlo y reintenta.',
  'check.NOTHING_TO_UNDO': 'No hay nada que deshacer.',

  'change.failed': 'No se cambió nada:',
  'change.dryRun': 'Prueba en seco (no se guardó nada): la revisión {from} → {to} cambiaría:',
  'change.applied': 'Guardado como revisión {revision}:',
  'change.undone': 'Se deshizo la revisión {undid}; guardado como revisión {revision}:',
  'change.fixed': 'arregla',
  'change.introduced': 'nuevo',
  'change.same': 'sin cambios en las observaciones ni en los problemas del dibujo',
  'change.visibility': 'visibilidad',
  'change.outputs': 'salidas: {svg}, {report}',
  'history.entry': 'rev {revision} · {time} · {author}{note}: {ops}',
  'history.empty': 'Todavía no hay historial.',

  'type.resistor': 'Resistencia',
  'type.capacitor': 'Capacitor',
  'type.diode': 'Diodo',
  'type.led': 'LED',
  'type.mosfet': 'MOSFET',
  'type.bjt': 'Transistor bipolar',
  'type.wire': 'Cable de puente',

  'color.red': 'rojo',
  'color.green': 'verde',
  'color.yellow': 'amarillo',
  'color.blue': 'azul',
  'color.white': 'blanco',
  'color.orange': 'naranja',
  'color.black': 'negro',
  'color.violet': 'violeta',
  'color.grey': 'gris',
  'color.brown': 'café',
  'color.gold': 'dorado',
  'color.silver': 'plateado',

  'cli.usage': `Uso (<objetivo> = un archivo de circuito o una carpeta con circuit.json):
  protoboard-iso render <objetivo> [-o salida.svg] [--view front|back] [--lang en|es] [--scale 5] [--fit board|parts] [--annotate pins,boxes,nodes,grid|all] [--no-labels]
  protoboard-iso inspect <objetivo> [--view …] [--fit …] [--scale …] [--lang en|es] [--json]
  protoboard-iso check <objetivo> [--lang en|es]
  protoboard-iso netlist <objetivo>
  protoboard-iso apply <objetivo> [ops.json | -] [--ops '<json>'] [--dry-run] [--author nombre] [--note texto] [--expect-revision n] [--views front,back] [--json]
  protoboard-iso undo <objetivo> [--author nombre] [--json]
  protoboard-iso history <objetivo> [--json]
  protoboard-iso parts [--lang en|es]`,
  'cli.written': 'Escrito {file} ({parts} componentes, {issues} observaciones).',
  'cli.noIssues': 'Sin problemas.',
  'cli.nodes': 'Grupos conectados en uso:',
};
