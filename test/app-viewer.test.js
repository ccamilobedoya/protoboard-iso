// The page in pieces for an MCP App (renderPageParts, renderAppViewer, page/client/app.js) and an
// older revision rebuilt from the history (circuitAt).

import { partLine } from '../src/page/client/app.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { renderPage, renderPageParts, renderAppViewer } from '../src/page.js';
import { createTarget, applyToTarget, undoTarget, circuitAt, resolveTarget, loadCircuit } from '../src/node/workspace.js';
import { CONTEXT_MAX } from '../src/page/client/app.js';

const example = (name) => JSON.parse(readFileSync(new URL(`../examples/${name}`, import.meta.url), 'utf8'));

test('the pieces are the page: its markup, data and program are in renderPage as they are', () => {
  const circuit = example('led-resistor.json');
  const { html } = renderPage(circuit, { lang: 'es' });
  const { parts } = renderPageParts(circuit, { lang: 'es' });
  assert.ok(html.includes(`\n${parts.markup}\n`));
  assert.deepEqual(JSON.parse(html.match(/id="page-data">([\s\S]*?)<\/script>/)[1]), parts.data);
  assert.equal(parts.script, parts.program ? 'live' : 'static');
  assert.ok(html.includes(`<body data-fit="${parts.body.fit}"`));
});

test('the standalone page carries no bridge to a host; the viewer carries no circuit', () => {
  const { html } = renderPage(example('led-resistor.json'), { lang: 'es' });
  assert.doesNotMatch(html, /ui\/initialize|ui\/message|update-model-context|app-ask/);
  const viewer = renderAppViewer({ version: '1.2.3' });
  assert.match(viewer, /ui\/initialize/);
  assert.doesNotMatch(viewer, /ui\/message|sendMessage/, 'the viewer never puts text in the user\'s message box');
  assert.match(viewer, /<html data-version="1\.2\.3">/);
  assert.doesNotMatch(viewer, /id="page-data"|id="sim-program"|<main>/);
  assert.doesNotMatch(viewer, /<script src|<link |https?:\/\/(?!www\.w3\.org|www\.falstad\.com)/, 'no network (the Falstad export is a link the reader opens)');
  assert.ok(CONTEXT_MAX <= 300);
});

test('circuitAt rebuilds an older revision from the inverses in the history', () => {
  const dir = join(mkdtempSync(join(tmpdir(), 'protoboard-at-')), 'led');
  const circuit = example('led-resistor.json');
  createTarget(dir, circuit, { outputs: false });
  const paths = resolveTarget(dir);
  const rev0 = loadCircuit(paths);
  applyToTarget(dir, [{ op: 'set', part: 'R1', value: '1k' }], { outputs: false });
  applyToTarget(dir, [{ op: 'remove', part: 'D1' }], { outputs: false });
  undoTarget(dir, { outputs: false });
  const rev1 = circuitAt(paths, 1);
  assert.deepEqual(circuitAt(paths, 0), rev0);
  assert.equal(rev1.revision, 1);
  assert.equal(rev1.parts.find((p) => p.id === 'R1').value, '1k');
  assert.ok(rev1.parts.some((p) => p.id === 'D1'));
  assert.ok(!circuitAt(paths, 2).parts.some((p) => p.id === 'D1'));
  assert.equal(circuitAt(paths, 3).revision, 3);
  assert.equal(circuitAt(paths, 9), null);
  assert.equal(circuitAt(paths, -1), null);
});

test('the line sent about a tapped part carries readings only where the page shows results', () => {
  const part = { value: { text: 'Resistance: 330 Ω' } };
  const terms = [{ dataset: { explain: 'voltage' }, textContent: 'Voltage: 7.08 V ' }, { dataset: { explain: 'current' }, textContent: 'Current: 21.5 mA' }, { dataset: { explain: 'power' }, textContent: 'Power: 152 mW' }];
  const page = (results) => ({ data: { parts: { R1: part } }, state: { results }, info: { querySelectorAll: () => terms } });
  assert.deepEqual(partLine(page(true), 'R1'), { part: 'R1', about: 'Resistance: 330 Ω, Voltage: 7.08 V, Current: 21.5 mA' });
  assert.deepEqual(partLine(page(false), 'R1'), { part: 'R1', about: 'Resistance: 330 Ω' }, 'hidden results: no readings');
  // and a page made without results says so to the script
  const html = renderPage({ ...example('led-resistor.json'), page: { results: false } }, { lang: 'en' }).html;
  assert.doesNotMatch(html, /<body[^>]*data-results="on"/);
  assert.match(renderPage(example('led-resistor.json'), { lang: 'en' }).html, /<body[^>]*data-results="on"/);
});
