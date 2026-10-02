import { actions, initial, outcome, replay, resolve, type Action, type Side, type State, type TurnRecord } from './engine.ts';

export type Lesson = {
  title: string;
  start: () => { game: State; history: TurnRecord[] };
  before: string;
  after: string;
  allowed: ((a: Action) => boolean) | null;
  /** Scripted opponent order; omitted means the opponent's best reply. */
  reply?: (game: State, mine: Action) => Action;
  /** Lesson succeeds only if this holds after the turn. */
  check?: (game: State, record: TurnRecord) => boolean;
  hint?: string;
  retry?: string;
};

const D = (card: number, front: number): Action => ({ kind: 'deploy', card, front });
const S = (card: number, front: number): Action => ({ kind: 'shift', card, front });
const R = (card: number): Action => ({ kind: 'recall', card, front: -1 });
const is = (a: Action, b: Action) => a.kind === b.kind && a.card === b.card && a.front === b.front;
const side = (hand: number[], board: number[][], spent: number[]): Side => ({ hand, board, spent });
const position = (turn: number, scores: [number, number], mine: Side, theirs: Side) => ({
  game: { turn, scores, sides: [mine, theirs] } as State,
  history: [] as TurnRecord[],
});

/** The opponent's strongest single reply to a known order (used for the final puzzle). */
export function bestReply(game: State, mine: Action): Action {
  let best: Action | null = null;
  let bestValue = Infinity;
  for (const reply of actions(game.sides[1])) {
    const out = resolve(game, mine, reply);
    const result = outcome(out.state, [out.record]).winner;
    const value = result === 0 ? 1 : result === 1 ? 0 : 0.5;
    if (value < bestValue) { bestValue = value; best = reply; }
  }
  return best!;
}

/** A reachable final-turn position from the original research: one shift wins against all 18 replies. */
export const puzzleOrders: [Action, Action][] = [
  [D(13, 2), D(11, 2)], [D(12, 2), D(3, 2)], [D(8, 0), D(4, 2)], [D(3, 1), D(6, 1)], [R(12), R(4)], [D(2, 2), D(9, 0)],
  [D(6, 0), D(12, 1)], [D(5, 0), D(10, 2)], [S(5, 1), D(2, 0)], [D(12, 0), S(2, 2)], [D(9, 1), D(7, 0)],
];

export const lessons: Lesson[] = [
  {
    title: 'Secret orders',
    start: () => ({ game: initial(), history: [] }),
    before: 'You play spades, the computer plays hearts, and you both hold Ace to King. Tap your 9, tap Middle, then Lock in.',
    allowed: a => is(a, D(9, 1)),
    reply: () => D(6, 0),
    after: 'Both orders stayed secret until you had both locked in. A front’s strength is the total of your cards there: you have 9 on Middle, they have 6 on Left.',
  },
  {
    title: 'Scoring and spent cards',
    start: () => position(3, [0, 0],
      side([1, 2, 3, 5, 6, 7, 10, 11, 12, 13], [[8], [9], [4]], []),
      side([1, 2, 3, 4, 7, 8, 9, 11, 12, 13], [[10], [6], [5]], [])),
    before: 'Turn 4 scores: 1 point for each front where you are stronger. You trail on Right, 4 to 5. Deploy your 3 there.',
    allowed: a => is(a, D(3, 2)),
    reply: () => D(2, 1),
    after: 'You won Middle and Right, 2 points to 1. Then each player’s highest card on every front was spent, win or lose. Big cards played early don’t last.',
  },
  {
    title: 'Shift',
    start: () => position(6, [1, 2],
      side([3, 4, 5, 6, 8, 9, 11, 13], [[10], [7, 12], []], [1, 2]),
      side([2, 4, 7, 8, 9, 10, 12, 13], [[11], [5], [6]], [1, 3])),
    before: 'Shift moves one of your cards to another front. You have more than you need on Middle (19 to 5). Tap your 7 there, then tap Right.',
    allowed: a => is(a, S(7, 2)),
    reply: () => D(4, 0),
    after: 'Your 7 moved, and your lowest card, the 3, was spent to pay for it. Low cards matter: they pay for every Shift and Recall.',
  },
  {
    title: 'Recall',
    start: () => position(7, [1, 2],
      side([4, 6, 7, 8, 10, 11], [[9], [12], [5, 13]], [1, 2, 3]),
      side([3, 4, 5, 6, 7, 9, 12, 13], [[11], [8], [10]], [1, 2])),
    before: 'Turn 8 scores 2 per front. Your King on Right is dashed: it would be spent after scoring. Tap it, then Recall. It still counts this turn, then returns to your hand.',
    allowed: a => is(a, R(13)),
    reply: () => D(3, 0),
    after: 'You won Middle and Right for 4 points. The King counted, then came home, and because it was your highest card there, your 5 stayed too.',
  },
  {
    title: 'The last turn',
    start: () => { const m = replay(puzzleOrders); return { game: m.state, history: [] }; },
    before: 'Last turn: 3 points per front, and you trail 4 to 5. The computer sees what you see and gets one order too. Find an order that wins whatever it does.',
    allowed: null,
    check: (game, record) => outcome(game, [record]).winner === 0,
    hint: 'they can change only one front. Be ahead on two fronts by more than any one of their orders can swing.',
    after: 'That’s it. With one order they could overturn only one front, and you were safely ahead on two.',
    retry: 'Their best reply beat that order. One answer: shift your 9 from Middle to Right. Then you lead Left 12–7, Middle 5–0 and Right 9–5, and no single order of theirs can overturn two of them.',
  },
];
