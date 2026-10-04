//! Bitmask Crosscurrent engine with rule variants. Bit i of a mask is rank i + 1.
//! The `base` variant must agree exactly with src/engine.ts (see `validate`).

use std::sync::OnceLock;

pub const MAXF: usize = 4;
pub const MAXA: usize = 64;
pub const DEPLOY: u8 = 0;
pub const SHIFT: u8 = 1;
pub const RECALL: u8 = 2;
pub const NOFRONT: u8 = 255;
pub const WAIT: u8 = 3;
pub const WAIT_ACTION: Action = Action { kind: WAIT, card: 0, front: NOFRONT };

#[derive(Clone, Copy, PartialEq, Eq, Debug, Hash)]
pub struct Action {
    pub kind: u8,
    pub card: u8,
    pub front: u8,
}

impl Action {
    pub fn text(&self) -> String {
        let r = rank_text(self.card);
        match self.kind {
            DEPLOY => format!("D{}>{}", r, self.front),
            SHIFT => format!("S{}>{}", r, self.front),
            _ => format!("R{}", r),
        }
    }
}

pub fn rank_text(c: u8) -> String {
    match c {
        1 => "A".into(),
        11 => "J".into(),
        12 => "Q".into(),
        13 => "K".into(),
        n => n.to_string(),
    }
}

#[derive(Clone, Copy, PartialEq, Eq, Debug, Hash, Default)]
pub struct Side {
    pub hand: u16,
    pub board: [u16; MAXF],
    pub spent: u16,
}

#[derive(Clone, Copy, PartialEq, Eq, Debug, Hash)]
pub struct State {
    pub turn: u8,
    pub sides: [Side; 2],
    pub scores: [i16; 2],
    /// Tiebreak accumulator, meaning depends on Rules::tiebreak.
    pub tb: [i16; 2],
    /// Card named by each player's previous order (0 before turn 1).
    pub last: [u8; 2],
    /// Leader's committed order during a sequential turn.
    pub pending: Option<Action>,
}

pub struct ActionList {
    pub len: usize,
    pub items: [Action; MAXA],
}

impl ActionList {
    pub fn new() -> Self {
        ActionList { len: 0, items: [Action { kind: 0, card: 0, front: 0 }; MAXA] }
    }
    #[inline]
    pub fn push(&mut self, a: Action) {
        self.items[self.len] = a;
        self.len += 1;
    }
    pub fn as_slice(&self) -> &[Action] {
        &self.items[..self.len]
    }
}

fn sums() -> &'static [u8] {
    static T: OnceLock<Vec<u8>> = OnceLock::new();
    T.get_or_init(|| {
        (0..1u32 << 16)
            .map(|m| (0..16).filter(|i| m >> i & 1 == 1).map(|i| i + 1).sum::<u32>().min(255) as u8)
            .collect()
    })
}

