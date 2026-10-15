//! GOPS (Game of Pure Strategy, also called Goofspiel), measured with the same search bot and the same
//! report lines as Crosscurrent. Each player holds cards 1..=n. Each round a prize card is revealed,
//! both players bid one card in secret, and the higher bid scores the prize's value; bids are spent.
//! Standard rules: the prize cards are shuffled and a tied round scores for nobody.
//!
//! Variants (joined with '+'): `gops` standard; `asc` / `desc` reveal the prizes in a fixed, known order
//! (no chance at all); `carry` adds a tied prize to the next round's; `nN` plays with N cards.

use crate::bots::{sample, Rng};
use crate::game::{bit, cards, highest, lowest};
use crate::lp;
use crate::report::{final_row, print_final, print_tally, FinalRow, Tally};
use crate::search::{purified_choice, Search, SimGame};
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::time::Instant;

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Order {
    /// Standard: prizes revealed in random order.
    Shuffled,
    /// Prizes revealed in ascending order, known to both players: no chance.
    Ascending,
    /// Prizes revealed in descending order, known to both players: no chance.
    Descending,
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Ties {
    /// Standard: a tied round scores for nobody.
    Discard,
    /// The tied prize is added to the next round's prize.
    Carry,
}

#[derive(Clone, Debug)]
pub struct Gops {
    pub name: String,
    pub n: u8,
    pub order: Order,
    pub ties: Ties,
}

#[derive(Clone, Copy, PartialEq, Eq, Hash, Debug)]
pub struct GState {
    pub round: u8,
    pub hands: [u16; 2],
    /// Prizes not yet revealed.
    pub deck: u16,
    /// This round's prize (0 once the game is over).
    pub prize: u8,
    /// Value carried from tied rounds (Ties::Carry).
    pub pot: u8,
    pub scores: [i16; 2],
}

pub fn is_gops(name: &str) -> bool {
    name.split('+').next() == Some("gops")
}

pub fn variant(name: &str) -> Gops {
    let mut g = Gops { name: name.to_string(), n: 13, order: Order::Shuffled, ties: Ties::Discard };
    for part in name.split('+').skip(1) {
        match part {
            "asc" => g.order = Order::Ascending,
            "desc" => g.order = Order::Descending,
            "carry" => g.ties = Ties::Carry,
            other => match other.strip_prefix('n') {
                Some(v) => g.n = v.parse().expect("nN"),
                None => panic!("unknown GOPS variant part {other}"),
            },
        }
    }
    assert!((2..=13).contains(&g.n), "GOPS needs 2 to 13 cards");
    g
}

impl Gops {
    fn full(&self) -> u16 {
        ((1u32 << self.n) - 1) as u16
    }

    /// The next prize. A forced draw (a fixed order, or one card left) uses no randomness.
    fn draw(&self, deck: u16, rng: &mut Rng) -> u8 {
        match self.order {
            Order::Ascending => lowest(deck),
            Order::Descending => highest(deck),
            Order::Shuffled => {
                let k = deck.count_ones() as usize;
                if k == 1 { lowest(deck) } else { cards(deck).nth(rng.below(k)).unwrap() }
            }
        }
    }

    pub fn initial(&self, rng: &mut Rng) -> GState {
        let full = self.full();
        let prize = self.draw(full, rng);
        GState { round: 0, hands: [full, full], deck: full & !bit(prize), prize, pot: 0, scores: [0, 0] }
    }

    pub fn is_terminal(&self, s: &GState) -> bool {
        s.round >= self.n
    }

    /// Result for player 0: 1 win, 0.5 draw, 0 loss.
    pub fn result(&self, s: &GState) -> f64 {
        match s.scores[0].cmp(&s.scores[1]) {
            std::cmp::Ordering::Greater => 1.0,
            std::cmp::Ordering::Less => 0.0,
            std::cmp::Ordering::Equal => 0.5,
        }
    }

    /// Spend both bids and award the prize, before the next prize is revealed.
    fn bid(&self, s: &GState, a: u8, b: u8) -> GState {
        debug_assert!(s.hands[0] & bit(a) != 0 && s.hands[1] & bit(b) != 0);
        let mut o = *s;
        o.hands[0] &= !bit(a);
        o.hands[1] &= !bit(b);
        let value = (s.prize + s.pot) as i16;
        o.pot = 0;
        if a > b {
            o.scores[0] += value;
        } else if b > a {
            o.scores[1] += value;
        } else if self.ties == Ties::Carry {
            o.pot = value as u8;
        }
        o.round += 1;
        o.prize = 0;
        o
    }

    /// Reveal the next prize, if any. Returns the state and the prize revealed (0 at the end).
    fn reveal(&self, mut o: GState, rng: &mut Rng) -> (GState, u32) {
        if o.deck == 0 {
            return (o, 0);
        }
        let p = self.draw(o.deck, rng);
        o.prize = p;
        o.deck &= !bit(p);
        (o, p as u32)
    }

    pub fn resolve(&self, s: &GState, a: u8, b: u8, rng: &mut Rng) -> (GState, u32) {
        self.reveal(self.bid(s, a, b), rng)
    }

    /// Every next state after these bids, with its probability.
    fn outcomes(&self, s: &GState, a: u8, b: u8) -> Vec<(GState, f64)> {
        let o = self.bid(s, a, b);
        if o.deck == 0 || self.order != Order::Shuffled {
            return vec![(self.reveal(o, &mut Rng::new(0)).0, 1.0)];
        }
        let k = o.deck.count_ones() as f64;
        cards(o.deck)
            .map(|p| {
                let mut x = o;
                x.prize = p;
                x.deck &= !bit(p);
                (x, 1.0 / k)
            })
            .collect()
    }

    /// The last real decision: two cards each, after which the final round is forced.
    pub fn is_last(&self, s: &GState) -> bool {
        !self.is_terminal(s) && s.hands[0].count_ones() == 2
    }

    /// Player-0 results for every pair of bids at the last real decision.
    pub fn last_matrix(&self, s: &GState) -> (Vec<u8>, Vec<u8>, Vec<Vec<f64>>) {
        let la: Vec<u8> = cards(s.hands[0]).collect();
        let lb: Vec<u8> = cards(s.hands[1]).collect();
        let mut forced = Rng::new(0);
        let m = la
            .iter()
            .map(|&a| {
                lb.iter()
                    .map(|&b| {
                        let (t, _) = self.resolve(s, a, b, &mut forced);
                        let (end, _) = self.resolve(&t, lowest(t.hands[0]), lowest(t.hands[1]), &mut forced);
                        self.result(&end)
                    })
                    .collect()
            })
            .collect();
        (la, lb, m)
    }

    pub fn last_value(&self, s: &GState) -> f64 {
        let (_, _, m) = self.last_matrix(s);
        let (lo, hi) = lp::pure_bounds(&m);
        if (hi - lo).abs() < 1e-12 { lo } else { lp::solve(&m).value }
    }

    pub fn swap(&self, s: &GState) -> GState {
        GState { hands: [s.hands[1], s.hands[0]], scores: [s.scores[1], s.scores[0]], ..*s }
    }
}

/// GOPS as the generic search sees it.
pub struct GopsGame<'a> {
    pub g: &'a Gops,
    /// Rollouts bid the card nearest the prize value with this probability, otherwise uniformly at
    /// random: GOPS's counterpart of Crosscurrent's mostly-deploy rollouts.
    pub near: f64,
}

