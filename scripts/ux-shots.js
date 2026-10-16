// Screenshots of the embeddable page at the sizes the UX pass checks (docs/en/ux-pass.md, U0).
//
//   node scripts/ux-shots.js <target…> -o <dir> [--browser-dir d] [--lang en|es] [--tap ID] [--theme light|dark]
//
// Writes into <dir>: each target's page (<name>.html), a host page that frames it like a lesson
// note (<name>.embed.html: text above and below, an iframe 460 px high) and ux-shots.js, an
// `async (page) => …` function for a Playwright runner (the browser MCP's run-code tool). Run it
// and it saves, in d (where the browser sees <dir>; default <dir>):
//   <name>-desk.png 1280×800 · <name>-tablet.png 1024×700 · <name>-phone.png 390×760
//   <name>-embed-wide.png 900×620 and <name>-embed-phone.png 390×760, the page inside the note
//   and, with --tap ID, the same after tapping that part (<name>-<size>-<ID>.png).
// --theme fixes the page's theme (page.theme) and adds it to the names (<name>-dark-desk.png).
// The pages are served from https://ux.local/ by the function itself (page.route), so the browser
// needs no file access or network. Compare a set with the previous one after every phase.

import { writeFileSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { resolveTarget, loadCircuit } from '../src/node/workspace.js';
import { renderPage } from '../src/page.js';

const SIZES = [
  ['desk', 1280, 800, false],
  ['tablet', 1024, 700, false],
  ['phone', 390, 760, false],
  ['embed-wide', 900, 620, true],
  ['embed-phone', 390, 760, true],
];

const host = (name, title) => `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<style>body{margin:0;background:#f3f3f3;font:15px/1.5 system-ui,sans-serif;color:#333}p{margin:0;padding:12px 16px}iframe{display:block;width:100%;height:460px;border:0;background:#fff}</style></head>
<body><p>Lesson text above the circuit, as in a note.</p><iframe src="${name}.html" allowfullscreen></iframe>${'<p>Lesson text below the circuit.</p>'.repeat(12)}</body></html>
`;

// Runs in the Playwright runner: serve the files, load each page at each size, tap if asked.
// It is written into ux-shots.js as text, so it may use nothing from this module.
async function shots(page, { pages, sizes, dir, tap }) {
  await page.route('https://ux.local/**', (r) => r.fulfill({ path: `${dir}/${new URL(r.request().url()).pathname.slice(1)}` }));
  const saved = [];
  const tapPart = async (frame, id) => {
    const el = frame.locator(`main > svg:not([hidden]) .parts [data-part="${id}"]`).first();
    if (!(await el.count())) return false;
    const b = await el.boundingBox();
    if (!b) return false;
    await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
    return true;
  };
  for (const name of pages) {
    for (const [size, width, height, embed] of sizes) {
      await page.setViewportSize({ width, height });
      await page.goto(`https://ux.local/${name}${embed ? '.embed' : ''}.html`);
      await page.waitForTimeout(600);
      const frame = embed ? page.frameLocator('iframe') : page;
      await page.screenshot({ path: `${dir}/${name}-${size}.png` });
      saved.push(`${name}-${size}.png`);
      if (tap && (await tapPart(frame, tap))) {
        await page.waitForTimeout(600);
        await page.screenshot({ path: `${dir}/${name}-${size}-${tap}.png` });
        saved.push(`${name}-${size}-${tap}.png`);
      }
    }
  }
  return saved;
}

function parse(argv) {
  const args = { targets: [], lang: null, out: null, browserDir: null, tap: null, theme: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '-o' || a === '--out') args.out = argv[++i];
    else if (a === '--browser-dir') args.browserDir = argv[++i];
    else if (a === '--lang') args.lang = argv[++i];
    else if (a === '--tap') args.tap = argv[++i];
    else if (a === '--theme') args.theme = argv[++i];
    else args.targets.push(a);
  }
  return args;
}

const args = parse(process.argv.slice(2));
if (!args.targets.length || !args.out) {
  console.error('usage: node scripts/ux-shots.js <target…> -o <dir> [--browser-dir d] [--lang en|es] [--tap ID] [--theme light|dark]');
  process.exit(2);
}
const out = resolve(args.out);
mkdirSync(out, { recursive: true });
const names = [];
for (const target of args.targets) {
  const paths = resolveTarget(target);
  const loaded = loadCircuit(paths);
  const circuit = args.theme ? { ...loaded, page: { ...loaded.page, theme: args.theme } } : loaded;
  const { html } = renderPage(circuit, { lang: args.lang ?? circuit.lang ?? 'en' });
  if (!html) {
    console.error(`${target}: nothing to draw`);
    process.exit(1);
  }
  const name = args.theme ? `${paths.name}-${args.theme}` : paths.name;
  writeFileSync(join(out, `${name}.html`), html);
  writeFileSync(join(out, `${name}.embed.html`), host(name, name));
  names.push(name);
}
const options = { pages: names, sizes: SIZES, dir: args.browserDir ?? out, tap: args.tap };
const code = `async (page) => (${shots.toString()})(page, ${JSON.stringify(options)})\n`;
writeFileSync(join(out, 'ux-shots.js'), code);
console.log(`${names.length} page(s) and ux-shots.js written to ${out}`);
