# Crosscurrent: Design Research and Rationale

This document records the problem Crosscurrent was designed to solve, the empirical comparisons that motivated it, the important statistical distinctions behind the word "balanced", the design decisions that followed, and the limitations that remain open.

It is intentionally more detailed than the README. The goal is to preserve the reasoning behind the game so future changes can be evaluated against the original objective instead of optimizing locally and drifting away from it.

## Original design goal

The project began with a specific question:

> Can we design an original two-player card game in which the smarter player tends to win, equally skilled players begin as close as possible to 50/50 in every single game, there is no meaningful seat/deal advantage, and the game still offers many interesting choices rather than feeling forced?

The desired properties were:

1. **Exact ex-ante symmetry**
   - Neither player should receive a stronger hand, better seat, first-move privilege, dealer advantage, or favorable random deal.
   - A single game should not require alternating seats/deals to repair structural imbalance.

2. **Skill expression**
   - Better reasoning should translate into a meaningful advantage.
   - The game should contain positions where different choices materially change the result.
   - A superficially balanced mirror game with one trivial or dominant policy is not enough.

3. **Low dependence on luck**
   - Ideally there is no shuffled deal at all.
   - Hidden simultaneous choices are acceptable because uncertainty comes from the opponent's decision, not unequal random resources.

4. **Many meaningful options**
   - The game should have enough branching that it does not feel like a forced puzzle.
   - Choices should involve allocation, timing, bluffing/prediction, and opportunity cost.

5. **Short-horizon fairness**
   - We wanted a game that is already symmetric before game one, rather than needing a long match before seat/deal advantages wash out.

6. **Reasonable draw rate**
   - Exact symmetry often makes mirror draws easy.
   - The aim is to avoid a game whose only robust equilibrium is a draw while preserving fairness.

7. **Simple physical rules**
   - It should remain understandable as a card game rather than become a disguised numerical optimization exercise.

## Historical framing of "skill"

Earlier design-space discussions sometimes used a different proxy for skill: whether strong or optimal play increases the tendency toward draws in highly symmetric games. That framing was useful for thinking about equilibrium behavior, but it is not the current project's sole objective.

Crosscurrent's present target separates several properties that can conflict:

- structural fairness,
- skill sensitivity,
- exploitability,
- strategic choice density,
- draw rate,
- human enjoyment.

A game can score well on one and badly on another.

## What "50/50" can and cannot mean

A central distinction in the research was between **fair expectation** and **observed short-run score**.

A perfectly symmetric game can guarantee that equally situated players have equal expected value before play. If draws count as half a win, each player can have expected result 0.5.

That does **not** imply:

- every decisive game literally has a 50/50 realized outcome,
- ten games will finish 5-5,
- a fair game cannot produce a 7-3 or 8-2 short match,
- the optimal draw rate is low.

If a fair decisive game behaves like a fair coin at the outcome level, short-run variance remains unavoidable. The only ways to force observed short series extremely close to 50/50 are to introduce many draws or manipulate/condition outcomes, neither of which is the intended goal.

For Crosscurrent, "balanced" therefore means:

> Both players begin with identical strategic resources, information structure, action rules, scoring rules, and commitment timing. Swapping player identities leaves the game unchanged.

That supports equal game value under optimal play. It does not by itself prove strategic depth or a low optimal draw rate.

## Empirical benchmark: existing two-player games

Before designing Crosscurrent, three existing games were implemented and compared:

- Piquet
- Schnapsen
- GOPS (Game of Pure Strategy)

Across the investigation, **170,632 games or matches** were run, covering **718,213 deals**.

These experiments were not intended as definitive game-theoretic solutions to the full games. Full-size bots were not proven optimal. They were used to study:

- seat/deal symmetry,
- short-run fairness,
- draw behavior,
- whether stronger reasoning produced an advantage,
- whether apparent self-play balance could hide trivial or exploitable strategies.

### Full-format identical-bot balance

20,000 matches per game, with initial seat fixed:

| Game | Format | Player-1 result | 95% interval | Draws |
| --- | --- | ---: | ---: | ---: |
| Piquet | Six alternating deals | 49.66% | 48.86-50.45% | 0% |
| Schnapsen | Race to seven | 50.54% | 49.74-51.33% | 0% |
| GOPS | Full thirteen rounds | 50.07% | 49.30-50.83% | 27.79% in one identical-bot pairing |

A separate GOPS bot pairing produced only **0.26% draws**, showing that GOPS draw rate depends heavily on policy rather than being a fixed property of the rules under arbitrary play.

### Earlier Piquet agency research

Before the simulation work, Piquet was also examined qualitatively to identify where its meaningful decisions actually occur.

The main sources of agency identified were:

- exchange count and which cards to discard,
- declaration information and what the opponent can infer,
- trick leads, high/low timing, and suit forcing,
- scoring-risk management.

This mattered because a game can have complicated rules while many turns are effectively automatic. Crosscurrent's target is repeated consequential choice, not complexity for its own sake.

An earlier claim that Piquet involved roughly "80–90% variance by skill" was later checked and found to be unsupported by any credible source. It should **not** be repeated as evidence.

### Piquet seat/deal asymmetry

A single Piquet deal showed a large elder-hand advantage:

- Elder result: **61.44%**

A handicap experiment fit an **+8-point terminal offset for the younger hand** on **10,000 training deals** and evaluated it on a separate **10,000-deal test set**.

With the fitting policy, the elder's adjusted score share became:

- **50.67%**
- 95% interval: **49.54-51.80%**

The same +8 re-scoring applied under different self-play policies produced very different elder adjusted score shares:

- greedy self-play: **44.48%**
- random self-play: **39.98%**

That was not treated as a principled solution:

- it was strongly policy-dependent,
- it only re-scored completed games,
- bots were not retrained to adapt to the handicap,
- the game was not re-solved under the new payoff,
- subtracting mean score advantage is not the same problem as balancing win probability around a median boundary,
- a naive offset fitted to the already-balanced full partie can simply fit sampling noise,
- full six-deal Piquet was already near balanced because roles alternate.

This reinforced the desire for a game that does not need role alternation or compensation.

### Stronger reasoning versus weaker reasoning

A more-informed bot was compared with a simpler bot:

| Game | More-informed bot result |
| --- | ---: |
| Piquet | 81.08% |
| Schnapsen | 56.90% |
| GOPS | 88.02% |

