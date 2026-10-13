// English messages. This file is the reference: every key must exist here.
// Placeholders in braces are filled by t(): "{part}" → "R1".

export default {
  meta: { name: 'English', decimal: '.' },

  'severity.error': 'error',
  'severity.warning': 'warning',
  'severity.info': 'note',

  'node.strip': 'column {col} (rows {rows})',
  'node.rail': 'rail {rail}',

  'check.INVALID_CIRCUIT': 'The circuit file must be an object with a "parts" list.',
  'check.UNKNOWN_BOARD': 'Unknown board "{board}". Known boards: {options}.',
  'check.DUPLICATE_ID': 'Two parts are called {part}; every id must be unique.',
  'check.MISSING_ID': 'Part number {index} in the list has no "id".',
  'check.UNKNOWN_TYPE': '{part}: unknown part type "{type}". Known types: {options}.',
  'check.UNKNOWN_PART_NUMBER': '{part}: "{number}" is not in the {type} table. Add it to src/parts/db.js or give "package" and "pinNames".',
  'check.UNKNOWN_COLOR': '{part}: unknown colour "{color}". Options: {options}.',
  'check.UNKNOWN_KIND': '{part}: unknown kind "{kind}". Options: {options}.',
  'check.UNKNOWN_PACKAGE': '{part}: unknown package "{package}". Known packages: {options}.',
  'check.BAD_VALUE': '{part}: cannot read the value "{value}".',
  'check.PIN_COUNT': '{part}: needs {expected} pins ({names}) and got {got}.',
  'check.UNKNOWN_PIN': '{part}: there is no pin called "{pin}". Pins: {names}.',
  'check.MISSING_PIN': '{part}: pin {pin} has no hole.',
  'check.UNKNOWN_HOLE': '{part}: pin {pin} goes to "{hole}", which is not a hole on this board.',
  'check.HOLE_OCCUPIED': 'Hole {hole} holds two leads ({first} and {second}); each hole takes one.',
  'check.SPAN_TOO_SHORT': '{part}: the leads are {span} mm apart and the body needs at least {min} mm ({holes} holes).',
  'check.SPAN_TOO_LONG': '{part}: the leads are {span} mm apart; the most they reach is {max} mm.',
  'check.NOT_INLINE': '{part}: its {count} leads must go in a straight line, in neighbouring holes.',
  'check.PINS_SAME_NODE': '{part}: pins {pins} are in the same connected group ({node}), so they are shorted.',
  'check.FLOATING_PIN': '{part}: pin {pin} is in {node}, which nothing else touches.',
  'check.COLLISION': '{first} and {second} take up the same space.',

  'check.TOO_CLOSE': '{first} and {second} are {gap} mm apart; this layout asks for at least {clearance} mm.',

  'check.PART_HIDDEN': '{part} is {visible} % visible; {by} covers {share} % of it.',
  'check.LABEL_COVERS_PART': 'The label of {part} covers {over}.',
  'check.LABEL_OVERLAP': 'The labels of {first} and {second} overlap.',
  'check.LABEL_HIDES_TEXT': 'The label of {part} hides the printed text "{text}".',
  'check.LEADER_CROSSING': 'The leader lines of {first} and {second} cross.',
  'check.LEADER_OVER_PART': 'The leader line of {part} passes over {over}.',
  'check.TEXT_TOO_SMALL': '{count} printed texts are under {limit} px tall (smallest {smallest} px; parts: {parts}). Use a larger --scale or --fit parts.',

  'inspect.scene': 'Scene: view {view}, {scale} px/mm, frame {width}×{height} px at ({x}, {y}).',
  'inspect.pin': 'pin {pin} → {hole} [{node}]  board ({x}, {y}) mm  screen ({sx}, {sy}) px',
  'inspect.box': 'box ({x}, {y}) {width}×{height} px · visible {visible} %',
  'inspect.hiddenBy': 'hidden by {list}',
  'inspect.label': 'label "{text}" row {row} at ({x}, {y}) px',
  'inspect.smallest': 'Smallest text: "{text}", {px} px ({part}).',
  'inspect.clean': 'No problems found.',
  'inspect.problems': '{count} observations:',

  'check.OP_UNKNOWN': 'Operation {index}: unknown operation "{op}". Known: {options}.',
  'check.OP_BAD': 'Operation {index} ({op}): needs {need}.',
  'check.OP_UNKNOWN_PART': 'Operation {index} ({op}): there is no part {part}.',
  'check.OP_DUPLICATE_ID': 'Operation {index} ({op}): a part called {part} already exists.',
  'check.REVISION_MISMATCH': 'The circuit is at revision {actual}, not {expected}: someone changed it. Read it again and retry.',
  'check.NOTHING_TO_UNDO': 'Nothing to undo.',

  'change.failed': 'Nothing was changed:',
  'change.dryRun': 'Dry run (nothing saved): revision {from} → {to} would change:',
  'change.applied': 'Saved as revision {revision}:',
  'change.undone': 'Undid revision {undid}, saved as revision {revision}:',
  'change.fixed': 'fixed',
  'change.introduced': 'new',
  'change.same': 'no change in issues or drawing problems',
  'change.visibility': 'visibility',
  'change.outputs': 'outputs: {svg}, {report}',
  'history.entry': 'rev {revision} · {time} · {author}{note}: {ops}',
  'history.empty': 'No history yet.',

  'type.resistor': 'Resistor',
  'type.capacitor': 'Capacitor',
  'type.diode': 'Diode',
  'type.led': 'LED',
  'type.mosfet': 'MOSFET',
  'type.bjt': 'Bipolar transistor',
  'type.wire': 'Jumper wire',

  'color.red': 'red',
  'color.green': 'green',
  'color.yellow': 'yellow',
  'color.blue': 'blue',
  'color.white': 'white',
  'color.orange': 'orange',
  'color.black': 'black',
  'color.violet': 'violet',
  'color.grey': 'grey',
  'color.brown': 'brown',
  'color.gold': 'gold',
  'color.silver': 'silver',

  'cli.usage': `Usage (<target> = a circuit file or a circuit folder with circuit.json):
  protoboard-iso render <target> [-o out.svg] [--view front|back] [--lang en|es] [--scale 5] [--fit board|parts] [--annotate pins,boxes,nodes,grid|all] [--no-labels]
  protoboard-iso inspect <target> [--view …] [--fit …] [--scale …] [--lang en|es] [--json]
  protoboard-iso check <target> [--lang en|es]
  protoboard-iso netlist <target>
  protoboard-iso apply <target> [ops.json | -] [--ops '<json>'] [--dry-run] [--author name] [--note text] [--expect-revision n] [--views front,back] [--json]
  protoboard-iso undo <target> [--author name] [--json]
  protoboard-iso history <target> [--json]
  protoboard-iso parts [--lang en|es]`,
  'cli.written': 'Written {file} ({parts} parts, {issues} issues).',
  'cli.noIssues': 'No problems found.',
  'cli.nodes': 'Connected groups in use:',
};
