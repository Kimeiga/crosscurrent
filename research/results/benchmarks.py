#!/usr/bin/env python3
"""Writes the 2026 rule-variant study into docs/BENCHMARKS.json from the logs in this folder.
Run from research/results: python3 benchmarks.py"""
import json
from finalists import LADDER, load, pool
from to_json import records

SCREENING = ['sweep1.log', 'sweep1b.log']
FINALISTS = ['sweep3.log', 'sweep4.log', 'sweep6.log']
CALIBRATION = ['sweep5.log']

def finalist_summary():
    runs, order, finals = load(FINALISTS)
    out = []
    for name in order:
        ladder = [r for k in LADDER for r in runs[name].get(k, [])]
        if not ladder: continue
        n, w, d, l, a, ci = pool(ladder)
        row = {"rules": name, "games": n, "stronger_wdl": [w, d, l], "stronger_expected_result_pct": round(100 * a, 1), "ci95_halfwidth_pct": round(100 * ci, 1),
               "by_pairing_expected_result_pct": {k: round(100 * pool(runs[name][k])[4], 1) for k in LADDER if k in runs[name]}}
        level = [r for r in ladder if 'level' in r]
        if level:
            row["level_on_points_pct"] = round(100 * sum(r['level'] for r in level) / sum(r['n'] for r in level), 1)
            if '+tb' in name: row["level_games_won_lost_by_stronger"] = [sum(r['lw'] for r in level), sum(r['ll'] for r in level)]
        self_play = runs[name].get('self')
        if self_play:
            s = self_play[0]
            row.update({"self_play_draw_pct": round(100 * s['d'] / s['n'], 1), "self_play_seat0_pct": round(100 * s['seat0'], 1),
                        "winner_behind_after_turn8_pct": {"4k_vs_1k": runs[name]['4k vs 1k'][0]['cp2'], "self_play": s['cp2']},
                        "lead_changes_per_game_self_play": s['lc']})
        if name in finals:
            row.update({"final_turn_saddle_pct": finals[name]['saddle'], "final_turn_pure_guess_pct": round(finals[name]['guess'], 1)})
        out.append(row)
    return out

study = {
    "evidence": "Simulation with particular bots unless marked exact. Final-turn figures are exact solutions of positions sampled from bot self-play. Exact reduced-game values are exact for those reduced games only.",
    "harness": "research/sim (Rust); seats alternate; draws count one half; 95% intervals; logs and scripts in research/results",
    "metric_note": "stronger_expected_result_pct is the stronger bot's result with a draw counted one half: the chance that one game names the stronger bot if a draw were settled by a coin. Outright wins alone can rise without it when a tiebreak splits former draws evenly.",
    "pairings": {"4k vs 1k": "mctsx:4000 vs mctsx:1000", "16k vs 4k": "mctsx:16000 vs mctsx:4000", "plain 4k vs 1k": "mcts:4000 vs mcts:1000 (no exact final turn)"},
    "screening_protocol": "mctsx:4000 vs mctsx:1000 (400 or 600 games), mctsx:4000 self-play (400), exact final-turn analysis of 400 self-play positions; sweep 1 also mctsx:16000 vs mctsx:4000 (400) and mctsx:4000 vs random (200)",
    "finalist_protocol": "fresh seeds: 4k vs 1k (1,200), 16k vs 4k (600), plain 4k vs 1k (600), self-play (600), final-turn analysis (600); sweep 6 adds controls and a second batch (4k vs 1k 2,400, 16k vs 4k 600, plain 1,200) for the tiebreak candidates",
    "finalists_pooled": finalist_summary(),
    "exact_reduced_games": [
        {"ranks": 4, "turns": 3, "scoring": "1 then 2", "tiebreak": "none or final strength", "value": 0.5, "equilibrium_wdl_pct": [0, 100, 0], "openings_securing_value": "3 of 12"},
        {"ranks": 5, "turns": 4, "scoring": "1 then 2", "tiebreak": "none or final strength", "value": 0.5, "equilibrium_wdl_pct": [0, 100, 0], "openings_securing_value": "0 of 15"},
        {"ranks": 5, "turns": 4, "scoring": "1 then 1", "tiebreak": "none", "value": 0.5, "equilibrium_wdl_pct": [11.4, 77.1, 11.4], "openings_securing_value": "0 of 15"},
        {"ranks": 5, "turns": 4, "scoring": "1 then 1", "tiebreak": "final or total strength", "value": 0.5, "equilibrium_wdl_pct": [0, 100, 0], "openings_securing_value": "0 of 15"},
        {"ranks": 6, "turns": 5, "scoring": "1 then 2", "tiebreak": "none or final strength", "value": 0.5, "equilibrium_wdl_pct": [0, 100, 0], "openings_securing_value": "6 of 18"},
        {"ranks": 6, "turns": 5, "scoring": "1 then 1", "tiebreak": "final strength", "value": 0.5, "equilibrium_wdl_pct": [0, 100, 0], "openings_securing_value": "6 of 18"},
        {"ranks": 6, "turns": 5, "scoring": "1 then 1", "tiebreak": "total strength", "value": 0.5, "equilibrium_wdl_pct": [0, 100, 0], "openings_securing_value": "9 of 18"},
        {"ranks": 6, "turns": 5, "scoring": "1 then 1", "tiebreak": "none", "value": 0.5, "equilibrium_wdl_pct": [13.5, 72.9, 13.5], "openings_securing_value": "0 of 18"},
    ],
    "adopted": {"name": "v0.3", "rules": "base+s234+tbstr", "points_per_front": {"4": 2, "8": 3, "12": 4},
                "tiebreak": "total strength on all fronts summed over the three scorings, then draw",
                "status": "Adopted on simulation evidence; not yet tested with human players."},
    "product_levels_calibration": records(CALIBRATION),
    "scripted_probes_v03": records(['probes.log']),
    "screening_runs": records(SCREENING),
    "finalist_runs": records(FINALISTS),
}

if __name__ == '__main__':
    path = '../../docs/BENCHMARKS.json'
    data = json.load(open(path))
    data['crosscurrent_2026_rule_variant_study'] = study
    with open(path, 'w') as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
        f.write('\n')
    print(f"wrote {len(study['finalists_pooled'])} finalist summaries, {len(study['screening_runs'])} screening and {len(study['finalist_runs'])} finalist records")
