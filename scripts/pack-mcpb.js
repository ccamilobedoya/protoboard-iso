#!/usr/bin/env node
// The desktop extension's folder: the MCP server (mcp/) as an MCP Bundle for Claude Desktop, installed
// with a double click (PLANNING.md, decision of 2026-11-15). Built in the release workflow, never
// committed. The bundle keeps the repository's layout (mcp/ beside src/), so no source file is
// rewritten; manifest.json is written here from package.json and the server's own tool list.
//
//   node scripts/pack-mcpb.js --out <dir>                    the folder (new or empty), with mcp/'s
//                                                            production dependencies installed
//   node scripts/pack-mcpb.js --out <dir> --no-install       the manifest and the files, no install (tests)
//   node scripts/pack-mcpb.js --out <dir> --pack <file.mcpb> also the official CLI's validate and pack
//
// The dependencies come from mcp/package-lock.json with npm ci --omit=dev --omit=optional in a
// temporary copy: the optional rasteriser (@resvg/resvg-js, MPL-2.0, one binary per platform) is
// never redistributed, and without it the server answers a PNG request with its usual message.

import { spawnSync } from 'node:child_process';
import { copyFileSync, cpSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { listTree } from './pack-skill.js';
import { tempDir } from './tmp.js';

const root = resolve(fileURLToPath(new URL('../', import.meta.url)));
const read = (f) => readFileSync(join(root, f), 'utf8');

// The official CLI, pinned: the release builds the .mcpb with exactly this version.
export const MCPB_CLI = '@anthropic-ai/mcpb@2.1.2';
export const MANIFEST_VERSION = '0.3';
export const ENTRY_POINT = 'mcp/server.js';
export const ROOT_CONFIG = 'circuits_folder';
// The Node the kit needs (package.json's engines, ">=22").
const NODE_MIN = /^>=(\d+)$/.exec(JSON.parse(read('package.json')).engines.node)[1];

// The first sentence of a tool's description: up to a full stop outside parentheses.
export function firstSentence(text) {
  let depth = 0;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '(') depth++;
    else if (text[i] === ')') depth = Math.max(0, depth - 1);
    else if (text[i] === '.' && depth === 0 && (i === text.length - 1 || /\s/.test(text[i + 1]))) return text.slice(0, i + 1);
  }
  return text;
}

// The tools a person sees: the server's own list, without those only the viewer calls (visibility
// ["app"], MCP Apps). The bundle sets PROTOBOARD_APPS=on, so the model also gets `selection`.
export async function bundleTools() {
  const { TOOLS } = await import(pathToFileURL(join(root, 'mcp/tools.js')).href);
  const { APP_TOOLS } = await import(pathToFileURL(join(root, 'mcp/app.js')).href);
  return [...TOOLS, ...APP_TOOLS]
    .filter((tool) => (tool.config._meta?.ui?.visibility ?? ['model', 'app']).includes('model'))
    .map((tool) => ({ name: tool.name, description: firstSentence(tool.config.description) }));
}

export function manifestFor(tools) {
  const pkg = JSON.parse(read('package.json'));
  const repository = pkg.repository.url.replace(/^git\+/, '');
  const web = repository.replace(/\.git$/, '');
  return {
    manifest_version: MANIFEST_VERSION,
    name: 'protoboard-iso',
    display_name: 'Protoboard ISO',
    version: pkg.version,
    description: 'Breadboard circuits built, checked, drawn and simulated, with the live board inside the conversation.',
    long_description: [
      'Ask for a circuit in plain words (an LED with its resistor, a 555 blinker, a sensor on a microcontroller) and Claude builds it on a breadboard: every part in its holes, the wires, a check that it is right.',
      'The board shows up live in the conversation: tap a part to see what it does, move a slider, watch the current flow. Each circuit is also saved as a page you can open in any browser.',
      'Your circuits are kept in the folder you choose. Nothing is sent anywhere: the kit runs on your computer.',
    ].join('\n\n'),
    author: { name: 'protoboard-iso contributors', url: web },
    repository: { type: 'git', url: repository },
    homepage: pkg.homepage,
    documentation: `${web}/blob/main/docs/en/mcp.md`,
    support: pkg.bugs.url,
    license: pkg.license,
    keywords: ['breadboard', 'electronics', 'circuit', 'simulation', 'education'],
    icon: 'icon.png',
    server: {
      type: 'node',
      entry_point: ENTRY_POINT,
      mcp_config: {
        command: 'node',
        args: [`\${__dirname}/${ENTRY_POINT}`],
        env: { PROTOBOARD_ROOT: `\${user_config.${ROOT_CONFIG}}`, PROTOBOARD_APPS: 'on' },
      },
    },
    tools,
    compatibility: { platforms: ['darwin', 'win32', 'linux'], runtimes: { node: `>=${NODE_MIN}.0.0` } },
    user_config: {
      [ROOT_CONFIG]: {
        type: 'directory',
        title: 'Circuits folder',
        description: 'Where your circuits are saved. The kit reads and writes only inside this folder, and creates it if it does not exist yet.',
        required: true,
        default: `\${DOCUMENTS}/Protoboard`,
      },
    },
  };
}

