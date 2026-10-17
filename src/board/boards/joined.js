// Several identical boards joined end to end (real ones snap together by the dovetails on their
// short sides): one board for the kit, with columns numbered straight through (a bb400x2 has
// columns 1–60). Each rail is bridged across every seam by a short jumper the board draws itself,
// from the last rail hole of one board to the first of the next, as you would on the bench; so
// each rail is still one group. The first board keeps the holes of the board alone, so a circuit
// can move from bb400 to bb400x2 without moving anything (unless it used a bridged rail hole).

export function joined(base, count) {
  return {
    ...base,
    id: `${base.id}x${count}`,
    name: { en: `${count} × ${base.name.en}, joined end to end`, es: `${count} × ${base.name.es}, unidas por los extremos` },
    size: { ...base.size, length: base.size.length * count },
    columns: base.columns * count,
    segments: { count, columns: base.columns, length: base.size.length },
  };
}
