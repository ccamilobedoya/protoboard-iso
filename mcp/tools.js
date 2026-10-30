// The MCP tools of protoboard-iso: the same functions as the command line, as tools an assistant
// or agent can call. server.js registers them and runs their handlers in a worker (kit-worker.js),
// which it restarts when the kit's code changes, so a long-lived server never answers with old code.
//
// Environment
//   PROTOBOARD_ROOT  folder the server may read and write (default: current directory).
//                    Every target path is resolved inside it; anything outside is refused.
//   PROTOBOARD_LANG  default language of the text answers (en, es). Default en.
//
// Every tool answers in readable text by default, or JSON with format: "json".

import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, relative, join, sep, basename } from 'node:path';
import { z } from 'zod';

import {
  renderCircuit,
  inspectCircuit,
  formatReport,
  checkCircuit,
  formatIssue,
  t,
  PART_TYPES,
  VIEWS,
  ANNOTATION_LAYERS,
  OP_NAMES,
  LANGUAGES,
} from '../src/index.js';
import { formatChange } from '../src/diff.js';
import { queryAt, queryNode, queryFree, suggest, suggestMany } from '../src/query.js';
import { formatAt, formatNode, formatFree, formatSuggest, formatSuggestMany } from '../src/query-format.js';
import { resolveTarget, loadCircuit, readHistory, applyToTarget, undoTarget, createTarget, relayoutTarget, writePage } from '../src/node/workspace.js';
import { svgToPng, rasterAvailable } from '../src/node/raster.js';
import { review, formatReview, PROFILES } from '../src/review.js';
import { simulate } from '../src/sim/index.js';
import { pickLanguage } from '../src/i18n/index.js';
import { formatSimulation, formatFalstad } from '../src/sim/format.js';
import { compile, createEngine } from '../src/sim/index.js';
import { toFalstad } from '../src/sim/falstad.js';
import { nets, formatNets } from '../src/nets.js';
import { createBoard, boardLayout, BOARDS } from '../src/board/board.js';
import { autoLayout, formatLayout, specFromCircuit, specProblems } from '../src/layout.js';
import { RECIPES, resolveRecipe } from '../src/recipes/index.js';
import { formatBoardLayout } from '../src/board/layout-text.js';
import { compactCatalog, catalogSuggestions, catalogEntry, fullCatalog, formatCompactCatalog, formatCatalogEntry } from '../src/node/catalog.js';

const ROOT = resolve(process.env.PROTOBOARD_ROOT ?? process.cwd());
const DEFAULT_LANG = LANGUAGES[process.env.PROTOBOARD_LANG] ? process.env.PROTOBOARD_LANG : 'en';
export const VERSION = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')).version;

// ---------------------------------------------------------------- helpers

