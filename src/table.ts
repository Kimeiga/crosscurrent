/** The decisions behind the game table (Table.svelte), kept as plain functions so they can be unit tested. */
import { actions, rank, sameAction, sum, tiebreakStrength, RULES, type Action, type Checkpoint, type Rules, type Side, type State, type TurnRecord } from './engine.ts';
import { exhaustTargets, orderText, type revealFrames } from './ui.ts';

export type Pick = { from: 'hand' | 'board'; card: number };
export type Target = number | 'recall';
export type Phase = 'idle' | 'reveal' | 'score' | 'settle';

function describe(pick: Pick, target: Target): Action {
  if (target === 'recall') return { kind: 'recall', card: pick.card, front: -1 };
  return { kind: pick.from === 'hand' ? 'deploy' : 'shift', card: pick.card, front: target };
}

/** The order a picked card and a chosen target describe, or null when it is not a legal order for this side. */
export function orderFor(side: Side, pick: Pick | null, target: Target | null): Action | null {
  if (!pick || target === null) return null;
  const candidate = describe(pick, target);
  return actions(side).some(a => sameAction(a, candidate)) ? candidate : null;
}

export const samePick = (pick: Pick | null, from: Pick['from'], card: number) => pick?.from === from && pick.card === card;

/** The card each side loses on every front after this scoring, indexed by seat. `mine` should already include my
 * staged order (see engine.prepare): a deployed or shifted card can become the one spent, and a staged Recall of
 * the highest card saves it. The other side's order is unknown, so theirs follow the board. */
export function exhaustionMarks(mine: Side, theirs: Side, seat: 0 | 1, staged: Action | null) {
  const marks = seat === 0 ? [exhaustTargets(mine), exhaustTargets(theirs)] : [exhaustTargets(theirs), exhaustTargets(mine)];
  if (staged?.kind !== 'recall') return marks;
  const front = mine.board.findIndex(cards => cards.includes(staged.card));
  if (front >= 0 && marks[seat][front] === staged.card) marks[seat][front] = null;
  return marks;
}

/** The most strength one order can add to a front: a card from hand, or one shifted from another front. */
const reach = (side: Side, front: number) => Math.max(0, ...side.hand, ...side.board.flatMap((cards, f) => (f === front ? [] : cards)));

/** Fronts whose lead no single order of the other side can overturn. `mine` may include my staged order, which
 * counts toward my lead; `current` does not, and their lead is measured against my one order from `current`. */
export function safeLeads(mine: Side, theirs: Side, current: Side) {
  return [0, 1, 2].map(f => {
    const a = sum(mine.board[f]), b = sum(theirs.board[f]);
    return { mine: a > b + reach(theirs, f), theirs: b > sum(current.board[f]) + reach(current, f) };
  });
}

/** Tiebreak totals, shown only while the points are level and the tiebreak could decide the game. */
export function levelTiebreak(scores: readonly number[], turn: number, history: TurnRecord[], rules: Rules = RULES): [number, number] | null {
  if (rules.tiebreak === 'none' || scores[0] !== scores[1]) return null;
  const recorded = history.filter(entry => entry.turn <= turn);
  const counts = rules.tiebreak === 'total-strength' ? recorded.some(entry => entry.checkpoint) : turn >= 12;
  return counts ? tiebreakStrength(recorded, rules) : null;
}

/** A scoring in the move list: the points each side gained and the strength it had, which the tiebreak adds up. */
export function scoringText(checkpoint: Checkpoint, names: [string, string], seat: 0 | 1) {
  const side = (p: number) => `${names[p]} +${checkpoint.gained[p]} (strength ${sum(checkpoint.strengths[p])})`;
  return `Scoring: ${side(seat)}, ${side(1 - seat)}`;
}

/** Tiebreak totals for the move list, whatever the points: strength summed over the scorings so far. */
export function tiebreakTotals(history: TurnRecord[], rules: Rules = RULES): [number, number] | null {
  return rules.tiebreak === 'total-strength' && history.some(entry => entry.checkpoint) ? tiebreakStrength(history, rules) : null;
}

type Frames = ReturnType<typeof revealFrames>;
export type Step = { phase: Exclude<Phase, 'idle'>; shown: State; scoring: TurnRecord | null; ms: number };

/** The reveal animation of one resolved turn: both orders, then the scoring if there is one, then the cleanup. */
export function revealSteps(frames: Frames, record: TurnRecord): Step[] {
  const scoring = record.checkpoint ? record : null;
  const score: Step[] = scoring ? [{ phase: 'score', shown: frames.scored, scoring, ms: 1700 }] : [];
  return [{ phase: 'reveal', shown: frames.revealed, scoring: null, ms: 900 }, ...score, { phase: 'settle', shown: frames.settled, scoring, ms: 450 }];
}

/** A new state is animated only when it is the next turn and its record is the last one. */
export const animates = (observed: number, next: State, record: TurnRecord | undefined) => next.turn === observed + 1 && record?.turn === next.turn;

export type Prompt = {
  phase: Phase; points: number; scored: boolean; over: boolean; locked: boolean; status: string;
  canAct: boolean; refusal: string; order: Action | null; pick: Pick | null; boardEmpty: boolean;
};

function revealText(phase: Phase, points: number, scored: boolean) {
  if (phase === 'reveal') return 'Both orders revealed.';
  if (phase === 'score') return `Scoring: ${points} per front won.`;
  return scored ? 'Highest cards are spent. Recalled cards return.' : 'Recalled cards return.';
}
function waitingText(p: Prompt): string | null {
  if (p.over) return 'Game over.';
  if (p.locked) return p.status || 'Locked in. Waiting for the other order.';
  return p.canAct ? null : p.status;
}
function pickText(pick: Pick | null, boardEmpty: boolean) {
  if (pick) return pick.from === 'hand' ? `Deploy ${rank(pick.card)}: tap a front.` : `Move ${rank(pick.card)}: tap another front, or recall it.`;
  return boardEmpty ? 'Pick a card from your hand.' : 'Pick a card in your hand or on the board.';
}
function choiceText(p: Prompt) {
  if (p.refusal) return p.refusal;
  return p.order ? orderText(p.order) : pickText(p.pick, p.boardEmpty);
}

/** The main line of the command bar. */
export function instructionText(p: Prompt): string {
  if (p.phase !== 'idle') return revealText(p.phase, p.points, p.scored);
  return waitingText(p) ?? choiceText(p);
}

export type Detail = {
  locked: Action | null; order: Action | null; pick: Pick | null; payment: number; stake: number;
  last: TurnRecord | undefined; names: [string, string]; seat: 0 | 1;
};

const costText = (order: Action, payment: number, stake: number) =>
  `Pays your lowest card, ${rank(payment)}.${order.kind === 'recall' && stake ? ' It still counts for this scoring.' : ''}`;

export const lastTurnText = (last: TurnRecord, names: [string, string], seat: 0 | 1) =>
  `Last turn · ${names[seat]}: ${orderText(last.actions[seat])} · ${names[1 - seat]}: ${orderText(last.actions[1 - seat])}`;

function pickDetail(d: Detail) {
  if (d.pick) return d.pick.from === 'board' ? `Shift or recall pays your lowest card, ${rank(d.payment)}.` : '';
  return d.last ? lastTurnText(d.last, d.names, d.seat) : '';
}

/** The small line under the main one while choosing: the cost of the order, or what happened last turn. */
export function detailText(d: Detail): string {
  if (d.locked) return orderText(d.locked);
  if (d.order && d.order.kind !== 'deploy') return costText(d.order, d.payment, d.stake);
  return pickDetail(d);
}
