// Simulation results as readable text, in any language of src/i18n.

import { t, decimalSeparator } from '../i18n/index.js';
import { formatValue } from '../core/units.js';
import { BRIGHTNESS_OVER } from './models.js';
import { nodeParams } from '../circuit/checks.js';
import { linesFor, runtimeWords } from './lines.js';

const pad = (s, n) => String(s).padEnd(n);
const CARD_KINDS = new Set(['DRV', 'OPT', 'AMP']);

export function formatSimulation(result, lang = 'en', { formatIssue, netLabels = {} } = {}) {
  const decimal = decimalSeparator(lang);
  const f = (value, unit) => (value == null ? t(lang, 'sim.floating') : formatValue(value, unit, { decimal }));
  const lines = [];
  const issues = () => {
    if (!result.issues?.length) return;
    lines.push(t(lang, 'sim.issues'));
    for (const i of result.issues) lines.push(`  ${formatIssue(i, lang)}`);
  };
  if (!result.ok) {
    lines.push(t(lang, 'sim.failed'));
    issues();
    return lines.join('\n');
  }
  const nodeName = (n) => {
    const np = nodeParams(n);
    const name = np ? t(lang, np.key, np.params) : n;
    return netLabels[n] ? `${name} (${netLabels[n]})` : name;
  };

  if (result.analysis === 'transient') return formatTransient(result, lang, { f, lines, issues, nodeName });

  lines.push(t(lang, 'sim.dc', { iterations: result.iterations }));
  readingLines(result, lang, { f, lines, nodeName, decimal });
  issues();
  return lines.join('\n');
}