// Agents often prefix a target with the folder the examples use ("circuits/led") or with the
// root's own name ("circuitos/led") when the root already is that folder, and the circuit ends up
// nested one level down. The prefix is dropped when the target exists without it, or when that
// first folder does not exist and the root holds circuit folders itself.
export function normalizeTarget(target) {
  const plain = String(target).replace(/\\/g, '/').replace(/^\.\//, '');
  const parts = plain.split('/').filter(Boolean);
  if (parts.length < 2 || !(parts[0] === basename(ROOT) || /^circui(ts|tos)$/i.test(parts[0]))) return plain;
  const rest = parts.slice(1).join('/');
  if (existsSync(join(ROOT, plain))) return plain;
  if (existsSync(join(ROOT, rest))) return rest;
  if (existsSync(join(ROOT, parts[0]))) return plain;
  const holdsCircuits = readdirSync(ROOT, { withFileTypes: true }).some((e) => !e.name.startsWith('.') && existsSync(join(ROOT, e.name, 'circuit.json')));
  return holdsCircuits ? rest : plain;
}

function inside(target) {
  const full = resolve(ROOT, normalizeTarget(target));
  if (full !== ROOT && !full.startsWith(ROOT + sep)) throw new Error(`"${target}" is outside the allowed folder (${ROOT}).`);
  return full;
}
const rel = (full) => relative(ROOT, full) || '.';

function existing(target) {
  const full = inside(target);
  const paths = resolveTarget(full);
  if (!existsSync(paths.circuitFile)) throw new Error(`No circuit at "${target}". Use list_circuits to see what exists.`);
  return { full, paths };
}

const text = (s) => ({ content: [{ type: 'text', text: s }] });
const json = (value) => text(JSON.stringify(value, null, 2));
const answer = (format, value, readable) => (format === 'json' ? json(value) : text(readable()));
const relFiles = (files) => (files ? Object.fromEntries(Object.entries(files).map(([k, v]) => [k, rel(v)])) : files);

// Language of every answer and every file written: the `lang` the tool was called with, else
// the circuit's own "lang", else PROTOBOARD_LANG. Resolved here once for all tools; the
// language asked for explicitly travels on as `outputLang` (it wins over the circuit's).
function circuitLang(args) {
  if (args.circuit) return args.circuit.lang;
  if (!args.target) return undefined;
  try {
    const paths = resolveTarget(inside(args.target));
    return existsSync(paths.circuitFile) ? JSON.parse(readFileSync(paths.circuitFile, 'utf8')).lang : undefined;
  } catch {
    return undefined;
  }
}

function safely(handler) {
  return async (args) => {
    try {
      return await handler({ ...args, outputLang: args.lang, lang: pickLanguage(args.lang, circuitLang(args), DEFAULT_LANG) });
    } catch (e) {
      return { isError: true, content: [{ type: 'text', text: e.message }] };
    }
  };
}

const common = {
  lang: z.enum(Object.keys(LANGUAGES)).optional().describe('Language of the answer and of the files written (default: the circuit\'s "lang", else PROTOBOARD_LANG).'),
  format: z.enum(['text', 'json']).optional().describe('text (default, readable) or json (complete, for tools).'),
};
const targetArg = z.string().describe('Circuit folder or file, relative to the server root, as list_circuits shows it (e.g. led or examples/led.json).');
const viewArgs = {
  view: z.enum(Object.keys(VIEWS)).optional(),
  fit: z.enum(['board', 'parts']).optional().describe('parts = close-up of the area with parts'),
  scale: z.number().positive().optional().describe('px per mm, default 5'),
};
const partShape = z.object({ id: z.string(), type: z.string(), pins: z.union([z.array(z.string()), z.record(z.string(), z.string())]).optional(), pin1: z.string().optional() }).passthrough();
const opShape = z
  .object({ op: z.enum(OP_NAMES) })
  .passthrough()
  .describe('add {part} · remove {part: id} · move {part, pins} · set {part, field: value|null} · rename {part, to} · circuit {title|lang|board|view|clearance|netLabels|supplies|page}');
const READ = { readOnlyHint: true, destructiveHint: false, openWorldHint: false };
const WRITE = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false };

