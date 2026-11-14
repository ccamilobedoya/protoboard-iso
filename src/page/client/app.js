// The page inside an MCP App host (the MCP Apps extension, spec 2026-01-26): a hand-written bridge
// (JSON-RPC 2.0 over postMessage with the host) and what the page does there. Bundled into the
// viewer only (app-page.js, served as ui://protoboard-iso/board.html by the MCP server); the
// standalone page never carries it, so nothing here can run outside a host.
//
// The viewer is fixed: the circuit arrives later. The host sends the tool's result, whose
// structuredContent is { target, revision, lang }; the viewer asks the server's app-only tool
// page_parts for that revision's pieces (src/page.js, renderPageParts), mounts them into its own
// document and starts the page. The pieces never pass through the model.
//
// One way back to the conversation, and a silent one: tapping a part updates the model's context
// (ui/update-model-context: one line, debounced, at most CONTEXT_MAX characters). The viewer never
// sends a message (ui/message): hosts show those under a security warning in the user's message
// box. It was tried and removed (docs/en/mcp-apps.md).
//
// Debugging (the server runs with PROTOBOARD_APPS_DEBUG=1 and says so with the pieces): the viewer
// reports what the host answers (ui/initialize, every context update, errors) through the app-only tool app_report. Nobody can open the devtools of a
// host from the server, so the answer has to travel the other way.

export const PROTOCOL = '2026-01-26';
export const CONTEXT_MAX = 300;
const HEIGHT = 560; // px asked of a host that lets the view choose its height (no scroll inside a card)

// One JSON-RPC peer over postMessage. Messages from anything but the parent are ignored; a request
// from the host (ping, ui/resource-teardown) is answered with an empty result.
export function createBridge(win, target = win.parent) {
  let next = 1;
  const waiting = new Map();
  const handlers = new Map();
  win.addEventListener('message', (e) => {
    const m = e.data;
    if (e.source !== target || !m || m.jsonrpc !== '2.0') return;
    if (!m.method) {
      const w = waiting.get(m.id);
      if (!w) return;
      waiting.delete(m.id);
      if (m.error) w.reject(Object.assign(new Error(m.error.message ?? String(m.error)), { code: m.error.code }));
      else w.resolve(m.result);
      return;
    }
    if (m.id != null) target.postMessage({ jsonrpc: '2.0', id: m.id, result: {} }, '*');
    handlers.get(m.method)?.(m.params ?? {});
  });
  return {
    on: (method, handler) => handlers.set(method, handler),
    notify: (method, params = {}) => target.postMessage({ jsonrpc: '2.0', method, params }, '*'),
    request: (method, params = {}) =>
      new Promise((resolve, reject) => {
        const id = next++;
        waiting.set(id, { resolve, reject });
        target.postMessage({ jsonrpc: '2.0', id, method, params }, '*');
      }),
  };
}

// The circuit's pieces into this document, where the page script then finds them as in a page.
export function mount(doc, parts) {
  const root = doc.documentElement;
  root.lang = parts.lang;
  if (parts.theme) root.dataset.theme = parts.theme;
  doc.title = parts.title;
  for (const [k, v] of Object.entries(parts.body)) doc.body.dataset[k] = v;
  if (parts.css != null) {
    const style = doc.createElement('style');
    style.id = 'caption-face';
    style.textContent = parts.css;
    doc.getElementById('dynamic').before(style);
  }
  doc.body.insertAdjacentHTML('afterbegin', parts.markup);
  const json = (id, value) => {
    const s = doc.createElement('script');
    s.type = 'application/json';
    s.id = id;
    s.textContent = JSON.stringify(value);
    doc.body.appendChild(s);
  };
  json('page-data', parts.data);
  if (parts.program) json('sim-program', parts.program);
}

const fill = (template, params) => template.replace(/\{(\w+)\}/g, (_, k) => (params[k] != null ? String(params[k]) : ''));

// The tapped part in one line: its id, kind and value, and with the results on, the values its
// card shows now (the live page rewrites them every frame).
export function partLine(page, id) {
  const p = page.data.parts[id];
  if (!p) return null;
  const about = [p.value?.text ?? p.type?.text].filter(Boolean);
  if (page.state.results) {
    // The labels of the voltage and current lines as the card shows them now (not their explanations).
    for (const term of page.info.querySelectorAll('.sim .terms > li > .term')) if (['voltage', 'current'].includes(term.dataset.explain)) about.push(term.textContent.trim());
  }
  return { part: id, about: about.join(', ') };
}

