import test from 'node:test';
import assert from 'node:assert/strict';
import { initial, replay, resolve, V02, RULES, type Action, type Rules, type Side } from '../src/engine.ts';
import { revealFrames } from '../src/ui.ts';
import { orderFor, samePick, exhaustionMarks, safeLeads, levelTiebreak, revealSteps, animates, instructionText, detailText, lastTurnText, type Prompt, type Detail } from '../src/table.ts';

const D = (card: number, front: number): Action => ({ kind: 'deploy', card, front });
const S = (card: number, front: number): Action => ({ kind: 'shift', card, front });
const R = (card: number): Action => ({ kind: 'recall', card, front: -1 });
const side = (hand: number[], board: number[][]): Side => ({ hand, board, spent: [] });

test('a pick and a target become a legal order or nothing', () => {
  const s = side([1, 5, 9], [[13], [], []]);
  assert.deepEqual(orderFor(s, { from: 'hand', card: 9 }, 2), D(9, 2));
  assert.deepEqual(orderFor(s, { from: 'board', card: 13 }, 1), S(13, 1));
  assert.deepEqual(orderFor(s, { from: 'board', card: 13 }, 'recall'), R(13));
  assert.equal(orderFor(s, { from: 'board', card: 13 }, 0), null, 'a shift must change front');
  assert.equal(orderFor(s, { from: 'hand', card: 9 }, 'recall'), null, 'a hand card cannot be recalled');
  assert.equal(orderFor(s, { from: 'hand', card: 9 }, null), null);
  assert.equal(orderFor(s, null, 1), null);
  assert.equal(orderFor(side([], [[13], [], []]), { from: 'board', card: 13 }, 1), null, 'no card left to pay');
  assert.equal(samePick({ from: 'hand', card: 9 }, 'hand', 9), true);
  assert.equal(samePick({ from: 'hand', card: 9 }, 'board', 9), false);
  assert.equal(samePick(null, 'hand', 9), false);
});

test('exhaustion marks the highest card per occupied front, and a staged Recall of it saves it', () => {
  const sides: [Side, Side] = [side([1, 2], [[13, 5], [7], []]), side([3], [[], [12, 4], [6]])];
  assert.deepEqual(exhaustionMarks(sides, 0, null), [[13, 7, null], [null, 12, 6]]);
  assert.deepEqual(exhaustionMarks(sides, 0, R(13)), [[null, 7, null], [null, 12, 6]]);
  assert.deepEqual(exhaustionMarks(sides, 0, R(5)), [[13, 7, null], [null, 12, 6]], 'recalling a lower card still spends the highest');
  assert.deepEqual(exhaustionMarks(sides, 1, R(12)), [[13, 7, null], [null, null, 6]]);
});

test('a lead is safe only when no single order of the other side can overturn it', () => {
  const mine = side([2], [[13], [3], []]);
  const theirs = side([4], [[], [10], []]);
  const safe = safeLeads(mine, theirs, mine);
  assert.equal(safe[0].mine, true, '13 holds against the 10 shifted over or the 4 from hand');
  assert.equal(safe[1].theirs, false, 'shifting my 13 to Middle makes 16 against 10');
  assert.equal(safeLeads(mine, side([4], [[], [13, 10], []]), mine)[1].theirs, true, '23 holds against at most 3 + 13');
  assert.equal(safeLeads(side([2], [[], [3, 13], []]), theirs, mine)[1].mine, true, 'a staged shift counts toward my lead: 16 against at most 10 + 4');
});

test('the tiebreak line appears only while points are level and the tiebreak can count', () => {
  const pairs: [Action, Action][] = [[D(13, 0), D(12, 0)], [D(1, 1), D(2, 1)], [D(3, 2), D(4, 2)], [D(5, 1), D(6, 2)]];
  const { state, history } = replay(pairs);
  const total: Rules = { ...RULES, tiebreak: 'total-strength' };
  const final: Rules = { ...RULES, tiebreak: 'final-strength' };
  assert.deepEqual(state.scores, [4, 2]);
  assert.equal(levelTiebreak(state.scores, state.turn, history, total), null, 'points differ');
  assert.deepEqual(levelTiebreak([4, 4], state.turn, history, total), [22, 24], 'strength at the turn-4 scoring');
  assert.equal(levelTiebreak([4, 4], state.turn, history, final), null, 'final strength counts only after turn 12');
  assert.equal(levelTiebreak([4, 4], 3, history, total), null, 'before any scoring');
  assert.equal(levelTiebreak([4, 4], state.turn, history, V02), null, 'v0.2 had no tiebreak');
});

