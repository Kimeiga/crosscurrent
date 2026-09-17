import { Hono } from "npm:hono";
import { sqlite } from "https://esm.town/v/std/sqlite/main.ts";

type ActionKind = "deploy" | "shift" | "recall";
type Action = { kind: ActionKind; card: number; front: number };
type Side = { hand: number[]; board: number[][]; spent: number[] };
type State = { turn: number; sides: [Side, Side]; scores: [number, number] };
type Checkpoint = { turn: number; points: number; strengths: [number[], number[]]; gained: [number, number]; exhausted: [number[], number[]] };
type TurnRecord = { turn: number; actions: [Action, Action]; checkpoint: Checkpoint | null };
type Match = { state: State; history: TurnRecord[] };
type Player = { seat: 0 | 1; hash: string; joined: boolean; orders: Action[] };

const ranks = Array.from({ length: 13 }, (_, i) => i + 1);
const labels = ["A", "B", "C"];
const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);
const sorted = (values: number[]) => values.sort((a, b) => a - b);
const MAX_AGE = 30 * 24 * 60 * 60 * 1000;

class RoomError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

let schemaPromise: Promise<unknown> | null = null;
function ensureSchema() {
  if (!schemaPromise) {
    schemaPromise = sqlite.batch([
      {
        sql: `CREATE TABLE IF NOT EXISTS rooms (
          id TEXT PRIMARY KEY,
          created INTEGER NOT NULL
        )`,
      },
      {
        sql: `CREATE TABLE IF NOT EXISTS players (
          room_id TEXT NOT NULL,
          seat INTEGER NOT NULL,
          token_hash TEXT NOT NULL,
          joined INTEGER NOT NULL,
          orders TEXT NOT NULL,
          PRIMARY KEY (room_id, seat)
        )`,
      },
      { sql: "CREATE INDEX IF NOT EXISTS players_token_idx ON players(room_id, token_hash)" },
    ]).catch((error) => {
      schemaPromise = null;
      throw error;
    });
  }
  return schemaPromise;
}

const secret = () =>
  crypto.randomUUID().replaceAll("-", "") +
  crypto.randomUUID().replaceAll("-", "");

async function digest(text: string) {
  return Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)),
    ),
  ).map((n) => n.toString(16).padStart(2, "0")).join("");
}

function cloneSide(side: Side): Side {
  return {
    hand: [...side.hand],
    board: side.board.map((front) => [...front]),
    spent: [...side.spent],
  };
}

function initial(): State {
  const side = (): Side => ({
    hand: [...ranks],
    board: [[], [], []],
    spent: [],
  });
  return { turn: 0, sides: [side(), side()], scores: [0, 0] };
}

function actions(side: Side): Action[] {
  if (!side.hand.length) return [];
  const result: Action[] = side.hand.flatMap((card) =>
    labels.map((_, front) => ({ kind: "deploy" as const, card, front }))
  );
  side.board.forEach((cards, origin) =>
    cards.forEach((card) => {
      labels.forEach((_, front) => {
        if (front !== origin) result.push({ kind: "shift", card, front });
      });
      result.push({ kind: "recall", card, front: -1 });
    })
  );
  return result;
}

function sameAction(a: Action, b: Action) {
  return a.kind === b.kind && a.card === b.card && a.front === b.front;
}

function isAction(value: unknown): value is Action {
  if (!value || typeof value !== "object") return false;
  const action = value as Action;
  return ["deploy", "shift", "recall"].includes(action.kind) &&
    Number.isInteger(action.card) &&
    action.card >= 1 &&
    action.card <= 13 &&
    Number.isInteger(action.front) &&
    (action.kind === "recall"
      ? action.front === -1
      : action.front >= 0 && action.front < 3);
}

function prepare(source: Side, action: Action) {
  if (!isAction(action) || !actions(source).some((other) => sameAction(action, other))) {
    throw new RoomError("That order is not legal in this position.");
  }
  const side = cloneSide(source);
  let recall: number | null = null;
  if (action.kind === "deploy") {
    side.hand.splice(side.hand.indexOf(action.card), 1);
    side.board[action.front].push(action.card);
  } else {
    side.spent.push(side.hand.shift()!);
    const origin = side.board.findIndex((front) => front.includes(action.card));
    if (action.kind === "shift") {
      side.board[origin].splice(side.board[origin].indexOf(action.card), 1);
      side.board[action.front].push(action.card);
    } else {
      recall = action.card;
    }
  }
  side.board.forEach(sorted);
  sorted(side.spent);
  return { side, recall };
}

