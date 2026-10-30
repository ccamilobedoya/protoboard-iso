#!/usr/bin/env node
// What a Claude Code session in this repository loads before the first message, measured from the
// files (the static part): CLAUDE.md, the agents' headers (their bodies load only when they run),
// .mcp.json, and the MCP server's instructions and tool schemas. project.json's context_kb caps the
// total (test/project.test.js). The real figure, with Claude Code's own prompt and anything private
// (CLAUDE.local.md), is what /context shows inside a session.
//
//   node scripts/context-size.js   one line per part and the total, in KB

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const bytes = (file) => Buffer.byteLength(readFileSync(join(root, file), 'utf8'));

// [{ what, bytes }]; the MCP part needs mcp/node_modules (npm install there), else it is null.
export async function startupContext() {
  const agents = readdirSync(join(root, '.claude/agents'))
    .filter((f) => f.endsWith('.md'))
    .reduce((n, f) => n + Buffer.byteLength(/^---\n([\s\S]*?)\n---/.exec(readFileSync(join(root, '.claude/agents', f), 'utf8'))?.[1] ?? ''), 0);
  let mcp = null;
  try {
    const { toolSchemas, INSTRUCTIONS } = await import('../mcp/tools.js');
    mcp = Buffer.byteLength(INSTRUCTIONS) + toolSchemas().reduce((n, t) => n + Buffer.byteLength(t.name + (t.description ?? '') + JSON.stringify(t.inputSchema)), 0);
  } catch {
    // the MCP server's dependencies are not installed
  }
  return [
    { what: 'CLAUDE.md', bytes: bytes('CLAUDE.md') },
    { what: 'agent headers (.claude/agents)', bytes: agents },
    { what: '.mcp.json', bytes: bytes('.mcp.json') },
    { what: 'MCP instructions and tool schemas', bytes: mcp },
  ];
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const parts = await startupContext();
  for (const p of parts) console.log(`${(p.bytes == null ? 'not measured' : `${(p.bytes / 1024).toFixed(1)} KB`).padStart(14)}  ${p.what}`);
  console.log(`${`${(parts.reduce((n, p) => n + (p.bytes ?? 0), 0) / 1024).toFixed(1)} KB`.padStart(14)}  total (the real figure in a session: /context)`);
}
