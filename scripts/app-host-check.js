// The MCP App in the official test host (the ext-apps repository's examples/basic-host, built with
// its own `npm run build`, kept outside this repository), driven by Chromium:
//
//   node scripts/app-host-check.js <basic-host dir> [-o shots] [--csp host|spec] [--host-port 8180] [--recipes a,b]
//
// It serves the host's dist/ itself, on 127.0.0.1 only: the host on --host-port and its sandbox proxy on
// :8081 (the port the host's build asks for) with a Content-Security-Policy header, either the one basic-host's serve.ts builds (`host`,
// default: it allows 'unsafe-eval') or the spec's restrictive default (`spec`: no eval), and starts
// mcp/http.js on :3001 with a fresh root and PROTOBOARD_APPS=on (basic-host does not announce the
// extension in its capabilities). Then: layout led-resistor (P1, tap R1, the current layer
// moving; P3, the context line; P6, a resistor and an LED up close and back), layout uno-blink (P2, does the sketch
// run), apply_ops and the first view's page_parts with the old revision (P4), and five layouts for
// the time from tool result to first paint (P5). Screenshots at deviceScaleFactor 2, named by step;
// the measurements as JSON on stdout.
//
// Exits 0 when every step passed, 1 when one failed, 2 when it could not run (no host, no
// Playwright, no browser, mcp/ not installed).

import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const args = process.argv.slice(2);
const flag = (name, fallback) => (args.includes(name) ? args[args.indexOf(name) + 1] : fallback);
const hostDir = args[0] && !args[0].startsWith('-') ? resolve(args[0]) : null;
const shots = resolve(flag('-o', join(tmpdir(), 'app-host-shots')));
const cspMode = flag('--csp', 'host');
const hostPort = Number(flag('--host-port', '8180'));
let child = null; // mcp/http.js, ended on every way out
const cannot = (why) => {
  child?.kill();
  console.error(`could not run: ${why}`);
  process.exit(2);
};

if (!hostDir || !existsSync(join(hostDir, 'dist', 'index.html')) || !existsSync(join(hostDir, 'dist', 'sandbox.html'))) cannot('give the basic-host folder, built (its dist/index.html and dist/sandbox.html)');
if (!existsSync(join(ROOT, 'mcp', 'node_modules', '@modelcontextprotocol', 'sdk'))) cannot('mcp/ is not installed (cd mcp && npm install)');
let chromium;
try {
  ({ chromium } = await import('playwright'));
} catch {
  cannot('no Playwright (npm install)');
}

// The sandbox's CSP. `host`: what basic-host's serve.ts sends with no csp metadata (copied from it).
// `spec`: the restrictive default the specification tells a host to use (apps.mdx, Host Behavior).
const CSP = {
  host: "default-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline' 'unsafe-eval' blob: data:; style-src 'self' 'unsafe-inline' blob: data:; img-src 'self' data: blob:; font-src 'self' data: blob:; media-src 'self' data: blob:; connect-src 'self'; worker-src 'self' blob:; frame-src 'none'; object-src 'none'; base-uri 'none'",
  spec: "default-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; media-src 'self' data:; connect-src 'none'",
}[cspMode];
if (!CSP) cannot(`--csp is host or spec, not ${cspMode}`);

const listen = (server, port) =>
  new Promise((ok, fail) => {
    server.once('error', (e) => fail(new Error(`port ${port}: ${e.code}`)));
    server.listen(port, '127.0.0.1', ok);
  });
const dist = join(hostDir, 'dist');
const hostServer = createServer((req, res) => {
  const path = new URL(req.url, 'http://x').pathname;
  if (path === '/api/servers') return res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(['http://127.0.0.1:3001/mcp']));
  if (path === '/' || path === '/index.html') return res.writeHead(200, { 'content-type': 'text/html' }).end(readFileSync(join(dist, 'index.html')));
  res.writeHead(404).end();
});
const sandboxServer = createServer((req, res) => {
  const path = new URL(req.url, 'http://x').pathname;
  if (path !== '/sandbox.html' && path !== '/') return res.writeHead(404).end();
  res.writeHead(200, { 'content-type': 'text/html', 'content-security-policy': CSP, 'cache-control': 'no-store' }).end(readFileSync(join(dist, 'sandbox.html')));
});

