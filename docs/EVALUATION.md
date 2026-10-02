# Evaluation Targets

Crosscurrent is not "done" when identical bots produce 50/50 self-play.

Use this checklist when evaluating rule or AI changes.

## Structural invariants

- identical starting rank resources,
- identical information,
- identical legal action rules,
- simultaneous commitment,
- no first-player scoring privilege,
- deterministic resolution after both orders are known.

## Metrics to report

1. Fixed-seat win / loss / draw counts.
2. Expected result where draw = 0.5.
3. Confidence interval for result.
4. Swapped-player invariant.
5. Stronger-search versus weaker-search result.
6. Approximate exploitability or best-response gain.
7. Draw rate across multiple policy classes.
8. Effective action entropy, not only raw legal branching factor.
9. Best-action versus second-best-action value gaps in solved/sample positions.
10. Comeback rate after turns 4 and 8.
11. Reduced-game exact equilibrium results when computationally feasible.
12. Human playtest data on clarity, planning, tension, and perceived agency.

## Benchmark facts retained for comparison

- Piquet full six-deal identical-bot result: 49.66%, 95% interval 48.86-50.45, 0% draws.
- Schnapsen race-to-seven identical-bot result: 50.54%, 95% interval 49.74-51.33, 0% draws.
- GOPS full game identical-bot result: 50.07%, 95% interval 49.30-50.83.
- GOPS draw rate varied from 27.79% in one pairing to 0.26% in another.
- Piquet single-deal elder result: 61.44%.
- More-informed versus simpler bot: Piquet 81.08%, Schnapsen 56.90%, GOPS 88.02%.
- Schnapsen 8 hidden-hand samples versus 2: 70.31% over 512 games.
- In 1,000 deducible Schnapsen endgames, 342 had both a forcing win move and a forcing loss move.
- GOPS prize-value mirror policy: 5,000 / 5,000 draws, yet the simple exploit won 78-13.
- Reduced five-card exact GOPS pairing: 33.45% win / 33.09% draw / 33.45% loss.
- Early Crosscurrent tactical versus random: 96.8% over 2,000.
- Early Crosscurrent tactical versus deployment-only builder: 66.0% over 2,000.
- Early Crosscurrent tactical self-play: 476-452-72 over 1,000, expected result 51.2%, draw rate 7.2%.

Every benchmark must retain its original caveat: these full-game bots were not proven optimal unless explicitly described as an exact reduced-game result.
