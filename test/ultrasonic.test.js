// The HC-SR04 ultrasonic module (docs/en/ultrasonic-sensor.md): its state machine against the
// datasheet's times, a board's pulseIn reading it through the engine (docs/en/microcontrollers.md), its
// supply and output, the 3.3 V divider and its state across a slider. The numbers follow from the
// speed of sound: ECHO's width is 2·d / v, v = 331.3 + 0.606·T m/s.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { autoLayout } from '../src/layout.js';
import { compile, createEngine, simulate } from '../src/sim/index.js';
import { sonarAdvance, sonarUntil, echoWidth, IDLE, BURST, ECHO, OFF } from '../src/sim/devices/ultrasonic.js';
import { PART_TYPES } from '../src/parts/types/index.js';
import { ULTRASONIC } from '../src/sim/models.js';

const near = (a, b, tolerance, what) => assert.ok(Math.abs(a - b) <= tolerance, `${what}: ${a} against ${b}`);
const codes = (issues) => issues.map((i) => i.code);

test('ultrasonic-sensor: a sensor of four pins, VCC TRIG ECHO GND, part HC-SR04', () => {
  const t = PART_TYPES['ultrasonic-sensor'];
  assert.equal(t.family, 'sensor');
  assert.deepEqual(t.pins, ['VCC', 'TRIG', 'ECHO', 'GND']);
  const r = t.resolve({});
  assert.equal(r.electrical.part, 'HC-SR04');
  assert.equal(r.package, 'ultrasonic-module');
  assert.equal(t.resolve({ part: 'HCSR04' }).electrical.part, 'HC-SR04');
  assert.ok(t.resolve({ part: 'LM35DZ' }).error);
  assert.ok(t.resolve({ distance: -1 }).error);
});

test('the echo is the round trip at the speed of sound: 2·d / v at four distances and temperatures', () => {
  near(echoWidth({ distance: 100, temperature: 20 }) * 1e6, 5824, 5, '100 cm, 20 °C');
  near(echoWidth({ distance: 10, temperature: 25 }) * 1e6, 577, 2, '10 cm, 25 °C');
  near(echoWidth({ distance: 400, temperature: 20 }) * 1e3, 23.3, 0.05, '400 cm');
  near(echoWidth({ distance: 50, temperature: 0 }) * 1e6, 3018, 3, '50 cm, 0 °C');
  assert.equal(echoWidth({ distance: 450, temperature: 20 }), 0.038, 'no echo past 400 cm');
  assert.equal(echoWidth({ distance: 1, temperature: 20 }), 0.038, 'nor under 2 cm');
  assert.equal(echoWidth({ distance: 100, temperature: 20 }, 4), 0.038, 'nor under 4.5 V');
});

test('the machine: TRIG ≥ 10 µs arms it, its fall starts a 250 µs burst, then ECHO; a 5 µs TRIG does nothing', () => {
  const p = { distance: 100, temperature: 20 };
  let s = { phase: IDLE, clock: 0, width: 0 };
  s = sonarAdvance(s, 10e-6, true, 5, p);
  assert.equal(s.phase, IDLE);
  assert.equal(sonarUntil(s), ULTRASONIC.burst, 'armed: the burst ends 250 µs after TRIG falls');
  s = sonarAdvance(s, 250e-6, false, 5, p);
  assert.equal(s.phase, ECHO, 'the burst is over at the end of the step');
  near(sonarUntil(s), echoWidth(p), 1e-12, 'then the echo');
  // A TRIG while it measures is ignored.
  s = sonarAdvance(s, 1e-3, true, 5, p);
  assert.equal(s.phase, ECHO);
  s = sonarAdvance(s, sonarUntil(s), false, 5, p);
  assert.equal(s.phase, IDLE);
  assert.equal(sonarUntil(s), null, 'waiting needs no step of its own');
  const short = sonarAdvance(sonarAdvance({ phase: IDLE, clock: 0, width: 0 }, 5e-6, true, 5, p), 1e-3, false, 5, p);
  assert.equal(short.phase, IDLE, 'a 5 µs pulse is let go');
  assert.equal(sonarAdvance(s, 1e-3, false, 1, p).phase, OFF, 'no supply: off');
  // A long step lands where the machine would be: burst and part of the echo in one.
  const long = sonarAdvance({ phase: IDLE, clock: 20e-6, width: 0 }, 1e-3, false, 5, p);
  assert.equal(long.phase, ECHO);
  near(long.clock, 1e-3 - 250e-6, 1e-12, 'the echo counts from the burst\'s end');
  assert.equal(sonarAdvance({ phase: BURST, clock: 0, width: 0 }, 1e-4, false, 5, p).phase, BURST);
});

