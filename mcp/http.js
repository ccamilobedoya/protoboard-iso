#!/usr/bin/env node
// The same MCP server over Streamable HTTP on 127.0.0.1 only, for testing the MCP App with a local
// host (the official basic-host talks HTTP): node mcp/http.js [port] (default 3001), endpoint /mcp.
// Not a way to serve the kit to anyone: no sign-in, loopback only, every session in one process.
//
// Environment: PROTOBOARD_ROOT, PROTOBOARD_LANG (see tools.js).

import { createServer as createHttpServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createServer } from './core.js';

const port = Number(process.argv[2] ?? 3001);
const sessions = new Map();
const LOCAL_ORIGIN = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

const body = (req) =>
  new Promise((resolveBody, reject) => {
    let text = '';
    req.setEncoding('utf8');
    req.on('data', (chunk) => (text += chunk));
    req.on('end', () => {
      try {
        resolveBody(text ? JSON.parse(text) : undefined);
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });

const http = createHttpServer(async (req, res) => {
  // A page on this machine (the test host) may call it; nothing else.
  const origin = req.headers.origin;
  if (origin && !LOCAL_ORIGIN.test(origin)) return res.writeHead(403).end();
  if (origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Headers', 'content-type, mcp-session-id, mcp-protocol-version, last-event-id, accept');
    res.setHeader('Access-Control-Expose-Headers', 'mcp-session-id');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  }
  if (req.method === 'OPTIONS') return res.writeHead(204).end();
  if (new URL(req.url, 'http://x').pathname !== '/mcp') return res.writeHead(404).end();
  try {
    const parsed = req.method === 'POST' ? await body(req) : undefined;
    const id = req.headers['mcp-session-id'];
    let transport = id ? sessions.get(id) : null;
    if (!transport) {
      if (id || parsed?.method !== 'initialize') return res.writeHead(400, { 'content-type': 'application/json' }).end(JSON.stringify({ jsonrpc: '2.0', error: { code: -32000, message: 'No session' }, id: null }));
      transport = new StreamableHTTPServerTransport({ sessionIdGenerator: () => randomUUID(), onsessioninitialized: (sid) => sessions.set(sid, transport) });
      transport.onclose = () => transport.sessionId && sessions.delete(transport.sessionId);
      await createServer().connect(transport);
    }
    await transport.handleRequest(req, res, parsed);
  } catch (e) {
    if (!res.headersSent) res.writeHead(500).end(e.message);
  }
});

http.listen(port, '127.0.0.1', () => console.error(`protoboard-iso MCP over HTTP: http://127.0.0.1:${port}/mcp`));
