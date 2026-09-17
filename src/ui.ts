import { prepare, rank, type Action, type State, type TurnRecord } from './engine';

/** Presentation names only. Persisted front indices and all rules stay unchanged. */
export const fronts = [
  { name: 'Sea', icon: 'sea', code: '01', theme: 'sea' },
  { name: 'Land', icon: 'land', code: '02', theme: 'land' },
  { name: 'Air', icon: 'air', code: '03', theme: 'air' },
] as const;

export function orderText(action: Action): string {
  const verb = action.kind === 'deploy' ? 'Deploy' : action.kind === 'shift' ? 'Shift' : 'Recall';
  return `${verb} ${rank(action.card)}${action.kind === 'recall' ? '' : ` → ${fronts[action.front].name}`}`;
}

/** Intermediate display states do not replace the authoritative or saved game. */
export function revealFrames(previous: State, next: State, record: TurnRecord) {
  const sides = record.actions.map((action, index) =>
    prepare(previous.sides[index], action).side
  ) as State['sides'];
  const revealed: State = { turn: next.turn, sides, scores: [...previous.scores] };
  const scored: State = { ...revealed, scores: [...next.scores] };
  return { revealed, scored, settled: next };
}
