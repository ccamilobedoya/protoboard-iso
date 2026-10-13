// Rasterises examples/out/*.svg to PNG (examples/out/png/) so the drawings can be checked
// without a browser. Development only: needs `npm install` for @resvg/resvg-js.
//   node scripts/preview.js [filter] [--width 1600]

import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

let Resvg;
try {
  ({ Resvg } = await import('@resvg/resvg-js'));
} catch {
  console.error('Missing dev dependency: run `npm install` first.');
  process.exit(1);
}

const out = new URL('../examples/out/', import.meta.url).pathname;
const pngDir = join(out, 'png');
const args = process.argv.slice(2);
const widthArg = args.indexOf('--width');
const width = widthArg >= 0 ? Number(args[widthArg + 1]) : 1600;
const filter = args.find((a, i) => !a.startsWith('--') && args[i - 1] !== '--width') ?? '';

// Text needs a font file; use whichever common sans-serif font exists on this machine.
const candidates = [
  '/usr/share/fonts/truetype/lato/Lato-Regular.ttf',
  '/usr/share/fonts/truetype/lato/Lato-Bold.ttf',
  '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
  '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
  '/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf',
  '/System/Library/Fonts/Helvetica.ttc',
  'C:\\Windows\\Fonts\\arial.ttf',
];
const fontFiles = candidates.filter((f) => existsSync(f));
const family = fontFiles.some((f) => f.includes('Lato')) ? 'Lato' : fontFiles.some((f) => f.includes('DejaVu')) ? 'DejaVu Sans' : 'Arial';

mkdirSync(pngDir, { recursive: true });
for (const file of readdirSync(out).filter((f) => f.endsWith('.svg') && f.includes(filter))) {
  const svg = readFileSync(join(out, file), 'utf8');
  const png = new Resvg(svg, {
    fitTo: { mode: 'width', value: width },
    font: { loadSystemFonts: fontFiles.length === 0, fontFiles, defaultFontFamily: family, sansSerifFamily: family },
  })
    .render()
    .asPng();
  const name = file.replace(/\.svg$/, '.png');
  writeFileSync(join(pngDir, name), png);
  console.log(join(pngDir, name));
}
