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
// Two ways back to the conversation, both short: tapping a part updates the model's context
// (ui/update-model-context: one line, debounced, at most CONTEXT_MAX characters), and the button
// "Ask about this part" in the part's card sends a chat message (ui/message).

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
      if (m.error) w.reject(new Error(m.error.message ?? String(m.error)));
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

const clip = (text, max) => (text.length <= max ? text : `${text.slice(0, max - 1)}…`);

// The page's extension inside a host: the context line and the card's button.
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
      bridge.request('ui/update-model-context', { content: text ? [{ type: 'text', text }] : [] }).catch(() => {});
    };
    const before = page.cardChanged;
    page.cardChanged = () => {
      before?.();
      const id = page.open;
      if (id && !id.startsWith('node:') && !page.info.hidden && page.data.parts[id]) {
        const row = document.createElement('p');
        row.className = 'app-ask';
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'link';
        b.textContent = app.texts.ask;
        b.addEventListener('click', () => {
          const line = partLine(page, id);
          const text = fill(app.texts.question, { ...line, target: app.target });
          app.messages.push(text);
          bridge.request('ui/message', { role: 'user', content: [{ type: 'text', text }] }).catch(() => {});
        });
        row.appendChild(b);
        page.info.appendChild(row);
      }
      clearTimeout(timer);
      timer = setTimeout(update, 400);
    };
  };
}

// The whole life of the viewer: handshake, the tool's result, the pieces, the page.
export function startApp(win, startPage, liveExtensions) {
  const doc = win.document;
  const bridge = createBridge(win);
  const app = { target: null, contexts: [], messages: [], times: {}, texts: null, error: null };
  win.protoboardApp = app; // read by tests (scripts/app-host-check.js)
  const say = (text) => {
    const p = doc.createElement('p');
    p.className = 'app-note';
    p.textContent = text;
    doc.body.prepend(p);
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
    try {
      const answer = await bridge.request('tools/call', { name: 'page_parts', arguments: { target: asked.target, revision: asked.revision, lang: asked.lang } });
      const got = answer?.structuredContent;
      if (answer?.isError || !got?.parts) throw new Error(answer?.content?.[0]?.text ?? 'no page');
      app.times.parts = win.performance.now();
      app.target = asked.target;
      // Another revision's pieces, as this view would ask for them (tests: scripts/app-host-check.js).
      app.fetchParts = (revision) => bridge.request('tools/call', { name: 'page_parts', arguments: { target: asked.target, revision, lang: asked.lang } }).then((r) => ({ revision: r.structuredContent?.parts?.revision, latest: r.structuredContent?.latest, values: Object.fromEntries(Object.entries(r.structuredContent?.parts?.data?.parts ?? {}).map(([id, part]) => [id, part.value?.text ?? null])) }));
      app.texts = got.texts;
      app.revision = got.parts.revision;
      mount(doc, got.parts);
      startPage([...(got.parts.script === 'live' ? liveExtensions : []), appExtension(bridge, app)]);
      if (got.latest !== got.parts.revision) say(fill(got.texts.newer, { revision: got.parts.revision, latest: got.latest }));
      win.requestAnimationFrame(() => win.requestAnimationFrame(() => (app.times.painted = win.performance.now())));
    } catch (e) {
      app.error = e.message;
      say(e.message);
    }
  });
  bridge
    .request('ui/initialize', { appInfo: { name: 'protoboard-iso', version: doc.documentElement.dataset.version ?? '0' }, appCapabilities: {}, protocolVersion: PROTOCOL })
    .then((answer) => {
      context = { ...(answer?.hostContext ?? {}) };
      bridge.notify('ui/notifications/initialized', {});
    })
    .catch((e) => (app.error = e.message));
  return app;
}
