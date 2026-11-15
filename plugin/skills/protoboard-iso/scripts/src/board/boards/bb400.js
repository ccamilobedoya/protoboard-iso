// Half-size breadboard, 400 tie points: 30 columns × 10 rows (300) plus four rails of
// 25 holes (100).

import bb830 from './bb830.js';

export default {
  ...bb830,
  id: 'bb400',
  name: { en: 'Half-size breadboard (400 points)', es: 'Protoboard mediana (400 puntos)' },
  size: { length: 82.5, width: 54.6, height: 8.5 },
  columns: 30,
  railHoles: { firstColumn: 2, group: 5, gap: 1, groups: 5 },
};
