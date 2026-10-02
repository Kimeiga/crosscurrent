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
