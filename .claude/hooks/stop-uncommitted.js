// Claude Code Stop hook (.claude/settings.json): a one-line reminder when the turn ends with work
// that is not committed, or commits that are not pushed, so nothing is lost when a session or a
// container goes away. It never blocks; outside a git checkout it says nothing.

import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const git = (...args) => execFileSync('git', args, { cwd: process.env.CLAUDE_PROJECT_DIR || process.cwd(), encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });

export function reminder() {
  let changed;
  try {
    changed = git('status', '--porcelain', '-z').split('\0').filter(Boolean).length;
  } catch {
    return null;
  }
  let ahead = 0;
  try {
    ahead = Number(git('rev-list', '--count', '@{upstream}..HEAD').trim()) || 0;
  } catch {
    // no upstream: nothing to compare with
  }
  const parts = [changed && `${changed} file${changed === 1 ? '' : 's'} not committed`, ahead && `${ahead} commit${ahead === 1 ? '' : 's'} not pushed`].filter(Boolean);
  return parts.length ? `protoboard-iso: ${parts.join(', ')}.` : null;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const text = reminder();
  if (text) process.stdout.write(JSON.stringify({ systemMessage: text }));
}
