// A small bundler (Node only): ES modules → one classic script, so the embeddable page can carry
// the simulator engine and its own script inline, without a build step or a module loader
// (module scripts from data: URLs and import maps are blocked in many iframes and web views).
//
//   bundleScript(entry, { expose, comments }) → JavaScript text
//     expose     a global name for the entry module's exports (tests, debugging)
//     comments   false drops the lines that are only a // comment (smaller pages); modules that
//                go into a bundle must never start a line inside a template literal with //
//
// Each module becomes a function scope run once, in dependency order; its relative named imports
// become reads of the modules it depends on. Only a restricted grammar is accepted, and anything
// else throws, so a module that grows something the bundler does not understand fails loudly:
//   import { a, b as c } from './x.js';        (may span lines)
//   export function | const | let | class name
// No default exports, no `export *` or `export { … }`, no dynamic import(), no import.meta, no
// cycles. Only modules under ALLOWED may be bundled: that is what keeps the engine free of the
// drawing code, the part tables and the texts.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, relative, resolve } from 'node:path';

const SRC = dirname(dirname(fileURLToPath(import.meta.url)));
export const ALLOWED = ['sim/engine.js', 'sim/controls.js', 'sim/mna.js', 'sim/models.js', 'sim/look.js', 'sim/lines.js', 'sim/falstad.js', 'sim/falstad-layout.js', 'sim/devices/', 'parts/batteries.js', 'parts/sensors.js', 'core/units.js', 'page/client/'];

const IMPORT = /^import\s*\{([^}]*)\}\s*from\s*'([^']+)';?[ \t]*$/gm;
const EXPORT = /^export\s+(?:async\s+)?(?:function\*?|const|let|class)\s+([A-Za-z_$][\w$]*)/gm;

const allowed = (file) => {
  const rel = relative(SRC, file).split('\\').join('/');
  return ALLOWED.some((a) => (a.endsWith('/') ? rel.startsWith(a) : rel === a));
};

function parse(file) {
  const text = readFileSync(file, 'utf8');
  const name = relative(SRC, file);
  const imports = [];
  let body = text.replace(IMPORT, (line, names, from) => {
    if (!from.startsWith('.')) throw new Error(`${name}: only relative imports can be bundled (${from})`);
    const bindings = names
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => {
        const m = s.match(/^([A-Za-z_$][\w$]*)(?:\s+as\s+([A-Za-z_$][\w$]*))?$/);
        if (!m) throw new Error(`${name}: cannot bundle the import "${s}"`);
        return m[2] ? `${m[1]}: ${m[2]}` : m[1];
      });
    imports.push({ file: resolve(dirname(file), from), bindings });
    return `\u0000${imports.length - 1}`;
  });
  const exports = [];
  body = body.replace(EXPORT, (line, id) => {
    exports.push(id);
    return line.replace(/^export\s+/, '');
  });
  for (const [pattern, what] of [[/^\s*import\b/m, 'import'], [/^\s*export\b/m, 'export'], [/\bimport\s*\(/, 'dynamic import()'], [/\bimport\.meta\b/, 'import.meta']]) {
    if (pattern.test(body)) throw new Error(`${name}: cannot bundle this ${what} (see src/node/bundle.js)`);
  }
  return { file, name, body, imports, exports };
}

export function bundleScript(entry, { expose, comments = true } = {}) {
  const order = [];
  const ids = new Map();
  const visiting = new Set();
  const visit = (file) => {
    if (ids.has(file)) return;
    if (visiting.has(file)) throw new Error(`import cycle through ${relative(SRC, file)}`);
    if (!allowed(file)) throw new Error(`${relative(SRC, file)} may not be bundled (see ALLOWED in src/node/bundle.js)`);
    visiting.add(file);
    const mod = parse(file);
    for (const i of mod.imports) visit(i.file);
    visiting.delete(file);
    ids.set(file, `__m${order.length}`);
    order.push(mod);
  };
  const start = resolve(SRC, entry);
  visit(start);
  const chunks = order.map((mod) => {
    const body = mod.body.replace(/\u0000(\d+)/g, (m, k) => {
      const i = mod.imports[Number(k)];
      return `const { ${i.bindings.join(', ')} } = ${ids.get(i.file)};`;
    });
    const text = comments ? body.trimEnd() : body.split('\n').filter((l) => !/^\s*\/\//.test(l) && l.trim()).join('\n');
    return `// ${mod.name}\nconst ${ids.get(mod.file)} = (() => {\n${text}\nreturn { ${mod.exports.join(', ')} };\n})();`;
  });
  const tail = expose ? `\nglobalThis[${JSON.stringify(expose)}] = ${ids.get(start)};` : '';
  const script = `(() => {\n'use strict';\n${chunks.join('\n')}${tail}\n})();\n`;
  // Inside an HTML <script> these would end it early or change how it is read.
  if (/<\/script|<!--/i.test(script)) throw new Error('the bundle contains "</script" or "<!--"');
  return script;
}
