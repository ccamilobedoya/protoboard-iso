import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LANGUAGES } from '../src/i18n/index.js';

const placeholders = (s) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

test('every language has the same keys and placeholders as English', () => {
  const en = LANGUAGES.en;
  for (const [code, dict] of Object.entries(LANGUAGES)) {
    if (code === 'en') continue;
    for (const key of Object.keys(en)) {
      if (key === 'meta') continue;
      assert.ok(key in dict, `${code} is missing "${key}"`);
      assert.deepEqual(placeholders(dict[key]), placeholders(en[key]), `${code} "${key}" placeholders`);
    }
  }
});
