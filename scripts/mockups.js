// Mock-ups of the conductor view (stage 3, docs/en/live-simulation.md): a few circuits, both
// views, as PNG and as the real page with the dots moving. For judging the look whenever it changes.
//   node scripts/mockups.js [--lang es]   → examples/out/mockups/

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { renderCircuit } from '../src/index.js';
import { renderPage } from '../src/page.js';
import { svgToPng, rasterAvailable } from '../src/node/raster.js';

const examples = new URL('../examples/', import.meta.url).pathname;
const out = join(examples, 'out', 'mockups');
const langArg = process.argv.indexOf('--lang');
const lang = langArg > 0 ? process.argv[langArg + 1] : 'en';
mkdirSync(out, { recursive: true });
const example = (name) => JSON.parse(readFileSync(join(examples, name), 'utf8'));

// Push button → base resistor → NPN transistor switching an LED (the same as test/focus.test.js).
const transistorSwitch = {
  title: { en: 'Transistor switch', es: 'Transistor como interruptor' },
  netLabels: { 'T+': '+5 V', 'T-': 'GND' },
  supplies: [{ id: 'V1', voltage: 5 }],
  parts: [
    { id: 'S1', type: 'button', pressed: true, pins: ['f10', 'e10', 'f12', 'e12'] },
    { id: 'W1', type: 'wire', color: 'red', pins: ['T+10', 'j10'] },
    { id: 'R1', type: 'resistor', value: '10k', pins: ['a12', 'a17'] },
    { id: 'Q1', type: 'bjt', part: '2N2222A', pins: { E: 'c16', B: 'c17', C: 'c18' } },
    { id: 'W2', type: 'wire', color: 'black', pins: ['a16', 'B-16'] },
    { id: 'R2', type: 'resistor', value: '330', pins: ['T+24', 'h24'] },
    { id: 'D1', type: 'led', color: 'green', pins: { anode: 'g24', cathode: 'g25' } },
    { id: 'W3', type: 'wire', color: 'yellow', pins: ['j25', 'e18'] },
    { id: 'W4', type: 'wire', color: 'black', pins: ['T-3', 'j3'] },
    { id: 'W5', type: 'wire', color: 'black', pins: ['i3', 'B-3'] },
  ],
};
const circuits = [
  ['led-resistor', example('led-resistor.json')],
  ['transistor-switch', transistorSwitch],
  ['battery-regulator', example('battery-regulator.json')],
];
const raster = await rasterAvailable();
const pages = [];
for (const [name, circuit] of circuits) {
  for (const view of ['front', 'back']) {
    const { svg } = renderCircuit(circuit, { view, lang, fit: 'parts', flow: true, labels: false });
    const file = `${name}.${view}`;
    writeFileSync(join(out, `${file}.svg`), svg);
    if (raster) writeFileSync(join(out, `${file}.png`), await svgToPng(svg, { width: 1000 }));
  }
  // The page opens on the current layer.
  const { html } = renderPage({ ...circuit, page: { ...circuit.page, flow: true } }, { lang });
  const page = `${name}.html`;
  writeFileSync(join(out, page), html.replace("layer: 'parts'", "layer: 'flow'"));
  pages.push(page);
  console.log(page);
}
console.log(`Mock-ups in ${out}`);
