// Claude Code PreToolUse hook (.claude/settings.json): refuses a tool call that would read or
// write a secret (secret-paths.js). permissions.deny in the same file covers the common names;
// this also reads Bash commands and the paths of Grep and Glob, which deny rules do not see.
//
//   stdin: { tool_name, tool_input }   stdout: a deny decision, or nothing (the call goes on)
//
// A Bash command is split into words, with $HOME and ${HOME} read as ~. A folder of credentials
// (~/.ssh, ~/.aws…) refuses any word that goes through it, a pattern too (~/.ssh/id_*); a secret's
// name refuses only a word that is not a pattern, so .gitignore lines (*.env) and searches still
// run. A Write or Edit is judged by its path only, never by its text: documentation may name .env.

import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { secretName, secretPlace, secretPath } from './secret-paths.js';

const PATTERN = /[*?[\]{}$]/; // a glob, or a variable other than HOME: not one file
// JavaScript's environment objects, common in node -e: code, not a file named *.env.
const CODE = /(?:^|[^\w$])(?:process|import\.meta)\.env$/;
const words = (command) =>
  String(command ?? '')
    .replace(/\$\{HOME\}|\$HOME\b/g, '~')
    .split(/[\s;|&<>()'"`=]+/)
    .filter(Boolean);

// The paths a tool call touches, each with what it holds: the reason, or null.
export function secretsOf(tool, input = {}) {
  if (tool === 'Bash') return words(input.command).map((w) => [w, secretPlace(w) ?? (PATTERN.test(w) || CODE.test(w) ? null : secretName(w))]);
  return [input.file_path, input.notebook_path, input.path].filter(Boolean).map((p) => [p, secretPath(p)]);
}

// The reason to refuse, or null.
export function refusal(tool, input) {
  for (const [p, what] of secretsOf(tool, input)) {
    if (what) return `${p} looks like ${what}; tools stay away from secrets (CLAUDE.md, "Privacy"). If this only names such a file in text, write it with Write or Edit instead of Bash.`;
  }
  return null;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { tool_name: tool, tool_input: input } = JSON.parse(readFileSync(0, 'utf8') || '{}');
  const reason = refusal(tool, input);
  if (reason) process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: reason } }));
}
