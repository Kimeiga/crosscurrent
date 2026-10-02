/** Simultaneous-move Monte Carlo tree search with regret matching (outcome sampling),
 * and an exact matrix-game solution of the final turn. A port of research/sim. */
import { advance, clone, moves, preparedStrengths, resolveTurn, result, pack, FRONTS, TURNS, pointsAt, type FState, type Move } from './fast.ts';
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
  const x = strengthsAfter(st.sides[0], a0), y = strengthsAfter(st.sides[1], a1);
  const payoff = finalPayoff(st);
  const m = new Float64Array(rows * cols);
  for (let i = 0; i < rows; i++) for (let j = 0; j < cols; j++) m[i * cols + j] = payoff(x.subarray(i * FRONTS, i * FRONTS + FRONTS), y.subarray(j * FRONTS, j * FRONTS + FRONTS));
  return { m, rows, cols, a0, a1 };
}

/** Strength on each front after each order, laid out order by order. */
function strengthsAfter(side: FState['sides'][0], orders: Int32Array) {
  const out = new Int32Array(orders.length * FRONTS), tmp = new Int32Array(FRONTS);
  for (let i = 0; i < orders.length; i++) { preparedStrengths(side, orders[i], tmp); out.set(tmp, i * FRONTS); }
  return out;
}

/** 1 / 0.5 / 0 for player 0: points decide, then the tiebreak strength if the rules have one. */
const decide = (points: number, strength: number) => (points ? Number(points > 0) : strength ? Number(strength > 0) : 0.5);

/** Result of the last turn for player 0 given both sides' strengths on each front. */
function finalPayoff(st: FState) {
  const points = pointsAt(TURNS);
  const base = st.scores[0] - st.scores[1];
  const carried = RULES.tiebreak === 'total-strength' ? st.strength[0] - st.strength[1] : 0;
  const counts = RULES.tiebreak !== 'none';
  return (x: Int32Array, y: Int32Array) => {
    let d = base, t = carried;
    for (let f = 0; f < FRONTS; f++) { d += points * Math.sign(x[f] - y[f]); t += x[f] - y[f]; }
    return decide(d, counts ? t : 0);
  };
}

function finalValue(st: FState): number {
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

/** One search: regret-matching statistics in a tree, random rollouts below it, exact values at the last turn. */
function searcher(options: SearchOptions, random: () => number) {
  const gamma = options.gamma ?? 0.2;
  const bias = options.deployBias ?? 0.9;
  const buffers: [Float64Array, Float64Array] = [new Float64Array(64), new Float64Array(64)];

  /** A random order: usually a random card from hand to a random front, otherwise any legal order. */
  const randomOrder = (side: FState['sides'][0]): Move => {
    if (!side.hand || random() >= bias) return scratch[Math.floor(random() * moves(side, scratch))];
    let k = Math.floor(random() * popcount(side.hand));
    let h = side.hand;
    while (k-- > 0) h &= h - 1;
    return pack(0, 31 - Math.clz32(h & -h) + 1, Math.floor(random() * FRONTS));
  };
  const rollout = (start: FState) => {
    const st = clone(start);
    while (st.turn < TURNS) {
      const a = randomOrder(st.sides[0]);
      advance(st, a, randomOrder(st.sides[1]));
    }
    return result(st);
  };
  const leaf = (node: Node) => {
    if (node.st.turn >= TURNS) return result(node.st);
    if (Number.isNaN(node.exact)) node.exact = finalValue(node.st);
    return node.exact;
  };
  /** Regret matching mixed with exploration; samples an order and records its probability. */
  const strategy = (node: Node, p: 0 | 1, prob: number[]) => {
    const regret = node.regret[p], n = regret.length, policy = buffers[p], totals = node.total[p];
    let positive = 0;
    for (let k = 0; k < n; k++) positive += Math.max(0, regret[k]);
    for (let k = 0; k < n; k++) {
      const rm = positive > 0 ? Math.max(0, regret[k]) / positive : 1 / n;
      totals[k] += rm;
      policy[k] = (1 - gamma) * rm + gamma / n;
    }
    const chosen = sample(policy.subarray(0, n), random);
    prob[p] = policy[chosen];
    return chosen;
  };
  const expand = (node: Node, key: number, chosen: number[]) => {
    const next = resolveTurn(node.st, node.a[0][chosen[0]], node.a[1][chosen[1]]);
    const child = makeNode(next);
    node.kids.set(key, child);
    return next.turn >= TURNS - 1 ? leaf(child) : rollout(next);
  };
  /** Outcome-sampling regret update: the sampled order is credited its importance-weighted value. */
  const update = (node: Node, chosen: number[], prob: number[], u: number) => {
    for (const p of [0, 1] as const) {
      const x = p === 0 ? u : 1 - u;
      const estimate = x / prob[p];
      const regret = node.regret[p];
      for (let k = 0; k < regret.length; k++) regret[k] += (k === chosen[p] ? estimate : 0) - x;
    }
  };
  const iterate = (node: Node): number => {
    if (node.st.turn >= TURNS - 1) return leaf(node);
    const prob = [0, 0];
    const chosen = [strategy(node, 0, prob), strategy(node, 1, prob)];
    const key = chosen[0] * 64 + chosen[1];
    const child = node.kids.get(key);
    const u = child ? iterate(child) : expand(node, key, chosen);
    update(node, chosen, prob, u);
    return u;
  };
  return iterate;
}

/** The final choice samples the average strategy after dropping orders played less than `purify` of the time. */
function choose(totals: Float64Array, purify: number, random: () => number) {
  let sum = 0;
  for (let k = 0; k < totals.length; k++) sum += totals[k];
  const policy = totals.map(v => (v / sum >= purify ? v : 0));
  return sample(policy.some(v => v > 0) ? policy : totals, random);
}

export function search(state: FState, seat: 0 | 1, options: SearchOptions): Move {
  const random = options.random ?? Math.random;
  if (state.turn === TURNS - 1) {
    const { m, rows, cols, a0, a1 } = finalMatrix(state);
    const solved = solveGame(m, rows, cols);
    return seat === 0 ? a0[sample(solved.row, random)] : a1[sample(solved.col, random)];
  }
  const iterate = searcher(options, random);
  const root = makeNode(state);
  for (let i = 0; i < options.iterations; i++) iterate(root);
  return root.a[seat][choose(root.total[seat], options.purify ?? 0.1, random)];
}

function popcount(m: number) {
  let n = 0;
  for (; m; m &= m - 1) n++;
  return n;
}
