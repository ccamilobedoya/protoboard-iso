# Translating

*[Español](../es/traducir.md)*

There are two things to translate, and they are independent.

## Messages and labels (the program)

1. Copy `src/i18n/en.js` to `src/i18n/<code>.js` (`fr.js`, `pt.js`…).
2. Translate the values. Keep every `{placeholder}` exactly as it is.
3. Set `meta.name` and `meta.decimal` (`','` or `'.'`, used in labels like `4,7 kΩ`).
4. Register it in `src/i18n/index.js`.
5. `npm test` checks that every key and placeholder of English is present.

Missing keys fall back to English, so a partial translation still works.

The longest texts are the ones a learner reads in the page: `describe.*` (what each kind of part
is and how it works inside) and `explain.*` (what each value of the card means), plus `probe.*`
(where each simulated value comes from). A test requires every kind of part to have its
`describe.*` in every registered language.

## A circuit's own texts

A circuit can fix the language of everything made from it with `"lang"` (see SKILL.md,
*Languages*: a language asked for in the call wins, then the circuit's, then the default).

What a circuit says about itself has two formats: a plain string, shown as it is in every
language, or one text per language, `{ "en": "…", "es": "…" }` (for `title` and each part's
`description`). `check` reports (`DESCRIPTION_LANGUAGE`) a per-language description missing one
of the kit's languages.

Keys of the circuit file (`parts`, `value`, `pins`…) and hole names are **not** translated:
the same file works in every language.

## Documentation

1. Copy `docs/en/` to `docs/<code>/` and translate the files. File names may be
   translated too.
2. Add a `README.<code>.md` and a link to it at the top of `README.md`.
3. Each translated page links back to the English one at the top.

English is the reference: when a page changes, update the English version first.
