// Translation. To add a language: copy en.js to <code>.js, translate the values,
// and register it below. Missing keys fall back to English.

import en from './en.js';
import es from './es.js';
import { BRIGHTNESS_OVER } from '../sim/models.js';

export const LANGUAGES = { en, es };

export function t(lang, key, params = {}) {
  const dict = LANGUAGES[lang] ?? en;
  // A brightness far above 100 % (the rated current) is said in words, whoever asks for the percentage.
  const name = key === 'sim.brightness' && params.percent > BRIGHTNESS_OVER * 100 ? 'sim.brightness.over' : key;
  const template = dict[name] ?? en[name] ?? key;
  return template.replace(/\{(\w+)\}/g, (_, name) => {
    // `{effect}` ends a damage line: what happens to the part, from `effect.<key>` (it starts with ": ");
    // a stress with no effect ends the sentence.
    if (name === 'effect') return params.effect ? dict[`effect.${params.effect}`] ?? en[`effect.${params.effect}`] ?? '.' : '.';
    return params[name] !== undefined ? String(params[name]) : `{${name}}`;
  });
}

export function decimalSeparator(lang) {
  return (LANGUAGES[lang] ?? en).meta.decimal;
}

// The language to write in: the first known one of the candidates, most specific first
// (what was asked for, the circuit's own `lang`, the default), English otherwise.
export function pickLanguage(...candidates) {
  return candidates.find((c) => c && LANGUAGES[c]) ?? 'en';
}
