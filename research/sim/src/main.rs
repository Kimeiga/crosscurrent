mod bots;
mod exact;
mod game;
mod lp;

use bots::*;
use game::*;
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::time::Instant;

fn arg<'a>(args: &'a [String], key: &str, default: &'a str) -> &'a str {
    for a in args {
        if let Some(v) = a.strip_prefix(&format!("{key}=")) {
            return v;
        }
    }
    default
}

fn encode_state(r: &Rules, s: &State) -> String {
    let side = |x: &Side| {
        let mut v = vec![x.hand.to_string()];
        for f in 0..r.fronts {
            v.push(x.board[f].to_string());
        }
        v.push(x.spent.to_string());
        v.join(",")
    };
    format!("{}|{}|{}|{},{}", s.turn, side(&s.sides[0]), side(&s.sides[1]), s.scores[0], s.scores[1])
}

fn decode_action(s: &str) -> Action {
    let b = s.as_bytes();
    let kind = match b[0] {
        b'D' => DEPLOY,
        b'S' => SHIFT,
        _ => RECALL,
    };
    let card = u8::from_str_radix(&s[1..2], 16).unwrap();
    let f = (b[2] - b'0') as i32 - 1;
    Action { kind, card, front: if f < 0 { NOFRONT } else { f as u8 } }
}

/// Lines: "<72-char transcript> <state>;<state>;..." produced by tests export script.
fn validate(path: &str) {
    let r = Rules::base();
    let text = std::fs::read_to_string(path).expect("read");
    let mut n = 0;
    for line in text.lines() {
        let (orders, states) = line.split_once(' ').unwrap();
        let expected: Vec<&str> = states.split(';').collect();
        let mut st = r.initial();
        for t in 0..12 {
            let a = decode_action(&orders[t * 6..t * 6 + 3]);
            let b = decode_action(&orders[t * 6 + 3..t * 6 + 6]);
            st = r.resolve(&st, a, b);
            assert!(r.conserved(&st));
            let got = encode_state(&r, &st);
            assert_eq!(got, expected[t], "mismatch line {n} turn {}", t + 1);
        }
        n += 1;
    }
    println!("validated {n} games ({} transitions) against TypeScript", n * 12);
}

#[derive(Default, Clone)]
struct Tally {
    games: u32,
    a_wins: u32,
    draws: u32,
    a_losses: u32,
    margin_sum: f64,
    seat0_score: f64,
    // comeback: final winner was behind after checkpoint k
    behind_cp: [u32; 4],
    decided: u32,
    lead_changes: u32,
    final_cp_decisive: u32,
    // games level on points after turn 12, and how the tiebreak (if any) settled them for A
    level: u32,
    level_a_wins: u32,
    level_a_losses: u32,
    kinds: [[u64; 3]; 2],
    a_time: f64,
    b_time: f64,
}

