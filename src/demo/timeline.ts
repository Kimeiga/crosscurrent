import { initial, prepare, resolve, ranks, sum, type Action, type State } from '../engine.ts';

/** A scripted, legal demonstration, not a claim of optimal play. Both orders use
 * the same position, just as in a live simultaneous game. */
export const demoOrders: [Action, Action][] = [
  [{ kind: 'deploy', card: 13, front: 0 }, { kind: 'deploy', card: 12, front: 1 }],
  [{ kind: 'deploy', card: 7, front: 1 }, { kind: 'deploy', card: 9, front: 0 }],
  [{ kind: 'shift', card: 13, front: 2 }, { kind: 'deploy', card: 11, front: 2 }],
  [{ kind: 'recall', card: 13, front: -1 }, { kind: 'deploy', card: 8, front: 0 }],
  [{ kind: 'deploy', card: 13, front: 1 }, { kind: 'deploy', card: 10, front: 2 }],
  [{ kind: 'deploy', card: 9, front: 0 }, { kind: 'deploy', card: 6, front: 1 }],
  [{ kind: 'deploy', card: 8, front: 2 }, { kind: 'shift', card: 10, front: 1 }],
  [{ kind: 'deploy', card: 11, front: 1 }, { kind: 'recall', card: 10, front: -1 }],
  [{ kind: 'deploy', card: 12, front: 0 }, { kind: 'deploy', card: 13, front: 2 }],
  [{ kind: 'deploy', card: 6, front: 2 }, { kind: 'deploy', card: 10, front: 0 }],
  [{ kind: 'shift', card: 11, front: 2 }, { kind: 'deploy', card: 7, front: 0 }],
  [{ kind: 'deploy', card: 10, front: 1 }, { kind: 'deploy', card: 5, front: 1 }],
];

export const WIDTH = 480;
export const HEIGHT = 360;
export const cardIds = [0, 1].flatMap(seat => ranks.map(card => ({ seat, card, id: `${seat}:${card}` })));
export type Pose = { x: number; y: number; rotation: number };
export type Poses = Record<string, Pose>;
export type Phase = 'ready' | 'commit' | 'move' | 'settle' | 'score' | 'clear' | 'hold' | 'winner' | 'reset';
export type Frame = {
  start: number;
  duration: number;
  turn: number;
  phase: Phase;
  before: State;
  after: State;
  from: Poses;
  to: Poses;
  orders: [Action, Action] | null;
  gained: [number, number];
};

/** Every physical card keeps its identity, including while outside the clip.
 * Deployed cards fan instead of replacing one another in a cross-fade. */
export function layout(state: State): Poses {
  const result: Poses = {};
  for (const { seat, card, id } of cardIds) {
    const side = state.sides[seat];
    const front = side.board.findIndex(cards => cards.includes(card));
    if (front >= 0) {
      const pile = side.board[front];
      const slot = pile.indexOf(card);
      const spread = (slot - (pile.length - 1) / 2) * 24;
      result[id] = {
        x: 80 + front * 160 + spread,
        y: (seat === 0 ? 260 : 100) + (seat === 0 ? -1 : 1) * slot * 4,
        rotation: (slot - (pile.length - 1) / 2) * 3,
      };
    } else if (side.spent.includes(card)) {
      result[id] = { x: seat === 0 ? -90 : WIDTH + 90, y: seat === 0 ? 285 : 75, rotation: seat === 0 ? -14 : 14 };
    } else {
      result[id] = { x: WIDTH / 2 + ((card % 3) - 1) * 38, y: seat === 0 ? HEIGHT + 85 : -85, rotation: seat === 0 ? -6 : 6 };
    }
  }
  return result;
}

export function buildTimeline() {
  let state = initial();
  let elapsed = 0;
  const frames: Frame[] = [];
  const completed: State[] = [];
  const append = (
    phase: Phase, duration: number, before: State, after = before,
    turn = before.turn, orders: [Action, Action] | null = null,
    gained: [number, number] = [0, 0],
  ) => {
    frames.push({ start: elapsed, duration, phase, turn, before, after, from: layout(before), to: layout(after), orders, gained });
    elapsed += duration;
  };
  append('ready', 900, state);
  for (const orders of demoOrders) {
    const turn = state.turn + 1;
    const outcome = resolve(state, ...orders);
    const revealed: State = {
      turn,
      sides: orders.map((order, seat) => prepare(state.sides[seat], order).side) as State['sides'],
      scores: [...state.scores],
    };
    const scored: State = { ...revealed, scores: [...outcome.state.scores] };
    append('commit', 650, state, state, turn, orders);
    append('move', 850, state, revealed, turn, orders);
    append('settle', 650, revealed, revealed, turn, orders);
    if (outcome.record.checkpoint) {
      append('score', 1500, scored, scored, turn, orders, outcome.record.checkpoint.gained);
    }
    append('clear', 900, scored, outcome.state, turn, orders);
    append('hold', 400, outcome.state, outcome.state, turn, orders);
    state = outcome.state;
    completed.push(state);
  }
  append('winner', 2600, state);
  // Sweeping the table is presentation only, not a thirteenth game action.
  append('reset', 950, state, initial(), 12);
  // Discards stay beyond the clip during the sweep. Only cards still on the
  // board move back toward their owner; hidden cards reset on the next loop.
  const reset = frames[frames.length - 1];
  for (const { seat, card, id } of cardIds) {
    if (state.sides[seat].spent.includes(card)) reset.to[id] = reset.from[id];
  }
  return { frames, duration: elapsed, completed, final: state };
}

export const timeline = buildTimeline();

export function sampleDemo(elapsed: number) {
  const time = ((elapsed % timeline.duration) + timeline.duration) % timeline.duration;
  const frame = timeline.frames.find(f => time < f.start + f.duration) || timeline.frames[0];
  const progress = Math.max(0, Math.min(1, (time - frame.start) / frame.duration));
  const eased = 1 - Math.pow(1 - progress, 3);
  const poses: Poses = {};
  for (const { id, seat } of cardIds) {
    const from = frame.from[id];
    const to = frame.to[id];
    const moving = from.x !== to.x || from.y !== to.y;
    const lift = moving ? Math.sin(Math.PI * progress) : 0;
    poses[id] = {
      x: from.x + (to.x - from.x) * eased,
      y: from.y + (to.y - from.y) * eased - lift * 12,
      rotation: from.rotation + (to.rotation - from.rotation) * eased + lift * (seat === 0 ? 4 : -4),
    };
  }
  // Scores never arrive before the cards. The state is not mutated by playback.
  const visible = frame.phase === 'move' || frame.phase === 'clear' || frame.phase === 'reset'
    ? frame.before : frame.after;
  return { frame, progress, poses, visible, strengths: visible.sides.map(s => s.board.map(sum)) };
}
