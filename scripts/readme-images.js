// Images for the READMEs (docs/img/), drawn by the kit itself from recipes and examples, so they
// are regenerated after a change in the drawing instead of going stale. Development only: needs
// `npm install` for @resvg/resvg-js.
//   node scripts/readme-images.js [filter]
//
// docs/img/live-page.png is the one image it cannot draw: a screenshot of the page in a browser
// (scripts/ux-shots.js with --tap D1 on the led-resistor example, the 1280×800 shot).

import { readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, basename } from 'node:path';
import { renderCircuit } from '../src/index.js';
import { autoLayout } from '../src/layout.js';
import { expandRecipe } from '../src/recipes/index.js';
import { svgToPng, rasterAvailable } from '../src/node/raster.js';

if (!(await rasterAvailable())) {
  console.error('Missing dev dependency: run `npm install` first.');
  process.exit(1);
}

const root = new URL('../', import.meta.url).pathname;
const out = join(root, 'docs/img');
const filter = process.argv[2] ?? '';
const example = (name) => JSON.parse(readFileSync(join(root, 'examples', `${name}.json`), 'utf8'));
const recipe = (name) => {
  const r = autoLayout(expandRecipe(name).spec);
  if (r.status !== 'done') throw new Error(`recipe ${name}: ${r.status}`);
  return r.circuit;
};

// The gallery in the README: one recipe of each family.
const GALLERY = ['npn-switch', 'regulator-7805', 'bridge-rectifier', 'opamp-noninverting', 'esp32-led', 'uno-pot-pwm'];

const images = [
  { file: 'hero.png', circuit: () => recipe('555-astable'), width: 1400 },
  { file: 'led-resistor.front.png', circuit: () => example('led-resistor'), width: 900 },
  { file: 'led-resistor.back.png', circuit: () => example('led-resistor'), view: 'back', width: 900 },
  { file: 'led-resistor.sim.png', circuit: () => example('led-resistor'), sim: true, width: 900 },
  { file: 'led-resistor.flow.png', circuit: () => example('led-resistor'), flow: true, width: 900 },
  { file: 'led-resistor.annotated.png', circuit: () => example('led-resistor'), annotate: 'all', width: 900 },
  ...GALLERY.map((name) => ({ file: `recipes/${name}.png`, circuit: () => recipe(name), width: 640 })),
  // examples/README.md: a thumbnail of each example (layout specs are drawn after layout).
  ...readdirSync(join(root, 'examples')).filter((f) => f.endsWith('.json')).map((f) => ({ file: `examples/${basename(f, '.json')}.png`, circuit: () => example(basename(f, '.json')), width: 560 })),
  ...readdirSync(join(root, 'examples/layout')).filter((f) => f.endsWith('.json')).map((f) => ({
    file: `examples/layout-${basename(f, '.json')}.png`,
    circuit: () => autoLayout(JSON.parse(readFileSync(join(root, 'examples/layout', f), 'utf8'))).circuit,
    width: 560,
  })),
];

for (const dir of ['', 'recipes', 'examples']) mkdirSync(join(out, dir), { recursive: true });
for (const { file, circuit, view = 'front', width, ...options } of images.filter((i) => i.file.includes(filter))) {
  const { svg } = renderCircuit(circuit(), { view, fit: 'parts', lang: 'en', ...options });
  if (!svg) throw new Error(`${file}: nothing drawn`);
  writeFileSync(join(out, file), await svgToPng(svg, { width }));
  console.log(`docs/img/${file}`);
}
