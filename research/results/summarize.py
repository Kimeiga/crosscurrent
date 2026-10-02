#!/usr/bin/env python3
"""Condense sweep logs into one row per variant."""
import re, sys
rows = {}
order = []
cur = None
for path in sys.argv[1:]:
    for line in open(path):
        m = re.match(r'=== (\S+)', line)
        if m:
            cur = m.group(1); order.append(cur) if cur not in rows else None; rows.setdefault(cur, {}); continue
        m = re.match(r'(\S+)\s+(\S+) vs (\S+)\s+n=(\d+)\s+A=([\d.]+)±([\d.]+)\s+W/D/L (\d+)/(\d+)/(\d+)\s+draw=([\d.]+)%', line)
        if m:
            name, a, b = m.group(1), m.group(2), m.group(3)
            if name not in rows: rows[name] = {}; order.append(name)
            key = {('mctsx:4000','mctsx:1000'):'L1', ('mctsx:16000','mctsx:4000'):'L2', ('mctsx:4000','mctsx:4000'):'self', ('mctsx:4000','random'):'rand'}.get((a,b), f'{a}/{b}')
            rows[name][key] = (float(m.group(5)), float(m.group(6)), float(m.group(10)), int(m.group(7)), int(m.group(8)), int(m.group(9)))
            continue
        m = re.match(r'(\S+)\s+final turn via \S+\s+n=(\d+) saddle=([\d.]+)%.*mean guess width=([\d.]+).*width hist \[(.*)\]', line)
        if m:
            name = m.group(1)
            hist = dict(re.findall(r'\("([\d.]+)", (\d+)\)', m.group(5)))
            n = int(m.group(2)) or 1
            rows.setdefault(name, {})['final'] = (float(m.group(3)), float(m.group(4)), 100*int(hist.get('1.0',0))/n)
        m = re.match(r'\s+final turns that were sequential: (\d+) of (\d+)', line)
        if m and cur: rows.setdefault(cur, {})['seq'] = (int(m.group(1)), int(m.group(2)))
print(f"{'variant':<24} {'4k>1k':>8} {'16k>4k':>8} {'avg':>6} {'draw%(self)':>11} {'saddle%':>8} {'width':>6} {'guess%':>7} {'seqfinal':>9}")
for name in order:
    r = rows[name]
    l1 = r.get('L1'); l2 = r.get('L2'); s = r.get('self'); f = r.get('final'); q = r.get('seq')
    avg = (l1[0] + l2[0]) / 2 if l1 and l2 else None
    fmt = lambda x: f"{x[0]*100:5.1f}" if x else '   - '
    print(f"{name:<24} {fmt(l1):>8} {fmt(l2):>8} {avg*100 if avg else 0:6.1f} {s[2] if s else 0:11.1f} {f[0] if f else 0:8.1f} {f[1] if f else 0:6.3f} {f[2] if f else 0:7.1f} {str(q[0])+'/'+str(q[1]) if q else '':>9}")
