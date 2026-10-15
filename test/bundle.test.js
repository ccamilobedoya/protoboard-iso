// The bundler (src/node/bundle.js) and the engine as the page will run it: one classic script,
// in a context with no Node and no DOM, giving the same results as simulate().

import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { bundleScript } from '../src/node/bundle.js';
import { compile, simulate } from '../src/sim/index.js';
import { goldenCases } from './golden/cases.js';
import { compareGolden } from './golden/compare.js';

test('bundle: the engine runs alone and matches simulate() for every golden DC case', () => {
  const script = bundleScript('sim/engine.js', { expose: 'engine', comments: false });
  assert.ok(script.length < bundleScript('sim/engine.js').length * 0.8, 'smaller without comments');
  const context = vm.createContext({});
  vm.runInContext(script, context);
  assert.equal(typeof context.engine.createEngine, 'function');
  let checked = 0;
  for (const c of goldenCases().filter((c) => c.options?.analysis !== 'transient')) {
    const compiled = compile(c.circuit);
    if (compiled.fatal) continue;
    // The program travels as JSON, as it will inside the page.
    const program = JSON.parse(JSON.stringify(compiled.program));
    const result = JSON.parse(JSON.stringify(context.engine.createEngine(program).dc()));
    const expected = JSON.parse(JSON.stringify(simulate(c.circuit)));
    assert.deepEqual(compareGolden(expected, result).slice(0, 5), [], c.name);
    checked++;
  }
  assert.ok(checked >= 10, `${checked} cases`);
});

test('bundle: a transient in the bundled engine matches too', () => {
  const context = vm.createContext({});
  vm.runInContext(bundleScript('sim/engine.js', { expose: 'engine' }), context);
  const c = goldenCases().find((c) => c.name === 'battery-regulator, transient');
  const program = JSON.parse(JSON.stringify(compile(c.circuit).program));
  const result = JSON.parse(JSON.stringify(context.engine.createEngine(program).transient(c.options)));
  assert.deepEqual(compareGolden(JSON.parse(JSON.stringify(simulate(c.circuit, c.options))), result).slice(0, 5), []);
});

test('bundle: refuses what is outside the allowed modules', () => {
  assert.throws(() => bundleScript('sim/index.js'), /may not be bundled/);
  assert.throws(() => bundleScript('index.js'), /may not be bundled/);
});