const root = mkdtempSync(join(tmpdir(), 'protoboard-app-host-'));
const mcp = (child = spawn(process.execPath, [join(ROOT, 'mcp', 'http.js'), '3001'], { env: { ...process.env, PROTOBOARD_ROOT: root, PROTOBOARD_LANG: 'en', PROTOBOARD_APPS: 'on' }, stdio: ['ignore', 'ignore', 'pipe'] }));
await new Promise((ok, fail) => {
  mcp.stderr.on('data', (d) => /MCP over HTTP/.test(String(d)) && ok());
  mcp.once('exit', () => fail(new Error('mcp/http.js ended')));
}).catch((e) => cannot(e.message));

const results = { csp: cspMode, steps: {} };
const failed = [];
const check = (step, ok, detail) => {
  results.steps[step] = { ok, ...detail };
  if (!ok) failed.push(step);
};

let browser;
const consoleLines = [];
try {
  await listen(hostServer, hostPort).catch((e) => cannot(e.message));
  await listen(sandboxServer, 8081).catch((e) => cannot(e.message));
  try {
    browser = await chromium.launch();
  } catch (e) {
    cannot(`no browser (${e.message.split('\n')[0]})`);
  }
  mkdirSync(shots, { recursive: true });
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 1000 }, deviceScaleFactor: 2 })).newPage();
  page.on('console', (m) => consoleLines.push(`${m.type()}: ${m.text()}`));
  page.on('pageerror', (e) => consoleLines.push(`pageerror: ${e.message}`));
  await page.goto(`http://127.0.0.1:${hostPort}/index.html`);
  await page.waitForFunction(() => document.querySelector('select option[value="layout"]'), null, { timeout: 30000 });

  // A tool call from the host's form; with a viewer, its inner frame once the page has painted.
  const views = () => page.frames().filter((f) => f.parentFrame()?.url().includes(':8081/sandbox.html'));
  const callTool = async (tool, input) => {
    const before = views().length;
    await page.selectOption('select:has(option[value="layout"])', tool);
    await page.fill('textarea', JSON.stringify(input));
    await page.click('button[type="submit"]');
    return before;
  };
  const viewAfter = async (before) => {
    await page.waitForFunction((n) => [...document.querySelectorAll('iframe')].length > n, before, { timeout: 30000 });
    const deadline = Date.now() + 60000;
    while (Date.now() < deadline) {
      const frame = views()[before];
      if (frame) {
        const state = await frame.evaluate(() => ({ painted: window.protoboardApp?.times?.painted ?? null, error: window.protoboardApp?.error ?? null })).catch(() => null);
        if (state?.painted || state?.error) return { frame, ...state };
      }
      await page.waitForTimeout(100);
    }
    return { frame: views()[before] ?? null, painted: null, error: 'timeout' };
  };
  const iframeOf = async (index) => page.locator('iframe').nth(index);
  const shot = async (name, locator) => {
    const file = join(shots, `${name}.png`);
    await (locator ?? page).screenshot({ path: file });
    return readFileSync(file);
  };

  // P1: the board in the host's iframe, a tap, the current layer moving.
  let before = await callTool('layout', { target: 'led', recipe: 'led-resistor', values: { V1: 9 }, lang: 'es' });
  const first = await viewAfter(before);
  const frame1 = first.frame;
  const outer1 = await iframeOf(before);
  await page.waitForTimeout(300);
  await shot('p1-1-board', outer1);
  const drawn = frame1 ? await frame1.evaluate(() => ({ svgs: document.querySelectorAll('main > svg').length, parts: document.querySelectorAll('[data-part]').length, height: innerHeight })) : null;
  await frame1?.locator('main > svg:not([hidden]) [data-part="R1"]').first().click({ force: true });
  await page.waitForTimeout(700);
  const card = frame1 ? await frame1.evaluate(() => ({ title: document.querySelector('.info h2')?.textContent, lines: [...document.querySelectorAll('.info .terms li')].map((li) => li.textContent) })) : null;
  await shot('p1-2-card', outer1);
  check('P1 board', Boolean(first.painted && drawn?.svgs && drawn.parts), { drawn, error: first.error });
  check('P1 tap', card?.title === 'R1' || /R1/.test(card?.title ?? ''), { card });
  await frame1?.locator('nav button[data-key="layer"]').click();
  await page.waitForTimeout(800);
  const boardBox = frame1?.locator('main > svg:not([hidden])');
  const a = await shot('p1-3-current-a', boardBox);
  await page.waitForTimeout(500);
  const b = await shot('p1-4-current-b', boardBox);
  check('P1 current moves', !a.equals(b), { differ: !a.equals(b) });

  // P3: the context line the host received, .
  const hostText = async () => page.evaluate(() => document.body.textContent);
  const sentContext = await frame1?.evaluate(() => window.protoboardApp.contexts.at(-1));
  // The host shows each in a folded panel: its label and the first characters of the text.
  const shown = async (label, text) => Boolean(text) && (await hostText()).includes(label) && (await hostText()).includes(text.slice(0, 40));
  const context = await shown('Model Context', sentContext);
  check('P3 model context', Boolean(sentContext) && context && sentContext.length <= 300, { sent: sentContext, shownByHost: context });
  await shot('p3-host-panels');

  // P6: a part up close and back (the eye in the card's head), for a resistor and an LED.
  const upClose = {};
  for (const id of ['R1', 'D1']) {
    await frame1?.locator(`main > svg:not([hidden]) .parts [data-part="${id}"]`).first().click({ force: true });
    await page.waitForTimeout(500);
    await frame1?.locator('.info .head .actions button').first().click();
    await page.waitForTimeout(1500);
    const scene = await frame1?.evaluate(() => document.querySelector('main').dataset.scene ?? null);
    await shot(`p6-${id}-close`, outer1);
    await frame1?.locator('.focus-back').click();
    await page.waitForTimeout(1500);
    const after = await frame1?.evaluate(() => document.querySelector('main').dataset.scene ?? null);
    upClose[id] = { scene, after };
  }
  check('P6 up close and back', Object.values(upClose).every((u) => u.scene === 'part' && u.after !== 'part'), { upClose });

  // P2: a board's sketch (new Function in src/sim/program.js) under this CSP.
  before = await callTool('layout', { target: 'blink', recipe: 'uno-blink' });
  const blink = await viewAfter(before);
  const outer2 = await iframeOf(before);
  await page.waitForTimeout(500);
  const clock = async () => blink.frame?.evaluate(() => document.querySelector('.clock')?.textContent ?? null);
  const t0 = await clock();
  await shot('p2-1-blink', outer2);
  // The LED is on the board, the clock in the bar: only the drawing tells whether the sketch runs.
  const board2 = blink.frame?.locator('main > svg:not([hidden])');
  const boards = [];
  for (let k = 0; k < 6; k++) {
    boards.push(await shot(`p2-board-${k}`, board2));
    await page.waitForTimeout(350);
  }
  const blinks = boards.some((x) => !x.equals(boards[0]));
  await page.waitForTimeout(1200);
  const t1 = await clock();
  await shot('p2-2-blink', outer2);
  const warnings = await blink.frame?.evaluate(() => [...document.querySelectorAll('.side, .warnings, .stress')].map((e) => e.textContent.trim()).filter(Boolean).join(' | ').slice(0, 400));
  // Whether this frame may build code from text at all (what src/sim/program.js does with a sketch).
  // Asked from a <script> of the page itself: Playwright's own evaluate is exempt from the CSP,
  // and its check runs later, in a task of the page's own (inside the evaluate it would be exempt too).
  const probe = async (frame) => {
    await frame?.evaluate(() => {
      const s = document.createElement('script');
      s.textContent = "setTimeout(function () { try { window.__evalProbe = new Function('return true')(); } catch (e) { window.__evalProbe = e.name + ': ' + e.message; } }, 0);";
      document.head.appendChild(s);
    });
    await page.waitForTimeout(200);
    return frame?.evaluate(() => window.__evalProbe ?? 'inline script blocked');
  };
  const evalAllowed = await probe(blink.frame);
  const evalInSandbox = await probe(blink.frame?.parentFrame());
  const evalErrors = consoleLines.filter((l) => /eval|Content Security Policy|unsafe/i.test(l));
  check('P2 sketch runs', evalAllowed === true && t0 !== t1 && blinks && !evalErrors.length, { evalAllowed, evalInSandbox, clock: [t0, t1], boardChanges: blinks, evalErrors, warnings, error: blink.error });

  // P4: a change, then the first view asks for its own (older) revision and the current one.
  await callTool('apply_ops', { target: 'led', ops: [{ op: 'set', part: 'R1', value: '1k' }], expect_revision: 0 });
  await page.waitForTimeout(2500);
  const old = await frame1?.evaluate(() => window.protoboardApp.fetchParts(0));
  const now = await frame1?.evaluate(() => window.protoboardApp.fetchParts(1));
  check('P4 revision pinning', old?.revision === 0 && old?.latest === 1 && now?.revision === 1 && old?.values?.R1 !== now?.values?.R1, { old, now });

  // P5: from the tool result reaching the view to its first paint, five times.
  const times = [];
  for (let k = 0; k < 5; k++) {
    before = await callTool('layout', { target: `led-${k}`, recipe: 'led-resistor', values: { V1: 9 }, lang: 'es' });
    const v = await viewAfter(before);
    const t = await v.frame?.evaluate(() => window.protoboardApp.times);
    if (t?.painted) times.push({ toParts: Math.round(t.parts - t.result), toPaint: Math.round(t.painted - t.result) });
  }
  const median = (xs) => [...xs].sort((x, y) => x - y)[Math.floor(xs.length / 2)];
  results.paint = { runs: times, medianToPaintMs: median(times.map((x) => x.toPaint)), medianToPartsMs: median(times.map((x) => x.toParts)) };
  check('P5 timings', times.length === 5, {});

  // P7: the calls and the time to first paint of other recipes (--recipes a,b,c; three runs each).
  results.recipes = {};
  for (const name of flag('--recipes', '').split(',').filter(Boolean)) {
    const runs = [];
    for (let k = 0; k < 3; k++) {
      before = await callTool('layout', { target: `p7-${name}-${k}`, recipe: name });
      const v = await viewAfter(before);
      const t = await v.frame?.evaluate(() => ({ ...window.protoboardApp.times, calls: window.protoboardApp.calls ?? 1 }));
      if (t?.painted) runs.push({ calls: t.calls, toParts: Math.round(t.parts - t.result), toPaint: Math.round(t.painted - t.result) });
    }
    results.recipes[name] = { calls: runs[0]?.calls, medianToPartsMs: median(runs.map((x) => x.toParts)), medianToPaintMs: median(runs.map((x) => x.toPaint)) };
  }
} catch (e) {
  results.error = e.message.split('\n')[0];
  await browser?.contexts()[0]?.pages()[0]?.screenshot({ path: join(shots, 'error.png') }).catch(() => {});
  failed.push('run');
} finally {
  results.console = consoleLines.filter((l) => /error|eval|Content Security|fail/i.test(l)).slice(0, 30);
  await browser?.close();
  mcp.kill();
  hostServer.close();
  sandboxServer.close();
}

writeFileSync(join(shots, `results-${cspMode}.json`), `${JSON.stringify(results, null, 2)}\n`);
console.log(JSON.stringify(results, null, 2));
process.exit(failed.length ? 1 : 0);