/// The card in `hand` nearest `prize` in value (the lower one on a tie).
fn nearest(hand: u16, prize: u8) -> u8 {
    cards(hand).min_by_key(|&c| ((c as i32 - prize as i32).abs(), c)).unwrap()
}

impl SimGame for GopsGame<'_> {
    type State = GState;
    type Action = u8;
    fn is_terminal(&self, s: &GState) -> bool {
        self.g.is_terminal(s)
    }
    fn result(&self, s: &GState) -> f64 {
        self.g.result(s)
    }
    fn legal(&self, s: &GState, p: usize, out: &mut Vec<u8>) {
        out.clear();
        out.extend(cards(s.hands[p]));
    }
    fn is_last(&self, s: &GState) -> bool {
        self.g.is_last(s)
    }
    fn last_value(&self, s: &GState) -> f64 {
        self.g.last_value(s)
    }
    fn step(&self, s: &GState, a: u8, b: u8, rng: &mut Rng) -> (GState, u32) {
        self.g.resolve(s, a, b, rng)
    }
    fn has_chance(&self) -> bool {
        self.g.order == Order::Shuffled
    }
    fn rollout_step(&self, s: &GState, rng: &mut Rng) -> GState {
        let pick = |h: u16, rng: &mut Rng| {
            if self.near > 0.0 && rng.f64() < self.near { nearest(h, s.prize) } else { cards(h).nth(rng.below(h.count_ones() as usize)).unwrap() }
        };
        let a = pick(s.hands[0], rng);
        let b = pick(s.hands[1], rng);
        self.g.resolve(s, a, b, rng).0
    }
}