// Supplies, nodes and parts of one reading (the DC point, or the end of a run).
function readingLines(result, lang, { f, lines, nodeName, decimal }) {
  // A board on USB alone has no supply of its own: no heading over nothing.
  if (Object.keys(result.supplies ?? {}).length) lines.push(t(lang, 'sim.supplies'));
  for (const [id, s] of Object.entries(result.supplies ?? {})) {
    const written = s.written < 0 ? ` · ${t(lang, 'sim.supplyNegative', { named: s.named, high: s.high })}` : '';
    lines.push(`  ${pad(id, 6)} ${pad(f(s.voltage, 'V'), 10)} ${pad(f(s.current, 'A'), 10)} ${pad(f(s.power, 'W'), 10)} ${t(lang, `sim.mode.${s.mode}`)}${written}`);
  }
  lines.push(t(lang, 'sim.nodes', { ground: nodeName(result.ground) }));
  for (const [node, v] of Object.entries(result.nodes)) lines.push(`  ${pad(nodeName(node), 30)} ${f(v, 'V')}`);
  lines.push(t(lang, 'sim.parts'));
  for (const [id, p] of Object.entries(result.parts)) {
    let text;
    if (p.unsupported) text = t(lang, 'sim.unsupported');
    else if (p.kind === 'HDR') continue;
    else if (p.kind === 'M') text = `${t(lang, 'sim.region.mosfet.' + p.region)} · Vgs ${f(p.vgs, 'V')} · Vds ${f(p.vds, 'V')} · Id ${f(p.currents.D, 'A')} · ${f(p.power, 'W')}`;
    else if (p.kind === 'Q') text = `${t(lang, 'sim.region.bjt.' + p.region)} · Vbe ${f(p.vbe, 'V')} · Vce ${f(p.vce, 'V')} · Ib ${f(p.currents.B, 'A')} · Ic ${f(p.currents.C, 'A')} · ${f(p.power, 'W')}`;
    else if (p.kind === 'POT') text = `I(1) ${f(p.currents['1'], 'A')} · I(W) ${f(p.currents.W, 'A')} · I(3) ${f(p.currents['3'], 'A')} · ${f(p.power, 'W')}`;
    else if (p.kind === 'SWT') text = [t(lang, p.state ?? (p.on ? 'state.on' : 'state.off')), ...p.contacts.map((c) => t(lang, 'sim.switch.contact', { a: c.a, b: c.b, current: f(c.current, 'A') }))].join(' · ');
    else if (p.kind === 'SW') text = `${t(lang, p.pressed ? 'state.pressed' : 'state.released')} · ${f(p.current, 'A')}`;
    else if (p.kind === 'BR') text = `${t(lang, 'sim.q.bridge.vac')} ${f(p.vac, 'V')} · ${t(lang, 'sim.q.bridge.vdc')} ${f(p.vdc, 'V')} · ${t(lang, 'sim.q.bridge.current')} ${f(p.current, 'A')} · ${f(p.power, 'W')}`;
    else if (p.kind === 'REG') text = `${t(lang, 'sim.reg.' + p.state)} · ${t(lang, 'sim.q.reg.vin')} ${f(p.vin, 'V')} · ${t(lang, 'sim.q.reg.vout')} ${f(p.vout, 'V')} · ${t(lang, 'sim.q.reg.iout')} ${f(p.current, 'A')} · ${f(p.power, 'W')}`;
    else if (p.kind === 'MCU') text = [p.usb ? `USB ${f(p.usb.voltage, 'V')} ${f(p.usb.current, 'A')}` : null, `${t(lang, 'sim.q.mcu.vdd')} ${f(p.vdd, 'V')}`, ...p.pins.map((x) => `${x.name} ${x.mode === 'output' ? t(lang, `sim.mcu.${x.level ? 'high' : 'low'}`) : t(lang, `sim.mcu.input${x.pull ? `.${x.pull}` : ''}`)} ${f(x.voltage, 'V')} ${f(x.current, 'A')}${x.behind ? ` ${t(lang, 'sim.mcu.behind', { resistance: f(x.behind, 'Ω') })}` : ''}`), p.program?.error ? t(lang, 'sim.mcu.programError', { error: p.program.error }) : null, f(p.power, 'W')].filter(Boolean).join(' · ');
    else if (p.kind === 'OPA') text = [...p.amps.map((a) => `${a.name ? `${t(lang, 'sim.opamp.amp', { n: a.name })}: ` : ''}${t(lang, 'sim.opamp.' + a.state)} · V+ ${f(a.vplus, 'V')} · V− ${f(a.vminus, 'V')} · ${t(lang, 'sim.q.opamp.vout')} ${f(a.vout, 'V')} · ${f(a.current, 'A')}`), f(p.power, 'W')].join(' · ');
    else if (p.kind === 'TMR') text = `${t(lang, 'sim.timer.' + p.state)} · ${t(lang, 'sim.q.timer.vout')} ${f(p.vout, 'V')} · ${t(lang, 'sim.q.timer.vthr')} ${f(p.vthr, 'V')} · ${t(lang, 'sim.q.timer.iout')} ${f(p.current, 'A')} · ${f(p.power, 'W')}`;
    else if (p.kind === 'LEDS') text = [...Object.entries(p.channels).map(([pin, c]) => `${pin} ${f(c.voltage, 'V')} ${f(c.current, 'A')} ${c.brightness > BRIGHTNESS_OVER ? t(lang, 'sim.bright.over') : `${Math.round(c.brightness * 100)} %`}`), `${t(lang, 'sim.q.leds.common')} ${f(Math.abs(p.current), 'A')}`, f(p.power, 'W')].join(' · ');
    else if (p.kind === 'TMP') text = [p.state !== 'ok' && t(lang, `sim.lm35.${p.state}`), `${f(p.temperature, '°C')}`, `${t(lang, 'sim.q.lm35.vout')} ${f(p.vout, 'V')}`, `${t(lang, 'sim.q.lm35.vs')} ${f(p.vs, 'V')}`, `${t(lang, 'sim.q.lm35.own')} ${f(p.quiescent, 'A')}`].filter(Boolean).join(' · ');
    else if (p.kind === 'HAL') text = [p.state !== 'ok' && t(lang, `sim.hall.${p.state}`), `${p.field} G`, `${t(lang, 'sim.q.hall.vout')} ${f(p.vout, 'V')}`, `${t(lang, 'sim.q.hall.vs')} ${f(p.vs, 'V')}`, `${t(lang, 'sim.q.hall.own')} ${f(p.quiescent, 'A')}`].filter(Boolean).join(' · ');
    else if (p.kind === 'VSN') text = `${t(lang, 'sim.q.divider.vin')} ${f(p.vin, 'V')} · S ${f(p.vs, 'V')} · ${t(lang, 'sim.q.divider.current')} ${f(p.current, 'A')}`;
    else if (p.kind === 'RLY') text = [t(lang, `sim.relay.${p.state}`), `${t(lang, 'sim.q.relay.coil')} ${f(p.voltage, 'V')} ${f(p.current, 'A')}`, t(lang, 'sim.switch.contact', { a: 'COM', b: p.closed ? 'NO' : 'NC', current: f(p.contacts[p.closed ? 'NO' : 'NC'], 'A') })].join(' · ');
    else if (p.kind === 'PIR') text = [t(lang, `sim.pir.${p.state}`, { time: p.left == null ? '' : f(p.left, 's') }), `${t(lang, 'sim.q.pir.vout')} ${f(p.vout, 'V')}`, `${t(lang, 'sim.q.pir.iout')} ${f(Math.abs(p.current) < 1e-9 ? 0 : p.current, 'A')}`, `${t(lang, 'sim.q.pir.vcc')} ${f(p.vcc, 'V')}`, `${t(lang, 'sim.q.pir.own')} ${f(p.quiescent, 'A')}`].join(' · ');
    else if (p.kind === 'TCH') text = [t(lang, `sim.touch.${p.state}`, { time: p.left == null ? '' : f(p.left, 's') }), `${t(lang, 'sim.q.touch.vout')} ${f(p.vout, 'V')}`, `${t(lang, 'sim.q.touch.isig')} ${f(Math.abs(p.current) < 1e-9 ? 0 : p.current, 'A')}`, `${t(lang, 'sim.q.touch.vcc')} ${f(p.vcc, 'V')}`].join(' · ');
    else if (p.kind === 'ENC') text = [t(lang, `sim.encoder.${p.direction > 0 ? 'cw' : p.direction < 0 ? 'ccw' : 'still'}`), t(lang, 'sim.encoder.shaft', { angle: String(p.shaftShown), click: p.click, detents: p.detents }), `CLK ${f(p.vclk, 'V')}`, `DT ${f(p.vdt, 'V')}`, `SW ${f(p.vsw, 'V')}`].join(' · ');
    else if (p.kind === 'SONAR') text = [t(lang, `sim.sonar.${p.state}`, { time: p.left == null ? '' : f(p.left, 's') }), `${t(lang, 'sim.q.sonar.distance')} ${f(p.distance / 100, 'm')}`, `${t(lang, 'sim.q.sonar.width')} ${f(p.width, 's')}`, `${t(lang, 'sim.q.sonar.vecho')} ${f(p.vecho, 'V')}`, `${t(lang, 'sim.q.sonar.vcc')} ${f(p.vcc, 'V')}`, `${t(lang, 'sim.q.sonar.own')} ${f(p.current, 'A')}`].join(' · ');
    else if (p.kind === 'CLIM') {
      const a = p.answer;
      const n = (v, d) => (Number.isFinite(v) ? v.toFixed(d).replace('.', decimal) : '—');
      const said = [`${n(a.temperature, p.part === 'DHT11' ? 0 : 2)} °C`, Number.isFinite(a.humidity) && `${n(a.humidity, p.part === 'DHT11' ? 0 : 2)} %RH`, Number.isFinite(a.pressure) && `${n(a.pressure / 100, 2)} hPa`].filter(Boolean).join(' ');
      text = [p.state === 'ready' ? said : t(lang, p.state === 'warmup' ? 'sim.climate.warmup' : `sim.climate.${p.state}`, { voltage: f(p.vcc, 'V'), time: f(p.left ?? 0, 's'), values: said }), `${t(lang, 'sim.q.climate.vcc')} ${f(p.vcc, 'V')}`, `${t(lang, 'sim.q.climate.own')} ${f(p.current, 'A')}`].join(' · ');
    } else if (p.kind === 'MOT') text = [t(lang, `sim.motor.${p.state}`), `${Math.round(p.rpm)} r/min`, `${pad(f(p.voltage, 'V'), 10)} ${f(p.current, 'A')}`, `${t(lang, 'sim.q.motor.emf')} ${f(p.emf, 'V')}`, f(p.power, 'W')].join(' · ');
    // The chips whose card lines say it all (the Darlington array, the optocoupler, the LM386).
    else if (CARD_KINDS.has(p.kind)) text = linesFor(p, { t: (key, params) => t(lang, key, params), decimal }).filter((l) => l.key !== 'floating').map((l) => l.text).join(' · ');
    else if (p.kind === 'BAT' && !p.on) text = t(lang, 'sim.battery.off');
    else if (p.kind === 'BAT') {
      text = `${pad(f(p.voltage, 'V'), 10)} ${pad(f(p.current, 'A'), 10)} ${f(p.power, 'W')} · ${t(lang, 'sim.q.battery.emf')} ${f(p.emf, 'V')}`;
      if (p.runtime != null) text += ` · ${t(lang, 'sim.q.battery.runtime')} ${runtimeText(p.runtime, lang)}`;
    }
    else {
      text = `${pad(f(p.voltage, 'V'), 10)} ${pad(f(p.current, 'A'), 10)} ${f(p.power, 'W')}`;
      if (p.kind === 'LED') text += ` · ${t(lang, 'sim.brightness', { percent: Math.round(p.brightness * 100) })}`;
    }
    if (p.floating) text += ` · ${t(lang, 'sim.floating')}`;
    lines.push(`  ${pad(id, 6)} ${text}`);
  }
}

