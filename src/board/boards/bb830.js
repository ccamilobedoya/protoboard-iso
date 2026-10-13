// Full-size solderless breadboard, 830 tie points: 63 columns × 10 rows (630) plus four
// power rails of 50 holes (200). Rails run the whole length (not split in the middle).
//
// Row positions are given in pitches from the top edge of the picture (the back of the
// board): 0 is the outer top rail, 17 the outer bottom rail. Check the rail order and
// colours against your own board and edit them here; nothing else depends on them.

export default {
  id: 'bb830',
  name: { en: 'Full-size breadboard (830 points)', es: 'Protoboard grande (830 puntos)' },
  pitch: 2.54,
  size: { length: 165.1, width: 54.6, height: 8.5 },
  columns: 63,
  rows: [
    { id: 'a', y: 3 },
    { id: 'b', y: 4 },
    { id: 'c', y: 5 },
    { id: 'd', y: 6 },
    { id: 'e', y: 7 },
    { id: 'f', y: 10 },
    { id: 'g', y: 11 },
    { id: 'h', y: 12 },
    { id: 'i', y: 13 },
    { id: 'j', y: 14 },
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
    { id: 'B+', y: 16, polarity: '+', line: -1 },
    { id: 'B-', y: 17, polarity: '-', line: 1 },
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