function finish(source: Side, originalRecall: number | null, checkpoint: boolean): Side {
  const side = cloneSide(source);
  let recall = originalRecall;
  if (checkpoint) {
    side.board.forEach((front) => {
      if (!front.length) return;
      const high = front.pop()!;
      if (high === recall) {
        side.hand.push(high);
        recall = null;
      } else {
        side.spent.push(high);
      }
    });
  }
  if (recall !== null) {
    const front = side.board.find((cards) => cards.includes(recall!));
    if (!front) throw new RoomError("Missing recall target.");
    front.splice(front.indexOf(recall), 1);
    side.hand.push(recall);
  }
  sorted(side.hand);
  sorted(side.spent);
  return side;
}

function resolve(state: State, a: Action, b: Action): { state: State; record: TurnRecord } {
  if (state.turn >= 12) throw new RoomError("This game is already complete.", 409);
  const next = state.turn + 1;
  const prepared = [
    prepare(state.sides[0], a),
    prepare(state.sides[1], b),
  ] as const;
  const scored = next % 4 === 0;
  const points = next / 4;
  const strengths = prepared.map((entry) => entry.side.board.map(sum)) as [
    number[],
    number[],
  ];
  const gained: [number, number] = [0, 0];
  if (scored) {
    for (let front = 0; front < 3; front++) {
      if (strengths[0][front] > strengths[1][front]) gained[0] += points;
      if (strengths[1][front] > strengths[0][front]) gained[1] += points;
    }
  }
  const sides = prepared.map((entry) =>
    finish(entry.side, entry.recall, scored)
  ) as [Side, Side];
  const exhausted = sides.map((side, index) =>
    side.spent.filter((card) => !prepared[index].side.spent.includes(card))
  ) as [number[], number[]];
  return {
    state: {
      turn: next,
      sides,
      scores: [state.scores[0] + gained[0], state.scores[1] + gained[1]],
    },
    record: {
      turn: next,
      actions: [a, b],
      checkpoint: scored
        ? { turn: next, points, strengths, gained, exhausted }
        : null,
    },
  };
}

function replay(players: [Player, Player]): Match {
  let state = initial();
  const history: TurnRecord[] = [];
  const count = Math.min(players[0].orders.length, players[1].orders.length, 12);
  for (let i = 0; i < count; i++) {
    const result = resolve(state, players[0].orders[i], players[1].orders[i]);
    state = result.state;
    history.push(result.record);
  }
  return { state, history };
}

async function load(id: string, token: unknown) {
  if (
    typeof id !== "string" ||
    id.length > 100 ||
    !/^[\w-]+$/.test(id) ||
    typeof token !== "string" ||
    !/^[a-f0-9]{64}$/.test(token)
  ) {
    throw new RoomError("This invitation is invalid. Check the complete link.", 403);
  }

  await ensureSchema();
  const roomResult = await sqlite.execute({
    sql: "SELECT id, created FROM rooms WHERE id = ?",
    args: [id],
  });
  const room = roomResult.rows[0] as { id: string; created: number } | undefined;
  if (!room || Date.now() - Number(room.created) > MAX_AGE) {
    throw new RoomError("This table is missing or has expired. Create a new table.", 404);
  }

  const playerResult = await sqlite.execute({
    sql: "SELECT seat, token_hash, joined, orders FROM players WHERE room_id = ? ORDER BY seat",
    args: [id],
  });
  if (playerResult.rows.length !== 2) {
    throw new RoomError("The table is incomplete. Create a new table.", 404);
  }

  const hash = await digest(token);
  const players = playerResult.rows.map((row: any) => ({
    seat: Number(row.seat) as 0 | 1,
    hash: String(row.token_hash),
    joined: Boolean(row.joined),
    orders: JSON.parse(String(row.orders || "[]")) as Action[],
  })) as [Player, Player];

  const seat = players.findIndex((player) => player.hash === hash);
  if (seat === -1) {
    throw new RoomError("This invitation does not grant access to this table.", 403);
  }
  return { players, seat: seat as 0 | 1 };
}

