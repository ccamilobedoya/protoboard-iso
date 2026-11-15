import { test } from 'node:test';
import assert from 'node:assert/strict';
import { autoLayout, checkNets, formatLayout } from '../src/layout.js';
import { formatIssue, t, checkCircuit } from '../src/index.js';

// A 5 V regulator with its capacitors and a pilot LED, from a 9 V battery's strip.
const spec = {
  board: 'auto',
  parts: [
    { id: 'U1', type: 'regulator', part: '7805' },
    { id: 'C1', type: 'capacitor', kind: 'ceramic', value: '100n' },
    { id: 'R1', type: 'resistor', value: '1k' },
    { id: 'D1', type: 'led', color: 'red' },
  ],
  nets: [
    ['U1.IN', 'T+'],
    { pins: ['U1.OUT', 'C1.1', 'R1.1'], color: 'orange' },
    ['R1.2', 'D1.anode'],
    ['U1.GND', 'C1.2', 'D1.cathode', 'T-'],
  ],
  supplies: [{ id: 'V1', kind: 'bench', voltage: 9, positive: 'T+', negative: 'T-' }],
};

test('layout: every part placed, every net connected, nothing shorted, in one call', () => {
  const r = autoLayout(spec);
  assert.equal(r.placed.length, 4);
  assert.deepEqual(r.problems, []);
  assert.ok(r.check.ok, JSON.stringify(r.check));
  assert.equal(r.review.verdict, 'approved', r.review.blocking.map((b) => formatIssue(b, 'en')).join('\n'));
  // Left to right in the order given.
  const col = (id) => Math.min(...Object.values(r.placed.find((p) => p.id === id).pins).map((h) => Number(h.replace(/\D/g, ''))));
  assert.ok(col('U1') < col('R1') && col('R1') <= col('D1'));
  assert.doesNotMatch(formatLayout(r, 'es', { t, formatIssue }), /\{\w+\}/);
});

test('checkNets: nets that share a rail are one net; a missing pin and a short are reported', () => {
  const r = autoLayout(spec);
  const asked = (pins) => pins.map((p, index) => ({ index, pins: p }));
  assert.ok(checkNets(r.circuit, asked([['U1.GND', 'T-'], ['D1.cathode', 'T-']])).ok, 'both on T-: one net');
  const apart = checkNets(r.circuit, asked([['T+', 'T-']]));
  assert.equal(apart.missing.length, 1, 'the two rails are not joined in this circuit');
  const short = checkNets(r.circuit, asked([['U1.OUT'], ['C1.1']]));
  assert.equal(short.shorted.length, 1, 'two nets asked apart are one in the circuit');
  const wrong = checkNets(r.circuit, asked([['U1.OUT', 'R1.2']]));
  assert.equal(wrong.missing.length, 1);
});

test('parts by name: part numbers, modules and aliases resolve without a type; unknown ones suggest', async () => {
  const { resolvePart, pinsOf } = await import('../src/parts/resolve.js');
  assert.deepEqual(resolvePart({ id: 'U1', part: 'L7805CV' }).part, { id: 'U1', type: 'regulator', part: '7805' });
  assert.deepEqual(resolvePart({ id: 'S1', part: 'KCD1', on: true }).part, { id: 'S1', type: 'switch', style: 'rocker', on: true });
  assert.equal(resolvePart({ id: 'R1', type: 'resistencia', value: '1k' }).part.type, 'resistor');
  assert.equal(resolvePart({ id: 'D1', part: 'LED', color: 'red' }).part.type, 'led');
  assert.equal(resolvePart({ id: 'A1', part: 'Arduino UNO' }).error?.code ?? resolvePart({ id: 'A1', part: 'UNO' }).part.type, 'module');
  // A bare number people say for a part resolves to its full part number, in a layout and in the catalog.
  assert.deepEqual(resolvePart({ id: 'U2', part: '555' }).part, { id: 'U2', type: 'ic', part: 'NE555' });
  const unknown = resolvePart({ id: 'D2', part: '1N4148W' });
  assert.equal(unknown.error.code, 'UNKNOWN_PART_NAME');
  assert.match(unknown.error.params.suggestions, /1N4148/);
  assert.deepEqual(pinsOf({ type: 'switch' }), ['1', '2']);
});

