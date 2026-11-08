// Sensor formulas: how a sensor's resistance follows what it senses. No imports, so the
// browser engine can bundle them (stage 3: sliders for light and temperature re-solve with them).

// NTC thermistor: R(T) = R25 · exp(B · (1/T − 1/298.15 K)), T in kelvin.
export function ntcResistance({ r25, beta }, celsius) {
  return r25 * Math.exp(beta * (1 / (celsius + 273.15) - 1 / 298.15));
}

// Photoresistor (CdS, GL55xx series): R = R10 · (lux / 10)^−γ, never above the dark resistance.
// From the GL55 datasheet table: resistance at 10 lux (middle of the range), γ, dark resistance.
export const LDR_PARTS = {
  GL5516: { r10: 7.5e3, gamma: 0.6, dark: 0.5e6 },
  GL5528: { r10: 15e3, gamma: 0.7, dark: 1e6 },
  GL5537: { r10: 25e3, gamma: 0.7, dark: 2e6 },
  GL5539: { r10: 40e3, gamma: 0.8, dark: 5e6 },
  GL5549: { r10: 90e3, gamma: 0.8, dark: 10e6 },
};
export function ldrResistance({ r10, gamma, dark }, lux) {
  if (!(lux > 0)) return dark;
  const lit = r10 * (lux / 10) ** -gamma;
  return 1 / (1 / lit + 1 / dark);
}

// ── LM393 sensor modules (family F3): one board, eight sensing elements ──────────────────────────
// The common board (a divider of 10 kΩ over the element, a trimmer for the reference, an LM393 whose
// open collector pulls DO low, a 10 kΩ pull-up and two LEDs) is src/sim/devices/sensor-module.js; this
// table is what differs per part number: its pins as the board prints them (`print`; the pin names
// are the kit's, A0/D0 read as AO/DO), the fields of the environment it senses, its element and the
// parameters of that element. Tags: [D] datasheet, [T] typical (resellers, community, bench
// observations), [A] assumed by the model (no source; the reference checks pin them down).
//   field     the stimulus each field gives, the part's own name for it when it differs (`own`)
//   element   comb | probe | ldr | slot | reflective | hall | vibration | obstacle
//   trim      the trimmer's total (3362 10 kΩ, or 3296W 100 kΩ)
//   glyph     the sensing element drawn on top of the board (src/parts/packages/sensor-module.js)
export const SENSOR_MODULES = {
  // Raindrops comb board: dry, the comb is open (board leakage, 10 MΩ [A]); a water film over the whole
  // comb 5 kΩ [A] (tap water; real ones span 1 to 100 kΩ). R = Rdry^(1 − w) · Rwet^w, w the wet share.
  'MH-RD': { pins: ['VCC', 'GND', 'AO', 'DO'], senses: ['rain'], own: { rain: 'wetness' }, element: 'comb', glyph: 'comb', trim: 10e3, model: { rDry: 10e6, rWet: 5e3 } },
  // Soil fork: two bare electrodes; R by moisture, log-linear between the points [A, shaped on the usual
  // 10-bit readings with a 10 kΩ upper resistor].
  'YL-69': { pins: ['AO', 'DO', 'GND', 'VCC'], senses: ['moisture'], element: 'probe', glyph: 'fork', trim: 10e3, model: { curve: [[0, 5e6], [10, 100e3], [40, 17e3], [70, 8e3], [100, 4.7e3]] } },
  // Digital light module: a GL5528 [D for the GL55 table; A for the module, whose LDR is not marked]
  // on the low side, so DO goes low in the light. No AO pin: AO is inside.
  'LDR-LM393': { pins: ['DO', 'GND', 'VCC'], senses: ['light'], element: 'ldr', glyph: 'ldr', trim: 10e3, model: { ldr: 'GL5528' } },
  // Optical slot ("speed sensor"): an IR LED through 150 Ω [A] facing a phototransistor across the slot,
  // 3 mA collector current with the beam clear at 25 mA [A], 0.1 µA dark [A]. `beam` 1 = blocked; a
  // per-part `transmittance` (paper 0.3, cardstock 0.02 [A]) and an encoder disc (`slots`, `duty`) on
  // the environment's `angle` are optional.
  'SLOT-IR': { pins: ['AO', 'DO', 'GND', 'VCC'], print: ['A0', 'D0', 'GND', 'VCC'], senses: ['beam'], element: 'slot', glyph: 'slot', trim: 10e3, model: { icOn: 3e-3, dark: 1e-7 } },
  // TCRT5000 line follower: Ic = surface · Ipk · g(d) · IF / 25 mA, Ipk 2 mA [A], g read by eye from the
  // Vishay plot (peak at 2–3 mm) [A], distance in mm (the field is in cm).
  'TCRT5000-M': { pins: ['AO', 'DO', 'GND', 'VCC'], print: ['A0', 'D0', 'GND', 'VCC'], senses: ['distance', 'reflectance'], element: 'reflective', glyph: 'tcrt', trim: 10e3, model: { ipk: 2e-3, curve: [[0, 0], [1, 0.55], [2.5, 1], [5, 0.75], [10, 0.35], [15, 0.12], [20, 0.05], [30, 0.01]] } },
  // KY-024 with an A3144 Hall switch (the kit's board; sold with a linear one too): a latch, on at
  // BOP 160 G, off at BRP 105 G [A: midpoints of the Allegro bounds], south pole positive; its output
  // a saturated NPN, 0.08 V + 16 Ω · I [D: 0.4 V at 20 mA], 25 mA at most [D], 4.4 mA of its own [A],
  // specified from 4.5 V [D]. Trimmer 3296W 100 kΩ.
  'KY-024': { pins: ['DO', 'VCC', 'GND', 'AO'], print: ['DO', '+', 'G', 'AO'], senses: ['field'], element: 'hall', glyph: 'hall', trim: 100e3, model: { bop: 160, brp: 105, vsat: 0.08, rsat: 16, own: 4.4e-3, maxOutput: 0.025, minSupply: 4.5 } },
  // SW-420: a normally-closed spring contact, 10 Ω closed [A, as the ball tilt switch]; shaken, it
  // chatters (period 10 ms ± 50 %, open 40 % of each cell, settling one cell after the shaking stops [A]).
  'SW-420-M': { pins: ['DO', 'GND', 'VCC'], senses: ['vibration'], element: 'vibration', glyph: 'can', trim: 10e3, active: 'high', model: { contact: 10, period: 10e-3, jitter: 0.5, open: 0.4 } },
  // FC-51 obstacle: IR LED and receiver side by side; Ic = surface · Ipk / (1 + (d / d0)²) · IF / 25 mA,
  // Ipk 0.5 mA, d0 10 cm [A, so the trimmer spans the 2–30 cm resellers quote]. OUT is its DO.
  'FC-51': { pins: ['OUT', 'GND', 'VCC'], senses: ['distance', 'reflectance'], element: 'obstacle', glyph: 'ir-pair', trim: 10e3, do: 'OUT', model: { ipk: 0.5e-3, d0: 10 } },
};
// Every module (the board's own parts): the divider's 10 kΩ, the 10 kΩ pull-up on DO [T]; both LEDs
// behind 1 kΩ, Vf 2.0 V [A]; the LM393's open collector (60 Ω, 20 mA: models.js); the board rated
// 3.3–5 V (5.5 V at most [T]), the LM393 from 2 V [D]; the IR LEDs of the optical ones behind 150 Ω with
// a flat 1.25 V [A, the TCRT5000's Vf at 60 mA: 25 mA at 5 V, 72 mA at 12 V], 60 mA at most [D].
export const MODULE_BOARD = { rFixed: 10e3, rPullup: 10e3, rLed: 1e3, ledVf: 2.0, irSeries: 150, irVf: 1.25, irRef: 25e-3, irMax: 0.06, maxSupply: 5.5, minSupply: 2.0, maxReverse: 0.3 };

