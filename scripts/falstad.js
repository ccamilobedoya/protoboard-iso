// Compare the kit's simulator with Falstad's CircuitJS (stage 3, phase 6).
//
// The cases are circuit files in test/falstad/cases/. Each is exported with toFalstad(…, { exact })
// (src/sim/falstad.js), run in CircuitJS in a browser, and the node voltages Falstad gives are
// stored as test/falstad/refs/<case>.json, with the exported text. test/falstad.test.js then
// compares the kit with every stored reference, offline; a reference whose text no longer matches
// the export (a model or the exporter changed) is reported as stale, to be run again.
//
//   node scripts/falstad.js list                     the cases and the state of their references
//   node scripts/falstad.js snippet [cases…] [-o f]  a function for Falstad's page: paste it in the
//                                                    devtools console of
//                                                    https://www.falstad.com/circuit/circuitjs.html
//                                                    (or a browser tool's "evaluate"); it returns
//                                                    the JSON to save, and keeps it in
//                                                    window.falstadResult
//   node scripts/falstad.js snippet --playwright -o f [--browser-dir d]
//                                                    the same as `async (page) => …` for a
//                                                    Playwright runner: it opens Falstad itself
//                                                    and reads the cases from falstad-cases.json,
//                                                    written beside f (d: that folder as the
//                                                    browser sees it)
//   node scripts/falstad.js save <result.json>       stores what that function returned (refuses a
//                                                    case whose text is not today's export)
//   node scripts/falstad.js url <case|file>          the link that opens a circuit in Falstad
//
// Falstad's page exposes window.CircuitJS1 (importCircuit, setSimRunning, getNodeVoltage, getTime):
// the function imports each case, runs it until the voltages settle and reads every labeled node.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { compile } from '../src/sim/compile.js';
import { createEngine } from '../src/sim/engine.js';
import { toFalstad, FALSTAD_URL } from '../src/sim/falstad.js';
import { caseNames, exportCase, readRef, refFile, REFS, CASES } from '../test/falstad/cases.js';

// Runs in Falstad's page: import, run, wait until no node moves more than 1 µV in 300 ms.
function browserRun(cases) {
  return (async () => {
    const sim = window.CircuitJS1;
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const out = { falstad: { url: location.href, date: new Date().toISOString() }, cases: {} };
    // Right after the page loads, the first import can stay unsolved (every node at 0 V):
    // give Falstad a moment, and count as settled only a run whose clock moved on.
    await wait(1000);
    for (const c of cases) {
      sim.importCircuit(c.text, false);
      sim.setSimRunning(true);
      let last = null;
      let settled = false;
      for (let k = 0; k < 40 && !settled; k++) {
        await wait(300);
        const now = Object.fromEntries(c.nodes.map((n) => [n, sim.getNodeVoltage(n)]));
        settled = k >= 2 && sim.getTime() > 0 && c.nodes.some((n) => now[n] !== 0) && c.nodes.every((n) => Math.abs(now[n] - last[n]) < 1e-6);
        last = now;
      }
      sim.setSimRunning(false);
      out.cases[c.name] = { text: c.text, time: sim.getTime(), settled: Boolean(settled), nodes: last };
    }
    window.falstadResult = out;
    return out;
  })();
}

const [command, ...args] = process.argv.slice(2);
if (command === 'list') {
  for (const name of caseNames()) {
    const ref = readRef(name);
    const state = !ref ? 'no reference' : ref.text === exportCase(name).text ? 'up to date' : 'stale (run it again)';
    console.log(`${name.padEnd(28)} ${state}`);
  }
} else if (command === 'snippet') {
  const value = (flag) => (args.includes(flag) ? args[args.indexOf(flag) + 1] : null);
  const names = args.filter((a, i) => !a.startsWith('-') && !['-o', '--browser-dir'].includes(args[i - 1]));
  const cases = (names.length ? names : caseNames()).map(exportCase).map(({ name, text, nodes }) => ({ name, text, nodes }));
  const out = value('-o');
  let code;
  if (args.includes('--playwright')) {
    // The cases go in falstad-cases.json beside the code, read by the browser from the same folder
    // as it sees it (--browser-dir): the code stays short, whatever the number of cases. Falstad's
    // service worker answers every fetch of its own page, so the file is read in a page apart.
    if (!out) throw new Error('--playwright needs -o <file>');
    const dir = value('--browser-dir') ?? dirname(resolve(out));
    writeFileSync(join(dirname(resolve(out)), 'falstad-cases.json'), JSON.stringify(cases));
    code = `async (page) => {
  const reader = await page.context().newPage();
  await reader.route('https://data.local/**', (r) => r.fulfill({ path: ${JSON.stringify(`${dir}/falstad-cases.json`)}, contentType: 'text/plain' }));
  await reader.goto('https://data.local/cases.json');
  const cases = JSON.parse(await reader.evaluate(() => document.body.innerText));
  await reader.close();
  await page.goto('${FALSTAD_URL}?running=false');
  await page.waitForFunction(() => window.CircuitJS1);
  const out = await page.evaluate(${browserRun.toString()}, cases);
  return Object.fromEntries(Object.entries(out.cases).map(([k, c]) => [k, c.settled]));
}
`;
  } else code = `async () => (${browserRun.toString()})(${JSON.stringify(cases)})\n`;
  if (out) writeFileSync(out, code);
  else process.stdout.write(code);
} else if (command === 'save') {
  const result = JSON.parse(readFileSync(args[0], 'utf8'));
  mkdirSync(REFS, { recursive: true });
  for (const [name, c] of Object.entries(result.cases)) {
    if (c.text !== exportCase(name).text) {
      console.error(`${name}: not saved, its text is not today's export (an old run, or a copy that changed it)`);
      process.exitCode = 1;
      continue;
    }
    if (!c.settled) console.warn(`${name}: Falstad had not settled after ${c.time} s of simulated time`);
    writeFileSync(refFile(name), JSON.stringify({ falstad: result.falstad, text: c.text, time: c.time, settled: c.settled, nodes: c.nodes }, null, 1) + '\n');
    console.log(`Saved test/falstad/refs/${name}.json`);
  }
} else if (command === 'url') {
  const file = existsSync(args[0] ?? '') ? args[0] : new URL(`${args[0]}.json`, CASES);
  const { program } = compile(JSON.parse(readFileSync(file, 'utf8')));
  const { url, notes } = toFalstad(program, { timeConstants: createEngine(program).timeConstants() });
  for (const n of notes) console.error(`note: ${n.code} ${JSON.stringify(n.params)}`);
  console.log(url);
} else {
  console.log(readFileSync(new URL(import.meta.url), 'utf8').split('\n').filter((l) => l.startsWith('//')).slice(0, 27).join('\n'));
  if (command) process.exit(1);
}

