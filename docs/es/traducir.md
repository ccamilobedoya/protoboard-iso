# Traducir

*[English](../en/translating.md)*

Hay dos cosas que traducir, y son independientes.

## Mensajes y etiquetas (el programa)

1. Copia `src/i18n/en.js` a `src/i18n/<código>.js` (`fr.js`, `pt.js`…).
2. Traduce los valores. Deja cada `{marcador}` exactamente igual.
3. Define `meta.name` y `meta.decimal` (`','` o `'.'`, se usa en etiquetas como `4,7 kΩ`).
4. Regístralo en `src/i18n/index.js`.
5. `npm test` comprueba que estén todas las claves y marcadores del inglés.

Las claves que faltan se toman del inglés, así que una traducción parcial ya funciona.

Las claves del archivo de circuito (`parts`, `value`, `pins`…) y los nombres de los
agujeros **no** se traducen: el mismo archivo sirve en todos los idiomas.

## Documentación

1. Copia `docs/en/` a `docs/<código>/` y traduce los archivos. Los nombres de archivo
   también se pueden traducir.
2. Agrega un `README.<código>.md` y un enlace a él al principio de `README.md`.
3. Cada página traducida enlaza a la inglesa al principio.

El inglés es la referencia: cuando una página cambia, se actualiza primero la versión en
inglés.
