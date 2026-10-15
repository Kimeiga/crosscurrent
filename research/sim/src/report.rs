//! Match tallies and printed report lines shared by every game. The log parsers in research/results
//! read these formats, so keep them stable.

use crate::lp;
use std::collections::HashMap;

#[derive(Default, Clone)]
pub struct Tally {
    pub games: u32,
    pub a_wins: u32,
    pub draws: u32,
    pub a_losses: u32,
    pub margin_sum: f64,
    pub seat0_score: f64,
    // comeback: final winner was behind after checkpoint k
    pub behind_cp: [u32; 4],
    pub decided: u32,
    pub lead_changes: u32,
    pub final_cp_decisive: u32,
    // games level on points after turn 12, and how the tiebreak (if any) settled them for A
    pub level: u32,
    pub level_a_wins: u32,
    pub level_a_losses: u32,
    pub kinds: [[u64; 3]; 2],
    pub a_time: f64,
    pub b_time: f64,
}

impl Tally {
    pub fn merge(&mut self, o: &Tally) {
        self.games += o.games;
        self.a_wins += o.a_wins;
        self.draws += o.draws;
        self.a_losses += o.a_losses;
        self.margin_sum += o.margin_sum;
        self.seat0_score += o.seat0_score;
        for i in 0..4 {
            self.behind_cp[i] += o.behind_cp[i];
        }
        self.decided += o.decided;
        self.lead_changes += o.lead_changes;
        self.final_cp_decisive += o.final_cp_decisive;
        self.level += o.level;
        self.level_a_wins += o.level_a_wins;
        self.level_a_losses += o.level_a_losses;
        for p in 0..2 {
            for k in 0..3 {
                self.kinds[p][k] += o.kinds[p][k];
            }
        }
        self.a_time += o.a_time;
        self.b_time += o.b_time;
    }
    pub fn result(&self) -> f64 {
        (self.a_wins as f64 + 0.5 * self.draws as f64) / self.games as f64
    }
    pub fn ci(&self) -> f64 {
        // 95% half-width from per-game result variance
        let n = self.games as f64;
        let mean = self.result();
        let var = (self.a_wins as f64 * (1.0 - mean).powi(2) + self.draws as f64 * (0.5 - mean).powi(2) + self.a_losses as f64 * mean.powi(2)) / (n - 1.0).max(1.0);
        1.96 * (var / n).sqrt()
    }
    /// Record one game: A's result, seat 0's result, A's final margin, and the score after each checkpoint.
    pub fn record(&mut self, res_a: f64, res0: f64, margin: f64, level: bool, cps: &[[i16; 2]]) {
        self.games += 1;
        if res_a > 0.75 {
            self.a_wins += 1;
        } else if res_a < 0.25 {
            self.a_losses += 1;
        } else {
            self.draws += 1;
        }
        self.seat0_score += res0;
        if level {
            self.level += 1;
            if res_a > 0.75 {
                self.level_a_wins += 1;
            } else if res_a < 0.25 {
                self.level_a_losses += 1;
            }
        }
        self.margin_sum += margin;
        if res0 != 0.5 {
            self.decided += 1;
            let winner = if res0 > 0.5 { 0 } else { 1 };
            let mut prev_leader: i32 = -1;
            for (k, s) in cps.iter().enumerate() {
                let d = s[winner] - s[1 - winner];
                if k + 1 < cps.len() && d < 0 && k < 4 {
                    self.behind_cp[k] += 1;
                }
                let leader = if d > 0 { 0 } else if d < 0 { 1 } else { -1 };
                if leader >= 0 && prev_leader >= 0 && leader != prev_leader {
                    self.lead_changes += 1;
                }
                if leader >= 0 {
                    prev_leader = leader;
                }
            }
        }
    }
}

pub fn print_tally(name: &str, a: &str, b: &str, t: &Tally) {
    let n = t.games as f64;
    println!(
        "{:<28} {:>14} vs {:<14} n={:<5} A={:.3}±{:.3}  W/D/L {}/{}/{}  draw={:.1}%  seat0={:.3}  margin={:+.2}  tA={:.2}s tB={:.2}s",
        name,
        a,
        b,
        t.games,
        t.result(),
        t.ci(),
        t.a_wins,
        t.draws,
        t.a_losses,
        100.0 * t.draws as f64 / n,
        t.seat0_score / n,
        t.margin_sum / n,
        t.a_time / n,
        t.b_time / n
    );
}

/// One exactly solved last decision: pure-strategy bounds (max-min, min-max), equilibrium value, the
/// sizes of both equilibrium supports, both action counts, and the row player's result when it picks
/// uniformly at random against a best reply. Rows with NaN bounds stand for sequential decisions.
pub type FinalRow = (f64, f64, f64, usize, usize, usize, usize, f64);

pub fn final_row(m: &[Vec<f64>]) -> FinalRow {
    let (lo, hi) = lp::pure_bounds(m);
    let sol = lp::solve(m);
    let support = |v: &[f64]| v.iter().filter(|p| **p > 1e-6).count();
    // value if row player picked uniformly at random among its legal moves (vs best reply)
    let cols = m[0].len();
    let random_row = (0..cols).map(|j| m.iter().map(|r| r[j]).sum::<f64>() / m.len() as f64).fold(f64::INFINITY, f64::min);
    (lo, hi, sol.value, support(&sol.row), support(&sol.col), m.len(), cols, random_row)
}

pub fn print_final(name: &str, spec: &str, all: &[FinalRow]) {
    let sequential = all.iter().filter(|r| r.0.is_nan()).count();
    let rows: Vec<_> = all.iter().filter(|r| !r.0.is_nan()).cloned().collect();
    println!("    final turns that were sequential: {} of {}", sequential, all.len());
    let n = rows.len() as f64;
    let saddle = rows.iter().filter(|r| (r.1 - r.0).abs() < 1e-9).count() as f64;
    let decided = rows.iter().filter(|r| (r.1 - r.0).abs() < 1e-9 && (r.2 - 0.5).abs() > 0.4).count() as f64;
    let width: f64 = rows.iter().map(|r| r.1 - r.0).sum::<f64>() / n;
    let mixed: Vec<_> = rows.iter().filter(|r| (r.1 - r.0).abs() >= 1e-9).collect();
    let mut hist: HashMap<String, usize> = HashMap::new();
    for r in rows.iter() {
        let key = format!("{:.1}", r.1 - r.0);
        *hist.entry(key).or_default() += 1;
    }
    let mut keys: Vec<_> = hist.into_iter().collect();
    keys.sort();
    let avg_support = mixed.iter().map(|r| (r.3 + r.4) as f64 / 2.0).sum::<f64>() / mixed.len().max(1) as f64;
    let avg_actions = rows.iter().map(|r| (r.5 + r.6) as f64 / 2.0).sum::<f64>() / n;
    let loss_from_random = rows.iter().map(|r| r.2 - r.7).sum::<f64>() / n;
    println!(
        "{:<28} final turn via {:<10} n={} saddle={:.1}% (already decided {:.1}%)  mean guess width={:.3}  mixed support={:.2} of {:.1} actions  NE-minus-random={:.3}  width hist {:?}",
        name,
        spec,
        rows.len(),
        100.0 * saddle / n,
        100.0 * decided / n,
        width,
        avg_support,
        avg_actions,
        loss_from_random,
        keys
    );
}
