// The plugin folder (plugin/, written by scripts/pack-skill.js): it is what a fresh pack writes, it
// passes the public directory's limits, its skill agrees with the kit (recipes, commands, STATUS
// values, links), the kit inside runs from a read-only copy, and its catalog says what the
// repository's says about every part without the examples/ it does not carry.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, normalize } from 'node:path';
import { pathToFileURL } from 'node:url';
import { listTree, SKILL, staleness } from '../scripts/pack-skill.js';
import { RECIPES } from '../src/recipes/index.js';
import en from '../src/i18n/en.js';
import { t } from '../src/i18n/index.js';
import { compactCatalog, catalogEntry } from '../src/node/catalog.js';
import { MODULES } from '../src/parts/modules.js';
import { BOARDS } from '../src/board/board.js';

const root = new URL('../', import.meta.url).pathname;
const plugin = join(root, 'plugin');
const skillDir = join(plugin, 'skills', SKILL);
const read = (f) => readFileSync(join(root, f), 'utf8');
const files = listTree(plugin);
const pkg = JSON.parse(read('package.json'));

// The frontmatter's fields (one line each) and the body of a SKILL.md.
export function frontmatter(text) {
  const m = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(text);
  if (!m) return null;
  return { fields: Object.fromEntries([...m[1].matchAll(/^([a-z-]+): (.*)$/gm)].map((x) => [x[1], x[2]])), body: m[2] };
}
// The text inside code: fenced blocks and `spans`.
const codeOf = (md) => [...md.matchAll(/^```[^\n]*\n([\s\S]*?)^```/gm), ...md.replace(/^```[\s\S]*?^```/gm, '').matchAll(/`([^`\n]+)`/g)].map((m) => m[1]).join('\n');
const proseOf = (md) => md.replace(/^```[\s\S]*?^```/gm, '');
const docs = () => ['SKILL.md', ...files.filter((f) => f.startsWith(`skills/${SKILL}/references/`)).map((f) => f.slice(`skills/${SKILL}/`.length))].map((f) => [f, readFileSync(join(skillDir, f), 'utf8')]);

test('plugin: plugin/ is what a fresh pack writes (npm run pack-skill)', () => {
  assert.deepEqual(staleness(), []);
});

test("plugin: the public directory's limits", () => {
  assert.ok(files.length <= 512, `${files.length} files, 512 at most`);
  const big = files.filter((f) => !/\.(png|jpe?g|gif|webp|svg|woff2?|ttf|otf)$/i.test(f) && statSync(join(plugin, f)).size > 256 * 1024);
  assert.deepEqual(big, [], 'no file over 256 KiB but images and fonts');
  const parts = [...new Set(files.flatMap((f) => f.split('/')))];
  assert.deepEqual(parts.filter((p) => /^(\.DS_Store|Thumbs\.db|desktop\.ini|__MACOSX)$/i.test(p)), [], 'system junk');
  const windows = parts.filter((p) => /[:<>|?*"\\]/.test(p) || /[. ]$/.test(p) || /^(con|prn|aux|nul|com\d|lpt\d)(\.|$)/i.test(p));
  assert.deepEqual(windows, [], 'names Windows does not accept');
  const lower = new Map();
  for (const f of files) lower.set(f.toLowerCase(), [...(lower.get(f.toLowerCase()) ?? []), f]);
  assert.deepEqual([...lower.values()].filter((v) => v.length > 1), [], 'names that differ only by case');
  assert.ok(!existsSync(join(plugin, 'bin')), 'no top-level bin/: claude.ai refuses the plugin');
  const manifest = JSON.parse(readFileSync(join(plugin, '.claude-plugin/plugin.json'), 'utf8'));
  assert.match(manifest.name, /^[a-z0-9-]{1,64}$/);
  assert.equal(manifest.version, pkg.version);
  const readme = readFileSync(join(plugin, 'README.md'), 'utf8');
  assert.ok(proseOf(readme).split(/\s+/).filter((w) => /\w/.test(w)).length >= 40, 'README: 40 words or more outside code');
  const repo = /github\.com\/([^/]+\/[^/.]+)/.exec(pkg.repository.url)[1];
  assert.ok(readme.includes(`/plugin marketplace add ${repo}`), 'README: the install line');
  assert.ok(readFileSync(join(plugin, 'LICENSE'), 'utf8').includes('MIT'));
  const market = JSON.parse(read('.claude-plugin/marketplace.json'));
  assert.equal(market.plugins.length, 1);
  assert.equal(market.plugins[0].name, manifest.name);
  assert.equal(market.plugins[0].source, './plugin');
});

test("plugin: the skill's frontmatter", () => {
  const fm = frontmatter(readFileSync(join(skillDir, 'SKILL.md'), 'utf8'));
  assert.ok(fm, 'SKILL.md starts with a frontmatter');
  assert.equal(fm.fields.name, SKILL, 'name = its folder');
  assert.match(fm.fields.name, /^[a-z0-9-]{1,64}$/);
  assert.ok(fm.fields.description.length <= 1024, `description: ${fm.fields.description.length} characters, 1024 at most`);
  // 8 KB since the skill also says where the kit has no answer and how a trial works (2026-11-16).
  assert.ok(Buffer.byteLength(fm.body) < 8 * 1024, `body: ${Buffer.byteLength(fm.body)} bytes, the short skill stays under 8 KB`);
});

test('plugin: the skill and the kit agree (recipes, commands, STATUS values, links)', () => {
  const skill = readFileSync(join(skillDir, 'SKILL.md'), 'utf8');
  // Recipes: the list after "Recipes:" names every recipe of the kit, and nothing else.
  const list = /Recipes: ([\s\S]*?)\.\n/.exec(skill)?.[1].split(/,\s*/).map((s) => s.trim());
  assert.ok(list, 'SKILL.md lists the recipes after "Recipes:"');
  assert.deepEqual([...list].sort(), Object.keys(RECIPES).sort());
  const commands = new Set([...read('bin/protoboard-iso.js').matchAll(/command === '([a-z]+)'/g)].map((m) => m[1]));
  const statuses = Object.keys(en).filter((k) => k.startsWith('layout.status.')).map((k) => k.slice('layout.status.'.length).toUpperCase());
  const bad = [];
  for (const [file, text] of docs()) {
    const code = codeOf(text);
    for (const m of code.matchAll(/--recipe ([a-z0-9-]+)/g)) if (!RECIPES[m[1]]) bad.push(`${file}: recipe ${m[1]}`);
    // The recipe tables of the references: every name in a row's first cell.
    for (const m of text.matchAll(/^\| (`[a-z0-9-]+`(?:, `[a-z0-9-]+`)*) \|/gm)) {
      for (const r of m[1].matchAll(/`([a-z0-9-]+)`/g)) if (!RECIPES[r[1]]) bad.push(`${file}: recipe ${r[1]} in a table`);
    }
    // Commands: after "kit " or "protoboard-iso.js ", and the lists "kit review | check | …".
    for (const m of code.matchAll(/(?:\bkit|protoboard-iso\.js) ([a-z][a-z-]*)((?: \| [a-z]+)*)/g)) {
      for (const c of [m[1], ...m[2].split(' | ').slice(1)]) if (!commands.has(c)) bad.push(`${file}: command ${c}`);
    }
    for (const m of text.matchAll(/STATUS: ([A-Z_]+)/g)) if (!statuses.includes(m[1])) bad.push(`${file}: STATUS ${m[1]}`);
    for (const m of proseOf(text).matchAll(/\]\(([^)#\s]+)/g)) {
      if (/^[a-z][a-z0-9+.-]*:/i.test(m[1])) continue;
      if (!existsSync(join(skillDir, normalize(join(dirname(file), m[1]))))) bad.push(`${file}: link ${m[1]}`);
    }
  }
  assert.deepEqual(bad, []);
  // The STATUS table of SKILL.md: one row per value the kit can print, and no other.
  const rows = [...skill.matchAll(/^\| `([A-Z_]+)` \|/gm)].map((m) => m[1]);
  assert.deepEqual([...rows].sort(), [...statuses].sort(), "SKILL.md's STATUS table");
  for (const ref of ['spec.md', 'operations.md', 'board-and-cli.md', 'recipes.md', 'beyond-the-kit.md']) assert.ok(skill.includes(`](references/${ref})`), `SKILL.md points to references/${ref}`);
});

test('plugin: the packed kit runs from a read-only copy: layout --recipe led-resistor ends in DONE and writes the page', () => {
  const temp = mkdtempSync(join(tmpdir(), 'plugin-run-'));
  const copy = join(temp, 'skill');
  try {
    cpSync(skillDir, copy, { recursive: true });
    // Read-only, as the chat's copy of a skill may be (on Windows chmod does not reach folders).
    if (process.platform !== 'win32') spawnSync('chmod', ['-R', 'a-w', copy]);
    const work = join(temp, 'work');
    const r = spawnSync(process.execPath, [join(copy, 'scripts/bin/protoboard-iso.js'), 'layout', join(work, 'led'), '--recipe', 'led-resistor'], { cwd: temp, encoding: 'utf8' });
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.match(r.stdout, /^STATUS: DONE/m);
    assert.ok(existsSync(join(work, 'led/out/led.html')), 'the page is written');
  } finally {
    if (process.platform !== 'win32') spawnSync('chmod', ['-R', 'u+w', copy]);
    rmSync(temp, { recursive: true, force: true });
  }
});

test("plugin: the packed catalog, without examples/, says what the repository's says about every part, in both languages", async () => {
  // The packed copy, imported where it is: its examples/ would be beside its src/, and there is none.
  assert.ok(!existsSync(join(skillDir, 'scripts/examples')), 'the plugin carries no examples/');
  const packed = await import(pathToFileURL(join(skillDir, 'scripts/src/node/catalog.js')).href);
  const types = compactCatalog('en').types;
  const names = [...Object.keys(types), ...Object.values(types).flatMap((v) => v.parts ?? []), ...Object.keys(MODULES), ...Object.keys(BOARDS)];
  const facts = (e) => e && { about: e.about, pinRoles: e.pinRoles, limits: e.limits, limitFields: e.limitFields };
  for (const lang of ['en', 'es']) {
    for (const name of names) {
      const repo = catalogEntry(name, lang);
      assert.ok(repo, `${name}: in the catalog`);
      assert.deepEqual(facts(packed.catalogEntry(name, lang)), facts(repo), `${name} (${lang})`);
      if (repo.kind !== 'board') assert.ok(repo.about, `${name} (${lang}): it has its card's text`);
    }
  }
  assert.equal(packed.catalogEntry('resistor').example, null, 'the packed catalog has no example to show');
});

test('plugin: from a read-only copy, catalog resistor, UNO and relay say what the part is and its limits, in both languages', () => {
  const temp = mkdtempSync(join(tmpdir(), 'plugin-catalog-'));
  const copy = join(temp, 'skill');
  try {
    cpSync(skillDir, copy, { recursive: true });
    if (process.platform !== 'win32') spawnSync('chmod', ['-R', 'a-w', copy]);
    for (const lang of ['en', 'es']) {
      for (const name of ['resistor', 'UNO', 'relay']) {
        const r = spawnSync(process.execPath, [join(copy, 'scripts/bin/protoboard-iso.js'), 'catalog', name, '--lang', lang], { cwd: temp, encoding: 'utf8' });
        assert.equal(r.status, 0, r.stdout + r.stderr);
        for (const key of ['catalog.about', 'catalog.limits']) assert.ok(r.stdout.includes(`\n  ${t(lang, key)} `), `${name} (${lang}): ${t(lang, key)}\n${r.stdout}`);
      }
    }
  } finally {
    if (process.platform !== 'win32') spawnSync('chmod', ['-R', 'u+w', copy]);
    rmSync(temp, { recursive: true, force: true });
  }
});
