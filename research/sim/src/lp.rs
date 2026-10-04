//! Exact zero-sum matrix game solver (dense simplex, Bland's rule).

pub struct Solution {
    /// Value for the row (maximizing) player.
    pub value: f64,
    pub row: Vec<f64>,
    pub col: Vec<f64>,
}

/// Solve max_x min_y x^T M y.
pub fn solve(m: &[Vec<f64>]) -> Solution {
    let rows = m.len();
    let cols = m[0].len();
    let mut lo = f64::INFINITY;
    for r in m {
        for &v in r {
            lo = lo.min(v);
        }
    }
    let shift = 1.0 - lo;
    // Tableau: constraints sum_j A[i][j] w_j + s_i = 1, maximize sum_j w_j.
    let width = cols + rows + 1;
    let mut t = vec![0.0f64; (rows + 1) * width];
    for i in 0..rows {
        for j in 0..cols {
            t[i * width + j] = m[i][j] + shift;
        }
        t[i * width + cols + i] = 1.0;
        t[i * width + width - 1] = 1.0;
    }
    let obj = rows * width;
    for j in 0..cols {
        t[obj + j] = -1.0;
    }
    let mut basis: Vec<usize> = (0..rows).map(|i| cols + i).collect();
    let eps = 1e-11;
    let mut guard = 0;
    loop {
        guard += 1;
        if guard > 100_000 {
            panic!("simplex did not terminate");
        }
        // Bland: smallest index with negative reduced cost.
        let mut enter = usize::MAX;
        for j in 0..cols + rows {
            if t[obj + j] < -eps {
                enter = j;
                break;
            }
        }
        if enter == usize::MAX {
            break;
        }
        let mut leave = usize::MAX;
        let mut best = f64::INFINITY;
        for i in 0..rows {
            let a = t[i * width + enter];
            if a > eps {
                let ratio = t[i * width + width - 1] / a;
                if ratio < best - 1e-12 || (ratio < best + 1e-12 && leave != usize::MAX && basis[i] < basis[leave]) {
                    best = ratio;
                    leave = i;
                }
            }
        }
        assert!(leave != usize::MAX, "unbounded LP");
        let p = t[leave * width + enter];
        for j in 0..width {
            t[leave * width + j] /= p;
        }
        for i in 0..=rows {
            if i == leave {
                continue;
            }
            let f = t[i * width + enter];
            if f.abs() > 0.0 {
                for j in 0..width {
                    t[i * width + j] -= f * t[leave * width + j];
                }
            }
        }
        basis[leave] = enter;
    }
    let z = t[obj + width - 1];
    let mut col = vec![0.0; cols];
    for i in 0..rows {
        if basis[i] < cols {
            col[basis[i]] = t[i * width + width - 1] / z;
        }
    }
    let mut row: Vec<f64> = (0..rows).map(|i| (t[obj + cols + i] / z).max(0.0)).collect();
    let total: f64 = row.iter().sum();
    for v in row.iter_mut() {
        *v /= total;
    }
    Solution { value: 1.0 / z - shift, row, col }
}

/// Pure-strategy bounds: (max_i min_j, min_j max_i). Equal iff a saddle point exists.
pub fn pure_bounds(m: &[Vec<f64>]) -> (f64, f64) {
    let maxmin = m.iter().map(|r| r.iter().cloned().fold(f64::INFINITY, f64::min)).fold(f64::NEG_INFINITY, f64::max);
    let cols = m[0].len();
    let minmax = (0..cols).map(|j| m.iter().map(|r| r[j]).fold(f64::NEG_INFINITY, f64::max)).fold(f64::INFINITY, f64::min);
    (maxmin, minmax)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn rps() {
        let m = vec![vec![0.5, 0.0, 1.0], vec![1.0, 0.5, 0.0], vec![0.0, 1.0, 0.5]];
        let s = solve(&m);
        assert!((s.value - 0.5).abs() < 1e-9);
        for p in s.row.iter().chain(s.col.iter()) {
            assert!((p - 1.0 / 3.0).abs() < 1e-9);
        }
    }
    #[test]
    fn saddle() {
        let m = vec![vec![3.0, 1.0], vec![4.0, 2.0]];
        let s = solve(&m);
        assert!((s.value - 2.0).abs() < 1e-9);
        assert_eq!(pure_bounds(&m), (2.0, 2.0));
    }
    #[test]
    fn matching_pennies_biased() {
        let m = vec![vec![2.0, -1.0], vec![-1.0, 1.0]];
        let s = solve(&m);
        assert!((s.value - 0.2).abs() < 1e-9);
        assert!((s.row[0] - 0.4).abs() < 1e-9);
    }
}