// A run (sim/run.js) as text: what the program printed (the first and the last lines when it is
// long), one line per output (its rhythm when it toggles regularly, else its share of the time on and,
// when there are a few, the spans it was on), the readings at the end, the notes.
const SERIAL_SHOWN = 10;
// biome-ignore lint/suspicious/noControlCharactersInRegex: control characters are what it replaces
const CONTROL = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/g;
const SPANS_SHOWN = 3;
export function formatRun(result, lang = 'en', { formatIssue, netLabels = {} } = {}) {
  const decimal = decimalSeparator(lang);
  const f = (value, unit) => (value == null ? t(lang, 'sim.floating') : formatValue(value, unit, { decimal }));
  const lines = [];
  const notes = (list) => {
    if (!list?.length) return;
    lines.push(t(lang, 'sim.issues'));
    for (const i of list) lines.push(`  ${formatIssue(i, lang)}`);
  };
  if (!result.ok && !result.readings) {
    lines.push(t(lang, 'sim.failed'));
    notes(result.issues ?? result.errors);
    return lines.join('\n');
  }
  const { run, serial, outputs } = result;
  const gains = (s) => [...s.gains.map((g) => t(lang, g.on ? 'layout.states.on' : 'layout.states.off', { id: g.id })), ...s.on.map((id) => t(lang, 'sim.run.state.lit', { id }))].join(', ');
  const from = run.states ? t(lang, 'sim.run.start.state', { first: gains(run.states[0]), second: gains(run.states[1]) }) : t(lang, `sim.run.start.${run.start}.${run.start === (run.page ?? run.start) ? 'page' : 'other'}`);
  lines.push(t(lang, 'sim.run', { start: from, seconds: f(run.seconds, 's'), step: f(run.step, 's'), steps: run.steps }));
  // A run that covers less than was asked (capped at the limit, stopped by the machine's time or its
  // steps) says so first, and each heading after it names the span it covers.
  const ran = run.ran ?? run.seconds;
  const cut = (result.issues ?? []).filter((i) => CUT.has(i.code));
  const short = cut.length > 0 || ran < run.seconds - 1e-9;
  for (const i of cut) lines.push(formatIssue(i, lang));
  if (short) lines.push(t(lang, 'sim.run.covers', { ran: f(ran, 's'), seconds: f(run.seconds, 's') }));
  const span = short ? t(lang, 'sim.run.span', { ran: f(ran, 's') }) : '';
  if (result.boards > 0 || serial.count > 0) {
    if (!serial.count) lines.push(t(lang, 'sim.run.serialNone', { span }));
    else {
      lines.push(t(lang, 'sim.run.serial', { count: serial.count, span }));
      const shown = serial.lines;
      // What a program printed is shown as it is, but never as a line of the answer of its own.
      const line = (l) => `  ${pad(f(l.t, 's'), 10)} ${l.board ? `${l.board}: ` : ''}${String(l.text).replace(CONTROL, '\uFFFD')}`;
      if (serial.count <= SERIAL_SHOWN && shown.length === serial.count) for (const l of shown) lines.push(line(l));
      else {
        for (const l of shown.slice(0, SERIAL_SHOWN / 2)) lines.push(line(l));
        lines.push(t(lang, 'sim.run.serialMore', { count: serial.count - SERIAL_SHOWN }));
        for (const l of shown.slice(-SERIAL_SHOWN / 2)) lines.push(line(l));
      }
    }
  }
  if (!outputs.length) lines.push(t(lang, 'sim.run.noOutputs'));
  else {
    lines.push(t(lang, 'sim.run.outputs', { span }));
    for (const o of outputs) lines.push(`  ${outputText(o, lang, f)}`);
  }
  if (result.readings?.ok) {
    lines.push(t(lang, 'sim.run.readings', { time: f(ran, 's') }));
    const nodeName = (n) => {
      const np = nodeParams(n);
      const name = np ? t(lang, np.key, np.params) : n;
      return netLabels[n] ? `${name} (${netLabels[n]})` : name;
    };
    readingLines(result.readings, lang, { f, lines, nodeName, decimal });
  }
  notes(result.issues?.filter((i) => !CUT.has(i.code)));
  return lines.join('\n');
}
// The issues of a run that covers less than was asked: printed first (formatRun).
const CUT = new Set(['RUN_CAPPED', 'RUN_BUDGET', 'RUN_STEPS']);

