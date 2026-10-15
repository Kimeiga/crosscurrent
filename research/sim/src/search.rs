//! Simultaneous-move MCTS with regret matching (outcome sampling, after Lanctot et al.), generic over
//! the game so that Crosscurrent and the comparison games are searched by one implementation.
//!
//! Each node keeps both players' cumulative regrets and average strategies. An iteration samples one
//! joint action from the exploration-mixed regret-matching policies, recurses (or expands a child and
//! runs a rollout), and updates regrets with importance-weighted outcome estimates.

use crate::bots::{sample, Rng};

pub trait SimGame {
    type State: Copy;
    type Action: Copy;
    fn is_terminal(&self, s: &Self::State) -> bool;
    /// Result for player 0: 1 win, 0.5 draw, 0 loss.
    fn result(&self, s: &Self::State) -> f64;
    fn legal(&self, s: &Self::State, p: usize, out: &mut Vec<Self::Action>);
    /// The decision at `s` is the last real one, so `last_value` can solve the rest exactly.
    fn is_last(&self, s: &Self::State) -> bool;
    fn last_value(&self, s: &Self::State) -> f64;
    /// The next decision point and an id for the chance outcome. Games without chance return 0
    /// and must not draw from `rng`.
    fn step(&self, s: &Self::State, a: Self::Action, b: Self::Action, rng: &mut Rng) -> (Self::State, u32);
    fn has_chance(&self) -> bool;
    /// One move of the rollout (default) policy for both players, chance included.
    fn rollout_step(&self, s: &Self::State, rng: &mut Rng) -> Self::State;
}

struct Node<S, A> {
    st: S,
    acts: [Vec<A>; 2],
    regret: [Vec<f64>; 2],
    ssum: [Vec<f64>; 2],
    kids: Vec<(u32, u32)>,
    visits: u32,
    total: f64,
}

pub struct Search<S, A> {
    pub iters: u32,
    pub gamma: f64,
    /// Solve the last real decision exactly instead of searching it.
    pub exact_last: bool,
    nodes: Vec<Node<S, A>>,
    pub last_root_value: f64,
}

impl<S: Copy, A: Copy> Search<S, A> {
    pub fn new(iters: u32) -> Self {
        Search { iters, gamma: 0.2, exact_last: false, nodes: Vec::new(), last_root_value: 0.5 }
    }

    fn make_node<G: SimGame<State = S, Action = A>>(&mut self, g: &G, st: S) -> u32 {
        let mut acts: [Vec<A>; 2] = [Vec::new(), Vec::new()];
        if !g.is_terminal(&st) {
            for p in 0..2 {
                g.legal(&st, p, &mut acts[p]);
            }
        }
        let n0 = acts[0].len();
        let n1 = acts[1].len();
        self.nodes.push(Node { st, acts, regret: [vec![0.0; n0], vec![0.0; n1]], ssum: [vec![0.0; n0], vec![0.0; n1]], kids: Vec::new(), visits: 0, total: 0.0 });
        (self.nodes.len() - 1) as u32
    }

    fn policy(regret: &[f64], out: &mut Vec<f64>) {
        out.clear();
        let pos: f64 = regret.iter().map(|r| r.max(0.0)).sum();
        if pos <= 0.0 {
            let u = 1.0 / regret.len() as f64;
            out.extend(std::iter::repeat(u).take(regret.len()));
        } else {
            out.extend(regret.iter().map(|r| r.max(0.0) / pos));
        }
    }

    fn rollout<G: SimGame<State = S, Action = A>>(&self, g: &G, mut st: S, rng: &mut Rng) -> f64 {
        while !g.is_terminal(&st) {
            st = g.rollout_step(&st, rng);
        }
        g.result(&st)
    }

    /// Value of a newly expanded child, from its player-0 point of view.
    fn leaf_value<G: SimGame<State = S, Action = A>>(&self, g: &G, next: S, rng: &mut Rng) -> f64 {
        if g.is_terminal(&next) {
            g.result(&next)
        } else if self.exact_last && g.is_last(&next) {
            g.last_value(&next)
        } else {
            self.rollout(g, next, rng)
        }
    }