For Schnapsen specifically, increasing hidden-hand sampling from two samples to eight produced **70.31%** over **512 games**.

This suggested that all three games can reward stronger decision procedures, but the measured effect varies substantially with the model and information structure.

### Schnapsen tactical choice quality

1,000 deducible Schnapsen endgames were examined.

In **342** of those positions, there existed:

- at least one move that forced a win, and
- at least one move that forced a loss.

This was useful evidence for genuine tactical decision quality: some positions clearly punish the wrong choice even when uncertainty has largely disappeared.

### GOPS: why 50/50 self-play is not enough

A particularly important negative result came from GOPS.

Two identical bots using the rule "bid the prize value" drew:

- **5,000 / 5,000 games**

At first glance this looks like perfect balance.

But the policy is trivially exploitable. A strategy that bids one above the prize value when possible (with the special handling around prize 13 / bid 1) beats it by **78-13**, irrespective of prize order.

Lesson:

> Symmetric self-play and a 50/50 aggregate result do not establish strategic depth.

A game or policy can be perfectly symmetric and still be trivial.

### GOPS exact symmetry

GOPS remains an important benchmark because its structure eliminates conventional seat advantage:

- both players have identical bid resources,
- choices are simultaneous,
- both observe the same prize sequence,
- no player receives a first-move privilege.

A reduced five-card GOPS variant was solved with randomized optimal strategies. One optimal-strategy pairing produced:

- win: **33.45%**
- draw: **33.09%**
- loss: **33.45%**

This demonstrates exact expected symmetry in a solved reduced game, but it does not show that full GOPS is the ideal game or that its optimal draw rate is desirable.

## Design implications from the benchmark games

The benchmark work led to several constraints for a new game.

### 1. Do not rely on alternating roles

Piquet can be balanced over a match by alternating elder/younger roles. The new game should not need that repair mechanism.

### 2. Do not equate identical resources with depth

GOPS demonstrates excellent structural symmetry, but simple symmetric policies can be trivial and exploitable.

The new design therefore needs both:

- exact resource symmetry, and
- stateful consequences that make local decisions matter later.

### 3. Skill should accumulate inside one game

Rather than treating each hand as an isolated fair gamble, the desired game should contain repeated consequential decisions within one game so small reasoning advantages can compound.

### 4. Remove exogenous deal luck where possible

If both players receive the same rank set and there is no shuffle, variance comes primarily from strategic interaction.

### 5. Preserve simultaneous commitment

Simultaneous choice is one of the cleanest ways to eliminate first-player advantage while retaining prediction, bluffing, and mixed-strategy behavior.

## Crosscurrent design

Crosscurrent was created from those constraints.

### Core structure

- Two players.
- One ordinary deck can provide the physical cards.
- Each player uses one complete Ace-through-King suit.
- Suits are strategically equivalent.
- Three shared fronts: A, B, C.
- Each player has their own cards at each front.
- Front strength is the sum of ranks on that side.
- All previous actions and current board state are public.
- The current order is secret until both players commit.
- No shuffled deal is required.

The game lasts twelve turns.

### Actions

Each turn, each player secretly selects one legal order.

#### Deploy

Place a card from hand onto one of the three fronts.

This converts future flexibility into immediate strength.

#### Shift

Move one already deployed card to another front.

Cost: permanently spend the lowest card currently in hand.

This allows tactical reallocation but turns hand depth into a resource.

#### Recall

Return one deployed card to hand after the turn.

Cost: permanently spend the lowest card currently in hand.

At a scoring checkpoint, the recalled card still contributes to the checkpoint before returning. If it is the highest card that would otherwise be exhausted, the recall saves it instead of causing a second card to be removed.

This creates a tension between present scoring and future card value.

### Checkpoints

Scoring occurs after turns:

- 4
- 8
- 12

Front values increase over the game:

- turn 4: 1 point per won front,
- turn 8: 2 points per won front,
- turn 12: 3 points per won front.

A tied front awards no points.

Margin is irrelevant. Winning 20-19 is worth the same as winning 20-1.

After a checkpoint, each occupied front exhausts that player's highest card, subject to Recall's protection rule.

### Why the checkpoint structure exists

The increasing 1/2/3 checkpoint values create temporal strategy:

- early strength can establish points,
- overcommitting high cards early can damage the late game,
- low cards have value as Shift/Recall costs,
- a player can intentionally concede a front,
- a strong card may be worth preserving rather than spending,
- a player can reallocate strength shortly before a checkpoint,
- final-turn responses can create tactical fork positions.

The highest-card exhaustion rule prevents a simple strategy of building one permanently dominant pile.

## A concrete tactical position

One tested reachable final-turn state illustrates the intended type of decision.

Before turn 12:

- score: player 1 trails 4-5,
- final checkpoint is worth 3 points per front.

Player 1:

- A: Q = 12
- B: 5 + 9 = 14
- C: 0
- hand: 7, 10, J

Player 2:

- A: 7
- B: 0
- C: 2 + 3 = 5
- hand: 5, 8, K

The strong move is:

- Shift 9 from B to C,
- pay the 7 from hand.

Player 1 then has strengths 12, 5, 9 across A/B/C.

The opponent can overturn only one of those fronts with a single action, so player 1 wins at least two fronts and therefore wins the match.

A superficially attractive alternative, shifting Q from A to B, loses against every legal opponent response in that tested position.

The prototype enumerated **18 legal opponent replies** there.

This is the kind of tactical non-equivalence the design is trying to produce: several legal moves exist, but some are materially stronger because of the interaction between fronts and the one-action constraint.

## Crosscurrent prototype measurements

The early full-size prototype was exercised with several bot policies.

Recorded sample:

- **8,000 full-size games**
- **14 passing tests** in that stage of the prototype

Bots included:

1. random legal action,
2. "builder", which evaluated deployments but did not use Shift/Recall,
3. tactical, which considered all action types, modeled likely checkpoint responses, and explicitly solved the final simultaneous decision.

Measured results:

| Matchup | Games | Result |
| --- | ---: | ---: |
| Random vs random | 1,000 | 48.10% for the recorded seat, 11.6% draws |
| Tactical vs random | 2,000 | 96.8% Tactical |
| Tactical vs builder | 2,000 | 66.025% Tactical |
| Tactical self-play, fixed initial seat | 1,000 | 51.2% result |

Tactical self-play detail:

