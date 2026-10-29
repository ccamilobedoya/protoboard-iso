// Which paths hold secrets: one list for the Claude Code hook that keeps tools away from them
// (guard-secrets.js) and for the privacy test that keeps them out of git (test/privacy/scan.js).
// Names match whatever their case; folders match anywhere in the path.

export const SECRET_NAMES = [
  ['local settings', /^(?:local\.env|\.env(?:\.(?!example$|sample$)[^/]+)?|[^/]+\.env)$/i],
  ['an SSH key', /^id_(?:rsa|dsa|ecdsa|ed25519)(?:_[^/.]+)?$/i],
  ['a key or certificate', /\.(?:pem|key|p12|pfx|jks|keystore|srl)$/i],
  ['credentials', /^(?:\.netrc|\.pgpass|credentials\.json)$/i],
];

// Folders and files of a home that hold credentials (SSH, cloud, GPG, the GitHub CLI, Docker).
export const SECRET_PLACES = [
  ['an SSH folder', /(?:^|\/)\.ssh(?:\/|$)/],
  ['cloud credentials', /(?:^|\/)\.(?:aws|azure|gcloud)(?:\/|$)|(?:^|\/)\.config\/gcloud(?:\/|$)/],
  ['a GPG folder', /(?:^|\/)\.gnupg(?:\/|$)/],
  ['GitHub CLI credentials', /(?:^|\/)\.config\/gh\/hosts\.yml$/],
  ['Docker credentials', /(?:^|\/)\.docker\/config\.json$/],
];

const slashes = (path) => String(path ?? '').replace(/\\/g, '/');

// Whether the last part of a path is a secret's name: the reason, or null.
export function secretName(path) {
  const name = slashes(path).split('/').pop();
  for (const [what, re] of SECRET_NAMES) if (re.test(name)) return what;
  return null;
}

// Whether a path goes through a folder of credentials: the reason, or null. It also holds for a
// pattern (~/.ssh/id_*): a folder is a folder, whatever the file.
export function secretPlace(path) {
  const p = slashes(path);
  for (const [what, re] of SECRET_PLACES) if (re.test(p)) return what;
  return null;
}

// What a path is, if it holds a secret: the reason, or null.
export const secretPath = (path) => secretName(path) ?? secretPlace(path);
