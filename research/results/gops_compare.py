#!/usr/bin/env python3
"""Tables for the Crosscurrent-versus-GOPS comparison (run-gops.sh, run-gops-robustness.sh), and its entry in docs/BENCHMARKS.json.
Run from research/results: python3 gops_compare.py            (prints the tables)
                           python3 gops_compare.py --write    (also updates docs/BENCHMARKS.json)"""
import json, re, sys
from finalists import pool
from to_json import records

PAIRS = {('mctsx:4000', 'mctsx:1000'): '4k vs 1k', ('mctsx:16000', 'mctsx:4000'): '16k vs 4k', ('mcts:4000', 'mcts:1000'): 'plain 4k vs 1k',
         ('mctsx:64000', 'mctsx:16000'): '64k vs 16k', ('mctsx:4000', 'mctsx:4000'): 'self'}
LADDER = ('4k vs 1k', '16k vs 4k', 'plain 4k vs 1k')
NAMES = {'base+s234+tbstr': 'Crosscurrent v0.3', 'gops': 'GOPS', 'gops+asc': 'GOPS, fixed prize order'}
SETTINGS = {('base+s234+tbstr', ''): 'tuned: rollouts deploy 90%, purification 0.1',
            ('base+s234+tbstr', 'u'): 'uniform rollouts, purification 0.1',
            ('base+s234+tbstr', 'p0'): 'rollouts deploy 90%, no purification',
            ('gops', 'r0.8:p0.2'): 'tuned: rollouts bid nearest the prize 80%, purification 0.2',
            ('gops', ''): 'uniform rollouts, purification 0.1 (untuned)',
            ('gops', 'r0.8'): 'rollouts bid nearest the prize 80%, purification 0.1',
            ('gops', 'r0.8:p0'): 'rollouts bid nearest the prize 80%, no purification'}
base = lambda spec: ':'.join(spec.split(':')[:2])  # drop tuning options such as :r0.8:p0.2
options = lambda spec: ':'.join(spec.split(':')[2:])
MATCH = r'(\S+)\s+(\S+) vs (\S+)\s+n=(\d+)\s+A=([\d.]+)±([\d.]+)\s+W/D/L (\d+)/(\d+)/(\d+)\s+draw=([\d.]+)%\s+seat0=([\d.]+)'

def load(path='gops.log'):
    runs, finals = {}, {}
    lines = open(path).read().splitlines()
    for i, line in enumerate(lines):
        m = re.match(MATCH, line)
        if m:
            key = PAIRS.get((base(m.group(2)), base(m.group(3))))
            if not key: continue
            rec = dict(n=int(m.group(4)), w=int(m.group(7)), d=int(m.group(8)), l=int(m.group(9)), seat0=float(m.group(11)), opts=options(m.group(2)))
            c = re.search(r'cp1=([\d.]+)% cp2=([\d.]+)%\s+lead changes/game=([\d.]+)', lines[i + 1]) if i + 1 < len(lines) else None
            if c: rec.update(cp1=float(c.group(1)), cp2=float(c.group(2)), lc=float(c.group(3)))
            runs.setdefault(m.group(1), {}).setdefault(key, []).append(rec)
            continue
        f = re.match(r'(\S+)\s+final turn via \S+\s+n=(\d+) saddle=([\d.]+)% \(already decided ([\d.]+)%\).*mean guess width=([\d.]+)\s+'
                     r'mixed support=([\d.]+) of ([\d.]+) actions\s+NE-minus-random=([\d.]+).*width hist \[(.*)\]', line)
        if f:
            n = int(f.group(2)) or 1
            hist = {k: int(v) for k, v in re.findall(r'\("([\d.]+)", (\d+)\)', f.group(9))}
            finals[f.group(1)] = dict(n=n, saddle=float(f.group(3)), decided=float(f.group(4)), guess=100 * hist.get('1.0', 0) / n,
                                      support=float(f.group(6)), actions=float(f.group(7)), random_cost=float(f.group(8)))
    return runs, finals

