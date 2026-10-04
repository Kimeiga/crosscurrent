# Crosscurrent Design Decisions

This file is a compact decision log. See `RESEARCH.md` for the full evidence and history.

## D1: No shuffled opening deal

**Decision:** Both players start with the same Ace-through-King rank resources.

**Reason:** The project is trying to make one game structurally fair before play begins. Randomly unequal hands would work against that objective.

## D2: Simultaneous hidden orders

**Decision:** Both players commit before either order is revealed.

**Reason:** This removes conventional first-move initiative while preserving prediction and mixed-strategy interaction.

## D3: Three fronts

**Decision:** Strength is distributed across A, B, and C.

**Reason:** Multi-front allocation creates opportunity cost. A card cannot strengthen every objective at once.

## D4: Margin does not score

**Decision:** A won front is worth its checkpoint value regardless of winning margin.

**Reason:** Overkill should be strategically wasteful. The question should be where to allocate strength, not how high one total can grow.

## D5: Escalating checkpoint values

**Decision:** turns 4 / 8 / 12 score 1 / 2 / 3 points per front.

**Reason:** Later resources should matter more without making early play irrelevant. This also helps avoid the all-draw behavior seen in an earlier scoring prototype.

**Amended by D21 (v0.3):** the escalation is kept but the values are now 2 / 3 / 4.

## D6: Highest-card checkpoint exhaustion

**Decision:** After scoring, each occupied front loses that player's highest card.

**Reason:** Permanent untouched fortresses reduce strategic movement. Exhaustion forces resource renewal and creates timing decisions around high ranks.

## D7: Shift costs the lowest hand card

**Decision:** Reallocating a deployed card consumes the lowest card still in hand.

**Reason:** Mobility should have a future cost. Low ranks therefore remain strategically relevant.

## D8: Recall costs the lowest hand card

**Decision:** Recovering a deployed card consumes the same shared cost resource.

**Reason:** Recall should be a strategic investment, not free preservation.

## D9: Recall can save the exhausting card

**Decision:** At a checkpoint, a recalled card still contributes to scoring and can be the card protected from exhaustion.

**Reason:** This produces a clean present-value versus future-value decision and makes Recall tactically distinct from Shift.

## D10: Twelve-turn single game

**Decision:** One game contains enough repeated simultaneous choices for skill differences to accumulate.

**Reason:** We do not want fairness to depend on playing a long alternating-seat match.

## D11: Do not claim optimality from self-play

**Decision:** 50/50 identical-bot self-play is treated only as a symmetry diagnostic.

**Reason:** GOPS experiments showed that a policy can draw 5,000 / 5,000 self-play games and still be trivially exploitable.

## D12: Keep the full rules engine deterministic

**Decision:** Given state + both orders, resolution is deterministic.

**Reason:** Reproducibility makes simulation, exact reduced-game solving, browser testing, and golden-state verification much easier.

## D13: AI strength is an experimental variable

**Decision:** Casual/Tactical/Deep are product levels, not claims of solved play.

**Reason:** Current bots are not proven optimal. Future work should use controlled search-budget ladders and exploitability measurements.

## D14: Homepage shows rather than explains

**Decision:** The landing page animates a full legal game with physical card motion.

**Reason:** The rules are easier to understand by watching commitments, movement, checkpoints, recall, and exhaustion than by reading a large rules block before playing.

## D15: Plain product language

**Decision:** Describe Crosscurrent as a tactical, balanced card game for two. Avoid grandiose taglines.

**Reason:** The value proposition is the game design itself.

## D16: Positional front names

**Decision:** The three fronts are called Left, Middle and Right.

**Reason:** Sea, Land and Air carried no rules meaning and closely echoed the theaters of the published game *Air, Land & Sea*. Positional names need no learning and keep move descriptions unambiguous ("Shift 9 to Right").

## D17: Computer levels are search budgets of one algorithm

**Decision:** Easy, Medium and Hard run the same simultaneous-move tree search with exact final-turn solving, at 300, 3,000 and 24,000 iterations. The v0.2 one-turn heuristic survives only as a research baseline in `research/sim`.

**Reason:** The v0.2 "Deep" level was measured at 48.9% against "Tactical": not stronger. More iterations of a sampled search are not guaranteed to play better in every position, so the order of the levels rests on measurement: under v0.3 Medium beat Easy 89.7% and Hard beat Medium 80.2% (400 games each, RESEARCH.md). None is claimed optimal.

## D18: Teach by playing constrained turns

**Decision:** "Learn by playing" is five one-turn lessons on real positions: secret orders, scoring and spent cards, Shift, Recall, and a final-turn puzzle. Each lesson allows only the order it teaches and explains what happened after the reveal.

**Reason:** The homepage already shows a complete game (D14). A newcomer still needs to make each kind of order once, see a scoring and see a card spent, before a full game against Easy is comfortable.

## D19: The client recomputes online scoring

