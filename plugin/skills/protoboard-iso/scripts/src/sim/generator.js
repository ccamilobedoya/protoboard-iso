// The signal generator (stage 3, phase 8): a supply whose voltage changes with time, like the
// generator output of a bench oscilloscope. Bundleable: the engine sets the source to `waveAt`
// before each time step, in Node and in the page.
//
// The waves are Falstad's (VoltageElm), so a circuit exported there runs the same signal:
//   sine      offset + amplitude · sin(2π f t)                      starts at the offset, rising
//   square    offset ± amplitude, high for the first half period    starts high
//   triangle  offset − amplitude → offset + amplitude at half period → back   starts at the bottom
// `amplitude` is the peak (half of peak to peak), as on Falstad's and most generators' dials.

export const WAVEFORMS = ['sine', 'square', 'triangle'];

// Falstad's waveform numbers (VoltageElm.WF_*).
export const FALSTAD_WAVEFORM = { sine: 1, square: 2, triangle: 3 };

export function waveAt({ waveform = 'sine', frequency, amplitude, offset = 0 }, t) {
  const phase = (frequency * t) % 1; // 0 … 1 within the period
  const p = phase < 0 ? phase + 1 : phase;
  switch (waveform) {
    case 'square':
      return offset + (p < 0.5 ? amplitude : -amplitude);
    case 'triangle':
      return offset + amplitude * (p < 0.5 ? 4 * p - 1 : 3 - 4 * p);
    default:
      return offset + amplitude * Math.sin(2 * Math.PI * p);
  }
}

// The largest voltage it reaches, either way (the conductor colours end there).
export const peakOf = (g) => Math.abs(g.offset ?? 0) + Math.abs(g.amplitude);
