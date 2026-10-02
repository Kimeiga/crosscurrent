# AGENTS.md

## Project north star

Crosscurrent exists to test a specific game-design hypothesis:

> Can an original two-player card game be structurally fair from the first game, avoid seat/deal luck, offer many meaningful tactical choices, and allow stronger reasoning to create a measurable advantage?

Do not treat this repo as merely a web UI implementation. The rules, AI, simulations, and product are all part of that research objective.

## Required reading before changing game rules, scoring, AI evaluation, or core UX

Read these first:

1. `docs/RESEARCH.md` — full origin, benchmark data, statistical caveats, rejected prototypes, and open questions.
2. `docs/DESIGN_DECISIONS.md` — compact decision log explaining why the current mechanics exist.
3. `docs/EVALUATION.md` — metrics required to evaluate a change.
4. `docs/BENCHMARKS.json` — machine-readable historical measurements.
5. `docs/RULES.md` — current authoritative rules.
6. `tests/GOLDEN.md` — independent reference-state verification philosophy.

## Non-negotiable reasoning standards

- Never call 50/50 identical-bot self-play proof of depth.
- Never call the current full-size AI optimal.
- Distinguish exact reduced-game solutions from simulations.
- Preserve structural symmetry unless a change explicitly abandons that project goal.
- Report draws separately from expected result.
- Do not remove a mechanic simply because it looks complex without checking which design problem it was introduced to solve.
- When changing rules, re-evaluate fixed-seat symmetry, skill sensitivity, exploitability proxies, draw behavior, effective branching, and comeback structure.
- Keep all historical benchmark numbers and their caveats intact even if later experiments supersede them.

## Product standard

The browser game should make the underlying game easy to understand and evaluate:

- mobile web and desktop web are first-class,
- Play vs AI should be immediate,
- private online play must keep current orders hidden until both players commit,
- local pass-and-play should remain available,
- the homepage should show a legal full game rather than require a wall of explanatory copy,
- copy should be plain and descriptive, not grandiose.

## Updating the research record

When adding meaningful experiments or rule changes:

- append the result to `docs/RESEARCH.md`,
- update `docs/BENCHMARKS.json` when there are numeric measurements,
- add or amend a decision in `docs/DESIGN_DECISIONS.md`,
- state whether the result is construction, exact solution, simulation, bot-specific observation, human playtest, or hypothesis.
