// The demo site (GitHub Pages, .github/workflows/pages.yml): every recipe laid out with its default
// values and every example that can be simulated, as the live page the kit writes for embedding,
// in English and Spanish, with an index for each language. Nothing here is kept in git.
//   node scripts/demo-site.js [-o site]      then open site/index.html

import { readdirSync, readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join, basename } from 'node:path';
import { renderPage } from '../src/page.js';
import { autoLayout } from '../src/layout.js';
import { RECIPES, expandRecipe, recipeEntry } from '../src/recipes/index.js';
import { pageSimulation } from '../src/sim/index.js';

const root = new URL('../', import.meta.url).pathname;
const outArg = process.argv.indexOf('-o');
const out = outArg > 0 ? process.argv[outArg + 1] : join(root, 'site');
const REPO = 'https://github.com/ccamilobedoya/protoboard-iso';

const text = (v, lang) => (v && typeof v === 'object' ? v[lang] ?? v.en : v ?? '');
const escapeHtml = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

const circuits = [];
for (const name of Object.keys(RECIPES)) {
  const r = autoLayout(expandRecipe(name).spec);
  if (r.status !== 'done') throw new Error(`recipe ${name}: ${r.status}`);
  circuits.push({ group: 'recipes', name, circuit: r.circuit, about: (lang) => recipeEntry(name, lang).teaches });
}
for (const file of readdirSync(join(root, 'examples')).filter((f) => f.endsWith('.json')).sort()) {
  const circuit = JSON.parse(readFileSync(join(root, 'examples', file), 'utf8'));
  if (!pageSimulation(circuit).results) continue;
  circuits.push({ group: 'examples', name: basename(file, '.json'), circuit, about: (lang) => text(circuit.description, lang) });
}
// Layout specs (parts and nets, no holes): laid out first, named like their thumbnails.
for (const file of readdirSync(join(root, 'examples/layout')).filter((f) => f.endsWith('.json')).sort()) {
  const r = autoLayout(JSON.parse(readFileSync(join(root, 'examples/layout', file), 'utf8')));
  if (r.invalid || !pageSimulation(r.circuit).results) continue;
  circuits.push({ group: 'examples', name: `layout-${basename(file, '.json')}`, circuit: r.circuit, about: () => '' });
}

const TEXTS = {
  en: {
    title: 'protoboard-iso · live circuits',
    intro: 'Breadboard circuits drawn, checked and simulated by <a href="' + REPO + '">protoboard-iso</a>. Each page is the one the kit writes for a lesson: tap a part to see its voltages and currents (a model, not a measurement), press <b>Current</b> to see it flow, turn the board around.',
    recipes: 'Recipes',
    recipesNote: 'Lesson circuits the kit lays out by name, with their default values.',
    examples: 'Examples',
    examplesNote: 'Circuit files from <code>examples/</code> that can be simulated (<code>layout-…</code>: laid out from <code>examples/layout/</code>).',
    other: '<a href="es/index.html">Leer en español</a>',
  },
  es: {
    title: 'protoboard-iso · circuitos en vivo',
    intro: 'Circuitos de protoboard dibujados, revisados y simulados por <a href="' + REPO + '">protoboard-iso</a>. Cada página es la que el kit escribe para una lección: toca un componente para ver sus voltajes y corrientes (un modelo, no una medición), pulsa <b>Corriente</b> para verla circular, dale la vuelta a la protoboard.',
    recipes: 'Recetas',
    recipesNote: 'Circuitos de lección que el kit monta por su nombre, con sus valores por defecto.',
    examples: 'Ejemplos',
    examplesNote: 'Archivos de circuito de <code>examples/</code> que se pueden simular (<code>layout-…</code>: montados a partir de <code>examples/layout/</code>).',
    other: '<a href="../index.html">Read in English</a>',
  },
};

const index = (lang, items) => {
  const T = TEXTS[lang];
  const list = (group) =>
    items
      .filter((i) => i.group === group)
      .map((i) => `<li><a href="${i.name}.html">${escapeHtml(text(i.circuit.title, lang) || i.name)}</a>${i.about(lang) ? `<span>${escapeHtml(i.about(lang))}</span>` : ''}</li>`)
      .join('\n');
  return `<!doctype html>
<html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${T.title}</title>
<style>
body{margin:0 auto;max-width:760px;padding:24px 16px 48px;font:16px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif;color:#24292f;background:#fff}
h1{font-size:24px;margin:0 0 8px}h2{font-size:18px;margin:32px 0 4px}p{margin:8px 0}
ul{list-style:none;padding:0;margin:12px 0}li{padding:8px 0;border-top:1px solid #e5e7eb}
li a{font-weight:600}li span{display:block;color:#57606a;font-size:14px}a{color:#0a58ca}
@media (prefers-color-scheme:dark){body{background:#16181c;color:#e6e6e6}li{border-color:#2d3138}li span{color:#a0a6ad}a{color:#7cb4ff}}
</style></head>
<body>
<h1>${T.title}</h1>
<p>${T.intro}</p>
<p>${T.other}</p>
<h2>${T.recipes}</h2><p>${T.recipesNote}</p>
<ul>
${list('recipes')}
</ul>
<h2>${T.examples}</h2><p>${T.examplesNote}</p>
<ul>
${list('examples')}
</ul>
</body></html>
`;
};

rmSync(out, { recursive: true, force: true });
for (const lang of ['en', 'es']) {
  const dir = lang === 'en' ? out : join(out, lang);
  mkdirSync(dir, { recursive: true });
  for (const { name, circuit } of circuits) {
    const { html } = renderPage(circuit, { lang });
    if (!html) throw new Error(`${name}: no page`);
    writeFileSync(join(dir, `${name}.html`), html);
  }
  writeFileSync(join(dir, 'index.html'), index(lang, circuits));
}
console.log(`${circuits.length} circuits × 2 languages → ${out}`);
