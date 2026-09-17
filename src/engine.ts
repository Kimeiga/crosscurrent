/** Crosscurrent v0.2. Pure rules shared by UI, bots, and authoritative server. */
export type ActionKind = 'deploy' | 'shift' | 'recall';
export type Action = { kind: ActionKind; card: number; front: number };
export type Side = { hand: number[]; board: number[][]; spent: number[] };
export type State = { turn: number; sides: [Side, Side]; scores: [number, number] };
export type Checkpoint = { turn: number; points: number; strengths: [number[], number[]]; gained: [number, number]; exhausted: [number[], number[]] };
export type TurnRecord = { turn: number; actions: [Action, Action]; checkpoint: Checkpoint | null };
export type Match = { state: State; history: TurnRecord[] };

export const ranks = Array.from({ length: 13 }, (_, i) => i + 1);
export const labels = ['A', 'B', 'C'];
export const rank = (n: number) => (({ 1: 'A', 11: 'J', 12: 'Q', 13: 'K' } as Record<number, string>)[n] || String(n));
export const rankName = (n: number) => (({ 1: 'Ace', 11: 'Jack', 12: 'Queen', 13: 'King' } as Record<number, string>)[n] || String(n));
export const sum = (ns: number[]) => ns.reduce((a, b) => a + b, 0);
const sorted = (ns: number[]) => ns.sort((a, b) => a - b);
export const cloneSide = (s: Side): Side => ({ hand: [...s.hand], board: s.board.map(f => [...f]), spent: [...s.spent] });
export function initial(): State {
  const side = (): Side => ({ hand: [...ranks], board: [[], [], []], spent: [] });
  return { turn: 0, sides: [side(), side()], scores: [0, 0] };
}
export function actions(s: Side): Action[] {
  if (!s.hand.length) return [];
  const result: Action[] = s.hand.flatMap(card => labels.map((_, front) => ({ kind: 'deploy' as const, card, front })));
  s.board.forEach((cards, origin) => cards.forEach(card => {
    labels.forEach((_, front) => { if (front !== origin) result.push({ kind: 'shift', card, front }); });
    result.push({ kind: 'recall', card, front: -1 });
  }));
  return result;
}
export const sameAction = (a: Action, b: Action) => a.kind === b.kind && a.card === b.card && a.front === b.front;
export function isAction(value: unknown): value is Action {
  if (!value || typeof value !== 'object') return false;
  const a = value as Action;
  return ['deploy', 'shift', 'recall'].includes(a.kind) && Number.isInteger(a.card) && a.card >= 1 && a.card <= 13 && Number.isInteger(a.front) && (a.kind === 'recall' ? a.front === -1 : a.front >= 0 && a.front < 3);
}
export function prepare(source: Side, a: Action): { side: Side; recall: number | null } {
  if (!isAction(a) || !actions(source).some(b => sameAction(a, b))) throw new Error('That order is not legal in this position.');
  const side = cloneSide(source);
  let recall: number | null = null;
  if (a.kind === 'deploy') {
    side.hand.splice(side.hand.indexOf(a.card), 1);
    side.board[a.front].push(a.card);
  } else {
    side.spent.push(side.hand.shift()!);
    const origin = side.board.findIndex(f => f.includes(a.card));
    if (a.kind === 'shift') {
      side.board[origin].splice(side.board[origin].indexOf(a.card), 1);
      side.board[a.front].push(a.card);
    } else recall = a.card;
  }
  side.board.forEach(sorted);
  sorted(side.spent);
  return { side, recall };
}
export function finish(source: Side, recall: number | null, checkpoint: boolean): Side {
  const side = cloneSide(source);
  if (checkpoint) side.board.forEach(front => {
    if (!front.length) return;
    const high = front.pop()!;
    if (high === recall) { side.hand.push(high); recall = null; }
    else side.spent.push(high);
  });
  if (recall !== null) {
    const front = side.board.find(f => f.includes(recall!));
    if (!front) throw new Error('Missing recall target.');
    front.splice(front.indexOf(recall), 1);
    side.hand.push(recall);
  }
  sorted(side.hand); sorted(side.spent);
  return side;
}
export function resolve(state: State, a: Action, b: Action): { state: State; record: TurnRecord } {
  if (state.turn >= 12) throw new Error('This game is already complete.');
  const next = state.turn + 1;
  const prepared = [prepare(state.sides[0], a), prepare(state.sides[1], b)] as const;
  const scored = next % 4 === 0;
  const points = next / 4;
  const strengths = prepared.map(p => p.side.board.map(sum)) as [number[], number[]];
  const gained: [number, number] = [0, 0];
  if (scored) for (let f = 0; f < 3; f++) {
    if (strengths[0][f] > strengths[1][f]) gained[0] += points;
    if (strengths[1][f] > strengths[0][f]) gained[1] += points;
  }
  const sides = prepared.map(p => finish(p.side, p.recall, scored)) as [Side, Side];
  const exhausted = sides.map((s, i) => s.spent.filter(c => !prepared[i].side.spent.includes(c))) as [number[], number[]];
  return {
    state: { turn: next, sides, scores: [state.scores[0] + gained[0], state.scores[1] + gained[1]] },
    record: { turn: next, actions: [a, b], checkpoint: scored ? { turn: next, points, strengths, gained, exhausted } : null },
  };
}
export function replay(pairs: [Action, Action][]): Match {
  let state = initial();
  const history: TurnRecord[] = [];
  for (const pair of pairs) { const out = resolve(state, ...pair); state = out.state; history.push(out.record); }
  return { state, history };
}
export function description(a: Action): string {
  return a.kind === 'recall' ? `Recall ${rank(a.card)}` : `${a.kind === 'shift' ? 'Shift' : 'Deploy'} ${rank(a.card)} → ${labels[a.front]}`;
}
export function checkInvariants(s: State): boolean {
  return s.turn >= 0 && s.turn <= 12 && s.sides.every(side => {
    const all = [...side.hand, ...side.spent, ...side.board.flat()];
    return JSON.stringify(sorted(all)) === JSON.stringify(ranks) && (s.turn === 12 || side.hand.length > 0);
  });
}
