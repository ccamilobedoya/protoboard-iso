// The circuit live inside the conversation, for hosts that support MCP Apps (the extension
// io.modelcontextprotocol/ui, spec 2026-01-26): the viewer resource, the app-only tool that hands
// it a circuit's page in pieces, and what the tools linked to the viewer add to their result.
// Everything here is offered only to a client that announces the extension (server.js): any other
// client sees the same tools, descriptions and answers as before.
//
//   VIEWER_URI         ui://protoboard-iso/board.html, text/html;profile=mcp-app (src/page.js,
//                      renderAppViewer): the page's CSS and script, no circuit
//   APP_LINKED         tools whose saved result the host shows in the viewer (a dry run never does) (their _meta.ui.resourceUri)
//   appView(result)    { target, revision, lang } a linked tool's handler puts beside its answer
//                      (as `app`); server.js turns it into structuredContent, or drops it
//   APP_TOOLS          page_parts { target, revision?, lang?, chunk?, id? }: the pieces (renderPageParts)
//                      of that revision, rebuilt from the history when it is older, as a manifest and
//                      then chunks under RESULT_MAX each; only the app may call it.
//                      With PROTOBOARD_APPS_DEBUG=1 also app_report { event, detail }: the viewer's
//                      diagnostics (what the host answered it), one JSON line each in
//                      <root>/.app-report.jsonl (stops at 256 KB; detail cut at 4 KB)
//   renderForApps(d)   render's description for a client that shows the viewer: no push to PNG