// The viewer's reports to the server. Until the pieces say whether debugging is on, they wait.
export function createReporter(bridge) {
  let on = null;
  let count = 0;
  const waiting = [];
  const send = (event, detail) => bridge.request('tools/call', { name: 'app_report', arguments: { event, detail } }).catch(() => {});
  return {
    enable(flag) {
      on = Boolean(flag);
      for (const [event, detail] of waiting.splice(0)) if (on) send(event, detail);
    },
    report(event, detail) {
      if (on === false || ++count > 300) return;
      if (on === null) waiting.length < 40 && waiting.push([event, detail]);
      else send(event, detail);
    },
  };
}

// A request to the host, with what it sent and what came back (result or error) reported.
const asking = (bridge, app, method, params, sent) =>
  bridge.request(method, params).then(
    (result) => {
      app.report(method, { sent, result: result ?? null });
      return result;
    },
    (e) => {
      app.report(method, { sent, error: { code: e.code ?? null, message: e.message } });
      throw e;
    },
  );

const clip = (text, max) => (text.length <= max ? text : `${text.slice(0, max - 1)}…`);

// The page's extension inside a host: the context line.
export function appExtension(bridge, app) {
  return (page) => {
    let timer = null;
    let sent = null;
    const update = () => {
      const line = page.open && !page.open.startsWith('node:') ? partLine(page, page.open) : null;
      const text = line ? clip(fill(app.texts.context, line), CONTEXT_MAX) : '';
      if (text === sent) return;
      sent = text;
      app.contexts.push(text);
      asking(bridge, app, 'ui/update-model-context', { content: text ? [{ type: 'text', text }] : [] }, text).catch(() => {});
    };
    const before = page.cardChanged;
    page.cardChanged = () => {
      before?.();
      clearTimeout(timer);
      timer = setTimeout(update, 400);
    };
  };
}

// A page arrives in chunks (mcp/app.js: a host refuses a tool result over a size; Claude Desktop's is
// 983,040 bytes). `call(args)` is one page_parts call, resolved to its structuredContent. The first
// call, without `chunk`, is the manifest; then each chunk is fetched, a few at a time, each retried
// once if it fails, and the pieces are joined and parsed. The manifest's id pins the revision: the
// server cuts every chunk from the same build.
export const PARALLEL = 4;
export async function fetchPageParts(call, args, { onProgress = () => {}, onRetry = () => {} } = {}) {
  const manifest = await call(args);
  const pinned = { ...args, revision: manifest.revision, id: manifest.id };
  const pieces = new Array(manifest.chunks);
  let next = 0;
  let done = 0;
  onProgress(0, manifest.chunks, manifest);
  const worker = async () => {
    while (next < manifest.chunks) {
      const index = next++;
      let got;
      try {
        got = await call({ ...pinned, chunk: index });
      } catch (first) {
        onRetry(index, first);
        got = await call({ ...pinned, chunk: index }).catch((e) => {
          throw Object.assign(new Error(`chunk ${index + 1}/${manifest.chunks}: ${e.message}`), { chunk: index });
        });
      }
      if (got?.id !== manifest.id || got.index !== index || typeof got.data !== 'string') throw Object.assign(new Error(`chunk ${index + 1}/${manifest.chunks} is not part of this page`), { chunk: index });
      pieces[index] = got.data;
      onProgress(++done, manifest.chunks, manifest);
    }
  };
  await Promise.all(Array.from({ length: Math.min(PARALLEL, manifest.chunks) }, worker));
  const json = pieces.join('');
  if (json.length !== manifest.bytes) throw new Error(`the page came in ${json.length} units of ${manifest.bytes}`);
  return { ...manifest, parts: JSON.parse(json) };
}

