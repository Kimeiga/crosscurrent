//! Policies: random, a port of the shipped TypeScript AI, and SM-MCTS with regret matching.

use crate::game::*;
use crate::lp;

pub struct Rng(u64);
impl Rng {
    pub fn new(seed: u64) -> Self {
        let mut r = Rng(seed.wrapping_mul(0x9E3779B97F4A7C15) ^ 0xD1B54A32D192ED03);
        r.next_u64();
        r
    }
    #[inline]
    pub fn next_u64(&mut self) -> u64 {
        self.0 = self.0.wrapping_add(0x9E3779B97F4A7C15);
        let mut z = self.0;
        z = (z ^ (z >> 30)).wrapping_mul(0xBF58476D1CE4E5B9);
        z = (z ^ (z >> 27)).wrapping_mul(0x94D049BB133111EB);
        z ^ (z >> 31)
    }
    #[inline]
    pub fn f64(&mut self) -> f64 {
        (self.next_u64() >> 11) as f64 / (1u64 << 53) as f64
    }
    #[inline]
    pub fn below(&mut self, n: usize) -> usize {
        (((self.next_u64() >> 32) * n as u64) >> 32) as usize
    }
}

pub trait Policy: Send {
    fn choose(&mut self, rules: &Rules, st: &State, seat: usize, rng: &mut Rng) -> Action;
    fn name(&self) -> String;
}

pub fn sample(probs: &[f64], rng: &mut Rng) -> usize {
    let total: f64 = probs.iter().sum();
    let mut ticket = rng.f64() * total;
    for (i, p) in probs.iter().enumerate() {
        ticket -= p;
        if ticket < 0.0 {
            return i;
        }
    }
    probs.len() - 1
}

// ---------------------------------------------------------------- random

pub struct RandomPolicy;
impl Policy for RandomPolicy {
    fn choose(&mut self, rules: &Rules, st: &State, seat: usize, rng: &mut Rng) -> Action {
        let mut l = ActionList::new();
        rules.legal(st, seat, &mut l);
        l.items[rng.below(l.len)]
    }
    fn name(&self) -> String {
        "random".into()
    }
}

/// Random deploys only (when available): a crude "builder" baseline.
pub struct DeployOnly;
impl Policy for DeployOnly {
    fn choose(&mut self, rules: &Rules, st: &State, seat: usize, rng: &mut Rng) -> Action {
        let mut l = ActionList::new();
        rules.legal(st, seat, &mut l);
        let deploys: Vec<Action> = l.as_slice().iter().copied().filter(|a| a.kind == DEPLOY).collect();
        if deploys.is_empty() { l.items[rng.below(l.len)] } else { deploys[rng.below(deploys.len())] }
    }
    fn name(&self) -> String {
        "deployonly".into()
    }
}

// ---------------------------------------------------------------- shipped AI port

/// Faithful port of src/ai.ts chooseAction (v0.2 heuristic + fictitious play).
pub struct Legacy {
    pub level: u8, // 0 casual, 1 tactical, 2 expert
}

