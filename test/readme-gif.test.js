// scripts/readme-gif.js, the README's hero animation: only what is cheap and deterministic. Its
// arguments, its ffmpeg graph, and its timeline (examples/tours/readme-hero.json) checked against
// the circuit the script lays out (9 V, a goal of 15 mA). The GIF itself needs a browser and ffmpeg.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { filterGraph, parseArgs, RECIPE } from '../scripts/readme-gif.js';
import { tempDir } from '../scripts/tmp.js';

const root = new URL('../', import.meta.url).pathname;

test('readme-gif: arguments', () => {
  const d = parseArgs([]);
  assert.deepEqual(d.langs, ['en', 'es']);
  assert.equal(d.fps, 15);
  assert.equal(d.width, 960);
  assert.ok(d.out.endsWith(join('docs', 'img')));
  assert.deepEqual(parseArgs(['--lang', 'es']).langs, ['es']);
  assert.deepEqual(parseArgs(['--lang', 'both', '--fps', '12', '--width', '800']), { ...d, fps: 12, width: 800 });
  assert.throws(() => parseArgs(['--lang', 'fr']), /en, es or both/);
  assert.throws(() => parseArgs(['--fps', '2']), /--fps/);
  assert.throws(() => parseArgs(['--width', 'wide']), /--width/);
  assert.throws(() => parseArgs(['--fps']), /needs a value/);
  assert.throws(() => parseArgs(['hero.gif']), /unknown argument/);
});

test('readme-gif: the graph holds the empty board, then the reading, and ends on the first frame', () => {
  const g = filterGraph({ duration: 6, valueAt: 3, width: 960 });
  assert.match(g, /tpad=start_mode=clone:start_duration=1\.2/);
  assert.match(g, /fade=in:st=4\.20:d=0\.35:alpha=1\[reading\]/, 'the reading when the recording showed it, after the hold');
  assert.match(g, /xfade=transition=fade:duration=0\.5:offset=6\.70/, 'the loop closes on the first frame');
  assert.match(g, /scale=960:-2:flags=lanczos/);
  assert.match(g, /palettegen.*paletteuse/);
});

test('readme-gif: its timeline plays the circuit it lays out without a warning', () => {
  const dir = tempDir('pbi-readme-gif-');
  const node = (args) => spawnSync(process.execPath, args, { cwd: dir, encoding: 'utf8' });
  const laid = node([join(root, 'bin/protoboard-iso.js'), 'layout', 'hero', '--recipe', RECIPE.name, '--values', JSON.stringify(RECIPE.values)]);
  assert.equal(laid.status, 0, laid.stdout + laid.stderr);
  assert.match(laid.stdout, /Solved: R1 = \S+ Ω .* for D1 at 15 mA/);
  const checked = node([join(root, 'scripts/render-frames.js'), join(root, 'examples/tours/readme-hero.json'), '--validate', '--circuit', join(dir, 'hero')]);
  assert.equal(checked.status, 0, checked.stdout + checked.stderr);
  assert.match(checked.stdout, /no problems/);
});