**Decision:** The online room service enforces hidden orders, turn order and legality, and reports the rules each table was started under. Clients rebuild the game, including scores and the tiebreak, from the revealed orders under those rules. A table started under v0.2 keeps v0.2 scoring; a room service that reports no rules is treated as current.

**Reason:** The room service is deployed separately. Rule sets that keep board evolution identical (all v0.3 changes) then work with an older room service, and both players always compute the same result from the same public history. Tables last up to 30 days, so a game in progress during a rules change must not be rescored under the new values. The Val Town service was not redeployed with the v0.3 website, so it classifies tables by creation time rather than by a stored label.

## D20: Mark safe leads on scoring turns

**Decision:** On scoring turns the table marks a front "safe" when no single order of the other player can overturn its leader.

**Reason:** The central tactic is building leads the opponent's one order cannot reach. The marker uses only public information and makes that idea visible while players learn; it does not suggest moves.

## D21: Scoring turns are worth 2, 3 and 4 points per front (v0.3)

**Decision:** Turns 4, 8 and 12 score 2, 3 and 4 points per front won, replacing 1, 2 and 3.

**Reason:** Under 1/2/3 the last scoring was half of all points. In strong v0.2 self-play 42.5% of games reached a final turn decided by a pure win-or-lose guess, and the most common close pattern (+1 +2 −3) cancelled into equal points, so 14–18% of games between search bots ended level. With 2/3/4 the last scoring is 4/9 of the points and no combination of single-front splits cancels (+2 +3 −4 = +1): games level on points fell to 1–3%, and fewer final turns were pure guesses (31.5% against 37.2% under 1/2/3, both with the D22 tiebreak, in 4,000-iteration self-play positions). The schedule alone did not make a game better evidence of skill (the stronger bot's expected result was 74.7% under 2/3/4 without a tiebreak against 73.5% for v0.2); together with D22 it reached 76.5%. A flat 1/1/1 schedule measured the most skill-sensitive (79.0% with the D22 tiebreak), but the eventual winner trailed after turn 8 in only 6–8% of games, so most games would be settled with a third still to play; 2/3/4 keeps that figure at 23–28% (v0.2: 30–34%). 3/4/5 was within noise of 2/3/4. D5's intent, that later resources matter more without making early play irrelevant, is unchanged. Evidence: simulations in RESEARCH.md ("2026 rule-variant study and v0.3").

## D22: Equal points are decided by total strength over the three scorings

**Decision:** If the points are equal after turn 12, each player adds their strength on all three fronts at each scoring (turns 4, 8 and 12, before cards are spent). The greater total wins. Only equal totals are a draw.

**Reason:** A drawn single game tells a one-game player nothing, but a tiebreak only helps if a game that uses it is better evidence of who played better. Strength at the last scoring, adopted provisionally earlier in this study, made every game decisive without that: under 1/2/3 it gave the stronger bot 70% of the level games, but it also turned last turns that had been guesses between a draw and a win into full win-or-lose guesses (31.0% to 41.2% of final turns), and the stronger bot's expected result stayed where v0.2 had it (73.7% against 73.5%). Under 2/3/4 the stronger bot won 26 of the 47 level games it decided. Strength summed over the three scorings measures play across the whole game: the stronger bot won 79% of the level games under 1/2/3 and 82% under 2/3/4, and under 2/3/4 its expected result rose from 74.1% to 76.5% over 6,600 games in two independent batches. Most of that rise comes from how the search bots play under the rule rather than from the 2% of games that end level, so it is a bot-specific observation until humans are measured. The tiebreak is symmetric, uses only public information (every scoring's strengths are on the table and in the move list), and changes no other rule. Under 2/3/4 it decides about one game in fifty, so overkill stays wasteful in practice and D4 holds.

## D23: Alternatives studied and not adopted (2026)

**Decision:** v0.3 keeps simultaneous orders, Shift, Recall and highest-card exhaustion exactly as in v0.2.

**Reason:** Each alternative was measured with the same protocol (RESEARCH.md):

- Earned initiative, where the player whose last order named the lower card chooses second, reached about the same skill signal as 2/3/4 with a tiebreak but turns most reveals into sequential play, adds a rule, and requires a room-service change. A catch-up form (the trailing player chooses second) was the worst variant measured.
- Scoring every turn or every second turn without exhaustion produced the steepest search ladders but was shallow: "deploy your highest card where you are furthest behind" played as well as the 4,000-iteration search bot. Exhaustion is what prevents that.
- Removing Shift, making only the front winner exhaust, or spending the whole board at each scoring all lowered the skill signal; removing Recall was within noise and would have removed the game's main save mechanic.
- Settling equal points by strength at the last scoring removed draws without making a game better evidence of skill (D22). Settling them by who led after an earlier scoring measured no better in screening and rewards early leads, the opposite of D5.
- A flat 1/1/1 schedule and a 3/4/5 schedule: see D21.
