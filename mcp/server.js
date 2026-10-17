#!/usr/bin/env node
// MCP server for protoboard-iso, over stdio. The tools are defined in tools.js; their handlers run
// in a worker (kit-worker.js). Before each call the server checks whether the kit's code (src/ and
// the tools) changed since the worker started; if so it starts a new worker, so the answers and the
// pages written always come from the current code, without reconnecting. Changing a tool's name or
// its input schema still needs a reconnect: the answer says so.
//
// Environment: PROTOBOARD_ROOT, PROTOBOARD_LANG (see tools.js).

import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Worker } from 'node:worker_threads';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { TOOLS, INSTRUCTIONS, VERSION } from './tools.js';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const WATCHED = [join(HERE, '..', 'src'), join(HERE, 'tools.js'), join(HERE, 'kit-worker.js')];

// The newest modification time of the kit's code: a cheap stat walk (a few hundred files).
function codeStamp() {
  let newest = 0;
  const walk = (path) => {
    let s;
    try {
      s = statSync(path);
    } catch {
      return;
    }
    if (s.isDirectory()) for (const name of readdirSync(path)) walk(join(path, name));
    else if (/\.(m?js|json)$/.test(path) && s.mtimeMs > newest) newest = s.mtimeMs;
  };
  WATCHED.forEach(walk);
  return newest;
}

const registered = TOOLS.map((tool) => tool.name);
let worker = null;
let stamp = 0;
let ready = null;
let next = 1;
const pending = new Map();

function startWorker() {
  stamp = codeStamp();
  const w = new Worker(new URL('./kit-worker.js', import.meta.url));
  worker = w;
  ready = new Promise((resolveReady, rejectReady) => {
    w.on('message', (msg) => {
      if (msg.ready) return resolveReady(msg.tools);
      const done = pending.get(msg.id);
      if (!done) return;
      pending.delete(msg.id);
      done.resolve(msg.result);
    });
    w.on('error', (e) => {
      rejectReady(e);
      for (const [id, done] of pending) {
        if (done.worker !== w) continue;
        pending.delete(id);
        done.resolve({ isError: true, content: [{ type: 'text', text: `The kit failed: ${e.message}` }] });
      }
      if (worker === w) worker = null;
    });
    w.on('exit', () => {
      if (worker === w) worker = null;
    });
  });
  ready.catch(() => {});
}

async function call(name, args) {
  const notes = [];
  if (worker && codeStamp() !== stamp) {
    worker.terminate();
    worker = null;
    notes.push('The kit\'s code changed: reloaded it before answering.');
  }
  if (!worker) startWorker();
  let tools;
  try {
    tools = await ready;
  } catch (e) {
    worker = null;
    return { isError: true, content: [{ type: 'text', text: `The kit does not load (fix it and call again): ${e.message}` }] };
  }
  if (notes.length && (tools.length !== registered.length || tools.some((n) => !registered.includes(n)))) {
    notes.push('Its list of tools changed too: reconnect the MCP server (/mcp) to see the new ones.');
  }
  const w = worker;
  const id = next++;
  const result = await new Promise((resolveCall) => {
    pending.set(id, { resolve: resolveCall, worker: w });
    w.postMessage({ id, name, args });
  });
  return notes.length ? { ...result, content: [...(result.content ?? []), { type: 'text', text: notes.join(' ') }] } : result;
}

const server = new McpServer({ name: 'protoboard-iso', version: VERSION }, { instructions: INSTRUCTIONS });
for (const tool of TOOLS) server.registerTool(tool.name, tool.config, (args) => call(tool.name, args));

startWorker();
await server.connect(new StdioServerTransport());