    fn iterate<G: SimGame<State = S, Action = A>>(&mut self, g: &G, idx: u32, rng: &mut Rng, buf: &mut [Vec<f64>; 2]) -> f64 {
        let i = idx as usize;
        if g.is_terminal(&self.nodes[i].st) {
            return g.result(&self.nodes[i].st);
        }
        if self.exact_last && g.is_last(&self.nodes[i].st) {
            let v = g.last_value(&self.nodes[i].st);
            self.nodes[i].visits += 1;
            self.nodes[i].total += v;
            return v;
        }
        let mut chosen = [0usize; 2];
        let mut prob = [0f64; 2];
        for p in 0..2 {
            Self::policy(&self.nodes[i].regret[p], &mut buf[p]);
            let n = buf[p].len() as f64;
            let gm = self.gamma;
            for v in buf[p].iter_mut() {
                *v = (1.0 - gm) * *v + gm / n;
            }
            chosen[p] = sample(&buf[p], rng);
            prob[p] = buf[p][chosen[p]];
            // accumulate the regret-matching strategy (without exploration)
            let pos: f64 = self.nodes[i].regret[p].iter().map(|r| r.max(0.0)).sum();
            let len = self.nodes[i].ssum[p].len();
            for k in 0..len {
                let s = if pos <= 0.0 { 1.0 / len as f64 } else { self.nodes[i].regret[p][k].max(0.0) / pos };
                self.nodes[i].ssum[p][k] += s;
            }
        }
        let joint = (chosen[0] * 64 + chosen[1]) as u32;
        let a = self.nodes[i].acts[0][chosen[0]];
        let b = self.nodes[i].acts[1][chosen[1]];
        // A game with chance draws its outcome first: the child is keyed by the joint action and the draw.
        let drawn = if g.has_chance() { Some(g.step(&self.nodes[i].st, a, b, rng)) } else { None };
        let key = joint | drawn.map_or(0, |(_, c)| c << 12);
        let found = self.nodes[i].kids.iter().find(|(k, _)| *k == key).map(|(_, c)| *c);
        let u = match found {
            Some(c) => self.iterate(g, c, rng, buf),
            None => {
                let next = match drawn {
                    Some((st, _)) => st,
                    None => g.step(&self.nodes[i].st, a, b, rng).0,
                };
                let c = self.make_node(g, next);
                self.nodes[i].kids.push((key, c));
                let v = self.leaf_value(g, next, rng);
                self.nodes[c as usize].visits += 1;
                self.nodes[c as usize].total += v;
                v
            }
        };
        let node = &mut self.nodes[i];
        node.visits += 1;
        node.total += u;
        for p in 0..2 {
            let x = if p == 0 { u } else { 1.0 - u };
            let est = x / prob[p];
            for k in 0..node.regret[p].len() {
                let r = if k == chosen[p] { est } else { 0.0 };
                node.regret[p][k] += r - x;
            }
        }
        u
    }

    /// Search and return the root average strategy for `seat`.
    pub fn search<G: SimGame<State = S, Action = A>>(&mut self, g: &G, st: &S, seat: usize, rng: &mut Rng) -> Vec<(A, f64)> {
        self.nodes.clear();
        let root = self.make_node(g, *st);
        let mut buf = [Vec::new(), Vec::new()];
        for _ in 0..self.iters {
            self.iterate(g, root, rng, &mut buf);
        }
        let node = &self.nodes[root as usize];
        self.last_root_value = if node.visits > 0 { node.total / node.visits as f64 } else { 0.5 };
        if seat == 1 {
            self.last_root_value = 1.0 - self.last_root_value;
        }
        let total: f64 = node.ssum[seat].iter().sum();
        node.acts[seat].iter().zip(node.ssum[seat].iter()).map(|(a, s)| (*a, s / total)).collect()
    }
}

/// Final-move rule shared by every search policy: drop root actions below `purify`, then sample.
pub fn purified_choice<A: Copy>(pol: &[(A, f64)], purify: f64, rng: &mut Rng) -> A {
    let mut probs: Vec<f64> = pol.iter().map(|(_, p)| if *p < purify { 0.0 } else { *p }).collect();
    if probs.iter().sum::<f64>() <= 0.0 {
        probs = pol.iter().map(|(_, p)| *p).collect();
    }
    pol[sample(&probs, rng)].0
}
