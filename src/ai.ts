import { actions, type Action, type State } from './engine.ts';
import { fromState, toAction } from './ai/fast.ts';
import { search } from './ai/mcts.ts';

export type Difficulty = 'easy' | 'medium' | 'hard';
/** Accepts current names and the names stored by earlier versions. */
export function normalizeLevel(value: string): Difficulty {
  if (value === 'easy' || value === 'casual') return 'easy';
  if (value === 'hard' || value === 'expert') return 'hard';
  return 'medium';
}
/** Search budget per decision. Strengths are measured in docs/RESEARCH.md. */
const budgets: Record<Difficulty, number> = { easy: 300, medium: 3000, hard: 24000 };

/** Each call accepts a public snapshot only, never the other player's pending order.
 * `strength` is the public tiebreak total so far (see engine.tiebreakStrength). */
export function chooseAction(state: State, seat: 0 | 1, difficulty: Difficulty = 'medium', random = Math.random, strength: [number, number] = [0, 0]): Action {
  if (!actions(state.sides[seat]).length) throw new Error('No legal actions.');
  return toAction(search(fromState(state, strength), seat, { iterations: budgets[difficulty], random }));
}
