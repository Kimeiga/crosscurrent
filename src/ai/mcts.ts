/** Simultaneous-move Monte Carlo tree search with regret matching (outcome sampling),
 * and an exact matrix-game solution of the final turn. A port of research/sim. */
import { advance, clone, moves, preparedStrengths, resolve, result, pack, FRONTS, TURNS, pointsAt, type FState, type Move } from './fast.ts';
import { pureBounds, solveGame } from './lp.ts';
import { RULES } from '../engine.ts';

export type SearchOptions = {
  iterations: number;
  /** Exploration mixed into regret matching. */
  gamma?: number;
  /** Final choice ignores average-strategy actions below this probability. */
  purify?: number;
  /** Rollouts deploy a random card with this probability, otherwise any legal order. */
  deployBias?: number;
  random?: () => number;
};

type Node = {
  st: FState;
  a: [Int32Array, Int32Array];
  regret: [Float64Array, Float64Array];
  total: [Float64Array, Float64Array];
  kids: Map<number, Node>;
  exact: number;
};

const scratch = new Int32Array(64);
function legal(st: FState, seat: 0 | 1) {
  const n = moves(st.sides[seat], scratch);
  return scratch.slice(0, n);
}
function makeNode(st: FState): Node {
  const a0 = st.turn < TURNS ? legal(st, 0) : new Int32Array(0);
  const a1 = st.turn < TURNS ? legal(st, 1) : new Int32Array(0);
  return {
    st, a: [a0, a1],
    regret: [new Float64Array(a0.length), new Float64Array(a1.length)],
    total: [new Float64Array(a0.length), new Float64Array(a1.length)],
    kids: new Map(), exact: NaN,
  };
}

/** Exact payoff matrix of the final turn for player 0, with the legal orders of each side. */
export function finalMatrix(st: FState) {
  const a0 = legal(st, 0), a1 = legal(st, 1);
  const rows = a0.length, cols = a1.length;
  const x = new Int32Array(rows * FRONTS), y = new Int32Array(cols * FRONTS), tmp = new Int32Array(FRONTS);
  for (let i = 0; i < rows; i++) { preparedStrengths(st.sides[0], a0[i], tmp); x.set(tmp, i * FRONTS); }
  for (let j = 0; j < cols; j++) { preparedStrengths(st.sides[1], a1[j], tmp); y.set(tmp, j * FRONTS); }
  const points = pointsAt(TURNS);
  const base = st.scores[0] - st.scores[1];
  const carried = RULES.tiebreak === 'total-strength' ? st.strength[0] - st.strength[1] : 0;
  const m = new Float64Array(rows * cols);
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) {
      let d = base, t = carried;
      for (let f = 0; f < FRONTS; f++) {
        const diff = x[i * FRONTS + f] - y[j * FRONTS + f];
        d += points * Math.sign(diff);
        t += diff;
      }
      m[i * cols + j] = d > 0 ? 1 : d < 0 ? 0 : RULES.tiebreak !== 'none' && t !== 0 ? (t > 0 ? 1 : 0) : 0.5;
    }
  }
  return { m, rows, cols, a0, a1 };
}

export function finalValue(st: FState): number {
  const { m, rows, cols } = finalMatrix(st);
  const [low, high] = pureBounds(m, rows, cols);
  return low === high ? low : solveGame(m, rows, cols).value;
}

function sample(p: Float64Array, random: () => number): number {
  let total = 0;
  for (let i = 0; i < p.length; i++) total += p[i];
  let ticket = random() * total;
  for (let i = 0; i < p.length; i++) { ticket -= p[i]; if (ticket < 0) return i; }
  return p.length - 1;
}

export function search(state: FState, seat: 0 | 1, options: SearchOptions): Move {
  const random = options.random ?? Math.random;
  if (state.turn === TURNS - 1) {
    const { m, rows, cols, a0, a1 } = finalMatrix(state);
    const solved = solveGame(m, rows, cols);
    return seat === 0 ? a0[sample(solved.row, random)] : a1[sample(solved.col, random)];
  }
  const gamma = options.gamma ?? 0.2;
  const purify = options.purify ?? 0.1;
  const bias = options.deployBias ?? 0.9;
  const buffers: [Float64Array, Float64Array] = [new Float64Array(64), new Float64Array(64)];

  const rollout = (start: FState) => {
    const st = clone(start);
    const pick: [Move, Move] = [0, 0];
    while (st.turn < TURNS) {
      for (const p of [0, 1] as const) {
        const side = st.sides[p];
        if (side.hand && random() < bias) {
          let k = Math.floor(random() * popcount(side.hand));
          let h = side.hand;
          while (k-- > 0) h &= h - 1;
          pick[p] = pack(0, 31 - Math.clz32(h & -h) + 1, Math.floor(random() * FRONTS));
        } else {
          const n = moves(side, scratch);
          pick[p] = scratch[Math.floor(random() * n)];
        }
      }
      advance(st, pick[0], pick[1]);
    }
    return result(st);
  };

  const iterate = (node: Node): number => {
    const st = node.st;
    if (st.turn >= TURNS) return result(st);
    if (st.turn === TURNS - 1) {
      if (Number.isNaN(node.exact)) node.exact = finalValue(st);
      return node.exact;
    }
    const chosen = [0, 0];
    const prob = [0, 0];
    for (const p of [0, 1] as const) {
      const regret = node.regret[p], n = regret.length, policy = buffers[p];
      let positive = 0;
      for (let k = 0; k < n; k++) if (regret[k] > 0) positive += regret[k];
      const totals = node.total[p];
      for (let k = 0; k < n; k++) {
        const rm = positive > 0 ? Math.max(0, regret[k]) / positive : 1 / n;
        totals[k] += rm;
        policy[k] = (1 - gamma) * rm + gamma / n;
      }
      chosen[p] = sample(policy.subarray(0, n), random);
      prob[p] = policy[chosen[p]];
    }
    const key = chosen[0] * 64 + chosen[1];
    let child = node.kids.get(key);
    let u: number;
    if (child) u = iterate(child);
    else {
      const next = resolve(st, node.a[0][chosen[0]], node.a[1][chosen[1]]);
      child = makeNode(next);
      node.kids.set(key, child);
      if (next.turn >= TURNS) u = result(next);
      else if (next.turn === TURNS - 1) u = child.exact = finalValue(next);
      else u = rollout(next);
    }
    for (const p of [0, 1] as const) {
      const x = p === 0 ? u : 1 - u;
      const estimate = x / prob[p];
      const regret = node.regret[p];
      for (let k = 0; k < regret.length; k++) regret[k] += (k === chosen[p] ? estimate : 0) - x;
    }
    return u;
  };

  const root = makeNode(state);
  for (let i = 0; i < options.iterations; i++) iterate(root);
  const totals = root.total[seat];
  let sum = 0;
  for (let k = 0; k < totals.length; k++) sum += totals[k];
  const policy = new Float64Array(totals.length);
  for (let k = 0; k < totals.length; k++) policy[k] = totals[k] / sum >= purify ? totals[k] : 0;
  return root.a[seat][sample(policy.some(v => v > 0) ? policy : totals, random)];
}

function popcount(m: number) {
  let n = 0;
  for (; m; m &= m - 1) n++;
  return n;
}