test('validateSpec finds everything wrong in one pass, and layout places nothing then', () => {
  const bad = {
    parts: [{ id: 'U1', part: '7805' }, { id: 'U1', part: '7805' }, { id: 'X', part: 'warp-core' }, { id: 'D1', part: 'LED' }],
    nets: [['U1.SENSE', 'T+'], ['Q7.B', 'T-'], ['nonsense'], ['D1.anode', 'T+']],
  };
  const r = autoLayout(bad);
  assert.ok(r.invalid && r.checked);
  const codes = r.problems.map((p) => p.code).sort();
  for (const code of ['DUPLICATE_ID', 'UNKNOWN_PART_NAME', 'NET_UNKNOWN_PIN', 'NET_UNKNOWN_PART', 'NET_BAD_REF']) assert.ok(codes.includes(code), code);
  assert.match(formatLayout(r, 'es', { t, formatIssue }), /Sus patas: IN, GND, OUT/);
  // check only: a good spec comes back resolved, nothing placed.
  const ok = autoLayout({ parts: [{ id: 'U1', part: '7805' }], nets: [['U1.IN', 'T+'], ['U1.GND', 'T-'], ['U1.OUT']] }, { checkOnly: true });
  assert.equal(ok.invalid, false);
  assert.equal(ok.parts[0].type, 'regulator');
  assert.equal(ok.circuit, undefined);
});

test('a field the part type does not take is a warning in a circuit and an error in a layout spec', () => {
  const circuit = { version: 1, board: 'auto', parts: [{ id: 'S1', type: 'switch', state: 'on', pins: { 1: 'e5', 2: 'e7' } }] };
  const warning = checkCircuit(circuit).issues.find((i) => i.code === 'UNKNOWN_FIELD');
  assert.equal(warning?.severity, 'warning');
  assert.match(formatIssue(warning, 'es'), /«state».*on/);
  const r = autoLayout({ parts: [{ id: 'S1', part: 'KCD1', state: 'on' }], nets: [['S1.1', 'T+'], ['S1.2']] });
  assert.ok(r.invalid);
  assert.equal(r.problems[0].code, 'UNKNOWN_FIELD');
});

test('pin names as people write them: aliases resolve to the part\'s own names, and the answer ends in one status', () => {
  const aliased = {
    ...spec,
    nets: [['U1.VIN', 'T+'], { pins: ['U1.VOUT', 'C1.1', 'R1.1'], color: 'orange' }, ['R1.2', 'D1.A'], ['U1.GND', 'C1.2', 'D1.K', 'T-']],
  };
  const r = autoLayout(aliased);
  assert.equal(r.status, 'done', formatLayout(r, 'en', { t, formatIssue }));
  assert.ok(r.check.ok);
  assert.match(formatLayout(r, 'en', { t, formatIssue }).split('\n').at(-1), /^STATUS: DONE · /);
  assert.equal(autoLayout({ ...spec, nets: [['D1.X', 'T+']] }, { checkOnly: true }).status, 'fix_spec');
  assert.equal(autoLayout(spec, { checkOnly: true }).status, 'spec_ok');
});