function viewOf(id: string, players: [Player, Player], seat: 0 | 1) {
  const match = replay(players);
  return {
    ...match,
    id,
    seat,
    joined: players.map((player) => player.joined) as [boolean, boolean],
    locked: players.map((player) => player.orders.length > match.state.turn) as [
      boolean,
      boolean,
    ],
    ownOrder: players[seat].orders[match.state.turn] || null,
  };
}

async function view(id: string, token: unknown) {
  const { players, seat } = await load(id, token);
  return viewOf(id, players, seat);
}

async function createRoom() {
  await ensureSchema();
  const id = crypto.randomUUID();
  const token = secret();
  const invite = secret();
  await sqlite.batch([
    {
      sql: "INSERT INTO rooms (id, created) VALUES (?, ?)",
      args: [id, Date.now()],
    },
    {
      sql: "INSERT INTO players (room_id, seat, token_hash, joined, orders) VALUES (?, 0, ?, 1, '[]')",
      args: [id, await digest(token)],
    },
    {
      sql: "INSERT INTO players (room_id, seat, token_hash, joined, orders) VALUES (?, 1, ?, 0, '[]')",
      args: [id, await digest(invite)],
    },
  ]);
  return { id, token, invite };
}

async function joinRoom(id: string, token: unknown) {
  const data = await load(id, token);
  if (!data.players[data.seat].joined) {
    await sqlite.execute({
      sql: "UPDATE players SET joined = 1 WHERE room_id = ? AND seat = ?",
      args: [id, data.seat],
    });
  }
  return view(id, token);
}

async function submitOrder(
  id: string,
  token: unknown,
  turn: unknown,
  candidate: unknown,
) {
  if (!Number.isInteger(turn) || !isAction(candidate)) {
    throw new RoomError("Choose a complete, legal order.");
  }

  const data = await load(id, token);
  if (!data.players.every((player) => player.joined)) {
    throw new RoomError("Your friend must join before you can lock an order.", 409);
  }

  const player = data.players[data.seat];
  const index = Number(turn) - 1;
  if (index >= 0 && index < player.orders.length) {
    if (sameAction(player.orders[index], candidate)) return view(id, token);
    throw new RoomError("Your order is already locked for that turn.", 409);
  }

  const match = replay(data.players);
  if (match.state.turn >= 12 || turn !== match.state.turn + 1) {
    throw new RoomError("The turn changed. Reconnect to refresh the table.", 409);
  }
  if (!actions(match.state.sides[data.seat]).some((action) => sameAction(action, candidate))) {
    throw new RoomError("That order is not legal in this position.");
  }

  const oldOrders = JSON.stringify(player.orders);
  const nextOrders = JSON.stringify([
    ...player.orders,
    { kind: candidate.kind, card: candidate.card, front: candidate.front },
  ]);
  const updated = await sqlite.execute({
    sql: "UPDATE players SET orders = ? WHERE room_id = ? AND seat = ? AND orders = ?",
    args: [nextOrders, id, data.seat, oldOrders],
  });

  if (Number(updated.rowsAffected) !== 1) {
    const latest = await load(id, token);
    const latestOrder = latest.players[data.seat].orders[index];
    if (latestOrder && sameAction(latestOrder, candidate)) return view(id, token);
    throw new RoomError("The turn changed. Reconnect to refresh the table.", 409);
  }

  return view(id, token);
}

async function body(request: Request) {
  try {
    return await request.json();
  } catch {
    throw new RoomError("Invalid JSON request.");
  }
}

const app = new Hono();

app.get("/health", async (c) => {
  await ensureSchema();
  return c.json({ ok: true, service: "crosscurrent-rooms" });
});

app.post("/rooms", async (c) => c.json(await createRoom()));
app.post("/rooms/:id/view", async (c) => {
  const input = await body(c.req.raw);
  return c.json(await view(c.req.param("id"), input.token));
});
app.post("/rooms/:id/join", async (c) => {
  const input = await body(c.req.raw);
  return c.json(await joinRoom(c.req.param("id"), input.token));
});
app.post("/rooms/:id/order", async (c) => {
  const input = await body(c.req.raw);
  return c.json(
    await submitOrder(c.req.param("id"), input.token, input.turn, input.action),
  );
});

app.notFound((c) => c.json({ error: "Unknown route." }, 404));
app.onError((error, c) => {
  if (error instanceof RoomError) {
    return c.json({ error: error.message }, error.status as any);
  }
  console.error("Crosscurrent room error", error);
  return c.json({ error: "The table service could not complete this request." }, 500);
});

export default app.fetch;
