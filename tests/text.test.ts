import test from 'node:test';
import assert from 'node:assert/strict';
import { RULES, type Outcome, type Rules } from '../src/engine.ts';
import { firstGameTip, statusText, verdictText, pageTitle, type Waiting } from '../src/text.ts';

test('first-game tips follow the turns', () => {
  assert.match(firstGameTip(0), /in secret/);
  assert.match(firstGameTip(1), /Turn 4 scores 2 points/);
  assert.equal(firstGameTip(2), firstGameTip(1));
  assert.match(firstGameTip(3), /This turn scores/);
  assert.match(firstGameTip(4), /turn 12 scores 4/);
  assert.match(firstGameTip(11), /Most points after turn 12 wins/);
});

test('the status line says why the player is waiting', () => {
  const base: Waiting = { online: false, solo: true, friendHere: true, lockedIn: false, connection: 'Live', busy: false };
  const say = (w: Partial<Waiting>) => statusText({ ...base, ...w });
  assert.equal(say({}), '');
  assert.equal(say({ busy: true }), 'The computer is choosing…');
  assert.equal(say({ solo: false, busy: true }), 'Locking in…');
  const online = { online: true, solo: false };
  assert.equal(say({ ...online, friendHere: false }), 'Waiting for your friend to open the link.');
  assert.equal(say({ ...online, lockedIn: true }), 'Locked in. Waiting for your friend…');
  assert.equal(say({ ...online, connection: 'Connecting' }), 'Connecting…');
  assert.equal(say({ ...online, connection: 'Disconnected' }), 'Connection lost. Reconnecting…');
  assert.equal(say({ ...online }), '');
  assert.equal(say({ ...online, busy: true }), 'Locking in…');
});

test('the result line names the winner, the score from the winner side and any tiebreak', () => {
  const byScore: Outcome = { winner: 0, by: 'score', strength: [0, 0] };
  assert.equal(verdictText(byScore, [15, 12], ['You', 'Computer']), 'You win, 15–12.');
  assert.equal(verdictText({ ...byScore, winner: 1 }, [12, 15], ['You', 'Computer']), 'Computer wins, 15–12.');
  assert.equal(verdictText({ ...byScore, winner: 1 }, [12, 15], ['Friend', 'You']), 'You win, 15–12.');
  assert.equal(verdictText(byScore, [15, 12], ['Player 1', 'Player 2']), 'Player 1 wins, 15–12.');
  assert.equal(verdictText({ winner: null, by: 'draw', strength: [20, 20] }, [9, 9], ['You', 'Computer']), 'Draw, 9–9.');
  const tied: Outcome = { winner: 1, by: 'strength', strength: [40, 47] };
  const total: Rules = { ...RULES, tiebreak: 'total-strength' };
  const final: Rules = { ...RULES, tiebreak: 'final-strength' };
  assert.equal(verdictText(tied, [9, 9], ['You', 'Computer'], total), 'Computer wins, 9–9 on the tiebreak (47–40 total strength over the three scorings).');
  assert.equal(verdictText(tied, [9, 9], ['You', 'Computer'], final), 'Computer wins, 9–9 on the tiebreak (47–40 total strength at the last scoring).');
});

test('the tab title follows the screen and turn', () => {
  assert.equal(pageTitle('home', 0), 'Crosscurrent · a card game for two');
  assert.equal(pageTitle('learn', 0), 'Learn to play · Crosscurrent');
  assert.equal(pageTitle('join', 0), 'Crosscurrent · a card game for two');
  assert.equal(pageTitle('game', 0), 'Turn 1 · Crosscurrent');
  assert.equal(pageTitle('game', 11), 'Turn 12 · Crosscurrent');
  assert.equal(pageTitle('game', 12), 'Game over · Crosscurrent');
});
