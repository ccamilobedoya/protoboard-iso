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
//   APP_TOOLS          page_parts { target, revision?, lang? }: the pieces (renderPageParts) of that
//                      revision, rebuilt from the history when it is older; only the app may call it.
//                      With PROTOBOARD_APPS_DEBUG=1 also app_report { event, detail }: the viewer's
//                      diagnostics (what the host answered it), one JSON line each in
//                      <root>/.app-report.jsonl (stops at 256 KB; detail cut at 4 KB)
//   renderForApps(d)   render's description for a client that shows the viewer: no push to PNG

import { readFileSync, existsSync, statSync, appendFileSync } from 'node:fs';
import { resolve, relative, sep } from 'node:path';
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

function pageParts({ target, revision, lang }) {
  const full = resolve(ROOT, String(target));
  if (full !== ROOT && !full.startsWith(ROOT + sep)) return fail(`"${target}" is outside the allowed folder.`);
  const paths = resolveTarget(full);
  if (!existsSync(paths.circuitFile)) return fail(`No circuit at "${target}".`);
  const current = loadCircuit(paths);
  const latest = current.revision ?? 0;
  // An older revision is rebuilt from the history (inverses); one that cannot be gives the current.
  const circuit = revision != null && revision !== latest ? (circuitAt(paths, revision) ?? current) : current;
  const out = pickLanguage(lang, circuit.lang);
  const { parts, issues } = renderPageParts(circuit, { lang: out });
  if (!parts) return fail(issues.map((i) => i.code).join(', ') || 'nothing to draw');
  const texts = Object.fromEntries(['context', 'newer'].map((k) => [k, t(out, `page.app.${k}`)]));
  return {
    content: [{ type: 'text', text: `${relative(ROOT, full) || '.'} · rev ${parts.revision}` }],
    structuredContent: { target: relative(ROOT, full) || '.', latest, parts, texts, ...(DEBUG && { debug: true }) },
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
      description: 'For the board viewer: a revision\'s page in pieces.',
      inputSchema: { target: z.string(), revision: z.number().int().min(0).optional(), lang: z.enum(Object.keys(LANGUAGES)).optional() },
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
