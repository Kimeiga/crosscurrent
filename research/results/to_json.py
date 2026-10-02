#!/usr/bin/env python3
"""Parse sweep logs into JSON records (one list entry per measured pairing or final-turn analysis)."""
import json, re, sys
out = []
for path in sys.argv[1:]:
    lines = open(path).read().splitlines()
    for i, line in enumerate(lines):
        m = re.match(r'(\S+)\s+(\S+) vs (\S+)\s+n=(\d+)\s+A=([\d.]+)±([\d.]+)\s+W/D/L (\d+)/(\d+)/(\d+)\s+draw=([\d.]+)%\s+seat0=([\d.]+)', line)
        if m:
            rec = {"log": path.split('/')[-1], "rules": m.group(1), "a": m.group(2), "b": m.group(3), "games": int(m.group(4)),
                   "a_result_pct": round(100 * float(m.group(5)), 1), "ci95_halfwidth_pct": round(100 * float(m.group(6)), 1),
                   "wdl": [int(m.group(7)), int(m.group(8)), int(m.group(9))], "seat0_result_pct": round(100 * float(m.group(11)), 1)}
            if i + 1 < len(lines):
                c = re.search(r'cp1=([\d.]+)% cp2=([\d.]+)%\s+lead changes/game=([\d.]+)', lines[i + 1])
                if c: rec.update({"winner_behind_after_turn4_pct": float(c.group(1)), "winner_behind_after_turn8_pct": float(c.group(2)), "lead_changes_per_game": float(c.group(3))})
            out.append(rec); continue
        f = re.match(r'(\S+)\s+final turn via (\S+)\s+n=(\d+) saddle=([\d.]+)%.*mean guess width=([\d.]+).*width hist \[(.*)\]', line)
        if f:
            n = int(f.group(3)) or 1
            hist = {k: int(v) for k, v in re.findall(r'\("([\d.]+)", (\d+)\)', f.group(6))}
            out.append({"log": path.split('/')[-1], "rules": f.group(1), "final_turn_positions_from": f.group(2), "simultaneous_final_turns": n,
                        "saddle_pct": float(f.group(4)), "mean_guess_width": float(f.group(5)), "pure_guess_width1_pct": round(100 * hist.get('1.0', 0) / n, 1)})
print(json.dumps(out, indent=1))
