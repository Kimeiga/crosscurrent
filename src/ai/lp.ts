const EPS = 1e-11;

/** Simplex tableau for max sum(y) subject to (M + shift) y <= 1, y >= 0, with slack columns and the objective row last. */
function tableau(m: Float64Array, rows: number, cols: number, shift: number, width: number) {
  const t = new Float64Array((rows + 1) * width);
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) t[i * width + j] = m[i * cols + j] + shift;
    t[i * width + cols + i] = 1;
    t[i * width + width - 1] = 1;
  }
  for (let j = 0; j < cols; j++) t[rows * width + j] = -1;
  return t;
}

/** Bland's rule: the first column with a negative reduced cost, or -1 at the optimum. */
function entering(t: Float64Array, objective: number, columns: number) {
  for (let j = 0; j < columns; j++) if (t[objective + j] < -EPS) return j;
  return -1;
}

/** Minimum-ratio row for the entering column; ties go to the lowest basic variable (Bland's rule). */
function leaving(t: Float64Array, rows: number, width: number, enter: number, basis: number[]) {
  let leave = -1;
  let best = Infinity;
  for (let i = 0; i < rows; i++) {
    const a = t[i * width + enter];
    if (a <= EPS) continue;
    const ratio = t[i * width + width - 1] / a;
    const tie = ratio < best + 1e-12 && leave >= 0 && basis[i] < basis[leave];
    if (ratio < best - 1e-12 || tie) { best = ratio; leave = i; }
  }
  return leave;
}

function pivot(t: Float64Array, rows: number, width: number, leave: number, enter: number) {
  const p = t[leave * width + enter];
  for (let j = 0; j < width; j++) t[leave * width + j] /= p;
  for (let i = 0; i <= rows; i++) {
    const f = t[i * width + enter];
    if (i === leave || f === 0) continue;
    for (let j = 0; j < width; j++) t[i * width + j] -= f * t[leave * width + j];
  }
}

/** Optimal strategies from the final tableau: the column player's from the basis, the row player's from the duals. */
function strategies(t: Float64Array, basis: number[], rows: number, cols: number, width: number) {
  const objective = rows * width;
  const z = t[objective + width - 1];
  const col = new Float64Array(cols);
  for (let i = 0; i < rows; i++) if (basis[i] < cols) col[basis[i]] = t[i * width + width - 1] / z;
  const row = new Float64Array(rows);
  let total = 0;
  for (let i = 0; i < rows; i++) { row[i] = Math.max(0, t[objective + cols + i] / z); total += row[i]; }
  for (let i = 0; i < rows; i++) row[i] /= total;
  return { z, row, col };
}

/** Exact zero-sum matrix game solver: dense simplex with Bland's rule.
 * `m` is row-major with `rows * cols` entries, payoffs to the row (maximizing) player. */
export function solveGame(m: Float64Array, rows: number, cols: number): { value: number; row: Float64Array; col: Float64Array } {
  const shift = 1 - Math.min(...m);
  const width = cols + rows + 1;
  const t = tableau(m, rows, cols, shift, width);
  const basis = Array.from({ length: rows }, (_, i) => cols + i);
  for (let guard = 0; guard < 100000; guard++) {
    const enter = entering(t, rows * width, cols + rows);
    if (enter < 0) break;
    const leave = leaving(t, rows, width, enter, basis);
    if (leave < 0) throw new Error('Unbounded game matrix.');
    pivot(t, rows, width, leave, enter);
    basis[leave] = enter;
  }
  const { z, row, col } = strategies(t, basis, rows, cols, width);
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
