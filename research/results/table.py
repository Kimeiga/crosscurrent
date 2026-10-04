#!/usr/bin/env python3
"""Markdown table of the screening sweeps: one row per variant, first L1 run found."""
import re, sys
rows, order = {}, []
for path in sys.argv[1:]:
    for line in open(path):
        m = re.match(r'(\S+)\s+(\S+) vs (\S+)\s+n=(\d+)\s+A=([\d.]+)±([\d.]+)\s+W/D/L (\d+)/(\d+)/(\d+)\s+draw=([\d.]+)%', line)
        if m:
            name, a, b, n = m.group(1), m.group(2), m.group(3), int(m.group(4))
            if name not in rows: rows[name] = {}; order.append(name)
            w, d, l = int(m.group(7)), int(m.group(8)), int(m.group(9))
            if (a, b) == ('mctsx:4000', 'mctsx:1000') and 'L1' not in rows[name]: rows[name]['L1'] = (n, w, d, l, float(m.group(5)), float(m.group(6)))
            if (a, b) == ('mctsx:4000', 'mctsx:4000') and 'self' not in rows[name]: rows[name]['self'] = (n, d)
            continue
        m2 = re.match(r'(\S+)\s+final turn via \S+\s+n=(\d+) saddle=([\d.]+)%.*width hist \[(.*)\]', line)
        if m2:
            name = m2.group(1); n = int(m2.group(2)) or 1
            hist = dict(re.findall(r'\("([\d.]+)", (\d+)\)', m2.group(4)))
            rows.setdefault(name, {}).setdefault('final', (float(m2.group(3)), 100 * int(hist.get('1.0', 0)) / n, n))
# comeback stats: the line after a 4k self-play result
for path in sys.argv[1:]:
    lines = open(path).read().splitlines()
    for i, line in enumerate(lines):
        m = re.match(r'(\S+)\s+mctsx:4000 vs mctsx:4000', line)
        if m and i + 1 < len(lines):
            c = re.search(r'cp2=([\d.]+)%\s+lead changes/game=([\d.]+)', lines[i + 1])
            if c: rows[m.group(1)].setdefault('comeback', (float(c.group(1)), float(c.group(2))))
print('| Variant | 4k vs 1k: strong wins / draws / upsets | Self-play draws | Final turn saddle | Final turn pure guess | Winner behind after turn 8 | Lead changes |')
print('| --- | ---: | ---: | ---: | ---: | ---: | ---: |')
for name in order:
    r = rows[name]
    if 'L1' not in r: continue
    n, w, d, l, a, ci = r['L1']
    s = r.get('self'); f = r.get('final'); c = r.get('comeback')
    sd = f"{100*s[1]/s[0]:.1f}%" if s else '–'
    fs = f"{f[0]:.1f}%" if f and f[2] >= 200 else ('–' if not f else f"({f[0]:.0f}%, n={f[2]})")
    fg = f"{f[1]:.1f}%" if f and f[2] >= 200 else ('–' if not f else f"({f[1]:.0f}%)")
    cb = f"{c[0]:.1f}%" if c else '–'
    lc = f"{c[1]:.2f}" if c else '–'
    print(f"| `{name}` | {100*w/n:.1f}% / {100*d/n:.1f}% / {100*l/n:.1f}% (n={n}) | {sd} | {fs} | {fg} | {cb} | {lc} |")