test('the spec is kept in the circuit, a relayout keeps what still fits, and review checks the nets', async () => {
  const { specFromCircuit } = await import('../src/layout.js');
  const { review } = await import('../src/review.js');
  const { applyOps } = await import('../src/ops.js');
  const first = autoLayout(spec);
  const c = first.circuit;
  assert.equal(first.status, 'done');
  assert.equal(c.spec.nets.length, spec.nets.length);
  assert.ok(c.spec.wires.length && c.spec.wires.every((id) => c.parts.find((p) => p.id === id).type === 'wire'));
  // From the circuit back to a spec: its parts without holes and without the jumpers.
  const back = specFromCircuit(c);
  assert.deepEqual(back.parts.map((p) => p.id), ['U1', 'C1', 'R1', 'D1']);
  assert.ok(back.parts.every((p) => !p.pins));
  // Laid out again with one value changed: every part keeps its holes.
  const again = autoLayout(specFromCircuit(c, { parts: back.parts.map((p) => (p.id === 'R1' ? { ...p, value: '2k2' } : p)) }), { previous: c });
  assert.equal(again.status, 'done');
  for (const p of c.parts.filter((q) => q.type !== 'wire')) assert.deepEqual(again.circuit.parts.find((q) => q.id === p.id).pins, p.pins, p.id);
  // A jumper removed by hand: review blocks with the spec's net.
  const cut = applyOps(c, [{ op: 'remove', part: c.spec.wires[0] }]).circuit;
  assert.ok(review(cut).blocking.some((b) => b.code === 'SPEC_NET_MISSING'));
  // A rename follows into the spec.
  const renamed = applyOps(c, [{ op: 'rename', part: 'R1', to: 'R9' }]).circuit;
  assert.ok(renamed.spec.nets.flat().some((x) => (x.pins ?? [x]).some((r) => String(r).startsWith('R9.'))));
  assert.equal(review(renamed).blocking.filter((b) => b.code.startsWith('SPEC_')).length, 0);
});

test('a ground net without a rail goes to the − rail, with a note', () => {
  const r = autoLayout({
    parts: [{ id: 'R1', type: 'resistor', value: '1k' }, { id: 'D1', type: 'led', color: 'red' }, { id: 'U1', part: 'UNO' }],
    nets: [['U1.D13', 'R1.1'], ['R1.2', 'D1.A'], ['D1.K', 'U1.GND']],
  });
  assert.ok(r.notes.some((n) => n.code === 'LAYOUT_GROUND_TO_RAIL'), JSON.stringify(r.notes));
  assert.ok(r.check.ok);
  assert.deepEqual(r.circuit.spec.nets[2], ['D1.cathode', 'U1.GND'], 'the spec keeps what was asked, not the convention');
});

test("the skill's spec examples lay out to STATUS: DONE (the first thing an assistant copies)", async () => {
  const { readFileSync } = await import('node:fs');
  const read = (f) => readFileSync(new URL(`../plugin-src/${f}`, import.meta.url), 'utf8');
  const short = /\*\*Anything else:\*\*[\s\S]*?```json\n([\s\S]*?)```/.exec(read('SKILL.md'))?.[1];
  const long = /^# `layout` from parts and nets\n[\s\S]*?```json\n([\s\S]*?)```/m.exec(read('references/spec.md'))?.[1];
  assert.ok(short, 'SKILL.md has a json spec after "Anything else"');
  assert.ok(long, 'references/spec.md starts with a json example');
  for (const block of [short, long]) {
    const { target, ...example } = JSON.parse(block);
    const r = autoLayout(example);
    assert.equal(r.status, 'done', formatLayout(r, 'en', { t, formatIssue }));
  }
});

// The algorithm since 2026-10-31: sides across the channel, scored candidates, jumpers as a
// spanning tree (docs/en/layout.md).
const exampleSpec = async (name) => {
  const { readFileSync } = await import('node:fs');
  const { bench, ...spec } = JSON.parse(readFileSync(new URL(`../examples/layout/${name}`, import.meta.url), 'utf8'));
  return spec;
};

test('layout is deterministic: the same spec gives the same circuit, byte for byte', async () => {
  const { expandRecipe } = await import('../src/recipes/index.js');
  for (const name of ['555-astable', 'opamp-comparator', 'uno-button']) {
    const spec = expandRecipe(name).spec;
    const [a, b] = [autoLayout(spec), autoLayout(spec)];
    assert.equal(JSON.stringify(a.circuit), JSON.stringify(b.circuit), name);
    assert.equal(a.tries, b.tries, name);
  }
});

