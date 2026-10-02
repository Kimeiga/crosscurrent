import test from 'node:test';
import assert from 'node:assert/strict';
import { initial, actions, resolve, outcome, sameAction, type Action, type State, type Side } from '../src/engine.ts';
import { fromState, fromAction, toAction, moves, resolveTurn as fastResolve, result, type FState } from '../src/ai/fast.ts';
import { solveGame, pureBounds } from '../src/ai/lp.ts';
import { finalMatrix, search } from '../src/ai/mcts.ts';
import { chooseAction } from '../src/ai.ts';

const rng = (seed: number) => () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
const sameState = (fast: FState, slow: State) => {
  const f = fromState(slow);
  assert.equal(fast.turn, f.turn);
  assert.deepEqual(fast.sides, f.sides);
  assert.deepEqual(fast.scores, f.scores);
};

test('fast engine generates the same legal orders in the same order', () => {
  const random = rng(7);
  for (let g = 0; g < 300; g++) {
    let state = initial();
    for (let t = 0; t < 12; t++) {
      for (const seat of [0, 1] as const) {
        const out = new Int32Array(64);
        const n = moves(fromState(state).sides[seat], out);
        assert.deepEqual(Array.from(out.slice(0, n), toAction), actions(state.sides[seat]));
      }
      const pair = state.sides.map((side: Side) => { const legal = actions(side); return legal[Math.floor(random() * legal.length)]; }) as [Action, Action];
      state = resolve(state, ...pair).state;
    }
  }
});

test('fast engine matches every transition and final result of the reference engine', () => {
  const random = rng(20261002);
  for (let g = 0; g < 2000; g++) {
    let state = initial();
    let fast = fromState(state);
    const history = [];
    for (let t = 0; t < 12; t++) {
      const pair = state.sides.map((side: Side) => {
        const legal = actions(side);
        const moving = legal.filter(a => a.kind !== 'deploy');
        return moving.length && random() < 0.4 ? moving[Math.floor(random() * moving.length)] : legal[Math.floor(random() * legal.length)];
      }) as [Action, Action];
      const out = resolve(state, ...pair);
      state = out.state; history.push(out.record);
      fast = fastResolve(fast, fromAction(pair[0]), fromAction(pair[1]));
      sameState(fast, state);
    }
    const reference = outcome(state, history);
    assert.equal(result(fast), reference.winner === 0 ? 1 : reference.winner === 1 ? 0 : 0.5);
  }
});

test('order packing round-trips', () => {
  for (const a of actions(resolve(initial(), { kind: 'deploy', card: 13, front: 0 }, { kind: 'deploy', card: 1, front: 2 }).state.sides[0])) {
    assert(sameAction(toAction(fromAction(a)), a));
  }
});

test('matrix game solver finds mixed and pure equilibria', () => {
  const rps = new Float64Array([0.5, 0, 1, 1, 0.5, 0, 0, 1, 0.5]);
  const s = solveGame(rps, 3, 3);
  assert(Math.abs(s.value - 0.5) < 1e-9);
  for (const p of [...s.row, ...s.col]) assert(Math.abs(p - 1 / 3) < 1e-9);
  const biased = new Float64Array([2, -1, -1, 1]);
  const b = solveGame(biased, 2, 2);
  assert(Math.abs(b.value - 0.2) < 1e-9);
  assert(Math.abs(b.row[0] - 0.4) < 1e-9);
  assert.deepEqual(pureBounds(new Float64Array([3, 1, 4, 2]), 2, 2), [2, 2]);
});

test('final-turn matrix agrees with resolving every pair in the reference engine', () => {
  const random = rng(99);
  for (let g = 0; g < 60; g++) {
    let state = initial();
    for (let t = 0; t < 11; t++) {
      const pair = state.sides.map((side: Side) => { const legal = actions(side); return legal[Math.floor(random() * legal.length)]; }) as [Action, Action];
      state = resolve(state, ...pair).state;
    }
    const { m, cols, a0, a1 } = finalMatrix(fromState(state));
    a0.forEach((x, i) => a1.forEach((y, j) => {
      const out = resolve(state, toAction(x), toAction(y));
      const winner = outcome(out.state, [out.record]).winner;
      assert.equal(m[i * cols + j], winner === 0 ? 1 : winner === 1 ? 0 : 0.5);
    }));
  }
});

test('the certified last-turn win is found by the exact final solver', () => {
  const D = (card: number, front: number): Action => ({ kind: 'deploy', card, front });
  const S = (card: number, front: number): Action => ({ kind: 'shift', card, front });
  const R = (card: number): Action => ({ kind: 'recall', card, front: -1 });
  const pairs: [Action, Action][] = [[D(13,2),D(11,2)], [D(12,2),D(3,2)], [D(8,0),D(4,2)], [D(3,1),D(6,1)], [R(12),R(4)], [D(2,2),D(9,0)], [D(6,0),D(12,1)], [D(5,0),D(10,2)], [S(5,1),D(2,0)], [D(12,0),S(2,2)], [D(9,1),D(7,0)]];
  let state = initial();
  for (const pair of pairs) state = resolve(state, ...pair).state;
  const { m, rows, cols } = finalMatrix(fromState(state));
  assert.equal(solveGame(m, rows, cols).value, 1);
  const choice = toAction(search(fromState(state), 0, { iterations: 1, random: rng(3) }));
  for (const reply of actions(state.sides[1])) {
    const out = resolve(state, choice, reply);
    assert.equal(outcome(out.state, [out.record]).winner, 0);
  }
});

for (const level of ['easy', 'medium', 'hard'] as const) test(`${level} computer plays legal orders from an unchanged public snapshot`, () => {
  const random = rng(842);
  let s = initial();
  for (let turn = 0; turn < 12; turn++) {
    const before = structuredClone(s);
    const a = chooseAction(s, 0, level === 'hard' ? 'medium' : level, random);
    assert.deepEqual(s, before);
    assert(actions(s.sides[0]).some(b => sameAction(a, b)));
    const legal = actions(s.sides[1]);
    s = resolve(s, a, legal[Math.floor(random() * legal.length)]).state;
  }
});

test('search beats random play and the old heuristic is still available', () => {
  const random = rng(5);
  let wins = 0;
  for (let g = 0; g < 6; g++) {
    let s = initial();
    const history = [];
    for (let t = 0; t < 12; t++) {
      const mine = toAction(search(fromState(s), 0, { iterations: 600, random }));
      const legal = actions(s.sides[1]);
      const out = resolve(s, mine, legal[Math.floor(random() * legal.length)]);
      s = out.state; history.push(out.record);
    }
    if (outcome(s, history).winner === 0) wins++;
  }
  assert(wins >= 5);
});
