# Crosscurrent v0.2

Two players. One ordinary deck. Twelve simultaneous turns. No shuffle.

## Setup

Each player takes one complete suit, Ace through King. The suits are equivalent. Ace is worth 1, Jack 11, Queen 12 and King 13. All cards in hand, deployed cards and spent cards are public. Only the order being chosen this turn is secret.

There are three shared fronts, called Sea, Land and Air in the app. They have identical rules. Each player has their own side of each front. Strength at a front is the sum of that player's cards there.

## Choose one complete order

Both players choose an order without seeing the other player's choice. Neither player resolves their order until both orders are committed.

**Deploy:** play any card in your hand to any front. It adds its rank to your strength there.

**Shift:** permanently spend the lowest card in your hand to move one of your deployed cards to another front. The destination must differ from its current front.

**Recall:** permanently spend the lowest card in your hand to recover one deployed card. The target remains in place for any scoring this turn and then returns to your hand.

You cannot pass. Shift and Recall require a deployed card and a card in hand to pay. There is no limit on cards at a front.

## Score at turns 4, 8 and 12

After both orders resolve on turn 4, each front with greater strength earns its owner 1 point. At turn 8 each won front earns 2 points. At turn 12 each won front earns 3 points. A tied front awards neither player any points. Winning by more strength does not earn extra points.

Cards and remaining resources carry forward between checkpoints. These are three scoring moments in one game, not separate deals.

## Exhaustion and Recall

After scoring at each checkpoint, each player removes their own highest card from every front they occupy. Removed cards are permanently spent. This happens whether that player won, lost or tied the front.

Recall saves its target. If the recalled card was the highest at its front, it returns to hand instead of being spent, and no second card is removed in its place. If the recalled card was not the highest, the highest is still spent and the recalled card returns to hand separately.

For example, a front containing a King and a 5 scores with strength 18. Recalling the King on that checkpoint still scores with 18, then returns the King and leaves the 5. Recalling the 5 instead returns the 5 and spends the King.

## End of the game

After turn 12, the greater accumulated score wins. Equal scores are a draw. There is no coin-flip tiebreak, seat handicap or redeal.

The starting rules are symmetric, but symmetry is not a guarantee of decisive games or a full-size optimal-play solution. The computer opponents and homepage example are not proven optimal.
