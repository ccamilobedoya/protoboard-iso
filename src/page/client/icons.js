// Line icons of the page's bar, menu and zoom buttons (16 × 16, stroked in the colour of the text;
// a zero-length segment with round caps draws a dot). Shared by page.js (Node, the bar) and the
// page's script (the time buttons), so it holds plain strings only.

export const ICONS = {
  in: 'M8 3v10M3 8h10',
  out: 'M3 8h10',
  fit: 'M6 2v4H2M10 2v4h4M6 14v-4H2M10 14v-4h4',
  full: 'M2 6V2h4M10 2h4v4M14 10v4h-4M6 14H2v-4',
  flip: 'M2.5 6.5A5.5 5.5 0 0 1 12.6 4M13.5 9.5A5.5 5.5 0 0 1 3.4 12M12.8 1.6v2.6h-2.6M3.2 14.4v-2.6h2.6',
  board: 'M1.5 4h13v8h-13zM4 6.5v0M6.7 6.5v0M9.3 6.5v0M12 6.5v0M4 9.5v0M6.7 9.5v0M9.3 9.5v0M12 9.5v0',
  labels: 'M2 3.5h6.5L13 8l-4.5 4.5H2zM5 8v0',
  current: 'M9 1.5 3.5 9H8l-1 5.5L12.5 7H8z',
  play: 'M5 3l8 5-8 5z',
  pause: 'M5.5 3v10M10.5 3v10',
  restart: 'M3 8a5 5 0 1 0 1.6-3.7M3 2.5v3h3',
  more: 'M3.5 8v0M8 8v0M12.5 8v0',
  warning: 'M8 2l6.5 11.5h-13zM8 6.5v3M8 11.6v0',
};

export const iconSvg = (name) => `<svg class="icon" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="${ICONS[name]}"/></svg>`;