#[inline]
pub fn msum(m: u16) -> i32 {
    sums()[m as usize] as i32
}
#[inline]
pub fn bit(card: u8) -> u16 {
    1u16 << (card - 1)
}
#[inline]
pub fn lowest(m: u16) -> u8 {
    m.trailing_zeros() as u8 + 1
}
#[inline]
pub fn highest(m: u16) -> u8 {
    16 - m.leading_zeros() as u8
}
pub fn cards(m: u16) -> impl Iterator<Item = u8> {
    (0..16u8).filter(move |i| m >> i & 1 == 1).map(|i| i + 1)
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Exhaust {
    /// No removal at checkpoints.
    None,
    /// v0.2: each player's highest card at every occupied front.
    Highest,
    /// Only the winner of a front loses their highest card there.
    Winner,
    /// Every card on the board is spent at a checkpoint (fresh fronts each phase).
    All,
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Tiebreak {
    None,
    /// Equal score: higher total strength summed over all checkpoints' contested fronts.
    TotalStrength,
    /// Equal score: player who won more fronts at the final checkpoint.
    FinalFronts,
    /// Equal score: higher sum of cards still in hand after the final turn.
    Hand,
    /// Equal score: higher total strength (all fronts) at the final checkpoint.
    FinalStrength,
    /// Equal score: whoever led after the previous checkpoint, then the one before.
    EarlierLead,
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Cost {
    /// v0.2: Shift and Recall spend the lowest hand card.
    Lowest,
    /// Shift and Recall are free.
    Free,
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Initiative {
    /// v0.2: every turn simultaneous.
    None,
    /// The player whose previous order named the lower card chooses second,
    /// after seeing the other order. Equal cards: simultaneous.
    LowerCard,
    /// The player whose previous order named the higher card chooses second.
    HigherCard,
    /// The player behind in score chooses second; tied scores: simultaneous.
    Behind,
    /// The player ahead in score chooses second; tied scores: simultaneous.
    Ahead,
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Award {
    /// v0.2: each front won scores the checkpoint value.
    PerFront,
    /// Checkpoint value goes to whoever wins more fronts there (majority).
    Majority,
}

#[derive(Clone, Debug)]
pub struct Rules {
    pub name: String,
    pub ranks: u8,
    pub fronts: usize,
    pub turns: u8,
    /// points[t] per front at checkpoint turn t (0 = not a checkpoint), index 1..=turns.
    pub points: [u8; 33],
    pub exhaust: Exhaust,
    pub shift: bool,
    pub recall: bool,
    /// Recalling the card that would be exhausted saves it (v0.2: true).
    pub recall_protects: bool,
    /// Recalled card still counts for this turn's scoring (v0.2: true).
    pub recall_scores: bool,
    pub tiebreak: Tiebreak,
    pub cost: Cost,
    pub award: Award,
    pub initiative: Initiative,
}

impl Rules {
    pub fn base() -> Rules {
        let mut points = [0u8; 33];
        points[4] = 1;
        points[8] = 2;
        points[12] = 3;
        Rules {
            name: "base".into(),
            ranks: 13,
            fronts: 3,
            turns: 12,
            points,
            exhaust: Exhaust::Highest,
            shift: true,
            recall: true,
            recall_protects: true,
            recall_scores: true,
            tiebreak: Tiebreak::None,
            cost: Cost::Lowest,
            award: Award::PerFront,
            initiative: Initiative::None,
        }
    }

    pub fn total_points(&self) -> i32 {
        (1..=self.turns as usize).map(|t| self.points[t] as i32 * self.fronts as i32).sum()
    }

    pub fn initial(&self) -> State {
        let full = ((1u32 << self.ranks) - 1) as u16;
        let side = Side { hand: full, board: [0; MAXF], spent: 0 };
        State { turn: 0, sides: [side, side], scores: [0, 0], tb: [0, 0], last: [0, 0], pending: None }
    }

    pub fn is_terminal(&self, s: &State) -> bool {
        s.turn >= self.turns
    }

    /// Same order as src/engine.ts: deploys by ascending card then front; then
    /// for each origin front, each card ascending: shifts by front, then recall.
    pub fn actions(&self, s: &Side, out: &mut ActionList) {
        out.len = 0;
        if s.hand == 0 {
            return;
        }
        for c in cards(s.hand) {
            for f in 0..self.fronts {
                out.push(Action { kind: DEPLOY, card: c, front: f as u8 });
            }
        }
        for origin in 0..self.fronts {
            for c in cards(s.board[origin]) {
                if self.shift {
                    for f in 0..self.fronts {
                        if f != origin {
                            out.push(Action { kind: SHIFT, card: c, front: f as u8 });
                        }
                    }
                }
                if self.recall {
                    out.push(Action { kind: RECALL, card: c, front: NOFRONT });
                }
            }
        }
    }

    #[inline]
    fn origin(&self, s: &Side, card: u8) -> usize {
        let b = bit(card);
        (0..self.fronts).find(|&f| s.board[f] & b != 0).expect("card on board")
    }

    /// Apply this turn's order. Returns the side as it stands for scoring and
    /// the pending recall target.
    pub fn prepare(&self, src: &Side, a: Action) -> (Side, Option<u8>) {
        let mut s = *src;
        let mut recall = None;
        match a.kind {
            DEPLOY => {
                debug_assert!(s.hand & bit(a.card) != 0);
                s.hand &= !bit(a.card);
                s.board[a.front as usize] |= bit(a.card);
            }
            _ => {
                if self.cost == Cost::Lowest {
                    let pay = lowest(s.hand);
                    s.hand &= !bit(pay);
                    s.spent |= bit(pay);
                }
                let o = self.origin(&s, a.card);
                if a.kind == SHIFT {
                    s.board[o] &= !bit(a.card);
                    s.board[a.front as usize] |= bit(a.card);
                } else {
                    if !self.recall_scores {
                        s.board[o] &= !bit(a.card);
                        s.hand |= bit(a.card);
                    } else {
                        recall = Some(a.card);
                    }
                }
            }
        }
        (s, recall)
    }

    /// After scoring: exhaustion (if a checkpoint) and the recall return.
    /// `won[f]` is true if this side won front f at this checkpoint.
    pub fn finish(&self, src: &Side, mut recall: Option<u8>, checkpoint: bool, won: &[bool; MAXF]) -> Side {
        let mut s = *src;
        if checkpoint {
            for f in 0..self.fronts {
                if s.board[f] == 0 {
                    continue;
                }
                match self.exhaust {
                    Exhaust::None => {}
                    Exhaust::Highest | Exhaust::Winner => {
                        if self.exhaust == Exhaust::Winner && !won[f] {
                            continue;
                        }
                        let h = highest(s.board[f]);
                        s.board[f] &= !bit(h);
                        if self.recall_protects && recall == Some(h) {
                            s.hand |= bit(h);
                        } else {
                            s.spent |= bit(h);
                        }
                        // Returned or spent, the recalled card has left the board.
                        if recall == Some(h) {
                            recall = None;
                        }
                    }
                    Exhaust::All => {
                        let mut m = s.board[f];
                        if let Some(r) = recall.filter(|&r| m & bit(r) != 0) {
                            recall = None;
                            if self.recall_protects {
                                m &= !bit(r);
                                s.board[f] &= !bit(r);
                                s.hand |= bit(r);
                            }
                        }
                        s.spent |= m;
                        s.board[f] &= !m;
                    }
                }
            }
        }
        if let Some(r) = recall {
            let o = self.origin(&s, r);
            s.board[o] &= !bit(r);
            s.hand |= bit(r);
        }
        s
    }

    pub fn resolve(&self, st: &State, a: Action, b: Action) -> State {
        self.resolve_full(st, a, b).0
    }

    /// Returns the next state plus (strengths at scoring, points gained) if a checkpoint.
    pub fn resolve_full(&self, st: &State, a: Action, b: Action) -> (State, Option<([[i32; MAXF]; 2], [i32; 2])>) {
        debug_assert!(st.turn < self.turns);
        let next = st.turn + 1;
        let (pa, ra) = self.prepare(&st.sides[0], a);
        let (pb, rb) = self.prepare(&st.sides[1], b);
        let pts = self.points[next as usize] as i32;
        let checkpoint = pts > 0;
        let mut out = *st;
        out.turn = next;
        out.pending = None;
        out.last = [a.card, b.card];
        let mut info = None;
        let mut won = [[false; MAXF]; 2];
        if checkpoint {
            let mut str_ = [[0i32; MAXF]; 2];
            let mut gained = [0i32; 2];
            let mut fronts_won = [0i32; 2];
            for f in 0..self.fronts {
                str_[0][f] = msum(pa.board[f]);
                str_[1][f] = msum(pb.board[f]);
                if str_[0][f] > str_[1][f] {
                    fronts_won[0] += 1;
                    won[0][f] = true;
                } else if str_[1][f] > str_[0][f] {
                    fronts_won[1] += 1;
                    won[1][f] = true;
                }
            }
            match self.award {
                Award::PerFront => {
                    gained = [fronts_won[0] * pts, fronts_won[1] * pts];
                }
                Award::Majority => {
                    if fronts_won[0] > fronts_won[1] {
                        gained[0] = pts;
                    } else if fronts_won[1] > fronts_won[0] {
                        gained[1] = pts;
                    }
                }
            }
            out.scores[0] += gained[0] as i16;
            out.scores[1] += gained[1] as i16;
            match self.tiebreak {
                Tiebreak::TotalStrength => {
                    for p in 0..2 {
                        out.tb[p] += (0..self.fronts).map(|f| str_[p][f]).sum::<i32>() as i16;
                    }
                }
                Tiebreak::FinalFronts => {
                    if next == self.turns {
                        out.tb = [fronts_won[0] as i16, fronts_won[1] as i16];
                    }
                }
                Tiebreak::EarlierLead => {
                    if next != self.turns {
                        // Lexicographic over the last two non-final checkpoints, latest first.
                        for p in 0..2 {
                            out.tb[p] = out.scores[p] * 16 + out.tb[p] / 16;
                        }
                    }
                }
                Tiebreak::FinalStrength => {
                    if next == self.turns {
                        for p in 0..2 {
                            out.tb[p] = (0..self.fronts).map(|f| str_[p][f]).sum::<i32>() as i16;
                        }
                    }
                }
                _ => {}
            }
            info = Some((str_, gained));
        }
        out.sides[0] = self.finish(&pa, ra, checkpoint, &won[0]);
        out.sides[1] = self.finish(&pb, rb, checkpoint, &won[1]);
        if next == self.turns && self.tiebreak == Tiebreak::Hand {
            out.tb = [msum(out.sides[0].hand) as i16, msum(out.sides[1].hand) as i16];
        }
        (out, info)
    }

    /// Result for player 0: 1 win, 0.5 draw, 0 loss.
    pub fn result(&self, s: &State) -> f32 {
        let d = s.scores[0] - s.scores[1];
        if d > 0 {
            1.0
        } else if d < 0 {
            0.0
        } else if self.tiebreak != Tiebreak::None && s.tb[0] != s.tb[1] {
            if s.tb[0] > s.tb[1] { 1.0 } else { 0.0 }
        } else {
            0.5
        }
    }

    pub fn swap(&self, s: &State) -> State {
        State { turn: s.turn, sides: [s.sides[1], s.sides[0]], scores: [s.scores[1], s.scores[0]], tb: [s.tb[1], s.tb[0]], last: [s.last[1], s.last[0]], pending: s.pending }
    }

    /// Who commits first this turn: None = simultaneous.
    pub fn leader(&self, s: &State) -> Option<usize> {
        let responder = match self.initiative {
            Initiative::None => None,
            Initiative::LowerCard | Initiative::HigherCard => {
                if s.turn == 0 || s.last[0] == s.last[1] {
                    None
                } else {
                    let lower = if s.last[0] < s.last[1] { 0 } else { 1 };
                    Some(if self.initiative == Initiative::LowerCard { lower } else { 1 - lower })
                }
            }
            Initiative::Behind | Initiative::Ahead => {
                if s.scores[0] == s.scores[1] {
                    None
                } else {
                    let behind = if s.scores[0] < s.scores[1] { 0 } else { 1 };
                    Some(if self.initiative == Initiative::Behind { behind } else { 1 - behind })
                }
            }
        };
        responder.map(|r| 1 - r)
    }

    /// Legal choices for player p at this decision point (a single WAIT if p does not act now).
    pub fn legal(&self, s: &State, p: usize, out: &mut ActionList) {
        match self.leader(s) {
            None => self.actions(&s.sides[p], out),
            Some(l) => {
                let acting = if s.pending.is_none() { l } else { 1 - l };
                if p == acting {
                    self.actions(&s.sides[p], out);
                } else {
                    out.len = 0;
                    out.push(WAIT_ACTION);
                }
            }
        }
    }

    /// Advance one decision point. For sequential turns the first step records
    /// the leader's order and the second resolves the turn.
    pub fn step(&self, s: &State, a0: Action, a1: Action) -> State {
        match self.leader(s) {
            None => self.resolve(s, a0, a1),
            Some(l) => match s.pending {
                None => {
                    let mut out = *s;
                    out.pending = Some(if l == 0 { a0 } else { a1 });
                    out
                }
                Some(lead) => {
                    if l == 0 { self.resolve(s, lead, a1) } else { self.resolve(s, a0, lead) }
                }
            },
        }
    }

    pub fn conserved(&self, s: &State) -> bool {
        let full = ((1u32 << self.ranks) - 1) as u16;
        s.sides.iter().all(|side| {
            let mut all = side.hand | side.spent;
            let mut count = side.hand.count_ones() + side.spent.count_ones();
            for f in 0..self.fronts {
                all |= side.board[f];
                count += side.board[f].count_ones();
            }
            all == full && count == self.ranks as u32
        })
    }
}

/// Named rule variants used in research. Keep `base` identical to v0.2.
pub fn variant(name: &str) -> Rules {
    let mut r = Rules::base();
    r.name = name.to_string();
    let set_points = |r: &mut Rules, pts: &[(usize, u8)]| {
        r.points = [0; 33];
        for &(t, p) in pts {
            r.points[t] = p;
        }
    };
    for part in name.split('+') {
        match part {
            "base" => {}
            // Tiebreaks
            "tbstr" => r.tiebreak = Tiebreak::TotalStrength,
            "tbfronts" => r.tiebreak = Tiebreak::FinalFronts,
            "tbhand" => r.tiebreak = Tiebreak::Hand,
            "tbfinal" => r.tiebreak = Tiebreak::FinalStrength,
            "tbearly" => r.tiebreak = Tiebreak::EarlierLead,
            // Exhaustion
            "exnone" => r.exhaust = Exhaust::None,
            "exwin" => r.exhaust = Exhaust::Winner,
            "exall" => r.exhaust = Exhaust::All,
            // Actions and costs
            "noshift" => r.shift = false,
            "norecall" => r.recall = false,
            "free" => r.cost = Cost::Free,
            "noprotect" => r.recall_protects = false,
            "recallnow" => r.recall_scores = false,
            // Award
            "majority" => r.award = Award::Majority,
            // Initiative
            "initlow" => r.initiative = Initiative::LowerCard,
            "inithigh" => r.initiative = Initiative::HigherCard,
            "initbehind" => r.initiative = Initiative::Behind,
            "initahead" => r.initiative = Initiative::Ahead,
            // Schedules
            "s111" => set_points(&mut r, &[(4, 1), (8, 1), (12, 1)]),
            "s123" => set_points(&mut r, &[(4, 1), (8, 2), (12, 3)]),
            "s124" => set_points(&mut r, &[(4, 1), (8, 2), (12, 4)]),
            "s135" => set_points(&mut r, &[(4, 1), (8, 3), (12, 5)]),
            "s234" => set_points(&mut r, &[(4, 2), (8, 3), (12, 4)]),
            "s6x2" => set_points(&mut r, &[(2, 1), (4, 1), (6, 1), (8, 1), (10, 1), (12, 1)]),
            "s6inc" => set_points(&mut r, &[(2, 1), (4, 2), (6, 3), (8, 4), (10, 5), (12, 6)]),
            "s4x3" => set_points(&mut r, &[(3, 1), (6, 2), (9, 3), (12, 4)]),
            "s4x3flat" => set_points(&mut r, &[(3, 1), (6, 1), (9, 1), (12, 1)]),
            "s12" => set_points(&mut r, &(1..=12).map(|t| (t, 1u8)).collect::<Vec<_>>()),
            "s12inc" => set_points(&mut r, &(1..=12).map(|t| (t, ((t + 3) / 4) as u8)).collect::<Vec<_>>()),
            other => {
                if let Some(rest) = other.strip_prefix("fronts") {
                    r.fronts = rest.parse().expect("fronts N");
                } else if let Some(rest) = other.strip_prefix("turns") {
                    r.turns = rest.parse().expect("turns N");
                } else if let Some(rest) = other.strip_prefix("ranks") {
                    r.ranks = rest.parse().expect("ranks N");
                } else if let Some(rest) = other.strip_prefix("cp:") {
                    // cp:4=1,8=2,12=3
                    let pts: Vec<(usize, u8)> = rest
                        .split(',')
                        .map(|kv| {
                            let mut it = kv.split('=');
                            (it.next().unwrap().parse().unwrap(), it.next().unwrap().parse().unwrap())
                        })
                        .collect();
                    set_points(&mut r, &pts);
                } else {
                    panic!("unknown variant part {other}");
                }
            }
        }
    }
    r
}