// An UNO measuring with the classic sketch: TRIG on D9, ECHO on D10 (through a divider on a 3.3 V board).
const sketch = (timeout = 30000, high = 10) => `const int TRIG = 9;
const int ECHO = 10;
void setup() { pinMode(TRIG, OUTPUT); pinMode(ECHO, INPUT); Serial.begin(9600); }
void loop() {
  digitalWrite(TRIG, LOW); delayMicroseconds(2);
  digitalWrite(TRIG, HIGH); delayMicroseconds(${high});
  digitalWrite(TRIG, LOW);
  unsigned long us = pulseIn(ECHO, HIGH, ${timeout});
  Serial.println(us);
  delay(100);
}`;
function bench({ distance = 100, temperature = 20, timeout, high, module = {} } = {}) {
  const r = autoLayout({
    board: 'auto',
    parts: [{ id: 'U1', part: 'UNO', program: sketch(timeout, high) }, { id: 'S1', type: 'ultrasonic-sensor', ...module }, { id: 'R9', type: 'resistor', value: '10k' }],
    nets: [['U1.5V', 'S1.VCC'], ['U1.GND', 'S1.GND', 'R9.2'], ['U1.D9', 'S1.TRIG'], ['U1.D10', 'S1.ECHO'], ['U1.D13', 'R9.1']],
    environment: { distance, temperature },
  });
  assert.equal(r.status, 'done', JSON.stringify(r.problems));
  return { circuit: r.circuit, engine: createEngine(compile(r.circuit).program) };
}
// What the sketch printed after `seconds` of simulated time in steps of h (as the page steps).
function printed(engine, seconds, h = 1e-3) {
  assert.ok(engine.start('dc', h));
  while (engine.time < seconds - 1e-9) assert.ok(engine.advance(h), `a step failed at ${engine.time}`);
  return engine.read().parts.U1.program.serial.map(Number);
}

test('pulseIn reads the echo to the microsecond, whatever the page\'s step', () => {
  for (const h of [1e-3, 1e-4, 2e-2]) {
    const lines = printed(bench().engine, 0.35, h);
    assert.ok(lines.length >= 2, `${h}: ${lines}`);
    for (const us of lines) near(us, 5824, 2, `100 cm at 20 °C, steps of ${h} s`);
  }
  near(printed(bench({ distance: 10, temperature: 25 }).engine, 0.2)[0], 577, 2, '10 cm at 25 °C');
  assert.equal(printed(bench({ distance: 450 }).engine, 0.2)[0], 0, 'no echo in 30 ms');
  near(printed(bench({ distance: 450, timeout: 60000 }).engine, 0.2)[0], 38000, 2, 'the 38 ms of no echo');
  assert.equal(printed(bench({ high: 5 }).engine, 0.2)[0], 0, 'a 5 µs TRIG is not taken');
});

test('a measurement every 100 ms costs a few steps, not a fine step all the time', () => {
  const { engine } = bench({ distance: 30 });
  assert.ok(engine.start('dc', 1e-3));
  let steps = 0;
  const step = engine.step.bind(engine);
  engine.step = (h) => {
    steps++;
    return step(h);
  };
  while (engine.time < 1 - 1e-9) engine.advance(1e-3);
  assert.ok(steps < 1000 + 10 * 8, `${steps} steps in a simulated second`);
});