// ---------------------------------------------------------------- policies

pub trait GPolicy: Send {
    fn choose(&mut self, g: &Gops, s: &GState, seat: usize, rng: &mut Rng) -> u8;
}

struct GRandom;
impl GPolicy for GRandom {
    fn choose(&mut self, _g: &Gops, s: &GState, seat: usize, rng: &mut Rng) -> u8 {
        let h = s.hands[seat];
        cards(h).nth(rng.below(h.count_ones() as usize)).unwrap()
    }
}

/// Bid the prize's own value: the symmetric policy that draws every mirror game (docs/RESEARCH.md).
struct BidPrize;
impl GPolicy for BidPrize {
    fn choose(&mut self, _g: &Gops, s: &GState, seat: usize, _rng: &mut Rng) -> u8 {
        if s.hands[seat] & bit(s.prize) != 0 { s.prize } else { lowest(s.hands[seat]) }
    }
}

/// One above the prize, and the Ace against the top prize: the recorded exploit of BidPrize.
struct BidAbove;
impl GPolicy for BidAbove {
    fn choose(&mut self, g: &Gops, s: &GState, seat: usize, _rng: &mut Rng) -> u8 {
        let want = if s.prize == g.n { 1 } else { s.prize + 1 };
        if s.hands[seat] & bit(want) != 0 { want } else { lowest(s.hands[seat]) }
    }
}

/// The same SM-MCTS and final-move rule as the Crosscurrent bot (`mcts`, `mctsx`).
struct GMcts {
    tree: Search<GState, u8>,
    purify: f64,
    near: f64,
}
impl GPolicy for GMcts {
    fn choose(&mut self, g: &Gops, s: &GState, seat: usize, rng: &mut Rng) -> u8 {
        if self.tree.exact_last && g.is_last(s) {
            let (la, lb, m) = g.last_matrix(s);
            let sol = lp::solve(&m);
            return if seat == 0 { la[sample(&sol.row, rng)] } else { lb[sample(&sol.col, rng)] };
        }
        let pol = self.tree.search(&GopsGame { g, near: self.near }, s, seat, rng);
        purified_choice(&pol, self.purify, rng)
    }
}

pub fn make_policy(spec: &str) -> Box<dyn GPolicy> {
    let parts: Vec<&str> = spec.split(':').collect();
    match parts[0] {
        "random" => Box::new(GRandom),
        "prize" => Box::new(BidPrize),
        "above" => Box::new(BidAbove),
        "mcts" | "mctsx" => {
            let mut tree = Search::new(parts.get(1).map(|s| s.parse().unwrap()).unwrap_or(1000));
            tree.exact_last = parts[0] == "mctsx";
            let (mut purify, mut near) = (0.1, 0.0);
            for opt in parts.iter().skip(2) {
                if let Some(v) = opt.strip_prefix('g') {
                    tree.gamma = v.parse().unwrap();
                } else if let Some(v) = opt.strip_prefix('p') {
                    purify = v.parse().unwrap();
                } else if let Some(v) = opt.strip_prefix('r') {
                    near = v.parse().unwrap();
                } else {
                    panic!("unknown GOPS search option {opt}");
                }
            }
            Box::new(GMcts { tree, purify, near })
        }
        _ => panic!("unknown GOPS policy {spec}"),
    }
}

// ---------------------------------------------------------------- matches

/// Scores are sampled after the first and second thirds of the rounds and at the end, the moments
/// at which Crosscurrent scores (turns 4, 8 and 12): rounds 4, 8 and 13 for the full game.
fn checkpoint(g: &Gops, round: u8) -> bool {
    round == g.n / 3 || round == 2 * g.n / 3 || round == g.n
}

