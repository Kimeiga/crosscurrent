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

A held-out experiment gave the younger side an **+8 score adjustment**, after which the elder result was **50.67%**.

That was not treated as a principled solution:

- it was bot-specific,
- it was an outcome handicap rather than strategic symmetry,
- players could adapt differently to the handicap,
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
