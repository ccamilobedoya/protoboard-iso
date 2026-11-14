// The circuit live inside the conversation, for hosts that support MCP Apps (the extension
// io.modelcontextprotocol/ui, spec 2026-01-26): the viewer resource, the app-only tool that hands
// it a circuit's page in pieces, and what the tools linked to the viewer add to their result.
// Everything here is offered only to a client that announces the extension (server.js): any other
// client sees the same tools, descriptions and answers as before.
//
//   VIEWER_URI         ui://protoboard-iso/board.html, text/html;profile=mcp-app (src/page.js,
//                      renderAppViewer): the page's CSS and script, no circuit
//   APP_LINKED         tools whose result the host shows in the viewer (their _meta.ui.resourceUri)
//   appView(result)    { target, revision, lang } a linked tool's handler puts beside its answer
//                      (as `app`); server.js turns it into structuredContent, or drops it
//   APP_TOOLS          page_parts { target, revision?, lang?, chunk?, id? }: the pieces (renderPageParts)
//                      of that revision, rebuilt from the history when it is older, as a manifest and
//                      then chunks under RESULT_MAX each; only the app may call it.
//                      With PROTOBOARD_APPS_DEBUG=1 also app_report { event, detail }: the viewer's
//                      diagnostics (what the host answered it), one JSON line each in
//                      <root>/.app-report.jsonl (stops at 256 KB; detail cut at 4 KB)
//   renderForApps(d)   render's description for a client that shows the viewer: no push to PNG

import { readFileSync, existsSync, statSync, appendFileSync } from 'node:fs';
import { resolve, relative, sep } from 'node:path';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { renderPageParts, renderAppViewer } from '../src/page.js';
import { resolveTarget, circuitAt, loadCircuit } from '../src/node/workspace.js';
import { LANGUAGES, pickLanguage, t } from '../src/i18n/index.js';

export const EXTENSION = 'io.modelcontextprotocol/ui';
export const VIEWER_URI = 'ui://protoboard-iso/board.html';
export const VIEWER_MIME = 'text/html;profile=mcp-app';
export const APP_LINKED = ['layout'];
export const DEBUG = process.env.PROTOBOARD_APPS_DEBUG === '1';
export const REPORT_FILE = '.app-report.jsonl';
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

// The last few assembled pages, so the chunks of one page are cut from one build. A page is rebuilt
// from the history when it is gone (the revision is pinned), and must hash to the same id.
const KEEP = 3;
const assembled = new Map();

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
  const texts = Object.fromEntries(['context', 'newer', 'loading', 'failed'].map((k) => [k, t(out, `page.app.${k}`)]));
  return { page: { id, json, cuts: cutPoints(json), revision: parts.revision, latest, texts, target: relative(ROOT, full) || '.' } };
}

// No `chunk`: the manifest of the page (its revision, how many chunks, an id that pins the content).
// With `chunk` and `revision` (the manifest's) and `id`: that piece of the page's JSON.
function pageParts({ target, revision, lang, chunk, id }) {
  const kept = id ? assembled.get(id) : null;
  let page = kept;
  if (!page) {
    const built = assemble({ target, revision, lang });
    if (built.error) return fail(built.error);
    page = built.page;
    if (id && page.id !== id) return fail('The circuit changed while the page was loading: open it again.');
    assembled.set(page.id, page);
    while (assembled.size > KEEP) assembled.delete(assembled.keys().next().value);
  } else {
    assembled.delete(id); // most recent last
    assembled.set(id, page);
  }
  const chunks = page.cuts.length - 1;
  if (chunk == null) {
    return {
      content: [{ type: 'text', text: `${page.target} · rev ${page.revision}` }],
      structuredContent: { target: page.target, latest: page.latest, revision: page.revision, id: page.id, chunks, bytes: page.json.length, texts: page.texts, ...(DEBUG && { debug: true }) },
    };
  }
  if (chunk < 0 || chunk >= chunks) return fail(`No chunk ${chunk}: the page has ${chunks}.`);
  return {
    content: [{ type: 'text', text: `chunk ${chunk + 1}/${chunks}` }],
    structuredContent: { id: page.id, index: chunk, data: page.json.slice(page.cuts[chunk], page.cuts[chunk + 1]) },
  };
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
