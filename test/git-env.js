// The environment for git in the tests' throwaway repositories. A git hook (pre-commit runs the
// quick checks) exports variables that pin git to the repository being committed (GIT_DIR,
// GIT_INDEX_FILE, GIT_WORK_TREE…; in a linked worktree too). A test that ran `git init` in a
// temporary folder with them inherited would write into the real repository instead: it once set
// core.bare there and committed its fixtures. These are the variables `git rev-parse
// --local-env-vars` lists, taken out so git finds the repository from the command's folder.

const LOCAL = ['GIT_ALTERNATE_OBJECT_DIRECTORIES', 'GIT_CONFIG', 'GIT_CONFIG_PARAMETERS', 'GIT_CONFIG_COUNT', 'GIT_OBJECT_DIRECTORY', 'GIT_DIR', 'GIT_WORK_TREE', 'GIT_IMPLICIT_WORK_TREE', 'GIT_GRAFT_FILE', 'GIT_INDEX_FILE', 'GIT_NO_REPLACE_OBJECTS', 'GIT_REPLACE_REF_BASE', 'GIT_PREFIX', 'GIT_SHALLOW_FILE', 'GIT_COMMON_DIR'];

export function gitEnv(extra = {}) {
  const env = { ...process.env, ...extra };
  for (const name of LOCAL) delete env[name];
  return env;
}
