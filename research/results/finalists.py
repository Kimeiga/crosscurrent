#!/usr/bin/env python3
"""Tables for the finalist sweeps (sweep3, sweep4, sweep6). All runs of the same rules and pairing are pooled.
Usage: finalists.py sweep3.log sweep4.log sweep6.log"""
import math, re, sys
PAIRS = {('mctsx:4000', 'mctsx:1000'): '4k vs 1k', ('mctsx:16000', 'mctsx:4000'): '16k vs 4k', ('mcts:4000', 'mcts:1000'): 'plain 4k vs 1k', ('mctsx:4000', 'mctsx:4000'): 'self'}
LADDER = ('4k vs 1k', '16k vs 4k', 'plain 4k vs 1k')
def load(paths):
    """Returns ({rules: {pairing: [run, ...]}}, rules in first-seen order, {rules: final-turn analysis})."""
    runs, order, finals = {}, [], {}
    def add(name, key, rec):
        if name not in runs: runs[name] = {}; order.append(name)
        runs[name].setdefault(key, []).append(rec)
    for path in paths:
        lines = open(path).read().splitlines()
        for i, line in enumerate(lines):
            m = re.match(r'(\S+)\s+(\S+) vs (\S+)\s+n=(\d+)\s+A=([\d.]+)±([\d.]+)\s+W/D/L (\d+)/(\d+)/(\d+)\s+draw=([\d.]+)%\s+seat0=([\d.]+)', line)
            if m:
                key = PAIRS.get((m.group(2), m.group(3)))
                if not key: continue
                rec = dict(n=int(m.group(4)), w=int(m.group(7)), d=int(m.group(8)), l=int(m.group(9)), seat0=float(m.group(11)))
                c = re.search(r'cp1=([\d.]+)% cp2=([\d.]+)%\s+lead changes/game=([\d.]+)', lines[i + 1]) if i + 1 < len(lines) else None
                if c: rec.update(cp2=float(c.group(2)), lc=float(c.group(3)))
                v = re.search(r'^\s+level on points=[\d.]+% \((\d+) games: A won (\d+), drew (\d+), lost (\d+)\)', lines[i + 2]) if i + 2 < len(lines) else None
                if v: rec.update(level=int(v.group(1)), lw=int(v.group(2)), ll=int(v.group(4)))
                add(m.group(1), key, rec)
                continue
            f = re.match(r'(\S+)\s+final turn via \S+\s+n=(\d+) saddle=([\d.]+)%.*mean guess width=([\d.]+).*width hist \[(.*)\]', line)
            if f:
                n = int(f.group(2)) or 1
                hist = {k: int(v) for k, v in re.findall(r'\("([\d.]+)", (\d+)\)', f.group(5))}
                finals[f.group(1)] = dict(n=n, saddle=float(f.group(3)), guess=100 * hist.get('1.0', 0) / n)
    return runs, order, finals

def pool(recs):
    N = sum(r['n'] for r in recs); W = sum(r['w'] for r in recs); D = sum(r['d'] for r in recs); L = sum(r['l'] for r in recs)
    a = (W + 0.5 * D) / N
    var = (W * (1 - a) ** 2 + D * (0.5 - a) ** 2 + L * a ** 2) / max(N - 1, 1)
    return N, W, D, L, a, 1.96 * math.sqrt(var / N)
p = lambda x, n: f"{100 * x / n:.1f}%"

def main(paths):
    runs, order, finals = load(paths)
    print('| Variant | Games | Stronger bot wins / draws / losses | Expected result for the stronger bot | Level on points | Tiebreak wins for the stronger bot |')
    print('| --- | ---: | ---: | ---: | ---: | ---: |')
    for name in order:
        recs = [r for k in LADDER for r in runs[name].get(k, [])]
        if not recs: continue
        N, W, D, L, a, ci = pool(recs)
        lv = [r for r in recs if 'level' in r]
        level = f"{p(sum(r['level'] for r in lv), sum(r['n'] for r in lv))} (n={sum(r['n'] for r in lv):,})" if lv else '–'
        lw, ll = sum(r.get('lw', 0) for r in lv), sum(r.get('ll', 0) for r in lv)
        tbw = f"{lw} of {lw + ll}" if lv and name.find('+tb') >= 0 else '–'
        print(f"| `{name}` | {N:,} | {p(W, N)} / {p(D, N)} / {p(L, N)} | **{100 * a:.1f}%** ±{100 * ci:.1f} | {level} | {tbw} |")
    print()
    print('| Variant | ' + ' | '.join(f'{k}: expected result (n)' for k in LADDER) + ' |')
    print('| --- | ' + ' | '.join('---:' for _ in LADDER) + ' |')
    for name in order:
        cells = []
        for k in LADDER:
            recs = runs[name].get(k, [])
            if not recs: cells.append('–'); continue
            N, W, D, L, a, ci = pool(recs)
            cells.append(f"{100 * a:.1f}% ±{100 * ci:.1f} ({N:,})")
        if any(c != '–' for c in cells): print(f"| `{name}` | " + ' | '.join(cells) + ' |')
    print()
    print('| Variant | Self-play draws | Self-play seat 0 | Final turn saddle | Final turn pure guess | Winner behind after turn 8 (4k vs 1k / self-play) | Lead changes (self-play) |')
    print('| --- | ---: | ---: | ---: | ---: | ---: | ---: |')
    for name in order:
        s = runs[name].get('self'); f = finals.get(name); l1 = runs[name].get('4k vs 1k')
        if not s or not f or not l1: continue
        s, l1 = s[0], l1[0]
        print(f"| `{name}` | {p(s['d'], s['n'])} | {100 * s['seat0']:.1f}% | {f['saddle']:.1f}% | {f['guess']:.1f}% | {l1['cp2']:.1f}% / {s['cp2']:.1f}% | {s['lc']:.2f} |")

if __name__ == '__main__':
    main(sys.argv[1:])