- 476 wins
- 452 losses
- 72 draws
- draw rate: **7.2%**

"Result" here means:

- win = 1
- draw = 0.5
- loss = 0

The same prototype validation also included:

- **6,000 transition symmetry / conservation checks**,
- all **1,521 legal opening action pairs**,
- the final-turn witness with **18 legal opponent replies**,
- **14 unit tests** at that stage.

These numbers support several limited claims:

- richer action use can beat simpler play,
- the tested fixed seat did not show a large obvious advantage,
- the tested policies did not collapse into universal draws,
- the rules produce positions with consequential choices.

They do **not** prove:

- full-game optimality,
- exact exploitability,
- that the tactical bot is close to optimal,
- that the 7.2% draw rate approximates optimal-human draw rate,
- that Crosscurrent is intrinsically deeper than Piquet, Schnapsen, or GOPS.

### Important failed first prototype

Crosscurrent v0.1 used rotating unequal front weights:

- checkpoint 1: 3 / 2 / 1,
- checkpoint 2: 1 / 3 / 2,
- checkpoint 3: 2 / 1 / 3.

In Tactical self-play it drew **all 300 games**.

That version was rejected.

The current equal-front checkpoints with escalating whole-checkpoint value were introduced partly to break that draw attractor while retaining player symmetry and resource-timing pressure.

### Reduced-game exact results

Reduced **three-front** and **two-front** Crosscurrent variants were solved and admitted all-draw optimal equilibria. A tiny three-card formulation likewise has an optimal-strategy pairing that always draws.

These are warnings, not success criteria.

Symmetric deterministic simultaneous games can naturally possess mirror strategies and draw equilibria. None of these reduced results establishes the full thirteen-rank game's equilibrium draw rate or depth.

## Why structural symmetry is strong but insufficient

Crosscurrent is symmetric by construction.

If player labels are swapped:

- hands remain equivalent,
- legal actions remain equivalent,
- information remains equivalent,
- scoring remains equivalent,
- order timing remains equivalent.

Therefore the game has no built-in "player one" resource advantage.

But symmetry alone does not establish the design's second objective: skill expression.

A perfectly symmetric game could still be:

- solved as a forced draw,
- dominated by one simple policy,
- strategically shallow,
- highly exploitable despite balanced self-play.

For this reason, future evaluation should never report "50/50 self-play" as sufficient evidence of quality.

## Luck, uncertainty, and mixed strategies

Crosscurrent removes shuffled deal luck, but it cannot remove outcome variance entirely.

Because current orders are simultaneous and hidden, optimal play may require randomization.

That is strategically different from a random deal:

- both players receive equal resources,
- the randomness is used to prevent exploitation,
- no player is randomly given a stronger initial state.

Still, if an equilibrium requires mixed strategies, individual game outcomes can remain variable.

The design goal is therefore **no exogenous resource luck**, not "every individual game must have a deterministic outcome based only on player Elo."

## Branching and choice density

Crosscurrent was intentionally designed to provide many legal actions.

At a typical state, legal choices may include:

- Deploy: hand size x 3 fronts,
- Shift: each deployed card x 2 other fronts,
- Recall: each deployed card.

This can produce a large raw branching factor.

Raw branching factor is not itself a measure of depth. Future analysis should examine whether those options are meaningfully distinct rather than merely numerous.

## Design principles for future changes

When modifying Crosscurrent, preserve these principles unless new evidence justifies changing them.

### Preserve exact player symmetry

Do not add:

- first-player bonuses,
- asymmetric hands,
- unequal initial information,
- random deal quality,
- seat-specific powers,

unless the project explicitly abandons the one-game fairness objective.

### Prefer strategic costs over arbitrary handicaps

Shift and Recall cost the lowest hand card because the movement itself should consume a shared strategic resource.

Avoid balance patches that simply grant points to the disadvantaged side.

### Keep margin irrelevant unless evidence says otherwise

Binary front wins reduce incentives for meaningless overkill and make strength allocation across fronts more important.

### Make future value compete with current value

Checkpoint exhaustion, recall, and escalating score values are all mechanisms for creating this tension.

A change that removes resource timing may make the game tactically simpler even if it adds more rules.

### Keep current orders hidden and simultaneous

This is central to removing initiative advantage and creating prediction/counter-prediction.

### Do not optimize only for draw rate

A lower draw rate is not automatically better if it comes from introducing structural luck or first-player advantage.

### Do not optimize only for bot win rate

A bot beating a weaker bot may merely exploit a known limitation.

Controlled search-budget experiments and exploitability analysis are more useful.

## Evaluation framework for future research

The next serious evaluation should include more than self-play win rate.

### 1. Fixed-seat symmetry

Run identical policies with player labels fixed and report:

- win rate,
- loss rate,
- draw rate,
- expected result,
- confidence intervals.

Also run swapped labels as an invariant test.

### 2. Controlled strength ladders

Compare the same algorithm at different search or sampling budgets.

This is stronger evidence of skill sensitivity than comparing unrelated hand-written bots.

Examples:

- MCTS simulations: 100 vs 1,000 vs 10,000,
- CFR iterations,
- simultaneous-move search depth,
- opponent-model sample count.

### 3. Exploitability

Estimate how much a best-response or approximate best-response can gain against each learned policy.

A policy with 50/50 self-play but high exploitability is not strategically robust.

### 4. Reduced-game exact solving

Full thirteen-rank exact solution is likely enormous.

Continue solving smaller variants exactly and compare whether their strategic structure survives scaling.

Useful outputs:

- game value,
- equilibrium draw rate,
- support size of mixed strategies,
- dominated actions,
- exploitability.

### 5. Choice quality

In sampled solvable subgames, measure:

- best versus second-best action value,
- how often a legal action changes forced outcome,
- regret from plausible mistakes,
- number of strategically near-equivalent actions.

### 6. Effective branching / policy entropy

Count not only legal actions but how many receive meaningful probability under strong play.

A game with 40 legal actions and one obviously correct action is not deep.

### 7. Comebacks and reversals

Measure how often the player behind after turn 4 or turn 8 can still win under strong play.

The goal is tension without making early decisions irrelevant.

### 8. Draw behavior across policy classes

Report draw rate for:

- random,
- heuristic,
- search-based,
- learned,
- approximate equilibrium policies.

Do not treat one bot pair's draw rate as a rule-level constant.

### 9. Human usability

Eventually test:

- whether legal moves are understandable,
- whether players can form plans,
- whether Shift/Recall costs are easy to remember,
- whether turns feel meaningfully different,
- whether simultaneous reveal creates satisfying tension,
- whether the twelve-turn length feels right.

## Open questions

The following remain unresolved.

1. What is the full game's equilibrium value and optimal draw rate?
2. Is the current 1/2/3 checkpoint schedule best?
3. Does highest-card exhaustion produce enough long-term planning or too much forced cleanup?
4. Are Shift and Recall both necessary at full scale?
5. Is "spend the lowest card" too automatic as a cost?
6. Does the game contain a simple dominant resource schedule that current bots have not discovered?
7. How exploitable are the current Tactical and Deep AIs?
8. Does stronger search monotonically outperform weaker search?
9. How often does optimal or near-optimal play require mixed strategies?
10. Does the full game preserve the tactical richness observed in hand-selected positions?
11. Can draw rate be reduced further without introducing structural asymmetry or luck?
12. Is twelve turns the best balance between skill accumulation and session length?

## Novelty status

The design was compared conceptually with existing games, especially:

- GOPS: identical rank resources and simultaneous hidden choice,
- Air, Land & Sea: competition across three theaters/fronts.

Crosscurrent combines those broad ideas with:

- persistent individual cards on fronts,
- Deploy / Shift / Recall orders,
- hand-card costs for movement,
- escalating checkpoints,
- checkpoint exhaustion,
- Recall protecting a card from exhaustion.

No exact match was found in the limited originality check performed during design.

This is **not proof of global novelty**. An obscure, unpublished, regional, or independently invented equivalent could exist. Any legal or publication-level novelty claim should use a broader dedicated search.

## Current product goal

The web app should make the design easy to evaluate rather than obscure it.

Product priorities:

- excellent mobile-web controls,
- equally good desktop play,
- immediate Play vs AI,
- private friend rooms with hidden commitments,
- local pass-and-play,
- a homepage animation that demonstrates a complete legal twelve-turn game rather than explaining the rules with a wall of text,
- no account requirement,
- fast iteration while preserving the rules engine and research invariants.

The app is not just a polished card-game UI. It is also the experimental harness for determining whether the original design hypothesis is actually true.

## Interpretation standard

Whenever research results are added to this repository, distinguish:

- **proved by construction**,
- **exactly solved**,
- **measured in simulation**,
- **observed with a particular bot**,
- **hypothesis / design intent**.

Do not upgrade one category into another.

Examples:

- "Both players start with identical resources" is true by construction.
- "Reduced five-card GOPS had symmetric optimal value in the tested exact solver" is an exact reduced-game result.
- "Tactical Crosscurrent self-play drew 7.2%" is a bot-specific simulation result.
- "Crosscurrent's full optimal draw rate is low" is **not established**.

That distinction is essential to the project.

## 2026-10 audit of v0.2

This section records a full audit made before the v0.3 rule change. The question was the project's original one, sharpened by a product requirement: a player who will only ever play **one game** should still be able to treat its result as evidence of who played better. That asks for three things at once: structural fairness (unchanged), a steep skill gradient, and as little of the result as possible decided by draws or by pure guesses.

### Tooling

`research/sim` is a dependency-free Rust simulator (see `research/README.md`). Every number below can be regenerated from the scripts and logs in `research/results/`.

- **Engine equivalence (construction/validation).** The Rust engine reproduced the TypeScript engine on 3,060 games and 36,720 transitions: all 60 original Python-reference transcripts plus 3,000 seeded random games biased toward Shift and Recall. For every rule variant used below, 20,000 random games preserved label-swap symmetry and card conservation.
- **Research bot.** Simultaneous-move Monte Carlo tree search with regret matching (outcome sampling, after Lanctot et al.), written `mctsx:N` for N iterations per decision, with the final turn solved exactly as a matrix game by linear programming. Rollouts deploy a random card 90% of the time. Exploration γ = 0.2 and a final-move purification threshold of 0.1 were tuned head-to-head on v0.2 (γ 0.2 vs 0.1: 60.8%; purification 0.1 vs 0.03: 66.5%; 0.2 and 0.3 vs 0.1: 36.3% and 30.3%, n = 300 each). The last result is itself informative: a bot that plays too predictably is punished, so mixed strategies matter in this game.
- **Final-turn analysis (exact on sampled positions).** Positions after turn 11 are sampled from bot self-play and turn 12 is solved exactly. A position has a *saddle point* when the best pure order of each player is optimal even if revealed; then the result is decided by calculation, not by guessing. The *guess width* is (min–max minus max–min) of the pure-strategy payoffs in result units: 0 for a saddle point, 1 when whoever guesses right wins outright.

All match results are bot-specific simulations: 400 games per pairing unless stated, seats alternating, draws counted as one half, ± values are 95% intervals.

### Reproduced historical measurements (simulation)

| Matchup | Then | Now |
| --- | ---: | ---: |
| Random vs random | 48.1%, 11.6% draws (1,000) | 50.0% ±0.7, 11.4% draws (20,000) |
| Tactical vs random | 96.8% (2,000) | 96.7% ±1.0 (1,000) |
| Tactical self-play | 51.2%, 7.2% draws (1,000) | 49.0% ±3.0, 7.3% draws (1,000) |

### The shipped computer levels (simulation)

- "Deep" (1,800 fictitious-play iterations) against "Tactical" (280): **48.9% ±3.0** over 1,000 games. Deep was not stronger. Both levels solve the same one-turn heuristic matrix; more iterations only refine an equilibrium of the heuristic, not of the game.
- Casual vs random 85.9%; Tactical vs Casual 81.1% (1,000 each).
- `mctsx:16000` against Tactical **91.6%** (350/33/17), against Deep 91.2%, Casual 97.1%, random 99.8%. In 83% of its wins against Tactical it was *behind after turn 4*: the strong bot routinely gives up the first scoring to keep high cards, which the one-turn heuristic cannot see.

### Skill gradient and draws (simulation)

| Pairing | Result | W/D/L | Draws |
| --- | ---: | ---: | ---: |
| mctsx 4,000 vs 1,000 | 71.9% ±4.0 | 260/55/85 | 13.8% |
| mctsx 16,000 vs 4,000 | 74.3% ±3.8 | 266/62/72 | 15.5% |
| mctsx 64,000 vs 16,000 | 69.9% ±4.0 | 244/71/85 | 17.8% |
| mctsx 16,000 self-play | 49.5% ±4.5 (seat 0: 48.7%) | 165/66/169 | 16.5% |

