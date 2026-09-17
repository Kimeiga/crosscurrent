import { initial, isAction, actions, sameAction, resolve, type Action, type Match } from '../src/engine.ts';

export interface Database {
  add(table: string, records: Array<Record<string, unknown>>): Promise<Array<string | null>>;
  get<T>(table: string, ids: string[]): Promise<Array<T | null>>;
  update(table: string, items: Array<{ id: string; record: Record<string, unknown> }>): Promise<boolean[]>;
  list<T>(table: string, options?: { limit?: number }): Promise<{ items: Array<T & { id: string }>; nextToken?: string }>;
  delete(table: string, ids: string[]): Promise<boolean[]>;
}
type Player = { hash: string; joined: boolean; orders: Action[] };
type Room = { seats: string[]; created: number };
type Subscriber = { connection_id: string; hash: string; created: number };
export type RoomView = Match & { id: string; seat: 0 | 1; joined: [boolean, boolean]; locked: [boolean, boolean]; ownOrder: Action | null };
export class RoomError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}
export const digest = async (text: string) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)))).map(n => n.toString(16).padStart(2, '0')).join('');
const secret = () => crypto.randomUUID().replaceAll('-', '') + crypto.randomUUID().replaceAll('-', '');
const MAX_AGE = 30 * 24 * 60 * 60 * 1000;

export class Rooms {
  constructor(private db: Database, private send: (ids: string[], value: unknown) => Promise<unknown>) {}
  private async load(id: string, token: unknown) {
    if (typeof id !== 'string' || id.length > 100 || !/^[\w-]+$/.test(id) || typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) throw new RoomError('This invitation is invalid. Check the complete link.', 403);
    const [room] = await this.db.get<Room>('rooms', [id]);
    if (!room || Date.now() - room.created > MAX_AGE) throw new RoomError('This table is missing or has expired. Create a new table.', 404);
    const players = await this.db.get<Player>('players', room.seats);
    if (players.some(p => !p)) throw new RoomError('The table is incomplete. Create a new table.', 404);
    const hash = await digest(token);
    const seat = players.findIndex(p => p!.hash === hash);
    if (seat === -1) throw new RoomError('This invitation does not grant access to this table.', 403);
    return { room, players: players as [Player, Player], seat: seat as 0 | 1, hash };
  }
  private match(players: [Player, Player]): Match {
    let state = initial();
    const history: Match['history'] = [];
    const count = Math.min(players[0].orders.length, players[1].orders.length, 12);
    for (let i = 0; i < count; i++) {
      const next = resolve(state, players[0].orders[i], players[1].orders[i]);
      state = next.state; history.push(next.record);
    }
    return { state, history };
  }
  private viewOf(id: string, players: [Player, Player], seat: 0 | 1): RoomView {
    const match = this.match(players);
    return {
      ...match, id, seat,
      joined: players.map(p => p.joined) as [boolean, boolean],
      locked: players.map(p => p.orders.length > match.state.turn) as [boolean, boolean],
      ownOrder: players[seat].orders[match.state.turn] || null,
    };
  }
  async create() {
    const token = secret(); const invite = secret();
    const seats = await this.db.add('players', [
      { hash: await digest(token), joined: true, orders: [] },
      { hash: await digest(invite), joined: false, orders: [] },
    ]);
    if (seats.some(id => !id)) throw new RoomError('Could not create seats. Please try again.', 503);
    const [id] = await this.db.add('rooms', [{ seats, created: Date.now() }]);
    if (!id) throw new RoomError('Could not create a table. Please try again.', 503);
    return { id, token, invite };
  }
  async view(id: string, token: unknown) {
    const { players, seat } = await this.load(id, token);
    return this.viewOf(id, players, seat);
  }
  async join(id: string, token: unknown) {
    const data = await this.load(id, token);
    const player = data.players[data.seat];
    if (!player.joined) {
      const [ok] = await this.db.update('players', [{ id: data.room.seats[data.seat], record: { ...player, joined: true } }]);
      if (!ok) throw new RoomError('Could not join the table. Please try again.', 503);
      await this.notify(id);
    }
    return this.view(id, token);
  }
  async order(id: string, token: unknown, turn: unknown, candidate: unknown) {
    if (!Number.isInteger(turn) || !isAction(candidate)) throw new RoomError('Choose a complete, legal order.');
    const { room, players, seat } = await this.load(id, token);
    if (!players.every(p => p.joined)) throw new RoomError('Your friend must join before you can lock an order.', 409);
    const player = players[seat];
    const index = (turn as number) - 1;
    if (index >= 0 && index < player.orders.length) {
      if (sameAction(player.orders[index], candidate)) return this.view(id, token); // Safe retry after a lost response.
      throw new RoomError('Your order is already locked for that turn.', 409);
    }
    const match = this.match(players);
    if (match.state.turn >= 12 || turn !== match.state.turn + 1) throw new RoomError('The turn changed. Reconnect to refresh the table.', 409);
    if (!actions(match.state.sides[seat]).some(a => sameAction(a, candidate))) throw new RoomError('That order is not legal in this position.');
    // Each seat writes only its own transcript, avoiding cross-player lost updates.
    // The deployment database has no conditional-write primitive. This is a casual
    // friend-room transport, not a ranked/adversarial concurrency guarantee.
    const order: Action = { kind: candidate.kind, card: candidate.card, front: candidate.front };
    const [ok] = await this.db.update('players', [{ id: room.seats[seat], record: { ...player, orders: [...player.orders, order] } }]);
    if (!ok) throw new RoomError('Your order could not be saved. Retry the same order.', 503);
    await this.notify(id);
    return this.view(id, token);
  }
  private async notify(id: string) {
    const { items } = await this.db.list<Subscriber>(`subs_${id}`, { limit: 32 });
    const fresh = items.filter(s => Date.now() - s.created < 24 * 60 * 60 * 1000);
    const old = items.filter(s => !fresh.includes(s)).map(s => s.id);
    if (old.length) await this.db.delete(`subs_${id}`, old);
    const ids = [...new Set(fresh.map(s => s.connection_id))];
    if (ids.length) await this.send(ids, { v: 1, type: 'entity.update', payload: { entity_type: 'room', entity_id: id, data: { refresh: true } } });
  }
  async subscribe(id: string, token: unknown, connection: unknown) {
    const { hash } = await this.load(id, token);
    if (typeof connection !== 'string' || connection.length < 1 || connection.length > 200) throw new RoomError('No live connection. Use Reconnect.');
    const table = `subs_${id}`;
    const { items } = await this.db.list<Subscriber>(table, { limit: 32 });
    const old = items.filter(s => s.hash === hash && s.connection_id === connection || Date.now() - s.created > 24 * 60 * 60 * 1000).map(s => s.id);
    if (old.length) await this.db.delete(table, old);
    if (items.length - old.length >= 24) throw new RoomError('Too many open tabs for this table. Close another tab.', 409);
    const [subscription] = await this.db.add(table, [{ hash, connection_id: connection, created: Date.now() }]);
    if (!subscription) throw new RoomError('Could not connect to live updates.', 503);
    return { subscription };
  }
  async unsubscribe(id: string, token: unknown, subscription: unknown) {
    const { hash } = await this.load(id, token);
    if (typeof subscription !== 'string') throw new RoomError('Invalid subscription.');
    const [record] = await this.db.get<Subscriber>(`subs_${id}`, [subscription]);
    if (record && record.hash === hash) await this.db.delete(`subs_${id}`, [subscription]);
    return { ok: true };
  }
}
