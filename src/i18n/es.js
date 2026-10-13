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
  'check.BAD_PIN1': '{part}: un chip DIP no puede empezar en «{hole}»; la pata 1 va en una fila junto al canal central (e o f) y con lugar para todas las patas.',
  'check.DIP_SHAPE': '{part}: un chip DIP debe ir a caballo del canal central, con las patas en columnas vecinas; colócalo con "pin1".',
  'check.BUTTON_SHAPE': '{part}: las cuatro patas deben formar un rectángulo: de 1 a 2, dos o tres agujeros; de 1 a 3, uno o dos; la 4 frente a la 1.',
  'check.SWITCH_BYPASSED': '{part}: las patas {pins} están en el mismo grupo ({node}), así que el pulsador queda siempre cerrado. Ponlo a caballo del canal central o gíralo 90°.',
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
  'check.TARGET_EXISTS': 'Ya hay un circuito en {target}.',
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

  'check.NO_PLACEMENT': '{part}: no se encontró ninguna posición válida ({considered} candidatas medidas). Prueba con otros grupos, con --near en un lugar con espacio, o con --window para buscar más lejos.',
  'check.NO_PLACEMENT_RAIL': '{part}: sus patas van en una fila de agujeros vecinos, así que no pueden llegar directo a un riel. Ponlo en tiras libres y une el riel con un cable.',

  'query.noHole': '«{hole}» no es un agujero de esta protoboard.',
  'query.noNode': '«{node}» no es un grupo conectado ni un agujero de esta protoboard.',
  'query.occupied': 'ocupado por {part}.{pin}',
  'query.empty': 'libre',
  'query.group': 'grupo',
  'query.node': '{node}{label}: {holes} agujeros · usados: {used} · libres: {free}',
  'query.free': '{shown} de {total} agujeros libres, primero los más cercanos a {near}:',
  'query.shared': 'grupo ya en uso',
  'suggest.header': 'Posiciones para {id} ({type}, {pkg}), de mejor a peor; {considered} medidas:',
  'suggest.span': 'separación',
  'suggest.score': 'puntuación',
  'suggest.visible': 'componente menos visible',
  'suggest.apply': 'Para usar la primera (revisa con una prueba en seco y luego aplica):',

  'review.approved': 'APROBADO ({profile}, vistas {views}): {parts} componentes, nada que bloquee; notas: {advisory}.',
  'review.changes': 'HAY QUE CAMBIAR ({profile}, vistas {views}): por arreglar: {blocking}; notas: {advisory}.',
  'review.blocking': 'Hay que arreglar:',
  'review.advisory': 'Conviene saber:',

  'type.resistor': 'Resistencia',
  'type.capacitor': 'Capacitor',
  'type.diode': 'Diodo',
  'type.led': 'LED',
  'type.mosfet': 'MOSFET',
  'type.bjt': 'Transistor bipolar',
  'type.potentiometer': 'Potenciómetro',
  'type.ic': 'Circuito integrado',
  'type.button': 'Pulsador',
  'state.pressed': 'presionado',
  'state.released': 'pulsador',
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

  'page.untitled': 'Circuito',
  'page.view.front': 'De frente',
  'page.view.back': 'Desde atrás',
  'page.view.front-left': 'Frente izquierdo',
  'page.view.back-right': 'Atrás derecho',
  'page.fit.parts': 'De cerca',
  'page.fit.board': 'Toda la protoboard',
  'page.labels': 'Etiquetas',
  'page.hint': 'Arrastra para moverte · rueda o pellizco para acercar · doble clic para acercar',
  'page.revision': 'revisión {revision}',
  'cli.usage': `Uso (<objetivo> = un archivo de circuito o una carpeta con circuit.json):
  protoboard-iso render <objetivo> [-o salida.svg] [--view front|back] [--lang en|es] [--scale 5] [--fit board|parts] [--annotate pins,boxes,nodes,grid|all] [--labels both|id|value] [--no-labels]
  protoboard-iso page <objetivo> [-o pagina.html] [--lang en|es] [--fit parts|board]
  protoboard-iso inspect <objetivo> [--view …] [--fit …] [--scale …] [--lang en|es] [--json]
  protoboard-iso check <objetivo> [--lang en|es] [--json]
  protoboard-iso netlist <objetivo>
  protoboard-iso apply <objetivo> [ops.json | -] [--ops '<json>'] [--dry-run] [--author nombre] [--note texto] [--expect-revision n] [--views front,back] [--json]
  protoboard-iso query <objetivo> at <hole> | node <node|hole> | free [--near <hole|node|column>] [--limit n] [--empty]
  protoboard-iso suggest <objetivo> --part '<json>' [--between <node>,<node>] [--connect '<json>'] [--near …] [--limit n] [--window mm]
  protoboard-iso review <objetivo> [--profile lesson|draft] [--views front,back] [--json]
  protoboard-iso undo <objetivo> [--author nombre] [--json]
  protoboard-iso history <objetivo> [--json]
  protoboard-iso parts [--lang en|es]`,
  'cli.written': 'Escrito {file} ({parts} componentes, {issues} observaciones).',
  'cli.noIssues': 'Sin problemas.',
  'cli.nodes': 'Grupos conectados en uso:',
};