def summary(runs, finals):
    out = []
    for name in NAMES:
        r = runs.get(name)
        if not r: continue
        n, w, d, l, a, ci = pool([x for k in LADDER for x in r.get(k, [])])
        row = {"rules": name, "game": NAMES[name], "ladder_games": n, "stronger_wdl": [w, d, l], "stronger_expected_result_pct": round(100 * a, 1), "ci95_halfwidth_pct": round(100 * ci, 1),
               "by_pairing_expected_result_pct": {k: round(100 * pool(r[k])[4], 1) for k in LADDER + ('64k vs 16k',) if k in r},
               "by_pairing_ci95_halfwidth_pct": {k: round(100 * pool(r[k])[5], 1) for k in LADDER + ('64k vs 16k',) if k in r},
               "by_pairing_draw_pct": {k: round(100 * pool(r[k])[2] / pool(r[k])[0], 1) for k in LADDER + ('64k vs 16k',) if k in r}}
        if 'self' in r:
            s, l1 = r['self'][0], r['4k vs 1k'][0]
            row.update({"self_play_draw_pct": round(100 * s['d'] / s['n'], 1), "self_play_seat0_pct": round(100 * s['seat0'], 1),
                        "winner_behind_at_one_third_pct": {"4k_vs_1k": l1['cp1'], "self_play": s['cp1']},
                        "winner_behind_at_two_thirds_pct": {"4k_vs_1k": l1['cp2'], "self_play": s['cp2']},
                        "lead_changes_per_game": {"4k_vs_1k": l1['lc'], "self_play": s['lc']}})
        if name in finals:
            f = finals[name]
            row.update({"last_decision_positions": f['n'], "last_decision_saddle_pct": f['saddle'], "last_decision_already_decided_pct": f['decided'],
                        "last_decision_pure_guess_pct": round(f['guess'], 1), "last_decision_mean_actions": f['actions'],
                        "last_decision_mixed_support": f['support'], "last_decision_cost_of_random_play": f['random_cost']})
        out.append(row)
    return out

def settings_rows(paths=('gops.log', 'gops-robustness.log')):
    """The 4k-vs-1k pairing under each bot setting measured, tuned or not."""
    rows = []
    for path in paths:
        for name, r in load(path)[0].items():
            for rec in r.get('4k vs 1k', []):
                label = SETTINGS.get((name, rec['opts']))
                if not label: continue
                n, w, d, l, a, ci = pool([rec])
                rows.append({"rules": name, "game": NAMES[name], "settings": label, "games": n, "expected_result_pct": round(100 * a, 1),
                             "ci95_halfwidth_pct": round(100 * ci, 1), "draw_pct": round(100 * d / n, 1), "log": path})
    return sorted(rows, key=lambda x: (list(NAMES).index(x['rules']), not x['settings'].startswith('tuned')))

def exact_rows(path='gops-exact.log'):
    rows = []
    for line in open(path):
        m = re.match(r'(\S+)\s+exact value=([\d.]+) equilibrium W/D/L=([\d.]+)/([\d.]+)/([\d.]+) nodes=(\d+) mixed nodes=([\d.]+)%', line)
        if m:
            rows.append({"rules": m.group(1), "value": float(m.group(2)), "equilibrium_wdl_pct": [round(100 * float(m.group(i)), 1) for i in (3, 4, 5)],
                         "decisive_pct": round(100 * (float(m.group(3)) + float(m.group(5))), 1), "decision_nodes": int(m.group(6)), "mixed_nodes_pct": float(m.group(7))})
    return rows

def profile_rows(path='gops-profile.log'):
    rows, iters = [], None
    for line in open(path):
        h = re.match(r'=== profile iters=(\d+)', line)
        if h: iters = int(h.group(1)); continue
        m = re.match(r'(\S+)\s+effective/over10%/legal per turn: (.*)  mean effective=([\d.]+)', line)
        if m:
            per = [tuple(float(x) for x in t.split(':')[1].split('/')) for t in m.group(2).split()]
            rows.append({"rules": m.group(1), "iterations": iters, "mean_effective_moves": float(m.group(3)),
                         "mean_moves_over_10pct": round(sum(t[1] for t in per) / len(per), 2),
                         "per_turn_effective_over10pct_legal": [list(t) for t in per]})
    return rows