// One output in a line: "D1 (LED): 1 Hz, on 50 % of the time (period 1 s) · 7 changes".
const percentOf = (share) => (share > 0 && share < 0.005 ? '< 1' : share < 1 && share > 0.995 ? '> 99' : String(Math.round(100 * share)));
export function outputText(o, lang, f) {
  const params = { id: o.id, kind: t(lang, `sim.run.kind.${o.kind}`), changes: o.changes };
  if (o.sound) return soundText(o, lang, f, params);
  if (o.frequency) return t(lang, 'sim.run.regular', { ...params, frequency: f(o.frequency, 'Hz'), period: f(o.period, 's'), percent: percentOf(o.duty ?? o.onShare) });
  if (!o.changes) return t(lang, o.onShare > 0.5 ? 'sim.run.always' : 'sim.run.never', params);
  const spans = o.intervals.length && o.intervals.length <= SPANS_SHOWN && !o.intervalsTotal ? t(lang, 'sim.run.spans', { list: o.intervals.map(([a, b]) => `${f(a, 's')} → ${f(b, 's')}`).join(', ') }) : '';
  return t(lang, 'sim.run.share', { ...params, percent: percentOf(o.onShare), spans });
}

// A passive buzzer by when it is heard (its beeps) and its tone, apart: "BZ1 (buzzer): beeps 2 Hz
// (every 500 ms), sounding 20 % of the time · beeps: 4 · tone 2 kHz".
function soundText(o, lang, f, params) {
  const s = o.sound;
  const tone = o.tone ? t(lang, 'sim.run.tone', { frequency: f(o.tone.frequency, 'Hz') }) : '';
  const p = { ...params, starts: s.starts, tone };
  if (s.frequency) return t(lang, 'sim.run.sound.regular', { ...p, frequency: f(s.frequency, 'Hz'), period: f(s.period, 's'), percent: percentOf(s.onShare) });
  if (!s.changes) {
    if (s.onShare > 0.5) return t(lang, 'sim.run.sound.always', p);
    return o.onShare > 0 ? t(lang, 'sim.run.sound.click', { ...p, percent: percentOf(o.onShare) }) : t(lang, 'sim.run.sound.silent', p);
  }
  const spans = s.intervals.length && s.intervals.length <= SPANS_SHOWN && !s.intervalsTotal ? t(lang, 'sim.run.sound.spans', { list: s.intervals.map(([a, b]) => `${f(a, 's')} → ${f(b, 's')}`).join(', ') }) : '';
  return t(lang, 'sim.run.sound.share', { ...p, percent: percentOf(s.onShare), spans });
}

