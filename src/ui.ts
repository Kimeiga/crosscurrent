import { prepare, rank, type Action, type Side, type State, type TurnRecord } from './engine.ts';

/** Presentation names only. Persisted front indices and all rules stay unchanged. */
export const fronts = ['Left', 'Middle', 'Right'] as const;

export function orderText(action: Action): string {
  if (action.kind === 'recall') return `Recall ${rank(action.card)}`;
  return `${action.kind === 'deploy' ? 'Deploy' : 'Shift'} ${rank(action.card)} to ${fronts[action.front]}`;
}

/** Intermediate display states do not replace the authoritative or saved game. */
export function revealFrames(previous: State, next: State, record: TurnRecord) {
  const sides = record.actions.map((action, index) =>
    prepare(previous.sides[index], action).side
  ) as State['sides'];
  const revealed: State = { ...next, turn: next.turn, sides, scores: [...previous.scores] };
  const scored: State = { ...revealed, scores: [...next.scores] };
  return { revealed, scored, settled: next };
}

/** The card each occupied front would lose after scoring, ignoring recalls. */
export const exhaustTargets = (side: Side) => side.board.map(cards => (cards.length ? Math.max(...cards) : null));