// The files of the repository the bundle carries: [from, to], the same relative paths. src/ without
// its Markdown notes (as the plugin), the server without its tests and notes.
export function bundleFiles() {
  const mcp = readdirSync(join(root, 'mcp'))
    .filter((f) => f.endsWith('.js') || f === 'package.json')
    .sort()
    .map((f) => `mcp/${f}`);
  const src = listTree(join(root, 'src'))
    .filter((f) => !f.endsWith('.md'))
    .map((f) => `src/${f}`);
  // The icon is the plugin's (plugin-src/icon.png), at the bundle's root as the manifest says.
  return [...['LICENSE', ...mcp, ...src].map((f) => [f, f]), ['plugin-src/icon.png', 'icon.png']];
}

// The bundle's package.json: src/ is ES modules, which Node reads from the nearest package.json.
const rootPackage = () => {
  const pkg = JSON.parse(read('package.json'));
  return { name: pkg.name, version: pkg.version, private: true, type: 'module', license: pkg.license };
};

// mcp/'s production dependencies, from its lockfile, into <dir>/mcp/node_modules. Every package
// installed must be in the lockfile as a production dependency, and the rasteriser must not be there.
function installDependencies(dir) {
  const work = tempDir('pack-mcpb-');
  for (const f of ['package.json', 'package-lock.json']) copyFileSync(join(root, 'mcp', f), join(work, f));
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const r = spawnSync(npm, ['ci', '--omit=dev', '--omit=optional', '--ignore-scripts', '--no-audit', '--no-fund'], { cwd: work, encoding: 'utf8', shell: process.platform === 'win32' });
  if (r.status !== 0) throw new Error(`npm ci failed (${r.status ?? r.error?.message}):\n${r.stdout}${r.stderr}`);
  const lock = JSON.parse(readFileSync(join(work, 'package-lock.json'), 'utf8')).packages;
  const installed = Object.keys(lock).filter((p) => p && existsSync(join(work, p, 'package.json')));
  const wrong = installed.filter((p) => lock[p].dev || lock[p].optional);
  if (existsSync(join(work, 'node_modules/@resvg'))) wrong.push('node_modules/@resvg');
  if (wrong.length) throw new Error(`not production dependencies: ${wrong.join(', ')}`);
  cpSync(join(work, 'node_modules'), join(dir, 'mcp/node_modules'), { recursive: true, filter: (from) => !/[\\/]node_modules[\\/]\.bin$/.test(from) });
  return installed.length;
}

// Writes the bundle's folder into dir, which must not exist or be empty. Returns its files.
export async function packTo(dir, { install = true } = {}) {
  if (existsSync(dir) && readdirSync(dir).length) throw new Error(`${dir} is not empty`);
  mkdirSync(dir, { recursive: true });
  const manifest = manifestFor(await bundleTools());
  writeFileSync(join(dir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  writeFileSync(join(dir, 'package.json'), `${JSON.stringify(rootPackage(), null, 2)}\n`);
  for (const [from, to] of bundleFiles()) {
    mkdirSync(dirname(join(dir, to)), { recursive: true });
    copyFileSync(join(root, from), join(dir, to));
  }
  const packages = install ? installDependencies(dir) : 0;
  return { files: listTree(dir), packages, manifest };
}

// The official CLI on the folder: validate, then pack into file.
export function runCli(dir, file) {
  const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  for (const args of [['validate', join(dir, 'manifest.json')], ['pack', dir, file]]) {
    const r = spawnSync(npx, ['--yes', MCPB_CLI, ...args], { encoding: 'utf8', stdio: 'inherit', shell: process.platform === 'win32' });
    if (r.status !== 0) throw new Error(`mcpb ${args[0]} failed (${r.status ?? r.error?.message})`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const argv = process.argv.slice(2);
  const value = (flag) => (argv.includes(flag) ? argv[argv.indexOf(flag) + 1] : undefined);
  const out = value('--out');
  const file = value('--pack');
  const install = !argv.includes('--no-install');
  try {
    if (!out) throw new Error('--out <dir> names the folder to write (new or empty)');
    if (argv.includes('--pack') && !file) throw new Error('--pack needs a file name');
    if (file && !install) throw new Error('--pack needs the dependencies: leave out --no-install');
    const { files, packages } = await packTo(resolve(out), { install });
    console.log(`${resolve(out)}: ${files.length} files${install ? `, ${packages} packages installed` : ', no dependencies (--no-install)'}.`);
    if (file) runCli(resolve(out), resolve(file));
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}
