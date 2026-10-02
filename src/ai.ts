import { actions, prepare, finish, sum, resolve, type Action, type Side, type State } from './engine.ts';
import { fromState, toAction } from './ai/fast.ts';
import { search } from './ai/mcts.ts';

export type Difficulty = 'easy' | 'medium' | 'hard';
export const levelName = (level: Difficulty) => ({ easy: 'Easy', medium: 'Medium', hard: 'Hard' })[level];
/** Accepts current names and the names stored by earlier versions. */
export function normalizeLevel(value: string): Difficulty {
  if (value === 'easy' || value === 'casual') return 'easy';
  if (value === 'hard' || value === 'expert') return 'hard';
  return 'medium';
}
/** Search budget per decision. Strengths are measured in docs/RESEARCH.md. */
export const budgets: Record<Difficulty, number> = { easy: 300, medium: 3000, hard: 24000 };

/** Each call accepts a public snapshot only, never the other player's pending order.
 * `strength` is the public tiebreak total so far (see engine.tiebreakStrength). */
export function chooseAction(state: State, seat: 0 | 1, difficulty: Difficulty = 'medium', random = Math.random, strength: [number, number] = [0, 0]): Action {
  if (!actions(state.sides[seat]).length) throw new Error('No legal actions.');
  return toAction(search(fromState(state, strength), seat, { iterations: budgets[difficulty], random }));
}

/** The v0.2 one-turn heuristic opponent, kept as a fixed baseline for research comparisons. */
export function heuristicAction(state: State, seat: 0 | 1, level: 'casual' | 'tactical' | 'expert' = 'tactical', random = Math.random): Action {
  const own = actions(state.sides[seat]);
  const other = actions(state.sides[1 - seat]);
  if (!own.length) throw new Error('No legal actions.');
  if (level === 'casual' && random() < 0.45) return own[Math.floor(random() * own.length)];
  const turn = state.turn + 1;
  const checkpoint = turn % 4 === 0;
  const weight = Math.ceil(turn / 4);
  const phaseDistance = (4 - turn % 4) % 4;
  const plans = (side: Side, legal: Action[]) => legal.map(action => {
    const p = prepare(side, action);
    const after = finish(p.side, p.recall, checkpoint);
    const onBoard = after.board.map(sum);
    const resources = sum(after.hand) * 0.024 + after.hand.length * 0.045 + sum(onBoard) * 0.018;
    return { strengths: p.side.board.map(sum), resources, after: onBoard };
  });
  const p = plans(state.sides[seat], own);
  const q = plans(state.sides[1 - seat], other);
  const matrix = p.map(a => q.map(b => {
    if (turn === 12) {
      let margin = state.scores[seat] - state.scores[1 - seat];
      for (let f = 0; f < 3; f++) margin += 3 * Math.sign(a.strengths[f] - b.strengths[f]);
      return Math.sign(margin);
    }
    let value = a.resources - b.resources;
    for (let f = 0; f < 3; f++) {
      const difference = a.strengths[f] - b.strengths[f];
      value += checkpoint ? weight * Math.sign(difference) : weight * 0.72 * Math.tanh(difference / (4 + phaseDistance * 2));
      if (checkpoint) value += 0.28 * Math.tanh((a.after[f] - b.after[f]) / 5);
    }
    return value;
  }));
  if (level === 'casual') {
    const averages = matrix.map(row => sum(row) / row.length + random() * 0.35);
    return own[averages.indexOf(Math.max(...averages))];
  }
  // Fictitious play approximates a mixed strategy of this one-step payoff model.
  const countA = Array(own.length).fill(0) as number[];
  const utilityA = Array(own.length).fill(0) as number[];
  const utilityB = Array(other.length).fill(0) as number[];
  let column = Math.floor(random() * other.length);
  const iterations = level === 'expert' ? 1800 : 280;
  for (let i = 0; i < iterations; i++) {
    for (let row = 0; row < own.length; row++) utilityA[row] += matrix[row][column];
    let best = 0;
    for (let row = 1; row < own.length; row++) if (utilityA[row] + random() * 1e-9 > utilityA[best]) best = row;
    countA[best]++;
    for (let j = 0; j < other.length; j++) utilityB[j] += matrix[best][j];
    column = 0;
    for (let j = 1; j < other.length; j++) if (utilityB[j] + random() * 1e-9 < utilityB[column]) column = j;
  }
  let ticket = random() * iterations;
  for (let row = 0; row < own.length; row++) { ticket -= countA[row]; if (ticket < 0) return own[row]; }
  return own[own.length - 1];
}
export function playSolo(state: State, human: Action, level: Difficulty) {
  return resolve(state, human, chooseAction(state, 1, level));
}
