<script lang="ts">
  import { pointsAt, RULES, type Rules } from './engine';
  /** `rules` is the rule set of the game in progress: an online table keeps the rules it was started under. */
  let { rules = RULES, onClose, onLearn }: { rules?: Rules; onClose: () => void; onLearn: () => void } = $props();
  const points = $derived([4, 8, 12].map(turn => pointsAt(turn, rules)));
</script>

<div class="sheet rules">
  <div class="sheet-top">
    <h2 id="rules-title">How to play</h2>
    <button class="close" onclick={onClose} aria-label="Close the rules">×</button>
  </div>
  {#if rules.name !== RULES.name}<p class="earlier">This table was started under the earlier scoring and keeps it, as described below.</p>{/if}
  <p>Crosscurrent is a card game for two. Each player has one suit, Ace to King: Ace is 1, Jack 11, Queen 12, King 13. There is no shuffle. Every card is face up; the only secret is the move each player is choosing right now.</p>
  <p>The table has three fronts: Left, Middle and Right. Each player has their own side of every front. Your <b>strength</b> at a front is the total of your cards there.</p>

  <h3>Each turn</h3>
  <p>Both players choose one order in secret. When both have locked in, the orders are revealed and carried out together.</p>
  <ul>
    <li><b>Deploy</b> a card from your hand to any front.</li>
    <li><b>Shift</b> one of your deployed cards to a different front. Pay with the lowest card in your hand.</li>
    <li><b>Recall</b> one of your deployed cards to your hand. Pay with the lowest card in your hand. On a scoring turn it still counts before it comes back.</li>
  </ul>
  <p>Paid cards are spent for the rest of the game. You can’t pass.</p>

  <h3>Scoring</h3>
  <p>Turns 4, 8 and 12 score. Each front goes to whoever is stronger there: <b>{points[0]} {points[0] === 1 ? 'point' : 'points'}</b> per front on turn 4, <b>{points[1]}</b> on turn 8 and <b>{points[2]}</b> on turn 12. A tied front scores nothing, and winning by more scores no more.</p>
  <p>After each scoring, both players lose their <b>highest card on every front they occupy</b>, win or lose. Those cards are spent. A recalled card goes back to your hand instead; if it was your highest card there, nothing else is removed.</p>

  <h3>Winning</h3>
  {#if rules.tiebreak === 'none'}
    <p>Most points after turn 12 wins. Equal points are a draw.</p>
  {:else}
    <p>Most points after turn 12 wins. If the points are equal, strength decides: add up each player’s strength on all three fronts at each of the three scorings, and the higher total wins. If that is equal too, it’s a draw.</p>
  {/if}

  <h3>Worth knowing</h3>
  <ul>
    <li>Later scorings are worth more, so saving strength matters, but the first two still carry {points[0] + points[1]} of every {points[0] + points[1] + points[2]} points.</li>
    <li>Your opponent gets one order per turn, so they can change at most one or two fronts. On scoring turns the app marks a lead <b>safe</b> when no single order can overturn it.</li>
    <li>Your highest card on a front is spent after scoring. Win with as little as you can.</li>
  </ul>
  <div class="sheet-actions">
    <button class="btn" onclick={onLearn}>Learn by playing</button>
    <button class="btn primary" onclick={onClose}>Done</button>
  </div>
</div>

<style>
  .rules b { color: var(--ink); font-weight: 650; }
  .earlier { font-weight: 600; color: var(--ink); }
</style>
