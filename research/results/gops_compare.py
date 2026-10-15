#!/usr/bin/env python3
"""Tables for the Crosscurrent-versus-GOPS comparison (run-gops.sh), and its entry in docs/BENCHMARKS.json.
Run from research/results: python3 gops_compare.py            (prints the tables)
                           python3 gops_compare.py --write    (also updates docs/BENCHMARKS.json)"""
import json, re, sys
from finalists import pool
from to_json import records

PAIRS = {('mctsx:4000', 'mctsx:1000'): '4k vs 1k', ('mctsx:16000', 'mctsx:4000'): '16k vs 4k', ('mcts:4000', 'mcts:1000'): 'plain 4k vs 1k',
         ('mctsx:64000', 'mctsx:16000'): '64k vs 16k', ('mctsx:4000', 'mctsx:4000'): 'self'}
LADDER = ('4k vs 1k', '16k vs 4k', 'plain 4k vs 1k')
NAMES = {'base+s234+tbstr': 'Crosscurrent v0.3', 'gops': 'GOPS', 'gops+asc': 'GOPS, fixed prize order'}
base = lambda spec: ':'.join(spec.split(':')[:2])  # drop tuning options such as :r0.8:p0.2

def load(path='gops.log'):
    runs, finals = {}, {}
    lines = open(path).read().splitlines()
    for i, line in enumerate(lines):
        m = re.match(r'(\S+)\s+(\S+) vs (\S+)\s+n=(\d+)\s+A=([\d.]+)±([\d.]+)\s+W/D/L (\d+)/(\d+)/(\d+)\s+draw=([\d.]+)%\s+seat0=([\d.]+)', line)
        if m:
            key = PAIRS.get((base(m.group(2)), base(m.group(3))))
            if not key: continue
            rec = dict(n=int(m.group(4)), w=int(m.group(7)), d=int(m.group(8)), l=int(m.group(9)), seat0=float(m.group(11)))
            c = re.search(r'cp1=([\d.]+)% cp2=([\d.]+)%\s+lead changes/game=([\d.]+)', lines[i + 1]) if i + 1 < len(lines) else None
            if c: rec.update(cp1=float(c.group(1)), cp2=float(c.group(2)), lc=float(c.group(3)))
            runs.setdefault(m.group(1), {}).setdefault(key, []).append(rec)
            continue
        f = re.match(r'(\S+)\s+final turn via \S+\s+n=(\d+) saddle=([\d.]+)% \(already decided ([\d.]+)%\).*mean guess width=([\d.]+)\s+mixed support=([\d.]+) of ([\d.]+) actions.*width hist \[(.*)\]', line)
        if f:
            n = int(f.group(2)) or 1
            hist = {k: int(v) for k, v in re.findall(r'\("([\d.]+)", (\d+)\)', f.group(8))}
            finals[f.group(1)] = dict(n=n, saddle=float(f.group(3)), decided=float(f.group(4)), guess=100 * hist.get('1.0', 0) / n, actions=float(f.group(7)))
    return runs, finals

def summary(runs, finals):
    out = []
    for name in NAMES:
        r = runs.get(name)
        if not r: continue
        n, w, d, l, a, ci = pool([x for k in LADDER for x in r.get(k, [])])
        row = {"rules": name, "game": NAMES[name], "ladder_games": n, "stronger_wdl": [w, d, l], "stronger_expected_result_pct": round(100 * a, 1), "ci95_halfwidth_pct": round(100 * ci, 1),
               "by_pairing_expected_result_pct": {k: round(100 * pool(r[k])[4], 1) for k in LADDER + ('64k vs 16k',) if k in r},
               "by_pairing_draw_pct": {k: round(100 * pool(r[k])[2] / pool(r[k])[0], 1) for k in LADDER + ('64k vs 16k',) if k in r}}
        if 'self' in r:
            s = r['self'][0]
            row.update({"self_play_draw_pct": round(100 * s['d'] / s['n'], 1), "self_play_seat0_pct": round(100 * s['seat0'], 1),
                        "winner_behind_at_two_thirds_pct": {"4k_vs_1k": r['4k vs 1k'][0]['cp2'], "self_play": s['cp2']},
                        "winner_behind_at_one_third_pct": {"4k_vs_1k": r['4k vs 1k'][0]['cp1'], "self_play": s['cp1']}})
        if name in finals:
            f = finals[name]
            row.update({"last_decision_positions": f['n'], "last_decision_saddle_pct": f['saddle'], "last_decision_already_decided_pct": f['decided'],
                        "last_decision_pure_guess_pct": round(f['guess'], 1), "last_decision_mean_actions": f['actions']})
        out.append(row)
    return out

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
                         "per_turn_effective_over10pct_legal": [list(t) for t in per]})
    return rows

