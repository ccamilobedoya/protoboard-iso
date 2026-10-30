#!/usr/bin/env node
// One-time setup of a clone: turns on the git hooks of scripts/hooks/ (pre-commit: the quick
// checks; pre-push: the whole verification) with core.hooksPath, and makes sure they can run.
//
//   npm run setup            turn them on
//   npm run setup -- --off   turn them off again (git's own .git/hooks are used)

import { execFileSync } from 'node:child_process';
import { chmodSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();

if (process.argv.includes('--off')) {
  try {
    git('config', '--unset', 'core.hooksPath');
  } catch {
    // already unset
  }
  console.log('Git hooks of scripts/hooks/ turned off.');
} else {
  const hooks = readdirSync(join(root, 'scripts/hooks'));
  for (const h of hooks) chmodSync(join(root, 'scripts/hooks', h), 0o755);
  git('config', 'core.hooksPath', 'scripts/hooks');
  console.log(`Git hooks on: ${hooks.join(', ')} (scripts/hooks/). Skip one run knowingly with --no-verify.`);
}