test('a resolved turn is revealed, scored when it is a scoring turn, then settled', () => {
  const start = replay([[D(1, 0), D(2, 0)], [D(3, 1), D(4, 1)], [D(5, 2), D(6, 2)]]).state;
  const scoring = resolve(start, D(13, 0), D(12, 1));
  const steps = revealSteps(revealFrames(start, scoring.state, scoring.record), scoring.record);
  assert.deepEqual(steps.map(step => step.phase), ['reveal', 'score', 'settle']);
  assert.equal(steps[0].scoring, null);
  assert.equal(steps[2].scoring, scoring.record, 'scored fronts stay marked while cards are spent');
  assert.equal(steps.at(-1)!.shown, scoring.state);
  const quiet = resolve(initial(), D(13, 0), D(12, 1));
  assert.deepEqual(revealSteps(revealFrames(initial(), quiet.state, quiet.record), quiet.record).map(step => step.phase), ['reveal', 'settle']);
  assert.equal(animates(0, quiet.state, quiet.record), true);
  assert.equal(animates(1, quiet.state, quiet.record), false, 'same turn again');
  assert.equal(animates(0, scoring.state, scoring.record), false, 'skipped turns jump without animation');
});

test('the command bar explains each stage of a turn', () => {
  const base: Prompt = { phase: 'idle', points: 0, scored: false, over: false, locked: false, status: '', canAct: true, refusal: '', order: null, pick: null, boardEmpty: true };
  const say = (p: Partial<Prompt>) => instructionText({ ...base, ...p });
  assert.equal(say({ phase: 'reveal' }), 'Both orders revealed.');
  assert.equal(say({ phase: 'score', points: 3 }), 'Scoring: 3 per front won.');
  assert.equal(say({ phase: 'settle', scored: true }), 'Highest cards are spent. Recalled cards return.');
  assert.equal(say({ phase: 'settle' }), 'Recalled cards return.');
  assert.equal(say({ over: true }), 'Game over.');
  assert.equal(say({ locked: true }), 'Locked in. Waiting for the other order.');
  assert.equal(say({ locked: true, status: 'Locked in. Waiting for your friend…' }), 'Locked in. Waiting for your friend…');
  assert.equal(say({ canAct: false, status: 'The computer is choosing…' }), 'The computer is choosing…');
  assert.equal(say({ refusal: 'Not this time.' }), 'Not this time.');
  assert.equal(say({ order: D(9, 1) }), 'Deploy 9 to Middle');
  assert.equal(say({}), 'Pick a card from your hand.');
  assert.equal(say({ boardEmpty: false }), 'Pick a card in your hand or on the board.');
  assert.equal(say({ pick: { from: 'hand', card: 12 } }), 'Deploy Q: tap a front.');
  assert.equal(say({ pick: { from: 'board', card: 1 } }), 'Move A: tap another front, or recall it.');
});

test('the detail line shows costs, a locked order, or the last turn', () => {
  const last = resolve(initial(), D(13, 0), D(12, 2)).record;
  const base: Detail = { locked: null, order: null, pick: null, payment: 1, stake: 0, last: undefined, names: ['You', 'Computer'], seat: 0 };
  const say = (d: Partial<Detail>) => detailText({ ...base, ...d });
  assert.equal(say({ locked: D(9, 1) }), 'Deploy 9 to Middle');
  assert.equal(say({ order: S(13, 1) }), 'Pays your lowest card, A.');
  assert.equal(say({ order: R(13), stake: 2 }), 'Pays your lowest card, A. It still counts for this scoring.');
  assert.equal(say({ order: R(13) }), 'Pays your lowest card, A.');
  assert.equal(say({ pick: { from: 'board', card: 13 } }), 'Shift or recall pays your lowest card, A.');
  assert.equal(say({ pick: { from: 'hand', card: 13 } }), '');
  assert.equal(say({ order: D(9, 1) }), '');
  assert.equal(say({ last }), 'Last turn · You: Deploy K to Left · Computer: Deploy Q to Right');
  assert.equal(lastTurnText(last, ['Friend', 'You'], 1), 'Last turn · You: Deploy Q to Right · Friend: Deploy K to Left');
});
