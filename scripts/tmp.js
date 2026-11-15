// Temporary folders that remove themselves. Tests and scripts that need scratch space call
// tempDir(prefix) instead of mkdtempSync(join(tmpdir(), prefix)): the folder this process made is
// removed when the process exits, whatever the exit (a failed test, an uncaught error, Ctrl-C),
// so a day of runs cannot fill a RAM-backed temporary folder. Only paths made here are removed,
// each one returned by mkdtemp in this process; nothing is built from an argument or a glob.

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const made = new Set();

function removeAll() {
  for (const dir of made) rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  made.clear();
}

export function tempDir(prefix) {
  if (made.size === 0) {
    process.on('exit', removeAll);
    // A signal ends the process without the exit event unless something exits on its behalf.
    for (const [signal, code] of [['SIGINT', 130], ['SIGTERM', 143]]) process.once(signal, () => process.exit(code));
  }
  const dir = mkdtempSync(join(tmpdir(), prefix));
  made.add(dir);
  return dir;
}
