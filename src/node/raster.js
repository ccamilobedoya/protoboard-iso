// SVG → PNG for previews (Node only). Uses @resvg/resvg-js when it is installed (a dev or
// optional dependency); the kit itself never needs it. Text needs font files, so the
// common sans-serif fonts of the machine are passed explicitly.

import { existsSync } from 'node:fs';

const CANDIDATES = [
  '/usr/share/fonts/truetype/lato/Lato-Regular.ttf',
  '/usr/share/fonts/truetype/lato/Lato-Bold.ttf',
  '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
  '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
  '/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf',
  '/System/Library/Fonts/Helvetica.ttc',
  'C:\\Windows\\Fonts\\arial.ttf',
];

let resvg;
export async function rasterAvailable() {
  if (resvg === undefined) {
    try {
      resvg = (await import('@resvg/resvg-js')).Resvg;
    } catch {
      resvg = null;
    }
  }
  return resvg !== null;
}

export async function svgToPng(svg, { width = 900 } = {}) {
  if (!(await rasterAvailable())) throw new Error('PNG output needs @resvg/resvg-js: run npm install.');
  const fontFiles = CANDIDATES.filter((f) => existsSync(f));
  const family = fontFiles.some((f) => f.includes('Lato')) ? 'Lato' : fontFiles.some((f) => f.includes('DejaVu')) ? 'DejaVu Sans' : 'Arial';
  return new resvg(svg, {
    fitTo: { mode: 'width', value: width },
    font: { loadSystemFonts: fontFiles.length === 0, fontFiles, defaultFontFamily: family, sansSerifFamily: family },
  })
    .render()
    .asPng();
}