Each fourfold increase in search wins about 70–74% and the gradient had not flattened at 64,000 iterations, so this game rewards deeper reasoning well beyond the shipped AI. The weakness is draws: they *rise* as play gets stronger (13.8% → 15.5% → 17.8%), consistent with the all-draw equilibria found in the solved reduced variants. A drawn single game says nothing about who is better.

### How often one guess decides the game (exact solutions of bot positions)

| Positions from | Saddle point | Pure win/loss guess (width 1) | Width 0.5 | Mean width |
| --- | ---: | ---: | ---: | ---: |
| Tactical self-play | 60.0% | 32.0% | 8.0% | 0.360 |
| mctsx 4,000 self-play | 61.5% | 25.0% | 13.5% | 0.318 |
| mctsx 16,000 self-play | 42.2% | **42.5%** | 15.2% | 0.501 |

Under the strongest play measured, 42.5% of games reached a final turn where the result flipped between a win and a loss on a simultaneous guess, and another 15% flipped between a draw and a decisive result. Equilibrium play there mixes over only about 2.7 of 25 legal orders, and playing uniformly at random instead costs a third of a game (0.333 expected result), so the final turn is not trivial; but the closer two strong players are, the more often v0.2 hands the result to a guess. Because the last scoring is worth half of all points (9 of 18), that guess carries a lot of weight.

### Comebacks and order mix (simulation)

In `mctsx:16000` self-play, the eventual winner trailed after turn 4 in 36.8% of decided games and after turn 8 in 26.0%. Strong bots chose Deploy about 90% of the time, Shift about 9% and Recall about 1%; the v0.2 Tactical heuristic used Shift 20–23% and Recall 2–4%. Recall is rare in strong play but not useless: the tutorial position in this repository and the certified endgame both use it or depend on it.

### Looking for dominant simple strategies (simulation)

Against `mctsx:4000`, with v0.2 scoring and the final-strength tiebreak studied below (these runs were not logged to `research/results/`): one-front stacking lost 98.5%, high-card-first 95.5%, piling onto a front already won 99.8%, mirroring the opponent's previous card 94.0%, random deploys 96.5%, v0.2 Casual 95.0%. The strongest simple rule found was **lowfirst**, play your lowest card where you are furthest behind: it lost 84.5% to `mctsx:4000` and 97% to `mctsx:16000`, beat v0.2 Casual 78.5%, and lost to v0.2 Tactical 84.8%. No simple rule approached strong play. That lowfirst is the best of them supports the reading that conserving high cards is central.

Repeated under the adopted v0.3 rules (`research/results/probes.log`, 200 games each): `mctsx:4000` scored 99.0% against one-front stacking, high-card-first and piling, 98.5% against mirroring, 94.0% against random deploys, 92.5% against v0.2 Casual and 96.5% against lowfirst; `mctsx:16000` won all 200 games against lowfirst. Lowfirst and Casual were even (49.4% over 400 games), and v0.2 Tactical beat lowfirst 95.3%.


## 2026 rule-variant study and v0.3

### Question and protocol

Which changes make a single game more decisive for the better player without adding luck, breaking symmetry, or making the game shallow? About thirty variants were screened with one protocol (simulation, `research/results/`): `mctsx:4000` against `mctsx:1000` (400 or 600 games), `mctsx:4000` self-play for draws and comeback structure (400 games), and exact final-turn analysis of 400 self-play positions. Finalists were then rerun with larger samples and a second search family (below). Every variant passed the 20,000-game symmetry and conservation check.

"Strong wins / draws / upsets" are the outright results of the bot with four times the search. The screening treated them as the headline because a draw is no evidence of who played better. The finalists below corrected that reading: a tiebreak can turn draws into wins and losses without favoring the better player, so outright wins can rise while a single game carries no more evidence. The finalist comparison therefore uses the stronger bot's expected result as well.

### Screening results (simulation)

Variant names are explained in `research/README.md`; `base` is v0.2. Final-turn figures for the initiative variants (in parentheses) cover only the few final turns that were simultaneous.

