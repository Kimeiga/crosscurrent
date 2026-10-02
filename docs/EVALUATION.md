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
13. Single-game evidence: the outright win, draw and loss rates of a stronger policy against a weaker one (for example a 4x search budget) together with its expected result (a draw counts one half). The expected result is the chance that one game names the stronger player when a draw is settled by a coin. A rule that turns draws into decisions without favoring the stronger player raises decisiveness but not this number, so for any tiebreak also report how often it decides games and how often it favors the stronger policy.
14. Final-turn guess share: on positions sampled from strong play, how often the last turn has a saddle point (decided by calculation) versus a pure win/loss guess, solved exactly.
15. Simple-rule probes: fixed scripted strategies (stack one front, play high where behind, play low where behind, pile onto a won front, mirror the opponent) against a search bot. A variant whose steep search ladder coexists with a scripted rule matching the search bot is shallow, not deep.
16. Comeback structure under equal-strength play: how often the eventual winner trailed after each scoring, and lead changes per game.

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
- 2026 audit of v0.2 (simulation): each 4x search budget won 70–74% (`mctsx` 1k→4k→16k→64k); draws rose with strength (13.8% → 17.8%); in strong self-play 42.5% of games reached a final turn decided by a pure win/loss guess; the shipped "Deep" level was no stronger than "Tactical" (48.9%).
- 2026 rule-variant study (simulation, pooled over three pairings with a 4x search gap): the stronger bot's expected result was 73.5% under v0.2 with 13.8% draws, 73.5% under v0.2 with a last-scoring strength tiebreak, and 76.5% under v0.3 (2/3/4 points, total-strength tiebreak) with one draw in 6,600 games.

Every benchmark must retain its original caveat: these full-game bots were not proven optimal unless explicitly described as an exact reduced-game result.
