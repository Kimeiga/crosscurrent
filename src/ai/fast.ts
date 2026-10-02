/** Bitmask mirror of engine.ts used only by the computer opponent's search.
 * Bit i of a mask is rank i + 1. Equivalence with engine.ts is tested. */
import { RULES, pointsAt, type Action, type State } from '../engine.ts';

export const FRONTS = 3;
export const TURNS = 12;
/** Packed action: kind | card << 2 | front << 6. Kinds: 0 deploy, 1 shift, 2 recall. */
export type Move = number;
const RECALL_FRONT = 3;

export const SUMS = new Uint8Array(1 << 13);
for (let m = 1; m < SUMS.length; m++) SUMS[m] = SUMS[m & (m - 1)] + (31 - Math.clz32(m & -m)) + 1;

export type FSide = { hand: number; board: [number, number, number]; spent: number };
export type FState = { turn: number; sides: [FSide, FSide]; scores: [number, number]; strength: [number, number] };

export const pack = (kind: number, card: number, front: number): Move => kind | (card << 2) | (front << 6);
export const kindOf = (m: Move) => m & 3;
export const cardOf = (m: Move) => (m >> 2) & 15;
export const frontOf = (m: Move) => m >> 6;
const bit = (card: number) => 1 << (card - 1);
const lowestCard = (mask: number) => 31 - Math.clz32(mask & -mask) + 1;
const highestCard = (mask: number) => 32 - Math.clz32(mask);
export { pointsAt };

const toMask = (cards: number[]) => cards.reduce((m, c) => m | bit(c), 0);
/** `strength` is the tiebreak total so far (needed only for the total-strength tiebreak). */
export function fromState(s: State, strength: [number, number] = [0, 0]): FState {
  const side = (x: State['sides'][0]): FSide => ({ hand: toMask(x.hand), board: [toMask(x.board[0]), toMask(x.board[1]), toMask(x.board[2])], spent: toMask(x.spent) });
  return { turn: s.turn, sides: [side(s.sides[0]), side(s.sides[1])], scores: [s.scores[0], s.scores[1]], strength: [strength[0], strength[1]] };
}
export function toAction(m: Move): Action {
  const kind = kindOf(m);
  return { kind: kind === 0 ? 'deploy' : kind === 1 ? 'shift' : 'recall', card: cardOf(m), front: kind === 2 ? -1 : frontOf(m) };
}
export const fromAction = (a: Action): Move => pack(a.kind === 'deploy' ? 0 : a.kind === 'shift' ? 1 : 2, a.card, a.kind === 'recall' ? RECALL_FRONT : a.front);

/** Legal moves in engine.ts order. Returns the count written into `out`. */
export function moves(s: FSide, out: Int32Array): number {
  let n = 0;
  if (!s.hand) return 0;
  for (let h = s.hand; h; h &= h - 1) {
    const card = lowestCard(h);
    for (let f = 0; f < FRONTS; f++) out[n++] = pack(0, card, f);
  }
  for (let origin = 0; origin < FRONTS; origin++) {
    for (let b = s.board[origin]; b; b &= b - 1) {
      const card = lowestCard(b);
      for (let f = 0; f < FRONTS; f++) if (f !== origin) out[n++] = pack(1, card, f);
      out[n++] = pack(2, card, RECALL_FRONT);
    }
  }
  return n;
}

const copySide = (s: FSide): FSide => ({ hand: s.hand, board: [s.board[0], s.board[1], s.board[2]], spent: s.spent });

/** Applies the order in place; returns the pending recall card or 0. */
function prepareInto(s: FSide, m: Move): number {
  const card = cardOf(m);
  const kind = kindOf(m);
  if (kind === 0) {
    s.hand &= ~bit(card);
    s.board[frontOf(m)] |= bit(card);
    return 0;
  }
  const pay = lowestCard(s.hand);
  s.hand &= ~bit(pay);
  s.spent |= bit(pay);
  if (kind === 1) {
    for (let f = 0; f < FRONTS; f++) s.board[f] &= ~bit(card);
    s.board[frontOf(m)] |= bit(card);
    return 0;
  }
  return card;
}

function finishInto(s: FSide, recall: number, checkpoint: boolean) {
  if (checkpoint) {
    for (let f = 0; f < FRONTS; f++) {
      if (!s.board[f]) continue;
      const high = highestCard(s.board[f]);
      s.board[f] &= ~bit(high);
      if (high === recall) { s.hand |= bit(high); recall = 0; } else s.spent |= bit(high);
    }
  }
  if (recall) {
    for (let f = 0; f < FRONTS; f++) s.board[f] &= ~bit(recall);
    s.hand |= bit(recall);
  }
}

/** Resolves a full turn into a new state. `strength` holds the tiebreak totals for the current rules. */
export function resolve(st: FState, a: Move, b: Move): FState {
  const next = clone(st);
  advance(next, a, b);
  return next;
}

/** Resolves a full turn in place (used by rollouts). */
export function advance(st: FState, a: Move, b: Move) {
  st.turn += 1;
  const [s0, s1] = st.sides;
  const r0 = prepareInto(s0, a);
  const r1 = prepareInto(s1, b);
  const points = pointsAt(st.turn);
  if (points) {
    let t0 = 0, t1 = 0;
    for (let f = 0; f < FRONTS; f++) {
      const x = SUMS[s0.board[f]], y = SUMS[s1.board[f]];
      t0 += x; t1 += y;
      if (x > y) st.scores[0] += points; else if (y > x) st.scores[1] += points;
    }
    if (RULES.tiebreak === 'total-strength') { st.strength[0] += t0; st.strength[1] += t1; }
    else if (st.turn === TURNS) st.strength = [t0, t1];
  }
  finishInto(s0, r0, points > 0);
  finishInto(s1, r1, points > 0);
}

/** 1 / 0.5 / 0 for player 0, with the final-strength tiebreak. */
export function result(st: FState): number {
  const d = st.scores[0] - st.scores[1];
  if (d) return d > 0 ? 1 : 0;
  const t = RULES.tiebreak === 'none' ? 0 : st.strength[0] - st.strength[1];
  return t > 0 ? 1 : t < 0 ? 0 : 0.5;
}

export function clone(st: FState): FState {
  return { turn: st.turn, sides: [copySide(st.sides[0]), copySide(st.sides[1])], scores: [st.scores[0], st.scores[1]], strength: [st.strength[0], st.strength[1]] };
}

/** Prepared strengths of one side after an order (for the final-turn matrix). */
export function preparedStrengths(s: FSide, m: Move, out: Int32Array) {
  const c = copySide(s);
  prepareInto(c, m);
  out[0] = SUMS[c.board[0]]; out[1] = SUMS[c.board[1]]; out[2] = SUMS[c.board[2]];
}