| Variant | 4k vs 1k: strong wins / draws / upsets | Self-play draws | Final turn saddle | Final turn pure guess | Winner behind after turn 8 | Lead changes |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| `base` | 65.0% / 13.8% / 21.2% (n=400) | 17.0% | 61.5% | 25.0% | 36.1% | 0.82 |
| `base+tbfinal` | 71.8% / 0.0% / 28.2% (n=400) | 0.5% | 52.2% | 46.0% | 44.0% | 0.69 |
| `base+tbstr` | 76.8% / 0.2% / 23.0% (n=400) | 1.0% | 65.0% | 34.5% | 36.6% | 0.63 |
| `base+s111` | 65.8% / 15.8% / 18.5% (n=400) | 20.8% | 62.2% | 15.2% | 0.3% | 0.25 |
| `base+s111+tbfinal` | 80.5% / 0.5% / 19.0% (n=400) | 1.0% | 72.5% | 26.2% | 12.4% | 0.20 |
| `base+s234` | 78.2% / 1.0% / 20.8% (n=400) | 2.5% | 67.0% | 31.8% | 31.8% | 0.67 |
| `base+s124` | 70.2% / 2.2% / 27.5% (n=400) | 3.0% | 52.2% | 43.8% | 46.6% | 0.77 |
| `base+s4x3` | 70.0% / 7.5% / 22.5% (n=400) | 9.2% | 64.8% | 27.8% | 35.3% | 0.86 |
| `base+s6x2` | 66.8% / 17.0% / 16.2% (n=400) | 23.5% | 69.5% | 3.8% | 20.9% | 0.40 |
| `base+s6x2+exnone` | 78.5% / 11.8% / 9.8% (n=400) | 23.2% | 57.8% | 11.8% | 27.0% | 0.57 |
| `base+s6inc` | 72.2% / 4.2% / 23.5% (n=400) | 8.0% | 70.2% | 22.2% | 37.5% | 1.01 |
| `base+s12inc+exnone` | 84.0% / 1.5% / 14.5% (n=400) | 4.5% | 82.2% | 10.2% | 35.1% | 1.30 |
| `base+exnone` | 65.8% / 17.2% / 17.0% (n=400) | 17.0% | 41.2% | 38.5% | 28.9% | 0.77 |
| `base+exwin` | 62.5% / 15.0% / 22.5% (n=400) | 22.2% | 53.0% | 36.8% | 51.4% | 1.13 |
| `base+exall` | 63.8% / 15.0% / 21.2% (n=400) | 19.0% | 49.5% | 36.8% | 38.6% | 0.89 |
| `base+noshift` | 63.5% / 14.5% / 22.0% (n=400) | 14.8% | 76.8% | 17.0% | 37.5% | 0.84 |
| `base+norecall` | 68.2% / 12.2% / 19.5% (n=400) | 16.0% | 49.8% | 35.8% | 30.1% | 0.73 |
| `base+initlow` | 70.8% / 14.0% / 15.2% (n=400) | 13.8% | (59%, n=44) | (32%) | 28.4% | 0.74 |
| `base+initlow+tbfinal` | 77.5% / 0.2% / 22.2% (n=400) | 1.5% | (59%, n=32) | (41%) | 38.8% | 0.63 |
| `base+inithigh` | 66.2% / 12.0% / 21.8% (n=400) | 13.5% | (41%, n=49) | (33%) | 35.3% | 0.82 |
| `base+initbehind` | 64.2% / 8.8% / 27.0% (n=400) | 6.5% | (44%, n=36) | (42%) | 62.3% | 1.18 |
| `base+initahead` | 68.5% / 12.2% / 19.2% (n=400) | 17.0% | (22%, n=18) | (50%) | 6.6% | 0.23 |
| `base+s111+tbstr` | 79.7% / 0.2% / 20.2% (n=600) | 0.5% | 72.8% | 26.0% | 6.8% | 0.27 |
| `base+s111+tbearly` | 77.0% / 0.3% / 22.7% (n=600) | 0.2% | 78.5% | 21.2% | 1.0% | 0.23 |
| `base+tbearly` | 75.8% / 0.2% / 24.0% (n=600) | 0.0% | 60.0% | 39.0% | 27.8% | 0.65 |
| `base+s234+tbfinal` | 76.2% / 0.0% / 23.8% (n=600) | 0.0% | 64.5% | 35.2% | 26.0% | 0.63 |
| `base+s234+tbstr` | 76.8% / 0.0% / 23.2% (n=600) | 0.0% | 66.2% | 33.8% | 32.5% | 0.78 |

### What the screening showed

1. **A symmetric tiebreak removes draws.** Settling equal points by strength cut self-play draws from 17% to 0–1% in every schedule tested, with no change to symmetry.
2. **The scoring schedule is the main lever.** The more the last scoring dominates, the more often one guess decides the game and the weaker the skill signal: 1/2/4 (70.2% strong wins) and 1/2/3 (65.0%) trail 2/3/4 (78.2% even without a tiebreak) and 1/1/1 with a tiebreak (77–81%).
3. **2/3/4 has an arithmetic advantage.** Under 1/2/3 the commonest close pattern, winning 2–1, winning 2–1 and losing 1–2, scores +1 +2 −3 = 0: a draw. Under 2/3/4 no combination of single-front splits cancels (+2 +3 −4 = +1), and self-play draws fell from 17.0% to 2.5% without any tiebreak.
4. **Flat schedules end games early.** With 1/1/1 the eventual winner was behind after turn 8 in 0.3–12% of games and leads changed 0.2 times per game, against 36% and 0.82 under 1/2/3 and 26–32% and 0.63–0.67 under 2/3/4. Many flat-schedule games would be settled with a third still to play.
5. **Without exhaustion the game becomes shallow.** Scoring every turn or every second turn with no exhaustion gave the steepest search ladders (84%), but the scripted rule "deploy your highest card where you are furthest behind" then played as well as `mctsx:4000` (48.5% and 54.0% for the search bot over 200 games each). Under v0.2 and every adopted candidate the same rule lost 93–97%. The steep ladders measured weak search catching up with a simple rule. Highest-card exhaustion (D6) is what keeps big cards from simply being played early.
6. **Other mechanics.** Winner-only exhaustion (62.5%), spending the whole board (63.8%) and removing Shift (63.5%) lowered the skill signal. Removing Recall (68.2%) was within noise of v0.2.
7. **Earned initiative.** Letting the player whose last order named the lower card choose second, after seeing the other order, reached 77.5% with a tiebreak: no better than scoring-only changes, while turning about 90% of final turns into sequential play and requiring a room-service change. The catch-up form, where the trailing player chooses second, was the weakest variant measured (64.2% strong wins, 27.0% upsets).

The finalist runs below revise findings 1 to 3. Removing draws did not by itself make a game better evidence of skill, the screening values of the leading schedules were optimistic, and the choice of tiebreak mattered as much as the schedule.

### Exact reduced games

Small variants were solved exactly by backward induction, solving every simultaneous decision as a matrix game (`crosscurrent-sim exact`). Values are exact for these reduced games only.

| Reduced game | Scoring | Tiebreak | Value | Computed equilibrium W/D/L | Openings guaranteeing at least the value |
| --- | --- | --- | ---: | ---: | ---: |
| 4 ranks, 3 turns | 1 then 2 | none or final strength | 0.5 | 0 / 100 / 0% | 3 of 12 |
| 5 ranks, 4 turns | 1 then 2 | none or final strength | 0.5 | 0 / 100 / 0% | 0 of 15 |
| 5 ranks, 4 turns | 1 then 1 | none | 0.5 | 11.4 / 77.1 / 11.4% | 0 of 15 |
| 5 ranks, 4 turns | 1 then 1 | final or total strength | 0.5 | 0 / 100 / 0% | 0 of 15 |
| 6 ranks, 5 turns | 1 then 2 | none or final strength | 0.5 | 0 / 100 / 0% | 6 of 18 |
| 6 ranks, 5 turns | 1 then 1 | final strength | 0.5 | 0 / 100 / 0% | 6 of 18 |
| 6 ranks, 5 turns | 1 then 1 | total strength | 0.5 | 0 / 100 / 0% | 9 of 18 |
| 6 ranks, 5 turns | 1 then 1 | none | 0.5 | 13.5 / 72.9 / 13.5% | 0 of 18 |

