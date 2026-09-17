import test from 'node:test';
import assert from 'node:assert/strict';
import { initial, resolve, checkInvariants, type State } from '../src/engine.ts';
import { demoOrders, timeline, sampleDemo, cardIds, layout } from '../src/demo/timeline.ts';

test('homepage replays twelve legal simultaneous turns through the actual engine', () => {
  let state = initial();
  assert.equal(demoOrders.length, 12);
  for (let i = 0; i < demoOrders.length; i++) {
    state = resolve(state, ...demoOrders[i]).state;
    assert(checkInvariants(state));
    assert.deepEqual(timeline.completed[i], state);
  }
  assert.equal(state.turn, 12);
  assert.deepEqual(state.scores, [10, 8]);
  assert.deepEqual(timeline.final, state);
});

test('demo includes deployment, movement and recall by both players', () => {
  for (const seat of [0, 1]) {
    assert.deepEqual(new Set(demoOrders.map(pair => pair[seat].kind)), new Set(['deploy', 'shift', 'recall']));
  }
});

test('all three checkpoints appear exactly once and score before cleanup', () => {
  const frames = timeline.frames.filter(frame => frame.phase === 'score');
  assert.deepEqual(frames.map(frame => frame.turn), [4, 8, 12]);
  assert.deepEqual(frames.map(frame => frame.after.scores), [[1, 2], [7, 2], [10, 8]]);
  for (const frame of frames) {
    const index = timeline.frames.indexOf(frame);
    assert.equal(timeline.frames[index - 1].phase, 'settle');
    assert.equal(timeline.frames[index + 1].phase, 'clear');
  }
});

test('recalled highest cards score in place then return instead of being spent', () => {
  for (const [turn, seat, card] of [[4, 0, 13], [8, 1, 10]]) {
    const frame = timeline.frames.find(f => f.turn === turn && f.phase === 'score')!;
    assert(frame.before.sides[seat].board.flat().includes(card));
    const after = timeline.completed[turn - 1].sides[seat];
    assert(after.hand.includes(card));
    assert(!after.spent.includes(card));
  }
});

test('cards keep stable identities and move in from opposite clipped edges', () => {
  assert.equal(new Set(cardIds.map(card => card.id)).size, 26);
  const frame = timeline.frames.find(f => f.turn === 1 && f.phase === 'move')!;
  for (const [id, below] of [['0:13', true], ['1:12', false]] as const) {
    assert(below ? frame.from[id].y > 330 : frame.from[id].y < 30);
    assert(frame.to[id].y > 30 && frame.to[id].y < 330);
    const mid = sampleDemo(frame.start + frame.duration / 2).poses[id];
    assert.notDeepEqual(mid, frame.from[id]);
    assert.notDeepEqual(mid, frame.to[id]);
  }
});

test('the timeline is contiguous, repeats indefinitely and never adds a thirteenth move', () => {
  let time = 0;
  for (const frame of timeline.frames) { assert.equal(frame.start, time); time += frame.duration; }
  assert.equal(time, 50350);
  assert.equal(time, timeline.duration);
  assert.equal(timeline.frames.filter(f => f.phase === 'commit').length, 12);
  for (const cycle of [0, 1, 2, 1000]) {
    assert.equal(sampleDemo(cycle * timeline.duration).frame.phase, 'ready');
    assert.deepEqual(sampleDemo(cycle * timeline.duration + 1750).poses, sampleDemo(1750).poses);
  }
});

test('scores are not awarded before scoring, and playback cannot mutate the game', () => {
  const frozen = structuredClone(timeline);
  const moving = timeline.frames.find(f => f.turn === 4 && f.phase === 'move')!;
  assert.deepEqual(sampleDemo(moving.start + 600).visible.scores, [0, 0]);
  for (let t = 0; t < timeline.duration; t += 47) sampleDemo(t);
  assert.deepEqual(timeline, frozen);
});

test('reset sweeps deployed cards away while discards remain outside the clip', () => {
  const reset = timeline.frames.at(-1)!;
  assert.equal(reset.phase, 'reset');
  for (const { seat, card, id } of cardIds) {
    if (timeline.final.sides[seat].spent.includes(card)) assert.deepEqual(reset.to[id], reset.from[id]);
    if (timeline.final.sides[seat].board.flat().includes(card)) {
      assert(seat === 0 ? reset.to[id].y > 330 : reset.to[id].y < 30);
    }
  }
});

test('the demonstration preserves seat symmetry under a complete replay', () => {
  const swap = (state: State): State => ({ ...state, sides: [state.sides[1], state.sides[0]], scores: [state.scores[1], state.scores[0]] });
  let state = initial();
  for (let i = 0; i < 12; i++) {
    state = resolve(state, demoOrders[i][1], demoOrders[i][0]).state;
    assert.deepEqual(state, swap(timeline.completed[i]));
  }
});

test('layout allocates all twenty-six cards without changing the supplied state', () => {
  const state = timeline.completed[7];
  const before = structuredClone(state);
  assert.equal(Object.keys(layout(state)).length, 26);
  assert.deepEqual(state, before);
});
