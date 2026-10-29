// The licences of every dependency, read offline from the lockfiles (the root and mcp/): each
// must be in ALLOWED, or listed in license-exceptions.json with its licence and the kind of
// dependency it may be. The kit itself runs with no dependencies at all (CLAUDE.md, "Rules").
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('../', import.meta.url).pathname;
// Permissive licences: they ask for the notice and nothing else.
const ALLOWED = new Set(['MIT', 'MIT-0', 'ISC', 'BSD-2-Clause', 'BSD-3-Clause', 'Apache-2.0', '0BSD', 'BlueOak-1.0.0', 'CC0-1.0', 'Unlicense']);
const LOCKFILES = ['package-lock.json', 'mcp/package-lock.json'];
const { exceptions } = JSON.parse(readFileSync(join(root, 'license-exceptions.json'), 'utf8'));

// Whether an SPDX expression is allowed: "A OR B" needs one of them, "A AND B" both. Read as SPDX
// does: parentheses first, then AND, then OR, so "GPL-3.0 AND (MIT OR ISC)" needs GPL-3.0. A
// licence WITH an exception, or an expression that does not read, is not allowed.
export function allowed(expr) {
  const tokens = String(expr ?? '').match(/\(|\)|[^\s()]+/g) ?? [];
  let pos = 0;
  const fail = () => {
    throw new Error('unreadable');
  };
  const or = () => {
    let ok = and();
    while (tokens[pos] === 'OR') {
      pos++;
      ok = and() || ok; // read every term, even once one is allowed
    }
    return ok;
  };
  const and = () => {
    let ok = one();
    while (tokens[pos] === 'AND') {
      pos++;
      ok = one() && ok;
    }
    return ok;
  };
  const one = () => {
    const t = tokens[pos++];
    if (t === '(') {
      const ok = or();
      if (tokens[pos++] !== ')') fail();
      return ok;
    }
    if (!t || t === ')' || t === 'AND' || t === 'OR') fail();
    if (tokens[pos] === 'WITH') {
      pos += 2;
      return false;
    }
    return ALLOWED.has(t);
  };
  try {
    const ok = or();
    return pos === tokens.length && ok;
  } catch {
    return false;
  }
}
const kindsOf = (entry) => [entry.dev && 'dev', entry.optional && 'optional', entry.devOptional && 'dev'].filter(Boolean);
const covers = (pattern, name) => (pattern.endsWith('*') ? name.startsWith(pattern.slice(0, -1)) : name === pattern);

function packages() {
  return LOCKFILES.flatMap((file) =>
    Object.entries(JSON.parse(readFileSync(join(root, file), 'utf8')).packages)
      .filter(([key]) => key)
      .map(([key, entry]) => ({ file, name: key.split('node_modules/').pop(), license: entry.license, kinds: kindsOf(entry) })),
  );
}

test('licences: every dependency is permissive or a reviewed exception', () => {
  const found = [];
  const used = new Set();
  for (const p of packages()) {
    if (allowed(p.license)) continue;
    const ex = exceptions.find((e) => covers(e.package, p.name));
    if (!ex) found.push(`${p.file}: ${p.name}: ${p.license ?? 'no licence'} is not allowed; review it and add it to license-exceptions.json, or drop it`);
    else if (ex.license !== p.license) found.push(`${p.file}: ${p.name}: now ${p.license}, reviewed as ${ex.license}`);
    else if (!p.kinds.some((k) => ex.only.includes(k))) found.push(`${p.file}: ${p.name}: allowed only as ${ex.only.join(' or ')}, now a dependency the kit runs with`);
    used.add(ex?.package);
  }
  for (const e of exceptions) if (!used.has(e.package)) found.push(`license-exceptions.json: ${e.package} matches nothing any more; remove it`);
  assert.deepEqual(found, []);
});

test('licences: SPDX expressions', () => {
  assert.ok(allowed('MIT'));
  assert.ok(allowed('(MIT OR GPL-3.0)'));
  assert.ok(!allowed('MIT AND GPL-3.0'));
  assert.ok(!allowed('GPL-3.0 AND (MIT OR ISC)'), 'parentheses first, then AND');
  assert.ok(allowed('(MIT OR ISC) AND Apache-2.0'));
  assert.ok(allowed('GPL-3.0 OR MIT AND ISC'), 'AND binds tighter than OR');
  assert.ok(!allowed('MIT AND GPL-3.0 OR GPL-2.0'));
  assert.ok(!allowed('GPL-2.0 WITH Classpath-exception-2.0'));
  assert.ok(!allowed('(MIT OR'), 'an expression that does not read');
  assert.ok(!allowed('GPL-3.0'));
  assert.ok(!allowed(undefined), 'no licence is not allowed');
});

test('the kit runs with no dependencies', () => {
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  assert.deepEqual(Object.keys(pkg.dependencies ?? {}), []);
  assert.equal(pkg.license, 'MIT');
});
