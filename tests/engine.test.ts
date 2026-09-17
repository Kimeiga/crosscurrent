import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { initial, actions, prepare, resolve, replay, checkInvariants, isAction, rank, rankName, type Action, type State, type Side } from '../src/engine.ts';
import { chooseAction } from '../src/ai.ts';
const D = (card: number, front: number): Action => ({ kind: 'deploy', card, front });
const S = (card: number, front: number): Action => ({ kind: 'shift', card, front });
const R = (card: number): Action => ({ kind: 'recall', card, front: -1 });
const swap = (s: State): State => ({ turn: s.turn, sides: [s.sides[1], s.sides[0]], scores: [s.scores[1], s.scores[0]] });
const rng = (seed: number) => () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
test('identical starting resources, independent arrays and 39 opening orders', () => {
  const s = initial(); assert.deepEqual(s, swap(s)); assert.notEqual(s.sides[0].hand, s.sides[1].hand); assert.equal(actions(s.sides[0]).length, 39);
});
test('deploy removes the exact card from the hand', () => {
  const { state } = resolve(initial(), D(13, 0), D(12, 1)); assert.deepEqual(state.sides[0].board, [[13], [], []]); assert.equal(state.sides[0].hand.includes(13), false);
});
test('shift pays the lowest hand card and moves the target', () => {
  let s = resolve(initial(), D(13, 0), D(12, 1)).state; s = resolve(s, S(13, 2), S(12, 0)).state;
  assert.deepEqual(s.sides[0].board, [[], [], [13]]); assert.deepEqual(s.sides[0].spent, [1]);
});
test('noncheckpoint recall returns target and spends payment', () => {
  let s = resolve(initial(), D(13, 0), D(12, 1)).state; s = resolve(s, R(13), R(12)).state;
  assert.deepEqual(s.sides[0].board, [[], [], []]); assert(s.sides[0].hand.includes(13)); assert.deepEqual(s.sides[0].spent, [1]);
});
test('recalled highest card scores then returns with no replacement exhaustion', () => {
  const s: State = { turn: 3, scores: [0, 0], sides: [{ hand: [1, 3], board: [[2, 13], [], []], spent: [] }, { hand: [1, 3], board: [[12], [], []], spent: [] }] };
  const next = resolve(s, R(13), D(1, 1)); assert.deepEqual(next.state.scores, [1, 1]); assert.deepEqual(next.state.sides[0].board, [[2], [], []]); assert.deepEqual(next.state.sides[0].hand, [3, 13]); assert.deepEqual(next.state.sides[0].spent, [1]);
});
test('recalling a lower card does not save the highest', () => {
  const side: Side = { hand: [1, 3], board: [[2, 13], [], []], spent: [] };
  const next = resolve({ turn: 3, scores: [0, 0], sides: [side, side] }, R(2), R(13));
  assert.deepEqual(next.state.sides[0].hand, [2, 3]); assert.deepEqual(next.state.sides[0].spent, [1, 13]);
});
test('tied and losing fronts still exhaust', () => {
  const side: Side = { hand: [1], board: [[3, 13], [2], []], spent: [] };
  const s = resolve({ turn: 3, scores: [0, 0], sides: [side, side] }, D(1, 2), D(1, 2)).state;
  assert.deepEqual(s.scores, [0, 0]); assert.deepEqual(s.sides[0].board, [[3], [], []]);
});
for (const [turn, points] of [[3, 1], [7, 2], [11, 3]]) test(`checkpoint after turn ${turn + 1} awards ${points} per front`, () => {
  const s: State = { turn, scores: [0, 0], sides: [{ hand: [1], board: [[13], [], []], spent: [] }, { hand: [1], board: [[], [12], []], spent: [] }] };
  assert.deepEqual(resolve(s, D(1, 2), D(1, 2)).state.scores, [points, points]);
});
test('public snapshot is immutable while preparing all possible moves', () => {
  const s = initial(); const before = structuredClone(s); for (const a of actions(s.sides[0])) prepare(s.sides[0], a); assert.deepEqual(s, before);
});
test('illegal cards, front numbers, kinds, and unavailable board cards are rejected', () => {
  const side = initial().sides[0]; for (const a of [D(14, 0), D(1, 3), S(1, 0), R(1), D(1.1, 0)]) assert.throws(() => prepare(side, a));
  for (const x of [null, {}, { kind: 'pass', card: 1, front: 0 }, { kind: 'recall', card: 1, front: 0 }]) assert.equal(isAction(x), false);
});
test('shift cannot target its source front', () => { const s = resolve(initial(), D(13, 0), D(12, 1)).state; assert.throws(() => prepare(s.sides[0], S(13, 0))); });
test('finished games reject more orders', () => { const s = initial(); s.turn = 12; assert.throws(() => resolve(s, D(1, 0), D(1, 0))); });
test('every opening pair is equivariant under seat swap', () => {
  const state = initial(); const opening = actions(state.sides[0]); for (const a of opening) for (const b of opening) assert.deepEqual(swap(resolve(state, a, b).state), resolve(swap(state), b, a).state);
});
test('2000 complete seeded games conserve every card and preserve seat symmetry', () => {
  const random = rng(20260917); for (let i = 0; i < 2000; i++) {
    let state = initial(); for (let turn = 0; turn < 12; turn++) {
      const pair = state.sides.map(side => { const legal = actions(side); return legal[Math.floor(random() * legal.length)]; }) as [Action, Action];
      const next = resolve(state, ...pair).state; assert(checkInvariants(next)); assert.deepEqual(swap(next), resolve(swap(state), pair[1], pair[0]).state); state = next;
    }
  }
});
const tacticalPairs: [Action, Action][] = [
  [D(13,2),D(11,2)], [D(12,2),D(3,2)], [D(8,0),D(4,2)], [D(3,1),D(6,1)], [R(12),R(4)], [D(2,2),D(9,0)], [D(6,0),D(12,1)], [D(5,0),D(10,2)], [S(5,1),D(2,0)], [D(12,0),S(2,2)], [D(9,1),D(7,0)],
];
test('certified reachable winning and losing moves match all 18 replies', () => {
  const s = replay(tacticalPairs).state; assert.deepEqual(s.scores, [4, 5]); const replies = actions(s.sides[1]); assert.equal(replies.length, 18);
  for (const b of replies) { const win = resolve(s, S(9,2), b).state; const loss = resolve(s, S(12,1), b).state; assert(win.scores[0] > win.scores[1]); assert(loss.scores[0] < loss.scores[1]); }
});
test('golden fixtures agree with original Python v0.2 for 720 turns', () => {
  const fixtures = JSON.parse(readFileSync(new URL('./golden.json', import.meta.url), 'utf8'));
  // Hashes preserve all 720 original Python expected states, not TS-generated snapshots.
  const canonical = (value: unknown): string => JSON.stringify(value, (_, v) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b))) : v);
  for (const [orders, expected] of fixtures) {
    let state = initial(); const states: State[] = [];
    for (let offset = 0; offset < orders.length; offset += 6) {
      const decode = (s: string): Action => ({ kind: ({ D: 'deploy', S: 'shift', R: 'recall' } as const)[s[0] as 'D' | 'S' | 'R'], card: parseInt(s[1], 16), front: Number(s[2]) - 1 });
      state = resolve(state, decode(orders.slice(offset, offset + 3)), decode(orders.slice(offset + 3, offset + 6))).state;
      states.push(state);
    }
    assert.equal(states.length, 12);
    assert.equal(createHash('sha256').update(canonical(states)).digest('hex'), expected);
  }
});
for (const level of ['casual', 'tactical', 'expert'] as const) test(`${level} computer chooses legal actions from an unchanged public snapshot`, () => {
  const random = rng(842); let s = initial(); for (let turn = 0; turn < 12; turn++) {
    const before = structuredClone(s); const a = chooseAction(s, 0, level, random); const legal = actions(s.sides[1]); const b = legal[Math.floor(random() * legal.length)]; assert.deepEqual(s, before); s = resolve(s, a, b).state;
  }
  assert(checkInvariants(s));
});
test('rank labels retain exact card values', () => { assert.equal(rank(1), 'A'); assert.equal(rank(13), 'K'); assert.equal(rankName(12), 'Queen'); });
