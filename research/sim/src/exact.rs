//! Exact solution of small simultaneous-move variants by backward induction:
//! every decision node is solved as a zero-sum matrix game by linear programming.
//! Reports the game value and the win/draw/loss distribution when both players
//! follow the computed equilibrium strategies (one equilibrium; others may exist).

use crate::game::*;
use crate::lp;
use std::collections::HashMap;

#[derive(Clone, Copy, PartialEq, Eq, Hash)]
struct Key {
    turn: u8,
    sides: [Side; 2],
    score: i16,
    tb: i16,
}

pub struct Solver<'a> {
    rules: &'a Rules,
    memo: HashMap<Key, (f64, [f64; 3], u8)>,
    pub nodes: u64,
    pub mixed_nodes: u64,
}

impl<'a> Solver<'a> {
    pub fn new(rules: &'a Rules) -> Self {
        Solver { rules, memo: HashMap::new(), nodes: 0, mixed_nodes: 0 }
    }

    fn key(st: &State) -> Key {
        Key { turn: st.turn, sides: st.sides, score: st.scores[0] - st.scores[1], tb: st.tb[0] - st.tb[1] }
    }

    /// Returns (value for player 0, [P(win0), P(draw), P(win1)], support flag: 1 if mixed somewhere on the equilibrium path at this node).
    pub fn solve(&mut self, st: &State) -> (f64, [f64; 3]) {
        let (v, d, _) = self.solve_inner(st);
        (v, d)
    }

    /// Number of player-0 orders at `st` that guarantee at least the game value against every reply.
    pub fn safe_orders(&mut self, st: &State) -> (usize, usize, f64) {
        let r = self.rules;
        let mut la = ActionList::new();
        let mut lb = ActionList::new();
        r.actions(&st.sides[0], &mut la);
        r.actions(&st.sides[1], &mut lb);
        let (value, _) = self.solve(st);
        let mut safe = 0;
        for i in 0..la.len {
            let worst = (0..lb.len).map(|j| self.solve_inner(&r.resolve(st, la.items[i], lb.items[j])).0).fold(f64::INFINITY, f64::min);
            if worst >= value - 1e-9 {
                safe += 1;
            }
        }
        (safe, la.len, value)
    }

    fn solve_inner(&mut self, st: &State) -> (f64, [f64; 3], u8) {
        let r = self.rules;
        if r.is_terminal(st) {
            let x = r.result(st) as f64;
            let d = if x > 0.75 { [1.0, 0.0, 0.0] } else if x < 0.25 { [0.0, 0.0, 1.0] } else { [0.0, 1.0, 0.0] };
            return (x, d, 0);
        }
        let key = Self::key(st);
        if let Some(&hit) = self.memo.get(&key) {
            return hit;
        }
        let mut la = ActionList::new();
        let mut lb = ActionList::new();
        r.actions(&st.sides[0], &mut la);
        r.actions(&st.sides[1], &mut lb);
        let mut m = vec![vec![0.0; lb.len]; la.len];
        let mut dist = vec![vec![[0.0; 3]; lb.len]; la.len];
        for i in 0..la.len {
            for j in 0..lb.len {
                let child = r.resolve(st, la.items[i], lb.items[j]);
                let (v, d, _) = self.solve_inner(&child);
                m[i][j] = v;
                dist[i][j] = d;
            }
        }
        let (lo, hi) = lp::pure_bounds(&m);
        let (value, x, y, mixed) = if (hi - lo).abs() < 1e-12 {
            // Saddle point: pick one pure optimal pair.
            let i = (0..la.len).find(|&i| m[i].iter().cloned().fold(f64::INFINITY, f64::min) >= lo - 1e-12).unwrap();
            let j = (0..lb.len).find(|&j| (0..la.len).map(|i| m[i][j]).fold(f64::NEG_INFINITY, f64::max) <= hi + 1e-12).unwrap();
            let mut x = vec![0.0; la.len];
            let mut y = vec![0.0; lb.len];
            x[i] = 1.0;
            y[j] = 1.0;
            (lo, x, y, 0u8)
        } else {
            let s = lp::solve(&m);
            (s.value, s.row, s.col, 1u8)
        };
        let mut out = [0.0; 3];
        for i in 0..la.len {
            if x[i] == 0.0 {
                continue;
            }
            for j in 0..lb.len {
                if y[j] == 0.0 {
                    continue;
                }
                for k in 0..3 {
                    out[k] += x[i] * y[j] * dist[i][j][k];
                }
            }
        }
        self.nodes += 1;
        self.mixed_nodes += mixed as u64;
        let result = (value, out, mixed);
        self.memo.insert(key, result);
        result
    }
}