impl Legacy {
    pub fn matrix(rules: &Rules, st: &State, seat: usize) -> (Vec<Action>, Vec<Action>, Vec<Vec<f64>>) {
        let mut la = ActionList::new();
        let mut lb = ActionList::new();
        rules.actions(&st.sides[seat], &mut la);
        rules.actions(&st.sides[1 - seat], &mut lb);
        let turn = st.turn as usize + 1;
        let checkpoint = rules.points[turn] > 0;
        let weight = ((turn + 3) / 4) as f64;
        let phase_distance = ((4 - turn % 4) % 4) as f64;
        struct Plan {
            strengths: [i32; MAXF],
            resources: f64,
            after: [i32; MAXF],
        }
        let plans = |side: &Side, legal: &[Action]| -> Vec<Plan> {
            legal
                .iter()
                .map(|&a| {
                    let (p, rc) = rules.prepare(side, a);
                    let after = rules.finish(&p, rc, checkpoint, &[true; MAXF]);
                    let mut on = [0; MAXF];
                    let mut st_ = [0; MAXF];
                    for f in 0..rules.fronts {
                        on[f] = msum(after.board[f]);
                        st_[f] = msum(p.board[f]);
                    }
                    let resources = msum(after.hand) as f64 * 0.024
                        + after.hand.count_ones() as f64 * 0.045
                        + on.iter().sum::<i32>() as f64 * 0.018;
                    Plan { strengths: st_, resources, after: on }
                })
                .collect()
        };
        let p = plans(&st.sides[seat], la.as_slice());
        let q = plans(&st.sides[1 - seat], lb.as_slice());
        let final_turn = turn == rules.turns as usize;
        let last_pts = rules.points[rules.turns as usize] as i32;
        let m: Vec<Vec<f64>> = p
            .iter()
            .map(|a| {
                q.iter()
                    .map(|b| {
                        if final_turn {
                            let mut margin = (st.scores[seat] - st.scores[1 - seat]) as i32;
                            for f in 0..rules.fronts {
                                margin += last_pts * (a.strengths[f] - b.strengths[f]).signum();
                            }
                            return margin.signum() as f64;
                        }
                        let mut v = a.resources - b.resources;
                        for f in 0..rules.fronts {
                            let d = (a.strengths[f] - b.strengths[f]) as f64;
                            v += if checkpoint {
                                weight * d.signum() * if d == 0.0 { 0.0 } else { 1.0 }
                            } else {
                                weight * 0.72 * (d / (4.0 + phase_distance * 2.0)).tanh()
                            };
                            if checkpoint {
                                v += 0.28 * (((a.after[f] - b.after[f]) as f64) / 5.0).tanh();
                            }
                        }
                        v
                    })
                    .collect()
            })
            .collect();
        (la.as_slice().to_vec(), lb.as_slice().to_vec(), m)
    }
}

impl Policy for Legacy {
    fn choose(&mut self, rules: &Rules, st: &State, seat: usize, rng: &mut Rng) -> Action {
        let mut la = ActionList::new();
        rules.legal(st, seat, &mut la);
        if la.len == 1 {
            return la.items[0];
        }
        if let Some(l) = rules.leader(st) {
            let (own, other, m) = Legacy::matrix(rules, st, seat);
            let pick = |vals: Vec<f64>, rng: &mut Rng| {
                let best = vals.iter().cloned().fold(f64::NEG_INFINITY, f64::max);
                let ties: Vec<usize> = (0..vals.len()).filter(|&i| vals[i] >= best - 1e-9).collect();
                ties[rng.below(ties.len())]
            };
            if seat == l {
                let vals = m.iter().map(|r| r.iter().cloned().fold(f64::INFINITY, f64::min)).collect();
                return own[pick(vals, rng)];
            }
            let lead = st.pending.expect("responder sees the leader's order");
            let j = other.iter().position(|b| *b == lead).unwrap();
            let vals = m.iter().map(|r| r[j]).collect();
            return own[pick(vals, rng)];
        }
        if self.level == 0 && rng.f64() < 0.45 {
            return la.items[rng.below(la.len)];
        }
        let (own, other, m) = Legacy::matrix(rules, st, seat);
        if self.level == 0 {
            let avgs: Vec<f64> = m.iter().map(|r| r.iter().sum::<f64>() / r.len() as f64 + rng.f64() * 0.35).collect();
            let mut best = 0;
            for i in 1..avgs.len() {
                if avgs[i] > avgs[best] {
                    best = i;
                }
            }
            return own[best];
        }
        let iterations = if self.level == 2 { 1800 } else { 280 };
        let mut count = vec![0u32; own.len()];
        let mut ua = vec![0.0f64; own.len()];
        let mut ub = vec![0.0f64; other.len()];
        let mut column = rng.below(other.len());
        for _ in 0..iterations {
            for r in 0..own.len() {
                ua[r] += m[r][column];
            }
            let mut best = 0;
            for r in 1..own.len() {
                if ua[r] + rng.f64() * 1e-9 > ua[best] {
                    best = r;
                }
            }
            count[best] += 1;
            for j in 0..other.len() {
                ub[j] += m[best][j];
            }
            column = 0;
            for j in 1..other.len() {
                if ub[j] + rng.f64() * 1e-9 < ub[column] {
                    column = j;
                }
            }
        }
        let mut ticket = rng.f64() * iterations as f64;
        for r in 0..own.len() {
            ticket -= count[r] as f64;
            if ticket < 0.0 {
                return own[r];
            }
        }
        own[own.len() - 1]
    }
    fn name(&self) -> String {
        format!("legacy{}", ["casual", "tactical", "expert"][self.level as usize])
    }
}

