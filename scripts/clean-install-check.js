#!/usr/bin/env node
// What a person gets on a fresh clone, proven in a fresh clone: no node_modules from this checkout
// can hide a missing file or dependency. It clones the committed HEAD of this repository into a
// temporary folder (git clone of the local repo, no network), runs the README's "Try it in a
// minute" commands, runs `cd mcp && npm install` (the only step that needs the network), starts
// the MCP server over stdio with the SDK client that install put in the clone, and calls layout
// (a recipe), review, simulate and render with png_width.
//
//   node scripts/clean-install-check.js [--keep]
//
// Exits 0 when everything held, 1 when something failed, 2 when it could not run (no git, or npm
// could not reach the registry): a check that did not run is never a pass. Uncommitted changes are
// not in the clone: commit first. --keep leaves the temporary folder and prints its path.
// Written for Linux, macOS and Windows: argument arrays instead of shell strings, node:path for
// every path, os.tmpdir() for the scratch folder.

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repo = fileURLToPath(new URL('../', import.meta.url));
const keep = process.argv.includes('--keep');
const windows = process.platform === 'win32';

class CouldNotRun extends Error {}

// The commands of the README's smoke blocks (the ones the README test runs), as lines.
export function smokeLines(markdown) {
  return [...markdown.matchAll(/<!-- smoke -->\r?\n```(?:bash|sh)\r?\n([\s\S]*?)```/g)]
    .flatMap((m) => m[1].split(/\r?\n/))
    .map((l) => l.replace(/\s+#.*$/, '').trim())
    .filter((l) => l && !/^git clone |^cd protoboard-iso$/.test(l));
}

// A command line split into arguments the way a POSIX shell would for the simple cases the README
// uses: words, 'single quotes' and "double quotes". Nothing is run through a shell.
export function splitArgs(line) {
  const out = [];
  let cur = '';
  let open = false;
  let quote = null;
  for (const ch of line) {
    if (quote) {
      if (ch === quote) quote = null;
      else cur += ch;
    } else if (ch === "'" || ch === '"') {
      quote = ch;
      open = true;
    } else if (/\s/.test(ch)) {
      if (cur || open) out.push(cur);
      cur = '';
      open = false;
    } else cur += ch;
  }
  if (cur || open) out.push(cur);
  return out;
}

// Runs a program with an argument array. npm is a .cmd file on Windows, which only runs through
// the shell (its arguments here are plain words).
function run(file, args, options = {}) {
  const shell = windows && /^npm(\.cmd)?$/.test(file);
  const r = spawnSync(file, args, { encoding: 'utf8', shell, timeout: 10 * 60 * 1000, maxBuffer: 64 * 1024 * 1024, ...options });
  if (r.error) throw r.error.code === 'ENOENT' ? new CouldNotRun(`${file} was not found`) : r.error;
  return r;
}

const problems = [];
const check = (ok, what, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`);
  if (!ok) {
    problems.push(what);
    if (detail) console.log(`     ${String(detail).trim().split('\n').slice(-12).join('\n     ')}`);
  }
  return ok;
};

// External loads in a page: a script, style, image or frame fetched from the network. A plain
// link a person may click (an anchor) is not a load.
export function externalLoads(html) {
  const found = [];
  for (const m of html.matchAll(/<(script|img|iframe|source|video|audio|embed|link)\b[^>]*>/gi)) {
    const tag = m[0];
    if (/\b(?:src|data-src)\s*=\s*["']?(?:https?:)?\/\//i.test(tag)) found.push(tag.slice(0, 80));
    if (/^<link\b/i.test(tag) && /\bhref\s*=\s*["']?(?:https?:)?\/\//i.test(tag) && !/rel\s*=\s*["']?(?:canonical|alternate|author|license)/i.test(tag)) found.push(tag.slice(0, 80));
  }
  for (const m of html.matchAll(/url\(\s*["']?(?:https?:)?\/\/[^)]*\)/gi)) found.push(m[0].slice(0, 80));
  for (const m of html.matchAll(/@import\s+(?:url\()?\s*["']?(?:https?:)?\/\//gi)) found.push(m[0]);
  for (const m of html.matchAll(/\bimport\s*\(\s*["'](?:https?:)?\/\/[^"']*/g)) found.push(m[0]);
  return found;
}

const NETWORK = /ENOTFOUND|EAI_AGAIN|ETIMEDOUT|ECONNREFUSED|ECONNRESET|ENETUNREACH|EHOSTUNREACH|network|registry|proxy|getaddrinfo/i;

async function main(work) {
  const clone = join(work, 'clone');
  const circuits = join(work, 'circuits');
  mkdirSync(circuits);

  // 1. A fresh clone of the committed HEAD.
  const git = run('git', ['clone', '--quiet', repo, clone]);
  if (git.status !== 0) throw new CouldNotRun(`git clone failed: ${git.stderr}`);
  check(!existsSync(join(clone, 'node_modules')), 'the clone has no node_modules');

  // 2. The README's "Try it in a minute", as written, from the clone's folder.
  const readme = readFileSync(join(clone, 'README.md'), 'utf8');
  const lines = smokeLines(readme);
  check(lines.length >= 4, `the README has its try-it commands (${lines.length})`);
  let last = '';
  for (const line of lines) {
    const [program, ...args] = splitArgs(line);
    if (program !== 'node') {
      check(false, `README command not understood: ${line}`);
      continue;
    }
    const r = run(process.execPath, args.map((a) => (a.startsWith('bin/') ? join(clone, a) : a)), { cwd: clone });
    check(r.status === 0, `README: ${line}`, r.stderr || r.stdout);
    last = r.stdout;
  }
  check(/^(APPROVED|APROBADO) /m.test(last), 'README: the last command (review) approves the circuit');

  // 2b. Before any install the CLI cannot make a PNG: it says so readably and writes nothing.
  const cliFile = join(clone, 'bin', 'protoboard-iso.js');
  const png = join(work, 'cli.png');
  const cli = run(process.execPath, [cliFile, 'render', join(clone, splitArgs(lines[0])[3]), '-o', png], { cwd: clone });
  check(cli.status !== 0 && !existsSync(png) && /cd mcp && npm install/.test(cli.stderr), 'CLI before any install: render -o x.png fails readably (exit != 0, no file)', `${cli.status} ${cli.stderr}`);

  // 3. The documented MCP install. Only this step needs the network.
  const install = run('npm', ['install', '--no-audit', '--no-fund'], { cwd: join(clone, 'mcp') });
  if (install.status !== 0) {
    const text = `${install.stdout}${install.stderr}`;
    if (NETWORK.test(text)) throw new CouldNotRun(`npm install in mcp/ could not reach the registry:\n${text.trim().split('\n').slice(-6).join('\n')}`);
    check(false, 'cd mcp && npm install', text);
    return;
  }
  check(true, 'cd mcp && npm install');
  check(!existsSync(join(clone, 'node_modules')), 'still no node_modules at the clone root (the case that broke PNG)');

  // 4. After it, the same CLI command writes a real PNG (the rasteriser is found under mcp/).
  const png2 = join(work, 'cli2.png');
  const cli2 = run(process.execPath, [cliFile, 'render', join(clone, splitArgs(lines[0])[3]), '-o', png2, '--png-width', '600'], { cwd: clone });
  if (check(cli2.status === 0 && existsSync(png2), 'CLI after the MCP install: render -o x.png --png-width 600 succeeds', cli2.stderr)) {
    const bytes = readFileSync(png2);
    check(bytes.subarray(0, 8).equals(PNG_SIGNATURE) && bytes.readUInt32BE(16) === 600, 'CLI: the file is a PNG 600 px wide');
  }

  // 5. The MCP server over stdio, with the SDK the install put in the clone.
  const sdk = createRequire(join(clone, 'mcp', 'package.json'));
  const esm = (p) => pathToFileURL(sdk.resolve(p).replace(/([\\/])dist[\\/]cjs[\\/]/, '$1dist$1esm$1')).href;
  const { Client } = await import(esm('@modelcontextprotocol/sdk/client/index.js'));
  const { StdioClientTransport } = await import(esm('@modelcontextprotocol/sdk/client/stdio.js'));
  const client = new Client({ name: 'clean-install-check', version: '0.0.0' });
  await client.connect(new StdioClientTransport({ command: process.execPath, args: [join(clone, 'mcp', 'server.js')], env: { ...process.env, PROTOBOARD_ROOT: circuits, PROTOBOARD_LANG: 'en' } }));
  try {
    const textOf = (r) => r.content.filter((c) => c.type === 'text').map((c) => c.text).join('\n');
    const call = (name, args) => client.callTool({ name, arguments: args });

    const made = await call('layout', { target: 'sw', recipe: 'npn-switch', values: { R1: '470', D1: 'green' } });
    check(!made.isError && /STATUS: DONE/.test(textOf(made)), 'MCP layout (recipe npn-switch): STATUS DONE', textOf(made));
    const pageFile = join(circuits, 'sw', 'out', 'sw.html');
    if (check(existsSync(pageFile), 'the page file exists')) {
      const loads = externalLoads(readFileSync(pageFile, 'utf8'));
      check(loads.length === 0, 'the page loads nothing from the network', loads.join('\n'));
      check(textOf(made).includes(pageFile), 'the layout answer says where the page is (absolute path)', textOf(made).split('\n').slice(-3).join('\n'));
    }
    const reviewed = await call('review', { target: 'sw' });
    check(!reviewed.isError && /APPROVED/.test(textOf(reviewed)), 'MCP review: APPROVED', textOf(reviewed));
    const sim = await call('simulate', { target: 'sw' });
    check(!sim.isError && textOf(sim).length > 0, 'MCP simulate answers', textOf(sim));
    const drawn = await call('render', { target: 'sw', png_width: 600 });
    const image = drawn.content.find((c) => c.type === 'image');
    if (check(Boolean(image) && image.mimeType === 'image/png', 'MCP render with png_width: 600 returns an image block', textOf(drawn))) {
      const bytes = Buffer.from(image.data, 'base64');
      check(bytes.subarray(0, 8).equals(PNG_SIGNATURE), 'the image is a PNG (8-byte signature)');
      check(bytes.readUInt32BE(16) === 600, `the PNG is 600 px wide (IHDR says ${bytes.readUInt32BE(16)})`);
    }
  } finally {
    await client.close();
  }
}

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const work = mkdtempSync(join(tmpdir(), 'pbi-clean-'));
  let code = 0;
  try {
    await main(work);
    code = problems.length ? 1 : 0;
  } catch (e) {
    if (e instanceof CouldNotRun) {
      console.log(`COULD NOT RUN: ${e.message}`);
      code = 2;
    } else {
      console.log(`FAIL ${e.stack ?? e}`);
      code = 1;
    }
  } finally {
    if (keep) console.log(`kept: ${work}`);
    else rmSync(work, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
  console.log(code === 0 ? 'clean install: all good' : code === 1 ? `clean install: ${problems.length} problem(s)` : 'clean install: not checked');
  process.exit(code);
}
