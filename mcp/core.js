// The MCP server of protoboard-iso, without its transport (server.js: stdio; http.js: local HTTP
// for testing an MCP App host). The tools are defined in tools.js; their handlers run
// in a worker (kit-worker.js). Before each call the server checks whether the kit's code (src/ and
// the tools) changed since the worker started; if so it starts a new worker, so the answers and the
// pages written always come from the current code, without reconnecting. Changing a tool's name or
// its input schema still needs a reconnect: the answer says so.
//
// Environment: PROTOBOARD_ROOT, PROTOBOARD_LANG (see tools.js), PROTOBOARD_APPS and PROTOBOARD_APPS_DEBUG (below).
//
// MCP Apps (app.js): a client that announces the extension also gets the viewer resource, the
// app-only tool page_parts and, on the tools in APP_LINKED, _meta.ui.resourceUri and a small
// structuredContent. Every other client gets exactly what it got before. PROTOBOARD_APPS=on offers
// them to every client (a host that shows MCP Apps without announcing it, as the reference
// basic-host does), off to none; auto (default) follows the announcement. PROTOBOARD_APPS_DEBUG=1
// also registers the app-only tool app_report (app.js).

import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Worker } from 'node:worker_threads';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { TOOLS, INSTRUCTIONS, VERSION } from './tools.js';
import { APP_TOOLS, APP_LINKED, VIEWER, linkedMeta, supportsApps, renderForApps } from './app.js';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const WATCHED = [join(HERE, '..', 'src'), join(HERE, 'tools.js'), join(HERE, 'kit-worker.js'), join(HERE, 'app.js')];

// The newest modification time of the kit's code: a cheap stat walk (a few hundred files).
function codeStamp() {
  let newest = 0;
  const walk = (path) => {
    let s;
    try {
      s = statSync(path);
    } catch {
      return;
    }
    if (s.isDirectory()) for (const name of readdirSync(path)) walk(join(path, name));
    else if (/\.(m?js|json)$/.test(path) && s.mtimeMs > newest) newest = s.mtimeMs;
  };
  WATCHED.forEach(walk);
  return newest;
}

const registered = [...TOOLS, ...APP_TOOLS].map((tool) => tool.name);
let worker = null;
let stamp = 0;
let ready = null;
let next = 1;
const pending = new Map();

function startWorker() {
  stamp = codeStamp();
  const w = new Worker(new URL('./kit-worker.js', import.meta.url));
  worker = w;
  ready = new Promise((resolveReady, rejectReady) => {
    w.on('message', (msg) => {
      if (msg.ready) return resolveReady(msg.tools);
      const done = pending.get(msg.id);
      if (!done) return;
      pending.delete(msg.id);
      done.resolve(msg.result);
    });
    w.on('error', (e) => {
      rejectReady(e);
      for (const [id, done] of pending) {
        if (done.worker !== w) continue;
        pending.delete(id);
        done.resolve({ isError: true, content: [{ type: 'text', text: `The kit failed: ${e.message}` }] });
      }
      if (worker === w) worker = null;
    });
    w.on('exit', () => {
      if (worker === w) worker = null;
    });
  });
  ready.catch(() => {});
}

async function call(name, args) {
  const notes = [];
  if (worker && codeStamp() !== stamp) {
    worker.terminate();
    worker = null;
    notes.push('The kit\'s code changed: reloaded it before answering.');
  }
  if (!worker) startWorker();
  let tools;
  try {
    tools = await ready;
  } catch (e) {
    worker = null;
    return { isError: true, content: [{ type: 'text', text: `The kit does not load (fix it and call again): ${e.message}` }] };
  }
  if (notes.length && (tools.length !== registered.length || tools.some((n) => !registered.includes(n)))) {
    notes.push('Its list of tools changed too: reconnect the MCP server (/mcp) to see the new ones.');
  }
  const w = worker;
  const id = next++;
  const result = await new Promise((resolveCall) => {
    pending.set(id, { resolve: resolveCall, worker: w });
    w.postMessage({ id, name, args });
  });
  return notes.length ? { ...result, content: [...(result.content ?? []), { type: 'text', text: notes.join(' ') }] } : result;
}

// A linked tool's handler puts the viewer's data beside its answer (`app`): it becomes the
// result's structuredContent for a client that shows the viewer, and is dropped for any other.
// `appNote`: one last line of text, only for that client (the model need not draw what is on screen).
const forClient = (result, apps) => {
  const { app, appNote, ...rest } = result ?? {};
  if (!apps || !app || rest.isError) return rest;
  return { ...rest, content: appNote ? [...(rest.content ?? []), { type: 'text', text: appNote }] : rest.content, structuredContent: app };
};

// One server per connection (stdio has one; http.js one per session); the worker is shared.
export function createServer() {
  const server = new McpServer({ name: 'protoboard-iso', version: VERSION }, { instructions: INSTRUCTIONS });
  let apps = false;
  const tools = Object.fromEntries(TOOLS.map((tool) => [tool.name, server.registerTool(tool.name, tool.config, async (args) => forClient(await call(tool.name, args), apps))]));
  // Registered but hidden until the client says it shows MCP Apps. Fields set directly: the SDK's
  // update() would send a list_changed notification for nothing.
  const appOnly = APP_TOOLS.map((tool) => server.registerTool(tool.name, tool.config, (args) => call(tool.name, args)));
  const viewer = server.registerResource(VIEWER.name, VIEWER.uri, VIEWER.config, () => call(`resource:${VIEWER.uri}`, {}));
  for (const item of [...appOnly, viewer]) item.enabled = false;
  server.server.oninitialized = () => {
    const mode = process.env.PROTOBOARD_APPS ?? 'auto';
    apps = mode === 'on' || (mode === 'auto' && supportsApps(server.server.getClientCapabilities()));
    if (!apps) return;
    for (const item of [...appOnly, viewer]) item.enabled = true;
    for (const name of APP_LINKED) tools[name]._meta = linkedMeta;
    tools.render.description = renderForApps(tools.render.description);
  };
  return server;
}

startWorker();
