// The board layout as one readable line (inspect, create_circuit, catalog).

import { t } from '../i18n/index.js';

export function formatBoardLayout(layout, lang = 'en') {
  const strips = layout.strips.map((s) => t(lang, 'board.strip', { rows: s.rows, rails: s.rails.join(t(lang, 'board.and')) })).join(t(lang, 'board.and'));
  const split = layout.split ? t(lang, 'board.split', { split: layout.split }) : '';
  const text = t(lang, 'board.layout', { id: layout.id, columns: layout.columns, strips, rails: layout.rails.join(', '), railColumns: layout.railColumns, split });
  return layout.elastic ? `${text} ${t(lang, 'board.elastic')}` : text;
}