function findCircuits(dir, depth = 0, out = []) {
  if (depth > 4) return out;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || ['node_modules', 'out', 'schema'].includes(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (existsSync(join(full, 'circuit.json'))) out.push(full);
      else findCircuits(full, depth + 1, out);
    } else if (entry.name.endsWith('.json') && !['package.json', 'package-lock.json', 'circuit.json'].includes(entry.name)) {
      try {
        const data = JSON.parse(readFileSync(full, 'utf8'));
        if (Array.isArray(data?.parts)) out.push(full);
      } catch {
        // not a circuit
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------- server

export const INSTRUCTIONS = [
  'Breadboard circuits: describe what is connected; the kit places, draws, checks and simulates it. Never compute holes, colour codes, voltages or currents yourself, and never rewrite circuit files.',
  `Recipes first: a usual lesson circuit is layout with recipe and only the values that change (${Object.keys(RECIPES).join(', ')}; catalog with the name shows its parts, nets and values). It comes out ready, nothing to work out.`,
  'Which tool: another new circuit → layout (parts without holes, nets of pins and rails). Other connections or parts in a circuit made by layout (get_circuit shows a spec) → layout again on the same target with only what changes and expect_revision (parts keep their holes; undo restores). A value, a description, a fix or a hand-made circuit → apply_ops.',
  'layout ends in one line, STATUS: DONE (ready) · CHANGES (created: fix only the ✖ items with suggest and apply_ops, then review) · FIX_SPEC (nothing created: fix every ✖ in the spec and call again) · SPEC_OK (check_only).',
  'Operations: history and inspect (numbers, not pictures) → query / suggest → apply_ops with dry_run → apply_ops with expect_revision, author and note → review until APPROVED → undo if needed.',
  'Check: review is the definition of done (it also checks the nets of a circuit made by layout); netlist lists every net; simulate gives a model, and a value a learner must predict is never shown. render returns a PNG only when asked: images are slow to read.',
  'Holes: a1…j63 (row letter + column), rails T-, T+, B+, B- plus the column (T+9). Rows a–e of a column are connected, f–j too; each rail is one group.',
  'Microcontroller boards (ESP32-DEVKIT, ESP32-C3-SUPERMINI, UNO) are simulated pin by pin: on USB they are a source (no supplies needed), and each GPIO state goes in the part: "io": {"D13": "high", "D27": "input_pullup"} (high, low, input, input_pullup, input_pulldown), or it runs a program: "program": "blink.ino" (a file beside the circuit) or the sketch\'s text (setup, loop, pinMode, digitalWrite, digitalRead, analogRead, analogWrite/ledcWrite PWM, tone, delay, millis, Serial).',
  'The page out/<name>.html of a circuit with a source runs the simulation by default: values of the tapped part, oscilloscope, lit LEDs, and the Current button in the bar (not pressed). Turn it off with page.simulation false while a learner must predict a value (page.results false or page.flow false turn off one each).',
].join('\n');

// Tools as data: server.js registers them, kit-worker.js runs their handlers.
export const TOOLS = [];
// Each tool as a client sees it at start: its name, description and input as JSON Schema
// (scripts/context-size.js measures what a session loads).
export const toolSchemas = () => TOOLS.map((t) => ({ name: t.name, description: t.config.description, inputSchema: z.toJSONSchema(z.object(t.config.inputSchema)) }));
const server = { registerTool: (name, config, handler) => TOOLS.push({ name, config, handler }) };

server.registerTool(
  'list_circuits',
  { title: 'List circuits', description: 'Circuits under the server root: files with a "parts" list and folders with circuit.json.', inputSchema: { format: common.format }, annotations: READ },
  safely(async ({ format }) => {
    const items = findCircuits(ROOT).map((full) => {
      const paths = resolveTarget(full);
      const c = loadCircuit(paths);
      const title = typeof c.title === 'object' ? c.title?.en ?? Object.values(c.title)[0] : c.title;
      return { target: rel(full), title: title ?? null, revision: c.revision ?? 0, parts: c.parts.length };
    });
    return answer(format, { root: ROOT, circuits: items }, () => [`root: ${ROOT}`, ...items.map((i) => `${i.target} · rev ${i.revision} · ${i.parts} parts${i.title ? ` · ${i.title}` : ''}`)].join('\n'));
  }),
);

server.registerTool(
  'get_circuit',
  { title: 'Get circuit', description: 'The circuit file as JSON (the only source of truth), with its revision and placement issues. A circuit made by layout carries spec: spec.nets are the connections it was asked for (edit them and pass them to layout to change what is connected).', inputSchema: { target: targetArg, lang: common.lang }, annotations: READ },
  safely(async ({ target, lang }) => {
    const { paths } = existing(target);
    const circuit = loadCircuit(paths);
    const { issues } = checkCircuit(circuit);
    return json({ target, revision: circuit.revision ?? 0, circuit, issues: issues.map((i) => formatIssue(i, lang)) });
  }),
);

server.registerTool(
  'create_circuit',
  {
    title: 'Create circuit',
    description: 'Create a new circuit folder (circuit.json, history.jsonl, out/) from a full circuit with its holes, written by hand. Refuses to overwrite. For a new circuit without fixed positions use layout instead. Check the answer for placement issues.',
    inputSchema: {
      target: z.string().describe('New folder, relative to the root, next to the ones list_circuits shows (e.g. m2-led)'),
      circuit: z.object({ parts: z.array(partShape) }).passthrough().describe('Circuit file content (see schema/circuit.schema.json)'),
      author: z.string().optional(),
      note: z.string().optional(),
      lang: common.lang,
    },
    annotations: WRITE,
  },
  safely(async ({ target, circuit, author = 'mcp', note = 'create', lang, outputLang }) => {
    const result = createTarget(inside(target), circuit, { author, note, lang, outputLang });
    if (result.errors.length) return { isError: true, content: [{ type: 'text', text: result.errors.map((e) => formatIssue(e, lang)).join('\n') }] };
    const created = loadCircuit(resolveTarget(inside(target)));
    const { issues } = checkCircuit(created);
    const boardId = BOARDS[created.board] ? created.board : 'bb830';
    const board = formatBoardLayout(boardLayout(createBoard(boardId)), pickLanguage(lang, created.lang));
    return json({ target: rel(inside(target)), revision: 0, board, files: relFiles(result.files), issues: issues.map((i) => formatIssue(i, lang)) });
  }),
);

server.registerTool(
  'inspect',
  {
    title: 'Inspect drawing',
    description: 'The drawing in numbers: every lead (hole, group, mm, px), each part box and visible share, label and leader problems, smallest text, plus placement issues. Optionally one part only.',
    inputSchema: { target: targetArg, ...viewArgs, part: z.string().optional().describe('Only this part'), ...common },
    annotations: READ,
  },
  safely(async ({ target, view, fit, scale, part, lang, format }) => {
    const { paths } = existing(target);
    const report = inspectCircuit(loadCircuit(paths), { view, fit, scale, lang });
    if (part) {
      const one = report.parts.find((p) => p.id === part);
      if (!one) throw new Error(`No part ${part}.`);
      const related = [...report.issues, ...report.problems].filter((p) => Object.values(p.params ?? {}).some((v) => String(v).split(', ').includes(part)));
      return json({ part: one, problems: related.map((p) => formatIssue(p, lang)) });
    }
    return answer(format, report, () => formatReport(report, lang));
  }),
);

server.registerTool(
  'query',
  {
    title: 'Query holes and groups',
    description: 'at: who is in a hole and its group · node: a connected group by name (9:a-e, T+) or any of its holes · free: free holes nearest to a hole, group or column.',
    inputSchema: {
      target: targetArg,
      kind: z.enum(['at', 'node', 'free']),
      ref: z.string().optional().describe('Hole for at, group or hole for node, centre for free'),
      limit: z.number().int().positive().optional(),
      empty: z.boolean().optional().describe('free: only groups nobody uses'),
      ...common,
    },
    annotations: READ,
  },
  safely(async ({ target, kind, ref, limit, empty, lang, format }) => {
    const { paths } = existing(target);
    const circuit = loadCircuit(paths);
    if (kind === 'at') return answer(format, queryAt(circuit, ref), () => formatAt(queryAt(circuit, ref), lang));
    if (kind === 'node') return answer(format, queryNode(circuit, ref), () => formatNode(queryNode(circuit, ref), lang));
    const r = queryFree(circuit, { near: ref, limit, emptyNodes: empty });
    return answer(format, r, () => formatFree(r, lang));
  }),
);

server.registerTool(
  'suggest',
  {
    title: 'Suggest placements',
    description:
      'Valid placements for a NEW part, best first, each with the add operation ready for apply_ops and the nearest body with its gap. Never adds errors or warnings (nor, with profile, what that review would block). Use between for two-lead parts (groups in pin order) or connect for named pins; a group can be named by a pin already placed ("R1.2"). parts: several new parts at once, each placed given the ones before it (a later one may name an earlier one\'s pins), answered as one batch of adds; each keeps room (usable holes) for the later parts that name its pins, and checks that the ones hanging from it still fit. Off-board parts (switch, UNO) take connect with the pins in use. When nothing fits, the answer says why (reasons, most frequent first).',
    inputSchema: {
      target: targetArg,
      part: z.object({ type: z.string() }).passthrough().optional().describe('The new part without pins, e.g. {"type":"resistor","value":"1k"}; id optional'),
      between: z.array(z.string().nullable()).optional().describe('Groups, holes or placed pins ("R1.2") for the leads, in pin order; null leaves that lead to a free strip'),
      connect: z.record(z.string(), z.string()).optional().describe('{"pin": "group, hole or placed pin"} for some pins; the rest go to free strips'),
      parts: z
        .array(z.object({ part: z.object({ type: z.string() }).passthrough(), between: z.array(z.string().nullable()).optional(), connect: z.record(z.string(), z.string()).optional(), near: z.string().optional() }))
        .optional()
        .describe('Several new parts in order, each {part, between | connect, near?}, instead of part'),
      near: z.string().optional().describe('Centre of the search: hole, group or column'),
      profile: z.enum(Object.keys(PROFILES)).optional().describe('Also leave out what review with this profile blocks (lesson: parts too close, label trouble); measures both views'),
      limit: z.number().int().positive().optional(),
      window: z.number().positive().optional().describe('Search radius in mm (default 20)'),
      reserve: z.record(z.string(), z.number().int().positive()).optional().describe('{"U1.OUT": 2}: groups that more connections will reach; placements keep that many usable holes there. With parts it is worked out from the later parts.'),
      ...common,
    },
    annotations: READ,
  },
  safely(async ({ target, part, parts, between, connect, near, profile, limit, window, reserve, lang, format }) => {
    const { paths } = existing(target);
    const circuit = loadCircuit(paths);
    if (parts?.length) {
      const many = suggestMany(circuit, parts, { profile, window, reserve });
      return answer(format, many, () => formatSuggestMany(many, lang, { formatIssue }));
    }
    if (!part) throw new Error('Give part (one new part) or parts (several).');
    const result = suggest(circuit, part, { between, connect, near, limit, window, profile, reserve });
    return answer(format, result, () => formatSuggest(result, lang, { formatIssue, target }));
  }),
);

server.registerTool(
  'layout',
  {
    title: 'Lay out a whole circuit',
    description:
      'Place a whole circuit in one call. A usual lesson circuit first: recipe with only the values that change ({"recipe":"npn-switch","values":{"R1":"470"}}; catalog lists the recipes and their values). Otherwise from its parts (no holes, in signal order; a part number, module or alias is enough) and its nets (pins and rails; usual pin names work: D1.K, U1.VIN, U1.DISCH, U1.GPIO4): parts left to right by distance from the source, jumpers for what is left apart, ground nets to a − rail, then the nets check and the lesson review, laid out again a few times and repaired jumper by jumper. On an existing target it lays the circuit out again as one revision (undo restores it): give only what changes; each part keeps its holes when it still fits. The nets are kept in the circuit (spec) and review checks them. The answer ends in STATUS: DONE (ready), CHANGES (created: fix only the ✖ items with suggest and apply_ops, then review), FIX_SPEC (nothing created: fix every ✖ in the spec and call again) or SPEC_OK (check_only).',

    inputSchema: {
      target: z.string().describe('Folder relative to the root (e.g. led-switch): new, or an existing circuit to lay out again'),
      recipe: z.enum(Object.keys(RECIPES)).optional().describe('A lesson circuit by name, instead of parts and nets (never with them). catalog with the name shows its parts, nets and values'),
      values: z
        .record(z.string(), z.union([z.string(), z.number(), z.record(z.string(), z.union([z.string(), z.number(), z.boolean()]))]))
        .optional()
        .describe('With recipe: only what changes, by id. The main value ({"R1":"470","V1":9,"D1":"green","Q1":"BC547"}) or some fields ({"R1":{"value":"470","tolerance":"1%"}})'),
      parts: z.array(z.object({ id: z.string() }).passthrough()).min(1).optional().describe('Required for a new circuit; for an existing one, omit to keep its parts. ' + 'Parts without pins, in signal order: a type ({"id":"R1","type":"resistor","value":"1k"}) or just a part number, module or alias ({"id":"U1","part":"7805"}, {"id":"S1","part":"KCD1"}); no need to look them up in the catalog first. A microcontroller board takes each pin\'s state for the simulation: {"id":"U1","part":"ESP32-DEVKIT","io":{"D13":"high"}}'),
      nets: z
        .array(z.union([z.array(z.string()), z.object({ pins: z.array(z.string()), color: z.string().optional() })]))
        .optional()
        .describe('Each net: the pins it joins ("D1.K", "U1.OUT") and rails ("T-", "B+"), as a list or {pins, color}. Common pin names are understood (A/K or anode/cathode, VIN, VOUT, DISCH, GPIO4, VDD…). A pin alone in a net (["D1.A"]) is fine. Required for a new circuit; for an existing one made by layout, omit to keep its nets.'),
      supplies: z.array(z.object({}).passthrough()).optional().describe('As in the circuit; positive/negative may name a pin ("D1.A"): a free hole of its strip'),
      board: z.string().optional().describe('auto (default, grows in length), bb400 or bb830'),
      title: z.union([z.string(), z.record(z.string(), z.string())]).optional(),
      netLabels: z.record(z.string(), z.string()).optional(),
      page: z.object({}).passthrough().optional().describe('As in the circuit. With a source the page runs the simulation by default (values, oscilloscope, lit LEDs, a Current button not pressed): nothing to add. {"simulation": false} turns it off while a learner must predict a value'),
      clearance: z.number().optional().describe('Gap between bodies in mm (default 1; 3 for a roomier lesson)'),
      expect_revision: z.number().int().min(0).optional().describe('Existing circuit: refuse if it changed since this revision'),
      check_only: z.boolean().optional().describe('Only check the parts and nets (unknown names with the closest ones, nets naming a missing part or pin, parts in no net) and create nothing'),
      author: z.string().optional(),
      note: z.string().optional(),
      lang: common.lang,
    },
    annotations: WRITE,
  },
  safely(async ({ target, recipe, values, parts, nets, supplies, board, title, netLabels, page, clearance, expect_revision: expectRevision, check_only: checkOnly, author = 'layout', note = 'layout', lang, outputLang }) => {
    const full = inside(target);
    const paths = resolveTarget(full);
    const previous = existsSync(paths.circuitFile) ? loadCircuit(paths) : null;
    const fromRecipe = resolveRecipe(Object.fromEntries(Object.entries({ recipe, values, parts, nets, supplies, board, title, netLabels, page, clearance, lang }).filter(([, v]) => v !== undefined)));
    if (fromRecipe.problems.length) return { isError: true, content: [{ type: 'text', text: formatLayout(specProblems(fromRecipe.problems), lang ?? 'en', { t, formatIssue }) }] };
    ({ parts, nets } = fromRecipe.spec);
    const given = fromRecipe.spec;
    const refuse = (code) => ({ isError: true, content: [{ type: 'text', text: formatIssue({ severity: 'error', code, params: { target } }, lang) }] });
    if (previous && !nets && !previous.spec?.nets) return refuse('LAYOUT_NO_SPEC');
    if (!previous && (!parts || !nets)) return refuse('LAYOUT_NEEDS_SPEC');
    const spec = previous ? specFromCircuit(previous, given) : given;
    const result = autoLayout(spec, { checkOnly, previous });
    const out = pickLanguage(lang, spec.lang);
    if (result.checked) return { ...(result.invalid && { isError: true }), content: [{ type: 'text', text: formatLayout(result, out, { t, formatIssue }) }] };
    const saved = previous
      ? relayoutTarget(full, result.circuit, { expectRevision, author, note, lang: lang ?? 'en', outputLang })
      : createTarget(full, result.circuit, { author, note, lang: lang ?? 'en', outputLang });
    if (saved.errors.length) return { isError: true, content: [{ type: 'text', text: saved.errors.map((e) => formatIssue(e, lang)).join('\n') }] };
    return text(`${formatLayout(result, out, { t, formatIssue })}\n${rel(full)} · rev ${saved.revision}`);
  }),
);

server.registerTool(
  'apply_ops',
  {
    title: 'Apply operations',
    description: 'Change a circuit with an atomic batch of operations. dry_run (recommended first) saves nothing and tells what the change fixes and introduces. Without dry_run it saves a new revision, records history and regenerates outputs. Pass expect_revision to avoid overwriting someone else. To change what a circuit made by layout connects, call layout again on it instead.',
    inputSchema: {
      target: targetArg,
      ops: z.array(opShape).min(1),
      dry_run: z.boolean().optional(),
      expect_revision: z.number().int().min(0).optional(),
      author: z.string().optional(),
      note: z.string().optional().describe('Why the change is made'),
      views: z.array(z.enum(Object.keys(VIEWS))).optional().describe('Views to measure (default front)'),
      ...common,
    },
    annotations: WRITE,
  },
  safely(async ({ target, ops, dry_run, expect_revision, author = 'mcp', note = '', views, lang, outputLang, format }) => {
    const { full } = existing(target);
    const result = applyToTarget(full, ops, { dryRun: dry_run, expectRevision: expect_revision, author, note, views, lang, outputLang });
    const out = { ...result, circuit: undefined, files: relFiles(result.files) };
    const response = answer(format, out, () => formatChange(out, lang, { t, formatIssue }));
    return result.errors.length ? { ...response, isError: true } : response;
  }),
);

// apply_ops that can only dry-run: what a read-only role (the reviewer) checks a fix with.
server.registerTool(
  'try_ops',
  {
    title: 'Try operations (dry run)',
    description: 'What a batch of operations would change, without saving anything: the issues it fixes and the ones it introduces, and the new revision it would make. The same operations as apply_ops; use it to check a fix before proposing or applying it.',
    inputSchema: {
      target: targetArg,
      ops: z.array(opShape).min(1),
      views: z.array(z.enum(Object.keys(VIEWS))).optional().describe('Views to measure (default front)'),
      ...common,
    },
    annotations: READ,
  },
  safely(async ({ target, ops, views, lang, format }) => {
    const { full } = existing(target);
    const result = applyToTarget(full, ops, { dryRun: true, views, lang });
    const out = { ...result, circuit: undefined, files: undefined };
    const response = answer(format, out, () => formatChange(out, lang, { t, formatIssue }));
    return result.errors.length ? { ...response, isError: true } : response;
  }),
);

server.registerTool(
  'review',
  {
    title: 'Review circuit',
    description: 'Verdict from measurements in both views: APPROVED or CHANGES, with what must be fixed (blocking: each with the parts it is about and the views it shows in) and what is worth knowing. Profile lesson (default) is strict for teaching layouts; draft only blocks errors and warnings. explain: true adds the profile\'s rules (what blocks). lesson blocks a part hidden in every view (its best view shows less than 70 % of it); a circuit made by layout also has its nets checked against its spec.',
    inputSchema: { target: targetArg, profile: z.enum(Object.keys(PROFILES)).optional(), views: z.array(z.enum(Object.keys(VIEWS))).optional(), explain: z.boolean().optional(), ...common },
    annotations: READ,
  },
  safely(async ({ target, profile, views, explain, lang, format }) => {
    const { paths } = existing(target);
    const result = review(loadCircuit(paths), { profile, views, lang, explain });
    return answer(format, result, () => formatReview(result, lang, { t, formatIssue }));
  }),
);

server.registerTool(
  'simulate',
  {
    title: 'Simulate circuit',
    description:
      'Node voltages and part currents from the circuit (a model, not a measurement). Needs a power source: "supplies" in the circuit (set them with apply_ops, op "circuit"; kind "generator" for a signal generator: waveform, frequency, amplitude, offset) or a battery part (type "battery": format AA/AAA/18650/9V/pouch, chemistry, cells in series, charge). DC operating point by default; transient: stop and step in seconds, capacitors start discharged (start "zero") or at their DC values (start "dc"). Warns about overloads, current limit, short circuits and floating nodes. falstad: true adds the link that opens the same circuit in Falstad CircuitJS (DC state, parts Falstad lacks as equivalents, listed). Never show results a learner is asked to predict, and Falstad shows every value.',
    inputSchema: {
      target: targetArg,
      analysis: z.enum(['dc', 'transient']).optional(),
      stop: z.number().positive().optional().describe('transient end time, s'),
      step: z.number().positive().optional().describe('transient step, s (default stop/1000)'),
      start: z.enum(['zero', 'dc']).optional(),
      falstad: z.boolean().optional().describe('also the link that opens this circuit in Falstad CircuitJS'),
      ...common,
    },
    annotations: READ,
  },
  safely(async ({ target, analysis = 'dc', stop, step, start, falstad = false, lang, format }) => {
    const { paths } = existing(target);
    const circuit = loadCircuit(paths);
    const result = simulate(circuit, { analysis, stop, step, start });
    if (falstad && result.ok) {
      const { program } = compile(circuit);
      const engine = createEngine(program);
      engine.start('dc');
      result.falstad = toFalstad(program, { reading: engine.read(), timeConstants: engine.timeConstants() });
      delete result.falstad.text;
    }
    const response = answer(format, result, () => [formatSimulation(result, lang, { formatIssue, netLabels: circuit.netLabels }), result.falstad && formatFalstad(result.falstad, lang)].filter(Boolean).join('\n\n'));
    return result.ok ? response : { ...response, isError: true };
  }),
);

server.registerTool(
  'undo',
  { title: 'Undo', description: 'Undo the latest change not yet undone (recorded as a new revision).', inputSchema: { target: targetArg, author: z.string().optional(), ...common }, annotations: WRITE },
  safely(async ({ target, author = 'mcp', lang, outputLang, format }) => {
    const { full } = existing(target);
    const result = undoTarget(full, { author, lang, outputLang });
    const out = { ...result, files: relFiles(result.files) };
    const response = answer(format, out, () => formatChange(out, lang, { t, formatIssue }));
    return result.errors.length ? { ...response, isError: true } : response;
  }),
);

server.registerTool(
  'history',
  { title: 'History', description: 'Changes made to a circuit: revision, time, author, note and operations.', inputSchema: { target: targetArg, limit: z.number().int().positive().optional(), ...common }, annotations: READ },
  safely(async ({ target, limit = 20, lang, format }) => {
    const { paths } = existing(target);
    const history = readHistory(paths).slice(-limit);
    return answer(format, history, () => {
      if (!history.length) return t(lang, 'history.empty');
      return history
        .map((h) => {
          const ops = h.ops.map((o) => `${o.op}${o.part ? ` ${typeof o.part === 'string' ? o.part : o.part.id}` : ''}`).join(', ') || (h.created ? 'create' : '—');
          return t(lang, 'history.entry', { revision: h.revision, time: h.time, author: h.author, note: h.note ? ` (${h.note})` : '', ops });
        })
        .join('\n');
    });
  }),
);

server.registerTool(
  'render',
  {
    title: 'Render SVG',
    description: 'Write the drawing as SVG into the circuit outputs and return its path. Add png_width to also get a PNG image back (slow to read: use only to judge style, keep it small, e.g. 900). page: true also rewrites the embeddable page out/<name>.html (every change rewrites it anyway; use this for circuits made before the page existed).',
    inputSchema: {
      target: targetArg,
      ...viewArgs,
      annotate: z.union([z.array(z.enum(ANNOTATION_LAYERS)), z.literal('all')]).optional().describe('Extra layers: pins, boxes, nodes, grid, or all'),
      labels: z.union([z.boolean(), z.enum(['both', 'id', 'value'])]).optional().describe('both (default), id, value, or false'),
      png_width: z.number().int().min(200).max(2000).optional(),
      page: z.boolean().optional().describe('Also rewrite the embeddable page out/<name>.html'),
      focus: z.array(z.string()).optional().describe('Dim everything except these parts (ids) and the strips under their leads; they show even where something covers them.'),
      flow: z.boolean().optional().describe('Conductor view: conductors coloured by voltage, dots of conventional current (+ to −) along strips, leads and wires (still in the SVG, moving in the page). Needs supplies or a battery part.'),
      sim: z.boolean().optional().describe('Draw the DC simulation results (voltages per group, currents per part, labelled MODEL). Needs supplies or a battery part. Never for values a learner must predict.'),
      lang: common.lang,
    },
    annotations: { ...WRITE, idempotentHint: true },
  },
  safely(async ({ target, view = 'front', fit, scale, annotate, labels, png_width, page, sim, focus, flow, lang }) => {
    const { paths } = existing(target);
    const circuit = loadCircuit(paths);
    const { svg, issues } = renderCircuit(circuit, { view, fit, scale, annotate, labels, lang, sim, focus, flow });
    if (!svg) throw new Error(issues.map((i) => formatIssue(i, lang)).join('\n'));
    mkdirSync(paths.outDir, { recursive: true });
    const file = join(paths.outDir, `${paths.name}.${view}${fit === 'parts' ? '.zoom' : ''}${annotate ? '.annotated' : ''}${sim ? '.sim' : ''}${focus?.length ? '.focus' : ''}${flow ? '.flow' : ''}.svg`);
    writeFileSync(file, svg);
    const pageFile = page ? writePage(paths, circuit, { lang }).pageFile : null;
    const content = [{ type: 'text', text: JSON.stringify({ svg: rel(file), ...(pageFile && { page: rel(pageFile) }), bytes: Buffer.byteLength(svg), issues: issues.length }) }];
    if (png_width) {
      if (!(await rasterAvailable())) content.push({ type: 'text', text: 'PNG not available: install @resvg/resvg-js.' });
      else content.push({ type: 'image', mimeType: 'image/png', data: Buffer.from(await svgToPng(svg, { width: png_width })).toString('base64') });
    }
    return { content };
  }),
);

server.registerTool(
  'catalog',
  {
    title: 'Catalog',
    description:
      'What the kit knows. Without name: a compact list (every part type with its pins in order, the part numbers of each type, modules, batteries, boards, views, operations, and the recipes for layout with the values each one can change). With name (a type like "regulator", a part number like "7805", a module like "UNO" or a recipe like "npn-switch"): its pins, package, the fields it takes and a real part from the examples to copy; for a recipe, its parts, nets and values with their choices or range. format "json" without name: every registry in full.',
    inputSchema: { name: z.string().optional().describe('A part type, part number, module or recipe'), ...common },
    annotations: READ,
  },
  safely(async ({ name, lang, format }) => {
    if (name) {
      const entry = catalogEntry(name, lang);
      if (!entry) {
        const close = catalogSuggestions(name);
        return { isError: true, content: [{ type: 'text', text: `${t(lang, 'catalog.unknown', { name, types: Object.keys(PART_TYPES).join(', ') })}${close.length ? ` ${t(lang, 'catalog.closest', { names: close.join(', ') })}` : ''}` }] };
      }
      return answer(format, entry, () => formatCatalogEntry(entry, lang));
    }
    if (format === 'json') return json(fullCatalog(lang));
    return text(formatCompactCatalog(compactCatalog(lang), lang));
  }),
);

server.registerTool(
  'netlist',
  {
    title: 'Netlist',
    description: 'The circuit as electrical nets: board groups joined by jumper wires, with the part pins on each net (part.pin@hole), their labels, and the pins left alone on a net. One call to check every connection against a brief (instead of one query per strip).',
    inputSchema: { target: targetArg, ...common },
    annotations: READ,
  },
  safely(async ({ target, lang, format }) => {
    const { paths } = existing(target);
    const r = nets(loadCircuit(paths));
    return answer(format, r, () => formatNets(r, lang, { t }));
  }),
);

