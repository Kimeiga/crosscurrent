mod bots;
mod exact;
mod game;
mod gops;
mod lp;
mod report;
mod search;

use bots::*;
use game::*;
use report::*;
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
                let margin = (st.scores[a_seat] - st.scores[1 - a_seat]) as f64;
                local.record(res_a, res0, margin, st.scores[0] == st.scores[1], &cps);
                local.a_time += times[a_seat];
                local.b_time += times[1 - a_seat];
                for p in 0..2 {
                    let who = if p == 0 { a_seat } else { 1 - a_seat };
                    for k in 0..3 {
                        local.kinds[p][k] += kinds[who][k];
                    }
                }
                if res0 != 0.5 {
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
        print_tally(&rules.name, a_spec, b_spec, &t);
    }
    t
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
    let rows = Arc::new(Mutex::new(Vec::<FinalRow>::new()));
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
                let (_, _, m) = final_matrix(&rules, &st);
                rows.lock().unwrap().push(final_row(&m));
            }
        }));
    }
    for h in handles {
        h.join().unwrap();
    }
    print_final(&rules.name, spec, &rows.lock().unwrap());
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
            let name = arg(rest, "rules", "base");
            let (a, b) = (arg(rest, "a", "random"), arg(rest, "b", "random"));
            let games: u32 = arg(rest, "games", "100").parse().unwrap();
            if gops::is_gops(name) {
                gops::run_match(&gops::variant(name), a, b, games, threads, seed);
            } else {
                let t = run_match(&variant(name), a, b, games, threads, seed, false);
                print_dynamics(&t);
            }
        }
        "final" => {
            let name = arg(rest, "rules", "base");
            let (policy, games) = (arg(rest, "policy", "mcts:1000"), arg(rest, "games", "100").parse().unwrap());
            if gops::is_gops(name) {
                gops::final_stats(&gops::variant(name), policy, games, threads, seed);
            } else {
                final_stats(&variant(name), policy, games, threads, seed);
            }
        }
        "profile" if gops::is_gops(arg(rest, "rules", "")) => {
            let g = gops::variant(arg(rest, "rules", ""));
            let (near, purify) = (arg(rest, "near", "0.8").parse().unwrap(), arg(rest, "purify", "0.2").parse().unwrap());
            gops::profile(&g, arg(rest, "iters", "4000").parse().unwrap(), arg(rest, "games", "60").parse().unwrap(), seed, near, purify);
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
        "exact" if gops::is_gops(arg(rest, "rules", "")) => {
            let g = gops::variant(arg(rest, "rules", ""));
            let t0 = Instant::now();
            let mut solver = gops::Exact::new(&g);
            let (value, dist) = solver.solve_game();
            println!(
                "{:<40} exact value={:.6} equilibrium W/D/L={:.4}/{:.4}/{:.4} nodes={} mixed nodes={:.1}% time={:.1}s",
                g.name, value, dist[0], dist[1], dist[2], solver.nodes, 100.0 * solver.mixed_nodes as f64 / solver.nodes.max(1) as f64, t0.elapsed().as_secs_f64()
            );
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
        "symmetry" if gops::is_gops(arg(rest, "rules", "")) => gops::check(&gops::variant(arg(rest, "rules", "")), seed),
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
            eprintln!("usage: sim <validate|match|final|exact|profile|puzzles|selftest|speed|symmetry> key=value... (rules=gops... selects GOPS for match, final, exact and symmetry)");
        }
    }
}
