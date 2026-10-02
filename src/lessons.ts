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
  /** Receives the whole game so far, including the lesson's turn. */
  check?: (game: State, history: TurnRecord[]) => boolean;
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
export function bestReply(game: State, mine: Action, history: TurnRecord[] = []): Action {
  let best: Action | null = null;
  let bestValue = Infinity;
  for (const reply of actions(game.sides[1])) {
    const out = resolve(game, mine, reply);
    const result = outcome(out.state, [...history, out.record]).winner;
    const value = result === 0 ? 1 : result === 1 ? 0 : 0.5;
    if (value < bestValue) { bestValue = value; best = reply; }
  }
  return best!;
}

/** A final-turn position reached in strong self-play under the current rules, found by
 * research/sim `puzzles`: exactly one of the player's 24 orders wins against all 21 replies. */
const puzzleOrders: [Action, Action][] = [
  [D(8, 1), D(8, 1)], [D(9, 2), D(7, 1)], [D(7, 2), D(9, 2)], [D(10, 1), D(12, 2)], [D(6, 2), D(13, 1)], [D(12, 1), D(4, 2)],
  [D(13, 2), D(6, 1)], [R(13), D(1, 0)], [D(13, 1), D(5, 0)], [D(11, 2), D(10, 1)], [S(6, 1), S(4, 0)],
];
export const puzzleAnswer = S(11, 0);

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
    before: 'Turn 4 scores: 2 points for each front where you are stronger. You trail on Right, 4 to 5. Deploy your 3 there.',
    allowed: a => is(a, D(3, 2)),
    reply: () => D(2, 1),
    after: 'You won Middle and Right, 4 points to 2. Then each player’s highest card on every front was spent, win or lose. Big cards played early don’t last.',
  },
  {
    title: 'Shift',
    start: () => position(6, [2, 4],
      side([3, 4, 5, 6, 8, 9, 11, 13], [[10], [7, 12], []], [1, 2]),
      side([2, 4, 7, 8, 9, 10, 12, 13], [[11], [5], [6]], [1, 3])),
    before: 'Shift moves one of your cards to another front. You have more than you need on Middle (19 to 5). Tap your 7 there, then tap Right.',
    allowed: a => is(a, S(7, 2)),
    reply: () => D(4, 0),
    after: 'Your 7 moved, and your lowest card, the 3, was spent to pay for it. Low cards matter: they pay for every Shift and Recall.',
  },
  {
    title: 'Recall',
    start: () => position(7, [2, 4],
      side([4, 6, 7, 8, 10, 11], [[9], [12], [5, 13]], [1, 2, 3]),
      side([3, 4, 5, 6, 7, 9, 12, 13], [[11], [8], [10]], [1, 2])),
    before: 'Turn 8 scores 3 per front. Your King on Right is dashed: it would be spent after scoring. Tap it, then Recall. It still counts this turn, then returns to your hand.',
    allowed: a => is(a, R(13)),
    reply: () => D(3, 0),
    after: 'You won Middle and Right for 6 points. The King counted, then came home, and because it was your highest card there, your 5 stayed too.',
  },
  {
    title: 'The last turn',
    start: () => { const m = replay(puzzleOrders); return { game: m.state, history: m.history }; },
    before: 'Last turn: 4 points per front, and you trail 5 to 8, so you need two fronts. The computer sees what you see and gets one order too. Find the only order that wins whatever it does.',
    allowed: null,
    check: (game, history) => outcome(game, history).winner === 0,
    hint: 'their one order can take back only one front. Can you lead on all three?',
    after: 'That’s it. You lead all three fronts, so their one order can take back only one of them, and two fronts win the game.',
    retry: 'Their best reply beat that order. The only answer: shift your Jack from Right to Left. Then you lead 11–9, 27–23 and 7–0, and no single order can overturn two fronts.',
  },
];