test('supply: 2 mA waiting, 15 mA measuring; under 4.5 V no echo, over 5.5 V a warning', () => {
  const at = (volts, distance = 100) => {
    const r = autoLayout({
      parts: [{ id: 'S1', type: 'ultrasonic-sensor', distance }, { id: 'R1', type: 'resistor', value: '1k' }],
      nets: [['T+', 'S1.VCC', 'R1.1'], ['R1.2', 'S1.TRIG'], ['S1.GND', 'T-']],
      supplies: [{ id: 'V1', kind: 'bench', voltage: volts, positive: 'T+', negative: 'T-' }],
    });
    assert.equal(r.status, 'done', JSON.stringify(r.problems));
    return r.circuit;
  };
  const idle = simulate(at(5));
  near(idle.parts.S1.current, 2e-3, 1e-4, 'waiting');
  assert.ok(!codes(idle.issues).includes('SIM_IC_SUPPLY'));
  // TRIG tied high through 1 kΩ: armed, the module measures once TRIG falls; a bench measures by hand.
  const engine = createEngine(compile(at(5)).program);
  assert.ok(engine.start('dc', 1e-5));
  assert.ok(engine.set('R1', 'resistance', 1e9));
  near(engine.read().parts.S1.current, 2e-3, 1e-4, 'TRIG held high: still waiting');
  assert.ok(codes(simulate(at(6)).issues).includes('SIM_IC_SUPPLY'), 'over 5.5 V');
  const low = simulate(at(4));
  assert.ok(codes(low.issues).includes('SIM_MODULE_LOW_SUPPLY'), 'under 4.5 V');
  assert.equal(low.parts.S1.noEcho, true, 'and it hears no echo');
});

test('measuring: the supply takes 15 mA and ECHO is the supply behind its output', () => {
  const { engine } = bench({ distance: 100 });
  assert.ok(engine.start('dc', 1e-3));
  let seen = null;
  while (engine.time < 0.05 && !seen) {
    engine.advance(1e-4);
    const s1 = engine.read().parts.S1;
    if (s1.state === 'echo') seen = s1;
  }
  assert.ok(seen, 'ECHO went high');
  near(seen.current, 15e-3, 1e-3, 'measuring');
  near(seen.vecho, seen.vcc, 0.01, 'ECHO high with nothing to drive');
});

// The ESP32's 3.3 V pin: ECHO straight in is over its supply; through 1 kΩ / 2 kΩ it is 3.33 V.
function esp32(divider) {
  const parts = [{ id: 'U1', part: 'ESP32-DEVKIT', program: sketch().replace('TRIG = 9', 'TRIG = 5').replace('ECHO = 10', 'ECHO = 18') }, { id: 'S1', type: 'ultrasonic-sensor' }];
  const nets = [['U1.VIN', 'S1.VCC'], ['U1.GND', 'S1.GND'], ['U1.D5', 'S1.TRIG']];
  if (divider) {
    parts.push({ id: 'R1', type: 'resistor', value: '1k' }, { id: 'R2', type: 'resistor', value: '2k' });
    nets.push(['S1.ECHO', 'R1.1'], ['R1.2', 'R2.1', 'U1.D18'], ['R2.2', 'U1.GND']);
  } else nets.push(['S1.ECHO', 'U1.D18']);
  // The layout's verdict is about the drawing (a tall module hides wires); the circuit is what counts here.
  const r = autoLayout({ board: 'auto', parts, nets, environment: { distance: 30, temperature: 20 } });
  assert.ok(r.circuit && !r.problems.length, JSON.stringify(r.problems));
  return createEngine(compile(r.circuit).program);
}
test('a 3.3 V board: the divider keeps its pin at 3.33 V; without it the pin is over its supply', () => {
  for (const divider of [true, false]) {
    const engine = esp32(divider);
    assert.ok(engine.start('dc', 1e-3));
    let high = null;
    let over = false;
    while (engine.time < 0.3 - 1e-9) {
      engine.advance(1e-3);
      const r = engine.read();
      const pin = r.parts.U1.pins.find((x) => x.name === 'D18');
      if (r.parts.S1.state === 'echo') high = pin.voltage;
      if (pin.voltage > r.parts.U1.vdd + 0.3) over = true;
    }
    const cm = engine.read().parts.U1.program.serial.map((us) => Number(us) / 58);
    if (divider) {
      near(high, 3.33, 0.05, 'the divider\'s middle while ECHO is high');
      assert.equal(over, false);
      for (const d of cm) near(d, 30, 1, 'and it still reads 30 cm');
    } else {
      assert.equal(over, true, 'ECHO at 5 V straight into the pin');
      // The hazard is the board's pin, which says so; the module's ECHO stage is not over its limit.
      const stresses = engine.stresses(engine.read()).S1 ?? [];
      assert.ok(!stresses.some((s) => s.ratio > 1), JSON.stringify(stresses));
    }
  }
});