test('sides: a chip across the channel puts its pins on both halves, its neighbours follow their pin, a rail pulls to its half', async () => {
  const { assignSides } = await import('../src/layout-sides.js');
  // U1 like a DIP: pins a, b on its own half (rel 0), c on the other one (rel 1).
  const elements = [
    { id: 'U1', weight: 5, straddles: true, pins: [{ key: 'u1.a', rel: 0 }, { key: 'u1.c', rel: 1 }] },
    { id: 'R1', weight: 6, pins: [{ key: 'r1.1', rel: 0 }, { key: 'r1.2', rel: 0 }] },
    { id: 'R2', weight: 6, pins: [{ key: 'r2.1', rel: 0 }, { key: 'r2.2', rel: 0 }] },
    { id: 'D1', weight: 2, pins: [{ key: 'd1.k', rel: 0 }] },
  ];
  const nets = [
    { pins: ['u1.a', 'r1.1'], anchor: null },
    { pins: ['u1.c', 'r2.1'], anchor: null },
    { pins: ['d1.k'], anchor: 'B' }, // a net with a B rail only
  ];
  const side = assignSides({ elements, nets });
  const other = { T: 'B', B: 'T' };
  assert.equal(side.get('R1'), side.get('U1'), 'R1 on the half of the pin it joins');
  assert.equal(side.get('R2'), other[side.get('U1')], 'R2 on the half of the chip pin across the channel');
  assert.equal(side.get('D1'), 'B', 'D1 on the half of its rail');
  assert.deepEqual(assignSides({ elements, nets }), side, 'deterministic');
});

test('sides in a layout: parts on a B rail land in rows a–e, the chip neighbours on their pin\'s half', async () => {
  const r = autoLayout({
    parts: [{ id: 'R1', type: 'resistor', value: '330' }, { id: 'D1', type: 'led', color: 'red' }],
    nets: [['B+', 'R1.1'], ['R1.2', 'D1.anode'], ['D1.cathode', 'B-']],
  });
  assert.equal(r.status, 'done', formatLayout(r, 'en', { t, formatIssue }));
  for (const p of r.placed) for (const h of Object.values(p.pins)) assert.match(h, /^([a-e]\d+|B[+-]\d+)$/, `${p.id} in ${h}`);
  // An op-amp follower: the LED resistor on OUT1 sits on the half of OUT1 (pin 1).
  const { expandRecipe } = await import('../src/recipes/index.js');
  const f = autoLayout(expandRecipe('opamp-follower').spec);
  assert.equal(f.status, 'done');
  const pins = (id) => f.placed.find((p) => p.id === id).pins;
  const half = (hole) => (/^[a-e]/.test(hole) ? 'B' : 'T');
  assert.equal(half(pins('R1')['1']), half(pins('U1').OUT1));
});

test('an Arduino UNO beside the board with seven pins in nets: every lead gets a strip, laid out to DONE', async () => {
  const r = autoLayout(await exampleSpec('uno-many-pins.json'));
  assert.equal(r.status, 'done', formatLayout(r, 'en', { t, formatIssue }));
  assert.equal(Object.keys(r.placed.find((p) => p.id === 'U1').pins).length, 6);
});

test('an ESP32 DevKit whose board covers a header in nets, on one board named in the spec, fails fast and says which pins have no hole', async () => {
  // On `auto` it goes to two boards side by side (test/double-board.test.js); a board asked for stays.
  const r = autoLayout({ ...(await exampleSpec('esp32-both-headers.json')), board: 'bb830' });
  assert.equal(r.status, 'changes');
  const covered = r.problems.filter((p) => p.code === 'LAYOUT_PIN_COVERED');
  assert.ok(covered.length && covered.every((p) => p.params.part === 'U1' && p.params.pin && p.params.hole), JSON.stringify(covered));
  assert.equal(r.tries, 1, 'no relayout: another place cannot uncover the strip');
  const text = formatLayout(r, 'es', { t, formatIssue });
  assert.match(text, /no se llega a U1\./i);
  assert.doesNotMatch(text, /check\.LAYOUT/);
});