fn play(g: &Gops, p: [&mut dyn GPolicy; 2], rng: &mut Rng, times: &mut [f64; 2]) -> (f64, GState, Vec<[i16; 2]>) {
    let mut s = g.initial(rng);
    let mut cps = Vec::new();
    let [p0, p1] = p;
    while !g.is_terminal(&s) {
        let mut bids = [0u8; 2];
        for seat in 0..2 {
            if s.hands[seat].count_ones() == 1 {
                bids[seat] = lowest(s.hands[seat]);
                continue;
            }
            let t0 = Instant::now();
            bids[seat] = if seat == 0 { p0.choose(g, &s, 0, rng) } else { p1.choose(g, &s, 1, rng) };
            times[seat] += t0.elapsed().as_secs_f64();
        }
        s = g.resolve(&s, bids[0], bids[1], rng).0;
        if checkpoint(g, s.round) {
            cps.push(s.scores);
        }
    }
    (g.result(&s), s, cps)
}

pub fn run_match(g: &Gops, a_spec: &str, b_spec: &str, games: u32, threads: u32, seed: u64) {
    let total = Arc::new(Mutex::new(Tally::default()));
    let next = Arc::new(Mutex::new(0u32));
    let mut handles = Vec::new();
    for _ in 0..threads {
        let g = g.clone();
        let (a_spec, b_spec) = (a_spec.to_string(), b_spec.to_string());
        let total = total.clone();
        let next = next.clone();
        handles.push(std::thread::spawn(move || {
            let mut pa = make_policy(&a_spec);
            let mut pb = make_policy(&b_spec);
            let mut local = Tally::default();
            loop {
                let n = {
                    let mut n = next.lock().unwrap();
                    if *n >= games {
                        break;
                    }
                    *n += 1;
                    *n - 1
                };
                let mut rng = Rng::new(seed.wrapping_mul(1_000_003).wrapping_add(n as u64 * 7919));
                let a_seat = (n % 2) as usize;
                let mut times = [0.0; 2];
                let (res0, st, cps) =
                    if a_seat == 0 { play(&g, [pa.as_mut(), pb.as_mut()], &mut rng, &mut times) } else { play(&g, [pb.as_mut(), pa.as_mut()], &mut rng, &mut times) };
                let res_a = if a_seat == 0 { res0 } else { 1.0 - res0 };
                let margin = (st.scores[a_seat] - st.scores[1 - a_seat]) as f64;
                local.record(res_a, res0, margin, st.scores[0] == st.scores[1], &cps);
                local.a_time += times[a_seat];
                local.b_time += times[1 - a_seat];
            }
            total.lock().unwrap().merge(&local);
        }));
    }
    for h in handles {
        h.join().unwrap();
    }
    let t = total.lock().unwrap().clone();
    print_tally(&g.name, a_spec, b_spec, &t);
    let d = t.decided.max(1) as f64;
    println!(
        "    decided={} winner behind after rounds {} and {}: cp1={:.1}% cp2={:.1}%  lead changes/game={:.2}",
        t.decided,
        g.n / 3,
        2 * g.n / 3,
        100.0 * t.behind_cp[0] as f64 / d,
        100.0 * t.behind_cp[1] as f64 / d,
        t.lead_changes as f64 / d
    );
    println!(
        "    level on points={:.1}% ({} games: A won {}, drew {}, lost {})",
        100.0 * t.level as f64 / t.games.max(1) as f64,
        t.level,
        t.level_a_wins,
        t.level - t.level_a_wins - t.level_a_losses,
        t.level_a_losses
    );
}