test('a slider elsewhere while ECHO is high does not start the measurement again', () => {
  const { engine } = bench({ distance: 200 });
  assert.ok(engine.start('dc', 1e-3));
  while (engine.read().parts.S1.state !== 'echo') engine.advance(1e-4);
  engine.advance(2e-3);
  const before = engine.read().parts.S1;
  assert.ok(engine.set('R9', 'resistance', 22e3));
  const after = engine.read().parts.S1;
  assert.equal(after.state, 'echo');
  near(after.left, before.left, 1e-4, 'the time left of the echo under way');
  const lines = printed(bench({ distance: 200 }).engine, 0.25);
  near(lines[0], echoWidth({ distance: 200, temperature: 20 }) * 1e6, 2, 'the echo of 200 cm');
});

test('up close: the symbol\'s letters and terminals, the printed face, the inside view and its legend', async () => {
  const { readFileSync } = await import('node:fs');
  const { buildCircuit } = await import('../src/index.js');
  const { symbolOf, insideOf } = await import('../src/parts/symbols.js');
  const { t } = await import('../src/i18n/index.js');
  const r = autoLayout({ parts: [{ id: 'S1', type: 'ultrasonic-sensor' }], nets: [['T+', 'S1.VCC'], ['S1.GND', 'T-']], supplies: [{ id: 'V1', kind: 'bench', voltage: 5, positive: 'T+', negative: 'T-' }] });
  const part = buildCircuit(r.circuit).parts.find((p) => p.id === 'S1');
  const symbol = symbolOf(part);
  for (const n of part.pinNames) assert.ok(symbol.ids[n] && symbol.pins[n], n);
  assert.equal(part.built.mark.kind, 'face');
  assert.equal(insideOf(part).kind, 'sonar');
  const figure = readFileSync(new URL('../src/page/client/figure.js', import.meta.url), 'utf8');
  assert.match(figure, /\n {2}sonar\(g, r, data/);
  const legend = readFileSync(new URL('../src/page/client/focus-view.js', import.meta.url), 'utf8').match(/\n {2}sonar: \[(.*)\],/)[1];
  for (const [, key] of legend.matchAll(/\['[a-z]*', '([a-z]+)'\]/g)) for (const lang of ['en', 'es']) assert.notEqual(t(lang, `page.tour.legend.sonar.${key}`), `page.tour.legend.sonar.${key}`);
  for (const n of part.pinNames) for (const lang of ['en', 'es']) assert.notEqual(t(lang, `pin.role.ultrasonic-sensor.${n}`), `pin.role.ultrasonic-sensor.${n}`);
});

// The recipes (docs/en/recipes.md): ready in one layout, measuring what the environment says.
const { expandRecipe } = await import('../src/recipes/index.js');
const { checkCircuit } = await import('../src/index.js');
const laidOut = (name) => {
  const r = autoLayout(expandRecipe(name).spec);
  assert.equal(r.status, 'done', `${name}: ${JSON.stringify(r.review.blocking)}`);
  return r.circuit;
};
// Advances until a Serial line satisfies `ok`, at most `seconds` of simulated time; the time it took.
function until(engine, ok, seconds) {
  const t0 = engine.time;
  while (engine.time - t0 < seconds - 1e-9) {
    engine.advance(1e-3);
    const line = engine.read().parts.U1.program.serial.at(-1);
    if (line !== undefined && ok(Number(line))) return engine.time - t0;
  }
  return null;
}

test('uno-distance: prints the environment\'s distance, and follows it within half a second', () => {
  const circuit = laidOut('uno-distance');
  assert.deepEqual(checkCircuit(circuit).issues.filter((i) => i.severity !== 'info').map((i) => i.code), []);
  const engine = createEngine(compile(circuit).program);
  assert.ok(engine.start('dc', 1e-3));
  assert.ok(until(engine, (cm) => Math.abs(cm - 30) <= 1, 0.5) != null, '30 cm');
  assert.ok(engine.set('environment', 'distance', 10));
  assert.ok(until(engine, (cm) => Math.abs(cm - 10) <= 1, 0.5) != null, '10 cm');
});

test('esp32-distance: the divider keeps the pin at 3.33 V with no over-voltage, and it reads 30 cm', () => {
  const circuit = laidOut('esp32-distance');
  const engine = createEngine(compile(circuit).program);
  assert.ok(engine.start('dc', 1e-3));
  let high = null;
  const codes = new Set();
  while (engine.time < 0.4) {
    engine.advance(1e-3);
    const r = engine.read();
    if (r.parts.U2.state === 'echo') high = r.parts.U1.pins.find((x) => x.name === 'D18').voltage;
    for (const s of Object.values(engine.stresses(r)).flat()) if (s.ratio > 1) codes.add(s.code);
  }
  near(high, 3.33, 0.05, 'D18 while ECHO is high');
  assert.ok(!codes.has('SIM_OVER_CURRENT'));
  const lines = engine.read().parts.U1.program.serial.map(Number);
  for (const cm of lines) near(cm, 30, 1, 'the distance');
  const issues = simulate(circuit, { analysis: 'transient', stop: 0.01, step: 1e-5 }).issues.map((i) => i.code);
  assert.ok(!issues.includes('SIM_PIN_OVERVOLTAGE'), issues.join());
});

test('distance-alarm-uno: the LED lights under 15 cm', () => {
  const engine = createEngine(compile(laidOut('distance-alarm-uno')).program);
  assert.ok(engine.start('dc', 1e-3));
  assert.ok(until(engine, (cm) => Math.abs(cm - 30) <= 1, 0.5) != null);
  engine.advance(0.01);
  assert.ok(engine.read().parts.D1.current < 1e-4, 'off at 30 cm');
  assert.ok(engine.set('environment', 'distance', 10));
  assert.ok(until(engine, (cm) => Math.abs(cm - 10) <= 1, 0.5) != null);
  engine.advance(0.01);
  assert.ok(engine.read().parts.D1.current > 5e-3, 'on at 10 cm');
});

// With an emitter in the circuit (the KY-008 laser, docs/en/environment.md): its light reaches the
// sensors one engine step later, and a landed piece is a step like the others: never skipped, never
// out of order.
test('a laser and an HC-SR04 on one UNO: the echo to the microsecond, the light one step late', () => {
  const spec = expandRecipe('laser-uno').spec;
  spec.parts[0].program = `void setup() { pinMode(7, OUTPUT); pinMode(9, OUTPUT); pinMode(10, INPUT); Serial.begin(9600); }
long measure() { digitalWrite(9, LOW); delayMicroseconds(2); digitalWrite(9, HIGH); delayMicroseconds(10); digitalWrite(9, LOW); return pulseIn(10, HIGH, 30000); }
void loop() {
  digitalWrite(7, HIGH); delay(20); long a = measure(); Serial.print(a); Serial.print(" "); Serial.println(analogRead(A0)); delay(30);
  digitalWrite(7, LOW); delay(20); long b = measure(); Serial.print(b); Serial.print(" "); Serial.println(analogRead(A0)); delay(30);
}`;
  // Second in the parts, so the wide module finds its room (docs: the roadmap's wide modules).
  spec.parts.splice(1, 0, { id: 'U2', type: 'ultrasonic-sensor' });
  spec.nets.push(['U1.5V', 'U2.VCC'], ['U2.GND', 'U1.GND'], ['U1.D9', 'U2.TRIG'], ['U2.ECHO', 'U1.D10']);
  spec.environment = { ...spec.environment, distance: 30, temperature: 20 };
  const r = autoLayout({ board: 'auto', ...spec, clearance: 1 });
  assert.deepEqual(r.problems, []);
  const engine = createEngine(compile(r.circuit).program);
  assert.ok(engine.start('dc', 1e-3));
  const ambient = spec.environment.light; // the room's, without the laser
  let steps = 0;
  let landed = 0;
  let late = 0;
  let last = -1;
  let backwards = 0;
  const step = engine.step.bind(engine);
  engine.step = (h, hold) => {
    const before = engine.emissions().light?.total ?? 0;
    const ok = step(h, hold);
    const now = engine.read();
    steps++;
    if (h < 1e-3 - 1e-9) landed++;
    if (Math.abs(now.parts.LDR1.sensor.light - (ambient + before)) > 1e-6) late++;
    if (now.parts.U1.program.time < last) backwards++;
    last = now.parts.U1.program.time;
    return ok;
  };
  while (engine.time < 0.5 - 1e-9) assert.ok(engine.advance(1e-3));
  assert.ok(landed > 10, `${landed} landed steps of ${steps}`);
  assert.equal(late, 0, 'every step sees what the emitters gave the step before');
  assert.equal(backwards, 0, 'the program\'s time never goes back');
  const lines = engine.read().parts.U1.program.serial.map((l) => l.split(' ').map(Number));
  assert.ok(lines.length >= 6);
  for (const [us] of lines) near(us, 1747, 2, 'the echo of 30 cm at 20 °C');
  const on = lines.filter((_, i) => i % 2 === 0).map(([, a0]) => a0);
  const off = lines.filter((_, i) => i % 2 === 1).map(([, a0]) => a0);
  assert.ok(Math.min(...on) > Math.max(...off) + 200, `A0 with the laser on ${on}, off ${off}`);
});

test('TRIG held high (a button on it) asks for one landing, not one every 250 µs', () => {
  let s = { phase: IDLE, clock: 0, width: 0 };
  const p = { distance: 100, temperature: 20 };
  const asked = [];
  for (let k = 0; k < 20; k++) {
    asked.push(sonarUntil(s));
    s = sonarAdvance(s, sonarUntil(s) ?? 1e-3, true, 5, p);
  }
  assert.ok(asked.filter((u) => u != null).length <= 2, JSON.stringify(asked));
  assert.equal(s.phase, IDLE, 'still waiting for TRIG to fall');
});

test('off (under 2.5 V) it measures nothing; from 2.5 to 4.5 V it hears no echo', () => {
  const at = (volts) => {
    const r = autoLayout({ parts: [{ id: 'S1', type: 'ultrasonic-sensor' }], nets: [['T+', 'S1.VCC'], ['S1.GND', 'T-']], supplies: [{ id: 'V1', kind: 'bench', voltage: volts, positive: 'T+', negative: 'T-' }] });
    return simulate(r.circuit).parts.S1;
  };
  const off = at(1);
  assert.equal(off.state, 'off');
  assert.equal(off.width, null);
  const low = at(3.5);
  assert.equal(low.state, 'idle');
  assert.equal(low.noEcho, true);
});
