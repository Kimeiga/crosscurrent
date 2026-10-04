/** Player-facing sentences that depend on the game state, kept out of the components so they can be tested. */
import { pointsAt, RULES, type Outcome, type Rules } from './engine.ts';

/** One tip per stage of a newcomer's first game, by the number of turns already played. */
export function firstGameTip(turn: number, rules: Rules = RULES): string {
  if (turn === 0) return 'Both players choose one order in secret, then both orders are revealed together. Tap a card in your hand, then a front.';
  if (turn < 3) return `Turn 4 scores ${pointsAt(4, rules)} per front where your cards add up to more. You can also tap one of your cards on a front to shift or recall it, paid with your lowest card.`;
  return turn === 3
    ? 'This turn scores. Afterwards each player loses their highest card on every front they occupy, shown dashed.'
    : `Turn 8 scores ${pointsAt(8, rules)} per front and turn 12 scores ${pointsAt(12, rules)}. Most points after turn 12 wins.`;
}

export type Waiting = { online: boolean; solo: boolean; friendHere: boolean; lockedIn: boolean; connection: string; busy: boolean };

function onlineStatus(w: Waiting): string | null {
  if (!w.friendHere) return 'Waiting for your friend to open the link.';
  if (w.lockedIn) return 'Locked in. Waiting for your friend…';
  if (w.connection === 'Live') return null;
  return w.connection === 'Connecting' ? 'Connecting…' : 'Connection lost. Reconnecting…';
}
function busyStatus(w: Waiting): string {
  if (!w.busy) return '';
  return w.solo ? 'The computer is choosing…' : 'Locking in…';
}

/** What the command bar says while the player cannot act. */
export function statusText(w: Waiting): string {
  return (w.online ? onlineStatus(w) : null) ?? busyStatus(w);
}

const tiebreakNote = (strength: [number, number], winner: 0 | 1, rules: Rules) =>
  ` on the tiebreak (${strength[winner]}–${strength[1 - winner]} ${rules.tiebreak === 'total-strength' ? 'total strength over the three scorings' : 'total strength at the last scoring'})`;

/** The result line at the end of a game, with the score from the winner's side. */
export function verdictText(result: Outcome, scores: readonly number[], names: [string, string], rules: Rules = RULES): string {
  if (result.winner === null) return `Draw, ${scores[0]}–${scores[1]}.`;
  const w = result.winner;
  const line = `${scores[w]}–${scores[1 - w]}${result.by === 'strength' ? tiebreakNote(result.strength, w, rules) : ''}`;
  return names[w] === 'You' ? `You win, ${line}.` : `${names[w]} wins, ${line}.`;
}

export type Screen = 'home' | 'learn' | 'game' | 'join';
const titles: Record<Screen, string> = { home: 'Crosscurrent · a card game for two', learn: 'Learn to play · Crosscurrent', join: 'Crosscurrent · a card game for two', game: '' };

/** The browser tab title. */
export function pageTitle(screen: Screen, turn: number): string {
  if (screen !== 'game') return titles[screen];
  return turn >= 12 ? 'Game over · Crosscurrent' : `Turn ${turn + 1} · Crosscurrent`;
}
