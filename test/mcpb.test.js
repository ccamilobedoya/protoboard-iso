// The desktop extension's folder (scripts/pack-mcpb.js), written without the dependency install: its
// manifest has what the MCPB specification requires and agrees with package.json and the server's
// own tools, it carries the server and nothing of the repository's development files, and every
// relative import of the bundled code resolves inside the bundle.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, normalize } from 'node:path';
import { tempDir } from '../scripts/tmp.js';

const root = new URL('../', import.meta.url).pathname;
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const mcpPkg = JSON.parse(readFileSync(join(root, 'mcp/package.json'), 'utf8'));
// Importing the server's tools needs its dependencies (zod), as test/project.test.js does.
const noDeps = !existsSync(join(root, 'mcp/node_modules/zod'));

let packed;
async function bundle() {
  if (!packed) {
    const { packTo } = await import('../scripts/pack-mcpb.js');
    const dir = join(tempDir('mcpb-test-'), 'bundle');
    packed = { dir, ...(await packTo(dir, { install: false })) };
  }
  return packed;
}

// Left out on purpose: the catalog shows a real part from examples/ when they are there, and says the
// same without them (test/plugin.test.js proves it on the plugin, which has no examples/ either).
const ABSENT = ['src/node/catalog.js → ../../examples/'];

