// What every device module shares: issues, quantities, stresses, two-terminal readings and the
// card lines of a part with two leads. See ./index.js for the device interface.

export const issue = (severity, code, params) => ({ severity, code, params });
export const q = (value, unit) => ({ value, unit }); // a quantity, formatted per language by formatIssue
export const volt = (x, i) => (i >= 0 ? x[i] : 0);

// A stress: a value against the limit it must stay under (current, power, voltage, reverse
// voltage). ratio > 1 means exceeded: a warning `code` with { part, <param>: value, max }.
// The page will show the ratio as levels (fine, near the limit, exceeded).
export function stress(code, quantity, value, max, unit, { param = quantity, reportMax = true } = {}) {
  return { code, quantity, value, max, unit, ratio: max > 0 ? value / max : 0, param, reportMax };
}
// Something to say that is not a limit (a buzzer on DC, a regulator out of regulation).
export const note = (severity, code, params) => ({ note: issue(severity, code, params) });

// The warning a stress becomes when it is exceeded.
export function stressIssue(id, s) {
  return issue('warning', s.code, { part: id, [s.param]: q(s.value, s.unit), ...(s.reportMax && { max: q(s.max, s.unit) }) });
}

// Voltage between the first two pins, the element's current from the first to the second.
export function twoTerminal(entry, el, h) {
  const v = h.volt(entry.pins[0].index) - h.volt(entry.pins[1].index);
  const i = el ? el.currents(h.x, h.ctx)[0] : 0;
  return { voltage: v, current: i, power: v * i };
}

// Card lines of a two-lead part (resistors, sensors, capacitors, inductors, diodes, LEDs).
export function twoTerminalLines(p, h) {
  const lines = [];
  if (p.sensor?.kind === 'thermistor') lines.push(h.q('sensor.temperature', `${String(p.sensor.temperature).replace('.', h.decimal)} °C`), h.q('sensor.resistance', h.f(p.sensor.resistance, 'Ω')));
  if (p.sensor?.kind === 'ldr') lines.push(h.q('sensor.light', `${String(p.sensor.light).replace('.', h.decimal)} lx`), h.q('sensor.resistance', h.f(p.sensor.resistance, 'Ω')));
  lines.push(h.q('voltage', h.f(p.voltage, 'V')), h.q('current', h.f(p.current, 'A')), h.q('power', h.f(p.power, 'W')));
  if (p.kind === 'LED') lines.push(h.q('brightness', h.t('sim.brightness', { percent: Math.round(p.brightness * 100) })));
  return lines;
}

// The current tag drawn on the board for a two-lead part.
export const currentTag = (r) => (typeof r.current === 'number' ? { label: '', value: Math.abs(r.current), key: 'current' } : null);