def tables(rows):
    p = lambda x: f"{x:.1f}%"
    print('| Game | Ladder games | Stronger bot wins / draws / losses | Expected result for the stronger bot | 4k vs 1k | 16k vs 4k | plain 4k vs 1k | 64k vs 16k |')
    print('| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |')
    for r in rows:
        w, d, l = r['stronger_wdl']; n = r['ladder_games']; b = r['by_pairing_expected_result_pct']
        print(f"| {r['game']} | {n:,} | {p(100 * w / n)} / {p(100 * d / n)} / {p(100 * l / n)} | **{r['stronger_expected_result_pct']:.1f}%** ±{r['ci95_halfwidth_pct']:.1f} | "
              + ' | '.join(p(b[k]) if k in b else '–' for k in LADDER + ('64k vs 16k',)) + ' |')
    print()
    print('| Game | Self-play draws | Self-play seat 0 | Winner behind at two thirds (4k vs 1k / self-play) | Last decision: saddle (already decided) | Last decision: pure guess | Moves at the last decision |')
    print('| --- | ---: | ---: | ---: | ---: | ---: | ---: |')
    for r in rows:
        if 'self_play_draw_pct' not in r or 'last_decision_saddle_pct' not in r: continue
        wb = r['winner_behind_at_two_thirds_pct']
        print(f"| {r['game']} | {p(r['self_play_draw_pct'])} | {p(r['self_play_seat0_pct'])} | {p(wb['4k_vs_1k'])} / {p(wb['self_play'])} | "
              f"{p(r['last_decision_saddle_pct'])} ({p(r['last_decision_already_decided_pct'])}) | {p(r['last_decision_pure_guess_pct'])} | {r['last_decision_mean_actions']:.1f} |")

if __name__ == '__main__':
    rows = summary(*load())
    tables(rows)
    if '--write' in sys.argv:
        path = '../../docs/BENCHMARKS.json'
        data = json.load(open(path))
        data['crosscurrent_vs_gops_2026'] = {
            "evidence": "Simulation with one search bot for both games unless marked exact. Exact rows solve small decks completely (one equilibrium; others may exist).",
            "harness": "research/sim (Rust); one SM-MCTS implementation (src/search.rs) searches both games; seats alternate; draws count one half; 95% intervals; logs and scripts in research/results",
            "bot_settings": {"crosscurrent": "mctsx defaults: rollouts deploy 90% of the time, exploration 0.2, purification 0.1 (rechecked on v0.3 in gops-tuning.log)",
                             "gops": "rollouts bid the card nearest the prize 80% of the time, exploration 0.2, purification 0.2 (chosen by head-to-head duels in gops-tuning.log)"},
            "gops_rules": "13 cards each, prizes 1-13 shuffled and revealed one at a time, higher bid scores the prize, ties score for nobody; gops+asc reveals the prizes in ascending order",
            "protocol": "fresh seeds per game: 4k vs 1k (2,400 games), 16k vs 4k (1,200), plain 4k vs 1k (1,200), 64k vs 16k (400), 4k self-play (1,200), exact last decision of 1,200 self-play positions",
            "summary": rows,
            "exact_small_decks": exact_rows(),
            "effective_moves_profile": profile_rows(),
            "tuning_and_baselines": records(['gops-tuning.log']),
        }
        with open(path, 'w') as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
            f.write('\n')
        print(f"\nwrote crosscurrent_vs_gops_2026 with {len(rows)} games")
