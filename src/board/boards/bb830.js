// Full-size solderless breadboard, 830 tie points: 63 columns × 10 rows (630) plus four
// power rails of 50 holes (200). Rails run the whole length (not split in the middle).
//
// Row positions are given in pitches from the top edge of the picture (the back of the
// board): 0 is the outer top rail, 17 the outer bottom rail. As on the maintainer's board:
// held upright with column 1 at the top, it reads + − a…e | f…j + − from left to right; lying
// with column 1 on the left, that puts j at the back and a at the front:
//   back  − + j i h g f | e d c b a − +  front
// T rails are the back pair (next to j), B rails the front pair (next to a). If your board
// differs, edit the rows and rails here; nothing else depends on them.

export default {
  id: 'bb830',
  name: { en: 'Full-size breadboard (830 points)', es: 'Protoboard grande (830 puntos)' },
  pitch: 2.54,
  size: { length: 165.1, width: 54.6, height: 8.5 },
  columns: 63,
  rows: [
    { id: 'j', y: 3 },
    { id: 'i', y: 4 },
    { id: 'h', y: 5 },
    { id: 'g', y: 6 },
    { id: 'f', y: 7 },
    { id: 'e', y: 10 },
    { id: 'd', y: 11 },
    { id: 'c', y: 12 },
    { id: 'b', y: 13 },
    { id: 'a', y: 14 },
  ],
  // Each column is split in two strips of five connected holes, across the centre channel.
  strips: [
    { id: 'a-e', rows: ['a', 'b', 'c', 'd', 'e'] },
    { id: 'f-j', rows: ['f', 'g', 'h', 'i', 'j'] },
  ],
  channel: { from: 7, to: 10 },
  rails: [
    { id: 'T-', y: 0, polarity: '-', line: -1 },
    { id: 'T+', y: 1, polarity: '+', line: 1 },
    { id: 'B-', y: 16, polarity: '-', line: -1 },
    { id: 'B+', y: 17, polarity: '+', line: 1 },
  ],
  // Rail holes come in groups of five with one empty position between groups, aligned
  // with the main grid. `split` is the last column of the left half when the rails are
  // cut in the middle (null = continuous).
  railHoles: { firstColumn: 3, group: 5, gap: 1, groups: 10 },
  split: null,
  colors: {
    body: '#f3f1ec',
    channel: '#dedad1',
    hole: '#4b4842',
    print: '#8f897d',
    plus: '#d23b3b',
    minus: '#2f62c2',
  },
};