The value of every symmetric game is 0.5 by construction; what the solver adds is how that value is reached. In every reduced game with a tiebreak, and under 1-then-2 scoring even without one, the computed equilibrium draws every game. The tiebreak did not change that: it removes draws from imperfect play, not from perfect play in these small games. The last column counts pure opening orders that secure at least the value against every reply. Some games have several (3 of 12, 6 of 18, 9 of 18). The 5-rank games, and the 6-rank game with 1-then-1 scoring and no tiebreak, have none, so there even the first order must be mixed. These confirm and sharpen the historical warning. Whether the full thirteen-rank game has drawing equilibria of this kind is unknown; the strongest bots measured drew 0–1% of v0.3 games.

### Finalists (simulation)

Screening values are single runs of 400–600 games, and the finalists were chosen because their runs looked best, so their screening values are biased upward. Each finalist was rerun with fresh seeds in three pairings with a fourfold search gap: `mctsx:4000` against `mctsx:1000` (1,200 games), `mctsx:16000` against `mctsx:4000` (600), and plain SM-MCTS without the exact final turn, 4,000 against 1,000 iterations (600), plus 600 games of `mctsx:4000` self-play and an exact final-turn analysis of 600 self-play positions (sweeps 3 and 4). Sweep 6 added two controls, 2/3/4 without a tiebreak and 1/2/3 with the total-strength tiebreak, and an independent second batch of 4,200 games (2,400, 600 and 1,200 in the same pairings) for the two 2/3/4 tiebreak candidates and for v0.2 with the final-strength tiebreak. From sweep 6 on, the simulator also counts the games that end level on points and who wins them on the tiebreak.

The single-game measure here is the stronger bot's **expected result**: a win counts 1 and a draw ½. It is the chance that one game names the stronger player when a draw is settled by a coin. Tables generated by `research/results/finalists.py` over sweeps 3, 4 and 6; `tbstr` is total strength summed over the three scorings, `tbfinal` total strength at the last scoring.

| Variant | Games | Stronger bot wins / draws / losses | Expected result for the stronger bot | Level on points | Tiebreak wins for the stronger bot |
| --- | ---: | ---: | ---: | ---: | ---: |
| `base` | 2,400 | 66.6% / 13.8% / 19.6% | **73.5%** ±1.6 | – | – |
| `base+tbfinal` | 6,600 | 73.4% / 0.6% / 26.0% | **73.7%** ±1.1 | 14.6% (n=4,200) | 422 of 588 |
| `base+s111+tbfinal` | 2,400 | 76.5% / 0.9% / 22.6% | **76.9%** ±1.7 | – | – |
| `base+s111+tbstr` | 2,400 | 78.5% / 0.9% / 20.6% | **79.0%** ±1.6 | – | – |
| `base+s234+tbfinal` | 6,600 | 74.1% / 0.1% / 25.8% | **74.1%** ±1.1 | 1.2% (n=4,200) | 26 of 47 |
| `base+s234+tbstr` | 6,600 | 76.5% / 0.0% / 23.5% | **76.5%** ±1.0 | 1.9% (n=4,200) | 64 of 78 |
| `base+cp:4=3,8=4,12=5+tbfinal` | 2,400 | 75.1% / 0.1% / 24.8% | **75.2%** ±1.7 | – | – |
| `base+cp:4=3,8=4,12=5+tbstr` | 2,400 | 75.3% / 0.0% / 24.6% | **75.4%** ±1.7 | – | – |
| `base+s234` | 2,400 | 74.0% / 1.4% / 24.6% | **74.7%** ±1.7 | 1.4% (n=2,400) | – |
| `base+tbstr` | 2,400 | 75.6% / 0.4% / 24.0% | **75.8%** ±1.7 | 18.2% (n=2,400) | 340 of 428 |

| Variant | 4k vs 1k: expected result (n) | 16k vs 4k: expected result (n) | plain 4k vs 1k: expected result (n) |
| --- | ---: | ---: | ---: |
| `base` | 72.3% ±2.3 (1,200) | 72.8% ±3.2 (600) | 76.7% ±3.1 (600) |
| `base+tbfinal` | 72.2% ±1.5 (3,600) | 76.2% ±2.4 (1,200) | 75.1% ±2.0 (1,800) |
| `base+s111+tbfinal` | 76.6% ±2.4 (1,200) | 75.8% ±3.4 (600) | 78.8% ±3.3 (600) |
| `base+s111+tbstr` | 78.7% ±2.3 (1,200) | 78.2% ±3.3 (600) | 80.2% ±3.2 (600) |
| `base+s234+tbfinal` | 73.7% ±1.4 (3,600) | 72.2% ±2.5 (1,200) | 76.4% ±2.0 (1,800) |
| `base+s234+tbstr` | 75.6% ±1.4 (3,600) | 76.0% ±2.4 (1,200) | 78.7% ±1.9 (1,800) |
| `base+cp:4=3,8=4,12=5+tbfinal` | 76.0% ±2.4 (1,200) | 70.5% ±3.7 (600) | 78.1% ±3.3 (600) |
| `base+cp:4=3,8=4,12=5+tbstr` | 76.5% ±2.4 (1,200) | 72.2% ±3.6 (600) | 76.3% ±3.4 (600) |
| `base+s234` | 73.6% ±2.5 (1,200) | 71.4% ±3.6 (600) | 80.2% ±3.2 (600) |
| `base+tbstr` | 76.9% ±2.4 (1,200) | 72.4% ±3.6 (600) | 77.0% ±3.4 (600) |

| Variant | Self-play draws | Self-play seat 0 | Final turn saddle | Final turn pure guess | Winner behind after turn 8 (4k vs 1k / self-play) | Lead changes (self-play) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| `base` | 12.2% | 49.7% | 55.7% | 31.0% | 29.8% / 34.0% | 0.80 |
| `base+tbfinal` | 0.7% | 53.0% | 57.5% | 41.2% | 38.3% / 40.8% | 0.66 |
| `base+s111+tbfinal` | 1.0% | 49.8% | 74.2% | 24.5% | 10.0% / 12.1% | 0.23 |
| `base+s111+tbstr` | 0.8% | 51.9% | 72.7% | 24.8% | 6.4% / 7.9% | 0.22 |
| `base+s234+tbfinal` | 0.2% | 53.2% | 66.0% | 34.0% | 24.7% / 30.1% | 0.65 |
| `base+s234+tbstr` | 0.0% | 50.0% | 68.0% | 31.5% | 22.8% / 27.8% | 0.65 |
| `base+cp:4=3,8=4,12=5+tbfinal` | 0.0% | 48.0% | 66.0% | 33.8% | 25.3% / 29.8% | 0.68 |
| `base+cp:4=3,8=4,12=5+tbstr` | 0.0% | 47.0% | 65.0% | 35.0% | 23.0% / 28.2% | 0.66 |
| `base+s234` | 1.7% | 47.3% | 69.7% | 28.7% | 24.9% / 29.2% | 0.66 |
| `base+tbstr` | 0.5% | 53.7% | 61.5% | 37.2% | 30.1% / 32.5% | 0.56 |

