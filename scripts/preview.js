// Rasterises examples/out/*.svg to PNG (examples/out/png/) so the drawings can be checked
// without a browser. Development only: needs `npm install` for @resvg/resvg-js.
//   node scripts/preview.js [filter] [--width 1600]

import { readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { svgToPng, rasterAvailable } from '../src/node/raster.js';

if (!(await rasterAvailable())) {
  console.error('Missing dev dependency: run `npm install` first.');
  process.exit(1);
}
const out = new URL('../examples/out/', import.meta.url).pathname;
const pngDir = join(out, 'png');
const args = process.argv.slice(2);
const widthArg = args.indexOf('--width');
const width = widthArg >= 0 ? Number(args[widthArg + 1]) : 1600;
const filter = args.find((a, i) => !a.startsWith('--') && args[i - 1] !== '--width') ?? '';

mkdirSync(pngDir, { recursive: true });
for (const file of readdirSync(out).filter((f) => f.endsWith('.svg') && f.includes(filter))) {
  const png = await svgToPng(readFileSync(join(out, file), 'utf8'), { width });
  const name = join(pngDir, file.replace(/\.svg$/, '.png'));
  writeFileSync(name, png);
  console.log(name);
}
