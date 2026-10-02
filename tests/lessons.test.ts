import test from 'node:test';
import assert from 'node:assert/strict';
import { actions, checkInvariants, outcome, resolve, sameAction, RULES, initial } from '../src/engine.ts';
import { lessons, puzzleAnswer, bestReply } from '../src/lessons.ts';

test('every lesson starts from a consistent position and its taught order is legal', () => {
  for (const lesson of lessons) {
    const { game } = lesson.start();
    assert(checkInvariants(game), lesson.title);
    const legal = actions(game.sides[0]);
    if (lesson.allowed) assert(legal.some(a => lesson.allowed!(a)), lesson.title);
    if (lesson.reply) {
      const taught = legal.find(a => lesson.allowed!(a))!;
      const reply = lesson.reply(game, taught);
      assert(actions(game.sides[1]).some(b => sameAction(b, reply)), lesson.title);
    }
  }
});

test('the final-turn puzzle has exactly one order that wins against every reply', () => {
  const lesson = lessons.at(-1)!;
  const { game, history } = lesson.start();
  assert.equal(game.turn, 11);
  const winners = actions(game.sides[0]).filter(a => actions(game.sides[1]).every(b => {
    const out = resolve(game, a, b);
    return outcome(out.state, [...history, out.record]).winner === 0;
  }));
  assert.equal(winners.length, 1, `${RULES.name} should leave one winning order`);
  assert(sameAction(winners[0], puzzleAnswer));
  const wrong = actions(game.sides[0]).find(a => !sameAction(a, puzzleAnswer))!;
  const out = resolve(game, wrong, bestReply(game, wrong));
  assert.notEqual(outcome(out.state, [out.record]).winner, 0);
});

test('scoring lessons describe the points the engine awards', () => {
  const scoring = lessons[1];
  const { game } = scoring.start();
  const taught = actions(game.sides[0]).find(a => scoring.allowed!(a))!;
  const out = resolve(game, taught, scoring.reply!(game, taught));
  assert.deepEqual(out.state.scores, [4, 2]);
  assert.match(scoring.after, /4 points to 2/);
  const recall = lessons[3];
  const start = recall.start().game;
  const order = actions(start.sides[0]).find(a => recall.allowed!(a))!;
  const after = resolve(start, order, recall.reply!(start, order)).state;
  assert.deepEqual(after.scores, [start.scores[0] + 6, start.scores[1] + 3]);
  assert(after.sides[0].hand.includes(13));
  assert(after.sides[0].board[2].includes(5));
  assert(initial().sides[0].hand.length === 13);
});