/// Play to the last real decision with `spec` on both sides, then solve that decision exactly.
pub fn final_stats(g: &Gops, spec: &str, games: u32, threads: u32, seed: u64) {
    let rows = Arc::new(Mutex::new(Vec::<FinalRow>::new()));
    let next = Arc::new(Mutex::new(0u32));
    let mut handles = Vec::new();
    for _ in 0..threads {
        let g = g.clone();
        let spec = spec.to_string();
        let rows = rows.clone();
        let next = next.clone();
        handles.push(std::thread::spawn(move || {
            let mut p = [make_policy(&spec), make_policy(&spec)];
            loop {
                let n = {
                    let mut n = next.lock().unwrap();
                    if *n >= games {
                        break;
                    }
                    *n += 1;
                    *n - 1
                };
                let mut rng = Rng::new(seed * 31 + n as u64);
                let mut s = g.initial(&mut rng);
                while !g.is_last(&s) {
                    let a = p[0].choose(&g, &s, 0, &mut rng);
                    let b = p[1].choose(&g, &s, 1, &mut rng);
                    s = g.resolve(&s, a, b, &mut rng).0;
                }
                let (_, _, m) = g.last_matrix(&s);
                rows.lock().unwrap().push(final_row(&m));
            }
        }));
    }
    for h in handles {
        h.join().unwrap();
    }
    print_final(&g.name, spec, &rows.lock().unwrap());
}

// ---------------------------------------------------------------- exact solution of small decks

type Key = (u16, u16, u16, u8, u8, i16);

/// Backward induction over every decision, each solved as a matrix game by linear programming, with
/// chance (the next prize) averaged out. Reports the value and the win/draw/loss distribution when both
/// players follow the computed equilibrium (one equilibrium; others may exist).
pub struct Exact<'a> {
    g: &'a Gops,
    memo: HashMap<Key, (f64, [f64; 3])>,
    pub nodes: u64,
    pub mixed_nodes: u64,
}

impl<'a> Exact<'a> {
    pub fn new(g: &'a Gops) -> Self {
        Exact { g, memo: HashMap::new(), nodes: 0, mixed_nodes: 0 }
    }

    /// Value for player 0 and [P(win0), P(draw), P(win1)] from the opening, first prize included.
    pub fn solve_game(&mut self) -> (f64, [f64; 3]) {
        let g = self.g;
        let full = g.full();
        let first: Vec<(u8, f64)> = match g.order {
            Order::Shuffled => cards(full).map(|p| (p, 1.0 / g.n as f64)).collect(),
            Order::Ascending => vec![(1, 1.0)],
            Order::Descending => vec![(g.n, 1.0)],
        };
        let mut value = 0.0;
        let mut dist = [0.0; 3];
        for (p, w) in first {
            let s = GState { round: 0, hands: [full, full], deck: full & !bit(p), prize: p, pot: 0, scores: [0, 0] };
            let (v, d) = self.solve(&s);
            value += w * v;
            for k in 0..3 {
                dist[k] += w * d[k];
            }
        }
        (value, dist)
    }

    fn solve(&mut self, s: &GState) -> (f64, [f64; 3]) {
        let g = self.g;
        if g.is_terminal(s) {
            let x = g.result(s);
            let d = if x > 0.75 { [1.0, 0.0, 0.0] } else if x < 0.25 { [0.0, 0.0, 1.0] } else { [0.0, 1.0, 0.0] };
            return (x, d);
        }
        let key = (s.hands[0], s.hands[1], s.deck, s.prize, s.pot, s.scores[0] - s.scores[1]);
        if let Some(&hit) = self.memo.get(&key) {
            return hit;
        }
        let la: Vec<u8> = cards(s.hands[0]).collect();
        let lb: Vec<u8> = cards(s.hands[1]).collect();
        let mut m = vec![vec![0.0; lb.len()]; la.len()];
        let mut dist = vec![vec![[0.0; 3]; lb.len()]; la.len()];
        for (i, &a) in la.iter().enumerate() {
            for (j, &b) in lb.iter().enumerate() {
                for (child, w) in g.outcomes(s, a, b) {
                    let (v, d) = self.solve(&child);
                    m[i][j] += w * v;
                    for k in 0..3 {
                        dist[i][j][k] += w * d[k];
                    }
                }
            }
        }
        let (lo, hi) = lp::pure_bounds(&m);
        let (value, x, y, mixed) = if (hi - lo).abs() < 1e-12 {
            let i = (0..la.len()).find(|&i| m[i].iter().cloned().fold(f64::INFINITY, f64::min) >= lo - 1e-12).unwrap();
            let j = (0..lb.len()).find(|&j| (0..la.len()).map(|i| m[i][j]).fold(f64::NEG_INFINITY, f64::max) <= hi + 1e-12).unwrap();
            let mut x = vec![0.0; la.len()];
            let mut y = vec![0.0; lb.len()];
            x[i] = 1.0;
            y[j] = 1.0;
            (lo, x, y, 0u64)
        } else {
            let sol = lp::solve(&m);
            (sol.value, sol.row, sol.col, 1u64)
        };
        let mut out = [0.0; 3];
        for i in 0..la.len() {
            for j in 0..lb.len() {
                for k in 0..3 {
                    out[k] += x[i] * y[j] * dist[i][j][k];
                }
            }
        }
        self.nodes += 1;
        self.mixed_nodes += mixed;
        self.memo.insert(key, (value, out));
        (value, out)
    }
}

