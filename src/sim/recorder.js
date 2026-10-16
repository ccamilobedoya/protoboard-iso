// A recording of values against time, one ring buffer per key (a part's id; later a node), for
// the oscilloscope (stage 3, phase 7). Bundleable, no DOM. Each sample holds a time and two
// values (a part's voltage and current; NaN for one it does not have).
//
//   const rec = createRecorder(2048)
//   rec.push(key, time, a, b)        a sample; older ones drop out once the buffer is full
//   rec.get(key) → { t, a, b, start, count, size } | null   (sample k is at (start + k) % size)
//   rec.clear()                      forget everything (the circuit switched on again)

export function createRecorder(size = 2048) {
  const series = new Map();
  return {
    push(key, time, a, b) {
      let s = series.get(key);
      if (!s) {
        s = { t: new Float64Array(size), a: new Float64Array(size), b: new Float64Array(size), start: 0, count: 0, size };
        series.set(key, s);
      }
      const k = (s.start + s.count) % size;
      s.t[k] = time;
      s.a[k] = a;
      s.b[k] = b;
      if (s.count < size) s.count++;
      else s.start = (s.start + 1) % size;
    },
    get: (key) => series.get(key) ?? null,
    clear: () => series.clear(),
  };
}

// The samples of one channel (`a` or `b`) between two times, in order: [[t, value], …], with the
// sample just before `from` so a line starts at the window's edge.
export function samplesOf(s, channel, from, to) {
  const out = [];
  if (!s) return out;
  let before = null;
  for (let k = 0; k < s.count; k++) {
    const i = (s.start + k) % s.size;
    const t = s.t[i];
    const v = s[channel][i];
    if (!Number.isFinite(v)) continue;
    if (t < from) {
      before = [t, v];
      continue;
    }
    if (t > to) break;
    if (before) out.push(before), (before = null);
    out.push([t, v]);
  }
  return out;
}