impl Tally {
    fn merge(&mut self, o: &Tally) {
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
    fn result(&self) -> f64 {
        (self.a_wins as f64 + 0.5 * self.draws as f64) / self.games as f64
    }
    fn ci(&self) -> f64 {
        // 95% half-width from per-game result variance
        let n = self.games as f64;
        let mean = self.result();
        let var = (self.a_wins as f64 * (1.0 - mean).powi(2) + self.draws as f64 * (0.5 - mean).powi(2) + self.a_losses as f64 * mean.powi(2)) / (n - 1.0).max(1.0);
        1.96 * (var / n).sqrt()
    }
}

/// Play one game. Returns (result for seat 0, final state, per-checkpoint score history).
fn play(rules: &Rules, p: [&mut dyn Policy; 2], rng: &mut Rng, times: &mut [f64; 2], kinds: &mut [[u64; 3]; 2]) -> (f64, State, Vec<[i16; 2]>) {
    let mut st = rules.initial();
    let mut cps = Vec::new();
    let [p0, p1] = p;
    let mut l = ActionList::new();
    while !rules.is_terminal(&st) {
        let before = st.turn;
        let mut act = [WAIT_ACTION; 2];
        for seat in 0..2 {
            rules.legal(&st, seat, &mut l);
            if l.len == 1 && l.items[0].kind == WAIT {
                continue;
            }
            let t0 = Instant::now();
            act[seat] = if seat == 0 { p0.choose(rules, &st, 0, rng) } else { p1.choose(rules, &st, 1, rng) };
            times[seat] += t0.elapsed().as_secs_f64();
            kinds[seat][act[seat].kind as usize] += 1;
        }
        st = rules.step(&st, act[0], act[1]);
        if st.turn != before && rules.points[st.turn as usize] > 0 {
            cps.push(st.scores);
        }
    }
    (rules.result(&st) as f64, st, cps)
}

fn run_match(rules: &Rules, a_spec: &str, b_spec: &str, games: u32, threads: u32, seed: u64, quiet: bool) -> Tally {
    let total = Arc::new(Mutex::new(Tally::default()));
    let next = Arc::new(Mutex::new(0u32));
    let mut handles = Vec::new();
    for t in 0..threads {
        let rules = rules.clone();
        let (a_spec, b_spec) = (a_spec.to_string(), b_spec.to_string());
        let total = total.clone();
        let next = next.clone();
        handles.push(std::thread::spawn(move || {
            let mut pa = make_policy(&a_spec);
            let mut pb = make_policy(&b_spec);
            let mut local = Tally::default();
            loop {
                let g = {
                    let mut n = next.lock().unwrap();
                    if *n >= games {
                        break;
                    }
                    *n += 1;
                    *n - 1
                };
                let mut rng = Rng::new(seed.wrapping_mul(1_000_003).wrapping_add(g as u64 * 7919 + t as u64 * 0));
                let a_seat = (g % 2) as usize;
                let mut times = [0.0; 2];
                let mut kinds = [[0u64; 3]; 2];
                let (res0, st, cps) = if a_seat == 0 {
                    play(&rules, [pa.as_mut(), pb.as_mut()], &mut rng, &mut times, &mut kinds)
                } else {
                    play(&rules, [pb.as_mut(), pa.as_mut()], &mut rng, &mut times, &mut kinds)
                };
                let res_a = if a_seat == 0 { res0 } else { 1.0 - res0 };
                local.games += 1;
                if res_a > 0.75 {
                    local.a_wins += 1;
                } else if res_a < 0.25 {
                    local.a_losses += 1;
                } else {
                    local.draws += 1;
                }
                local.seat0_score += res0;
                if st.scores[0] == st.scores[1] {
                    local.level += 1;
                    if res_a > 0.75 {
                        local.level_a_wins += 1;
                    } else if res_a < 0.25 {
                        local.level_a_losses += 1;
                    }
                }
                let margin = (st.scores[a_seat] - st.scores[1 - a_seat]) as f64;
                local.margin_sum += margin;
                local.a_time += times[a_seat];
                local.b_time += times[1 - a_seat];
                for p in 0..2 {
                    let who = if p == 0 { a_seat } else { 1 - a_seat };
                    for k in 0..3 {
                        local.kinds[p][k] += kinds[who][k];
                    }
                }
                if res0 != 0.5 {
                    local.decided += 1;
                    let winner = if res0 > 0.5 { 0 } else { 1 };
                    let mut prev_leader: i32 = -1;
                    for (k, s) in cps.iter().enumerate() {
                        let d = s[winner] - s[1 - winner];
                        if k + 1 < cps.len() && d < 0 && k < 4 {
                            local.behind_cp[k] += 1;
                        }
                        let leader = if d > 0 { 0 } else if d < 0 { 1 } else { -1 };
                        if leader >= 0 && prev_leader >= 0 && leader != prev_leader {
                            local.lead_changes += 1;
                        }
                        if leader >= 0 {
                            prev_leader = leader;
                        }
                    }
                    // was the game still undecided before the final checkpoint?
                    if cps.len() >= 2 {
                        let before = cps[cps.len() - 2];
                        let lead = (before[0] - before[1]).abs() as i32;
                        let last = rules.points[rules.turns as usize] as i32 * rules.fronts as i32;
                        if lead < last {
                            local.final_cp_decisive += 1;
                        }
                    }
                }
            }
            total.lock().unwrap().merge(&local);
        }));
    }
    for h in handles {
        h.join().unwrap();
    }
    let t = total.lock().unwrap().clone();
    if !quiet {
        print_tally(rules, a_spec, b_spec, &t);
    }
    t
}

fn print_tally(rules: &Rules, a: &str, b: &str, t: &Tally) {
    let n = t.games as f64;
    println!(
        "{:<28} {:>14} vs {:<14} n={:<5} A={:.3}±{:.3}  W/D/L {}/{}/{}  draw={:.1}%  seat0={:.3}  margin={:+.2}  tA={:.2}s tB={:.2}s",
        rules.name,
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

fn print_dynamics(t: &Tally) {
    let d = t.decided.max(1) as f64;
    let ka: u64 = t.kinds[0].iter().sum();
    let kb: u64 = t.kinds[1].iter().sum();
    println!(
        "    decided={} winner behind after cp1={:.1}% cp2={:.1}%  lead changes/game={:.2}  final cp could decide={:.1}%  A kinds D/S/R={:.0}/{:.0}/{:.0}%  B kinds={:.0}/{:.0}/{:.0}%",
        t.decided,
        100.0 * t.behind_cp[0] as f64 / d,
        100.0 * t.behind_cp[1] as f64 / d,
        t.lead_changes as f64 / d,
        100.0 * t.final_cp_decisive as f64 / d,
        100.0 * t.kinds[0][0] as f64 / ka as f64,
        100.0 * t.kinds[0][1] as f64 / ka as f64,
        100.0 * t.kinds[0][2] as f64 / ka as f64,
        100.0 * t.kinds[1][0] as f64 / kb as f64,
        100.0 * t.kinds[1][1] as f64 / kb as f64,
        100.0 * t.kinds[1][2] as f64 / kb as f64,
    );
    println!(
        "    level on points={:.1}% ({} games: A won {}, drew {}, lost {})",
        100.0 * t.level as f64 / t.games.max(1) as f64,
        t.level,
        t.level_a_wins,
        t.level - t.level_a_wins - t.level_a_losses,
        t.level_a_losses,
    );
}

/// Sample final-turn positions from games between `policy` bots and solve them exactly.
fn final_stats(rules: &Rules, spec: &str, games: u32, threads: u32, seed: u64) {
    let rows = Arc::new(Mutex::new(Vec::<(f64, f64, f64, usize, usize, usize, usize, f64)>::new()));
    let next = Arc::new(Mutex::new(0u32));
    let mut handles = Vec::new();
    for _ in 0..threads {
        let rules = rules.clone();
        let spec = spec.to_string();
        let rows = rows.clone();
        let next = next.clone();
        handles.push(std::thread::spawn(move || {
            let mut p0 = make_policy(&spec);
            let mut p1 = make_policy(&spec);
            loop {
                let g = {
                    let mut n = next.lock().unwrap();
                    if *n >= games {
                        break;
                    }
                    *n += 1;
                    *n - 1
                };
                let mut rng = Rng::new(seed * 31 + g as u64);
                let mut st = rules.initial();
                let mut l = ActionList::new();
                while st.turn + 1 < rules.turns {
                    let mut act = [WAIT_ACTION; 2];
                    for seat in 0..2 {
                        rules.legal(&st, seat, &mut l);
                        if l.len == 1 && l.items[0].kind == WAIT {
                            continue;
                        }
                        act[seat] = if seat == 0 { p0.choose(&rules, &st, 0, &mut rng) } else { p1.choose(&rules, &st, 1, &mut rng) };
                    }
                    st = rules.step(&st, act[0], act[1]);
                }
                if rules.leader(&st).is_some() {
                    rows.lock().unwrap().push((f64::NAN, f64::NAN, final_value(&rules, &st), 0, 0, 0, 0, 0.0));
                    continue;
                }
                let (la, lb, m) = final_matrix(&rules, &st);
                let (lo, hi) = lp::pure_bounds(&m);
                let sol = lp::solve(&m);
                let support = |v: &[f64]| v.iter().filter(|p| **p > 1e-6).count();
                // value if row player picked uniformly at random among its legal moves (vs best reply)
                let cols = m[0].len();
                let random_row = (0..cols).map(|j| m.iter().map(|r| r[j]).sum::<f64>() / m.len() as f64).fold(f64::INFINITY, f64::min);
                rows.lock().unwrap().push((lo, hi, sol.value, support(&sol.row), support(&sol.col), la.len(), lb.len(), random_row));
            }
        }));
    }
    for h in handles {
        h.join().unwrap();
    }
    let all = rows.lock().unwrap();
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
        rules.name,
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

fn main() {
    let args: Vec<String> = std::env::args().collect();
    let cmd = args.get(1).map(|s| s.as_str()).unwrap_or("help");
    let rest = &args[2.min(args.len())..];
    let threads: u32 = arg(rest, "threads", "4").parse().unwrap();
    let seed: u64 = arg(rest, "seed", "1").parse().unwrap();
    match cmd {
        "validate" => validate(arg(rest, "file", "")),
        "match" => {
            let rules = variant(arg(rest, "rules", "base"));
            let t = run_match(&rules, arg(rest, "a", "random"), arg(rest, "b", "random"), arg(rest, "games", "100").parse().unwrap(), threads, seed, false);
            print_dynamics(&t);
        }
        "final" => {
            let rules = variant(arg(rest, "rules", "base"));
            final_stats(&rules, arg(rest, "policy", "mcts:1000"), arg(rest, "games", "100").parse().unwrap(), threads, seed);
        }
        "profile" => {
            // Self-play with search; reports per-turn effective number of orders (exp of
            // root policy entropy), orders above 10% probability, and legal orders.
            let rules = variant(arg(rest, "rules", "base"));
            let iters: u32 = arg(rest, "iters", "4000").parse().unwrap();
            let games: u32 = arg(rest, "games", "60").parse().unwrap();
            let mut eff = vec![0.0f64; rules.turns as usize];
            let mut big = vec![0.0f64; rules.turns as usize];
            let mut legal = vec![0.0f64; rules.turns as usize];
            let mut count = vec![0u32; rules.turns as usize];
            let mut l = ActionList::new();
            for g in 0..games {
                let mut rng = Rng::new(seed * 131 + g as u64);
                let mut st = rules.initial();
                let mut bots = [Mcts::new(iters), Mcts::new(iters)];
                bots[0].exact_last = true;
                bots[1].exact_last = true;
                while st.turn + 1 < rules.turns {
                    let mut act = [WAIT_ACTION; 2];
                    for seat in 0..2 {
                        rules.legal(&st, seat, &mut l);
                        if l.len == 1 { act[seat] = l.items[0]; continue; }
                        let pol = bots[seat].search(&rules, &st, seat, &mut rng);
                        let h: f64 = pol.iter().map(|(_, p)| if *p > 0.0 { -p * p.ln() } else { 0.0 }).sum();
                        let t = st.turn as usize;
                        eff[t] += h.exp();
                        big[t] += pol.iter().filter(|(_, p)| *p >= 0.1).count() as f64;
                        legal[t] += l.len as f64;
                        count[t] += 1;
                        let probs: Vec<f64> = pol.iter().map(|(_, p)| if *p < 0.1 { 0.0 } else { *p }).collect();
                        act[seat] = pol[sample(&probs, &mut rng)].0;
                    }
                    st = rules.step(&st, act[0], act[1]);
                }
            }
            let line: Vec<String> = (0..rules.turns as usize - 1).filter(|&t| count[t] > 0).map(|t| format!("t{}:{:.1}/{:.1}/{:.0}", t + 1, eff[t] / count[t] as f64, big[t] / count[t] as f64, legal[t] / count[t] as f64)).collect();
            let n: u32 = count.iter().sum();
            println!("{:<28} effective/over10%/legal per turn: {}  mean effective={:.2}", rules.name, line.join(" "), eff.iter().sum::<f64>() / n as f64);
        }
        "exact" => {
            let rules = variant(arg(rest, "rules", "base+ranks4+turns3+cp:2=1,3=1"));
            assert!(rules.tiebreak != Tiebreak::EarlierLead && rules.initiative == Initiative::None);
            let t0 = Instant::now();
            let mut solver = exact::Solver::new(&rules);
            let (value, dist) = solver.solve(&rules.initial());
            let (safe, total, _) = solver.safe_orders(&rules.initial());
            println!("    opening orders guaranteeing at least the value: {safe} of {total}");
            println!(
                "{:<40} exact value={:.6} equilibrium W/D/L={:.4}/{:.4}/{:.4} nodes={} mixed nodes={:.1}% time={:.1}s",
                rules.name, value, dist[0], dist[1], dist[2], solver.nodes, 100.0 * solver.mixed_nodes as f64 / solver.nodes.max(1) as f64, t0.elapsed().as_secs_f64()
            );
        }
        "puzzles" => {
            // Turn-11 positions from self-play where exactly `wins` orders win against every reply.
            let rules = variant(arg(rest, "rules", "base"));
            let spec = arg(rest, "policy", "mctsx:4000").to_string();
            let want: usize = arg(rest, "wins", "1").parse().unwrap();
            let games: u32 = arg(rest, "games", "200").parse().unwrap();
            let mut p0 = make_policy(&spec);
            let mut p1 = make_policy(&spec);
            let mut l = ActionList::new();
            let mut found = 0;
            for g in 0..games {
                let mut rng = Rng::new(seed * 977 + g as u64);
                let mut st = rules.initial();
                let mut transcript = Vec::new();
                while st.turn + 1 < rules.turns {
                    let a = p0.choose(&rules, &st, 0, &mut rng);
                    let b = p1.choose(&rules, &st, 1, &mut rng);
                    transcript.push((a, b));
                    st = rules.resolve(&st, a, b);
                }
                for seat in 0..2usize {
                    let (la, lb, m) = final_matrix(&rules, &st);
                    let (mine, theirs): (&Vec<Action>, &Vec<Action>) = if seat == 0 { (&la, &lb) } else { (&lb, &la) };
                    let value = |i: usize, j: usize| if seat == 0 { m[i][j] } else { 1.0 - m[j][i] };
                    let winners: Vec<usize> = (0..mine.len()).filter(|&i| (0..theirs.len()).all(|j| value(i, j) > 0.99)).collect();
                    let behind = st.scores[seat] <= st.scores[1 - seat];
                    if winners.len() == want && behind && mine.len() >= 12 {
                        let enc = |a: &Action| format!("{}{:x}{}", ["D", "S", "R"][a.kind as usize], a.card, if a.kind == RECALL { 0 } else { a.front + 1 });
                        let text: String = transcript.iter().map(|(a, b)| format!("{}{}", enc(a), enc(b))).collect();
                        let sols: Vec<String> = winners.iter().map(|&i| mine[i].text()).collect();
                        println!("seat={} scores={:?} orders={} winning={:?} transcript={}", seat, st.scores, mine.len(), sols, text);
                        found += 1;
                    }
                    rules.actions(&st.sides[seat], &mut l);
                }
            }
            println!("found {found} positions");
        }
        "selftest" => {
            // Debug builds assert the fast final-turn matrix equals full resolution.
            for name in ["base", "base+tbstr", "base+tbfinal", "base+tbhand", "base+exwin", "base+s111+tbfinal", "base+majority", "base+tbearly"] {
                let rules = variant(name);
                let mut rng = Rng::new(seed);
                let mut l = ActionList::new();
                for _ in 0..300 {
                    let mut st = rules.initial();
                    while st.turn + 1 < rules.turns {
                        rules.actions(&st.sides[0], &mut l);
                        let a = l.items[rng.below(l.len)];
                        rules.actions(&st.sides[1], &mut l);
                        let b = l.items[rng.below(l.len)];
                        st = rules.resolve(&st, a, b);
                    }
                    let _ = final_matrix(&rules, &st);
                }
            }
            println!("final matrices agree with full resolution");
        }
        "speed" => {
            let rules = variant(arg(rest, "rules", "base"));
            let mut rng = Rng::new(seed);
            let t0 = Instant::now();
            let mut n = 0u64;
            let mut l = ActionList::new();
            for _ in 0..200_000 {
                let mut st = rules.initial();
                while !rules.is_terminal(&st) {
                    rules.actions(&st.sides[0], &mut l);
                    let a = l.items[rng.below(l.len)];
                    rules.actions(&st.sides[1], &mut l);
                    let b = l.items[rng.below(l.len)];
                    st = rules.resolve(&st, a, b);
                    n += 1;
                }
            }
            println!("{} transitions in {:.2}s", n, t0.elapsed().as_secs_f64());
        }
        "symmetry" => {
            // Engine-level label-swap invariance on random play, through sequential steps too.
            let rules = variant(arg(rest, "rules", "base"));
            let mut rng = Rng::new(seed);
            let mut l = ActionList::new();
            let mut sequential = 0u64;
            for _ in 0..20_000 {
                let mut st = rules.initial();
                while !rules.is_terminal(&st) {
                    rules.legal(&st, 0, &mut l);
                    let a = l.items[rng.below(l.len)];
                    rules.legal(&st, 1, &mut l);
                    let b = l.items[rng.below(l.len)];
                    if rules.leader(&st).is_some() {
                        sequential += 1;
                    }
                    let next = rules.step(&st, a, b);
                    assert_eq!(rules.swap(&next), rules.step(&rules.swap(&st), b, a));
                    assert!(rules.conserved(&next));
                    st = next;
                }
            }
            println!("{}: 20000 random games preserve label-swap symmetry and card conservation ({} sequential decision points)", rules.name, sequential);
        }
        _ => {
            eprintln!("usage: sim <validate|match|final|speed|symmetry> key=value...");
        }
    }
}