def tables(rows, settings):
    p = lambda x: f"{x:.1f}%"
    print('| Game | Ladder games | Stronger bot wins / draws / losses | Expected result for the stronger bot | 4k vs 1k | 16k vs 4k | plain 4k vs 1k | 64k vs 16k |')
    print('| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |')
    for r in rows:
        w, d, l = r['stronger_wdl']; n = r['ladder_games']; b = r['by_pairing_expected_result_pct']
        print(f"| {r['game']} | {n:,} | {p(100 * w / n)} / {p(100 * d / n)} / {p(100 * l / n)} | **{r['stronger_expected_result_pct']:.1f}%** ±{r['ci95_halfwidth_pct']:.1f} | "
              + ' | '.join(p(b[k]) if k in b else '–' for k in LADDER + ('64k vs 16k',)) + ' |')
    print()
    print('| Game | Self-play draws | Self-play seat 0 | Winner behind at one third (4k vs 1k / self-play) | Winner behind at two thirds (4k vs 1k / self-play) | Lead changes per game (4k vs 1k / self-play) |')
    print('| --- | ---: | ---: | ---: | ---: | ---: |')
    for r in rows:
        if 'self_play_draw_pct' not in r: continue
        w1, w2, lc = r['winner_behind_at_one_third_pct'], r['winner_behind_at_two_thirds_pct'], r['lead_changes_per_game']
        print(f"| {r['game']} | {p(r['self_play_draw_pct'])} | {p(r['self_play_seat0_pct'])} | {p(w1['4k_vs_1k'])} / {p(w1['self_play'])} | "
              f"{p(w2['4k_vs_1k'])} / {p(w2['self_play'])} | {lc['4k_vs_1k']:.2f} / {lc['self_play']:.2f} |")
    print()
    print('| Game | Positions | Saddle point (result already settled) | Whole-game guess | Moves per player | Equilibrium support when mixed | Cost of choosing at random |')
    print('| --- | ---: | ---: | ---: | ---: | ---: | ---: |')
    for r in rows:
        if 'last_decision_saddle_pct' not in r: continue
        print(f"| {r['game']} | {r['last_decision_positions']:,} | {p(r['last_decision_saddle_pct'])} ({p(r['last_decision_already_decided_pct'])}) | "
              f"{p(r['last_decision_pure_guess_pct'])} | {r['last_decision_mean_actions']:.1f} | {r['last_decision_mixed_support']:.2f} | {r['last_decision_cost_of_random_play']:.3f} |")
    print()
    print('| Game | Bot settings (both bots) | 4k vs 1k: expected result (games) | Draws |')
    print('| --- | --- | ---: | ---: |')
    for s in settings:
        print(f"| {s['game']} | {s['settings']} | {s['expected_result_pct']:.1f}% ±{s['ci95_halfwidth_pct']:.1f} ({s['games']:,}) | {p(s['draw_pct'])} |")

if __name__ == '__main__':
    rows, settings = summary(*load()), settings_rows()
    tables(rows, settings)
    if '--write' in sys.argv:
        path = '../../docs/BENCHMARKS.json'
        data = json.load(open(path))
        data['crosscurrent_vs_gops_2026'] = {
            "evidence": "Simulation with one search bot for both games unless marked exact. Exact rows solve small decks completely (one equilibrium; others may exist). Last-decision rows solve exactly the last real decision of positions sampled from bot self-play.",
            "harness": "research/sim (Rust); one SM-MCTS implementation (src/search.rs) searches both games; seats alternate; draws count one half; 95% intervals; logs and scripts in research/results",
            "bot_settings": {"crosscurrent": "mctsx defaults: rollouts deploy 90% of the time, exploration 0.2, purification 0.1 (rechecked on v0.3 in gops-tuning.log)",
                             "gops": "rollouts bid the card nearest the prize 80% of the time, exploration 0.2, purification 0.2 (chosen by head-to-head duels in gops-tuning.log)"},
            "gops_rules": "13 cards each, prizes 1-13 shuffled and revealed one at a time, higher bid scores the prize, ties score for nobody, no tiebreak; gops+asc reveals the prizes in ascending order",
            "protocol": "fresh seeds per game: 4k vs 1k (2,400 games), 16k vs 4k (1,200), plain 4k vs 1k (1,200), 64k vs 16k (400), 4k self-play (1,200), exact last decision of 1,200 self-play positions; the ladder pools the first three pairings. Robustness: 4k vs 1k (1,200 games) under other bot settings (run-gops-robustness.sh)",
            "caveat": "Bot-specific. Below 64,000 iterations the GOPS bot loses to the fixed rule 'bid one above the prize', so the GOPS figures describe this search family more than strong GOPS play. Iteration counts are not equal reasoning across games. No human games.",
            "summary": rows,
            "ladder_4k_vs_1k_by_bot_settings": settings,
            "exact_small_decks": exact_rows(),
            "effective_moves_profile": profile_rows(),
            "tuning_and_baselines": records(['gops-tuning.log']),
            "robustness_runs": records(['gops-robustness.log']),
        }
        with open(path, 'w') as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
            f.write('\n')
        print(f"\nwrote crosscurrent_vs_gops_2026 with {len(rows)} games")
