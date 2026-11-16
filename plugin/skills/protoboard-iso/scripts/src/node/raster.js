// SVG → PNG for previews (Node only). Uses @resvg/resvg-js when it is installed (a dev or
// optional dependency); the kit itself never needs it. Text needs font files, so the
// common sans-serif fonts of the machine are passed explicitly.

import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const CANDIDATES = [
  '/usr/share/fonts/truetype/lato/Lato-Regular.ttf',
  '/usr/share/fonts/truetype/lato/Lato-Bold.ttf',
  '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
  '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
  '/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf',
  '/System/Library/Fonts/Helvetica.ttc',
  'C:\\Windows\\Fonts\\arial.ttf',
];

export const RASTER_MISSING = 'PNG is not available in this install: the SVG and the page are.';

let resvg;
const extraRoots = [];

// A host (the MCP server) that installed the rasteriser in its own folder says where: `import()`
// alone only looks from src/ up to the kit's root, where a clean clone has no node_modules.
// The kit never imports from the host; it is given the folder.
export function rasterSearchIn(dir) {
  if (!extraRoots.includes(dir)) extraRoots.push(dir);
  if (resvg === null) resvg = undefined;
}

async function loadResvg() {
  try {
    return (await import('@resvg/resvg-js')).Resvg;
  } catch {}
  for (const dir of extraRoots) {
    try {
      const file = createRequire(join(dir, 'noop.js')).resolve('@resvg/resvg-js');
      return (await import(pathToFileURL(file).href)).Resvg;
    } catch {}
  }
  return null;
}

export async function rasterAvailable() {
  if (resvg === undefined) resvg = await loadResvg();
  return resvg !== null && resvg !== undefined;
}

export async function svgToPng(svg, { width = 900 } = {}) {
  if (!(await rasterAvailable())) throw new Error(RASTER_MISSING);
  const fontFiles = CANDIDATES.filter((f) => existsSync(f));
  const family = fontFiles.some((f) => f.includes('Lato')) ? 'Lato' : fontFiles.some((f) => f.includes('DejaVu')) ? 'DejaVu Sans' : 'Arial';
  return new resvg(svg, {
    fitTo: { mode: 'width', value: width },
    font: { loadSystemFonts: fontFiles.length === 0, fontFiles, defaultFontFamily: family, sansSerifFamily: family },
  })
    .render()
    .asPng();
}
