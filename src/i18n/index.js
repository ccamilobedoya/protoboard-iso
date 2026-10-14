// Translation. To add a language: copy en.js to <code>.js, translate the values,
// and register it below. Missing keys fall back to English.

import en from './en.js';
import es from './es.js';

export const LANGUAGES = { en, es };

export function t(lang, key, params = {}) {
  const dict = LANGUAGES[lang] ?? en;
  const template = dict[key] ?? en[key] ?? key;
  return template.replace(/\{(\w+)\}/g, (_, name) => (params[name] !== undefined ? String(params[name]) : `{${name}}`));
}

export function decimalSeparator(lang) {
  return (LANGUAGES[lang] ?? en).meta.decimal;
}

// The language to write in: the first known one of the candidates, most specific first
// (what was asked for, the circuit's own `lang`, the default), English otherwise.
export function pickLanguage(...candidates) {
  return candidates.find((c) => c && LANGUAGES[c]) ?? 'en';
}
