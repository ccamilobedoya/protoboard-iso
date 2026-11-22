// Small answers that said less than they should (2026-11 trust work): the buzzer entry says which kind
// is which, an unknown part with no close name says so and where to look, a common ask the kit lacks
// names what it has near, a missing value says it is missing, an option's own message is the last
// line, and the doubts' heading is true both for what the kit could not check and for what it found.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { resolvePart } from '../src/parts/resolve.js';
import { formatLayout } from '../src/layout.js';
import { autoLayout } from './layout-generous.js';
import { formatIssue, t } from '../src/index.js';
import { catalogEntry } from '../src/node/catalog.js';

const root = new URL('../', import.meta.url).pathname;
const cli = (args) => spawnSync(process.execPath, [join(root, 'bin/protoboard-iso.js'), ...args], { cwd: root, encoding: 'utf8' });
const said = (raw, lang = 'en') => formatIssue(resolvePart(raw).error, lang);

test('catalog buzzer says which is the passive one and which the active one; TMB12A05 is not called passive', () => {
  for (const lang of ['en', 'es']) {
    const passive = catalogEntry('buzzer', lang).about;
    assert.match(passive, lang === 'en' ? /with no part number it is this passive one; part TMB12A05 is the active one/ : /sin número de parte es este, el pasivo; la parte TMB12A05 es el activo/);
    const active = catalogEntry('TMB12A05', lang).about;
    assert.match(active, lang === 'en' ? /^Active buzzer \(TMB12A05\)/ : /^Zumbador activo \(TMB12A05\)/);
    assert.doesNotMatch(active, lang === 'en' ? /^Passive/ : /^Zumbador pasivo/);
  }
});

test('an unknown part with nothing close says so and points to catalog, never "Closest: —"', () => {
  for (const lang of ['en', 'es']) {
    const text = said({ id: 'X1', type: 'zzqqv' }, lang);
    assert.doesNotMatch(text, /—/);
    assert.match(text, /catalog/);
  }
  assert.match(said({ id: 'X1', type: 'zzqqv' }), /the kit does not know "zzqqv" and has no part with a close name/);
  // A name with close ones keeps them.
  assert.match(said({ id: 'D1', part: '1N4148W' }), /Closest: 1N4148/);
});

test('common asks the kit lacks name what it has that is near (speaker, LED strip, servo, transformer, LCD)', () => {
  const asks = { speaker: /passive buzzer \(type buzzer\)/, 'LED strip': /single LEDs \(type led\)/, WS2812B: /single LEDs/, servo: /DC motor \(type motor\)/, SG90: /DC motor/, transformer: /signal generator/, LCD1602: /7-segment display \(type seven-segment\)/, altavoz: /passive buzzer/ };
  for (const [name, near] of Object.entries(asks)) {
    const text = said({ id: 'X1', part: name });
    assert.match(text, new RegExp(`the kit does not know "${name}"`), name);
    assert.match(text, near, name);
    assert.match(said({ id: 'X1', part: name }, 'es'), /Lo más cercano que tiene:/, name);
  }
});

test('a resistor with no value says the value is missing and what it takes, never "undefined"', () => {
  const r = autoLayout({ parts: [{ id: 'BT1', type: 'battery', format: '9V' }, { id: 'R1', type: 'resistor' }, { id: 'D1', type: 'led' }], nets: [['BT1.+', 'R1.1'], ['R1.2', 'D1.A'], ['D1.K', 'BT1.-']] });
  assert.equal(r.status, 'fix_spec');
  for (const lang of ['en', 'es']) {
    const text = formatLayout(r, lang, { t, formatIssue });
    assert.doesNotMatch(text, /undefined/);
    assert.match(text, lang === 'en' ? /R1: its value is missing\. It takes a resistance in ohms/ : /R1: le falta el valor\. Lleva una resistencia en ohmios/);
  }
  for (const type of ['capacitor', 'inductor', 'potentiometer', 'zener']) {
    const e = resolvePart({ id: 'X1', type });
    if (!e.error) continue; // a type with a default value
    assert.doesNotMatch(said({ id: 'X1', type }), /undefined/, type);
  }
});

test('--expect-revision abc: the last line names the option (and where the options are)', () => {
  for (const [lang, word] of [['en', /--expect-revision takes a number, not "abc"\. See the options with --help\.$/], ['es', /--expect-revision.*abc.*--help\.$/]]) {
    const r = cli(['layout', 'x', '--expect-revision', 'abc', '--lang', lang]);
    assert.equal(r.status, 2);
    assert.match(r.stderr.trim().split('\n').at(-1), word);
  }
});

test("the doubts' heading holds for what the kit could not check and for what it found not working", () => {
  // A part with no model (not checked) and a button across joined pins (checked, found wrong) share it.
  assert.equal(t('en', 'review.doubts'), 'The kit cannot confirm these work (so it cannot say the circuit works):');
  assert.equal(t('es', 'review.doubts'), 'El kit no puede confirmar que esto funcione (así que no puede decir que el circuito funciona):');
});

test("a board's .ino beside circuit.json runs in simulate --run and in layout's Behaviour line", async () => {
  const { tempDir } = await import('../scripts/tmp.js');
  const { mkdirSync, writeFileSync } = await import('node:fs');
  const dir = tempDir('pb-ino-run-');
  mkdirSync(join(dir, 'circuits/blink'), { recursive: true });
  writeFileSync(join(dir, 'circuits/blink/blink.ino'), 'void setup() { pinMode(13, OUTPUT); Serial.begin(9600); }\nvoid loop() { digitalWrite(13, HIGH); Serial.println(1); delay(500); digitalWrite(13, LOW); delay(500); }\n');
  const run = (args) => spawnSync(process.execPath, [join(root, 'bin/protoboard-iso.js'), ...args], { cwd: dir, encoding: 'utf8' });
  const made = run(['layout', 'circuits/blink', '--recipe', 'uno-blink', '--values', '{"U1": "blink.ino"}']);
  assert.equal(made.status, 0, made.stdout + made.stderr);
  assert.match(made.stdout, /\nBehaviour, first 2 s from its resting point, as the page starts \(simulated, a model\): D1 1 Hz, on 50 % of the time/);
  const r = run(['simulate', 'circuits/blink', '--run', '1', '--env', 'light=100']);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /^Serial \(\d+ lines?, in order\):/m, 'the program ran from its file, with an environment given too');
  assert.match(r.stdout, /D1 \(LED\): [^\n]*1 Hz|D1 \(LED\): on 50 %/);
});
