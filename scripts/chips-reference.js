// The generated part of the skill's reference for the six chips a beginner wires most often
// (plugin-src/references/chips.md): between `<!-- generated: <part> -->` and `<!-- /generated -->`,
// each chip's pins, what its model covers and its limits, as `kit catalog <part>` prints them, so no
// pin list is copied by hand. The rest of the file (the wiring a beginner gets wrong, a worked spec
// for each) is written by hand and run by test/skill-chips.test.js. scripts/parts-reference.js writes
// it with parts.md and sketch.md.

import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { catalogEntry, formatCatalogEntry } from '../src/node/catalog.js';
import { t } from '../src/i18n/index.js';

const root = fileURLToPath(new URL('../', import.meta.url));
export const FILE = join(root, 'plugin-src/references/chips.md');

// The catalog's own lines for one part: its pins, its model and its limits, without their indent.
function chipLines(part) {
  const entry = catalogEntry(part, 'en');
  if (!entry) throw new Error(`chips.md names ${part}, which the catalog does not know`);
  const lines = formatCatalogEntry(entry, 'en').split('\n').map((l) => l.trim());
  const pick = (start) => lines.find((l) => l.startsWith(start));
  const pins = pick(t('en', 'catalog.pins'));
  const model = pick('Simulated:');
  const limits = pick(t('en', 'catalog.limits'));
  if (!pins || !model) throw new Error(`${part}: the catalog has no pins or no Simulated line`);
  return [`- Pins, from pin 1 round the chip (\`kit catalog ${part}\`): ${pins.slice(t('en', 'catalog.pins').length).trim().split(' ').map((p) => `\`${p}\``).join(' ')}`, `- ${model}`, ...(limits ? [`- Limits ${limits.slice('limits '.length)}`] : [])];
}

// The file with every generated block written again from the catalog.
export function chipsReference(text) {
  return text.replace(/(<!-- generated: ([A-Z0-9-]+) [^>]*-->\n)[\s\S]*?(<!-- \/generated -->)/g, (_, open, part, close) => `${open}${chipLines(part).join('\n')}\n${close}`);
}
