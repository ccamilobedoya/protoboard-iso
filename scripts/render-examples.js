// Renders every examples/*.json into examples/out/: front, back, a front close-up framed
// on the parts (.zoom) and the same close-up with every annotation layer (.annotated).
//   node scripts/render-examples.js [--lang es]

import { readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, basename } from 'node:path';
import { renderCircuit, formatIssue } from '../src/index.js';

const dir = new URL('../examples/', import.meta.url).pathname;
const out = join(dir, 'out');
const langArg = process.argv.indexOf('--lang');
const lang = langArg > 0 ? process.argv[langArg + 1] : 'en';
mkdirSync(out, { recursive: true });

const gallery = [];
for (const file of readdirSync(dir).filter((f) => f.endsWith('.json')).sort()) {
  const circuit = JSON.parse(readFileSync(join(dir, file), 'utf8'));
  const variants = [
    { view: 'front', fit: 'board', suffix: 'front' },
    { view: 'back', fit: 'board', suffix: 'back' },
    { view: 'front', fit: 'parts', suffix: 'front.zoom' },
    { view: 'front', fit: 'parts', annotate: 'all', suffix: 'annotated' },
  ];
  for (const { view, fit, annotate, suffix } of variants) {
    const { svg, issues } = renderCircuit(circuit, { view, lang, fit, annotate });
    const name = `${basename(file, '.json')}.${suffix}.svg`;
    if (svg) writeFileSync(join(out, name), svg);
    gallery.push({ name, issues: issues.map((issue) => formatIssue(issue, lang)) });
    console.log(`${name}: ${issues.length} issues`);
    if (suffix === 'front') for (const issue of issues) console.log(`  ${formatIssue(issue, lang)}`);
  }
}

// A plain page to look at everything at once: open examples/out/index.html in a browser.
const escape = (s) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);
const cards = gallery
  .map(({ name, issues }) => {
    const list = issues.length ? `<ul>${issues.map((i) => `<li>${escape(i)}</li>`).join('')}</ul>` : '';
    return `<figure><a href="${name}"><img src="${name}" alt="${name}" loading="lazy"></a><figcaption>${name}${list}</figcaption></figure>`;
  })
  .join('\n');
writeFileSync(
  join(out, 'index.html'),
  `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>protoboard-iso examples</title>
<style>body{margin:0;padding:16px;font-family:system-ui,sans-serif;background:#f4f5f7;color:#1f2933}
main{display:grid;gap:16px;grid-template-columns:repeat(auto-fill,minmax(min(100%,520px),1fr))}
figure{margin:0;background:#fff;border:1px solid #d9dde3;border-radius:8px;padding:8px}
img{width:100%;height:auto;display:block}figcaption{font-size:14px;padding-top:6px}ul{margin:4px 0 0;padding-left:18px;font-size:13px;color:#52606d}</style>
</head><body><h1>protoboard-iso</h1><main>
${cards}
</main></body></html>
`,
);
console.log(`Gallery: ${join(out, 'index.html')}`);