// A table at about ten evenly spaced times: capacitor voltages and supply currents (the
// JSON answer has every sample, every node and every part).
function formatTransient(result, lang, { f, lines, issues }) {
  lines.push(t(lang, 'sim.transient', { start: t(lang, `sim.start.${result.start}`), stop: f(result.stop, 's'), step: f(result.step, 's'), points: result.times.length, spacing: f(result.times.length > 1 ? result.times[1] - result.times[0] : result.step, 's') }));
  const caps = Object.keys(result.parts).filter((id) => result.parts[id].voltage && /^C/i.test(id));
  const columns = [
    ...caps.map((id) => ({ head: `V(${id})`, values: result.parts[id].voltage, unit: 'V' })),
    ...Object.entries(result.supplies).map(([id, s]) => ({ head: `I(${id})`, values: s.current, unit: 'A' })),
  ];
  lines.push(`  ${pad('t', 10)} ${columns.map((c) => pad(c.head, 11)).join(' ')}`);
  const n = result.times.length;
  const rows = [...new Set(Array.from({ length: 11 }, (_, i) => Math.round((i * (n - 1)) / 10)))];
  for (const k of rows) lines.push(`  ${pad(f(result.times[k], 's'), 10)} ${columns.map((c) => pad(f(c.values[k], c.unit), 11)).join(' ')}`);
  issues();
  return lines.join('\n');
}

// Hours of battery life as "≈ 40 min", "≈ 7,5 h", "≈ 6 días".
// How long a battery lasts, as "3,2 h" in the page's language.
export const runtimeText = (hours, lang = 'en') => runtimeWords(hours, { t: (key, params) => t(lang, key, params), decimal: decimalSeparator(lang) });

// One part's readings for a card: [{ key, text }] (see sim/lines.js, which the page also runs).
export const partLines = (p, lang = 'en') => linesFor(p, { t: (key, params) => t(lang, key, params), decimal: decimalSeparator(lang) });

// The Falstad link (src/sim/falstad.js) as text: the URL, then what went as an equivalent.
export function formatFalstad(out, lang = 'en') {
  const decimal = decimalSeparator(lang);
  const note = (n) => t(lang, n.code, Object.fromEntries(Object.entries(n.params).map(([k, v]) => [k, v && typeof v === 'object' ? formatValue(v.value, v.unit, { decimal }) : v])));
  const lines = [`${t(lang, 'page.falstad.open')}: ${out.url}`];
  if (out.notes.length) lines.push(`${t(lang, 'page.falstad.notes')}:`, ...out.notes.map((n) => `  ${note(n)}`));
  return lines.join('\n');
}
