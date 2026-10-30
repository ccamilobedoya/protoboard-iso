// The decision log (PLANNING.md §5 and its Spanish copy): every entry says whether it is still in
// force, and one that a later decision replaced, in whole or in part, names that decision by date.
// A reader then knows which entries still hold without reading the whole log.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('../', import.meta.url).pathname;

// The rows of the log: { date, cells, status }.
export function decisions(text) {
  const log = text.split(/^## 5\./m)[1] ?? '';
  return log
    .split('\n')
    .filter((l) => /^\| \d{4}-\d{2}-\d{2} \|/.test(l))
    .map((l) => {
      const cells = l.split(/(?<!\\)\|/).slice(1, -1).map((c) => c.trim());
      return { date: cells[0], cells, status: cells.at(-1) };
    });
}

const FORMS = {
  en: { file: 'PLANNING.md', inForce: 'in force', replaced: /^(partly )?replaced by (?:(\d{4}-\d{2}-\d{2}) \([^)]+\)|the .+)/ },
  es: { file: 'docs/es/planeacion.md', inForce: 'vigente', replaced: /^reemplazada (en parte )?por (?:(\d{4}-\d{2}-\d{2}) \([^)]+\)|el .+)/ },
};

for (const [lang, f] of Object.entries(FORMS)) {
  test(`decisions (${lang}): every entry has its status, and a replacement names an entry that exists`, () => {
    const rows = decisions(readFileSync(join(root, f.file), 'utf8'));
    assert.ok(rows.length > 50);
    const dates = new Set(rows.map((r) => r.date));
    for (const r of rows) {
      assert.equal(r.cells.length, 4, `${r.date} ${r.cells[1]?.slice(0, 40)}: date | decision | why | status`);
      if (r.status === f.inForce) continue;
      const m = f.replaced.exec(r.status);
      assert.ok(m, `${r.date}: "${r.status}" is "${f.inForce}" or a replacement`);
      if (m[2]) assert.ok(dates.has(m[2]), `${r.date}: replaced by ${m[2]}, an entry of the log`);
    }
  });
}

test('decisions: the Spanish log has the same entries with the same status', () => {
  const en = decisions(readFileSync(join(root, FORMS.en.file), 'utf8'));
  const es = decisions(readFileSync(join(root, FORMS.es.file), 'utf8'));
  assert.deepEqual(es.map((r) => r.date), en.map((r) => r.date), 'the same entries, in the same order');
  const kind = (s, inForce) => (s === inForce ? 'in force' : /en parte|partly/.test(s) ? 'partly' : 'replaced');
  assert.deepEqual(es.map((r) => kind(r.status, 'vigente')), en.map((r) => kind(r.status, 'in force')));
});