/// Engine checks on random play: label-swap symmetry, spent cards, and conservation of prize value.
pub fn check(g: &Gops, seed: u64) {
    let mut rng = Rng::new(seed);
    let total = g.n as i32 * (g.n as i32 + 1) / 2;
    for _ in 0..20_000 {
        let mut s = g.initial(&mut rng);
        let mut unawarded = 0i32;
        while !g.is_terminal(&s) {
            let pick = |h: u16, rng: &mut Rng| cards(h).nth(rng.below(h.count_ones() as usize)).unwrap();
            let a = pick(s.hands[0], &mut rng);
            let b = pick(s.hands[1], &mut rng);
            let mut r1 = rng.clone();
            let mut r2 = rng.clone();
            let (next, _) = g.resolve(&s, a, b, &mut r1);
            let (mirror, _) = g.resolve(&g.swap(&s), b, a, &mut r2);
            assert_eq!(g.swap(&next), mirror, "label swap");
            if a == b && g.ties == Ties::Discard {
                unawarded += s.prize as i32;
            }
            if a == b && g.ties == Ties::Carry && next.deck == 0 && next.prize == 0 {
                unawarded += (s.prize + s.pot) as i32;
            }
            rng = r1;
            s = next;
        }
        assert_eq!(s.hands, [0, 0], "every card bid once");
        assert_eq!(s.scores[0] as i32 + s.scores[1] as i32 + unawarded, total, "prize value conserved");
    }
    println!("{}: 20000 random games preserve label-swap symmetry, spend every card once and conserve prize value", g.name);
}

/// Self-play with search, before the last real decision: per round, the effective number of bids
/// (exp of the root policy's entropy), bids above 10% probability, and legal bids.
pub fn profile(g: &Gops, iters: u32, games: u32, seed: u64, near: f64, purify: f64) {
    let n = g.n as usize;
    let (mut eff, mut big, mut legal, mut count) = (vec![0.0f64; n], vec![0.0f64; n], vec![0.0f64; n], vec![0u32; n]);
    for k in 0..games {
        let mut rng = Rng::new(seed * 131 + k as u64);
        let mut s = g.initial(&mut rng);
        let mut trees = [Search::new(iters), Search::new(iters)];
        for t in trees.iter_mut() {
            t.exact_last = true;
        }
        while !g.is_last(&s) {
            let mut bids = [0u8; 2];
            for seat in 0..2 {
                let pol = trees[seat].search(&GopsGame { g, near }, &s, seat, &mut rng);
                let h: f64 = pol.iter().map(|(_, p)| if *p > 0.0 { -p * p.ln() } else { 0.0 }).sum();
                let r = s.round as usize;
                eff[r] += h.exp();
                big[r] += pol.iter().filter(|(_, p)| *p >= 0.1).count() as f64;
                legal[r] += pol.len() as f64;
                count[r] += 1;
                bids[seat] = purified_choice(&pol, purify, &mut rng);
            }
            s = g.resolve(&s, bids[0], bids[1], &mut rng).0;
        }
    }
    let line: Vec<String> = (0..n).filter(|&r| count[r] > 0).map(|r| format!("t{}:{:.1}/{:.1}/{:.0}", r + 1, eff[r] / count[r] as f64, big[r] / count[r] as f64, legal[r] / count[r] as f64)).collect();
    let total: u32 = count.iter().sum();
    println!("{:<28} effective/over10%/legal per turn: {}  mean effective={:.2}", g.name, line.join(" "), eff.iter().sum::<f64>() / total as f64);
}