test('layout again on a recipe circuit with one more LED moves nothing that was there', async () => {
  const { expandRecipe } = await import('../src/recipes/index.js');
  const { specFromCircuit } = await import('../src/layout.js');
  const first = autoLayout(expandRecipe('555-astable').spec);
  assert.equal(first.status, 'done');
  const back = specFromCircuit(first.circuit);
  const again = autoLayout(
    specFromCircuit(first.circuit, {
      parts: [...back.parts, { id: 'R4', type: 'resistor', value: '330' }, { id: 'D2', type: 'led', color: 'green' }],
      nets: [...first.circuit.spec.nets, ['U1.OUT', 'R4.1'], ['R4.2', 'D2.anode'], ['D2.cathode', 'T-']],
    }),
    { previous: first.circuit },
  );
  assert.equal(again.status, 'done', formatLayout(again, 'en', { t, formatIssue }));
  for (const p of first.circuit.parts.filter((q) => q.type !== 'wire')) assert.deepEqual(again.circuit.parts.find((q) => q.id === p.id).pins, p.pins, p.id);
});

// layout's answer carries what the reply needs (src/layout-answer.js): the readings at rest, each
// board's program and what a recipe lets change, only when the circuit was built.
test('layout answer: a recipe circuit gives its readings and what it lets change, in both languages, also laid out again', async () => {
  const { expandRecipe } = await import('../src/recipes/index.js');
  const { specFromCircuit } = await import('../src/layout.js');
  const r = autoLayout(expandRecipe('led-resistor', { V1: 9, D1: 'green' }).spec);
  assert.equal(r.status, 'done');
  assert.deepEqual(r.readings.sources.map((s) => [s.id, s.kind, Math.round(s.voltage)]), [['V1', 'supply', 9]]);
  assert.deepEqual(r.readings.parts.map((p) => [p.id, p.kind]), [['D1', 'led']]);
  assert.ok(r.readings.parts[0].current > 0.015 && r.readings.parts[0].brightness > 0.9, JSON.stringify(r.readings));
  assert.equal(r.programs, undefined);
  assert.deepEqual(r.changeable, [
    { id: 'R1', field: 'value', value: '330', role: 'current-limiting resistor' },
    { id: 'D1', field: 'color', value: 'green' },
    { id: 'V1', field: 'voltage', value: 9, min: 1.5, max: 15 },
  ]);
  const en = formatLayout(r, 'en', { t, formatIssue }).split('\n');
  assert.match(en.at(-1), /^STATUS: DONE · /);
  assert.match(en.at(-3), /^Readings \(at rest, a model\): supply 9 V · D1 20\.\d mA, brightness 10\d % of 20 mA$/);
  assert.equal(en.at(-2), 'Can change (layout with the recipe and values): R1 = 330 (current-limiting resistor) · D1 = green · V1 = 9 V [1.5…15]');
  const es = formatLayout(autoLayout(expandRecipe('led-resistor', { V1: 9, D1: 'green' }).spec, { lang: 'es' }), 'es', { t, formatIssue }).split('\n');
  assert.match(es.at(-3), /^Lecturas \(en reposo, un modelo\): fuente 9 V · D1 20,\d mA, brillo 10\d % del de 20 mA$/);
  assert.equal(es.at(-2), 'Se puede cambiar (layout con la receta y values): R1 = 330 (resistencia limitadora) · D1 = green · V1 = 9 V [1,5…15]');
  // Laid out again on the circuit it made: the same three things, the values it has now.
  const again = autoLayout(specFromCircuit(r.circuit), { previous: r.circuit });
  assert.equal(again.status, 'done');
  assert.deepEqual(again.changeable, r.changeable);
  assert.deepEqual(again.readings.parts.map((p) => p.id), ['D1']);
});