### What the finalists showed

1. **The screening overstated the gains.** 2/3/4 without a tiebreak screened at 78.2% strong wins (400 games) and measured 74.0% over 2,400 new games; 2/3/4 with the final-strength tiebreak went from 76.2% to 74.1%. Single short runs selected as the best of many are optimistic.
2. **A tiebreak can make every game decisive without making it better evidence.** v0.2 and v0.2 with the final-strength tiebreak give the stronger bot the same expected result (73.5% and 73.7%, over 2,400 and 6,600 games). The tiebreak's own decisions favored the stronger bot, which won 422 of the 588 level games it settled (72%), but the rule also turned last turns that had been guesses between a draw and a win into full win-or-lose guesses (31.0% to 41.2% of final turns), and the stronger bot won fewer of the games decided on points (74.3% in the second batch, against 77.3% of v0.2's decisive games). The two effects cancelled.
3. **Strength summed over the three scorings is evidence of skill.** Under 1/2/3 it settled 18.2% of games and the stronger bot won 340 of the 428 it decided (79%), lifting the expected result from 73.5% to 75.8%. Under 2/3/4 only 1.9% of games ended level on points, and the stronger bot won 64 of 78 (82%; 26 of 47, or 55%, with strength at the last scoring). Over 6,600 games in two independent batches, 2/3/4 with total strength gave the stronger bot 76.5% (±1.0) against 74.1% (±1.1) with strength at the last scoring, and each batch alone showed the gap (+2.5 and +2.4 points). Only about 0.4 points of it comes directly from the games level on points; the rest comes from how the search bots play under the rule. That part is a bot-specific observation.
4. **2/3/4 against 1/2/3, both with total strength.** The expected results are close (76.5% and 75.8%), but under 2/3/4 the tiebreak decides one game in fifty instead of one in five, so points decide almost every game as D4 intends, and fewer final turns are pure guesses (31.5% against 37.2% of self-play positions). 1/2/3 keeps a little more comeback: the eventual winner trailed after turn 8 in 30.1% and 32.5% of games (4k vs 1k, self-play) against 22.8% and 27.8%.
5. **Flat schedules remain the most skill-sensitive and the least dramatic.** 1/1/1 with total strength reached 79.0%, the highest of any finalist, but the eventual winner trailed after turn 8 in only 6.4–7.9% of games and leads changed 0.22 times per game. Most games would be settled with a third still to play.
6. **3/4/5** measured 75.2% with the final-strength tiebreak and 75.4% with total strength, within noise of 2/3/4.
7. **Symmetry held.** Seat 0 scored 47.0–53.7% in the ten finalist self-play runs (600 games each, 95% interval about ±4 points), consistent with 50% given ten comparisons.

### Decision: v0.3

v0.3 scores 2, 3 and 4 points per front at turns 4, 8 and 12 and settles equal points by total strength summed over the three scorings (DESIGN_DECISIONS D21 and D22). A provisional v0.3 earlier in this study used strength at the last scoring; the finalists replaced it. Against v0.2 the stronger bot's expected result rose from 73.5% to 76.5%, draws fell from 13.8% to one game in 6,600, and in 4,000-iteration self-play positions the share of final turns where a simultaneous guess changes the result fell from 44.3% (31.0% between a win and a loss, 13.3% between a draw and a decision) to 32.0%.

What one game is worth, plainly: between these bots, the one that searches four times more wins about three games in four under v0.3. Between closer players one game is weaker evidence. In about one game in three between equal bots the last turn is still a simultaneous guess with the result at stake; that is the cost of hidden simultaneous orders (D2), which are also what makes reading the opponent a skill. These are simulations with particular search bots, none of them optimal, and no human games have been measured under v0.3.

### The computer levels under v0.3 (simulation)

Easy, Medium and Hard are `mctsx:300`, `mctsx:3000` and `mctsx:24000` (D17). Measured under v0.3 (`research/results/sweep5.log`; `casual` and `tactical` are the v0.2 shipped levels):

| Pairing | Games | Result | W/D/L |
| --- | ---: | ---: | ---: |
| Easy vs random | 400 | 89.5% ±3.0 | 358/0/42 |
| Easy vs v0.2 Casual | 400 | 56.0% ±4.9 | 224/0/176 |
| Easy vs v0.2 Tactical | 400 | 13.5% ±3.4 | 54/0/346 |
| Medium vs Easy | 400 | 89.7% ±3.0 | 359/0/41 |
| Medium vs v0.2 Tactical | 400 | 64.5% ±4.7 | 258/0/142 |
| Hard vs Medium | 400 | 80.2% ±3.9 | 321/0/79 |
| Hard vs v0.2 Tactical | 200 | 90.7% ±4.0 | 181/1/18 |

Easy plays about as well as the old Casual level, Medium is stronger than the old Tactical level, and Hard is stronger again. No level is claimed to be optimal; the ladder measurements above show that more search keeps winning.

### Open questions after the study

Of the open questions listed earlier, this study gave simulation evidence on several: the 1/2/3 schedule (2) was not the best measured; removing Shift (4) lowered the skill signal while removing Recall was within noise; no simple scripted schedule (6) came close to search play; "Deep" was no stronger than "Tactical" and both lost about 91% to `mctsx:16000` (7); stronger search beat weaker search at every step measured, 1,000 to 64,000 iterations (8); final-turn equilibria mix over about 2.5 of 23 orders (9); and a tiebreak removed nearly all draws between bots (11), although the exact reduced games still draw under perfect play. Still open:

- How do human players experience v0.3, and does a single game between people separate skill as well as it separates search bots?
- Why does the total-strength tiebreak raise the bots' skill signal by more than the games it decides directly?
- Is the extra skill signal of a flat schedule worth fewer comebacks to players who will play one game?
- The original questions 1, 3, 5, 10 and 12.
