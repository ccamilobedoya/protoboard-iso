// The caption's face in a recording (stage and video; docs/en/stage-and-video.md, "The caption"):
// Literata 500, Latin subset, under the SIL Open Font License 1.1 (fonts/OFL.txt), embedded in every
// page that has a tour so a video's captions are drawn with the same serif on any machine (a serif
// named only by family fell back to the system's Times). Node only (src/page.js reads the file).

import { readFileSync } from 'node:fs';

export const CAPTION_FAMILY = 'Literata Caption';
let css = null;

// The @font-face rule, the font as a data: URL (about 29 kB). font-display block: a recording
// waits for document.fonts.ready, and a page never shows the fallback for a moment.
export function captionFaceCss() {
  if (css == null) {
    const font = readFileSync(new URL('./fonts/literata-latin-500.woff2', import.meta.url)).toString('base64');
    css = `@font-face { font-family: "${CAPTION_FAMILY}"; font-style: normal; font-weight: 500; font-display: block; src: url(data:font/woff2;base64,${font}) format("woff2"); unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD; }`;
  }
  return css;
}
