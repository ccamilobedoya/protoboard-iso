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