// The whole life of the viewer: handshake, the tool's result, the pieces, the page.
export function startApp(win, startPage, liveExtensions) {
  const doc = win.document;
  const bridge = createBridge(win);
  const app = { target: null, contexts: [], times: {}, texts: null, error: null };
  const reporter = createReporter(bridge);
  app.report = reporter.report;
  // Anything that goes wrong in the viewer, as the host would hide it.
  let errors = 0;
  const failed = (what, e) => errors++ < 10 && app.report(what, { message: e?.message ?? String(e), stack: String(e?.stack ?? '').slice(0, 600) });
  win.addEventListener('error', (e) => failed('error', e.error ?? { message: e.message }));
  win.addEventListener('unhandledrejection', (e) => failed('unhandledrejection', e.reason));
  win.protoboardApp = app; // read by tests (scripts/app-host-check.js)
  const say = (text) => {
    const p = doc.createElement('p');
    p.className = 'app-note';
    p.textContent = text;
    doc.body.prepend(p);
    return p;
  };
  let context = {};
  let started = false;
  bridge.on('ui/notifications/host-context-changed', (changes) => Object.assign(context, changes));
  bridge.on('ui/notifications/tool-result', async (result) => {
    const asked = result?.structuredContent;
    if (started || result?.isError || !asked?.target) return; // nothing to draw: the view stays empty
    started = true;
    app.times.result = win.performance.now();
    const size = context.containerDimensions ?? {};
    if (size.height == null) bridge.notify('ui/notifications/size-changed', { height: Math.min(size.maxHeight ?? HEIGHT, HEIGHT) });
    const call = async (args) => {
      app.calls = (app.calls ?? 0) + 1;
      const answer = await bridge.request('tools/call', { name: 'page_parts', arguments: args });
      if (answer?.isError || !answer?.structuredContent) throw new Error(answer?.content?.[0]?.text ?? 'no page');
      return answer.structuredContent;
    };
    let loading = null;
    let texts = null;
    try {
      const request = { target: asked.target, revision: asked.revision, lang: asked.lang };
      const got = await fetchPageParts(call, request, {
        onProgress: (n, total, manifest) => {
          reporter.enable(manifest.debug);
          texts = manifest.texts;
          loading ??= say(fill(manifest.texts.loading, { done: 0, total }));
          loading.textContent = fill(manifest.texts.loading, { done: n, total });
        },
        onRetry: (index, e) => app.report('chunk-retry', { index, message: e.message }),
      });
      loading?.remove();
      app.times.parts = win.performance.now();
      app.target = asked.target;
      // Another revision's pieces, as this view would ask for them (tests: scripts/app-host-check.js).
      app.fetchParts = (revision) => fetchPageParts(call, { ...request, revision }).then((r) => ({ revision: r.parts?.revision, latest: r.latest, values: Object.fromEntries(Object.entries(r.parts?.data?.parts ?? {}).map(([id, part]) => [id, part.value?.text ?? null])) }));
      app.texts = got.texts;
      app.revision = got.parts.revision;
      mount(doc, got.parts);
      startPage([...(got.parts.script === 'live' ? liveExtensions : []), appExtension(bridge, app)]);
      if (got.latest !== got.parts.revision) say(fill(got.texts.newer, { revision: got.parts.revision, latest: got.latest }));
      win.requestAnimationFrame(() => win.requestAnimationFrame(() => (app.times.painted = win.performance.now())));
    } catch (e) {
      loading?.remove();
      app.error = e.message;
      app.report('page-failed', { message: e.message, chunk: e.chunk ?? null });
      say(texts?.failed ? fill(texts.failed, { error: e.message }) : e.message);
    }
  });
  bridge
    .request('ui/initialize', { appInfo: { name: 'protoboard-iso', version: doc.documentElement.dataset.version ?? '0' }, appCapabilities: {}, protocolVersion: PROTOCOL })
    .then((answer) => {
      context = { ...(answer?.hostContext ?? {}) };
      app.report('ui/initialize', { protocolVersion: answer?.protocolVersion, hostInfo: answer?.hostInfo, hostCapabilities: answer?.hostCapabilities });
      app.report('ui/initialize.hostContext', answer?.hostContext);
      bridge.notify('ui/notifications/initialized', {});
    })
    .catch((e) => {
      app.error = e.message;
      app.report('ui/initialize', { error: { code: e.code ?? null, message: e.message } });
    });
  return app;
}