// The specifiers a module imports: static and dynamic imports, exports from, workers and files
// read with new URL(…, import.meta.url).
export function specifiersOf(code) {
  const out = [];
  for (const m of code.matchAll(/^\s*(?:import|export)\s[^'"]*?\bfrom\s*['"]([^'"]+)['"]/gm)) out.push(m[1]);
  for (const m of code.matchAll(/^\s*import\s*['"]([^'"]+)['"]/gm)) out.push(m[1]);
  for (const m of code.matchAll(/\bimport\(\s*['"]([^'"]+)['"]\s*\)/g)) out.push(m[1]);
  for (const m of code.matchAll(/new URL\(\s*['"]([^'"]+)['"]\s*,\s*import\.meta\.url\s*\)/g)) out.push(m[1]);
  return out;
}

test('mcpb: specifiersOf reads the import forms the kit uses', () => {
  const code = "import { a } from './a.js';\nimport {\n  b,\n} from '../b.js';\nexport { c } from './c.js';\nimport './d.js';\nconst e = await import('node:fs');\nnew Worker(new URL('./w.js', import.meta.url));\n// import nothing from 'x' here\n";
  assert.deepEqual(specifiersOf(code).sort(), ['../b.js', './a.js', './c.js', './d.js', './w.js', 'node:fs']);
});

test('mcpb: the manifest has the fields the specification requires and agrees with package.json', { skip: noDeps && 'mcp/node_modules is missing: cd mcp && npm install' }, async () => {
  const { dir, manifest, packages } = await bundle();
  assert.equal(packages, 0, '--no-install installs nothing');
  const written = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8'));
  assert.deepEqual(written, manifest);
  for (const field of ['manifest_version', 'name', 'version', 'description', 'author', 'server']) assert.ok(written[field], `required: ${field}`);
  assert.equal(written.manifest_version, '0.3');
  assert.equal(written.name, 'protoboard-iso');
  assert.equal(written.display_name, 'Protoboard ISO');
  assert.equal(written.version, pkg.version);
  assert.equal(mcpPkg.version, pkg.version, 'mcp/package.json has the same version');
  assert.equal(written.license, 'MIT');
  assert.equal(written.author.name, 'protoboard-iso contributors');
  assert.match(written.repository.url, /^https:\/\/github\.com\/.+\.git$/);
  const { server } = written;
  assert.equal(server.type, 'node');
  assert.ok(existsSync(join(dir, server.entry_point)), 'the entry point is in the bundle');
  assert.equal(server.mcp_config.command, 'node');
  assert.deepEqual(server.mcp_config.args, [`\${__dirname}/${server.entry_point}`]);
  assert.deepEqual(server.mcp_config.env, { PROTOBOARD_ROOT: `\${user_config.circuits_folder}`, PROTOBOARD_APPS: 'on' });
  assert.deepEqual(Object.keys(written.user_config), ['circuits_folder']);
  assert.equal(written.user_config.circuits_folder.type, 'directory');
  assert.equal(written.user_config.circuits_folder.required, true);
  assert.equal(written.compatibility.runtimes.node, `>=${/^>=(\d+)$/.exec(pkg.engines.node)[1]}.0.0`, "the Node engines promises");
  assert.deepEqual(written.compatibility.platforms, ['darwin', 'win32', 'linux']);
  assert.equal(JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')).type, 'module', 'src/ is read as ES modules');
});

test("mcpb: the manifest's tools are the server's, without those only the viewer calls", { skip: noDeps && 'mcp/node_modules is missing: cd mcp && npm install' }, async () => {
  const { manifest } = await bundle();
  const { TOOLS } = await import('../mcp/tools.js');
  const { APP_TOOLS } = await import('../mcp/app.js');
  const appOnly = APP_TOOLS.filter((t) => t.config._meta?.ui?.visibility?.join() === 'app').map((t) => t.name);
  assert.ok(appOnly.includes('page_parts') && appOnly.includes('selection_set'));
  const expected = [...TOOLS, ...APP_TOOLS].map((t) => t.name).filter((n) => !appOnly.includes(n));
  assert.deepEqual(manifest.tools.map((t) => t.name), expected);
  for (const tool of manifest.tools) assert.ok(tool.description && tool.description.length <= 400, `${tool.name}: a short description`);
});

test('mcpb: the server and the kit it imports, nothing of tests, docs, examples, the plugin or the rasteriser', { skip: noDeps && 'mcp/node_modules is missing: cd mcp && npm install' }, async () => {
  const { files } = await bundle();
  const top = [...new Set(files.map((f) => f.split('/')[0]))].sort();
  assert.deepEqual(top, ['LICENSE', 'icon.png', 'manifest.json', 'mcp', 'package.json', 'src']);
  assert.equal(packed.manifest.icon, 'icon.png');
  const banned = files.filter((f) => /^(test|docs|examples|plugin|plugin-src|scripts|bin|schema|mcp\/test)\//.test(f) || f.includes('node_modules/@resvg') || f.endsWith('.md'));
  assert.deepEqual(banned, []);
  for (const f of ['mcp/server.js', 'mcp/core.js', 'mcp/tools.js', 'mcp/app.js', 'mcp/kit-worker.js', 'mcp/package.json', 'src/index.js']) assert.ok(files.includes(f), f);
  assert.ok(readFileSync(join(packed.dir, 'LICENSE'), 'utf8').includes('MIT'));
});

test('mcpb: every relative import of the bundled code resolves inside the bundle, and packages are only the declared ones', { skip: noDeps && 'mcp/node_modules is missing: cd mcp && npm install' }, async () => {
  const { dir, files } = await bundle();
  const declared = new Set([...Object.keys(mcpPkg.dependencies), ...Object.keys(mcpPkg.optionalDependencies ?? {})]);
  const missing = [];
  const undeclared = [];
  for (const file of files.filter((f) => f.endsWith('.js'))) {
    for (const spec of specifiersOf(readFileSync(join(dir, file), 'utf8'))) {
      if (spec.startsWith('.')) {
        const target = normalize(join(dirname(file), spec)).split('\\').join('/').replace(/\/$/, '');
        // A folder (new URL('.', …)) resolves when some file is in it.
        const found = target === '.' || files.includes(target) || files.some((f) => f.startsWith(`${target}/`));
        if ((target.startsWith('..') || !found) && !ABSENT.includes(`${file} → ${spec}`)) missing.push(`${file} → ${spec}`);
      } else if (!spec.startsWith('node:')) {
        const name = spec.startsWith('@') ? spec.split('/').slice(0, 2).join('/') : spec.split('/')[0];
        if (!declared.has(name)) undeclared.push(`${file} → ${spec}`);
      }
    }
  }
  assert.deepEqual(missing, []);
  assert.deepEqual(undeclared, []);
});