// Straight lines between [x, y] points (the last one held past the ends); `log` interpolates y by ratios.
function curveAt(points, x, log = false) {
  if (x <= points[0][0]) return points[0][1];
  for (let i = 1; i < points.length; i++) {
    const [[x0, y0], [x1, y1]] = [points[i - 1], points[i]];
    if (x <= x1) {
      const k = (x - x0) / (x1 - x0);
      return log ? y0 * (y1 / y0) ** k : y0 + (y1 - y0) * k;
    }
  }
  return points.at(-1)[1];
}

// The resistance of a resistive element (comb, probe, LDR) at its stimulus.
export function moduleResistance(element, model, stim) {
  if (element === 'comb') {
    const w = Math.min(1, Math.max(0, Number(stim.rain) || 0));
    return model.rDry ** (1 - w) * model.rWet ** w;
  }
  if (element === 'probe') return curveAt(model.curve, Math.min(100, Math.max(0, stim.moisture)), true);
  return ldrResistance(LDR_PARTS[model.ldr] ?? LDR_PARTS.GL5528, stim.light);
}

// The light a phototransistor would give with its LED at the reference current (25 mA), in amperes:
// the slot's beam (or an encoder disc's tooth), the reflection of a surface at a distance.
export function moduleLight(element, model, stim) {
  const surface = Math.min(1, Math.max(0, (stim.reflectance ?? 80) / 100));
  if (element === 'slot') {
    let clear = !Number(stim.beam);
    if (model.slots > 0) {
      const pitch = 360 / model.slots;
      clear = (((stim.angle ?? 0) % pitch) + pitch) % pitch < (model.duty ?? 0.5) * pitch;
    }
    return clear ? model.icOn * Math.min(1, Math.max(0, model.transmittance ?? 1)) : 0;
  }
  if (element === 'reflective') {
    // The curve is in mm and ends where the sensor sees nothing (30 mm): 0 beyond.
    const mm = Math.max(0, stim.distance) * 10;
    return mm > model.curve.at(-1)[0] ? 0 : surface * model.ipk * curveAt(model.curve, mm);
  }
  return (surface * model.ipk) / (1 + (Math.max(0, stim.distance) / model.d0) ** 2);
}
