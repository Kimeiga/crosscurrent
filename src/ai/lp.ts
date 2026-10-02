/** Exact zero-sum matrix game solver: dense simplex with Bland's rule.
 * `m` is row-major with `rows * cols` entries, payoffs to the row (maximizing) player. */
export function solveGame(m: Float64Array, rows: number, cols: number): { value: number; row: Float64Array; col: Float64Array } {
  let low = Infinity;
  for (let i = 0; i < m.length; i++) if (m[i] < low) low = m[i];
  const shift = 1 - low;
  const width = cols + rows + 1;
  const t = new Float64Array((rows + 1) * width);
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) t[i * width + j] = m[i * cols + j] + shift;
    t[i * width + cols + i] = 1;
    t[i * width + width - 1] = 1;
  }
  const obj = rows * width;
  for (let j = 0; j < cols; j++) t[obj + j] = -1;
  const basis = Array.from({ length: rows }, (_, i) => cols + i);
  const eps = 1e-11;
  for (let guard = 0; guard < 100000; guard++) {
    let enter = -1;
    for (let j = 0; j < cols + rows; j++) if (t[obj + j] < -eps) { enter = j; break; }
    if (enter < 0) break;
    let leave = -1;
    let best = Infinity;
    for (let i = 0; i < rows; i++) {
      const a = t[i * width + enter];
      if (a > eps) {
        const ratio = t[i * width + width - 1] / a;
        if (ratio < best - 1e-12 || (ratio < best + 1e-12 && leave >= 0 && basis[i] < basis[leave])) { best = ratio; leave = i; }
      }
    }
    if (leave < 0) throw new Error('Unbounded game matrix.');
    const p = t[leave * width + enter];
    for (let j = 0; j < width; j++) t[leave * width + j] /= p;
    for (let i = 0; i <= rows; i++) {
      if (i === leave) continue;
      const f = t[i * width + enter];
      if (f !== 0) for (let j = 0; j < width; j++) t[i * width + j] -= f * t[leave * width + j];
    }
    basis[leave] = enter;
  }
  const z = t[obj + width - 1];
  const col = new Float64Array(cols);
  for (let i = 0; i < rows; i++) if (basis[i] < cols) col[basis[i]] = t[i * width + width - 1] / z;
  const row = new Float64Array(rows);
  let total = 0;
  for (let i = 0; i < rows; i++) { row[i] = Math.max(0, t[obj + cols + i] / z); total += row[i]; }
  for (let i = 0; i < rows; i++) row[i] /= total;
  return { value: 1 / z - shift, row, col };
}

/** Pure-strategy bounds [max-min, min-max]; equal exactly when a saddle point exists. */
export function pureBounds(m: Float64Array, rows: number, cols: number): [number, number] {
  let maxmin = -Infinity;
  for (let i = 0; i < rows; i++) {
    let low = Infinity;
    for (let j = 0; j < cols; j++) low = Math.min(low, m[i * cols + j]);
    maxmin = Math.max(maxmin, low);
  }
  let minmax = Infinity;
  for (let j = 0; j < cols; j++) {
    let high = -Infinity;
    for (let i = 0; i < rows; i++) high = Math.max(high, m[i * cols + j]);
    minmax = Math.min(minmax, high);
  }
  return [maxmin, minmax];
}
