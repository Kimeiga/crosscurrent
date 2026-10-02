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

**Decision:** Easy, Medium and Hard run the same simultaneous-move tree search with exact final-turn solving, at 300, 3,000 and 24,000 iterations. The v0.2 one-turn heuristic is kept only as a research baseline.

**Reason:** The v0.2 "Deep" level was measured at 48.9% against "Tactical": not stronger. Levels that differ only in search budget are strictly ordered by construction, and their gaps are measured (RESEARCH.md). None is claimed optimal.

## D18: Teach by playing constrained turns

**Decision:** "Learn by playing" is five one-turn lessons on real positions: secret orders, scoring and spent cards, Shift, Recall, and a final-turn puzzle. Each lesson allows only the order it teaches and explains what happened after the reveal.

**Reason:** The homepage already shows a complete game (D14). A newcomer still needs to make each kind of order once, see a scoring and see a card spent, before a full game against Easy is comfortable.

## D19: The client recomputes online scoring

**Decision:** The online room service enforces hidden orders, turn order and legality. Clients rebuild the game, including scores and the tiebreak, from the revealed orders.

**Reason:** The room service is deployed separately. Rule sets that keep board evolution identical (all v0.3 changes) then work with an older room service, and both players always compute the same result from the same public history.

## D20: Mark safe leads on scoring turns

**Decision:** On scoring turns the table marks a front "safe" when no single order of the other player can overturn its leader.

**Reason:** The central tactic is building leads the opponent's one order cannot reach. The marker uses only public information and makes that idea visible while players learn; it does not suggest moves.

## D21: Scoring turns are worth 2, 3 and 4 points per front (v0.3)

**Decision:** Turns 4, 8 and 12 score 2, 3 and 4 points per front won, replacing 1, 2 and 3.

**Reason:** Under 1/2/3 the last scoring was half of all points. In strong self-play 42.5% of games reached a final turn decided by a pure win-or-lose guess, and the most common close pattern (+1 +2 −3) cancelled into a draw, so 14–17% of games between search bots were drawn. With 2/3/4 the last scoring is 44% of the points and no combination of single-front splits cancels (+2 +3 −4 = +1). Against a bot with a quarter of its search, the stronger bot won outright 76–78% of games instead of 65%. A flat 1/1/1 schedule measured a similar or slightly higher skill signal with a tiebreak, but the eventual winner was behind after turn 8 in only 1–12% of games (36% under 1/2/3, about 24–32% under 2/3/4): most games would be settled with a third still to play. D5's intent, that later resources matter more without making early play irrelevant, is unchanged. Evidence: simulations in RESEARCH.md ("Rule-variant study").

## D22: Equal points are decided by strength at the last scoring

**Decision:** If the points are equal after turn 12, the player with more total strength across all three fronts at the turn-12 scoring wins. Only equal strength as well is a draw.

**Reason:** A drawn single game tells a one-game player nothing about who played better. The tiebreak is symmetric, uses information already on the table at the end, and changes no other rule. With 2/3/4 scoring it decides only a few percent of games, so its effect on play is small; the draw rate between search bots fell to 0–1%. Margin still does not score points (D4); strength only separates equal points.

## D23: Alternatives studied and not adopted (2026)

**Decision:** v0.3 keeps simultaneous orders, Shift, Recall and highest-card exhaustion exactly as in v0.2.

**Reason:** Each alternative was measured with the same protocol (RESEARCH.md):

- Earned initiative, where the player whose last order named the lower card chooses second, reached about the same skill signal as 2/3/4 with a tiebreak but turns most reveals into sequential play, adds a rule, and requires a room-service change. A catch-up form (the trailing player chooses second) was the worst variant measured.
- Scoring every turn or every second turn without exhaustion produced the steepest search ladders but was shallow: "deploy your highest card where you are furthest behind" played as well as the 4,000-iteration search bot. Exhaustion is what prevents that.
- Removing Shift, making only the front winner exhaust, or spending the whole board at each scoring all lowered the skill signal; removing Recall was within noise and would have removed the game's main save mechanic.