test('layout answer: a board prints its program and no readings; a generator gives no readings', async () => {
  const { expandRecipe } = await import('../src/recipes/index.js');
  const blink = autoLayout(expandRecipe('uno-blink').spec);
  assert.equal(blink.status, 'done');
  assert.equal(blink.readings, undefined, 'the program decides what is lit');
  assert.equal(blink.programs.length, 1);
  assert.equal(blink.programs[0].truncated, false);
  const text = formatLayout(blink, 'en', { t, formatIssue });
  assert.doesNotMatch(text, /Readings/);
  assert.match(text, /\nProgram U1 \(Arduino sketch\):\n {2}\/\/ Blink: D13 on for half a second, off for half a second\.\n {2}const int LED = 13;\n\n {2}void setup\(\) \{\n {4}pinMode\(LED, OUTPUT\);/);
  assert.match(text, /U1 = \(sketch\)\n/);
  assert.doesNotMatch(text.split('\n').filter((l) => l.startsWith('Can change')).join(''), /digitalWrite/, 'never the text in the can-change line');
  assert.match(formatLayout(autoLayout(expandRecipe('uno-blink').spec, { lang: 'es' }), 'es', { t, formatIssue }), /\nPrograma U1 \(sketch de Arduino\):\n/);
  const square = autoLayout(expandRecipe('rc-square').spec);
  assert.equal(square.status, 'done');
  assert.equal(square.readings, undefined, 'the signal is the point, not its rest value');
  assert.doesNotMatch(formatLayout(square, 'en', { t, formatIssue }), /Readings/);
  assert.match(formatLayout(square, 'en', { t, formatIssue }), /G1 = 100 Hz \[0\.1…100000\]/);
});

test('layout answer: a spec of its own with a battery gives readings and no can-change line; no source gives none of the three', () => {
  const battery = autoLayout({ ...spec, supplies: [{ id: 'B1', kind: 'battery', voltage: 9, positive: 'T+', negative: 'T-' }] });
  assert.equal(battery.status, 'done');
  assert.deepEqual(battery.readings.sources.map((s) => [s.id, s.kind]), [['B1', 'battery']]);
  assert.equal(battery.changeable, undefined);
  const text = formatLayout(battery, 'en', { t, formatIssue });
  assert.match(text, /\nReadings \(at rest, a model\): battery [\d.]+ V · D1 [\d.]+ mA, brightness \d+ % of 20 mA\n/);
  assert.doesNotMatch(text, /Can change|Program/);
  const { supplies, ...none } = spec;
  const bare = autoLayout(none);
  assert.equal(bare.status, 'done');
  for (const k of ['readings', 'programs', 'changeable']) assert.equal(bare[k], undefined, k);
  assert.equal(autoLayout({ ...spec, page: { simulation: false } }).readings, undefined, 'a value a learner must predict stays hidden');
  assert.doesNotMatch(formatLayout(bare, 'en', { t, formatIssue }), /Readings|Program|Can change/);
});

test('layout answer: a load that is off reads 0 mA, not the model\'s leakage; the JSON keeps the number', async () => {
  const { expandRecipe } = await import('../src/recipes/index.js');
  const r = autoLayout(expandRecipe('npn-switch').spec);
  assert.equal(r.status, 'done');
  const d1 = r.readings.parts.find((p) => p.id === 'D1');
  assert.equal(d1.off, true);
  assert.ok(d1.current > 0 && d1.current < 1e-6, `the raw leakage stays: ${d1.current}`);
  const en = formatLayout(r, 'en', { t, formatIssue }).split('\n').find((l) => l.startsWith('Readings'));
  assert.equal(en, 'Readings (at rest, a model): supply 5 V · D1 0 mA, brightness 0 % of 20 mA');
  const es = formatLayout(autoLayout(expandRecipe('npn-switch').spec, { lang: 'es' }), 'es', { t, formatIssue }).split('\n').find((l) => l.startsWith('Lecturas'));
  assert.equal(es, 'Lecturas (en reposo, un modelo): fuente 5 V · D1 0 mA, brillo 0 % del de 20 mA');
  // A lit LED is not off.
  assert.equal(autoLayout(expandRecipe('led-resistor').spec).readings.parts[0].off, undefined);
});

test('layout answer: more than four loads end with how many simulate lists', async () => {
  const leds = Array.from({ length: 6 }, (_, i) => i + 1);
  const r = autoLayout({
    board: 'auto',
    parts: leds.flatMap((i) => [{ id: `R${i}`, type: 'resistor', value: '1k' }, { id: `D${i}`, type: 'led', color: 'red' }]),
    nets: leds.flatMap((i) => [['T+', `R${i}.1`], [`R${i}.2`, `D${i}.anode`], [`D${i}.cathode`, 'T-']]),
    supplies: [{ id: 'V1', kind: 'bench', voltage: 5, positive: 'T+', negative: 'T-' }],
  });
  assert.equal(r.readings.parts.length, 6);
  const line = formatLayout(r, 'en', { t, formatIssue }).split('\n').find((l) => l.startsWith('Readings'));
  assert.equal(line.split(' · ').length, 1 + 4 + 1, line);
  assert.match(line, / · 2 more \(simulate lists them\)$/);
});

test('layout answer: a long program is cut to its first lines and says where the rest is', async () => {
  const { mkdtempSync, writeFileSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { expandRecipe } = await import('../src/recipes/index.js');
  const long = `void setup() {}\nvoid loop() {\n${Array.from({ length: 100 }, (_, i) => `  delay(${i + 1});`).join('\n')}\n}\n`;
  const r = autoLayout(expandRecipe('uno-blink', { U1: long }).spec);
  assert.equal(r.status, 'done');
  assert.deepEqual([r.programs[0].truncated, r.programs[0].text.split('\n').length, r.programs[0].omitted], [true, 40, 63]);
  const lines = formatLayout(r, 'en', { t, formatIssue }).split('\n');
  const at = lines.indexOf('Program U1 (Arduino sketch):');
  assert.equal(lines[at + 40], '    delay(38);');
  assert.equal(lines[at + 41], '  … 63 more lines not shown: the whole sketch is in the circuit (get_circuit, or circuit.json).');
  assert.match(formatLayout(autoLayout(expandRecipe('uno-blink', { U1: long }).spec, { lang: 'es' }), 'es', { t, formatIssue }), / {2}… 63 líneas más sin mostrar: el sketch completo está en el circuito/);
  // Under 80 lines but over 4000 characters: cut too, and never past the characters.
  const wide = `void setup() {}\nvoid loop() {\n${Array.from({ length: 50 }, (_, i) => `  delay(${i}); // ${'x'.repeat(100)}`).join('\n')}\n}\n`;
  const w = autoLayout(expandRecipe('uno-blink', { U1: wide }).spec).programs[0];
  assert.ok(w.truncated && w.text.length <= 4000, `${w.text.length}`);
  // From a .ino file beside the circuit: read inside its folder, and the cut names the file.
  const folder = mkdtempSync(join(tmpdir(), 'layout-ino-'));
  writeFileSync(join(folder, 'long.ino'), long);
  const f = autoLayout(expandRecipe('uno-blink', { U1: 'long.ino' }).spec, { folder });
  assert.deepEqual([f.programs[0].file, f.programs[0].truncated], ['long.ino', true]);
  assert.match(formatLayout(f, 'en', { t, formatIssue }), /\n {2}… 63 more lines not shown: the whole sketch is in long\.ino, beside the circuit\.\n/);
  assert.equal(autoLayout(expandRecipe('uno-blink', { U1: 'long.ino' }).spec).programs, undefined, 'no folder: nothing read');
});