import { readFileSync, existsSync, statSync, appendFileSync, writeFileSync, renameSync, rmSync, readdirSync, mkdirSync } from 'node:fs';
import { resolve, relative, sep, join, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { renderPageParts, renderAppViewer } from '../src/page.js';
import { resolveTarget, circuitAt, loadCircuit } from '../src/node/workspace.js';
import { LANGUAGES, pickLanguage, t } from '../src/i18n/index.js';

export const EXTENSION = 'io.modelcontextprotocol/ui';
export const VIEWER_URI = 'ui://protoboard-iso/board.html';
export const VIEWER_MIME = 'text/html;profile=mcp-app';
export const APP_LINKED = ['layout', 'apply_ops', 'undo'];
export const DEBUG = process.env.PROTOBOARD_APPS_DEBUG === '1';
// The server's own state, in one hidden folder of the root (listings skip it, deleting it is always
// safe): the viewer's selection, the assembled pages being handed over, the debug report. Every write
// is a temp file renamed into place, so two processes of one host never see half a file.
export const STATE_DIR = '.protoboard';
export const REPORT_FILE = `${STATE_DIR}/app-report.jsonl`;
export const REPORT_MAX = 256 * 1024;
export const DETAIL_MAX = 4096;
const PNG_ADVICE = ' Add png_width to also get a PNG image back (slow to read: use only to judge style, keep it small, e.g. 900).';
export const renderForApps = (description) => description.replace(PNG_ADVICE, ' The user already sees the circuit as a live board in the chat: do not ask for a PNG.');
const VERSION = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')).version;
const ROOT = resolve(process.env.PROTOBOARD_ROOT ?? process.cwd());

// A client that can show the viewer: it lists our mime type under the extension.
export const supportsApps = (capabilities) => Boolean(capabilities?.extensions?.[EXTENSION]?.mimeTypes?.includes?.(VIEWER_MIME));

export const linkedMeta = { ui: { resourceUri: VIEWER_URI } };

// The viewer's resource: no outside origin, so the host's restrictive default CSP applies.
export const VIEWER = {
  name: 'board',
  uri: VIEWER_URI,
  config: { title: 'Breadboard', description: 'The circuit\'s live page: tap parts, layers, sliders, oscilloscope.', mimeType: VIEWER_MIME, _meta: { ui: { prefersBorder: true } } },
  read: () => ({ contents: [{ uri: VIEWER_URI, mimeType: VIEWER_MIME, text: renderAppViewer({ version: VERSION }), _meta: { ui: { prefersBorder: true } } }] }),
};

const fail = (text) => ({ isError: true, content: [{ type: 'text', text }] });

// The most a tool result of the viewer's may weigh, as the serialized JSON-RPC result. Claude Desktop
// refuses a result over 983,040 bytes (seen 2026-11-14, also for calls the viewer makes), and a page's
// pieces go from 0.6 to 1.5 MB: page_parts hands them over in chunks of at most CHUNK_BYTES.
export const RESULT_MAX = 256 * 1024;
export const CHUNK_BYTES = 200 * 1024; // of the chunk's text as JSON escapes it: room left for the wrapper

// Where to cut the text so that each piece, serialized as a JSON string, is at most `budget` bytes.
// Cuts are indices in UTF-16 units and never fall inside a surrogate pair.
export function cutPoints(text, budget = CHUNK_BYTES) {
  const cuts = [0];
  let used = 0;
  for (let i = 0; i < text.length; ) {
    const c = text.charCodeAt(i);
    let units = 1;
    let bytes;
    if (c === 34 || c === 92 || c === 8 || c === 9 || c === 10 || c === 12 || c === 13) bytes = 2;
    else if (c < 0x20) bytes = 6;
    else if (c < 0x80) bytes = 1;
    else if (c < 0x800) bytes = 2;
    else if (c >= 0xd800 && c <= 0xdbff && (text.charCodeAt(i + 1) & 0xfc00) === 0xdc00) {
      bytes = 4;
      units = 2;
    } else if (c >= 0xd800 && c <= 0xdfff) bytes = 6; // a lone surrogate is escaped as \udXXX
    else bytes = 3;
    if (used + bytes > budget) {
      cuts.push(i);
      used = 0;
    }
    used += bytes;
    i += units;
  }
  cuts.push(text.length);
  return cuts;
}

// The assembled pages being handed over live in files, not in memory: a host may run two processes of
// this server and send the manifest to one and the chunks to the other. A page is written once, when
// its manifest is first asked for (.protoboard/pages/<circuit hash>.<revision>.<id>.json: the parts'
// JSON), and every chunk is cut from the file. A chunk whose file is gone is rebuilt at the pinned
// revision, which must hash to the same id. Pruned on write: the newest PAGES_PER_TARGET revisions of a
// circuit, PAGES_MAX files, PAGES_MAX_BYTES, and nothing older than PAGES_TTL.
export const PAGES_DIR = `${STATE_DIR}/pages`;
export const PAGES_PER_TARGET = 2;
export const PAGES_MAX = 64;
export const PAGES_MAX_BYTES = 64 * 1024 * 1024;
export const PAGES_TTL = 7 * 24 * 3600e3;
const targetKey = (key) => createHash('sha1').update(key).digest('hex').slice(0, 12);

// Writes `content` to `file` atomically (a temp file in the same folder, then rename).
function writeAtomic(file, content) {
  mkdirSync(dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}.tmp`;
  try {
    writeFileSync(temp, content);
    renameSync(temp, file);
  } catch (e) {
    rmSync(temp, { force: true });
    throw e;
  }
}

function prunePages(dir, keep) {
  let files;
  try {
    files = readdirSync(dir)
      .map((name) => {
        const m = /^([0-9a-f]{12})\.(\d+)\.([0-9a-f]{16})\.json$/.exec(name);
        if (!m) return null;
        const st = statSync(join(dir, name));
        return { name, key: m[1], revision: Number(m[2]), mtime: st.mtimeMs, size: st.size };
      })
      .filter(Boolean);
  } catch {
    return;
  }
  const now = Date.now();
  const drop = new Set(files.filter((f) => now - f.mtime > PAGES_TTL).map((f) => f.name));
  const byKey = Map.groupBy(files.filter((f) => !drop.has(f.name)), (f) => f.key);
  for (const group of byKey.values()) {
    const revisions = [...new Set(group.map((f) => f.revision))].sort((x, y) => y - x).slice(0, PAGES_PER_TARGET);
    for (const f of group) if (!revisions.includes(f.revision) && f.name !== keep) drop.add(f.name);
  }
  let rest = files.filter((f) => !drop.has(f.name)).sort((x, y) => y.mtime - x.mtime);
  let bytes = 0;
  rest.forEach((f, i) => {
    bytes += f.size;
    if ((i >= PAGES_MAX || bytes > PAGES_MAX_BYTES) && f.name !== keep) drop.add(f.name);
  });
  for (const name of drop) rmSync(join(dir, name), { force: true });
}

function assemble({ target, revision, lang }) {
  const full = resolve(ROOT, String(target));
  if (full !== ROOT && !full.startsWith(ROOT + sep)) return { error: `"${target}" is outside the allowed folder.` };
  const paths = resolveTarget(full);
  if (!existsSync(paths.circuitFile)) return { error: `No circuit at "${target}".` };
  const current = loadCircuit(paths);
  const latest = current.revision ?? 0;
  // An older revision is rebuilt from the history (inverses); one that cannot be gives the current.
  const circuit = revision != null && revision !== latest ? (circuitAt(paths, revision) ?? current) : current;
  const out = pickLanguage(lang, circuit.lang);
  const { parts, issues } = renderPageParts(circuit, { lang: out });
  if (!parts) return { error: issues.map((i) => i.code).join(', ') || 'nothing to draw' };
  const json = JSON.stringify(parts);
  const id = createHash('sha1').update(json).digest('hex').slice(0, 16);
  const key = relative(ROOT, full) || '.';
  const texts = Object.fromEntries(['context', 'newer', 'loading', 'failed'].map((k) => [k, t(out, `page.app.${k}`)]));
  return { page: { id, json, revision: parts.revision, latest, texts, target: key, key } };
}

// The page's file, written if it is not there yet (a failed write is no reason to fail the call).
function keepPage(page) {
  const dir = resolve(ROOT, PAGES_DIR);
  const name = `${targetKey(page.key)}.${page.revision}.${page.id}.json`;
  if (!existsSync(join(dir, name))) {
    try {
      writeAtomic(join(dir, name), page.json);
      prunePages(dir, name);
    } catch {
      // read-only root: the page is served from this build
    }
  }
}

// Where the chunks of a page end: a pure function of its text, remembered for the last few pages only
// to spare the scan (nothing depends on it: a process that lacks it computes it again).
const cutMemo = new Map();
function cutsOf(json, id) {
  if (cutMemo.has(id)) return cutMemo.get(id);
  const cuts = cutPoints(json);
  cutMemo.set(id, cuts);
  while (cutMemo.size > 4) cutMemo.delete(cutMemo.keys().next().value);
  return cuts;
}

// No `chunk`: the manifest of the page (its revision, how many chunks, an id that pins the content).
// With `chunk` and `revision` (the manifest's) and `id`: that piece of the page's JSON.
function pageParts({ target, revision, lang, chunk, id }) {
  let json = null;
  let page = null;
  if (chunk != null && id) {
    const full = resolve(ROOT, String(target));
    if (full !== ROOT && !full.startsWith(ROOT + sep)) return fail(`"${target}" is outside the allowed folder.`);
    try {
      json = readFileSync(join(resolve(ROOT, PAGES_DIR), `${targetKey(relative(ROOT, full) || '.')}.${revision}.${String(id).replace(/[^0-9a-f]/g, '')}.json`), 'utf8');
    } catch {
      json = null;
    }
  }
  if (json == null) {
    const built = assemble({ target, revision, lang });
    if (built.error) return fail(built.error);
    page = built.page;
    if (id && page.id !== id) return fail('The circuit changed while the page was loading: open it again.');
    if (chunk == null || id) keepPage(page);
    json = page.json;
  }
  const cuts = cutsOf(json, page?.id ?? id);
  const chunks = cuts.length - 1;
  if (chunk == null) {
    return {
      content: [{ type: 'text', text: `${page.target} · rev ${page.revision}` }],
      structuredContent: { target: page.target, latest: page.latest, revision: page.revision, id: page.id, chunks, bytes: json.length, texts: page.texts, ...(DEBUG && { debug: true }) },
    };
  }
  if (chunk < 0 || chunk >= chunks) return fail(`No chunk ${chunk}: the page has ${chunks}.`);
  return {
    content: [{ type: 'text', text: `chunk ${chunk + 1}/${chunks}` }],
    structuredContent: { id, index: chunk, data: json.slice(cuts[chunk], cuts[chunk + 1]) },
  };
}

// What the user last tapped in the viewer. A host with a local connector does not let the model read
// what the widget knows (nor call the widget's tools), so the viewer tells the server (selection_set,
// app-only) and the model asks it (selection, a model-visible tool offered to the same clients as the
// viewer). A host may run two processes of this server for one session (Claude Desktop does), the
// viewer's calls landing in one and the model's in the other: so the state is a hidden file in the
// root (SELECTION_FILE, next to the debug report), written atomically (temp file + rename), read on
// every call, at most SELECTION_KEEP circuits and SELECTION_TTL old. A root that cannot be written
// falls back to this process's memory, and `selection` says once that it cannot be shared.
export const SELECTION_FILE = `${STATE_DIR}/selection.json`;
export const SELECTION_KEEP = 32;
export const SELECTION_TTL = 24 * 3600e3;
const memory = new Map(); // only the fallback: what this process could not write to the file
let unshared = false;
let saidUnshared = false;
const ago = (ms) => (ms < 90e3 ? `${Math.max(1, Math.round(ms / 1000))} s` : ms < 90 * 60e3 ? `${Math.round(ms / 60e3)} min` : `${Math.round(ms / 3600e3)} h`);

// The entries now (target -> { revision, part, line, at }), the old ones dropped.
function readSelections() {
  let entries = {};
  try {
    const data = JSON.parse(readFileSync(resolve(ROOT, SELECTION_FILE), 'utf8'));
    if (data && typeof data.entries === 'object') entries = data.entries;
  } catch {
    // none yet, or unreadable: as if empty
  }
  for (const [key, value] of memory) if (!entries[key] || entries[key].at < value.at) entries[key] = value;
  const now = Date.now();
  return Object.fromEntries(Object.entries(entries).filter(([, e]) => e && typeof e.at === 'number' && now - e.at < SELECTION_TTL).sort((x, y) => x[1].at - y[1].at).slice(-SELECTION_KEEP));
}

function selectionSet({ target, revision, part, line }) {
  const full = resolve(ROOT, String(target));
  if (full !== ROOT && !full.startsWith(ROOT + sep)) return fail(`"${target}" is outside the allowed folder.`);
  const key = relative(ROOT, full) || '.';
  const entry = { revision, part: part ?? null, line: part ? String(line).slice(0, 300) : '', at: Date.now() };
  const entries = readSelections();
  delete entries[key];
  entries[key] = entry;
  const kept = Object.fromEntries(Object.entries(entries).slice(-SELECTION_KEEP));
  try {
    writeAtomic(resolve(ROOT, SELECTION_FILE), JSON.stringify({ entries: kept }));
    memory.clear();
    unshared = false;
  } catch {
    memory.set(key, entry);
    while (memory.size > SELECTION_KEEP) memory.delete(memory.keys().next().value);
    unshared = true;
  }
  return { content: [{ type: 'text', text: 'ok' }] };
}

function selectionGet({ target }) {
  const entries = readSelections();
  let key = null;
  if (target != null) {
    const full = resolve(ROOT, String(target));
    if (full !== ROOT && !full.startsWith(ROOT + sep)) return fail(`"${target}" is outside the allowed folder.`);
    key = relative(ROOT, full) || '.';
  } else key = Object.keys(entries).at(-1) ?? null;
  const got = key != null ? entries[key] : null;
  let lang = process.env.PROTOBOARD_LANG ?? 'en';
  let latest = null;
  if (got) {
    const paths = resolveTarget(resolve(ROOT, key));
    if (existsSync(paths.circuitFile)) {
      const circuit = loadCircuit(paths);
      latest = circuit.revision ?? 0;
      lang = pickLanguage(undefined, circuit.lang);
    }
  }
  const warn = unshared && !saidUnshared ? ` ${t(lang, 'app.selection.unshared')}` : '';
  if (unshared) saidUnshared = true;
  if (!got?.part) return { content: [{ type: 'text', text: t(lang, 'app.selection.none') + warn }] };
  const newer = latest != null && latest !== got.revision ? t(lang, 'app.selection.newer', { latest }) : '';
  return { content: [{ type: 'text', text: t(lang, 'app.selection', { ago: ago(Date.now() - got.at), line: got.line, target: key, revision: got.revision, newer }) + warn }] };
}

// One line of the viewer's diagnostics. The file is fixed inside the root; it stops growing at REPORT_MAX.
function appReport({ event, detail }) {
  const file = resolve(ROOT, REPORT_FILE);
  if (relative(ROOT, file) !== REPORT_FILE) return fail('The report file is outside the allowed folder.');
  let size = 0;
  try {
    size = statSync(file).size;
  } catch {
    // not written yet
  }
  if (size >= REPORT_MAX) return { content: [{ type: 'text', text: 'full' }] };
  let shown = detail ?? null;
  const json = JSON.stringify(shown) ?? 'null';
  if (Buffer.byteLength(json) > DETAIL_MAX) shown = `${Buffer.from(json).subarray(0, DETAIL_MAX).toString()}…[cut]`;
  mkdirSync(dirname(file), { recursive: true });
  appendFileSync(file, `${JSON.stringify({ t: new Date().toISOString(), event: String(event).slice(0, 100), detail: shown })}\n`);
  return { content: [{ type: 'text', text: 'ok' }] };
}

export const APP_TOOLS = [
  {
    name: 'page_parts',
    config: {
      title: 'Page pieces (viewer only)',
      description: 'For the board viewer: a revision\'s page, as a manifest and then chunks.',
      inputSchema: { target: z.string(), revision: z.number().int().min(0).optional(), lang: z.enum(Object.keys(LANGUAGES)).optional(), chunk: z.number().int().min(0).optional(), id: z.string().max(40).optional() },
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
      _meta: { ui: { resourceUri: VIEWER_URI, visibility: ['app'] } },
    },
    handler: async (args) => {
      try {
        return pageParts(args);
      } catch (e) {
        return fail(e.message);
      }
    },
  },
  {
    name: 'selection_set',
    config: {
      title: 'Selection (viewer only)',
      description: 'For the board viewer: the part the user tapped.',
      inputSchema: { target: z.string().max(200), revision: z.number().int().min(0), part: z.string().max(60).nullable(), line: z.string().max(400) },
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
      _meta: { ui: { resourceUri: VIEWER_URI, visibility: ['app'] } },
    },
    handler: async (args) => {
      try {
        return selectionSet(args);
      } catch (e) {
        return fail(e.message);
      }
    },
  },
  // For the model, offered with the viewer: the viewer's state it cannot read from the widget.
  {
    name: 'selection',
    config: {
      title: 'Selection',
      description: 'What the user last tapped on the live board shown in the chat: part, readings, how long ago. Use when they say "this" or point at something.',
      inputSchema: { target: z.string().optional() },
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    },
    handler: async (args) => {
      try {
        return selectionGet(args);
      } catch (e) {
        return fail(e.message);
      }
    },
  },
  ...(DEBUG
    ? [
        {
          name: 'app_report',
          config: {
            title: 'Viewer report (viewer only)',
            description: 'For the board viewer: one diagnostic line for the server\'s log.',
            inputSchema: { event: z.string().max(100), detail: z.unknown().optional() },
            annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
            _meta: { ui: { resourceUri: VIEWER_URI, visibility: ['app'] } },
          },
          handler: async (args) => {
            try {
              return appReport(args);
            } catch (e) {
              return fail(e.message);
            }
          },
        },
      ]
    : []),
];

// What a linked tool returns beside its text for the viewer: which circuit and revision.
export const appView = (target, revision, lang) => ({ target, revision, lang });
