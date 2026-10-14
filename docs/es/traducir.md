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

Los textos más largos son los que lee quien aprende en la página: `describe.*` (qué es cada tipo
de componente y cómo funciona por dentro) y `explain.*` (qué significa cada valor de la ficha),
además de `probe.*` (de dónde sale cada valor simulado). Una prueba exige que cada tipo de
componente tenga su `describe.*` en todos los idiomas registrados.

## Textos de un circuito

Un circuito puede fijar el idioma de todo lo que se genera a partir de él con `"lang"` (un idioma
pedido en la llamada gana, luego el del circuito y luego el idioma por defecto).

Lo que un circuito dice de sí mismo tiene dos formatos: un texto plano, que se muestra tal cual en
cualquier idioma, o un texto por idioma, `{ "en": "…", "es": "…" }` (para `title` y la
`description` de cada componente). `check` avisa (`DESCRIPTION_LANGUAGE`) cuando a una descripción
por idioma le falta alguno de los idiomas del kit.

Las claves del archivo de circuito (`parts`, `value`, `pins`…) y los nombres de los
agujeros **no** se traducen: el mismo archivo sirve en todos los idiomas.

## Documentación

1. Copia `docs/en/` a `docs/<código>/` y traduce los archivos. Los nombres de archivo
   también se pueden traducir.
2. Agrega un `README.<código>.md` y un enlace a él al principio de `README.md`.
3. Cada página traducida enlaza a la inglesa al principio.

El inglés es la referencia: cuando una página cambia, se actualiza primero la versión en
inglés.