// ---------------------------------------------------------------- SM-MCTS (regret matching)

#[derive(Clone, Copy, PartialEq)]
pub enum Rollout {
    Uniform,
    /// Mostly deploys: with probability p pick a random deploy.
    DeployBias(f32),
}

pub struct Node {
    st: State,
    acts: [Vec<Action>; 2],
    regret: [Vec<f64>; 2],
    ssum: [Vec<f64>; 2],
    kids: Vec<(u16, u32)>,
    visits: u32,
    total: f64,
}

pub struct Mcts {
    pub iters: u32,
    pub gamma: f64,
    pub rollout: Rollout,
    /// Final move: drop average-strategy actions below this probability, then sample.
    pub purify: f64,
    /// Solve the final turn exactly instead of searching it.
    pub exact_last: bool,
    nodes: Vec<Node>,
    pub last_root_value: f64,
    pub last_policy: Vec<(Action, f64)>,
}

impl Mcts {
    pub fn new(iters: u32) -> Self {
        Mcts { iters, gamma: 0.2, rollout: Rollout::DeployBias(0.9), purify: 0.1, exact_last: false, nodes: Vec::new(), last_root_value: 0.5, last_policy: Vec::new() }
    }

    fn make_node(&mut self, rules: &Rules, st: State) -> u32 {
        let mut l = ActionList::new();
        let mut acts: [Vec<Action>; 2] = [Vec::new(), Vec::new()];
        if !rules.is_terminal(&st) {
            for p in 0..2 {
                rules.legal(&st, p, &mut l);
                acts[p] = l.as_slice().to_vec();
            }
        }
        let n0 = acts[0].len();
        let n1 = acts[1].len();
        self.nodes.push(Node {
            st,
            acts,
            regret: [vec![0.0; n0], vec![0.0; n1]],
            ssum: [vec![0.0; n0], vec![0.0; n1]],
            kids: Vec::new(),
            visits: 0,
            total: 0.0,
        });
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

    fn rollout(&self, rules: &Rules, mut st: State, rng: &mut Rng) -> f64 {
        let mut l = ActionList::new();
        while !rules.is_terminal(&st) {
            let mut pick = [Action { kind: 0, card: 0, front: 0 }; 2];
            let fixed = match (rules.leader(&st), st.pending) {
                (Some(l), Some(a)) => Some((l, a)),
                _ => None,
            };
            for p in 0..2 {
                if let Some((l, a)) = fixed {
                    if p == l {
                        pick[p] = a;
                        continue;
                    }
                }
                let side = &st.sides[p];
                let deploy_first = match self.rollout {
                    Rollout::Uniform => false,
                    Rollout::DeployBias(q) => rng.f64() < q as f64,
                };
                if deploy_first && side.hand != 0 {
                    let n = side.hand.count_ones() as usize;
                    let k = rng.below(n);
                    let card = cards(side.hand).nth(k).unwrap();
                    pick[p] = Action { kind: DEPLOY, card, front: rng.below(rules.fronts) as u8 };
                } else {
                    rules.actions(side, &mut l);
                    pick[p] = l.items[rng.below(l.len)];
                }
            }
            st = rules.resolve(&st, pick[0], pick[1]);
        }
        rules.result(&st) as f64
    }

    fn iterate(&mut self, rules: &Rules, idx: u32, rng: &mut Rng, buf: &mut [Vec<f64>; 2]) -> f64 {
        let i = idx as usize;
        if rules.is_terminal(&self.nodes[i].st) {
            return rules.result(&self.nodes[i].st) as f64;
        }
        if self.exact_last && self.nodes[i].st.turn + 1 == rules.turns {
            let v = final_value(rules, &self.nodes[i].st);
            self.nodes[i].visits += 1;
            self.nodes[i].total += v;
            return v;
        }
        let mut chosen = [0usize; 2];
        let mut prob = [0f64; 2];
        for p in 0..2 {
            Mcts::policy(&self.nodes[i].regret[p], &mut buf[p]);
            let n = buf[p].len() as f64;
            let g = self.gamma;
            for v in buf[p].iter_mut() {
                *v = (1.0 - g) * *v + g / n;
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
        let key = (chosen[0] * 64 + chosen[1]) as u16;
        let found = self.nodes[i].kids.iter().find(|(k, _)| *k == key).map(|(_, c)| *c);
        let u = match found {
            Some(c) => self.iterate(rules, c, rng, buf),
            None => {
                let a = self.nodes[i].acts[0][chosen[0]];
                let b = self.nodes[i].acts[1][chosen[1]];
                let next = rules.step(&self.nodes[i].st, a, b);
                let c = self.make_node(rules, next);
                self.nodes[i].kids.push((key, c));
                let v = if rules.is_terminal(&next) {
                    rules.result(&next) as f64
                } else if self.exact_last && next.turn + 1 == rules.turns {
                    final_value(rules, &next)
                } else {
                    self.rollout(rules, next, rng)
                };
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
    pub fn search(&mut self, rules: &Rules, st: &State, seat: usize, rng: &mut Rng) -> Vec<(Action, f64)> {
        self.nodes.clear();
        let root = self.make_node(rules, *st);
        let mut buf = [Vec::new(), Vec::new()];
        for _ in 0..self.iters {
            self.iterate(rules, root, rng, &mut buf);
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

impl Policy for Mcts {
    fn choose(&mut self, rules: &Rules, st: &State, seat: usize, rng: &mut Rng) -> Action {
        if self.exact_last && st.turn + 1 == rules.turns {
            return exact_final_choice(rules, st, seat, rng);
        }
        let pol = self.search(rules, st, seat, rng);
        let mut probs: Vec<f64> = pol.iter().map(|(_, p)| if *p < self.purify { 0.0 } else { *p }).collect();
        if probs.iter().sum::<f64>() <= 0.0 {
            probs = pol.iter().map(|(_, p)| *p).collect();
        }
        self.last_policy = pol.clone();
        pol[sample(&probs, rng)].0
    }
    fn name(&self) -> String {
        format!("mcts{}{}", self.iters, if self.exact_last { "x" } else { "" })
    }
}

// ---------------------------------------------------------------- exact endgame

/// Exact matrix (player-0 result) for the final turn.
pub fn final_matrix(rules: &Rules, st: &State) -> (Vec<Action>, Vec<Action>, Vec<Vec<f64>>) {
    let mut la = ActionList::new();
    let mut lb = ActionList::new();
    rules.actions(&st.sides[0], &mut la);
    rules.actions(&st.sides[1], &mut lb);
    // Generic but fast path: the final result depends on prepared strengths, plus
    // the post-turn hand for the hand tiebreak. Verified against full resolve in debug.
    let fast = rules.award == Award::PerFront && rules.points[rules.turns as usize] > 0 && rules.tiebreak != Tiebreak::Hand && rules.tiebreak != Tiebreak::FinalFronts && rules.tiebreak != Tiebreak::EarlierLead;
    let m: Vec<Vec<f64>> = if fast {
        let pts = rules.points[rules.turns as usize] as i32;
        let plan = |side: &Side, a: Action| {
            let (p, _) = rules.prepare(side, a);
            let mut s = [0i32; MAXF];
            for f in 0..rules.fronts {
                s[f] = msum(p.board[f]);
            }
            s
        };
        let pa: Vec<[i32; MAXF]> = la.as_slice().iter().map(|&a| plan(&st.sides[0], a)).collect();
        let pb: Vec<[i32; MAXF]> = lb.as_slice().iter().map(|&b| plan(&st.sides[1], b)).collect();
        let base = (st.scores[0] - st.scores[1]) as i32;
        let tbase = (st.tb[0] - st.tb[1]) as i32;
        pa.iter()
            .map(|a| {
                pb.iter()
                    .map(|b| {
                        let mut d = base;
                        let mut tb = if rules.tiebreak == Tiebreak::FinalStrength { 0 } else { tbase };
                        for f in 0..rules.fronts {
                            d += pts * (a[f] - b[f]).signum();
                            tb += a[f] - b[f];
                        }
                        if d > 0 {
                            1.0
                        } else if d < 0 {
                            0.0
                        } else if (rules.tiebreak == Tiebreak::TotalStrength || rules.tiebreak == Tiebreak::FinalStrength) && tb != 0 {
                            if tb > 0 { 1.0 } else { 0.0 }
                        } else {
                            0.5
                        }
                    })
                    .collect()
            })
            .collect()
    } else {
        la.as_slice()
            .iter()
            .map(|&a| lb.as_slice().iter().map(|&b| rules.result(&rules.resolve(st, a, b)) as f64).collect())
            .collect()
    };
    #[cfg(debug_assertions)]
    for (i, &a) in la.as_slice().iter().enumerate() {
        for (j, &b) in lb.as_slice().iter().enumerate() {
            assert_eq!(m[i][j], rules.result(&rules.resolve(st, a, b)) as f64);
        }
    }
    (la.as_slice().to_vec(), lb.as_slice().to_vec(), m)
}

pub fn final_value(rules: &Rules, st: &State) -> f64 {
    let (la, lb, m) = final_matrix(rules, st);
    match (rules.leader(st), st.pending) {
        (Some(0), Some(lead)) => {
            let i = la.iter().position(|a| *a == lead).unwrap();
            m[i].iter().cloned().fold(f64::INFINITY, f64::min)
        }
        (Some(_), Some(lead)) => {
            let j = lb.iter().position(|b| *b == lead).unwrap();
            m.iter().map(|r| r[j]).fold(f64::NEG_INFINITY, f64::max)
        }
        (Some(l), None) => {
            let (lo, hi) = lp::pure_bounds(&m);
            if l == 0 { lo } else { hi }
        }
        (None, _) => {
            let (lo, hi) = lp::pure_bounds(&m);
            if (hi - lo).abs() < 1e-12 {
                return lo;
            }
            lp::solve(&m).value
        }
    }
}

fn pick_best(vals: &[f64], rng: &mut Rng) -> usize {
    let best = vals.iter().cloned().fold(f64::NEG_INFINITY, f64::max);
    let ties: Vec<usize> = (0..vals.len()).filter(|&i| vals[i] >= best - 1e-9).collect();
    ties[rng.below(ties.len())]
}

pub fn exact_final_choice(rules: &Rules, st: &State, seat: usize, rng: &mut Rng) -> Action {
    let (a, b, m) = final_matrix(rules, st);
    match rules.leader(st) {
        None => {
            let s = lp::solve(&m);
            if seat == 0 { a[sample(&s.row, rng)] } else { b[sample(&s.col, rng)] }
        }
        Some(l) => {
            if seat != l && st.pending.is_none() {
                return WAIT_ACTION;
            }
            if seat == l && st.pending.is_some() {
                return WAIT_ACTION;
            }
            if seat == 0 {
                let vals: Vec<f64> = match st.pending {
                    None => m.iter().map(|r| r.iter().cloned().fold(f64::INFINITY, f64::min)).collect(),
                    Some(lead) => {
                        let j = b.iter().position(|x| *x == lead).unwrap();
                        m.iter().map(|r| r[j]).collect()
                    }
                };
                a[pick_best(&vals, rng)]
            } else {
                let vals: Vec<f64> = match st.pending {
                    None => (0..b.len()).map(|j| -m.iter().map(|r| r[j]).fold(f64::NEG_INFINITY, f64::max)).collect(),
                    Some(lead) => {
                        let i = a.iter().position(|x| *x == lead).unwrap();
                        m[i].iter().map(|v| -v).collect()
                    }
                };
                b[pick_best(&vals, rng)]
            }
        }
    }
}

pub struct ExactLast<P: Policy> {
    pub inner: P,
}
impl<P: Policy> Policy for ExactLast<P> {
    fn choose(&mut self, rules: &Rules, st: &State, seat: usize, rng: &mut Rng) -> Action {
        if st.turn + 1 == rules.turns {
            exact_final_choice(rules, st, seat, rng)
        } else {
            self.inner.choose(rules, st, seat, rng)
        }
    }
    fn name(&self) -> String {
        format!("{}+exact", self.inner.name())
    }
}

/// Simple fixed strategies used to probe for dominant or degenerate play.
pub struct Scripted {
    pub style: &'static str,
}
impl Policy for Scripted {
    fn choose(&mut self, rules: &Rules, st: &State, seat: usize, rng: &mut Rng) -> Action {
        let mut l = ActionList::new();
        rules.legal(st, seat, &mut l);
        if l.len == 1 {
            return l.items[0];
        }
        let me = &st.sides[seat];
        let them = &st.sides[1 - seat];
        let deploys: Vec<Action> = l.as_slice().iter().copied().filter(|a| a.kind == DEPLOY).collect();
        if deploys.is_empty() {
            return l.items[rng.below(l.len)];
        }
        let margin = |f: usize| msum(me.board[f]) - msum(them.board[f]);
        let worst = (0..rules.fronts).min_by_key(|&f| (margin(f), rng.below(8))).unwrap() as u8;
        let best = (0..rules.fronts).max_by_key(|&f| (margin(f), rng.below(8))).unwrap() as u8;
        let low = lowest(me.hand);
        let high = highest(me.hand);
        match self.style {
            // Everything on one front.
            "onefront" => Action { kind: DEPLOY, card: high, front: 0 },
            // Cheapest card where we are furthest behind.
            "lowfirst" => Action { kind: DEPLOY, card: low, front: worst },
            // Biggest card where we are furthest behind.
            "highfirst" => Action { kind: DEPLOY, card: high, front: worst },
            // Biggest card where we already lead (overkill).
            "pile" => Action { kind: DEPLOY, card: high, front: best },
            // Copy the opponent's previous order if legal.
            "mirror" => {
                let prev = st.last[1 - seat];
                let candidates: Vec<Action> = l.as_slice().iter().copied().filter(|a| a.card == prev).collect();
                if candidates.is_empty() { deploys[rng.below(deploys.len())] } else { candidates[rng.below(candidates.len())] }
            }
            _ => deploys[rng.below(deploys.len())],
        }
    }
    fn name(&self) -> String {
        self.style.to_string()
    }
}

pub fn make_policy(spec: &str) -> Box<dyn Policy> {
    let parts: Vec<&str> = spec.split(':').collect();
    match parts[0] {
        "random" => Box::new(RandomPolicy),
        "onefront" => Box::new(Scripted { style: "onefront" }),
        "lowfirst" => Box::new(Scripted { style: "lowfirst" }),
        "highfirst" => Box::new(Scripted { style: "highfirst" }),
        "pile" => Box::new(Scripted { style: "pile" }),
        "mirror" => Box::new(Scripted { style: "mirror" }),
        "deployonly" => Box::new(DeployOnly),
        "casual" => Box::new(Legacy { level: 0 }),
        "tactical" => Box::new(Legacy { level: 1 }),
        "expert" => Box::new(Legacy { level: 2 }),
        "tacticalx" => Box::new(ExactLast { inner: Legacy { level: 1 } }),
        "mcts" | "mctsx" => {
            let mut m = Mcts::new(parts.get(1).map(|s| s.parse().unwrap()).unwrap_or(1000));
            m.exact_last = parts[0] == "mctsx";
            for opt in parts.iter().skip(2) {
                if let Some(v) = opt.strip_prefix('g') {
                    m.gamma = v.parse().unwrap();
                } else if let Some(v) = opt.strip_prefix('p') {
                    m.purify = v.parse().unwrap();
                } else if let Some(v) = opt.strip_prefix('d') {
                    m.rollout = Rollout::DeployBias(v.parse().unwrap());
                } else if *opt == "u" {
                    m.rollout = Rollout::Uniform;
                }
            }
            Box::new(m)
        }
        _ => panic!("unknown policy {spec}"),
    }
}
