/** Writes TypeScript-engine transcripts and states for the Rust harness `validate` command.
 * That command checks against `Rules::base()`, the v0.2 scoring, so the states are written under V02.
 * Board evolution is the same under every rule set. */
import { readFileSync, writeFileSync } from 'node:fs';
import { initial, actions, resolve, V02, type Action, type State, type Side } from '../../src/engine.ts';

const mask = (cards: number[]) => cards.reduce((m, c) => m | (1 << (c - 1)), 0);
const side = (s: Side) => [mask(s.hand), ...s.board.map(mask), mask(s.spent)].join(',');
const encodeState = (s: State) => `${s.turn}|${side(s.sides[0])}|${side(s.sides[1])}|${s.scores[0]},${s.scores[1]}`;
const encodeAction = (a: Action) => `${a.kind[0].toUpperCase()}${a.card.toString(16)}${a.front + 1}`;
const decode = (s: string): Action => ({ kind: ({ D: 'deploy', S: 'shift', R: 'recall' } as const)[s[0] as 'D' | 'S' | 'R'], card: parseInt(s[1], 16), front: Number(s[2]) - 1 });

let seed = 20261002;
const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
const lines: string[] = [];
const replayLine = (pairs: [Action, Action][]) => {
  let state = initial();
  const states: string[] = [];
  for (const [a, b] of pairs) { state = resolve(state, a, b, V02).state; states.push(encodeState(state)); }
  lines.push(`${pairs.map(([a, b]) => encodeAction(a) + encodeAction(b)).join('')} ${states.join(';')}`);
};
// Original Python reference transcripts first.
const golden = JSON.parse(readFileSync(new URL('../../tests/golden.json', import.meta.url), 'utf8')) as [string, string][];
for (const [orders] of golden) {
  const pairs: [Action, Action][] = [];
  for (let i = 0; i < orders.length; i += 6) pairs.push([decode(orders.slice(i, i + 3)), decode(orders.slice(i + 3, i + 6))]);
  replayLine(pairs);
}
// Then random games with a bias toward Shift and Recall to exercise exhaustion edge cases.
for (let g = 0; g < 3000; g++) {
  let state = initial();
  const pairs: [Action, Action][] = [];
  for (let t = 0; t < 12; t++) {
    const pick = (s: Side) => {
      const legal = actions(s);
      const moves = legal.filter(a => a.kind !== 'deploy');
      return moves.length && random() < 0.45 ? moves[Math.floor(random() * moves.length)] : legal[Math.floor(random() * legal.length)];
    };
    const pair: [Action, Action] = [pick(state.sides[0]), pick(state.sides[1])];
    pairs.push(pair);
    state = resolve(state, ...pair, V02).state;
  }
  replayLine(pairs);
}
writeFileSync(process.argv[2], lines.join('\n') + '\n');
console.log(`wrote ${lines.length} games`);
