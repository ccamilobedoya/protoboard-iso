// Deep comparison for the golden file: numbers within a relative tolerance (so the same
// arithmetic in another order still passes), everything else exactly. Returns the paths that
// differ, as readable lines.

export const RELATIVE = 1e-12;
export const ABSOLUTE = 1e-15;

export function compareGolden(expected, actual, path = '', out = []) {
  if (typeof expected === 'number' && typeof actual === 'number') {
    if (Math.abs(expected - actual) > ABSOLUTE + RELATIVE * Math.max(Math.abs(expected), Math.abs(actual))) out.push(`${path}: ${expected} → ${actual}`);
    return out;
  }
  if (expected === null || actual === null || typeof expected !== 'object' || typeof actual !== 'object') {
    if (expected !== actual) out.push(`${path}: ${JSON.stringify(expected)} → ${JSON.stringify(actual)}`);
    return out;
  }
  if (Array.isArray(expected) !== Array.isArray(actual)) {
    out.push(`${path}: array/object mismatch`);
    return out;
  }
  const keys = new Set([...Object.keys(expected), ...Object.keys(actual)]);
  for (const key of keys) {
    if (!(key in actual)) out.push(`${path}.${key}: missing`);
    else if (!(key in expected)) out.push(`${path}.${key}: new`);
    else compareGolden(expected[key], actual[key], `${path}.${key}`, out);
  }
  return out;
}
